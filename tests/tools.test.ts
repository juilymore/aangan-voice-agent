import { describe, expect, it } from "vitest";
import { computeSlots, parsePreference } from "@/lib/calendar/slots";
import { istParts, spokenTime } from "@/lib/calendar/spoken";
import { evaluate } from "@/lib/rules/engine";
import { normalizeCheckFit, parseBudget, parseScope, parseSize, parseTimeline } from "@/lib/tools/normalize";
import { unwrapParams } from "@/lib/tools/http";

const NOW = new Date("2026-10-10T05:30:00Z"); // Sat 10 Oct 2026, 11:00 IST
const designers = [
  { key: "ruhi", name: "Ruhi", maxPerDay: 4 },
  { key: "jay", name: "Jay", maxPerDay: 4 },
];

describe("slot rules (build_spec §7, one shared calendar)", () => {
  const slots = computeSlots({ now: NOW, mode: "site_visit", busy: [], designers, load: {}, limit: 6, random: () => 0 });
  it("offers up to 6 slots, at least 12 hours ahead, on :00/:30, Mon–Sat, 10:00–19:00 IST", () => {
    expect(slots).toHaveLength(6);
    for (const s of slots) {
      const p = istParts(s.start);
      expect(s.start.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 12 * 3600_000);
      expect([0, 30]).toContain(p.mi);
      expect(p.wd).not.toBe(0); // no Sundays
      expect(p.h).toBeGreaterThanOrEqual(10);
      const e = istParts(s.end);
      expect(e.h * 60 + e.mi).toBeLessThanOrEqual(19 * 60);
    }
  });
  it("blocks a site visit for 2 hours (90 min + 30 min travel)", () => {
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(120 * 60_000);
  });
  it("spreads offers across days (max 2 per day)", () => {
    const perDay = new Map<string, number>();
    for (const s of slots) {
      const p = istParts(s.start);
      const k = `${p.mo}-${p.d}`;
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
  });
  it("a busy window blocks it for every designer", () => {
    const busy = [{ start: slots[0].start, end: slots[0].end }];
    const again = computeSlots({ now: NOW, mode: "site_visit", busy, designers, load: {}, limit: 6 });
    expect(again.some((s) => s.start < busy[0].end && busy[0].start < s.end)).toBe(false);
  });
  it("skips a designer at their daily cap, and the day when all are full", () => {
    const k = (() => {
      const p = istParts(slots[0].start);
      return `${p.y}-${p.mo + 1}-${p.d}`;
    })();
    const one = computeSlots({ now: NOW, mode: "phone_call", busy: [], designers, load: { ruhi: { [k]: 4 } }, limit: 2 });
    expect(one.every((s) => s.designer === "jay")).toBe(true);
    const none = computeSlots({ now: NOW, mode: "phone_call", busy: [], designers, load: { ruhi: { [k]: 4 }, jay: { [k]: 4 } }, limit: 1 });
    expect(istParts(none[0].start).d).not.toBe(istParts(slots[0].start).d);
  });
  it("respects 'weekends' and 'evening' preferences", () => {
    const pref = parsePreference("weekends only", "after 6pm");
    expect(pref).toEqual({ days: [6, 0], partOfDay: "evening" });
    const s = computeSlots({ now: NOW, mode: "phone_call", busy: [], designers, load: {}, limit: 3, preference: pref });
    for (const x of s) {
      expect(istParts(x.start).wd).toBe(6);
      expect(istParts(x.start).h).toBeGreaterThanOrEqual(16);
    }
  });
  it("speaks times in words, never digits", () => {
    expect(spokenTime(new Date("2026-10-15T05:30:00Z"), NOW)).toBe("Thursday the fifteenth, at eleven in the morning");
    expect(spokenTime(new Date("2026-11-02T11:00:00Z"), NOW)).toBe("Monday the second of November, at half past four in the afternoon");
    for (const s of slots) expect(s.spoken).not.toMatch(/\d/);
  });
});

describe("check_fit normaliser", () => {
  it("parses sizes, scopes and budgets as callers say them", () => {
    expect(parseSize("3BHK, about 1,100 sq ft")).toEqual({ sizeSqft: 1100, bhk: 3 });
    expect(parseScope("kitchen, wardrobes in both bedrooms, living room", undefined)).toEqual({ scope: "partial", roomsCount: 4 });
    expect(parseScope("the whole flat", undefined).scope).toBe("full_home");
    expect(parseBudget("1 to 1.5 lakh maximum").budgetMaxInr).toBe(150_000);
    expect(parseBudget("60-80 lakh all in").budgetMaxInr).toBe(8_000_000);
    expect(parseBudget("we have a budget").budgetMaxInr).toBeNull();
  });
  it("parses deadlines: weeks, months, festivals, ASAP", () => {
    expect(parseTimeline("in three weeks", NOW).completionBy).toBe("2026-10-31");
    expect(parseTimeline("before Diwali", NOW).completionBy).toBe("2026-11-08");
    expect(parseTimeline("done by March", NOW).completionBy).toBe("2027-03-31");
    expect(parseTimeline("want to start in January", NOW).startInDays).toBe(83);
    expect(parseTimeline("as soon as possible", NOW)).toMatchObject({ urgent: true, startInDays: 0 });
    expect(parseTimeline("no rush, flexible", NOW).completionBy).toBeNull();
  });
  it("turns a whole mid-call conversation into the right decision", () => {
    const t10 = normalizeCheckFit(
      { locality: "Kharadi", size_text: "1BHK about 550 sq ft", scope_text: "kitchen and one bedroom", intent: "full_execution", budget_text: "1 to 1.5 lakh maximum" },
      NOW,
    );
    expect(evaluate(t10).callAction).toEqual({ decision: "decline", code: "budget" });
    const nashik = normalizeCheckFit({ locality: "Nashik", scope_text: "home office and study", intent: "full_execution" }, NOW);
    expect(evaluate(nashik).callAction).toEqual({ decision: "decline", code: "area" });
    const gym = normalizeCheckFit({ project_type: "gym", locality: "Kothrud", scope_text: "full fitout" }, NOW);
    expect(evaluate(gym).callAction).toEqual({ decision: "decline", code: "excluded_type" });
    const ok = normalizeCheckFit({ locality: "Baner", size_text: "2BHK", scope_text: "full home", intent: "full_execution", timeline_text: "by March" }, NOW);
    expect(evaluate(ok).callAction).toEqual({ decision: "proceed" });
    const rush = normalizeCheckFit({ locality: "Wakad", scope_text: "living room and kitchen", timeline_text: "in three weeks" }, NOW);
    expect(evaluate(rush).callAction).toEqual({ decision: "clarify", code: "timeline_later" });
  });
});

describe("Vaani tool envelopes", () => {
  it("unwraps arguments/parameters wrappers, including JSON strings", () => {
    expect(unwrapParams({ arguments: { locality: "Baner" } })).toEqual({ locality: "Baner" });
    expect(unwrapParams({ parameters: '{"locality":"Aundh"}' })).toEqual({ locality: "Aundh" });
    expect(unwrapParams({ locality: "Wakad" })).toEqual({ locality: "Wakad" });
  });
});
