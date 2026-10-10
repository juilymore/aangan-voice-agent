import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import type { Deps } from "@/lib/providers";
import { blockMinutes, dayKey, parsePreference } from "@/lib/calendar/slots";
import { istParts, spokenTime } from "@/lib/calendar/spoken";
import type { ConsultMode, Slot } from "@/lib/calendar/types";
import { evaluate } from "@/lib/rules/engine";
import { lineFor, type Lang } from "@/lib/rules/lines";
import type { CallAction } from "@/lib/rules/types";
import { normalizeCheckFit } from "./normalize";
import { getRuleSettings } from "@/lib/rules/settings";

const last10 = (n: string | null | undefined) => (n ? n.replace(/\D/g, "").slice(-10) || null : null);
const str = z.union([z.string(), z.number()]).transform(String).optional();
const lang = (l?: string): Lang => (/^(hi|hindi)/i.test(l ?? "") ? "hi" : /^(mr|marathi)/i.test(l ?? "") ? "mr" : "en");

// ---------------- lookup_caller ----------------
export const LookupParams = z.object({ caller_number: str });

export async function lookupCaller(p: z.infer<typeof LookupParams>) {
  const n = last10(p.caller_number);
  const empty = { known: false, has_booking: false, booking_spoken: null, booking_designer: null, recent_call: false };
  if (!n) return empty;
  const match = sql`right(regexp_replace(coalesce(${schema.calls.callerNumber}, ''), '\\D', '', 'g'), 10) = ${n}`;
  const calls = await db().select({ startedAt: schema.calls.startedAt }).from(schema.calls).where(match).orderBy(desc(schema.calls.startedAt)).limit(1);
  const [booking] = await db()
    .select({ startAt: schema.bookings.startAt, designer: schema.designers.name })
    .from(schema.bookings)
    .leftJoin(schema.designers, eq(schema.designers.key, schema.bookings.designer))
    .where(
      and(
        eq(schema.bookings.status, "confirmed"),
        gte(schema.bookings.startAt, new Date()),
        sql`right(regexp_replace(coalesce(${schema.bookings.callbackNumber}, ''), '\\D', '', 'g'), 10) = ${n}`,
      ),
    )
    .orderBy(schema.bookings.startAt)
    .limit(1);
  // No names, summaries or history (build_spec §6).
  return {
    known: calls.length > 0 || !!booking,
    has_booking: !!booking,
    booking_spoken: booking ? spokenTime(booking.startAt) : null,
    booking_designer: booking?.designer ?? null,
    recent_call: !!calls[0]?.startedAt && calls[0].startedAt.getTime() > Date.now() - 7 * 86_400_000,
  };
}

// ---------------- check_fit ----------------
export const CheckFitParams = z.object({
  language: str,
  project_type: str,
  property_kind: str,
  locality: str,
  size_text: str,
  property_state: str,
  scope_text: str,
  intent: str,
  timeline_text: str,
  decision_maker_text: str,
  budget_text: str,
  referral_text: str,
});

export async function checkFit(p: z.infer<typeof CheckFitParams>, callId: string) {
  // History of this call's earlier check_fit answers: clarify limits and "later date already offered".
  const history = await db()
    .select({ response: schema.toolCalls.response })
    .from(schema.toolCalls)
    .where(and(eq(schema.toolCalls.vaaniCallId, callId), eq(schema.toolCalls.tool, "check_fit"), eq(schema.toolCalls.ok, true)));
  const prior = history.map((h) => h.response as { decision?: string; reason_code?: string } | null).filter(Boolean);
  const clarifies = (code: string) => prior.filter((r) => r!.decision === "clarify" && r!.reason_code === code).length;

  const input = normalizeCheckFit(p, new Date());
  input.laterDateOffered = clarifies("timeline_later") > 0;
  const result = evaluate(input, await getRuleSettings());
  let action: CallAction = result.callAction;

  // After two clarifies on the same criterion: proceed and record the uncertainty (build_spec §6).
  if (action.decision === "clarify" && clarifies(action.code) >= 2) action = { decision: "proceed" };

  const l = lang(p.language);
  if (action.decision === "proceed") return { decision: "proceed" as const };
  if (action.decision === "clarify") return { decision: "clarify" as const, ask: lineFor(action, l), reason_code: action.code };
  return { decision: "decline" as const, say: lineFor(action, l), reason_code: action.code };
}

