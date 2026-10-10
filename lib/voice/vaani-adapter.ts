// Vaani Labs adapter. Source: https://www.vaanilabs.in/docs/api/webhooks and
// docs/vaani_openapi_v1.yaml (fetched 8 Oct 2026).
//
// Confirmed by docs:
//   - Envelope { id: "evt_...", type, created (unix s), data }
//   - Header X-VaaniVoice-Signature: "sha256=" + lowercase hex HMAC-SHA256(raw body, vv_whk_ secret)
//   - Retries reuse the same envelope id -> dedupe on id
// NOT documented (TODO: confirm with a real call.completed payload):
//   - fields inside `data` ("no sub-field is guaranteed"; phone numbers are masked)
//   - any list-calls endpoint -> listRecentCalls returns "unsupported"
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { TranscriptTurn } from "@/db/schema";
import type { CallStatus, NormalizedCall, VoiceProvider, WebhookCheck } from "./types";

export const VAANI_SIGNATURE_HEADER = "x-vaanivoice-signature"; // API webhooks (docs)
// Dashboard "Agent Webhook" deliveries (observed 10 Oct 2026): x-webhook-signature: sha256=<hex>, x-webhook-event.
export const VAANI_DASHBOARD_SIGNATURE_HEADER = "x-webhook-signature";

