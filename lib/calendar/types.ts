// CalendarProvider — build_spec.md §7, simplified (decision 9 Oct 2026):
// ONE shared studio calendar for both designers. A booked window blocks everyone;
// the designer is assigned by us (random among active designers under their daily cap).
// Google Calendar is the primary implementation; Cal.com or the mock can sit behind the same interface.

export type ConsultMode = "site_visit" | "phone_call";

export type Slot = {
  slotId: string; // opaque, encodes designer + start + mode
  designer: string; // designer key, assigned when the slot is offered
  designerName: string;
  start: Date;
  end: Date; // includes travel buffer for site visits
  mode: ConsultMode;
  spoken: string; // e.g. "Thursday the ninth, at eleven in the morning" (IST)
};

export type SlotQuery = {
  mode: ConsultMode;
  designers: { key: string; name: string; maxPerDay: number }[];
  now: Date;
  limit: number;
};

export type BookRequest = {
  start: Date;
  end: Date;
  title: string;
  description: string;
  callId: string; // stored in extendedProperties.private.callId
};

export type EventRef = { eventId: string };

export interface CalendarProvider {
  readonly name: string;
  /** Free slots on the shared calendar, each with an assigned designer, earliest first. */
  getFreeSlots(query: SlotQuery): Promise<Slot[]>;
  /** True if the window is still free on the shared calendar (re-check before booking). */
  isFree(start: Date, end: Date): Promise<boolean>;
  book(req: BookRequest): Promise<EventRef>;
  cancel(ref: EventRef): Promise<void>;
  reschedule(ref: EventRef, start: Date, end: Date): Promise<void>;
}
