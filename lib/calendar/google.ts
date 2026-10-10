import "server-only";
import { createSign } from "node:crypto";
import { computeSlots } from "./slots";
import type { BookRequest, CalendarProvider, EventRef, Slot, SlotQuery } from "./types";

// Google Calendar via a service account (no SDK). The shared studio calendar must be shared with the
// service account's email with "Make changes to events". Docs:
// - token: https://developers.google.com/identity/protocols/oauth2/service-account#httprest
// - freeBusy: https://developers.google.com/calendar/api/v3/reference/freebusy/query
// - events: https://developers.google.com/calendar/api/v3/reference/events
const SCOPE = "https://www.googleapis.com/auth/calendar";
const API = "https://www.googleapis.com/calendar/v3";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google";
  private sa: ServiceAccount;
  private token: { value: string; exp: number } | null = null;

  constructor(serviceAccountB64: string, private readonly calendarId: string) {
    this.sa = JSON.parse(Buffer.from(serviceAccountB64, "base64").toString("utf8"));
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      iss: this.sa.client_email,
      scope: SCOPE,
      aud: this.sa.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(this.sa.private_key).toString("base64url");
    const res = await fetch(this.sa.token_uri ?? "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = new Error(`google calendar ${res.status} ${method}: ${(await res.text()).slice(0, 200)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (res.status === 204 ? {} : await res.json()) as T;
  }

  private async busy(from: Date, to: Date) {
    const r = await this.api<{ calendars: Record<string, { busy: { start: string; end: string }[]; errors?: unknown[] }> }>(
      "POST",
      "/freeBusy",
      { timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: "Asia/Kolkata", items: [{ id: this.calendarId }] },
    );
    const cal = r.calendars[this.calendarId];
    if (!cal || cal.errors?.length) throw new Error(`google freeBusy: calendar not accessible (${JSON.stringify(cal?.errors ?? "missing")})`);
    return cal.busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
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
    const b = await this.busy(start, end);
    return !b.some((x) => x.start < end && start < x.end);
  }

  async book(req: BookRequest): Promise<EventRef> {
    const ev = await this.api<{ id: string }>("POST", `/calendars/${encodeURIComponent(this.calendarId)}/events`, {
      summary: req.title,
      description: req.description,
      start: { dateTime: req.start.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: req.end.toISOString(), timeZone: "Asia/Kolkata" },
      extendedProperties: { private: { callId: req.callId } },
    });
    return { eventId: ev.id };
  }

  async cancel(ref: EventRef) {
    await this.api("DELETE", `/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(ref.eventId)}`);
  }

  async reschedule(ref: EventRef, start: Date, end: Date) {
    await this.api("PATCH", `/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(ref.eventId)}`, {
      start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
    });
  }
}
