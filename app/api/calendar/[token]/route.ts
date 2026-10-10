import { timingSafeEqual } from "node:crypto";
import { and, eq, gte, not, like } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { bookingsToIcs } from "@/lib/calendar/ics";

// GET /api/calendar/<CALENDAR_FEED_TOKEN>: the studio's consultations as an iCal feed.
// Add it in Google Calendar: Other calendars → + → From URL. Demo bookings are never included.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const want = env().CALENDAR_FEED_TOKEN;
  const ok = !!want && token.length === want.length && timingSafeEqual(Buffer.from(token), Buffer.from(want));
  if (!ok) return new Response("Not found", { status: 404 });

  const rows = await db()
    .select({
      id: schema.bookings.id,
      startAt: schema.bookings.startAt,
      endAt: schema.bookings.endAt,
      mode: schema.bookings.mode,
      status: schema.bookings.status,
      designerName: schema.designers.name,
      callerName: schema.bookings.callerName,
      callbackNumber: schema.bookings.callbackNumber,
      locality: schema.bookings.locality,
      society: schema.bookings.society,
      createdAt: schema.bookings.createdAt,
    })
    .from(schema.bookings)
    .leftJoin(schema.designers, eq(schema.designers.key, schema.bookings.designer))
    .where(and(gte(schema.bookings.startAt, new Date(Date.now() - 30 * 86_400_000)), not(like(schema.bookings.vaaniCallId, "demo-%"))));

  return new Response(bookingsToIcs(rows, env().APP_URL), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
  });
}
