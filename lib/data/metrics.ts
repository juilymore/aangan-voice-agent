import "server-only";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBusinessSettings } from "@/lib/rules/settings";
import type { BusinessSettings } from "@/lib/rules/settings-schema";
import { istDateKey, istDayStart, istParts, parseIstDate } from "./format";
import { CALL_CATEGORIES, CATEGORY_KEYS, callCategory, type CallCategory } from "./labels";
import { FOLLOWUP_OVERDUE_HOURS } from "./metrics-config";

const { calls, bookings, callAudit } = schema;

export type Period = "30d" | "month" | "all" | "custom";

/** The date filter: a preset, or a custom IST date range (both ends inclusive). */
export type Range = { period: Period; start: Date | null; end: Date | null; from?: string; to?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(sp: { period?: string; from?: string; to?: string }, now: Date): Range {
  let from = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  let to = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  if (from || to) {
    if (from && to && from > to) [from, to] = [to, from];
    const f = parseIstDate(from);
    const t = parseIstDate(to);
    return { period: "custom", start: f, end: t ? istDayStart(t, 1) : null, from, to };
  }
  if (sp.period === "30d") return { period: "30d", start: istDayStart(now, -29), end: null };
  if (sp.period === "month") return { period: "month", start: istDayStart(now, -(istParts(now).day - 1)), end: null };
  return { period: "all", start: null, end: null };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Outside office hours or on a closed day (IST), per the business settings. */
export function isOutsideOffice(hour: number, weekday: number, b: BusinessSettings): boolean {
  return !b.officeDays.includes(weekday) || hour < b.officeStartHour || hour >= b.officeEndHour;
}

const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const sorted = (m: Map<string, number>) =>
  [...m.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);

export async function getMetrics(range: Range, now: Date) {
  const { start, end } = range;
  const when = sql`coalesce(${calls.startedAt}, ${calls.createdAt})`;
  const conds: SQL[] = [];
  if (start) conds.push(sql`${when} >= ${start.toISOString()}`);
  if (end) conds.push(sql`${when} < ${end.toISOString()}`);

  const [rows, bookingRows, overrides, business] = await Promise.all([
    db()
      .select({
        id: calls.id,
        vaaniCallId: calls.vaaniCallId,
        startedAt: calls.startedAt,
        endedAt: calls.endedAt,
        createdAt: calls.createdAt,
        durationSec: calls.durationSec,
        callType: calls.callType,
        qualification: calls.qualification,
        temperature: calls.temperature,
        reasons: calls.qualificationReasons,
        flags: calls.flags,
        complianceFlags: calls.complianceFlags,
        emailSentAt: calls.emailSentAt,
        outcomeStage: calls.outcomeStage,
        outcomeValue: calls.outcomeValue,
        needsFollowup: calls.needsFollowup,
        followupDoneAt: calls.followupDoneAt,
      })
      .from(calls)
      .where(conds.length ? and(...conds) : undefined),
    db().select({ vaaniCallId: bookings.vaaniCallId, status: bookings.status }).from(bookings),
    db()
      .selectDistinct({ callId: callAudit.callId })
      .from(callAudit)
      .where(
        and(
          eq(callAudit.field, "qualification"),
          start ? gte(callAudit.at, start) : undefined,
          end ? lt(callAudit.at, end) : undefined,
        ),
      ),
    getBusinessSettings(),
  ]);

  const bookedVaani = new Set(bookingRows.filter((b) => b.status !== "cancelled").map((b) => b.vaaniCallId));
  const anyBookedVaani = new Set(bookingRows.map((b) => b.vaaniCallId));

  const total = rows.length;
  const leads = rows.filter((r) => r.callType === "new_enquiry");
  const qualified = rows.filter((r) => r.qualification === "qualified");
  // "Booked" counts any consultation made on the call, even if later cancelled: it measures the agent.
  const booked = rows.filter((r) => anyBookedVaani.has(r.vaaniCallId));
  const won = rows.filter((r) => r.outcomeStage === "won");
  const wonValue = won.reduce((s, r) => s + (r.outcomeValue ?? 0), 0);

  const bookedRate = qualified.length
    ? qualified.filter((r) => anyBookedVaani.has(r.vaaniCallId)).length / qualified.length
    : null;

  const emailMinutes = qualified
    .filter((r) => r.endedAt && r.emailSentAt)
    .map((r) => (r.emailSentAt!.getTime() - r.endedAt!.getTime()) / 60000)
    .filter((m) => m >= 0);
  const medianEmailMinutes = median(emailMinutes);

  // ---- When calls come in (IST): by hour of day, and weekday × hour
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    office: 0,
    after: 0,
    inOfficeHours: h >= business.officeStartHour && h < business.officeEndHour,
  }));
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const timed = rows.filter((r) => r.startedAt);
  let afterHours = 0;
  for (const r of timed) {
    const p = istParts(r.startedAt!);
    const outside = isOutsideOffice(p.hour, p.weekday, business);
    if (outside) {
      afterHours++;
      hours[p.hour].after++;
    } else hours[p.hour].office++;
    heat[p.weekday][p.hour]++;
  }
  const afterHoursShare = timed.length ? afterHours / timed.length : null;

  const overdueCutoff = now.getTime() - FOLLOWUP_OVERDUE_HOURS * 3600_000;
  const overdueFollowups = rows.filter(
    (r) => r.needsFollowup && !r.followupDoneAt && (r.endedAt ?? r.createdAt).getTime() < overdueCutoff,
  ).length;

  // ---- What the AI handled
  const catCounts = new Map<CallCategory, number>(CATEGORY_KEYS.map((k) => [k, 0]));
  const otherTypes = new Map<string, number>();
  for (const r of rows) {
    const c = callCategory(r.callType);
    catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    if (c === "other") inc(otherTypes, r.callType ?? "unknown");
  }
  const categories = CATEGORY_KEYS.map((k) => ({ key: k, label: CALL_CATEGORIES[k].label, count: catCounts.get(k) ?? 0 }));

  const notQualifiedReasons = new Map<string, number>();
  const temps = new Map<string, number>();
  let leadQualified = 0;
  let leadNotQualified = 0;
  let leadReview = 0;
  let leadOther = 0;
  for (const r of leads) {
    if (r.qualification === "qualified") {
      leadQualified++;
      inc(temps, r.temperature ?? "unrated");
    } else if (r.qualification === "not_qualified") {
      leadNotQualified++;
      inc(notQualifiedReasons, r.reasons?.decidedBy ?? "unknown");
    } else if (r.qualification === "needs_review") leadReview++;
    else leadOther++;
  }
  const leadBooked = leads.filter((r) => anyBookedVaani.has(r.vaaniCallId)).length;
  const leadConsult = leads.filter((r) => ["consultation_done", "proposal_sent", "won"].includes(r.outcomeStage)).length;
  const leadProposal = leads.filter((r) => ["proposal_sent", "won"].includes(r.outcomeStage)).length;
  const leadWon = leads.filter((r) => r.outcomeStage === "won").length;
  const leadLost = leads.filter((r) => r.outcomeStage === "lost").length;

  const leadFlow = {
    leads: leads.length,
    qualified: leadQualified,
    notQualified: leadNotQualified,
    needsReview: leadReview,
    notJudged: leadOther,
    temperatures: (["hot", "warm", "cold", "unrated"] as const)
      .map((t) => ({ code: t, count: temps.get(t) ?? 0 }))
      .filter((t) => t.count > 0),
    reasons: sorted(notQualifiedReasons),
    pipeline: [
      { key: "booked", label: "Booked", count: leadBooked },
      { key: "consultation", label: "Consultation done", count: leadConsult },
      { key: "proposal", label: "Proposal sent", count: leadProposal },
      { key: "won", label: "Won", count: leadWon },
    ],
    lost: leadLost,
  };

  // ---- Calls per day: the 14 IST days ending at the range end (or today)
  const anchor = end && end.getTime() <= now.getTime() ? new Date(end.getTime() - 1) : now;
  const perDay: { key: string; date: Date; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = istDayStart(anchor, -i);
    perDay.push({ key: istDateKey(d), date: d, count: 0 });
  }
  const dayIdx = new Map(perDay.map((d, i) => [d.key, i]));
  // Compliance flags per week: 8 weeks ending at the anchor day
  const weeks: { start: Date; critical: number; warning: number }[] = [];
  for (let i = 7; i >= 0; i--) weeks.push({ start: istDayStart(anchor, -7 * i - 6), critical: 0, warning: 0 });
  const totalCompliance = { critical: 0, warning: 0 };
  const complianceByCode = new Map<string, number>();

  for (const r of rows) {
    const at = r.startedAt ?? r.createdAt;
    const idx = dayIdx.get(istDateKey(at));
    if (idx != null) perDay[idx].count++;
    for (const f of r.complianceFlags ?? []) {
      const sev = f.severity === "critical" ? "critical" : "warning";
      totalCompliance[sev]++;
      inc(complianceByCode, f.code);
      for (let w = weeks.length - 1; w >= 0; w--) {
        if (at >= weeks[w].start) {
          weeks[w][sev]++;
          break;
        }
      }
    }
  }

  const judged = rows.filter((r) => r.qualification && r.qualification !== "not_a_lead");
  const judgedIds = new Set(judged.map((r) => r.id));
  const overridden = overrides.filter((o) => judgedIds.has(o.callId)).length;
  const overrideRate = judged.length ? overridden / judged.length : null;

  // ---- Revenue the AI can bring (an estimate from the business assumptions)
  const winRate = business.qualifiedToWonPct / 100;
  const afterHoursQualified = qualified.filter((r) => (r.flags ?? []).includes("after_hours")).length;
  const revenue = {
    qualified: qualified.length,
    winRate,
    avgProjectValue: business.avgProjectValueInr,
    tentative: qualified.length * winRate * business.avgProjectValueInr,
    afterHoursQualified,
    afterHoursTentative: afterHoursQualified * winRate * business.avgProjectValueInr,
    wonValue,
    wonCount: won.length,
  };

  // ---- Cost
  const totalMinutes = rows.reduce((s, r) => s + (r.durationSec ?? 0), 0) / 60;
  const voiceCost = totalMinutes * business.voiceRatePerMinInr;
  const aiCost = total * business.aiCostPerCallInr;
  const totalCost = voiceCost + aiCost;
  const pipelineValue = qualified.length * business.avgProjectValueInr;

  return {
    range,
    business,
    total,
    wonValue,
    bookedRate,
    medianEmailMinutes,
    emailSamples: emailMinutes.length,
    afterHoursShare,
    afterHours,
    timedCalls: timed.length,
    hours,
    heat,
    overdueFollowups,
    categories,
    otherTypes: sorted(otherTypes),
    leadFlow,
    perDay,
    complianceWeeks: weeks,
    totalCompliance,
    complianceByCode: sorted(complianceByCode),
    overrideRate,
    overridden,
    judged: judged.length,
    revenue,
    cost: {
      totalMinutes,
      voiceCost,
      aiCost,
      totalCost,
      perCall: total ? totalCost / total : null,
      perQualified: qualified.length ? totalCost / qualified.length : null,
      perBooked: booked.length ? totalCost / booked.length : null,
      pipelineValue,
      valuePerRupee: totalCost > 0 ? pipelineValue / totalCost : null,
      bookedLive: rows.filter((r) => bookedVaani.has(r.vaaniCallId)).length,
    },
  };
}

export type Metrics = Awaited<ReturnType<typeof getMetrics>>;
