import "server-only";
import { randomUUID } from "node:crypto";
import ical from "node-ical";
import { computeSlots, type Busy } from "./slots";
import type { BookRequest, CalendarProvider, EventRef, Slot, SlotQuery } from "./types";

// Calendar via iCal feeds, no Google Cloud project needed:
//  - READ: the studio's Google Calendar "secret address in iCal format" (GOOGLE_ICS_URL) gives busy
//    times, including anything booked through the Google appointment page.
//  - WRITE: our bookings table is the source of truth; /api/calendar/<token> publishes it as a feed that
//    Google Calendar subscribes to ("Other calendars → From URL").
// Double booking is still impossible: the database refuses overlapping confirmed bookings.

const CACHE_MS = 60_000;

export class IcsCalendarProvider implements CalendarProvider {
  readonly name = "ics";
  private cache: { at: number; busy: Busy[] } | null = null;

  constructor(private readonly icsUrl: string | null) {}

  /** Busy windows from the Google calendar feed in [from, to). Empty if no feed is configured. */
  async busy(from: Date, to: Date): Promise<Busy[]> {
    if (!this.icsUrl) return [];
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const res = await fetch(this.icsUrl, { signal: AbortSignal.timeout(5_000), headers: { accept: "text/calendar" } });
      if (!res.ok) throw new Error(`calendar feed ${res.status}`);
      const horizonFrom = new Date(Date.now() - 86_400_000);
      const horizonTo = new Date(Date.now() + 40 * 86_400_000);
      this.cache = { at: Date.now(), busy: parseBusy(await res.text(), horizonFrom, horizonTo) };
    }
    return this.cache.busy.filter((b) => b.start < to && from < b.end);
  }

  async getFreeSlots(q: SlotQuery): Promise<Slot[]> {
    const busy = await this.busy(q.now, new Date(q.now.getTime() + 11 * 86_400_000));
    return computeSlots({
      now: q.now,
      mode: q.mode,
      busy: [...busy, ...(q.extraBusy ?? [])],
      designers: q.designers,
      load: q.load ?? {},
      limit: q.limit,
      preference: q.preference,
    });
  }

  async isFree(start: Date, end: Date) {
    this.cache = null; // always re-check against the live calendar before booking
    return !(await this.busy(start, end)).some((b) => b.start < end && start < b.end);
  }

  // Bookings live in our database and reach Google through the published feed.
  async book(_req: BookRequest): Promise<EventRef> {
    return { eventId: `aangan-${randomUUID()}` };
  }
  async cancel() {}
  async reschedule() {}
}

type VEvent = {
  type: string;
  start?: Date & { tz?: string; dateOnly?: boolean };
  end?: Date;
  datetype?: string;
  transparency?: string;
  status?: string;
  rrule?: { between: (a: Date, b: Date, inc: boolean) => Date[]; options?: { dtstart?: Date } };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, VEvent>;
};

/** Parses an iCal feed into busy windows, expanding recurring events. Free (transparent) and cancelled events are ignored. */
export function parseBusy(text: string, from: Date, to: Date): Busy[] {
  const data = ical.sync.parseICS(text) as Record<string, VEvent>;
  const out: Busy[] = [];
  for (const ev of Object.values(data)) {
    if (ev.type !== "VEVENT" || !ev.start) continue;
    if ((ev.transparency ?? "").toUpperCase() === "TRANSPARENT") continue;
    if ((ev.status ?? "").toUpperCase() === "CANCELLED") continue;
    const allDay = ev.datetype === "date";
    const dur = ev.end ? ev.end.getTime() - ev.start.getTime() : allDay ? 86_400_000 : 3_600_000;
    const push = (s: Date) => {
      // All-day dates are midnight UTC from the parser; treat them as the IST day.
      const start = allDay ? new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - 330 * 60_000) : s;
      const end = new Date(start.getTime() + dur);
      if (start < to && from < end) out.push({ start, end });
    };
    if (ev.rrule) {
      const ex = new Set(Object.values(ev.exdate ?? {}).map((d) => new Date(d).toISOString().slice(0, 16)));
      // node-ical expands TZID repeats in wall-clock time as if it were UTC; shift back by the offset
      // between the rule's own start and the event's true start.
      const ruleStart = ev.rrule.options?.dtstart;
      const shift = ruleStart ? ev.start.getTime() - ruleStart.getTime() : 0;
      for (const raw of ev.rrule.between(new Date(from.getTime() - dur - Math.abs(shift)), new Date(to.getTime() + Math.abs(shift)), true)) {
        const occ = new Date(raw.getTime() + shift);
        if (ex.has(occ.toISOString().slice(0, 16))) continue;
        const override = ev.recurrences?.[occ.toISOString().slice(0, 10)];
        if (override) {
          if ((override.status ?? "").toUpperCase() === "CANCELLED" || !override.start) continue;
          const oDur = override.end ? override.end.getTime() - override.start.getTime() : dur;
          if (override.start < to && from < new Date(override.start.getTime() + oDur)) out.push({ start: override.start, end: new Date(override.start.getTime() + oDur) });
          continue;
        }
        push(occ);
      }
    } else {
      push(ev.start);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Our bookings as an iCal feed for Google Calendar to subscribe to. */
export function bookingsToIcs(
  rows: {
    id: string;
    startAt: Date;
    endAt: Date;
    mode: string;
    status: string;
    designerName: string | null;
    callerName: string | null;
    callbackNumber: string | null;
    locality: string | null;
    society: string | null;
    createdAt: Date;
  }[],
  appUrl: string,
): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line: string) => {
    const parts: string[] = [];
    let rest = line;
    while (rest.length > 74) {
      parts.push(rest.slice(0, 74));
      rest = " " + rest.slice(74);
    }
    parts.push(rest);
    return parts.join("\r\n");
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aangan Studio//Consultations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Aangan consultations",
    "X-WR-TIMEZONE:Asia/Kolkata",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const b of rows) {
    const mode = b.mode === "site_visit" ? "Site visit" : "Phone call";
    const summary = `Aangan: ${b.callerName ?? "Caller"} (${mode})${b.locality ? `, ${b.locality}` : ""}${b.designerName ? ` · ${b.designerName}` : ""}`;
    const desc = [
      `Designer: ${b.designerName ?? "-"}`,
      `Caller: ${b.callerName ?? "-"}`,
      `Callback: ${b.callbackNumber ?? "-"}`,
      `Society/building: ${b.society ?? "-"}`,
      `Dashboard: ${appUrl.replace(/\/$/, "")}/calls?q=${encodeURIComponent(b.callbackNumber ?? "")}`,
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@aangan-leads`,
      `DTSTAMP:${fmt(b.createdAt)}`,
      `DTSTART:${fmt(b.startAt)}`,
      `DTEND:${fmt(b.endAt)}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      b.locality ? fold(`LOCATION:${esc([b.society, b.locality].filter(Boolean).join(", "))}`) : "",
      `STATUS:${b.status === "confirmed" ? "CONFIRMED" : "CANCELLED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n") + "\r\n";
}
