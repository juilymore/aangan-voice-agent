"use server";
// Designer edits from the dashboard. Every edit: save the change, write call_audit (actor = persona name),
// then call onCallChanged so the integration layer can sync it (lib/sync/hooks.ts).
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { currentPersona } from "@/lib/persona";
import { onCallChanged, retrySync, type CallChange } from "@/lib/sync/hooks";
import { UUID_RE } from "@/lib/data/calls";
import { parseIstLocal } from "@/lib/data/format";
import { EXTRACT_FIELDS, type ExtractField, type QualificationReasons } from "@/lib/types/call-json";
import { recordCorrection, updateFact } from "@/lib/learning";
import { QUALIFICATION_LABELS } from "@/lib/data/labels";

const { calls, bookings, callAudit, designers, syncJobs } = schema;

export type ActionState = { ok: boolean; message: string; at?: number } | null;

const QUALIFICATIONS = ["qualified", "not_qualified", "needs_review", "not_a_lead"] as const;
const TEMPERATURES = ["hot", "warm", "cold"] as const;
const OUTCOMES = ["consultation_done", "no_show", "proposal_sent", "won", "lost"] as const;

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

const fail = (message: string): ActionState => ({ ok: false, message, at: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, at: Date.now() });

async function loadCall(id: string) {
  if (!UUID_RE.test(id)) return null;
  const [call] = await db().select().from(calls).where(eq(calls.id, id)).limit(1);
  return call ?? null;
}

async function audit(
  tx: Tx,
  callId: string,
  actor: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  reason?: string | null,
) {
  await tx.insert(callAudit).values({
    callId,
    actor,
    field,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    reason: reason || null,
  });
}

/** Runs after the change and its audit row are committed. A sync hiccup never undoes the saved change. */
async function notify(callId: string, change: CallChange, actor: string, okMessage: string): Promise<ActionState> {
  revalidatePath(`/calls/${callId}`);
  revalidatePath("/");
  revalidatePath("/calls");
  try {
    await onCallChanged(callId, change, actor);
    return done(okMessage);
  } catch (err) {
    console.error("onCallChanged failed", err);
    return done(`${okMessage} Sync will be retried.`);
  }
}

export async function changeQualification(_: TeachState, fd: FormData): Promise<TeachState> {
  const { name: actor } = await currentPersona();
  const call = await loadCall(str(fd, "callId"));
  if (!call) return fail("Call not found.");
  const to = str(fd, "qualification");
  const reason = str(fd, "reason");
  if (!QUALIFICATIONS.includes(to as (typeof QUALIFICATIONS)[number])) return fail("Pick a qualification.");
  if (reason.length < 3) return fail("Please give a reason for the change.");
  if (to === call.qualification) return fail("That is already the qualification.");
  const at = new Date();
  const reasons: QualificationReasons | null = call.qualificationReasons
    ? { ...call.qualificationReasons, overriddenBy: { actor, at: at.toISOString(), reason } }
    : null;
  const wantsTeach = str(fd, "teach") === "1";
  const aiValue = wantsTeach ? await originalValue(call.id, "qualification", call.qualification) : null;
  await db().transaction(async (tx) => {
    await tx
      .update(calls)
      .set({ qualification: to as (typeof QUALIFICATIONS)[number], qualificationReasons: reasons, updatedAt: at })
      .where(eq(calls.id, call.id));
    await audit(tx, call.id, actor, "qualification", call.qualification, to, reason);
  });
  const learned = wantsTeach ? await teach(call.id, "qualification", aiValue, to, reason, actor) : null;
  const res = await notify(
    call.id,
    { kind: "qualification", from: call.qualification, to, reason },
    actor,
    "Qualification updated.",
  );
  return withLearned(res, learned, wantsTeach);
}

