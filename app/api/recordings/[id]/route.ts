import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

// Streams a call's recording from Vaani to the dashboard's audio player.
// Vaani serves it as plain audio (audio/ogg) to the account's API key via `x-api-key`; the key stays on
// the server. Vaani ignores Range requests, so this route downloads the file (a few MB) and serves the
// requested byte range itself: that is what lets the player seek and show the duration. Nothing is stored.
export const maxDuration = 30;

const VAANI_ORIGIN = "https://app.vaanivoice.ai"; // fixed host: this route can never fetch arbitrary URLs
const MAX_BYTES = 40 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses "bytes=a-b", "bytes=a-" or "bytes=-n". Returns null if absent or unsatisfiable. */
function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const [call] = await db()
    .select({ vaaniCallId: schema.calls.vaaniCallId, recordingUrl: schema.calls.recordingUrl })
    .from(schema.calls)
    .where(eq(schema.calls.id, id))
    .limit(1);
  if (!call?.recordingUrl) return new Response("No recording for this call", { status: 404 });

  const key = env().VAANI_API_KEY;
  if (!key) return new Response("Recording playback is not configured", { status: 503 });

  let audio: ArrayBuffer;
  let type = "audio/ogg";
  try {
    const upstream = await fetch(`${VAANI_ORIGIN}/api/stream/${encodeURIComponent(call.vaaniCallId)}`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) return new Response("Recording unavailable", { status: upstream.status === 404 ? 404 : 502 });
    type = upstream.headers.get("content-type") ?? type;
    audio = await upstream.arrayBuffer();
  } catch {
    return new Response("Recording service did not respond", { status: 504 });
  }
  if (audio.byteLength === 0 || audio.byteLength > MAX_BYTES) return new Response("Recording unavailable", { status: 502 });

  const size = audio.byteLength;
  const headers = new Headers({
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=300",
  });
  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("content-length", String(range.end - range.start + 1));
    return new Response(audio.slice(range.start, range.end + 1), { status: 206, headers });
  }
  headers.set("content-length", String(size));
  return new Response(audio, { status: 200, headers });
}
