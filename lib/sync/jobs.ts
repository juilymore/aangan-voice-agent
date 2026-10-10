import "server-only";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { deps as realDeps, type Deps } from "@/lib/providers";
import type { DealInput, DealStage } from "@/lib/crm/types";
import { designerEmail, escalationEmail, priceLeakEmail } from "@/lib/email/templates";
import type { CallChange } from "./hooks";

// Every external side effect (email, HubSpot, calendar edits) goes through sync_jobs — build_spec §8.11:
// unique idempotency key, exponential backoff, 6 attempts then "dead", errors never swallowed.

export type JobKind = "designer_email" | "escalation_email" | "price_leak_alert" | "hubspot_sync" | "calendar_update";
const MAX_ATTEMPTS = 6;

export async function enqueue(kind: JobKind, callId: string, idempotencyKey: string, payload: Record<string, unknown> = {}) {
  await db()
    .insert(schema.syncJobs)
    .values({ kind, callId, idempotencyKey, payload })
    .onConflictDoNothing({ target: schema.syncJobs.idempotencyKey });
}

/** Runs due jobs (pending, or failed and past their retry time). */
export async function runDueJobs(d: Deps = realDeps(), opts: { callId?: string; limit?: number } = {}) {
  const now = new Date();
  const due = await db()
    .select()
    .from(schema.syncJobs)
    .where(
      and(
        or(eq(schema.syncJobs.status, "pending"), eq(schema.syncJobs.status, "failed")),
        lte(schema.syncJobs.nextRetryAt, now),
        opts.callId ? eq(schema.syncJobs.callId, opts.callId) : undefined,
      ),
    )
    .orderBy(asc(schema.syncJobs.createdAt))
    .limit(opts.limit ?? 25);

  let ok = 0;
  let failed = 0;
  for (const job of due) {
    // Claim the job (avoids two runners doing the same work).
    const claimed = await db()
      .update(schema.syncJobs)
      .set({ attempts: sql`${schema.syncJobs.attempts} + 1`, updatedAt: now, nextRetryAt: new Date(now.getTime() + 5 * 60_000) })
      .where(and(eq(schema.syncJobs.id, job.id), eq(schema.syncJobs.attempts, job.attempts)))
      .returning({ attempts: schema.syncJobs.attempts });
    if (!claimed.length) continue;
    const attempts = claimed[0].attempts;
    try {
      await runJob(job.kind as JobKind, job.callId!, (job.payload ?? {}) as Record<string, unknown>, d, job.idempotencyKey);
      await db().update(schema.syncJobs).set({ status: "ok", lastError: null, updatedAt: new Date() }).where(eq(schema.syncJobs.id, job.id));
      ok++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      const dead = attempts >= MAX_ATTEMPTS;
      await db()
        .update(schema.syncJobs)
        .set({
          status: dead ? "dead" : "failed",
          lastError: msg.slice(0, 500),
          nextRetryAt: new Date(Date.now() + 2 ** attempts * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(schema.syncJobs.id, job.id));
      console.error(`sync job ${job.kind} ${job.id} failed (attempt ${attempts}): ${msg.slice(0, 200)}`);
      if (job.kind === "designer_email") await setCall(job.callId!, { emailStatus: dead ? "failed" : "retrying" });
      if (job.kind === "hubspot_sync") await setCall(job.callId!, { hubspotStatus: dead ? "failed" : "retrying" });
    }
  }
  return { ran: due.length, ok, failed };
}

export async function retryJob(jobId: string): Promise<void> {
  await db()
    .update(schema.syncJobs)
    .set({ status: "pending", attempts: 0, nextRetryAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.syncJobs.id, jobId));
  const [job] = await db().select({ callId: schema.syncJobs.callId }).from(schema.syncJobs).where(eq(schema.syncJobs.id, jobId));
  if (job?.callId) await runDueJobs(realDeps(), { callId: job.callId });
}

/** Dashboard edits → what must be synced (build_spec §10 overrides). */
export async function enqueueForChange(callId: string, change: CallChange, actor: string): Promise<void> {
  const stamp = Date.now();
  switch (change.kind) {
    case "qualification":
      await enqueue("hubspot_sync", callId, `hubspot:${callId}:${stamp}`, { reason: change.reason, actor });
      if (change.to === "qualified") await enqueue("designer_email", callId, `designer_email:${callId}`);
      break;
    case "temperature":
    case "designer":
    case "outcome":
      await enqueue("hubspot_sync", callId, `hubspot:${callId}:${stamp}`, { actor });
      break;
    case "booking":
      if (change.action !== "confirmed_with_customer") {
        await enqueue("calendar_update", callId, `calendar:${change.bookingId}:${change.action}:${stamp}`, {
          bookingId: change.bookingId,
          action: change.action,
        });
        await enqueue("hubspot_sync", callId, `hubspot:${callId}:${stamp}`, { actor });
      }
      break;
    default:
      return;
  }
  await runDueJobs(realDeps(), { callId });
}

// ---------------------------------------------------------------------------------------------

async function setCall(callId: string, patch: Partial<typeof schema.calls.$inferInsert>) {
  await db().update(schema.calls).set({ ...patch, updatedAt: new Date() }).where(eq(schema.calls.id, callId));
}

const dashboardUrl = (callId: string) => `${env().APP_URL.replace(/\/$/, "")}/calls/${callId}`;

async function loadCall(callId: string) {
  const [call] = await db().select().from(schema.calls).where(eq(schema.calls.id, callId));
  if (!call) throw new Error(`call ${callId} not found`);
  const [booking] = await db()
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.vaaniCallId, call.vaaniCallId), eq(schema.bookings.status, "confirmed")))
    .limit(1);
  return { call, booking };
}

