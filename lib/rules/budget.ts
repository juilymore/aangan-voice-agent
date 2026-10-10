// Budget sanity check — functional_design §7.6. Runs on the server only; the agent never sees a number.
import {
  ASSUMED_CARPET_SQFT_BY_BHK,
  BUDGET_FAIL_RATIO,
  COMMERCIAL_FLOOR_PER_SQFT,
  RESIDENTIAL_FLOOR_PER_SQFT,
  SINGLE_ROOM_FLOOR,
} from "@/config/rules";
import type { RuleInput, Status } from "./types";

export type BudgetResult = { status: Status; floor: number | null; tight: boolean; reason: string };

/** Lowest plausible project cost for the described scope, or null if scope/size is unknown. */
export function budgetFloor(i: RuleInput): number | null {
  if (i.propertyKind === "commercial") {
    return i.sizeSqft ? i.sizeSqft * COMMERCIAL_FLOOR_PER_SQFT : null;
  }
  const candidates: number[] = [];
  const carpet = i.sizeSqft ?? (i.bhk ? ASSUMED_CARPET_SQFT_BY_BHK[Math.min(i.bhk, 5)] : null);
  if (i.scope === "full_home" && carpet) candidates.push(carpet * RESIDENTIAL_FLOOR_PER_SQFT);
  if (i.scope === "single_room") candidates.push(SINGLE_ROOM_FLOOR);
  if (i.scope === "partial" && i.roomsCount) candidates.push(i.roomsCount * SINGLE_ROOM_FLOOR);
  if (i.scope === "partial" && carpet && !i.roomsCount) candidates.push(carpet * RESIDENTIAL_FLOOR_PER_SQFT);
  // Ambiguous between two methods: take the lower floor (never reject a borderline budget).
  return candidates.length ? Math.min(...candidates) : null;
}

export function checkBudget(i: RuleInput): BudgetResult {
  if (i.budgetMaxInr == null) {
    return {
      status: i.budgetMentioned ? "unclear" : "pass",
      floor: null,
      tight: false,
      reason: i.budgetMentioned ? "Budget mentioned but no figure; not probed" : "No budget mentioned",
    };
  }
  const floor = budgetFloor(i);
  if (floor == null) {
    return { status: "pass", floor: null, tight: false, reason: "Budget stated but scope too vague to compare" };
  }
  if (i.budgetMaxInr < BUDGET_FAIL_RATIO * floor) {
    return { status: "fail", floor, tight: false, reason: "Stated budget is clearly below what this scope costs" };
  }
  const tight = i.budgetMaxInr < floor;
  return {
    status: "pass",
    floor,
    tight,
    reason: tight ? "Stated budget is on the low side for this scope (designer note)" : "Stated budget fits this scope",
  };
}
