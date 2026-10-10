import { after } from "next/server";
import { ingestVaaniEvent, processRawEvent } from "@/lib/pipeline/process";

// Post-call webhook from Vaani — build_spec §8.1: verify signature, store the raw event, answer 200
// fast, then process after the response. Duplicates (same envelope id) are stored once and ignored.
export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 2_000_000) return Response.json({ ok: false, error: "payload too large" }, { status: 413 });

  let result;
  try {
    result = await ingestVaaniEvent(raw, request.headers);
  } catch (e) {
    console.error("webhook ingest failed:", e instanceof Error ? e.message : e);
    // 5xx makes Vaani retry; the reconcile job also picks up anything stored.
    return Response.json({ ok: false }, { status: 500 });
  }
  if (!result.ok) return Response.json({ ok: false, error: "invalid signature" }, { status: 401 });
  if (result.duplicate || !result.rawEventId) return Response.json({ ok: true, duplicate: true });

  const id = result.rawEventId;
  after(async () => {
    try {
      await processRawEvent(id);
    } catch (e) {
      console.error("webhook processing failed (will be retried by reconcile):", e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ ok: true });
}