export async function changeTemperature(_: TeachState, fd: FormData): Promise<TeachState> {
  const { name: actor } = await currentPersona();
  const call = await loadCall(str(fd, "callId"));
  if (!call) return fail("Call not found.");
  const to = str(fd, "temperature");
  const reason = str(fd, "reason");
  const wantsTeach = str(fd, "teach") === "1";
  if (!TEMPERATURES.includes(to as (typeof TEMPERATURES)[number])) return fail("Pick a temperature.");
  if (to === call.temperature) return fail("That is already the temperature.");
  if (wantsTeach && reason.length < 3) return fail("Add a short reason so the AI can learn from it.");
  const aiValue = wantsTeach ? await originalValue(call.id, "temperature", call.temperature) : null;
  await db().transaction(async (tx) => {
    await tx
      .update(calls)
      .set({ temperature: to as (typeof TEMPERATURES)[number], updatedAt: new Date() })
      .where(eq(calls.id, call.id));
    await audit(tx, call.id, actor, "temperature", call.temperature, to, reason);
  });
  const learned = wantsTeach ? await teach(call.id, "temperature", aiValue, to, reason, actor) : null;
  const res = await notify(call.id, { kind: "temperature", from: call.temperature, to }, actor, "Temperature updated.");
  return withLearned(res, learned, wantsTeach);
}

// ---------------------------------------------------------------- "Teach the AI"

export type Learned = { id: string; label: string; applicable: boolean };
export type TeachState = { ok: boolean; message: string; at?: number; learned?: Learned | null } | null;

const APPLICABLE = ["add_area_pass", "add_area_fail", "set_rule"];

/** The value the system first decided (before any human change), from the earliest audit row. */
async function originalValue(callId: string, field: string, current: unknown): Promise<unknown> {
  const [first] = await db()
    .select({ old: callAudit.oldValue })
    .from(callAudit)
    .where(and(eq(callAudit.callId, callId), eq(callAudit.field, field)))
    .orderBy(asc(callAudit.at))
    .limit(1);
  return first ? first.old : current;
}

async function teach(
  callId: string,
  kind: "qualification" | "temperature",
  aiValue: unknown,
  humanValue: string,
  reason: string,
  actor: string,
): Promise<Learned | null> {
  try {
    const { id, suggestion } = await recordCorrection({
      callId,
      kind,
      field: kind,
      aiValue,
      humanValue,
      reason: reason || null,
      actor,
    });
    const { role } = await currentPersona();
    const label = publicLabel(suggestion, role === "owner");
    await db()
      .insert(callAudit)
      .values({
        callId,
        actor,
        field: "teach_ai",
        oldValue: (aiValue ?? null) as object | null,
        newValue: { kind, value: humanValue, correctionId: id, suggestion: publicLabel(suggestion, false) },
        reason: reason || null,
      });
    revalidatePath("/rubric");
    revalidatePath(`/calls/${callId}`);
    return { id, label, applicable: APPLICABLE.includes(suggestion.type) };
  } catch (err) {
    console.error("recordCorrection failed", err);
    return null;
  }
}

function withLearned(res: ActionState, learned: Learned | null, wanted: boolean): TeachState {
  if (!res || !wanted) return res;
  if (!learned) return { ...res, message: `${res.message} Could not record the lesson for the AI; try again.` };
  return { ...res, message: `${res.message} Learned.`, learned };
}

const NUMERIC_FACTS: readonly string[] = ["size_sqft", "bhk", "rooms_count", "budget_max_inr", "start_in_days"];
const BOOLEAN_FACTS: readonly string[] = [
  "prefers_human",
  "refused_questions",
  "recording_objection",
  "price_asked",
  "reschedule_request",
  "structural_request",
  "consult_intent",
  "urgent",
  "commitment",
  "exploring",
  "price_only",
  "no_rush_to_decide",
];

const qLabel = (v: unknown) => (typeof v === "string" ? (QUALIFICATION_LABELS[v]?.label ?? v) : "not set").toLowerCase();

