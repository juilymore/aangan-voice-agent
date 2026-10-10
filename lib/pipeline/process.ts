import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deps as realDeps, type Deps } from "@/lib/providers";
import { enqueue, runDueJobs } from "@/lib/sync/jobs";
import type { NormalizedCall } from "@/lib/voice/types";
import type { DesignerBrief } from "@/lib/types/call-json";
import { analyzeCall } from "./analyze";
import { getBusinessSettings, getRuleSettings } from "@/lib/rules/settings";
import { extractionHints } from "@/lib/learning";

// Post-call pipeline — build_spec §8: receive → (reconcile) → link → redact/extract → decide →
// compliance → brief → assign → route. Idempotent on vaani_call_id.

export type ProcessOptions = {
  deps?: Deps;
  isTest?: boolean;
  /** Re-run analysis even if the call was processed before. */
  force?: boolean;
  /** Legacy/demo transcripts came from the human front desk: skip the AI-disclosure check. */
  checkDisclosure?: boolean;
  /** Run the queued email/CRM jobs immediately (default true). */
  runJobs?: boolean;
};

const last10 = (n: string | null) => (n ? n.replace(/\D/g, "").slice(-10) || null : null);

/** Webhook entry: verify, store raw event (deduped by envelope id). Returns the raw event id to process. */
export async function ingestVaaniEvent(rawBody: string, headers: Headers, d: Deps = realDeps()) {
  const check = await d.voice.verifyWebhook(rawBody, headers);
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = { unparsable: rawBody.slice(0, 2000) };
  }
  const [row] = await db()
    .insert(schema.rawEvents)
    .values({ source: "vaani", eventId: check.eventId, signatureOk: check.ok, payload: payload as object })
    .onConflictDoNothing()
    .returning({ id: schema.rawEvents.id });
  return { ok: check.ok, rawEventId: row?.id ?? null, duplicate: !row, eventType: check.eventType };
}

