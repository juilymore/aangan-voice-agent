import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { evaluate } from "@/lib/rules/engine";
import { getRuleSettings, saveSettings } from "@/lib/rules/settings";
import type { RuleSettings } from "@/lib/rules/settings-schema";
import { toRuleInput } from "@/lib/pipeline/to-rule-input";
import { buildBrief, buildSummary } from "@/lib/pipeline/brief";
import { onCallChanged } from "@/lib/sync/hooks";
import type { ExtractField, Fact } from "@/lib/types/call-json";

// "Teach the AI". Decisions are made by the rule engine (code), not by the AI, so learning works in
// two honest ways:
//  1. Fact corrections ("it heard Kharadi as Karadi") are fed to the extraction prompt as examples,
//     so Gemini reads similar calls better next time.
//  2. Verdict/temperature corrections produce a SUGGESTED rubric change (e.g. "add Wagholi to the
//     service area") that Nikhil applies with one click on the Rubric tab. Nothing changes silently.

export type Suggestion =
  | { type: "add_area_pass"; term: string; label: string }
  | { type: "add_area_fail"; term: string; label: string }
  | { type: "set_rule"; field: keyof RuleSettings; to: number; label: string }
  | { type: "extraction_hint"; label: string }
  | { type: "none"; label: string };

type CallRow = typeof schema.calls.$inferSelect;

function areaTerm(locality: string | null | undefined): string | null {
  if (!locality) return null;
  const first = locality.split(",")[0].trim().toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");
  return first.length >= 3 ? first : null;
}

function suggestFor(call: CallRow, kind: string, field: string, ai: unknown, human: unknown, s: RuleSettings): Suggestion {
  const decidedBy = call.qualificationReasons?.decidedBy;
  const locality = call.extracted?.fields.locality?.value as string | undefined;
  if (kind === "fact") return { type: "extraction_hint", label: "Shown to the AI as an example when it reads future calls" };

  if (kind === "qualification") {
    if (human === "qualified" && ai !== "qualified") {
      if (decidedBy === "service_area" && areaTerm(locality)) {
        const t = areaTerm(locality)!;
        return { type: "add_area_pass", term: t, label: `Add “${t}” to the service area` };
      }
      if (decidedBy === "budget") {
        const to = Math.max(0.1, Math.round((s.budgetFailRatio - 0.1) * 10) / 10);
        return { type: "set_rule", field: "budgetFailRatio", to, label: `Be gentler on low budgets (fail below ${Math.round(to * 100)}% of the floor instead of ${Math.round(s.budgetFailRatio * 100)}%)` };
      }
      if (decidedBy === "timeline") {
        const to = Math.max(1, s.minWeeksToCompletion - 1);
        return { type: "set_rule", field: "minWeeksToCompletion", to, label: `Accept deadlines from ${to} weeks (now ${s.minWeeksToCompletion})` };
      }
      if (decidedBy === "commercial_too_small") {
        const size = Number(call.extracted?.fields.size_sqft?.value ?? 0);
        if (size > 0) return { type: "set_rule", field: "commercialMinSqft", to: size, label: `Accept offices from ${size} sq ft (now ${s.commercialMinSqft})` };
      }
    }
    if (human === "not_qualified" && ai === "qualified" && areaTerm(locality)) {
      const t = areaTerm(locality)!;
      return { type: "add_area_fail", term: t, label: `Treat “${t}” as outside the service area` };
    }
    return { type: "none", label: "Noted for review (no automatic rule change fits)" };
  }

  if (kind === "temperature") {
    const order = { cold: 0, warm: 1, hot: 2 } as Record<string, number>;
    if (order[String(human)] > order[String(ai)] && human === "hot") {
      return { type: "set_rule", field: "hotMinScore", to: s.hotMinScore - 1, label: `Call leads “hot” from score ${s.hotMinScore - 1} (now ${s.hotMinScore})` };
    }
    if (order[String(human)] < order[String(ai)] && ai === "hot") {
      return { type: "set_rule", field: "hotMinScore", to: s.hotMinScore + 1, label: `Call leads “hot” only from score ${s.hotMinScore + 1} (now ${s.hotMinScore})` };
    }
    return { type: "none", label: "Noted for review" };
  }
  return { type: "none", label: "Noted" };
}