// ---------------- get_available_slots ----------------
export const SlotsParams = z.object({
  mode: z.enum(["site_visit", "phone_call"]).catch("site_visit"),
  preferred_days_text: str,
  preferred_time_text: str,
  language: str,
});

async function bookingContext(now: Date) {
  const designers = await db().select().from(schema.designers).where(eq(schema.designers.active, true));
  const upcoming = await db()
    .select({ designer: schema.bookings.designer, startAt: schema.bookings.startAt, endAt: schema.bookings.endAt })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.status, "confirmed"), gte(schema.bookings.endAt, now), lt(schema.bookings.startAt, new Date(now.getTime() + 12 * 86_400_000))));
  const load: Record<string, Record<string, number>> = {};
  for (const b of upcoming) {
    load[b.designer] ??= {};
    load[b.designer][dayKey(b.startAt)] = (load[b.designer][dayKey(b.startAt)] ?? 0) + 1;
  }
  return {
    designers: designers.map((d) => ({ key: d.key, name: d.name, maxPerDay: d.maxPerDay })),
    load,
    extraBusy: upcoming.map((b) => ({ start: b.startAt, end: b.endAt })),
  };
}

const slotOut = (s: Slot) => ({ slot_id: s.slotId, designer: s.designerName, spoken: s.spoken });

export async function getAvailableSlots(p: z.infer<typeof SlotsParams>, d: Deps) {
  const now = new Date();
  try {
    const ctx = await bookingContext(now);
    const slots = await d.calendar.getFreeSlots({
      mode: p.mode,
      now,
      limit: 6,
      ...ctx,
      preference: parsePreference(p.preferred_days_text, p.preferred_time_text),
    });
    // If the preference filtered everything out, offer the earliest anyway.
    const final = slots.length ? slots : await d.calendar.getFreeSlots({ mode: p.mode, now, limit: 6, ...ctx });
    return { slots: final.map(slotOut) };
  } catch (e) {
    console.error("get_available_slots:", e instanceof Error ? e.message : e);
    return { slots: [], error: "calendar_unavailable" };
  }
}

// ---------------- book_consultation ----------------
export const BookParams = z.object({
  slot_id: z.string(),
  caller_name: str,
  callback_number: str,
  mode: z.enum(["site_visit", "phone_call"]).optional().catch(undefined),
  locality: str,
  society_or_building: str,
  notes: str,
});

async function alternatives(mode: ConsultMode, d: Deps) {
  try {
    const now = new Date();
    const slots = await d.calendar.getFreeSlots({ mode, now, limit: 3, ...(await bookingContext(now)) });
    return slots.map(slotOut);
  } catch {
    return [];
  }
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/**
 * The agent is told to copy slot_id exactly, but language models sometimes paraphrase it
 * ("ruhi-thursday-10am"). Resolve such loose ids against the currently open slots; never guess
 * when it is ambiguous.
 */
export async function resolveSlotId(raw: string, mode: ConsultMode, d: Deps): Promise<string | null> {
  if (/^[a-z0-9_-]+\|\d{4}-\d{2}-\d{2}T/i.test(raw)) return raw; // canonical
  const s = raw.toLowerCase();
  const now = new Date();
  const ctx = await bookingContext(now);
  const open = await d.calendar.getFreeSlots({ mode, now, limit: 14, ...ctx });
  const wd = WEEKDAYS.findIndex((w) => s.includes(w) || s.includes(w.slice(0, 3) + " ") || s.includes(w.slice(0, 3) + "-"));
  // Day-of-month ("15th") is matched first and removed, so it is not mistaken for the hour.
  const dayNum = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/)?.[1];
  const rest = dayNum ? s.replace(/\b\d{1,2}(?:st|nd|rd|th)\b/, " ") : s;
  const hm = rest.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m|p\.m)?\b/);
  let hour: number | null = null;
  if (hm) {
    hour = Number(hm[1]);
    if (hm[3]?.startsWith("p") && hour < 12) hour += 12;
    if (hm[3]?.startsWith("a") && hour === 12) hour = 0;
  } else {
    const w = Object.keys(NUMBER_WORDS).find((k) => new RegExp("\\b" + k + "\\b").test(rest));
    if (w) hour = NUMBER_WORDS[w];
  }
  if (hour != null && hour < 8 && !/am|morning/.test(s)) hour += 12; // 'four' means 16:00 in office hours
  const match = (list: Slot[]) =>
    list.filter((x) => {
      const p = istParts(x.start);
      return (wd < 0 || p.wd === wd) && (hour == null || p.h === hour) && (!dayNum || p.d === Number(dayNum));
    });
  const byDesigner = open.filter((x) => s.includes(x.designer));
  const hits = match(byDesigner).length ? match(byDesigner) : match(open);
  if (hits.length !== 1 && !(hits.length > 1 && hits.every((h) => h.start.getTime() === hits[0].start.getTime()))) return null;
  return hits[0].slotId;
}

