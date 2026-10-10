// Maps verified extraction to the rule engine's normalised input.
import type { ExtractedCall } from "@/lib/types/call-json";
import { CallType, DecisionMaker, ExcludedUse, Intent, type RuleInputDraft } from "@/lib/rules/types";

type Ctx = { today: Date; bookedOnCall: boolean; incomplete: boolean };

export function toRuleInput(x: ExtractedCall, ctx: Ctx): RuleInputDraft {
  const v = <T = string>(k: keyof ExtractedCall["fields"]) => x.fields[k]?.value as T | undefined;
  const bool = (k: keyof ExtractedCall["fields"]) => v<boolean>(k) === true;
  const num = (k: keyof ExtractedCall["fields"]) => {
    const n = v<number>(k);
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  };
  const pick = <S extends { safeParse: (x: unknown) => { success: boolean; data?: unknown } }>(schema: S, k: keyof ExtractedCall["fields"]) => {
    const r = schema.safeParse(String(v(k) ?? "").toLowerCase().trim());
    return r.success ? r.data : undefined;
  };

  const callType = ctx.incomplete ? "incomplete" : ((pick(CallType, "call_type") as string | undefined) ?? "new_enquiry");
  const kind = String(v("property_kind") ?? "").toLowerCase();
  const scope = String(v("scope") ?? "").toLowerCase();
  const completion = v("completion_by");
  const startIn = v<number>("start_in_days");

  return {
    today: ctx.today,
    callType: callType as RuleInputDraft["callType"],
    propertyKind: kind.startsWith("comm") ? "commercial" : kind.startsWith("res") ? "residential" : "unknown",
    excludedUse: (pick(ExcludedUse, "excluded_use") as RuleInputDraft["excludedUse"]) ?? null,
    locality: (v("locality") as string | undefined) ?? null,
    sizeSqft: num("size_sqft"),
    bhk: num("bhk"),
    scope: scope === "full_home" || scope === "partial" || scope === "single_room" ? scope : "unknown",
    roomsCount: num("rooms_count"),
    // functional_design §7.3 row 1: naming rooms / a full home with no advice-only signal counts as a real project.
    intent:
      (pick(Intent, "intent") as RuleInputDraft["intent"]) ??
      (["full_home", "partial", "single_room"].includes(scope) || x.fields.rooms_count != null ? "full_execution" : "unclear"),
    completionBy: typeof completion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(completion) ? completion : null,
    startInDays: typeof startIn === "number" && Number.isFinite(startIn) ? Math.round(startIn) : null,
    decisionMaker: (pick(DecisionMaker, "decision_maker") as RuleInputDraft["decisionMaker"]) ?? "unknown",
    budgetMaxInr: num("budget_max_inr"),
    budgetMentioned: x.fields.budget_text != null || x.fields.budget_max_inr != null,
    structuralRequest: bool("structural_request"),
    consultIntent: bool("consult_intent") || ctx.bookedOnCall,
    referral: x.fields.referral_source != null,
    urgent: bool("urgent"),
    commitment: bool("commitment"),
    exploring: bool("exploring"),
    priceOnly: bool("price_only"),
    noRushToDecide: bool("no_rush_to_decide"),
    frustrated: ["frustrated", "angry"].includes(String(v("tone") ?? "").toLowerCase()),
    priceAsked: bool("price_asked"),
    bookedOnCall: ctx.bookedOnCall,
  };
}
