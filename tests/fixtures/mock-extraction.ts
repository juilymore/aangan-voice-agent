// Mock LLM output for the 40 September enquiries: what a correct extraction would return, with
// verbatim quotes. Used by the fixture tests and the demo seed (no real AI calls).
import type { Fixture } from "./sep2026";

export const NAMES: Record<string, string> = {
  T01: "Priya", T03: "Suresh Patil", T05: "Aarti Mehta", T09: "Sheetal Deshpande", T12: "Anand Sharma",
  T15: "Smita", T16: "Girish Nair", T17: "Ritu Kapoor", T20: "Pooja",
  W01: "Kiran Mazumdar", W03: "Sunil Yadav", W04: "Chinmay Kulkarni", W05: "Meena Joshi", W06: "Tanvi Kulkarni",
  W07: "Rohit Singh", W08: "Pradeep Garg", W09: "Neha Deshpande", W10: "Vivek Rao",
  F01: "Sumit Bhatt", F02: "Laleh Contractor", F03: "Nilesh Dhamdhere", F04: "Rajesh", F05: "Sheena Menon",
  F06: "Preethi Nair", F08: "Divya Hegde", F09: "Amol Patil", F10: "Siddharth Gupta",
};

type Field = { value: string; quote: string } | null;

export function mockExtractionJson(f: Fixture): string {
  const i = f.input;
  const q = f.evidence;
  const fields: Record<string, Field> = {};
  const set = (k: string, v: unknown, quote = q) => {
    if (v === undefined || v === null || v === false || v === "unknown") return;
    fields[k] = { value: String(v), quote };
  };
  const day = (d: unknown) => (d ? new Date(String(d)).toISOString().slice(0, 10) : null);

  if (NAMES[f.id]) set("caller_name", NAMES[f.id], NAMES[f.id]);
  set("call_type", i.callType ?? "new_enquiry");
  set("property_kind", i.propertyKind);
  set("excluded_use", i.excludedUse);
  set("locality", i.locality);
  set("size_sqft", i.sizeSqft);
  set("bhk", i.bhk);
  set("scope", i.scope);
  set("rooms_count", i.roomsCount);
  set("intent", i.intent);
  set("completion_by", day(i.completionBy));
  if (i.startInDays != null) set("start_in_days", i.startInDays);
  set("decision_maker", i.decisionMaker);
  if (i.referral) set("referral_source", "a referral");
  if (i.budgetMaxInr) {
    set("budget_max_inr", i.budgetMaxInr);
    set("budget_text", `up to ₹${(i.budgetMaxInr / 100000).toLocaleString("en-IN")} lakh`);
  } else if (i.budgetMentioned) set("budget_text", "mentioned, no figure");
  set("language", f.id === "W03" ? "hi" : "en");
  if (i.frustrated) set("tone", "frustrated");
  set("price_asked", i.priceAsked);
  set("structural_request", i.structuralRequest);
  set("consult_intent", i.consultIntent);
  set("urgent", i.urgent);
  set("commitment", i.commitment);
  set("exploring", i.exploring);
  set("price_only", i.priceOnly);
  set("no_rush_to_decide", i.noRushToDecide);
  if (i.callType === "existing_client_issue") set("existing_client_details", "Designer Aryan; no reply in five days on a Viman Nagar 2BHK");
  return JSON.stringify({ fields });
}
