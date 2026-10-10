// Availability is computed by us (Google Calendar has no booking rules) — build_spec §7, with the
// ONE shared studio calendar: any busy window blocks every designer; the designer is assigned per slot.
import type { ConsultMode, Slot } from "./types";
import { istParts, spokenTime } from "./spoken";

export const AVAILABILITY = {
  workDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  startHour: 10,
  endHour: 19, // IST
  phoneMinutes: 30,
  siteVisitMinutes: 90,
  travelBufferMinutes: 30, // after a site visit
  earliestHoursFromNow: 12,
  horizonDays: 10,
  stepMinutes: 30,
  perDayInOffer: 2, // spread offered slots across days
} as const;

export const blockMinutes = (mode: ConsultMode) =>
  mode === "site_visit" ? AVAILABILITY.siteVisitMinutes + AVAILABILITY.travelBufferMinutes : AVAILABILITY.phoneMinutes;

export type Busy = { start: Date; end: Date };
export type Preference = { days?: number[]; partOfDay?: "morning" | "afternoon" | "evening" };

/** Parses "weekends", "Saturday morning", "after 6pm", "weekday evenings" into a light filter. */
export function parsePreference(daysText?: string | null, timeText?: string | null): Preference {
  const s = `${daysText ?? ""} ${timeText ?? ""}`.toLowerCase();
  const pref: Preference = {};
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const days = names.map((n, i) => (s.includes(n) || s.includes(n.slice(0, 3) + " ") ? i : -1)).filter((i) => i >= 0);
  if (/weekend/.test(s)) days.push(6, 0);
  if (/weekday/.test(s)) days.push(1, 2, 3, 4, 5);
  if (days.length) pref.days = [...new Set(days)];
  if (/morning/.test(s)) pref.partOfDay = "morning";
  else if (/afternoon|lunch/.test(s)) pref.partOfDay = "afternoon";
  else if (/evening|after (5|6|five|six)/.test(s)) pref.partOfDay = "evening";
  return pref;
}

const IST_MS = 330 * 60_000;
/** UTC instant for an IST wall-clock time. */
const istInstant = (y: number, mo: number, d: number, h: number, mi: number) => new Date(Date.UTC(y, mo, d, h, mi) - IST_MS);
const dayKey = (d: Date) => {
  const p = istParts(d);
  return `${p.y}-${p.mo + 1}-${p.d}`;
};

export function computeSlots(args: {
  now: Date;
  mode: ConsultMode;
  busy: Busy[];
  designers: { key: string; name: string; maxPerDay: number }[];
  /** Confirmed consultations per designer per IST day key "YYYY-M-D". */
  load: Record<string, Record<string, number>>;
  limit: number;
  preference?: Preference;
  random?: () => number;
}): Slot[] {
  const { now, mode, busy, designers, load, limit, preference } = args;
  const rand = args.random ?? Math.random;
  const dur = blockMinutes(mode) * 60_000;
  const earliest = now.getTime() + AVAILABILITY.earliestHoursFromNow * 3600_000;
  const out: Slot[] = [];
  const today = istParts(now);
  const usedPerDay = new Map<string, number>();

  for (let dOff = 0; dOff <= AVAILABILITY.horizonDays && out.length < limit; dOff++) {
    const dayStart = istInstant(today.y, today.mo, today.d + dOff, 0, 0);
    const p = istParts(dayStart);
    if (!AVAILABILITY.workDays.includes(p.wd as 1)) continue;
    if (preference?.days && !preference.days.includes(p.wd)) continue;

    for (let m = AVAILABILITY.startHour * 60; m + blockMinutes(mode) <= AVAILABILITY.endHour * 60; m += AVAILABILITY.stepMinutes) {
      const start = istInstant(p.y, p.mo, p.d, Math.floor(m / 60), m % 60);
      const end = new Date(start.getTime() + dur);
      if (start.getTime() < earliest) continue;
      const h = Math.floor(m / 60);
      if (preference?.partOfDay === "morning" && h >= 12) continue;
      if (preference?.partOfDay === "afternoon" && (h < 12 || h >= 17)) continue;
      if (preference?.partOfDay === "evening" && h < 16) continue;
      if (busy.some((b) => b.start < end && start < b.end)) continue;
      // Don't offer two overlapping slots in the same offer.
      if (out.some((s) => s.start < end && start < s.end)) continue;

      const key = dayKey(start);
      if ((usedPerDay.get(key) ?? 0) >= AVAILABILITY.perDayInOffer) break;
      const free = designers.filter((d) => (load[d.key]?.[key] ?? 0) < d.maxPerDay);
      if (!free.length) break;
      // Random among designers with capacity; prefer whoever has fewer consultations that day.
      const minLoad = Math.min(...free.map((d) => load[d.key]?.[key] ?? 0));
      const pool = free.filter((d) => (load[d.key]?.[key] ?? 0) === minLoad);
      const d = pool[Math.floor(rand() * pool.length)];

      out.push({
        slotId: `${d.key}|${start.toISOString()}|${mode}`,
        designer: d.key,
        designerName: d.name,
        start,
        end,
        mode,
        spoken: `${d.name}, ${spokenTime(start, now)}`,
      });
      usedPerDay.set(key, (usedPerDay.get(key) ?? 0) + 1);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export { dayKey };
