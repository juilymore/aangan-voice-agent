// Shapes of the JSON columns on `calls`. Shared by the pipeline (writer) and the dashboard (reader).

export type Evidence = { quote: string; turn: number | null };

/** One extracted fact. `evidence` is a verbatim quote that was verified to exist in the transcript. */
export type Fact<T = string | number | boolean> = { value: T; evidence: Evidence };

export type ExtractedCall = {
  fields: Partial<Record<ExtractField, Fact>>;
  /** Fields the model returned whose quote could not be found in the transcript (nulled). */
  unsupported: string[];
};

export const EXTRACT_FIELDS = [
  "caller_name",
  "call_type",
  "property_kind",
  "excluded_use",
  "locality",
  "society",
  "size_sqft",
  "bhk",
  "property_state",
  "scope",
  "rooms_count",
  "intent",
  "timeline_text",
  "completion_by",
  "start_in_days",
  "decision_maker",
  "referral_source",
  "consultation_mode",
  "budget_text",
  "budget_max_inr",
  "language",
  "tone",
  "prefers_human",
  "refused_questions",
  "recording_objection",
  "price_asked",
  "reschedule_request",
  "existing_client_details",
  "structural_request",
  "consult_intent",
  "urgent",
  "commitment",
  "exploring",
  "price_only",
  "no_rush_to_decide",
] as const;
export type ExtractField = (typeof EXTRACT_FIELDS)[number];

export type KeyFact = { label: string; value: string; evidence: Evidence | null };

export type DesignerBrief = {
  /** Shown first when the caller prefers a human, refused questions, or was frustrated/angry. */
  warning: string | null;
  oneLiner: string;
  keyFacts: KeyFact[];
  verdict: { criterion: string; status: "pass" | "fail" | "unclear"; reason: string }[];
  budgetSignal: string; // only what the caller said, else "Not stated"
  decisionMakerNote: string;
  flags: string[]; // plain words
  followUpQuestions: string[];
  suggestedOpeningLine: string;
  meeting: { designer: string; designerName: string; startAt: string; mode: "site_visit" | "phone_call" } | null;
};

export type QualificationReasons = {
  decidedBy: string;
  perCriterion: { criterion: string; status: "pass" | "fail" | "unclear"; reason: string; source: string }[];
  exclusion: { code: string; reason: string } | null;
  overriddenBy?: { actor: string; at: string; reason: string } | null;
};

export type ComplianceFlag = {
  code: "price_leak" | "missing_disclosure" | "asked_budget" | "false_booking_claim";
  severity: "critical" | "warning";
  turn: number | null;
  text: string;
};