/** Processes one stored raw event. Safe to run twice. */
export async function processRawEvent(rawEventId: string, opts: ProcessOptions = {}) {
  const d = opts.deps ?? realDeps();
  const [ev] = await db().select().from(schema.rawEvents).where(eq(schema.rawEvents.id, rawEventId));
  if (!ev || ev.processedAt) return;
  if (!ev.signatureOk) {
    await db().update(schema.rawEvents).set({ processedAt: new Date(), error: "signature invalid: ignored" }).where(eq(schema.rawEvents.id, rawEventId));
    return;
  }
  try {
    const call = d.voice.parseCallEvent(ev.payload);
    if (call) await processCall(call, { ...opts, deps: d });
    await db().update(schema.rawEvents).set({ processedAt: new Date(), error: call ? null : "not a call event" }).where(eq(schema.rawEvents.id, rawEventId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().update(schema.rawEvents).set({ error: msg.slice(0, 500) }).where(eq(schema.rawEvents.id, rawEventId));
    throw e;
  }
}

/** Reconcile: Vaani has no list-calls API, so we re-process any stored event that wasn't finished. */
export async function reconcile(opts: ProcessOptions = {}) {
  const stale = await db()
    .select({ id: schema.rawEvents.id })
    .from(schema.rawEvents)
    .where(and(isNull(schema.rawEvents.processedAt), eq(schema.rawEvents.signatureOk, true), lte(schema.rawEvents.receivedAt, new Date(Date.now() - 60_000))))
    .orderBy(asc(schema.rawEvents.receivedAt))
    .limit(20);
  let processed = 0;
  for (const s of stale) {
    try {
      await processRawEvent(s.id, opts);
      processed++;
    } catch {
      /* error stored on the raw event; retried next run */
    }
  }
  const jobs = await runDueJobs(opts.deps ?? realDeps());
  return { processed, stale: stale.length, jobs };
}

export async function processCall(nc: NormalizedCall, opts: ProcessOptions = {}) {
  const d = opts.deps ?? realDeps();
  const conn = db();

  // 1. Upsert the call row (idempotent on vaani_call_id).
  await conn
    .insert(schema.calls)
    .values({
      vaaniCallId: nc.providerCallId,
      startedAt: nc.startedAt,
      endedAt: nc.endedAt,
      durationSec: nc.durationSec,
      callerNumber: nc.callerNumber,
      language: nc.language,
      transcript: nc.transcript,
      isTest: opts.isTest ?? false,
    })
    .onConflictDoNothing({ target: schema.calls.vaaniCallId });
  const [call] = await conn.select().from(schema.calls).where(eq(schema.calls.vaaniCallId, nc.providerCallId));
  if (call.qualification && !opts.force) return call; // already processed

  // 2. Booking made mid-call (tool) — by call id, else by callback number during the call window.
  let booking: typeof schema.bookings.$inferSelect | undefined;
  [booking] = await conn
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.vaaniCallId, nc.providerCallId), eq(schema.bookings.status, "confirmed")))
    .limit(1);
  if (!booking && nc.startedAt) {
    const windowEnd = new Date((nc.endedAt ?? nc.startedAt).getTime() + 10 * 60_000);
    const candidates = await conn
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.status, "confirmed"), gte(schema.bookings.createdAt, nc.startedAt), lte(schema.bookings.createdAt, windowEnd)));
    booking =
      candidates.find((b) => last10(b.callbackNumber) && last10(b.callbackNumber) === last10(nc.callerNumber)) ??
      (candidates.length === 1 && candidates[0].vaaniCallId.startsWith("unknown") ? candidates[0] : undefined);
    if (booking) await conn.update(schema.bookings).set({ vaaniCallId: nc.providerCallId }).where(eq(schema.bookings.id, booking.id));
  }

  // 3. Link: same number within 60 minutes where one call was short or dropped; repeat caller within 7 days.
  const extraFlags: string[] = [];
  let linked: string[] = [];
  const num = last10(nc.callerNumber);
  if (num && nc.startedAt) {
    const recent = await conn
      .select({ id: schema.calls.id, startedAt: schema.calls.startedAt, durationSec: schema.calls.durationSec, callType: schema.calls.callType, linkedCallIds: schema.calls.linkedCallIds })
      .from(schema.calls)
      .where(and(ne(schema.calls.id, call.id), gte(schema.calls.startedAt, new Date(nc.startedAt.getTime() - 7 * 86_400_000)), sql`right(regexp_replace(coalesce(${schema.calls.callerNumber}, ''), '\\D', '', 'g'), 10) = ${num}`))
      .orderBy(desc(schema.calls.startedAt));
    if (recent.length) extraFlags.push("repeat_caller");
    const shortThis = nc.status === "dropped" || (nc.durationSec ?? 999) < 90;
    linked = recent
      .filter((r) => r.startedAt && Math.abs(nc.startedAt!.getTime() - r.startedAt.getTime()) <= 60 * 60_000)
      .filter((r) => shortThis || r.callType === "incomplete" || (r.durationSec ?? 999) < 90)
      .map((r) => r.id);
    for (const r of recent.filter((x) => linked.includes(x.id))) {
      await conn.update(schema.calls).set({ linkedCallIds: [...new Set([...(r.linkedCallIds ?? []), call.id])] }).where(eq(schema.calls.id, r.id));
    }
  }

  // 4–8. Analyse (pure).
  const designers = await conn.select().from(schema.designers).where(eq(schema.designers.active, true));
  const meeting: DesignerBrief["meeting"] = booking
    ? {
        designer: booking.designer,
        designerName: designers.find((x) => x.key === booking.designer)?.name ?? booking.designer,
        startAt: booking.startAt.toISOString(),
        mode: booking.mode,
      }
    : null;
  const toolBooked = await conn
    .select({ id: schema.toolCalls.id })
    .from(schema.toolCalls)
    .where(and(eq(schema.toolCalls.vaaniCallId, nc.providerCallId), eq(schema.toolCalls.tool, "book_consultation"), eq(schema.toolCalls.ok, true)))
    .limit(1);
  const a = await analyzeCall(
    {
      transcript: nc.transcript,
      startedAt: nc.startedAt ?? new Date(),
      durationSec: nc.durationSec,
      dropped: nc.status === "dropped",
      bookingSucceeded: !!booking || toolBooked.length > 0,
      meeting,
      checkDisclosure: opts.checkDisclosure,
      extraFlags,
      ruleSettings: await getRuleSettings(),
      business: await getBusinessSettings(),
      hints: await extractionHints(),
    },
    d.llm,
  );

  // 9. Assign: booked designer; otherwise the active designer with fewer open qualified leads (random on a tie).
  let assigned = booking?.designer ?? call.assignedDesigner ?? null;
  // Existing clients: route to the designer they named, if we recognise the name.
  if (!assigned && (a.callType === "followup_update" || a.callType === "existing_client_issue")) {
    const said = String(a.extracted.fields.existing_client_details?.value ?? "").toLowerCase();
    assigned = designers.find((x) => said.includes(x.name.toLowerCase()))?.key ?? null;
  }
  if (!assigned && a.evaluation.outcome === "qualified" && designers.length) {
    const open = await conn
      .select({ d: schema.calls.assignedDesigner, n: sql<number>`count(*)::int` })
      .from(schema.calls)
      .where(and(eq(schema.calls.qualification, "qualified"), eq(schema.calls.outcomeStage, "none"), inArray(schema.calls.assignedDesigner, designers.map((x) => x.key))))
      .groupBy(schema.calls.assignedDesigner);
    const loadOf = (k: string) => open.find((o) => o.d === k)?.n ?? 0;
    const min = Math.min(...designers.map((x) => loadOf(x.key)));
    const pool = designers.filter((x) => loadOf(x.key) === min);
    assigned = pool[Math.floor(Math.random() * pool.length)].key;
  }

  const [updated] = await conn
    .update(schema.calls)
    .set({
      callerName: a.callerName ?? call.callerName,
      language: a.language ?? nc.language ?? call.language,
      callType: a.callType as typeof schema.calls.$inferInsert.callType,
      transcript: nc.transcript,
      extracted: a.extracted,
      summary: a.summary,
      designerBrief: a.brief,
      followUpQuestions: a.evaluation.followUpQuestions,
      qualification: a.evaluation.outcome,
      qualificationReasons: a.qualificationReasons,
      temperature: a.evaluation.temperature,
      temperatureReasons: a.evaluation.temperatureReasons,
      flags: a.flags,
      complianceFlags: a.complianceFlags,
      assignedDesigner: assigned,
      needsFollowup: a.needsFollowup,
      followupReason: a.followupReason,
      linkedCallIds: [...new Set([...(call.linkedCallIds ?? []), ...linked])],
      updatedAt: new Date(),
    })
    .where(eq(schema.calls.id, call.id))
    .returning();

  // 10. Route.
  if (a.evaluation.outcome === "qualified") {
    await enqueue("designer_email", call.id, `designer_email:${call.id}`);
    await enqueue("hubspot_sync", call.id, `hubspot:${call.id}:initial`);
  }
  if (a.evaluation.decidedBy === "existing_client_issue") {
    await enqueue("escalation_email", call.id, `escalation:${call.id}`);
  }
  if (a.callType === "followup_update") {
    await enqueue("client_request_email", call.id, `client_request:${call.id}`);
  }
  if (a.complianceFlags.some((f) => f.code === "price_leak")) {
    await enqueue("price_leak_alert", call.id, `price_leak:${call.id}`);
  }
  if (opts.runJobs !== false) await runDueJobs(d, { callId: call.id });
  return updated;
}
