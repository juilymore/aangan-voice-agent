// Summary and designer brief — build_spec §8.8. Built deterministically from VERIFIED facts only,
// so nothing can be invented: anything not said is "Not stated".
import type { Evaluation } from "@/lib/rules/types";
import type { DesignerBrief, ExtractedCall, KeyFact } from "@/lib/types/call-json";

export const FLAG_WORDS: Record<string, string> = {
  frustrated: "Caller was frustrated: handle with care",
  price_asked: "Asked about price (deflected, no figure given)",
  budget_tight: "Volunteered budget is on the low side for this scope",
  tight_timeline: "Tight deadline",
  late_start: "Wants to start several months out",
  structural_request: "Wants structural work (walls); discuss what's possible",
  conflict: "Booked on the call but post-call review disagrees: check before the meeting",
  later_start_not_offered: "A later finish date was not offered on the call",
  repeat_caller: "Called before",
  prefers_human: "Prefers a human",
  refused_questions: "Didn't want to answer questions",
  extraction_failed: "Automatic reading failed: see transcript",
  unsupported_extraction: "Some details could not be verified from the transcript",
};

type BriefInput = {
  extracted: ExtractedCall;
  evaluation: Evaluation;
  meeting: DesignerBrief["meeting"];
  flags: string[];
};

const S = (x: ExtractedCall, k: keyof ExtractedCall["fields"]) => {
  const v = x.fields[k]?.value;
  return v == null || v === "" ? null : String(v);
};

function sizeText(x: ExtractedCall): string | null {
  const bhk = S(x, "bhk");
  const sqft = S(x, "size_sqft");
  const parts = [bhk ? `${bhk}BHK` : null, sqft ? `${Number(sqft).toLocaleString("en-IN")} sq ft` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

const SCOPE_WORDS: Record<string, string> = {
  full_home: "full redesign",
  partial: "partial redesign",
  single_room: "single-room redesign",
};

export function buildBrief({ extracted: x, evaluation: e, meeting, flags }: BriefInput): DesignerBrief {
  const name = S(x, "caller_name") ?? "Caller";
  const where = [S(x, "society"), S(x, "locality")].filter(Boolean).join(", ");
  const kind = S(x, "property_kind") === "commercial" ? "office" : null;
  const scope = SCOPE_WORDS[S(x, "scope") ?? ""] ?? null;
  const referral = S(x, "referral_source");

  const oneLiner =
    [
      name,
      [sizeText(x), kind].filter(Boolean).join(" ") || null,
      where || null,
      scope,
      referral ? `Referred by ${referral}` : null,
    ]
      .filter(Boolean)
      .join(" · ") + ".";

  const fact = (label: string, k: keyof ExtractedCall["fields"], fmt?: (v: string) => string): KeyFact | null => {
    const f = x.fields[k];
    if (!f) return null;
    return { label, value: fmt ? fmt(String(f.value)) : String(f.value), evidence: f.evidence };
  };
  const keyFacts = [
    fact("Location", "locality"),
    fact("Society / building", "society"),
    fact("Size", "bhk", (v) => `${v}BHK`),
    fact("Carpet area", "size_sqft", (v) => `${Number(v).toLocaleString("en-IN")} sq ft`),
    fact("Property now", "property_state"),
    fact("Scope", "scope", (v) => SCOPE_WORDS[v] ?? v),
    fact("Rooms", "rooms_count"),
    fact("Timing", "timeline_text"),
    fact("Referral", "referral_source"),
    fact("Preferred meeting", "consultation_mode", (v) => (v === "site_visit" ? "Site visit" : v === "phone_call" ? "Phone call" : v)),
  ].filter((f): f is KeyFact => f != null);

  const warningBits = [
    flags.includes("prefers_human") ? "Caller prefers to speak to a person" : null,
    flags.includes("refused_questions") ? "Caller didn't want to answer questions" : null,
    S(x, "tone") === "angry" ? "Caller was angry" : flags.includes("frustrated") ? "Caller was frustrated" : null,
  ].filter(Boolean);

  const dm = S(x, "decision_maker");
  const decisionMakerNote =
    dm === "self"
      ? "Caller is the decision-maker."
      : dm === "authorised"
        ? "Calling on behalf of someone who has authorised them."
        : dm === "others_decide_attending"
          ? "Others decide; they will attend the consultation."
          : dm === "research_only"
            ? "Only researching for someone else: confirm who decides."
            : "Not stated.";

  const verdict = e.perCriterion.map((c) => ({ criterion: c.criterion, status: c.status, reason: c.reason }));
  const firstName = name.split(/\s+/)[0];
  const openingContext = referral
    ? `${referral} sent you our way`
    : where
      ? `you're planning work on your home in ${S(x, "locality")}`
      : "you called the studio";

  return {
    warning: warningBits.length ? warningBits.join(". ") + "." : null,
    oneLiner,
    keyFacts,
    verdict,
    budgetSignal: S(x, "budget_text") ?? "Not stated",
    decisionMakerNote,
    flags: flags.map((f) => FLAG_WORDS[f] ?? f),
    followUpQuestions: e.followUpQuestions.slice(0, 5),
    suggestedOpeningLine: `Hi ${firstName}, this is your designer from Aangan Studio. I understand ${openingContext}, so I've got everything you shared; I'd love to hear a bit more.`,
    meeting,
  };
}

export function buildSummary(x: ExtractedCall, e: Evaluation, booked: boolean): string {
  const name = S(x, "caller_name") ?? "The caller";
  const what = [sizeText(x), S(x, "property_kind") === "commercial" ? "office" : "home", S(x, "locality") ? `in ${S(x, "locality")}` : null]
    .filter(Boolean)
    .join(" ");
  const scopeWords = SCOPE_WORDS[S(x, "scope") ?? ""];
  const scope = scopeWords ? `a ${scopeWords}` : "interior work";
  const when = S(x, "timeline_text");
  const verdictLine: Record<Evaluation["outcome"], string> = {
    qualified: booked ? "A consultation was booked on the call." : "Qualified but not yet booked: a designer should call back.",
    not_qualified: `Not a fit right now (${e.decidedBy.replace(/_/g, " ")}).`,
    needs_review: "Needs a designer's review before deciding.",
    not_a_lead: "Not a new enquiry.",
  };
  if (e.outcome === "not_a_lead") {
    const details = S(x, "existing_client_details");
    return `${name} called${details ? ` about: ${details}` : ""}. ${verdictLine.not_a_lead}`;
  }
  return `${name} wants ${scope} for a ${what}.${when ? ` Timing: ${when}.` : ""} ${verdictLine[e.outcome]}`;
}