function shortWhat(call: typeof schema.calls.$inferSelect): string {
  const f = call.extracted?.fields ?? {};
  const size = f.bhk ? `${f.bhk.value}BHK` : f.size_sqft ? `${f.size_sqft.value} sq ft` : f.property_kind?.value === "commercial" ? "office" : "home";
  return [size, f.locality?.value].filter(Boolean).join(" ");
}

async function runJob(kind: JobKind, callId: string, payload: Record<string, unknown>, d: Deps, key: string) {
  const e = env();
  const { call, booking } = await loadCall(callId);

  if (kind === "designer_email") {
    if (call.emailSentAt) return; // exactly once
    if (call.qualification !== "qualified" || !call.designerBrief) return;
    const [designer] = call.assignedDesigner
      ? await db().select().from(schema.designers).where(eq(schema.designers.key, call.assignedDesigner))
      : [];
    const to = designer?.email ?? e.EMAIL_TEST_TO ?? e.OWNER_EMAIL;
    if (!to) throw new Error("no designer email configured");
    const m = designerEmail({
      callerName: call.callerName,
      temperature: call.temperature,
      brief: call.designerBrief,
      shortWhat: shortWhat(call),
      dashboardUrl: dashboardUrl(callId),
    });
    await d.email.send({ to, ...m, idempotencyKey: key });
    await setCall(callId, { emailStatus: d.email.name === "mock" ? "sent (mock)" : "sent", emailSentAt: new Date() });
    return;
  }

  if (kind === "escalation_email") {
    const to = e.ESCALATION_EMAIL ?? e.OWNER_EMAIL ?? e.EMAIL_TEST_TO;
    if (!to) throw new Error("no ESCALATION_EMAIL / OWNER_EMAIL configured");
    const m = escalationEmail({
      callerName: call.callerName,
      callerNumber: call.callerNumber,
      details: (call.extracted?.fields.existing_client_details?.value as string | undefined) ?? call.summary,
      at: call.startedAt ?? call.createdAt,
      dashboardUrl: dashboardUrl(callId),
    });
    await d.email.send({ to, ...m, idempotencyKey: key });
    return;
  }

  if (kind === "price_leak_alert") {
    const to = e.OWNER_EMAIL ?? e.EMAIL_TEST_TO;
    if (!to) throw new Error("no OWNER_EMAIL configured");
    const lines = call.complianceFlags.filter((f) => f.code === "price_leak").map((f) => f.text);
    await d.email.send({ to, ...priceLeakEmail({ lines, callerName: call.callerName, dashboardUrl: dashboardUrl(callId) }), idempotencyKey: key });
    return;
  }

  if (kind === "calendar_update") {
    const bookingId = String(payload.bookingId ?? "");
    const [b] = await db().select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
    if (!b?.googleEventId) return; // nothing on the calendar to change
    if (payload.action === "cancelled") await d.calendar.cancel({ eventId: b.googleEventId });
    else await d.calendar.reschedule({ eventId: b.googleEventId }, b.startAt, b.endAt);
    return;
  }

  if (kind === "hubspot_sync") {
    await syncHubspot(call, booking, d, payload);
  }
}

async function syncHubspot(
  call: typeof schema.calls.$inferSelect,
  booking: typeof schema.bookings.$inferSelect | undefined,
  d: Deps,
  payload: Record<string, unknown>,
) {
  const qualified = call.qualification === "qualified";
  if (!qualified && !call.hubspotDealId) return; // only qualified leads become deals

  const stage: DealStage = !qualified
    ? "lost"
    : call.outcomeStage === "won"
      ? "won"
      : call.outcomeStage === "lost"
        ? "lost"
        : call.outcomeStage === "proposal_sent"
          ? "proposal_sent"
          : call.outcomeStage === "consultation_done"
            ? "consultation_done"
            : booking
              ? "booked"
              : "qualified_not_booked";

  const deal: DealInput = {
    name: `${call.callerName ?? "Caller"}, ${shortWhat(call)}`,
    stage,
    amount: stage === "won" ? call.outcomeValue : null,
    lostReason: stage === "lost" ? (call.outcomeReason ?? String(payload.reason ?? "Not qualified")) : undefined,
    properties: {
      aangan_temperature: call.temperature,
      aangan_designer: call.assignedDesigner,
      aangan_summary: call.summary?.slice(0, 1000) ?? null,
      aangan_dashboard_url: dashboardUrl(call.id),
      aangan_meeting_at: booking ? booking.startAt.toISOString() : null,
      aangan_meeting_mode: booking?.mode ?? null,
      aangan_source: "AI phone agent",
    },
  };

  let contactId = call.hubspotContactId;
  if (!contactId) {
    ({ contactId } = await d.crm.upsertContact({ phone: call.callerNumber ?? `unknown-${call.vaaniCallId}`, name: call.callerName }));
  }
  if (!call.hubspotDealId) {
    const { dealId } = await d.crm.createDeal(contactId, deal);
    await setCall(call.id, { hubspotContactId: contactId, hubspotDealId: dealId, hubspotStatus: d.crm.name === "mock" ? "synced (mock)" : "synced" });
    return;
  }
  await d.crm.updateDeal(call.hubspotDealId, deal);
  if (stage === "lost" && deal.lostReason) await d.crm.addNote(call.hubspotDealId, `Closed lost: ${deal.lostReason}`);
  await setCall(call.id, { hubspotContactId: contactId, hubspotStatus: d.crm.name === "mock" ? "synced (mock)" : "synced" });
}

/** Counts for the digest / dashboard. */
export async function deadJobCount() {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.syncJobs)
    .where(inArray(schema.syncJobs.status, ["dead"]));
  return r?.n ?? 0;
}
