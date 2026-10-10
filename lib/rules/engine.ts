// The rule engine — one pure function used by check_fit (mid-call) and the post-call pipeline.
// Rules: docs/functional_design.md §7.3–§7.7. No I/O, no AI, no randomness.
import {
  AREA_FAIL_TERMS,
  AREA_PASS_TERMS,
  COMMERCIAL_MAX_SQFT,
  COMMERCIAL_MIN_SQFT,
  HOT_MIN_SCORE,
  LATE_START_DAYS,
  MIN_WEEKS_TO_COMPLETION,
  SOON_DAYS,
  TEMPERATURE_POINTS as P,
  TIGHT_TIMELINE_WEEKS,
  WARM_MIN_SCORE,
} from "@/config/rules";
import { checkBudget } from "./budget";
import {
  RuleInput,
  type CallAction,
  type CriterionResult,
  type Evaluation,
  type RuleInputDraft,
  type Temperature,
} from "./types";

const DAY = 86_400_000;
const NON_EXECUTION_INTENTS = new Set(["advice_only", "decor_only", "furniture_only", "vastu_only", "structural_only"]);

export function matchArea(locality: string | null): "pass" | "fail" | "unclear" {
  if (!locality) return "unclear";
  const s = ` ${locality.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
  if (AREA_FAIL_TERMS.some((t) => s.includes(` ${t}`))) return "fail";
  if (AREA_PASS_TERMS.some((t) => s.includes(` ${t}`))) return "pass";
  return "unclear";
}

function realProject(i: RuleInput): CriterionResult {
  const source = "qualified.md §1; services.md 'minimum engagement is a room redesign with execution'";
  if (NON_EXECUTION_INTENTS.has(i.intent)) {
    return { criterion: "real_project", status: "fail", reason: `Wants ${i.intent.replace("_", " ")}, not design with execution`, source };
  }
  if (i.intent === "full_execution") {
    return { criterion: "real_project", status: "pass", reason: "Wants design and execution", source };
  }
  return { criterion: "real_project", status: "unclear", reason: "Scope or execution intent not stated", source };
}

function serviceArea(i: RuleInput): CriterionResult {
  const source = "qualified.md §2; services.md service area";
  const m = matchArea(i.locality);
  const where = i.locality ?? "not given";
  if (m === "fail") return { criterion: "service_area", status: "fail", reason: `Outside Pune/PCMC (${where})`, source };
  if (m === "pass") return { criterion: "service_area", status: "pass", reason: `In service area (${where})`, source };
  return { criterion: "service_area", status: "unclear", reason: `Locality not recognised (${where})`, source };
}

function timeline(i: RuleInput, flags: string[], followUps: string[]): CriterionResult {
  const source = "qualified.md §3; services.md minimum lead time; functional_design Q2";
  if (i.startInDays != null && i.startInDays >= LATE_START_DAYS) flags.push("late_start");
  if (!i.completionBy) {
    followUps.push("When would they need the project complete?");
    return { criterion: "timeline", status: "pass", reason: "No deadline given (no impossible deadline)", source };
  }
  const weeks = (i.completionBy.getTime() - i.today.getTime()) / (7 * DAY);
  if (weeks < MIN_WEEKS_TO_COMPLETION) {
    return { criterion: "timeline", status: "fail", reason: "Needs completion sooner than design and execution can take", source };
  }
  if (weeks < TIGHT_TIMELINE_WEEKS) flags.push("tight_timeline");
  return { criterion: "timeline", status: "pass", reason: "Deadline leaves enough time", source };
}

function decisionMaker(i: RuleInput, followUps: string[]): CriterionResult {
  const source = "qualified.md §5 and 'Unclear on 4 or 5: do not push'";
  switch (i.decisionMaker) {
    case "self":
      return { criterion: "decision_maker", status: "pass", reason: "Caller decides", source };
    case "authorised":
      return { criterion: "decision_maker", status: "pass", reason: "Caller is authorised to go ahead", source };
    case "others_decide_attending":
      return { criterion: "decision_maker", status: "pass", reason: "Others decide but will attend the consultation", source };
    case "research_only":
      return { criterion: "decision_maker", status: "fail", reason: "Only researching for others; owners not involved", source };
    default:
      followUps.push("Who else is involved in the decision?");
      return { criterion: "decision_maker", status: "unclear", reason: "Not discussed (not pushed)", source };
  }
}

function temperatureOf(i: RuleInput, outcome: Evaluation["outcome"]): { t: Temperature; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const add = (cond: boolean, pts: number, why: string) => {
    if (cond) {
      score += pts;
      reasons.push(`${pts > 0 ? "+" : ""}${pts} ${why}`);
    }
  };
  add(i.consultIntent, P.consultIntent, "wants a consultation");
  add(i.referral, P.referral, "referred");
  add(i.urgent || (i.startInDays != null && i.startInDays <= SOON_DAYS), P.soon, "wants to start soon");
  add(i.commitment, P.commitment, "clear commitment");
  add(i.scope !== "unknown" && (i.sizeSqft != null || i.bhk != null), P.clearScopeAndSize, "clear scope and size");
  add(i.exploring, P.exploring, "just exploring");
  add(i.priceOnly, P.priceOnly, "price-only enquiry");
  add(i.noRushToDecide, P.noRushToDecide, "no rush to decide");

  if (outcome === "not_qualified" || outcome === "not_a_lead") {
    return { t: "cold", score, reasons: [...reasons, "cold because not a qualified lead"] };
  }
  const t: Temperature = score >= HOT_MIN_SCORE ? "hot" : score >= WARM_MIN_SCORE ? "warm" : "cold";
  return { t, score, reasons };
}

export function evaluate(draft: RuleInputDraft): Evaluation {
  const i = RuleInput.parse(draft);
  const flags: string[] = [];
  const followUps: string[] = [];

  if (i.frustrated) flags.push("frustrated");
  if (i.priceAsked) flags.push("price_asked");
  if (i.structuralRequest) flags.push("structural_request");

  const budget = checkBudget(i);
  if (budget.tight) flags.push("budget_tight");

  const perCriterion: CriterionResult[] = [
    realProject(i),
    serviceArea(i),
    timeline(i, flags, followUps),
    { criterion: "budget", status: budget.status, reason: budget.reason, source: "qualified.md §4; pricing.md (server only)" },
    decisionMaker(i, followUps),
  ];
  const by = (c: CriterionResult["criterion"]) => perCriterion.find((r) => r.criterion === c)!;
  if (by("real_project").status === "unclear") followUps.unshift("Do they want design with execution, and which rooms?");
  if (by("service_area").status === "unclear") followUps.unshift("Where exactly is the property?");

  // Hard exclusions (functional_design §7.4)
  let exclusion: Evaluation["exclusion"] = null;
  if (i.excludedUse) {
    exclusion = { code: "excluded_type", reason: `${i.excludedUse} projects are out of scope` };
  } else if (i.propertyKind === "commercial" && i.sizeSqft != null && i.sizeSqft < COMMERCIAL_MIN_SQFT) {
    exclusion = { code: "commercial_too_small", reason: "Commercial space below the studio's minimum scale" };
  } else if (i.propertyKind === "commercial" && i.sizeSqft != null && i.sizeSqft > COMMERCIAL_MAX_SQFT) {
    exclusion = { code: "commercial_too_large", reason: "Commercial space above the usual maximum; designer to decide" };
  }

  // Combine (functional_design §7.5)
  let outcome: Evaluation["outcome"];
  let decidedBy: string;
  const firstFail = perCriterion.find((r) => r.status === "fail" && r.criterion !== "decision_maker");
  if (i.callType !== "new_enquiry") {
    outcome = "not_a_lead";
    decidedBy = i.callType;
  } else if (exclusion && exclusion.code !== "commercial_too_large") {
    outcome = "not_qualified";
    decidedBy = exclusion.code;
  } else if (firstFail) {
    outcome = "not_qualified";
    decidedBy = firstFail.criterion;
  } else if (by("decision_maker").status === "fail") {
    outcome = "needs_review";
    decidedBy = "decision_maker";
  } else if (by("real_project").status === "unclear" || by("service_area").status === "unclear") {
    outcome = "needs_review";
    decidedBy = by("real_project").status === "unclear" ? "real_project" : "service_area";
  } else if (exclusion?.code === "commercial_too_large") {
    outcome = "needs_review";
    decidedBy = exclusion.code;
  } else {
    outcome = "qualified";
    decidedBy = "all_pass";
  }

  if (i.bookedOnCall && outcome === "not_qualified") {
    // A booking already exists: never auto-cancel; a designer decides (§7.5).
    flags.push("conflict");
    outcome = "needs_review";
  }
  if (outcome === "not_qualified" && by("timeline").status === "fail" && !i.laterDateOffered) {
    flags.push("later_start_not_offered");
  }

  const temp = temperatureOf(i, outcome);
  return {
    outcome,
    decidedBy,
    perCriterion,
    exclusion,
    flags,
    followUpQuestions: followUps.slice(0, 5),
    temperature: temp.t,
    temperatureScore: temp.score,
    temperatureReasons: temp.reasons,
    callAction: callActionFor(i, perCriterion, exclusion),
  };
}

/**
 * Mid-call decision (functional_design FR-6, §7.5). Declines only on clear FAILs; unknowns clarify;
 * a short deadline first gets a "later date?" question. Clarify limits are enforced by check_fit.
 */
function callActionFor(i: RuleInput, r: CriterionResult[], exclusion: Evaluation["exclusion"]): CallAction {
  const s = (c: CriterionResult["criterion"]) => r.find((x) => x.criterion === c)!.status;
  if (i.callType !== "new_enquiry") return { decision: "proceed" };
  if (exclusion?.code === "excluded_type") return { decision: "decline", code: "excluded_type" };
  if (exclusion?.code === "commercial_too_small") return { decision: "decline", code: "commercial_too_small" };
  if (s("service_area") === "fail") return { decision: "decline", code: "area" };
  if (s("real_project") === "fail") return { decision: "decline", code: "scope" };
  if (s("timeline") === "fail") {
    return i.laterDateOffered ? { decision: "decline", code: "timeline" } : { decision: "clarify", code: "timeline_later" };
  }
  if (s("budget") === "fail") return { decision: "decline", code: "budget" };
  if (s("real_project") === "unclear") return { decision: "clarify", code: "scope" };
  if (s("service_area") === "unclear") return { decision: "clarify", code: "area" };
  return { decision: "proceed" };
}