/** Records a "Teach the AI" correction and returns the suggested rubric change. */
export async function recordCorrection(args: {
  callId: string;
  kind: "qualification" | "temperature" | "fact";
  field: string;
  aiValue: unknown;
  humanValue: unknown;
  reason?: string | null;
  actor: string;
}): Promise<{ id: string; suggestion: Suggestion }> {
  const [call] = await db().select().from(schema.calls).where(eq(schema.calls.id, args.callId));
  if (!call) throw new Error("call not found");
  const s = await getRuleSettings();
  const suggestion = suggestFor(call, args.kind, args.field, args.aiValue, args.humanValue, s);
  const f = call.extracted?.fields[args.field as ExtractField];
  const [row] = await db()
    .insert(schema.aiCorrections)
    .values({
      callId: call.id,
      kind: args.kind,
      field: args.field,
      aiValue: args.aiValue as object,
      humanValue: args.humanValue as object,
      reason: args.reason ?? null,
      context: {
        callerName: call.callerName,
        decidedBy: call.qualificationReasons?.decidedBy ?? null,
        locality: call.extracted?.fields.locality?.value ?? null,
        quote: f?.evidence.quote ?? null,
        temperatureReasons: call.temperatureReasons ?? [],
      },
      suggestion,
      status: suggestion.type === "extraction_hint" ? "applied" : "open",
      createdBy: args.actor,
    })
    .returning({ id: schema.aiCorrections.id });
  return { id: row.id, suggestion };
}

export async function listCorrections(status?: "open" | "applied" | "dismissed", limit = 50) {
  return db()
    .select()
    .from(schema.aiCorrections)
    .where(status ? eq(schema.aiCorrections.status, status) : undefined)
    .orderBy(desc(schema.aiCorrections.createdAt))
    .limit(limit);
}

export async function dismissCorrection(id: string, actor: string) {
  await db().update(schema.aiCorrections).set({ status: "dismissed", resolvedBy: actor, resolvedAt: new Date() }).where(eq(schema.aiCorrections.id, id));
}

/** Applies a correction's suggested rubric change (owner only; enforced by the caller). */
export async function applySuggestion(id: string, actor: string): Promise<{ ok: boolean; message: string }> {
  const [c] = await db().select().from(schema.aiCorrections).where(eq(schema.aiCorrections.id, id));
  if (!c) return { ok: false, message: "Correction not found" };
  const sug = c.suggestion as Suggestion | null;
  const s = await getRuleSettings();
  let res: Awaited<ReturnType<typeof saveSettings>> = { ok: true };
  if (sug?.type === "add_area_pass") {
    res = await saveSettings(
      "rules",
      { areaPassTerms: [...new Set([...s.areaPassTerms, sug.term])], areaFailTerms: s.areaFailTerms.filter((t) => t !== sug.term) },
      actor,
      `Learned from a correction: ${sug.label}`,
    );
  } else if (sug?.type === "add_area_fail") {
    res = await saveSettings(
      "rules",
      { areaFailTerms: [...new Set([...s.areaFailTerms, sug.term])], areaPassTerms: s.areaPassTerms.filter((t) => t !== sug.term) },
      actor,
      `Learned from a correction: ${sug.label}`,
    );
  } else if (sug?.type === "set_rule") {
    res = await saveSettings("rules", { [sug.field]: sug.to }, actor, `Learned from a correction: ${sug.label}`);
  } else {
    return { ok: false, message: "Nothing to apply for this correction" };
  }
  if (!res.ok) return { ok: false, message: res.errors.join("; ") };
  await db().update(schema.aiCorrections).set({ status: "applied", resolvedBy: actor, resolvedAt: new Date() }).where(eq(schema.aiCorrections.id, id));
  return { ok: true, message: sug.label };
}

