import { describe, expect, it } from "vitest";
import { DEFAULT_PERSONA, TEAM, findPersona } from "@/config/team";
import { VaaniAdapter, vaaniSignature, verifyVaaniSignature } from "@/lib/voice/vaani-adapter";
import { MockCalendarProvider } from "@/lib/calendar/mock";
import { MockEmailProvider } from "@/lib/email/types";

describe("persona switcher", () => {
  it("resolves known personas and falls back to Nikhil for anything else", () => {
    expect(findPersona("ruhi").role).toBe("designer");
    expect(findPersona("nikhil").role).toBe("owner");
    expect(findPersona("someone-else")).toBe(DEFAULT_PERSONA);
    expect(findPersona(undefined)).toBe(DEFAULT_PERSONA);
    expect(DEFAULT_PERSONA.name).toBe("Nikhil");
  });

  it("has exactly one owner and links every designer to a designer key", () => {
    expect(TEAM.filter((p) => p.role === "owner")).toHaveLength(1);
    for (const p of TEAM.filter((p) => p.role === "designer")) expect(p.designerKey).toBe(p.key);
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
  it("shared calendar blocks a booked window for every designer", async () => {
    const cal = new MockCalendarProvider();
    const start = new Date("2026-10-09T05:30:00Z");
    const end = new Date("2026-10-09T06:00:00Z");
    await cal.book({ start, end, title: "t", description: "d", callId: "c1" });
    expect(await cal.isFree(start, end)).toBe(false);
    expect(await cal.isFree(new Date("2026-10-09T05:45:00Z"), new Date("2026-10-09T06:15:00Z"))).toBe(false);
    expect(await cal.isFree(end, new Date("2026-10-09T06:30:00Z"))).toBe(true);
    const slots = await cal.getFreeSlots({
      mode: "phone_call",
      designers: [{ key: "ruhi", name: "Ruhi", maxPerDay: 4 }, { key: "jay", name: "Jay", maxPerDay: 4 }],
      now: new Date("2026-10-08T05:30:00Z"),
      limit: 4,
    });
    expect(new Set(slots.map((s) => s.start.toISOString())).size).toBe(slots.length);
    expect(slots.some((s) => s.start.getTime() === start.getTime())).toBe(false);
  });

  it("email sends once per idempotency key", async () => {
    const mail = new MockEmailProvider();
    const msg = { to: "a@b.co", subject: "s", html: "h", text: "t", idempotencyKey: "designer_email:call1" };
    await mail.send(msg);
    await mail.send(msg);
    expect(mail.sent).toHaveLength(1);
  });
});
