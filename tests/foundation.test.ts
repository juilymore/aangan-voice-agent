import { describe, expect, it } from "vitest";
import { safeNext, signSession, verifySession } from "@/lib/auth/token";
import { VaaniAdapter, vaaniSignature, verifyVaaniSignature } from "@/lib/voice/vaani-adapter";
import { MockCalendarProvider } from "@/lib/calendar/mock";
import { MockEmailProvider } from "@/lib/email/types";

const SECRET = "x".repeat(40);

describe("session token", () => {
  it("round-trips and rejects tampering or a wrong secret", async () => {
    const t = await signSession({ uid: "u1", email: "a@b.co", name: "A", role: "owner", designerKey: null }, SECRET);
    expect((await verifySession(t, SECRET))?.role).toBe("owner");
    expect(await verifySession(t, "y".repeat(40))).toBeNull();
    expect(await verifySession(t.slice(0, -2) + "aa", SECRET)).toBeNull();
    expect(await verifySession(undefined, SECRET)).toBeNull();
  });

  it("only allows same-site relative redirects", () => {
    expect(safeNext("/calls/123")).toBe("/calls/123");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("Vaani webhook signature (docs: sha256=<hex HMAC-SHA256 of raw body>)", () => {
  const body = JSON.stringify({ id: "evt_1", type: "call.completed", created: 1, data: {} });

  it("accepts a correct signature and rejects others", () => {
    const sig = vaaniSignature(body, "vv_whk_test");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyVaaniSignature(body, sig, "vv_whk_test")).toBe(true);
    expect(verifyVaaniSignature(body + " ", sig, "vv_whk_test")).toBe(false);
    expect(verifyVaaniSignature(body, sig.replace("sha256=", ""), "vv_whk_test")).toBe(false);
    expect(verifyVaaniSignature(body, null, "vv_whk_test")).toBe(false);
    expect(verifyVaaniSignature(body, sig, "")).toBe(false);
  });

  it("extracts event id and type for dedupe", async () => {
    const a = new VaaniAdapter("vv_whk_test");
    const headers = new Headers({ "x-vaanivoice-signature": vaaniSignature(body, "vv_whk_test") });
    expect(await a.verifyWebhook(body, headers)).toEqual({ ok: true, eventId: "evt_1", eventType: "call.completed" });
  });

  it("parses a call.completed envelope defensively", () => {
    const a = new VaaniAdapter("s");
    const call = a.parseCallEvent({
      id: "evt_2",
      type: "call.completed",
      data: { call_id: "c9", duration: 252, transcript: "Agent: Hello\nUser: Hi, I'm Priya" },
    });
    expect(call?.providerCallId).toBe("c9");
    expect(call?.durationSec).toBe(252);
    expect(call?.transcript).toEqual([
      { role: "agent", text: "Hello" },
      { role: "caller", text: "Hi, I'm Priya" },
    ]);
    expect(a.parseCallEvent({ type: "usage.charged", data: {} })).toBeNull();
    expect(a.parseCallEvent({ type: "call.completed", data: {} })).toBeNull();
  });
});

describe("mock providers", () => {
  it("calendar refuses overlapping bookings", async () => {
    const cal = new MockCalendarProvider();
    const start = new Date("2026-10-09T05:30:00Z");
    const end = new Date("2026-10-09T06:00:00Z");
    await cal.book({ designerCalendarId: "ruhi", start, end, title: "t", description: "d", callId: "c1" });
    expect(await cal.isFree("ruhi", start, end)).toBe(false);
    expect(await cal.isFree("jay", start, end)).toBe(true);
  });

  it("email sends once per idempotency key", async () => {
    const mail = new MockEmailProvider();
    const msg = { to: "a@b.co", subject: "s", html: "h", text: "t", idempotencyKey: "designer_email:call1" };
    await mail.send(msg);
    await mail.send(msg);
    expect(mail.sent).toHaveLength(1);
  });
});
