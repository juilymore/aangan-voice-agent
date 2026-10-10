import { lt } from "drizzle-orm";
import { cronAuthorized, unauthorized } from "@/lib/cron";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

// Nightly retention (build_spec §12): delete calls (and their audit/sync rows, via cascade), raw events
// and tool logs older than RETENTION_MONTHS. Bookings are kept as calendar history.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - env().RETENTION_MONTHS);
  const calls = await db().delete(schema.calls).where(lt(schema.calls.createdAt, cutoff)).returning({ id: schema.calls.id });
  const events = await db().delete(schema.rawEvents).where(lt(schema.rawEvents.receivedAt, cutoff)).returning({ id: schema.rawEvents.id });
  const tools = await db().delete(schema.toolCalls).where(lt(schema.toolCalls.at, cutoff)).returning({ id: schema.toolCalls.id });
  return Response.json({ ok: true, cutoff: cutoff.toISOString(), deleted: { calls: calls.length, rawEvents: events.length, toolCalls: tools.length } });
}