export async function bookConsultation(p: z.infer<typeof BookParams>, callId: string, d: Deps) {
  // A real callback number is required before anything is booked.
  const digits = (p.callback_number ?? "").replace(/\D/g, "");
  if (digits.length < 10) {
    return {
      success: false,
      error: "need_callback_number",
      message: "Ask the caller for the best phone number to reach them, read it back to confirm, then call this tool again with the same slot_id and that number. Do not say anything is booked.",
    };
  }
  const requestedMode = (p.mode ?? (p.slot_id.split("|")[2] as ConsultMode | undefined) ?? "site_visit") as ConsultMode;
  const resolved = await resolveSlotId(p.slot_id, requestedMode === "phone_call" ? "phone_call" : "site_visit", d);
  const [designer, iso, slotMode] = (resolved ?? p.slot_id).split("|");
  const mode = (p.mode ?? slotMode) as ConsultMode;
  const start = new Date(iso);
  if (!designer || isNaN(start.getTime()) || (mode !== "site_visit" && mode !== "phone_call")) {
    return { success: false, error: "invalid_slot", alternatives: await alternatives("site_visit", d) };
  }
  if (start.getTime() < Date.now() + 60 * 60_000) {
    return { success: false, error: "slot_in_past", alternatives: await alternatives(mode, d) };
  }
  const end = new Date(start.getTime() + blockMinutes(mode) * 60_000);
  const [des] = await db().select().from(schema.designers).where(and(eq(schema.designers.key, designer), eq(schema.designers.active, true)));
  if (!des) return { success: false, error: "designer_unavailable", alternatives: await alternatives(mode, d) };

  // 1. Write the row first: the overlap constraint makes double booking impossible.
  let bookingId: string;
  try {
    const [row] = await db()
      .insert(schema.bookings)
      .values({
        vaaniCallId: callId,
        designer,
        startAt: start,
        endAt: end,
        mode,
        callerName: p.caller_name ?? null,
        callbackNumber: p.callback_number ?? null,
        locality: p.locality ?? null,
        society: p.society_or_building ?? null,
      })
      .returning({ id: schema.bookings.id });
    bookingId = row.id;
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23P01" || code === "23505") return { success: false, error: "slot_taken", alternatives: await alternatives(mode, d) };
    throw e;
  }

  // 2. Re-check the live calendar, then 3. create the event. Any failure rolls the row back.
  try {
    if (!(await d.calendar.isFree(start, end))) {
      await db().delete(schema.bookings).where(eq(schema.bookings.id, bookingId));
      return { success: false, error: "slot_taken", alternatives: await alternatives(mode, d) };
    }
    const modeLabel = mode === "site_visit" ? "Site visit" : "Phone call";
    const ev = await d.calendar.book({
      start,
      end,
      callId,
      title: `Aangan consultation: ${p.caller_name ?? "Caller"} (${modeLabel}), ${p.locality ?? "locality not given"}`,
      description: [
        `Caller: ${p.caller_name ?? "not given"}`,
        `Callback: ${p.callback_number ?? "not given"}`,
        `Society/building: ${p.society_or_building ?? "not given"}`,
        `Designer: ${des.name}`,
        p.notes ? `Notes: ${p.notes}` : null,
        `Dashboard: ${env().APP_URL.replace(/\/$/, "")}/calls?q=${encodeURIComponent(p.callback_number ?? "")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    await db().update(schema.bookings).set({ googleEventId: ev.eventId }).where(eq(schema.bookings.id, bookingId));
  } catch (e) {
    await db().delete(schema.bookings).where(eq(schema.bookings.id, bookingId));
    console.error("book_consultation calendar error:", e instanceof Error ? e.message : e);
    return { success: false, error: "calendar_unavailable", alternatives: await alternatives(mode, d) };
  }

  const modeWords = mode === "site_visit" ? "a site visit" : "a phone call";
  return {
    success: true,
    booking_id: bookingId,
    spoken_confirmation: `You're booked with ${des.name} on ${spokenTime(start)}, for ${modeWords}.`,
  };
}