/** Recent fact corrections, phrased as hints for the extraction prompt. */
export async function extractionHints(limit = 8): Promise<string[]> {
  try {
    const rows = await db()
      .select()
      .from(schema.aiCorrections)
      .where(and(eq(schema.aiCorrections.kind, "fact"), inArray(schema.aiCorrections.status, ["open", "applied"])))
      .orderBy(desc(schema.aiCorrections.createdAt))
      .limit(limit);
    return rows.map((r) => {
      const quote = (r.context as { quote?: string } | null)?.quote;
      return `${r.field}: it was read as ${JSON.stringify(r.aiValue)} but the correct value was ${JSON.stringify(r.humanValue)}${quote ? ` (the caller said: "${quote}")` : ""}${r.reason ? `. Note: ${r.reason}` : ""}`;
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Re-evaluation (no AI call): re-run the rule engine on the stored, verified facts.

async function hasManualOverride(callId: string, field: "qualification" | "temperature") {
  const r = await db()
    .select({ id: schema.callAudit.id })
    .from(schema.callAudit)
    .where(and(eq(schema.callAudit.callId, callId), eq(schema.callAudit.field, field)))
    .limit(1);
  return r.length > 0;
}

export async function reevaluateCall(callId: string, s?: RuleSettings) {
  const settings = s ?? (await getRuleSettings());
  const [call] = await db().select().from(schema.calls).where(eq(schema.calls.id, callId));
  if (!call?.extracted || !call.startedAt) return { changed: false };
  const [booking] = await db()
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.vaaniCallId, call.vaaniCallId), eq(schema.bookings.status, "confirmed")))
    .limit(1);
  const istDay = new Date(call.startedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const e = evaluate(
    toRuleInput(call.extracted, { today: new Date(`${istDay}T00:00:00+05:30`), bookedOnCall: !!booking, incomplete: call.callType === "incomplete" }),
    settings,
  );
  const keepQ = await hasManualOverride(call.id, "qualification");
  const keepT = await hasManualOverride(call.id, "temperature");
  const qualification = keepQ ? call.qualification : e.outcome;
  const temperature = keepT ? call.temperature : e.temperature;
  const keepFlags = (call.flags ?? []).filter((f) => ["repeat_caller", "after_hours", "prefers_human", "refused_questions", "unsupported_extraction"].includes(f));
  const flags = [...new Set([...keepFlags, ...e.flags])];
  const changed = qualification !== call.qualification || temperature !== call.temperature;
  const designers = await db().select().from(schema.designers);
  const meeting = booking
    ? { designer: booking.designer, designerName: designers.find((d) => d.key === booking.designer)?.name ?? booking.designer, startAt: booking.startAt.toISOString(), mode: booking.mode }
    : null;
  await db()
    .update(schema.calls)
    .set({
      qualification,
      temperature,
      qualificationReasons: keepQ ? call.qualificationReasons : { decidedBy: e.decidedBy, perCriterion: e.perCriterion, exclusion: e.exclusion },
      temperatureReasons: keepT ? call.temperatureReasons : e.temperatureReasons,
      flags,
      followUpQuestions: e.followUpQuestions,
      summary: buildSummary(call.extracted, e, !!booking),
      designerBrief: buildBrief({ extracted: call.extracted, evaluation: e, meeting, flags }),
      updatedAt: new Date(),
    })
    .where(eq(schema.calls.id, call.id));
  if (changed && !keepQ && qualification !== call.qualification) {
    await db().insert(schema.callAudit).values({ callId: call.id, actor: "Rubric update", field: "qualification", oldValue: call.qualification, newValue: qualification, reason: "Re-checked with the updated rubric" });
    if (!call.isTest) await onCallChanged(call.id, { kind: "qualification", from: call.qualification, to: qualification!, reason: "Re-checked with the updated rubric" }, "Rubric update");
  }
  return { changed, from: call.qualification, to: qualification };
}

/** Re-checks every processed call against the current rubric. Manual overrides are kept. */
export async function reevaluateAll() {
  const s = await getRuleSettings();
  const ids = await db().select({ id: schema.calls.id }).from(schema.calls).where(isNotNull(schema.calls.qualification));
  let changed = 0;
  for (const { id } of ids) if ((await reevaluateCall(id, s)).changed) changed++;
  return { checked: ids.length, changed };
}

/** A designer fixes a misread fact: saves it, records a correction (AI hint), and re-checks the call. */
export async function updateFact(callId: string, field: ExtractField, value: string | number | boolean, actor: string, reason?: string) {
  const [call] = await db().select().from(schema.calls).where(eq(schema.calls.id, callId));
  if (!call) throw new Error("call not found");
  const old = call.extracted?.fields[field]?.value ?? null;
  await recordCorrection({ callId, kind: "fact", field, aiValue: old, humanValue: value, reason, actor });
  const extracted = call.extracted ?? { fields: {}, unsupported: [] };
  extracted.fields[field] = { value, evidence: { quote: `Corrected by ${actor}`, turn: null } } as Fact;
  await db().update(schema.calls).set({ extracted, updatedAt: new Date() }).where(eq(schema.calls.id, callId));
  await db().insert(schema.callAudit).values({ callId, actor, field: `fact:${field}`, oldValue: old as unknown as object, newValue: value as unknown as object, reason: reason ?? null });
  return reevaluateCall(callId);
}
