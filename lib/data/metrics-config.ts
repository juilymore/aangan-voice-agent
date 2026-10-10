// Constants behind the cost panel and pipeline value on the Metrics page (functional_design.md §13).
// Change them here; the page reads nothing else. Pure: no server-only imports.

/**
 * Voice agent + telephony, in ₹ per call minute.
 * Vaani Labs' own estimate as shown in their dashboard UI for our agent (Hindi/English/Marathi, Indian number).
 * Total voice cost = this × total call minutes (sum of calls.duration_sec / 60).
 */
export const VOICE_INR_PER_MIN = 4.92;

/**
 * AI (Gemini Flash) cost per phone call, in ₹.
 * Rough estimate: 2–3 model calls per phone call (extraction + brief), ~4k input and ~1k output tokens each.
 * At Flash list prices that is about $0.01 per call, i.e. roughly ₹1. Expected to be negligible next to voice.
 */
export const AI_INR_PER_CALL = 1;

/**
 * Average project value used for "estimated pipeline value" in ₹.
 * The case gives ₹8–14 lakh as the studio's typical project; we use the midpoint, ₹11 lakh.
 * Estimated pipeline value = qualified leads × this.
 */
export const AVG_PROJECT_VALUE_INR = 11_00_000;

/** Business hours used for the after-hours share (IST, start inclusive, end exclusive). */
export const BUSINESS_HOURS_IST = { start: 10, end: 19 } as const;

/** Share of enquiries that arrived after hours before the agent (from the case), shown for comparison. */
export const BASELINE_AFTER_HOURS_SHARE = 0.33;

/** Baseline note from the case, shown on the speed panel. */
export const BASELINE_NOTE = "Before: about 48% of enquiries had no response within 48 hours.";

/** Follow-ups older than this are "overdue". */
export const FOLLOWUP_OVERDUE_HOURS = 24;

/** Footnote under the cost panel. */
export const COST_NOTE =
  "Voice is billed on call minutes at Vaani's estimated rate; AI is a rough per-call estimate. Hosting and the phone number rental are not included. Rates live in lib/data/metrics-config.ts.";
