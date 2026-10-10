// Editable rubric (Rubric tab). Defaults come from config/rules.ts; saved values live in the
// `settings` table and are merged over these. Pure module: safe to import in tests.
import { z } from "zod";
import {
  AREA_FAIL_TERMS,
  AREA_PASS_TERMS,
  ASSUMED_CARPET_SQFT_BY_BHK,
  BUDGET_FAIL_RATIO,
  COMMERCIAL_FLOOR_PER_SQFT,
  COMMERCIAL_MAX_SQFT,
  COMMERCIAL_MIN_SQFT,
  HOT_MIN_SCORE,
  LATE_START_DAYS,
  MIN_WEEKS_TO_COMPLETION,
  RESIDENTIAL_FLOOR_PER_SQFT,
  SINGLE_ROOM_FLOOR,
  SOON_DAYS,
  TEMPERATURE_POINTS,
  TIGHT_TIMELINE_WEEKS,
  WARM_MIN_SCORE,
} from "@/config/rules";

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const terms = z.array(z.string().trim().toLowerCase().min(2).max(40)).max(300);

export const RuleSettingsSchema = z.object({
  minWeeksToCompletion: int(1, 52),
  tightTimelineWeeks: int(1, 104),
  lateStartDays: int(1, 730),
  commercialMinSqft: int(0, 100_000),
  commercialMaxSqft: int(100, 1_000_000),
  residentialFloorPerSqft: int(100, 100_000),
  commercialFloorPerSqft: int(100, 100_000),
  singleRoomFloor: int(10_000, 100_000_000),
  budgetFailRatio: num(0.1, 1),
  assumedCarpetByBhk: z.record(z.string(), int(100, 20_000)),
  temperaturePoints: z.object({
    consultIntent: int(-5, 5),
    referral: int(-5, 5),
    soon: int(-5, 5),
    commitment: int(-5, 5),
    clearScopeAndSize: int(-5, 5),
    exploring: int(-5, 5),
    priceOnly: int(-5, 5),
    noRushToDecide: int(-5, 5),
  }),
  soonDays: int(1, 365),
  hotMinScore: int(-10, 20),
  warmMinScore: int(-10, 20),
  areaPassTerms: terms,
  areaFailTerms: terms,
});
export type RuleSettings = z.infer<typeof RuleSettingsSchema>;

export const DEFAULT_RULE_SETTINGS: RuleSettings = {
  minWeeksToCompletion: MIN_WEEKS_TO_COMPLETION,
  tightTimelineWeeks: TIGHT_TIMELINE_WEEKS,
  lateStartDays: LATE_START_DAYS,
  commercialMinSqft: COMMERCIAL_MIN_SQFT,
  commercialMaxSqft: COMMERCIAL_MAX_SQFT,
  residentialFloorPerSqft: RESIDENTIAL_FLOOR_PER_SQFT,
  commercialFloorPerSqft: COMMERCIAL_FLOOR_PER_SQFT,
  singleRoomFloor: SINGLE_ROOM_FLOOR,
  budgetFailRatio: BUDGET_FAIL_RATIO,
  assumedCarpetByBhk: Object.fromEntries(Object.entries(ASSUMED_CARPET_SQFT_BY_BHK).map(([k, v]) => [String(k), v])),
  temperaturePoints: { ...TEMPERATURE_POINTS },
  soonDays: SOON_DAYS,
  hotMinScore: HOT_MIN_SCORE,
  warmMinScore: WARM_MIN_SCORE,
  areaPassTerms: [...AREA_PASS_TERMS],
  areaFailTerms: [...AREA_FAIL_TERMS],
};

