import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { TEAM, type Persona } from "@/config/team";
import { istDayStart, parseIstDate } from "./format";
import { CALL_CATEGORIES, type CallCategory } from "./labels";

const { calls, bookings, callAudit, syncJobs, designers } = schema;

export type CallRow = typeof calls.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;
export type AuditRow = typeof callAudit.$inferSelect;
export type SyncJobRow = typeof syncJobs.$inferSelect;

/** Whose calls a view shows: everything, or one designer's. */
export type Scope = { designer: string | null };

export function scopeFor(persona: Persona, showAll: boolean): Scope {
  if (persona.role === "owner" || showAll || !persona.designerKey) return { designer: null };
  return { designer: persona.designerKey };
}

const when = sql`coalesce(${calls.startedAt}, ${calls.createdAt})`;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- designers

export type DesignerOption = { key: string; name: string };

/** Active designers from the table; falls back to the team config when the table is empty. */
export async function listDesigners(): Promise<DesignerOption[]> {
  const rows = await db()
    .select({ key: designers.key, name: designers.name })
    .from(designers)
    .where(eq(designers.active, true))
    .orderBy(asc(designers.name));
  if (rows.length) return rows;
  return TEAM.filter((p) => p.designerKey).map((p) => ({ key: p.designerKey!, name: p.name }));
}

export function designerName(list: DesignerOption[], key: string | null | undefined): string | null {
  if (!key) return null;
  return list.find((d) => d.key === key)?.name ?? key;
}

// ---------------------------------------------------------------- calls list

export type CallFilters = {
  q?: string;
  outcome?: string;
  temperature?: string;
  designer?: string;
  booked?: "yes" | "no";
  followup?: boolean;
  flag?: string;
  category?: CallCategory;
  /** outcome_stage, e.g. "none" for leads that have not had their consultation yet */
  stage?: string;
  from?: string;
  to?: string;
  page: number;
};

export const PAGE_SIZE = 20;

const COMPLIANCE_CODES = ["price_leak", "missing_disclosure", "asked_budget", "false_booking_claim"];

const hasLiveBooking = sql`exists (select 1 from ${bookings} b where b.vaani_call_id = ${calls.vaaniCallId} and b.status <> 'cancelled')`;

