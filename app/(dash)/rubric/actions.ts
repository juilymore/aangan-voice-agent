"use server";
// Rubric tab: owner-only edits of the lead rubric and business assumptions, the learning inbox, and
// "re-check all calls". Every save goes through saveSettings (validates and writes settings_audit).
import { revalidatePath } from "next/cache";
import { currentPersona } from "@/lib/persona";
import { resetSettings, saveSettings } from "@/lib/rules/settings";
import { DEFAULT_RULE_SETTINGS, type RuleSettings } from "@/lib/rules/settings-schema";
import { applySuggestion, dismissCorrection, reevaluateAll } from "@/lib/learning";
import { UUID_RE } from "@/lib/data/calls";
import { RULE_SECTIONS, type RuleSection } from "./sections";

export type RubricState = { ok: boolean; message: string; at?: number; errors?: string[]; recheck?: boolean } | null;

const fail = (message: string, errors?: string[]): RubricState => ({ ok: false, message, errors, at: Date.now() });
const done = (message: string, recheck = false): RubricState => ({ ok: true, message, recheck, at: Date.now() });

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function owner() {
  const p = await currentPersona();
  return p.role === "owner" ? p : null;
}

function refresh() {
  revalidatePath("/rubric");
  revalidatePath("/metrics");
}

const isRuleSection = (s: string): s is RuleSection => Object.prototype.hasOwnProperty.call(RULE_SECTIONS, s);

/** Reads a required number field; records an error in plain words when missing. */
function num(fd: FormData, name: string, label: string, errors: string[], scale = 1): number {
  const raw = str(fd, name).replace(/[₹,\s%]/g, "");
  if (!raw) {
    errors.push(`${label} is required`);
    return NaN;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push(`${label} must be a number`);
    return NaN;
  }
  return Math.round(n * scale * 10_000) / 10_000;
}

