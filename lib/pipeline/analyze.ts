// Pure analysis of one finished call: redact → extract (with evidence) → rules → temperature →
// compliance → brief. No database access; the caller persists the result (lib/pipeline/process.ts).
import type { TranscriptTurn } from "@/db/schema";
import type { LlmProvider } from "@/lib/ai/types";
import { evaluate } from "@/lib/rules/engine";
import type { Evaluation } from "@/lib/rules/types";
import type { ComplianceFlag, DesignerBrief, ExtractedCall, QualificationReasons } from "@/lib/types/call-json";
import { buildBrief, buildSummary } from "./brief";
import { scanCompliance } from "./compliance";
import { extractFacts } from "./extract";
import { redactTranscript } from "./redact";
import { toRuleInput } from "./to-rule-input";

export type AnalyzeInput = {
  transcript: TranscriptTurn[];
  startedAt: Date;
  durationSec: number | null;
  dropped: boolean;
  bookingSucceeded: boolean;
  meeting: DesignerBrief["meeting"];
  checkDisclosure?: boolean;
  extraFlags?: string[]; // e.g. repeat_caller, from linking
};

export type Analysis = {
  callType: string;
  callerName: string | null;
  language: string | null;
  extracted: ExtractedCall;
  evaluation: Evaluation;
  qualificationReasons: QualificationReasons;
  flags: string[];
  complianceFlags: ComplianceFlag[];
  summary: string;
  brief: DesignerBrief;
  needsFollowup: boolean;
  followupReason: string | null;
};

const IST_DATE = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export async function analyzeCall(input: AnalyzeInput, llm: LlmProvider): Promise<Analysis> {
  const callerTurns = input.transcript.filter((t) => t.role === "caller" && t.text.trim().length > 0);
  const incomplete =
    callerTurns.length === 0 || (input.dropped && (callerTurns.length < 2 || (input.durationSec ?? 0) < 90));

  const flags = [...(input.extraFlags ?? [])];
  let extracted: ExtractedCall = { fields: {}, unsupported: [] };
  if (!incomplete) {
    const r = await extractFacts(llm, redactTranscript(input.transcript), IST_DATE(input.startedAt));
    if (r.ok) extracted = r.extracted;
    else flags.push("extraction_failed");
  }
  if (extracted.unsupported.length) flags.push("unsupported_extraction");

  const ruleInput = toRuleInput(extracted, {
    today: new Date(`${IST_DATE(input.startedAt)}T00:00:00+05:30`),
    bookedOnCall: input.bookingSucceeded,
    incomplete,
  });
  let evaluation = evaluate(ruleInput);
  if (flags.includes("extraction_failed") && evaluation.outcome !== "not_a_lead") {
    evaluation = { ...evaluation, outcome: "needs_review", decidedBy: "extraction_failed" };
  }

  const fv = (k: keyof ExtractedCall["fields"]) => extracted.fields[k]?.value;
  if (fv("prefers_human") === true) flags.push("prefers_human");
  if (fv("refused_questions") === true) flags.push("refused_questions");
  for (const f of evaluation.flags) if (!flags.includes(f)) flags.push(f);

  const complianceFlags = scanCompliance({
    transcript: input.transcript,
    bookingSucceeded: input.bookingSucceeded,
    checkDisclosure: input.checkDisclosure,
  });

  const followupReason = followUpReason(evaluation, flags, input.bookingSucceeded, fv("reschedule_request") === true);
  const brief = buildBrief({ extracted, evaluation, meeting: input.meeting, flags });

  return {
    callType: evaluation.outcome === "not_a_lead" ? ruleInput.callType ?? "new_enquiry" : "new_enquiry",
    callerName: (fv("caller_name") as string | undefined) ?? null,
    language: (fv("language") as string | undefined) ?? null,
    extracted,
    evaluation,
    qualificationReasons: { decidedBy: evaluation.decidedBy, perCriterion: evaluation.perCriterion, exclusion: evaluation.exclusion },
    flags,
    complianceFlags,
    summary: buildSummary(extracted, evaluation, input.bookingSucceeded),
    brief,
    needsFollowup: followupReason != null,
    followupReason,
  };
}

/** build_spec §8.10: prefers_human, incomplete, needs_review, qualified-not-booked, reschedule, conflict. */
function followUpReason(e: Evaluation, flags: string[], booked: boolean, reschedule: boolean): string | null {
  if (e.decidedBy === "existing_client_issue") return "Existing client issue: senior call-back";
  if (e.decidedBy === "incomplete") return "Call dropped: call back";
  if (reschedule || e.decidedBy === "reschedule_request") return "Reschedule request";
  if (flags.includes("prefers_human")) return "Prefers a human: call back";
  if (flags.includes("conflict")) return "Booking conflict: check before the meeting";
  if (e.outcome === "needs_review") return "Needs review";
  if (e.outcome === "qualified" && !booked) return "Qualified, not booked: call to schedule";
  if (e.outcome === "not_qualified" && e.decidedBy === "timeline") return "Offered a later start: follow up";
  return null;
}
