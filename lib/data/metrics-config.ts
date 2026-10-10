// Fixed reference numbers for the Today and Metrics pages. Pure: no server-only imports.
// Money rates, average project value and office hours are NOT here: they are business settings,
// edited on the Rubric tab (lib/rules/settings.ts → getBusinessSettings()).

/** Share of enquiries that arrived after hours before the agent (from the case), shown for comparison. */
export const BASELINE_AFTER_HOURS_SHARE = 0.33;

/** Baseline note from the case, shown on the speed panel. */
export const BASELINE_NOTE = "Before: about 48% of enquiries had no response within 48 hours.";

/** Follow-ups older than this are "overdue". */
export const FOLLOWUP_OVERDUE_HOURS = 24;

/** Footnote under the cost panel. */
export const COST_NOTE =
  "Voice is billed on call minutes at Vaani's estimated rate; AI is a rough per-call estimate. Hosting and the phone number rental are not included. Rates are business assumptions on the Rubric tab.";
