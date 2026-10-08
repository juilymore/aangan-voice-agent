import type { BookRequest, CalendarProvider, EventRef, Slot, SlotQuery } from "./types";

type MockEvent = { id: string; calendarId: string | null; start: Date; end: Date; title: string; callId: string };

const HOUR = 3600_000;

/** In-memory calendar for tests and local dev. Offers simple :00 slots starting tomorrow 10:00 IST. */
export class MockCalendarProvider implements CalendarProvider {
  readonly name = "mock";
  events: MockEvent[] = [];
  failNext = false; // tests flip this to simulate Google 500s

  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mock calendar: simulated 500");
    }
  }

  async getFreeSlots(q: SlotQuery): Promise<Slot[]> {
    this.maybeFail();
    const dur = q.mode === "site_visit" ? 2 * HOUR : HOUR / 2;
    const out: Slot[] = [];
    // tomorrow 10:00 IST = 04:30 UTC
    const base = new Date(q.now);
    base.setUTCDate(base.getUTCDate() + 1);
    base.setUTCHours(4, 30, 0, 0);
    for (let h = 0; out.length < q.limit && h < 48; h++) {
      for (const d of q.designers) {
        const start = new Date(base.getTime() + h * HOUR);
        const end = new Date(start.getTime() + dur);
        if (await this.isFree(d.calendarId, start, end)) {
          out.push({
            slotId: `${d.key}|${start.toISOString()}|${q.mode}`,
            designer: d.key,
            designerName: d.name,
            start,
            end,
            mode: q.mode,
            spoken: start.toISOString(),
          });
        }
        if (out.length >= q.limit) break;
      }
    }
    return out;
  }

  async isFree(calendarId: string | null, start: Date, end: Date) {
    return !this.events.some((e) => e.calendarId === calendarId && e.start < end && start < e.end);
  }

  async book(req: BookRequest): Promise<EventRef> {
    this.maybeFail();
    const id = `mock_${this.events.length + 1}`;
    this.events.push({ id, calendarId: req.designerCalendarId, start: req.start, end: req.end, title: req.title, callId: req.callId });
    return { calendarId: req.designerCalendarId, eventId: id };
  }

  async cancel(ref: EventRef) {
    this.maybeFail();
    this.events = this.events.filter((e) => e.id !== ref.eventId);
  }

  async reschedule(ref: EventRef, start: Date, end: Date) {
    this.maybeFail();
    const ev = this.events.find((e) => e.id === ref.eventId);
    if (!ev) throw new Error(`mock calendar: event ${ref.eventId} not found`);
    ev.start = start;
    ev.end = end;
  }
}