/** The five criteria in plain words (Nikhil's rubric, qualified.md). Editable text; the rules above enforce it. */
export const RubricTextSchema = z.object({
  intro: z.string().max(2000),
  criteria: z
    .array(
      z.object({
        key: z.string(),
        title: z.string().min(2).max(120),
        description: z.string().max(2000),
        whenUnclear: z.string().max(500),
      }),
    )
    .max(12),
  neverDisqualify: z.array(z.string().max(300)).max(20),
});
export type RubricText = z.infer<typeof RubricTextSchema>;

export const DEFAULT_RUBRIC_TEXT: RubricText = {
  intro:
    "An enquiry reaches a designer when it passes all five criteria. If one is unclear, the assistant asks one direct question. If it clearly fails one, the assistant closes gracefully. (Nikhil Deshpande)",
  criteria: [
    {
      key: "real_project",
      title: "Real project, not just advice",
      description: "The person wants design AND execution. Red flags: just looking for ideas, come and advise, I'll do the execution myself. Minimum engagement is a room redesign with full execution.",
      whenUnclear: "Ask once: design and carry out the work, or mainly ideas and advice? Still unclear → designer reviews.",
    },
    {
      key: "service_area",
      title: "In our service area",
      description: "Pune city or PCMC. Talegaon, Lonavala, Nashik, Mumbai or anywhere outside: decline politely. We don't have the vendor network outside Pune.",
      whenUnclear: "Ask which area of Pune the property is in. Unknown places are never declined; a designer reviews.",
    },
    {
      key: "timeline",
      title: "Realistic timeline",
      description: "The project can't need to be finished too soon. If someone needs it in three weeks, we cannot serve them well. Offer a later date before saying no.",
      whenUnclear: "No deadline given is fine: it becomes a follow-up question for the designer.",
    },
    {
      key: "budget",
      title: "Right budget band (broadly)",
      description: "Don't quote. Don't probe. Only if the caller volunteers a number that is clearly below any project of that scope, address it kindly. No budget mentioned counts as qualified.",
      whenUnclear: "Never asked. A vague budget is noted for the designer.",
    },
    {
      key: "decision_maker",
      title: "Decision-maker on the call (or represented)",
      description: "The caller decides, or is authorised by whoever does. Only researching for in-laws is not enough on its own.",
      whenUnclear: "Never pushed. Noted in the designer brief.",
    },
  ],
  neverDisqualify: [
    "Not knowing exactly what they want",
    "Calling outside office hours",
    "Asking for pricing",
    "Being unsure about materials, style or layout",
    "A single room project with full execution",
    "A rented apartment (no structural changes)",
  ],
};

/** Business assumptions for metrics: revenue estimates, costs, office hours. */
export const BusinessSettingsSchema = z.object({
  avgProjectValueInr: int(10_000, 1_000_000_000),
  qualifiedToWonPct: num(0, 100),
  voiceRatePerMinInr: num(0, 1000),
  aiCostPerCallInr: num(0, 1000),
  officeStartHour: int(0, 23),
  officeEndHour: int(1, 24),
  officeDays: z.array(int(0, 6)).max(7),
});
export type BusinessSettings = z.infer<typeof BusinessSettingsSchema>;

export const DEFAULT_BUSINESS: BusinessSettings = {
  avgProjectValueInr: 1_100_000, // midpoint of the case's ₹8–14 lakh average project value
  qualifiedToWonPct: 20, // assumption until the studio has its own numbers
  voiceRatePerMinInr: 4.92, // Vaani's estimate shown in their dashboard
  aiCostPerCallInr: 1,
  officeStartHour: 10,
  officeEndHour: 19,
  officeDays: [1, 2, 3, 4, 5, 6],
};

export const SETTINGS_KEYS = {
  rules: { schema: RuleSettingsSchema, defaults: DEFAULT_RULE_SETTINGS },
  rubric_text: { schema: RubricTextSchema, defaults: DEFAULT_RUBRIC_TEXT },
  business: { schema: BusinessSettingsSchema, defaults: DEFAULT_BUSINESS },
} as const;
export type SettingsKey = keyof typeof SETTINGS_KEYS;