/** "Fix" on a key fact: saves the corrected value (and an AI reading example) and re-checks the call. */
export async function fixFact(_: ActionState, fd: FormData): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const call = await loadCall(str(fd, "callId"));
  if (!call) return fail("Call not found.");
  const field = str(fd, "field");
  if (!(EXTRACT_FIELDS as readonly string[]).includes(field)) return fail("This fact can't be edited.");
  const raw = str(fd, "value");
  const note = str(fd, "note").slice(0, 500);
  if (!raw) return fail("Enter the correct value.");
  if (raw.length > 200) return fail("Keep it under 200 characters.");
  let value: string | number | boolean = raw;
  if (NUMERIC_FACTS.includes(field)) {
    const n = Number(raw.replace(/[₹,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return fail("Enter a number.");
    value = n;
  } else if (BOOLEAN_FACTS.includes(field)) {
    if (!/^(true|false|yes|no)$/i.test(raw)) return fail("Enter yes or no.");
    value = /^(true|yes)$/i.test(raw);
  }
  const current = call.extracted?.fields[field as ExtractField]?.value;
  if (current != null && String(current).toLowerCase() === String(value).toLowerCase()) return fail("That is already the value.");
  let r: { changed: boolean; from?: unknown; to?: unknown };
  try {
    r = await updateFact(call.id, field as ExtractField, value, actor, note || undefined);
  } catch (err) {
    console.error("updateFact failed", err);
    return fail("Could not save the fact.");
  }
  revalidatePath(`/calls/${call.id}`);
  revalidatePath("/");
  revalidatePath("/calls");
  revalidatePath("/rubric");
  if (r.from !== undefined && r.from !== r.to) return done(`Saved. Verdict changed: ${qLabel(r.from)} → ${qLabel(r.to)}.`);
  return done(r.changed ? "Saved. Verdict unchanged; temperature re-rated." : "Saved. Verdict unchanged.");
}

export async function reassignDesigner(_: ActionState, fd: FormData): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const call = await loadCall(str(fd, "callId"));
  if (!call) return fail("Call not found.");
  const to = str(fd, "designer");
  const [designer] = to ? await db().select().from(designers).where(eq(designers.key, to)).limit(1) : [];
  if (!designer) return fail("Pick a designer.");
  if (to === call.assignedDesigner) return fail(`Already assigned to ${designer.name}.`);
  await db().transaction(async (tx) => {
    await tx.update(calls).set({ assignedDesigner: to, updatedAt: new Date() }).where(eq(calls.id, call.id));
    await audit(tx, call.id, actor, "assigned_designer", call.assignedDesigner, to, str(fd, "reason"));
  });
  return notify(call.id, { kind: "designer", from: call.assignedDesigner, to }, actor, `Assigned to ${designer.name}.`);
}

export async function markFollowupDone(_: ActionState, fd: FormData): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const call = await loadCall(str(fd, "callId"));
  if (!call) return fail("Call not found.");
  if (call.followupDoneAt) return fail("Follow-up is already marked done.");
  const at = new Date();
  await db().transaction(async (tx) => {
    await tx.update(calls).set({ followupDoneAt: at, updatedAt: at }).where(eq(calls.id, call.id));
    await audit(tx, call.id, actor, "followup_done", null, at.toISOString(), str(fd, "note"));
  });
  return notify(call.id, { kind: "followup_done" }, actor, "Follow-up marked done.");
}

export async function setOutcome(_: ActionState, fd: FormData): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const call = await loadCall(str(fd, "callId"));
  if (!call) return fail("Call not found.");
  const to = str(fd, "stage");
  if (!OUTCOMES.includes(to as (typeof OUTCOMES)[number])) return fail("Pick an outcome.");
  let value: number | null = null;
  let reason: string | null = null;
  if (to === "won") {
    const raw = str(fd, "value").replace(/[₹,\s]/g, "");
    value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      return fail("Enter the project value in ₹ (whole rupees).");
    }
    if (value > 2_000_000_000) return fail("That value looks too large.");
  }
  if (to === "lost") {
    reason = str(fd, "reason");
    if (reason.length < 3) return fail("Please say why it was lost.");
  }
  await db().transaction(async (tx) => {
    await tx
      .update(calls)
      .set({ outcomeStage: to as (typeof OUTCOMES)[number], outcomeValue: value, outcomeReason: reason, updatedAt: new Date() })
      .where(eq(calls.id, call.id));
    await audit(
      tx,
      call.id,
      actor,
      "outcome",
      { stage: call.outcomeStage, value: call.outcomeValue, reason: call.outcomeReason },
      { stage: to, value, reason },
      reason,
    );
  });
  return notify(call.id, { kind: "outcome", to, value, reason }, actor, "Outcome saved.");
}

export async function addNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const call = await loadCall(str(fd, "callId"));
  if (!call) return fail("Call not found.");
  const text = str(fd, "note");
  if (!text) return fail("Write a note first.");
  if (text.length > 4000) return fail("Notes are limited to 4000 characters.");
  await db().transaction(async (tx) => {
    await audit(tx, call.id, actor, "note", null, text);
    await tx.update(calls).set({ updatedAt: new Date() }).where(eq(calls.id, call.id));
  });
  return notify(call.id, { kind: "note", text }, actor, "Note added.");
}

