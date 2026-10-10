// Normalised input to the rule engine. Mid-call, check_fit maps the agent's free text to this;
// post-call, it comes from the Gemini extraction. The engine itself never reads raw text, except
// the locality, which is matched against the area lists.
import { z } from "zod";

export const CallType = z.enum([
  "new_enquiry",
  "existing_client_issue", // complaint / escalation
  "followup_update", // existing client asking for an update
  "reschedule_request",
  "vendor_other",
  "wrong_number",
  "incomplete",
]);

export const Intent = z.enum([
  "full_execution", // design + execution
  "advice_only", // ideas, suggestions, "come and advise", "I'll execute myself"
  "decor_only", // colours, styling, furniture arrangement
  "furniture_only", // standalone sourcing
  "vastu_only",
  "structural_only", // architecture / moving walls as the whole project
  "exploring", // "just exploring", no scope
  "unclear",
]);

export const ExcludedUse = z.enum(["restaurant", "hotel", "retail", "gym"]);

export const DecisionMaker = z.enum([
  "self", // caller decides (alone or with spouse who agrees)
  "authorised", // calling for someone who has authorised them
  "others_decide_attending", // others decide but will attend the consultation (T14)
  "research_only", // only researching; owners not involved
  "unknown",
]);

export const RuleInput = z.object({
  today: z.coerce.date(),
  callType: CallType.default("new_enquiry"),
  propertyKind: z.enum(["residential", "commercial", "unknown"]).default("unknown"),
  excludedUse: ExcludedUse.nullable().default(null),
  locality: z.string().nullable().default(null),
  sizeSqft: z.number().positive().nullable().default(null),
  bhk: z.number().int().positive().nullable().default(null),
  scope: z.enum(["full_home", "partial", "single_room", "unknown"]).default("unknown"),
  roomsCount: z.number().int().positive().nullable().default(null),
  intent: Intent.default("unclear"),
  /** Date the caller needs the project finished by, if they gave one. */
  completionBy: z.coerce.date().nullable().default(null),
  /** Days from today until the caller wants to START, if they said. */
  startInDays: z.number().int().nullable().default(null),
  /** True once the agent has offered a later finish date and the caller declined or deferred. */
  laterDateOffered: z.boolean().default(false),
  decisionMaker: DecisionMaker.default("unknown"),
  /** Upper end of a volunteered budget in rupees; null if none or not a number. */
  budgetMaxInr: z.number().positive().nullable().default(null),
  budgetMentioned: z.boolean().default(false),
  structuralRequest: z.boolean().default(false),

  // Temperature and priority signals (functional_design §7.7), each decidable from the transcript
  consultIntent: z.boolean().default(false),
  referral: z.boolean().default(false),
  urgent: z.boolean().default(false), // "now", "immediately", "as soon as possible", meeting within 7 days
  commitment: z.boolean().default(false),
  exploring: z.boolean().default(false),
  priceOnly: z.boolean().default(false),
  noRushToDecide: z.boolean().default(false),
  frustrated: z.boolean().default(false),
  priceAsked: z.boolean().default(false),
  bookedOnCall: z.boolean().default(false),
});
export type RuleInput = z.infer<typeof RuleInput>;
export type RuleInputDraft = z.input<typeof RuleInput>;

export type Criterion = "real_project" | "service_area" | "timeline" | "budget" | "decision_maker";
export type Status = "pass" | "fail" | "unclear";
export type Outcome = "qualified" | "not_qualified" | "needs_review" | "not_a_lead";
export type Temperature = "hot" | "warm" | "cold";

export type CriterionResult = { criterion: Criterion; status: Status; reason: string; source: string };

export type DeclineCode =
  | "area"
  | "scope"
  | "excluded_type"
  | "commercial_too_small"
  | "timeline"
  | "budget"
  | "generic";
export type ClarifyCode = "scope" | "area" | "timeline_later";

/** What the agent should do right now (mid-call), derived from the same evaluation. */
export type CallAction =
  | { decision: "proceed" }
  | { decision: "clarify"; code: ClarifyCode }
  | { decision: "decline"; code: DeclineCode };

export type Evaluation = {
  outcome: Outcome;
  decidedBy: string; // the criterion or exclusion that decided it, for reports
  perCriterion: CriterionResult[];
  exclusion: { code: "excluded_type" | "commercial_too_small" | "commercial_too_large"; reason: string } | null;
  flags: string[];
  followUpQuestions: string[];
  temperature: Temperature;
  temperatureScore: number;
  temperatureReasons: string[];
  callAction: CallAction;
};
