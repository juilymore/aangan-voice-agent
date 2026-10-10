// Which rule fields each Rubric-tab section owns (used for per-section save and reset). Pure module.
import type { RuleSettings } from "@/lib/rules/settings-schema";

export type RuleSection = "numbers" | "area" | "temperature";

export const RULE_SECTIONS: Record<RuleSection, { title: string; fields: (keyof RuleSettings)[] }> = {
  numbers: {
    title: "Rules in numbers",
    fields: [
      "minWeeksToCompletion",
      "tightTimelineWeeks",
      "lateStartDays",
      "commercialMinSqft",
      "commercialMaxSqft",
      "residentialFloorPerSqft",
      "commercialFloorPerSqft",
      "singleRoomFloor",
      "budgetFailRatio",
      "assumedCarpetByBhk",
    ],
  },
  area: { title: "Service area", fields: ["areaPassTerms", "areaFailTerms"] },
  temperature: { title: "Temperature", fields: ["temperaturePoints", "soonDays", "hotMinScore", "warmMinScore"] },
};

/** Internal pricing values: shown to the owner only, never to designers. */
export const PRICING_FIELDS: readonly string[] = [
  "residentialFloorPerSqft",
  "commercialFloorPerSqft",
  "singleRoomFloor",
  "budgetFailRatio",
  "assumedCarpetByBhk",
];

/** Money assumptions in business settings: owner only. */
export const MONEY_FIELDS: readonly string[] = [
  "avgProjectValueInr",
  "qualifiedToWonPct",
  "voiceRatePerMinInr",
  "aiCostPerCallInr",
];
