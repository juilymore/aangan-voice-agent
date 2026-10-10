import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import type { Deps } from "@/lib/providers";
import { digestEmail } from "@/lib/email/templates";

const IST = 330 * 60_000;
const istMidnight = (now: Date, offsetDays: number) => {
  const t = new Date(now.getTime() + IST);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + offsetDays) - IST);
};

/** 08:00 IST digest to Nikhil, with a silence alarm (build_spec §9). */
export async function sendDigest(d: Deps, now = new Date()) {
  const conn = db();
  const yStart = istMidnight(now, -1);
  const tStart = istMidnight(now, 0);
  const tomorrowStart = istMidnight(now, 1);
  const dayAfter = istMidnight(now, 2);

  const count = async (where: ReturnType<typeof and>) =>
    (await conn.select({ n: sql<number>`count(*)::int` }).from(schema.calls).where(where))[0]?.n ?? 0;
  const yesterday = and(gte(schema.calls.startedAt, yStart), lt(schema.calls.startedAt, tStart));

  const [calls, qualified, notQualified, needsReview, last24] = await Promise.all([
    count(yesterday),
    count(and(yesterday, eq(schema.calls.qualification, "qualified"))),
    count(and(yesterday, eq(schema.calls.qualification, "not_qualified"))),
    count(and(yesterday, eq(schema.calls.qualification, "needs_review"))),
    count(and(gte(schema.calls.startedAt, new Date(now.getTime() - 86_400_000)), eq(schema.calls.isTest, false))),
  ]);
  const booked = (
    await conn
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(and(gte(schema.bookings.createdAt, yStart), lt(schema.bookings.createdAt, tStart), eq(schema.bookings.status, "confirmed")))
  )[0]?.n ?? 0;
  const openEscalations = await count(and(eq(schema.calls.callType, "existing_client_issue"), isNull(schema.calls.followupDoneAt)));
  const overdueFollowups = await count(
    and(eq(schema.calls.needsFollowup, true), isNull(schema.calls.followupDoneAt), lt(schema.calls.createdAt, new Date(now.getTime() - 86_400_000))),
  );
  const deadSyncJobs = (await conn.select({ n: sql<number>`count(*)::int` }).from(schema.syncJobs).where(eq(schema.syncJobs.status, "dead")))[0]?.n ?? 0;
  const complianceFlags =
    (await conn.select({ n: sql<number>`coalesce(sum(jsonb_array_length(${schema.calls.complianceFlags})),0)::int` }).from(schema.calls).where(yesterday))[0]?.n ?? 0;

  const tomorrow = await conn
    .select({ startAt: schema.bookings.startAt, name: schema.bookings.callerName, designer: schema.designers.name, mode: schema.bookings.mode })
    .from(schema.bookings)
    .leftJoin(schema.designers, eq(schema.designers.key, schema.bookings.designer))
    .where(and(eq(schema.bookings.status, "confirmed"), gte(schema.bookings.startAt, tomorrowStart), lt(schema.bookings.startAt, dayAfter)))
    .orderBy(schema.bookings.startAt);

  const fmt = (x: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(x);
  const e = env();
  const m = digestEmail({
    date: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(now),
    calls,
    qualified,
    booked,
    notQualified,
    needsReview,
    openEscalations,
    overdueFollowups,
    deadSyncJobs,
    complianceFlags,
    tomorrow: tomorrow.map((t) => ({ time: fmt(t.startAt), name: t.name ?? "Caller", designer: t.designer ?? "", mode: t.mode === "site_visit" ? "Site visit" : "Phone call" })),
    silent: last24 === 0,
    dashboardUrl: e.APP_URL,
  });
  const to = e.OWNER_EMAIL ?? e.EMAIL_TEST_TO;
  if (!to) throw new Error("no OWNER_EMAIL configured for the digest");
  const dateKey = new Date(now.getTime() + IST).toISOString().slice(0, 10);
  await d.email.send({ to, ...m, idempotencyKey: `digest:${dateKey}` });
  return { to, subject: m.subject, silent: last24 === 0 };
}
