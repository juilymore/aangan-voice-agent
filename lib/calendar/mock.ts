import { computeSlots } from "./slots";
import type { BookRequest, CalendarProvider, EventRef, Slot, SlotQuery } from "./types";

type MockEvent = { id: string; start: Date; end: Date; title: string; callId: string };

/** In-memory shared calendar for tests, local dev and the demo. Uses the same slot rules as Google. */
export class MockCalendarProvider implements CalendarProvider {
  readonly name = "mock";
  events: MockEvent[] = [];
  failNext = false; // tests flip this to simulate Google 500s

  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      const err = new Error("mock calendar: simulated 500") as Error & { status?: number };
      err.status = 500;
      throw err;
    }
  }

  async getFreeSlots(q: SlotQuery): Promise<Slot[]> {
    this.maybeFail();
    return computeSlots({
      now: q.now,
      mode: q.mode,
      busy: [...this.events, ...(q.extraBusy ?? [])],
      designers: q.designers,
      load: q.load ?? {},
      limit: q.limit,
      preference: q.preference,
    });
  }

  async isFree(start: Date, end: Date) {
    return !this.events.some((e) => e.start < end && start < e.end);
  }

  async book(req: BookRequest): Promise<EventRef> {
    this.maybeFail();
    const id = `mock_${this.events.length + 1}_${req.start.getTime()}`;
    this.events.push({ id, start: req.start, end: req.end, title: req.title, callId: req.callId });
    return { eventId: id };
  }

  async cancel(ref: EventRef) {
    this.maybeFail();
    this.events = this.events.filter((e) => e.id !== ref.eventId);
  }

  async reschedule(ref: EventRef, start: Date, end: Date) {
    this.maybeFail();
    const ev = this.events.find((e) => e.id === ref.eventId);
    if (!ev) return; // event may predate this in-memory calendar (e.g. after a restart)
    ev.start = start;
    ev.end = end;
  }
}
