// Deterministic normaliser for check_fit (mid-call): free text from the agent → rule input.
// Fast (no AI round-trip, well under the 800 ms target) and predictable. The post-call pipeline
// re-checks everything with full extraction anyway.
import type { RuleInputDraft } from "@/lib/rules/types";

export type CheckFitParams = {
  language?: string;
  project_type?: string;
  property_kind?: string;
  locality?: string;
  size_text?: string;
  property_state?: string;
  scope_text?: string;
  intent?: string;
  timeline_text?: string;
  decision_maker_text?: string;
  budget_text?: string;
  referral_text?: string;
};

const WORD_NUM: Record<string, number> = {
  one: 1, a: 1, an: 1, two: 2, both: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const num = (s: string) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : WORD_NUM[s.toLowerCase()]);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Festival dates the agent may hear ("before Diwali"). Extend yearly. */
export const FESTIVALS: Record<string, string[]> = {
  diwali: ["2026-11-08", "2027-10-29"],
  dussehra: ["2026-10-20", "2027-10-09"],
  "ganesh|ganpati": ["2027-09-04"],
  christmas: ["2026-12-25", "2027-12-25"],
  "new year": ["2027-01-01", "2028-01-01"],
};

const DAY = 86_400_000;
const istToday = (now: Date) => {
  const t = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
};

export function parseTimeline(text: string | undefined, now: Date): Pick<RuleInputDraft, "completionBy" | "startInDays" | "urgent"> {
  const out: Pick<RuleInputDraft, "completionBy" | "startInDays" | "urgent"> = { completionBy: null, startInDays: null, urgent: false };
  if (!text) return out;
  const s = text.toLowerCase();
  const today = istToday(now);
  const isStart = /\b(start|begin|starting|from)\b/.test(s) && !/\b(finish|complete|done|ready|move in|by|before)\b/.test(s);

  if (/\b(asap|immediately|right away|as soon as possible|right now|urgent)\b|\bnow\b/.test(s)) {
    out.urgent = true;
    out.startInDays = 0;
  }
  if (/\b(no rush|flexible|no deadline|whenever|not sure|no hurry)\b/.test(s) && !out.urgent) return out;

  let target: Date | null = null;
  const rel = s.match(/\b(\d+(?:\.\d+)?|one|a|an|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)\s*(?:of\s*)?(day|week|month)s?\b/);
  if (rel) {
    const n = num(rel[1]) ?? 1;
    const days = rel[2] === "day" ? n : rel[2] === "week" ? n * 7 : n * 30;
    target = new Date(today.getTime() + days * DAY);
  }
  for (const [names, dates] of Object.entries(FESTIVALS)) {
    if (new RegExp(`\\b(${names})\\b`).test(s)) {
      const next = dates.map((d) => new Date(`${d}T00:00:00Z`)).find((d) => d >= today);
      if (next) target = next;
    }
  }
  const m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b(?:\s+(\d{4}))?/);
  if (!target && m) {
    const mo = MONTHS.indexOf(m[1]);
    let y = m[2] ? Number(m[2]) : today.getUTCFullYear();
    if (!m[2] && mo < today.getUTCMonth()) y++;
    target = isStart ? new Date(Date.UTC(y, mo, 1)) : new Date(Date.UTC(y, mo + 1, 0)); // start of month / end of month
  }
  if (target) {
    if (isStart) out.startInDays = Math.max(0, Math.round((target.getTime() - today.getTime()) / DAY));
    else out.completionBy = target.toISOString().slice(0, 10);
  }
  return out;
}

export function parseSize(text: string | undefined): { sizeSqft: number | null; bhk: number | null } {
  const s = (text ?? "").toLowerCase().replace(/,/g, "");
  const sq = s.match(/(\d{2,6})\s*(?:sq\.?\s*(?:ft|feet)?|square\s*f(?:ee|oo)t|sqft|carpet)/);
  const bhkM = s.match(/\b(\d|one|two|three|four|five)\s*-?\s*bhk\b/);
  return { sizeSqft: sq ? Number(sq[1]) : null, bhk: bhkM ? (num(bhkM[1]) ?? null) : null };
}

