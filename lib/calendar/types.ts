// CalendarProvider — build_spec.md §7. Google Calendar is the primary implementation;
// Cal.com (or the mock) can sit behind the same interface.

export type ConsultMode = "site_visit" | "phone_call";

export type Slot = {
  slotId: string; // opaque, encodes designer + start + mode
  designer: string; // designer key
  designerName: string;
  start: Date;
  end: Date; // includes travel buffer for site visits
  mode: ConsultMode;
  spoken: string; // e.g. "Thursday the ninth, at eleven in the morning" (IST)
};

export type SlotQuery = {
  mode: ConsultMode;
  designers: { key: string; name: string; calendarId: string | null; maxPerDay: number }[];
  now: Date;
  limit: number;
};

export type BookRequest = {
  designerCalendarId: string | null;
  start: Date;
  end: Date;
  title: string;
  description: string;
  callId: string; // stored in extendedProperties.private.callId
};

export type EventRef = { calendarId: string | null; eventId: string };

export interface CalendarProvider {
  readonly name: string;
  /** Free slots across the given designers, balanced, earliest first. */
  getFreeSlots(query: SlotQuery): Promise<Slot[]>;
  /** True if the window is still free on the designer's calendar (re-check before booking). */
  isFree(calendarId: string | null, start: Date, end: Date): Promise<boolean>;
  book(req: BookRequest): Promise<EventRef>;
  cancel(ref: EventRef): Promise<void>;
  reschedule(ref: EventRef, start: Date, end: Date): Promise<void>;
}