export function vaaniSignature(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyVaaniSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  // Vaani sends "sha256=<hex>" on some events and a bare <hex> on others (observed 10 Oct 2026).
  const given = header.trim().toLowerCase().replace(/^sha256=/, "");
  const expected = vaaniSignature(rawBody, secret).slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** First non-empty value among candidate keys (data shape is undocumented). */
function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function toDate(v: unknown): Date | null {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toTranscript(v: unknown): TranscriptTurn[] {
  if (typeof v === "string") {
    // Vaani: "[11:01:46] AGENT: ..." per line (clock time, role, text); also plain "Agent: ..." lines.
    const turns: TranscriptTurn[] = [];
    let t0: number | null = null;
    for (const raw of v.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(?:\[(\d{1,2}):(\d{2}):(\d{2})\]\s*)?(agent|assistant|bot|ai|caller|user|customer|human)\s*:\s*(.*)$/i);
      if (!m) {
        if (turns.length) turns[turns.length - 1].text += " " + line; // wrapped line
        else turns.push({ role: "caller", text: line });
        continue;
      }
      const role = /agent|assistant|bot|ai/i.test(m[4]) ? ("agent" as const) : ("caller" as const);
      let at_ms: number | undefined;
      if (m[1] !== undefined) {
        const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        t0 ??= sec;
        at_ms = Math.max(0, (sec - t0) * 1000);
      }
      turns.push({ role, text: m[5].trim(), at_ms });
    }
    return turns;
  }
  if (Array.isArray(v)) {
    return v.flatMap((t): TranscriptTurn[] => {
      if (!isObj(t)) return [];
      const text = pick(t, ["text", "content", "message", "utterance"]);
      if (typeof text !== "string") return [];
      const r = String(pick(t, ["role", "speaker", "from"]) ?? "").toLowerCase();
      const role = /agent|assistant|bot|ai/.test(r) ? "agent" : "caller";
      const at = pick(t, ["at_ms", "start_ms", "offset_ms", "timestamp"]);
      return [{ role, text, at_ms: typeof at === "number" ? at : undefined }];
    });
  }
  return [];
}

export class VaaniAdapter implements VoiceProvider {
  readonly name = "vaani";
  constructor(private readonly webhookSecret: string | undefined) {}

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookCheck> {
    let eventId: string | null = null;
    let eventType: string | null = headers.get("x-vaanivoice-event") ?? headers.get("x-webhook-event");
    try {
      const env = JSON.parse(rawBody);
      if (isObj(env)) {
        eventId = typeof env.id === "string" ? env.id : null;
        eventType = typeof env.type === "string" ? env.type : typeof env.event === "string" ? env.event : eventType;
      }
    } catch {
      /* invalid JSON: signature check below still decides ok */
    }
    const sig = headers.get(VAANI_SIGNATURE_HEADER) ?? headers.get(VAANI_DASHBOARD_SIGNATURE_HEADER);
    const ok = verifyVaaniSignature(rawBody, sig, this.webhookSecret ?? "");
    // Dashboard deliveries carry no event id: dedupe on a hash of the exact body instead.
    eventId ??= `body-${createHash("sha256").update(rawBody).digest("hex").slice(0, 32)}`;
    return { ok, eventId, eventType };
  }

  parseCallEvent(input: unknown): NormalizedCall | null {
    if (!isObj(input)) return null;
    let envelope: Obj = input;
    const top = String(input.type ?? input.event ?? "").toLowerCase();
    if (top.includes("test") || top.includes("ping")) return null; // connectivity tests are not calls
    // Dashboard deliveries may bundle several events: {event, events: [{event, data, timestamp}]}.
    if (Array.isArray(input.events)) {
      const evs = input.events.filter(isObj);
      const name = (e: Obj) => String(e.event ?? e.type ?? "").toLowerCase().replace(/[^a-z]/g, "");
      const best = evs.find((e) => name(e).includes("postprocess")) ?? evs.find((e) => name(e).includes("fail")) ?? evs.find((e) => name(e) === "callended");
      if (!best) return null;
      envelope = best;
    }
    // API webhooks use call.completed / call.failed; dashboard agent webhooks use names like
    // "Call Post-Processing" / call_post_processing. Accept both; ignore progress events (ringing, started).
    const type = String(envelope.type ?? envelope.event ?? envelope.event_type ?? envelope.eventType ?? "");
    const t = type.toLowerCase().replace(/[^a-z]/g, "");
    const isFailed = t.includes("fail");
    const isDone = isFailed || t.includes("postprocess") || t.includes("completed") || t === "callended";
    if (type && !isDone) return null;
    const data = isObj(envelope.data) ? envelope.data : isObj(envelope.payload) ? envelope.payload : isObj(envelope.call) ? envelope.call : envelope;
    const hasTranscript = !!pick(data, ["transcript", "turns", "messages", "conversation"]);
    if (!type && !hasTranscript) return null;
    // "Call Ended" arrives before the transcript is ready; wait for post-processing instead.
    if (t === "callended" && !hasTranscript) return null;

    const id = pick(data, ["call_id", "callId", "session_id", "sessionId", "room_name", "roomName", "conversation_id", "id"]);
    if (typeof id !== "string" && typeof id !== "number") return null;

    const startedAt = toDate(pick(data, ["call_started_at", "picked_up_at", "started_at", "startedAt", "start_time", "call_dialing_at"]));
    const endedAt = toDate(pick(data, ["call_ended_at", "ended_at", "endedAt", "end_time"]));
    const durRaw = pick(data, ["duration_sec", "duration_seconds", "call_duration", "duration"]);
    const durationSec =
      typeof durRaw === "number"
        ? Math.round(durRaw)
        : startedAt && endedAt
          ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
          : null;

    const rawStatus = String(pick(data, ["status", "end_reason", "disconnect_reason"]) ?? "").toLowerCase();
    let status: CallStatus = isFailed ? "failed" : "completed";
    if (/drop|disconnect|hangup|abandon/.test(rawStatus)) status = "dropped";

    // The customer is the caller on inbound calls (from) and the callee on outbound calls (to).
    const outbound = String(pick(data, ["call_type"]) ?? pick(envelope, ["call_type"]) ?? "").toLowerCase().includes("outbound");
    const number =
      pick(data, ["caller_number", "customer_number", "user_number", "phone_number", "phone"]) ??
      pick(envelope, outbound ? ["to", "from"] : ["from", "to"]);
    const lang = pick(data, ["language", "lang", "locale"]);

    return {
      providerCallId: String(id),
      startedAt,
      endedAt,
      durationSec,
      callerNumber: typeof number === "string" ? number : null,
      status,
      language: typeof lang === "string" ? lang : null,
      transcript: toTranscript(pick(data, ["transcript", "turns", "messages", "conversation"])),
    };
  }

  async listRecentCalls(): Promise<"unsupported"> {
    return "unsupported";
  }
}