function terms(fd: FormData, name: string): string[] {
  try {
    const v: unknown = JSON.parse(str(fd, name) || "[]");
    return Array.isArray(v) ? [...new Set(v.map((t) => String(t).trim().toLowerCase()).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

const FIELD_WORDS: Record<string, string> = {
  minWeeksToCompletion: "Minimum weeks",
  tightTimelineWeeks: "Tight-timeline weeks",
  lateStartDays: "Late-start days",
  commercialMinSqft: "Office size min",
  commercialMaxSqft: "Office size max",
  residentialFloorPerSqft: "Residential floor",
  commercialFloorPerSqft: "Commercial floor",
  singleRoomFloor: "Single-room floor",
  budgetFailRatio: "Fail ratio",
  assumedCarpetByBhk: "Carpet per BHK",
  temperaturePoints: "Points",
  soonDays: "Soon (days)",
  hotMinScore: "Hot threshold",
  warmMinScore: "Warm threshold",
  areaPassTerms: "Service area",
  areaFailTerms: "Outside area",
  avgProjectValueInr: "Average project value",
  qualifiedToWonPct: "Qualified to won",
  voiceRatePerMinInr: "Voice rate",
  aiCostPerCallInr: "AI cost per call",
  officeStartHour: "Office opens",
  officeEndHour: "Office closes",
  officeDays: "Office days",
  intro: "Intro",
  criteria: "Criteria",
  neverDisqualify: "Never disqualify",
};

/** zod paths like "temperaturePoints.referral: Too big" → "Points (referral): Too big". */
function friendly(errors: string[]): string[] {
  return errors.map((e) => {
    const m = /^([a-zA-Z]+)(?:\.([\w.]+))?: (.*)$/.exec(e);
    if (!m) return e;
    const [, field, sub, msg] = m;
    return `${FIELD_WORDS[field] ?? field}${sub ? ` (${sub})` : ""}: ${msg}`;
  });
}

export async function saveRules(_: RubricState, fd: FormData): Promise<RubricState> {
  const p = await owner();
  if (!p) return fail("Only Nikhil can change the rubric.");
  const section = str(fd, "section");
  if (!isRuleSection(section)) return fail("Unknown section.");
  const errors: string[] = [];
  let patch: Partial<RuleSettings> = {};
  if (section === "numbers") {
    const carpet: Record<string, number> = {};
    for (const k of fd.keys()) {
      const m = /^carpet_(\d+)$/.exec(k);
      if (m) carpet[m[1]] = num(fd, k, `Carpet for ${m[1]} BHK`, errors);
    }
    patch = {
      minWeeksToCompletion: num(fd, "minWeeksToCompletion", "Minimum weeks", errors),
      tightTimelineWeeks: num(fd, "tightTimelineWeeks", "Tight-timeline weeks", errors),
      lateStartDays: num(fd, "lateStartDays", "Late-start days", errors),
      commercialMinSqft: num(fd, "commercialMinSqft", "Office size min", errors),
      commercialMaxSqft: num(fd, "commercialMaxSqft", "Office size max", errors),
      residentialFloorPerSqft: num(fd, "residentialFloorPerSqft", "Residential floor", errors),
      commercialFloorPerSqft: num(fd, "commercialFloorPerSqft", "Commercial floor", errors),
      singleRoomFloor: num(fd, "singleRoomFloor", "Single-room floor", errors),
      budgetFailRatio: num(fd, "budgetFailRatioPct", "Fail ratio", errors, 0.01),
      assumedCarpetByBhk: carpet,
    };
  } else if (section === "area") {
    const pass = terms(fd, "areaPassTerms");
    const failTerms = terms(fd, "areaFailTerms");
    const both = pass.filter((t) => failTerms.includes(t));
    if (both.length) errors.push(`In both lists: ${both.join(", ")}`);
    patch = { areaPassTerms: pass, areaFailTerms: failTerms };
  } else {
    const pts = {} as RuleSettings["temperaturePoints"];
    for (const k of Object.keys(DEFAULT_RULE_SETTINGS.temperaturePoints) as (keyof RuleSettings["temperaturePoints"])[]) {
      pts[k] = num(fd, `pt_${k}`, `Points for ${k}`, errors);
    }
    patch = {
      temperaturePoints: pts,
      soonDays: num(fd, "soonDays", "Soon (days)", errors),
      hotMinScore: num(fd, "hotMinScore", "Hot threshold", errors),
      warmMinScore: num(fd, "warmMinScore", "Warm threshold", errors),
    };
  }
  if (errors.length) return fail("Not saved. Please fix:", errors);
  const res = await saveSettings("rules", patch, p.name, str(fd, "reason") || undefined);
  if (!res.ok) return fail("Not saved. Please fix:", friendly(res.errors));
  refresh();
  return done("Saved.", true);
}

export async function saveRubricText(_: RubricState, fd: FormData): Promise<RubricState> {
  const p = await owner();
  if (!p) return fail("Only Nikhil can change the rubric.");
  const keys = fd.getAll("criterionKey").map(String);
  const criteria = keys.map((key, i) => ({
    key,
    title: str(fd, `title_${i}`),
    description: str(fd, `description_${i}`),
    whenUnclear: str(fd, `whenUnclear_${i}`),
  }));
  const errors = criteria.flatMap((c, i) => (c.title.length < 2 ? [`Criterion ${i + 1}: a title is required`] : []));
  const neverDisqualify = str(fd, "neverDisqualify")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (errors.length) return fail("Not saved. Please fix:", errors);
  const res = await saveSettings(
    "rubric_text",
    { intro: str(fd, "intro"), criteria, neverDisqualify },
    p.name,
    str(fd, "reason") || undefined,
  );
  if (!res.ok) return fail("Not saved. Please fix:", friendly(res.errors));
  refresh();
  return done("Saved.");
}

export async function saveBusiness(_: RubricState, fd: FormData): Promise<RubricState> {
  const p = await owner();
  if (!p) return fail("Only Nikhil can change the rubric.");
  const errors: string[] = [];
  const patch = {
    avgProjectValueInr: num(fd, "avgProjectValueInr", "Average project value", errors),
    qualifiedToWonPct: num(fd, "qualifiedToWonPct", "Qualified to won", errors),
    voiceRatePerMinInr: num(fd, "voiceRatePerMinInr", "Voice rate", errors),
    aiCostPerCallInr: num(fd, "aiCostPerCallInr", "AI cost per call", errors),
    officeStartHour: num(fd, "officeStartHour", "Office opens", errors),
    officeEndHour: num(fd, "officeEndHour", "Office closes", errors),
    officeDays: fd.getAll("officeDays").map(Number),
  };
  if (!errors.length && patch.officeEndHour <= patch.officeStartHour) errors.push("Office must close after it opens");
  if (!patch.officeDays.length) errors.push("Pick at least one office day");
  if (errors.length) return fail("Not saved. Please fix:", errors);
  const res = await saveSettings("business", patch, p.name, str(fd, "reason") || undefined);
  if (!res.ok) return fail("Not saved. Please fix:", friendly(res.errors));
  refresh();
  return done("Saved.");
}

export async function resetSection(_: RubricState, fd: FormData): Promise<RubricState> {
  const p = await owner();
  if (!p) return fail("Only Nikhil can change the rubric.");
  const section = str(fd, "section");
  if (section === "criteria") await resetSettings("rubric_text", p.name);
  else if (section === "business") await resetSettings("business", p.name);
  else if (isRuleSection(section)) {
    const patch = Object.fromEntries(RULE_SECTIONS[section].fields.map((f) => [f, DEFAULT_RULE_SETTINGS[f]]));
    const res = await saveSettings("rules", patch, p.name, `Reset to defaults: ${RULE_SECTIONS[section].title}`);
    if (!res.ok) return fail("Could not reset.", friendly(res.errors));
  } else return fail("Unknown section.");
  refresh();
  return done("Back to the defaults.", isRuleSection(section));
}

export async function recheckAll(): Promise<RubricState> {
  const p = await owner();
  if (!p) return fail("Only Nikhil can re-check calls.");
  const { checked, changed } = await reevaluateAll();
  revalidatePath("/", "layout");
  return done(`Checked ${checked} ${checked === 1 ? "call" : "calls"}, ${changed} changed.`);
}

export async function applyCorrection(_: RubricState, fd: FormData): Promise<RubricState> {
  const p = await owner();
  if (!p) return fail("Only Nikhil can apply rubric changes.");
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return fail("Correction not found.");
  const r = await applySuggestion(id, p.name);
  if (!r.ok) return fail(r.message);
  refresh();
  const callId = str(fd, "callId");
  if (UUID_RE.test(callId)) revalidatePath(`/calls/${callId}`);
  return done(`Applied: ${r.message}.`, true);
}

export async function dismissCorrectionAction(_: RubricState, fd: FormData): Promise<RubricState> {
  const p = await owner();
  if (!p) return fail("Only Nikhil can dismiss suggestions.");
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return fail("Correction not found.");
  await dismissCorrection(id, p.name);
  refresh();
  return done("Dismissed.");
}