function filterWhere(f: CallFilters, scope: Scope): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (scope.designer) parts.push(eq(calls.assignedDesigner, scope.designer));
  if (f.q) {
    const term = `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const digits = f.q.replace(/\D/g, "");
    parts.push(
      or(
        ilike(calls.callerName, term),
        ilike(calls.callerNumber, term),
        digits.length >= 3 ? sql`regexp_replace(coalesce(${calls.callerNumber}, ''), '\\D', '', 'g') like ${`%${digits}%`}` : undefined,
      ),
    );
  }
  if (f.outcome) parts.push(sql`${calls.qualification} = ${f.outcome}`);
  if (f.temperature) parts.push(sql`${calls.temperature} = ${f.temperature}`);
  if (f.designer === "none") parts.push(isNull(calls.assignedDesigner));
  else if (f.designer) parts.push(eq(calls.assignedDesigner, f.designer));
  if (f.booked === "yes") parts.push(hasLiveBooking);
  if (f.booked === "no") parts.push(sql`not ${hasLiveBooking}`);
  if (f.followup) parts.push(and(eq(calls.needsFollowup, true), isNull(calls.followupDoneAt)));
  if (f.category) {
    const types = CALL_CATEGORIES[f.category].types;
    parts.push(
      f.category === "other"
        ? or(isNull(calls.callType), sql`${calls.callType}::text in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`)
        : sql`${calls.callType}::text in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`,
    );
  }
  if (f.stage) parts.push(sql`${calls.outcomeStage} = ${f.stage}`);
  if (f.flag) {
    if (COMPLIANCE_CODES.includes(f.flag)) {
      parts.push(sql`${calls.complianceFlags} @> ${JSON.stringify([{ code: f.flag }])}::jsonb`);
    } else {
      parts.push(sql`${calls.flags} @> ${JSON.stringify([f.flag])}::jsonb`);
    }
  }
  const from = parseIstDate(f.from);
  const to = parseIstDate(f.to);
  if (from) parts.push(sql`${when} >= ${from.toISOString()}`);
  if (to) parts.push(sql`${when} < ${istDayStart(to, 1).toISOString()}`);
  const defined = parts.filter((p): p is SQL => !!p);
  return defined.length ? and(...defined) : undefined;
}

export async function listCalls(f: CallFilters, scope: Scope) {
  const where = filterWhere(f, scope);
  const [rows, [{ total }]] = await Promise.all([
    db()
      .select()
      .from(calls)
      .where(where)
      .orderBy(desc(when), desc(calls.createdAt))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db().select({ total: count() }).from(calls).where(where),
  ]);
  const meetings = await bookingsByCall(rows.map((r) => r.vaaniCallId));
  return { rows, total: Number(total), meetings };
}

/** The current (non-cancelled, latest) booking per vaani call id. */
export async function bookingsByCall(vaaniIds: string[]): Promise<Map<string, BookingRow>> {
  const map = new Map<string, BookingRow>();
  if (!vaaniIds.length) return map;
  const rows = await db()
    .select()
    .from(bookings)
    .where(and(inArray(bookings.vaaniCallId, vaaniIds), ne(bookings.status, "cancelled")))
    .orderBy(desc(bookings.createdAt));
  for (const b of rows) if (!map.has(b.vaaniCallId)) map.set(b.vaaniCallId, b);
  return map;
}

/** Distinct flag codes in use, for the flag filter. */
export async function flagOptions(): Promise<string[]> {
  const rows = await db().execute<{ f: string }>(
    sql`select distinct jsonb_array_elements_text(${calls.flags}) as f from ${calls}`,
  );
  const comp = await db().execute<{ f: string }>(
    sql`select distinct elem->>'code' as f from ${calls}, jsonb_array_elements(${calls.complianceFlags}) elem`,
  );
  return [...new Set([...rows.rows.map((r) => r.f), ...comp.rows.map((r) => r.f)].filter(Boolean))].sort();
}

// ---------------------------------------------------------------- today

export async function getToday(scope: Scope, now: Date) {
  const today = istDayStart(now);
  const dayAfter = istDayStart(now, 2);
  const yesterday = istDayStart(now, -1);
  const week = new Date(now.getTime() - 7 * 86400_000);
  const scoped = scope.designer ? eq(calls.assignedDesigner, scope.designer) : undefined;
  const openFollowup = and(eq(calls.needsFollowup, true), isNull(calls.followupDoneAt));

  const [escalations, clientRequests, priceLeaks, consultRows, followups, newest, [stats]] = await Promise.all([
    // Escalations and price leaks are studio-wide safety alerts: shown to everyone.
    db()
      .select()
      .from(calls)
      .where(and(eq(calls.callType, "existing_client_issue"), openFollowup))
      .orderBy(desc(when)),
    // Client update requests (existing clients asking how their project is going): studio-wide too.
    db()
      .select()
      .from(calls)
      .where(and(eq(calls.callType, "followup_update"), openFollowup))
      .orderBy(desc(when)),
    db()
      .select()
      .from(calls)
      .where(
        and(
          sql`${calls.complianceFlags} @> ${JSON.stringify([{ code: "price_leak" }])}::jsonb`,
          sql`${when} >= ${week.toISOString()}`,
        ),
      )
      .orderBy(desc(when)),
    db()
      .select({ booking: bookings, callId: calls.id, isTest: calls.isTest })
      .from(bookings)
      .leftJoin(calls, eq(calls.vaaniCallId, bookings.vaaniCallId))
      .where(
        and(
          eq(bookings.status, "confirmed"),
          gte(bookings.startAt, today),
          lt(bookings.startAt, dayAfter),
          scope.designer ? eq(bookings.designer, scope.designer) : undefined,
        ),
      )
      .orderBy(asc(bookings.startAt)),
    db()
      .select()
      .from(calls)
      .where(and(openFollowup, scoped))
      .orderBy(asc(when))
      .limit(30),
    db().select().from(calls).where(scoped).orderBy(desc(when)).limit(8),
    db()
      .select({
        newEnquiries: sql<number>`count(*) filter (where ${calls.callType} = 'new_enquiry' and ${when} >= ${yesterday.toISOString()})`,
        hotOpen: sql<number>`count(*) filter (where ${calls.temperature} = 'hot' and ${calls.qualification} = 'qualified' and ${calls.outcomeStage} = 'none')`,
        callbacksOwed: sql<number>`count(*) filter (where ${calls.needsFollowup} and ${calls.followupDoneAt} is null)`,
        qualifiedWeek: sql<number>`count(*) filter (where ${calls.qualification} = 'qualified' and ${when} >= ${week.toISOString()})`,
      })
      .from(calls)
      .where(scoped),
  ]);

  // "Confirmed with customer?" is the latest customer_confirmed audit entry for that booking.
  const callIds = consultRows.map((r) => r.callId).filter((x): x is string => !!x);
  const confirmed = new Map<string, boolean>();
  if (callIds.length) {
    const audits = await db()
      .select()
      .from(callAudit)
      .where(and(inArray(callAudit.callId, callIds), eq(callAudit.field, "customer_confirmed")))
      .orderBy(desc(callAudit.at));
    for (const a of audits) {
      const v = a.newValue as { bookingId?: string; confirmed?: boolean } | null;
      if (v?.bookingId && !confirmed.has(v.bookingId)) confirmed.set(v.bookingId, !!v.confirmed);
    }
  }
  const consultations = consultRows.map((r) => ({
    ...r.booking,
    callId: r.callId,
    isTest: r.isTest ?? false,
    confirmedWithCustomer: confirmed.get(r.booking.id) ?? false,
  }));

  return {
    escalations,
    clientRequests,
    priceLeaks,
    consultations,
    followups,
    newest,
    stats: {
      newEnquiries: Number(stats?.newEnquiries ?? 0),
      hotOpen: Number(stats?.hotOpen ?? 0),
      qualifiedWeek: Number(stats?.qualifiedWeek ?? 0),
      consultationsToday: consultations.filter((c) => c.startAt < istDayStart(now, 1)).length,
      followupsOpen: Number(stats?.callbacksOwed ?? followups.length),
    },
  };
}

// ---------------------------------------------------------------- call detail

export const getCallDetail = cache(async (id: string) => {
  if (!UUID_RE.test(id)) return null;
  const [call] = await db().select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!call) return null;

  const linkedIds = (call.linkedCallIds ?? []).filter(Boolean);
  const linkedUuids = linkedIds.filter((x) => UUID_RE.test(x));
  const linkConds: SQL[] = [];
  if (linkedUuids.length) linkConds.push(inArray(calls.id, linkedUuids));
  if (linkedIds.length) linkConds.push(inArray(calls.vaaniCallId, linkedIds));
  if (call.callerNumber) linkConds.push(eq(calls.callerNumber, call.callerNumber));

  const [linked, callBookings, audit, jobs] = await Promise.all([
    linkConds.length
      ? db()
          .select({
            id: calls.id,
            startedAt: calls.startedAt,
            createdAt: calls.createdAt,
            callType: calls.callType,
            qualification: calls.qualification,
          })
          .from(calls)
          .where(and(ne(calls.id, call.id), or(...linkConds)))
          .orderBy(desc(when))
          .limit(10)
      : Promise.resolve([]),
    db().select().from(bookings).where(eq(bookings.vaaniCallId, call.vaaniCallId)).orderBy(desc(bookings.createdAt)),
    db().select().from(callAudit).where(eq(callAudit.callId, call.id)).orderBy(desc(callAudit.at)),
    db().select().from(syncJobs).where(eq(syncJobs.callId, call.id)).orderBy(desc(syncJobs.createdAt)),
  ]);

  return { call, linked, bookings: callBookings, audit, jobs };
});
