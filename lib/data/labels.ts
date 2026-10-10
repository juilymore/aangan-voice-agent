// Plain-word labels for the codes the pipeline stores. Pure: safe in server and client components.
import { humanize } from "./format";

export type Tone = "sage" | "terracotta" | "amber" | "slate" | "ink" | "alert";

export const QUALIFICATION_LABELS: Record<string, { label: string; tone: Tone }> = {
  qualified: { label: "Qualified", tone: "sage" },
  not_qualified: { label: "Not qualified", tone: "terracotta" },
  needs_review: { label: "Needs review", tone: "amber" },
  not_a_lead: { label: "Not a lead", tone: "slate" },
};

export const TEMPERATURE_LABELS: Record<string, { label: string; tone: Tone }> = {
  hot: { label: "Hot", tone: "terracotta" },
  warm: { label: "Warm", tone: "amber" },
  cold: { label: "Cold", tone: "slate" },
};

export const CALL_TYPE_LABELS: Record<string, string> = {
  new_enquiry: "New enquiry",
  existing_client_issue: "Existing client issue",
  reschedule_request: "Reschedule request",
  vendor_other: "Vendor / other",
  wrong_number: "Wrong number",
  incomplete: "Incomplete call",
};

export const OUTCOME_STAGE_LABELS: Record<string, string> = {
  none: "No outcome yet",
  consultation_done: "Consultation done",
  no_show: "No-show",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

export const FLAG_LABELS: Record<string, string> = {
  frustrated: "Caller frustrated",
  budget_tight: "Budget on the low side",
  tight_timeline: "Tight deadline",
  late_start: "Starts later",
  price_asked: "Asked about price",
  conflict: "Booking conflict",
  structural_request: "Wants structural work",
  later_start_not_offered: "Later date not offered",
  repeat_caller: "Called before",
  prefers_human: "Wants a person",
  vip_referral: "Referral close to Nikhil",
  language_hi: "Speaks Hindi",
  language_mr: "Speaks Marathi",
};

export const COMPLIANCE_LABELS: Record<string, string> = {
  price_leak: "Agent mentioned a price",
  missing_disclosure: "AI / recording disclosure missing",
  asked_budget: "Agent asked about budget",
  false_booking_claim: "Agent claimed a booking that failed",
};

export const FOLLOWUP_REASON_LABELS: Record<string, string> = {
  prefers_human: "Wants a person",
  incomplete: "Call dropped / incomplete",
  dropped: "Call dropped / incomplete",
  needs_review: "Needs review",
  qualified_not_booked: "Qualified, not booked",
  needs_scheduling: "Needs scheduling",
  reschedule_request: "Reschedule request",
  conflict: "Booking conflict",
  later_start_offered: "Later start offered",
  existing_client_issue: "Existing client issue",
  escalation: "Escalation",
};

export const CRITERION_LABELS: Record<string, string> = {
  real_project: "Real project",
  service_area: "Service area",
  timeline: "Realistic timeline",
  budget: "Budget band",
  decision_maker: "Decision-maker",
};

export const DECIDED_BY_LABELS: Record<string, string> = {
  all_pass: "All criteria passed",
  real_project: "Not a real project (advice only)",
  service_area: "Outside service area",
  timeline: "Timeline too tight",
  budget: "Budget clearly below range",
  decision_maker: "Not the decision-maker",
  excluded_type: "Project type we don't take",
  commercial_too_small: "Commercial space too small",
  commercial_too_large: "Commercial space very large",
};

export const MODE_LABELS: Record<string, string> = {
  site_visit: "Site visit",
  phone_call: "Phone call",
};

export const SYNC_KIND_LABELS: Record<string, string> = {
  designer_email: "Designer email",
  escalation_email: "Escalation email",
  hubspot_upsert: "HubSpot deal",
  hubspot_sync: "HubSpot deal",
  price_leak_alert: "Price-leak alert to Nikhil",
  calendar_update: "Calendar update",
};

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  qualification: "Qualification",
  temperature: "Temperature",
  assigned_designer: "Designer",
  designer: "Designer",
  outcome: "Outcome",
  followup_done: "Follow-up done",
  note: "Note",
  customer_confirmed: "Confirmed with customer",
  booking_rescheduled: "Consultation rescheduled",
  booking_cancelled: "Consultation cancelled",
};

const pick = (map: Record<string, string>, code: string | null | undefined) =>
  code ? (map[code] ?? humanize(code)) : "—";

export const flagLabel = (c: string) => pick(FLAG_LABELS, c);
export const complianceLabel = (c: string) => pick(COMPLIANCE_LABELS, c);
export const callTypeLabel = (c: string | null | undefined) => pick(CALL_TYPE_LABELS, c);
export const outcomeStageLabel = (c: string | null | undefined) => pick(OUTCOME_STAGE_LABELS, c);
export const criterionLabel = (c: string) => pick(CRITERION_LABELS, c);
export const decidedByLabel = (c: string) => pick(DECIDED_BY_LABELS, c);
export const modeLabel = (c: string | null | undefined) => pick(MODE_LABELS, c);
export const syncKindLabel = (c: string) => pick(SYNC_KIND_LABELS, c);
export const auditFieldLabel = (c: string) => pick(AUDIT_FIELD_LABELS, c);

/** followup_reason may hold one code, several separated by commas, or a free sentence. */
export function followupReasons(reason: string | null | undefined): string[] {
  if (!reason) return [];
  const parts = reason
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((p) => (/^[a-z_]+$/.test(p) ? pick(FOLLOWUP_REASON_LABELS, p) : p));
}
