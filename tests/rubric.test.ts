import { describe, expect, it } from "vitest";
import { evaluate, matchArea } from "@/lib/rules/engine";
import { DEFAULT_BUSINESS, DEFAULT_RULE_SETTINGS, RuleSettingsSchema, type RuleSettings } from "@/lib/rules/settings-schema";
import { isAfterHours } from "@/lib/pipeline/analyze";
import { extractionSystemPrompt } from "@/lib/pipeline/extract";
import { FIXTURES } from "./fixtures/sep2026";

const withRules = (patch: Partial<RuleSettings>) => ({ ...DEFAULT_RULE_SETTINGS, ...patch });

describe("editable rubric", () => {
  it("defaults reproduce the 40/40 results", () => {
    for (const f of FIXTURES) expect(evaluate(f.input, DEFAULT_RULE_SETTINGS).outcome, f.id).toBe(f.expect.outcome);
  });
  it("defaults are valid against the schema", () => {
    expect(RuleSettingsSchema.safeParse(DEFAULT_RULE_SETTINGS).success).toBe(true);
  });
  it("adding a locality to the service area changes the verdict", () => {
    const base = { today: "2026-10-10", propertyKind: "residential", locality: "Wagholi", scope: "full_home", bhk: 2, intent: "full_execution" } as const;
    expect(matchArea("Wagholi")).toBe("unclear");
    expect(evaluate(base).outcome).toBe("needs_review");
    const s = withRules({ areaPassTerms: [...DEFAULT_RULE_SETTINGS.areaPassTerms, "wagholi"] });
    expect(evaluate(base, s).outcome).toBe("qualified");
  });
  it("timeline and budget thresholds come from settings", () => {
    const t07 = FIXTURES.find((f) => f.id === "T07")!.input;
    expect(evaluate(t07).outcome).toBe("not_qualified");
    expect(evaluate(t07, withRules({ minWeeksToCompletion: 2 })).outcome).not.toBe("not_qualified");
    const t10 = FIXTURES.find((f) => f.id === "T10")!.input;
    expect(evaluate(t10, withRules({ budgetFailRatio: 0.2 })).decidedBy).not.toBe("budget");
  });
  it("hot threshold comes from settings", () => {
    const t11 = FIXTURES.find((f) => f.id === "T11")!.input; // warm, score 3
    expect(evaluate(t11).temperature).toBe("warm");
    expect(evaluate(t11, withRules({ hotMinScore: 3 })).temperature).toBe("hot");
  });
  it("rejects nonsense values", () => {
    expect(RuleSettingsSchema.safeParse({ ...DEFAULT_RULE_SETTINGS, budgetFailRatio: 3 }).success).toBe(false);
    expect(RuleSettingsSchema.safeParse({ ...DEFAULT_RULE_SETTINGS, minWeeksToCompletion: -1 }).success).toBe(false);
  });
});

describe("call types and office hours", () => {
  it("client update requests and complaints are not leads", () => {
    expect(evaluate({ today: "2026-10-10", callType: "followup_update" }).outcome).toBe("not_a_lead");
    expect(evaluate({ today: "2026-10-10", callType: "existing_client_issue" }).outcome).toBe("not_a_lead");
  });
  it("knows office hours (Mon–Sat 10:00–19:00 IST)", () => {
    expect(isAfterHours(new Date("2026-10-12T05:00:00Z"), DEFAULT_BUSINESS)).toBe(false); // Mon 10:30 IST
    expect(isAfterHours(new Date("2026-10-12T14:00:00Z"), DEFAULT_BUSINESS)).toBe(true); // Mon 19:30 IST
    expect(isAfterHours(new Date("2026-10-11T06:00:00Z"), DEFAULT_BUSINESS)).toBe(true); // Sunday
    expect(isAfterHours(new Date("2026-10-12T04:00:00Z"), DEFAULT_BUSINESS)).toBe(true); // Mon 9:30 IST
  });
});

describe("teach the AI: extraction hints", () => {
  it("puts past fact corrections into the extraction prompt", () => {
    const p = extractionSystemPrompt("2026-10-10", ['locality: it was read as "Karadi" but the correct value was "Kharadi"']);
    expect(p).toContain("Corrections from the studio");
    expect(p).toContain("Kharadi");
    expect(extractionSystemPrompt("2026-10-10")).not.toContain("Corrections from the studio");
  });
});