async function loadBooking(callId: string, bookingId: string) {
  const call = await loadCall(callId);
  if (!call || !UUID_RE.test(bookingId)) return null;
  const [booking] = await db()
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.vaaniCallId, call.vaaniCallId)))
    .limit(1);
  return booking ? { call, booking } : null;
}

function isOverlap(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  const code = e?.code ?? e?.cause?.code;
  return code === "23P01" || code === "23505";
}

export async function rescheduleBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const found = await loadBooking(str(fd, "callId"), str(fd, "bookingId"));
  if (!found) return fail("Consultation not found.");
  const { call, booking } = found;
  if (booking.status === "cancelled") return fail("This consultation was cancelled.");
  const start = parseIstLocal(str(fd, "start"));
  if (!start) return fail("Pick a new date and time.");
  if (start.getTime() < Date.now()) return fail("Pick a time in the future.");
  const durationMs = booking.endAt.getTime() - booking.startAt.getTime();
  const end = new Date(start.getTime() + durationMs);
  if (start.getTime() === booking.startAt.getTime()) return fail("That is the current time.");
  try {
    await db().transaction(async (tx) => {
      await tx.update(bookings).set({ startAt: start, endAt: end }).where(eq(bookings.id, booking.id));
      await audit(
        tx,
        call.id,
        actor,
        "booking_rescheduled",
        { bookingId: booking.id, startAt: booking.startAt.toISOString(), endAt: booking.endAt.toISOString() },
        { bookingId: booking.id, startAt: start.toISOString(), endAt: end.toISOString() },
        str(fd, "reason"),
      );
    });
  } catch (err) {
    if (isOverlap(err)) return fail("That time overlaps another consultation on the studio calendar.");
    throw err;
  }
  return notify(call.id, { kind: "booking", action: "rescheduled", bookingId: booking.id }, actor, "Consultation moved.");
}

export async function cancelBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const found = await loadBooking(str(fd, "callId"), str(fd, "bookingId"));
  if (!found) return fail("Consultation not found.");
  const { call, booking } = found;
  if (booking.status === "cancelled") return fail("Already cancelled.");
  await db().transaction(async (tx) => {
    await tx.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booking.id));
    await audit(
      tx,
      call.id,
      actor,
      "booking_cancelled",
      { bookingId: booking.id, status: booking.status },
      { bookingId: booking.id, status: "cancelled" },
      str(fd, "reason"),
    );
  });
  return notify(call.id, { kind: "booking", action: "cancelled", bookingId: booking.id }, actor, "Consultation cancelled.");
}

/** "Confirmed with customer?" tick on Today. Stored as a call_audit entry (field customer_confirmed). */
export async function setCustomerConfirmed(callId: string, bookingId: string, confirmed: boolean): Promise<ActionState> {
  const { name: actor } = await currentPersona();
  const found = await loadBooking(callId, bookingId);
  if (!found) return fail("Consultation not found.");
  await db().transaction(async (tx) => {
    await audit(tx, found.call.id, actor, "customer_confirmed", { bookingId, confirmed: !confirmed }, { bookingId, confirmed });
  });
  if (!confirmed) {
    revalidatePath("/");
    revalidatePath(`/calls/${found.call.id}`);
    return done("Unticked.");
  }
  return notify(found.call.id, { kind: "booking", action: "confirmed_with_customer", bookingId }, actor, "Marked confirmed.");
}

export async function retrySyncJob(_: ActionState, fd: FormData): Promise<ActionState> {
  await currentPersona();
  const jobId = str(fd, "jobId");
  if (!UUID_RE.test(jobId)) return fail("Job not found.");
  const [job] = await db().select().from(syncJobs).where(eq(syncJobs.id, jobId)).limit(1);
  if (!job) return fail("Job not found.");
  if (job.status !== "failed" && job.status !== "dead") return fail("Only failed jobs can be retried.");
  try {
    await retrySync(jobId);
  } catch (err) {
    console.error("retrySync failed", err);
    return fail("Retry failed again. Check the error below.");
  } finally {
    if (job.callId) revalidatePath(`/calls/${job.callId}`);
  }
  return done("Retry started.");
}

/** Budget suggestions mention the internal pricing ratio: designers see a plain version. */
function publicLabel(s: { type: string; label: string; field?: string }, isOwner: boolean): string {
  if (!isOwner && s.type === "set_rule" && s.field === "budgetFailRatio")
    return "Be gentler on low budgets (details on the Rubric tab)";
  return s.label;
}
