import { describe, expect, it } from "vitest";
import { bookingsToIcs, parseBusy } from "@/lib/calendar/ics";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:one@test",
  "DTSTART:20261014T053000Z",
  "DTEND:20261014T063000Z",
  "SUMMARY:Site visit Kothrud",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly@test",
  "DTSTART;TZID=Asia/Kolkata:20261012T150000",
  "DTEND;TZID=Asia/Kolkata:20261012T160000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4",
  "EXDATE;TZID=Asia/Kolkata:20261019T150000",
  "SUMMARY:Team review",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:free@test",
  "DTSTART:20261015T053000Z",
  "DTEND:20261015T063000Z",
  "TRANSP:TRANSPARENT",
  "SUMMARY:Reminder (free)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancelled@test",
  "DTSTART:20261016T053000Z",
  "DTEND:20261016T063000Z",
  "STATUS:CANCELLED",
  "SUMMARY:Cancelled",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("Google Calendar iCal feed → busy times", () => {
  const busy = parseBusy(FEED, new Date("2026-10-10T00:00:00Z"), new Date("2026-11-30T00:00:00Z"));
  const iso = busy.map((b) => b.start.toISOString());
  it("includes a normal event", () => expect(iso).toContain("2026-10-14T05:30:00.000Z"));
  it("expands weekly repeats and honours exceptions", () => {
    expect(iso).toContain("2026-10-12T09:30:00.000Z"); // Mon 15:00 IST
    expect(iso).not.toContain("2026-10-19T09:30:00.000Z"); // excluded
    expect(iso).toContain("2026-10-26T09:30:00.000Z");
  });
  it("ignores free and cancelled events", () => {
    expect(iso).not.toContain("2026-10-15T05:30:00.000Z");
    expect(iso).not.toContain("2026-10-16T05:30:00.000Z");
  });
});

describe("published bookings feed", () => {
  const ics = bookingsToIcs(
    [
      {
        id: "b1",
        startAt: new Date("2026-10-14T05:30:00Z"),
        endAt: new Date("2026-10-14T07:30:00Z"),
        mode: "site_visit",
        status: "confirmed",
        designerName: "Ruhi",
        callerName: "Priya, Kothrud; test",
        callbackNumber: "+91 00000 10001",
        locality: "Kothrud",
        society: "Dahanukar Colony",
        createdAt: new Date("2026-10-10T05:00:00Z"),
      },
    ],
    "https://aangan.example",
  );
  it("is a valid calendar with escaped text", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261014T053000Z");
    expect(ics).toContain("SUMMARY:Aangan: Priya\\, Kothrud\\; test (Site visit)\\, Kothrud · Ruhi");
    expect(ics).toContain("STATUS:CONFIRMED");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
  it("round-trips through the reader as busy time", () => {
    const busy = parseBusy(ics, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(busy).toEqual([{ start: new Date("2026-10-14T05:30:00Z"), end: new Date("2026-10-14T07:30:00Z") }]);
  });
});