const ROOM_WORDS: [RegExp, (m: RegExpMatchArray) => number][] = [
  [/\bkitchen\b/, () => 1],
  [/\b(\d|one|two|three|four|both)?\s*(?:master\s+|kids?'?\s+|guest\s+)?bed\s*rooms?\b/, (m) => (m[1] ? (num(m[1]) ?? 1) : 1)],
  [/\bliving(?:\s*room)?|\bhall\b/, () => 1],
  [/\bdining\b/, () => 1],
  [/\bstudy\b|\bhome office\b|\bwork ?space\b/, () => 1],
  [/\bbath ?rooms?\b|\btoilets?\b/, () => 1],
  [/\bpooja\b/, () => 1],
];

export function parseScope(text: string | undefined, projectType: string | undefined) {
  const s = `${text ?? ""} ${projectType ?? ""}`.toLowerCase();
  if (/\b(whole|full|entire|complete|end[- ]to[- ]end|all rooms|everything|full home|full house|fit ?out|turnkey)\b/.test(s)) {
    return { scope: "full_home" as const, roomsCount: null };
  }
  let rooms = 0;
  for (const [re, count] of ROOM_WORDS) {
    const m = s.match(re);
    if (m) rooms += count(m);
  }
  if (rooms >= 2) return { scope: "partial" as const, roomsCount: rooms };
  if (rooms === 1) return { scope: "single_room" as const, roomsCount: 1 };
  return { scope: "unknown" as const, roomsCount: null };
}

export function parseKind(projectType?: string, propertyKind?: string, scopeText?: string) {
  const s = `${projectType ?? ""} ${propertyKind ?? ""} ${scopeText ?? ""}`.toLowerCase();
  const excludedUse = /\b(restaurant|cafe|café|bar|eatery|cloud kitchen)\b/.test(s)
    ? "restaurant"
    : /\b(hotel|resort|guest ?house|hostel)\b/.test(s)
      ? "hotel"
      : /\b(shop|store|retail|showroom|boutique|salon)\b/.test(s)
        ? "retail"
        : /\b(gym|fitness|yoga studio|crossfit)\b/.test(s)
          ? "gym"
          : null;
  const commercial = excludedUse != null || /\b(office|clinic|studio|commercial|cowork|workspace|cabin|pod)\b/.test(s);
  const residential = /\b(home|house|flat|apartment|villa|bhk|bungalow|row ?house|penthouse)\b/.test(s);
  return {
    propertyKind: commercial && !residential ? ("commercial" as const) : residential ? ("residential" as const) : ("unknown" as const),
    excludedUse: excludedUse as RuleInputDraft["excludedUse"],
  };
}

export function parseIntent(intent?: string, scopeText?: string): RuleInputDraft["intent"] {
  const s = (scopeText ?? "").toLowerCase();
  if (/\b(just|only)\b.*\b(ideas?|advice|suggestions?|consult(?:ation)?)\b|\bdo (?:the )?execution myself\b|\bwe(?:'ll| will) (?:do|execute)\b.*\bourselves\b/.test(s)) return "advice_only";
  if (/\b(only|just)\b.*\b(colou?rs?|paint|styling|decor|arrange)\b/.test(s)) return "decor_only";
  if (/\b(only|just)\b.*\bfurniture\b/.test(s)) return "furniture_only";
  if (/\b(only|just)\b.*\bvastu\b/.test(s)) return "vastu_only";
  const i = (intent ?? "").toLowerCase();
  if (i === "full_execution" || i === "advice_only") return i;
  if (i === "exploring") return "exploring";
  return "unclear";
}

export function parseDecisionMaker(text?: string): RuleInputDraft["decisionMaker"] {
  const s = (text ?? "").toLowerCase();
  if (!s.trim()) return "unknown";
  if (/\b(just|only|initial)\b.*\bresearch|\bchecking for (?:my )?(?:parents|in-?laws|friend)/.test(s) && !/\battend|come\b/.test(s)) return "research_only";
  if (/\b(parents|in-?laws|father|mother|boss|landlord|owner)\b/.test(s) && /\b(attend|come|be there|join)\b/.test(s)) return "others_decide_attending";
  if (/\b(asked me|authori[sz]ed|on (?:their|his|her) behalf|told me to (?:go ahead|book)|go ahead and book)\b/.test(s)) return "authorised";
  if (/\b(me|myself|i decide|i am|i'm|we both|my (?:husband|wife|spouse) and i|owner|founder|yes)\b/.test(s)) return "self";
  return "unknown";
}

export function parseBudget(text?: string): { budgetMaxInr: number | null; budgetMentioned: boolean } {
  const s = (text ?? "").toLowerCase().replace(/,/g, "");
  if (!s.trim()) return { budgetMaxInr: null, budgetMentioned: false };
  const unit = (u: string | undefined) =>
    !u ? 1 : /^(lakh|lac|l)/.test(u) ? 100_000 : /^(crore|cr)/.test(u) ? 10_000_000 : /^(k|thousand)/.test(u) ? 1_000 : 1;
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l\b|crores?|cr\b|k\b|thousand)?/g)];
  if (!nums.length) return { budgetMaxInr: null, budgetMentioned: true };
  const lastUnit = [...nums].reverse().find((n) => n[2])?.[2];
  const values = nums.map((n) => Number(n[1]) * unit(n[2] ?? lastUnit));
  const max = Math.max(...values);
  return { budgetMaxInr: max >= 10_000 ? max : null, budgetMentioned: true };
}

const CHANNELS = /\b(instagram|insta|google|facebook|linkedin|website|online|search|ads?|youtube|justdial|houzz|pinterest|hoarding|newspaper)\b/i;

export function normalizeCheckFit(p: CheckFitParams, now: Date): RuleInputDraft {
  const size = parseSize(`${p.size_text ?? ""} ${p.scope_text ?? ""}`);
  const kind = parseKind(p.project_type, `${p.property_kind ?? ""} ${p.size_text ?? ""}`, p.scope_text);
  const scope = parseScope(p.scope_text, p.project_type);
  const budget = parseBudget(p.budget_text);
  const referral = !!p.referral_text?.trim() && !CHANNELS.test(p.referral_text) && !/^(no|none|nobody)$/i.test(p.referral_text.trim());
  return {
    today: istToday(now),
    propertyKind: kind.propertyKind,
    excludedUse: kind.excludedUse,
    locality: p.locality?.trim() || null,
    sizeSqft: size.sizeSqft,
    bhk: size.bhk,
    scope: scope.scope,
    roomsCount: scope.roomsCount,
    intent: (() => {
      const i = parseIntent(p.intent, p.scope_text);
      return i === "unclear" && scope.scope !== "unknown" ? "full_execution" : i;
    })(),
    ...parseTimeline(p.timeline_text, now),
    decisionMaker: parseDecisionMaker(p.decision_maker_text),
    ...budget,
    referral,
    structuralRequest: /\b(wall|structural|demolish|break|knock)\b/i.test(p.scope_text ?? ""),
  };
}
