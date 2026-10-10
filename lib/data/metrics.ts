import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { istDateKey, istDayStart, istParts } from "./format";
import {
  AI_INR_PER_CALL,
  AVG_PROJECT_VALUE_INR,
  BUSINESS_HOURS_IST,
  FOLLOWUP_OVERDUE_HOURS,
  VOICE_INR_PER_MIN,
} from "./metrics-config";

const { calls, bookings, callAudit } = schema;

export type Period = "30d" | "month" | "all";

export function periodStart(period: Period, now: Date): Date | null {
  if (period === "30d") return istDayStart(now, -29);
  if (period === "month") {
    const p = istParts(now);
    return istDayStart(now, -(p.day - 1));
  }
  return null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function getMetrics(period: Period, now: Date) {
  const start = periodStart(period, now);
  const since = start ? sql`coalesce(${calls.startedAt}, ${calls.createdAt}) >= ${start.toISOString()}` : undefined;

  const [rows, bookingRows, overrides] = await Promise.all([
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
        reasons: calls.qualificationReasons,
        complianceFlags: calls.complianceFlags,
        emailSentAt: calls.emailSentAt,
        outcomeStage: calls.outcomeStage,
        outcomeValue: calls.outcomeValue,
        needsFollowup: calls.needsFollowup,
        followupDoneAt: calls.followupDoneAt,
      })
      .from(calls)
      .where(since),
    db().select({ vaaniCallId: bookings.vaaniCallId, status: bookings.status }).from(bookings),
    db()
      .selectDistinct({ callId: callAudit.callId })
      .from(callAudit)
      .where(and(eq(callAudit.field, "qualification"), start ? gte(callAudit.at, start) : undefined)),
  ]);

  const bookedVaani = new Set(bookingRows.filter((b) => b.status !== "cancelled").map((b) => b.vaaniCallId));
  const anyBookedVaani = new Set(bookingRows.map((b) => b.vaaniCallId));

  const total = rows.length;
  const enquiries = rows.filter((r) => r.callType === "new_enquiry");
  const qualified = rows.filter((r) => r.qualification === "qualified");
  // "Booked" counts any consultation made on the call, even if later cancelled: it measures the agent.
  const booked = rows.filter((r) => anyBookedVaani.has(r.vaaniCallId));
  const consultDone = rows.filter((r) => ["consultation_done", "proposal_sent", "won"].includes(r.outcomeStage));
  const proposal = rows.filter((r) => ["proposal_sent", "won"].includes(r.outcomeStage));
  const won = rows.filter((r) => r.outcomeStage === "won");
  const wonValue = won.reduce((s, r) => s + (r.outcomeValue ?? 0), 0);

  const funnel = [
    { key: "calls", label: "Calls", count: total },
    { key: "enquiries", label: "New enquiries", count: enquiries.length },
    { key: "qualified", label: "Qualified", count: qualified.length },
    { key: "booked", label: "Booked", count: booked.length },
    { key: "consultation", label: "Consultation done", count: consultDone.length },
    { key: "proposal", label: "Proposal sent", count: proposal.length },
    { key: "won", label: "Won", count: won.length },
  ];

  const bookedRate = qualified.length ? qualified.filter((r) => anyBookedVaani.has(r.vaaniCallId)).length / qualified.length : null;

  const emailMinutes = qualified
    .filter((r) => r.endedAt && r.emailSentAt)
    .map((r) => (r.emailSentAt!.getTime() - r.endedAt!.getTime()) / 60000)
    .filter((m) => m >= 0);
  const medianEmailMinutes = median(emailMinutes);

  const timed = rows.filter((r) => r.startedAt);
  const afterHours = timed.filter((r) => {
    const h = istParts(r.startedAt!).hour;
    return h < BUSINESS_HOURS_IST.start || h >= BUSINESS_HOURS_IST.end;
  }).length;
  const afterHoursShare = timed.length ? afterHours / timed.length : null;

  const overdueCutoff = now.getTime() - FOLLOWUP_OVERDUE_HOURS * 3600_000;
  const overdueFollowups = rows.filter(
    (r) => r.needsFollowup && !r.followupDoneAt && (r.endedAt ?? r.createdAt).getTime() < overdueCutoff,
  ).length;

  // Not-qualified reasons
  const reasonCounts = new Map<string, number>();
  for (const r of rows.filter((r) => r.qualification === "not_qualified")) {
    const k = r.reasons?.decidedBy ?? "unknown";
    reasonCounts.set(k, (reasonCounts.get(k) ?? 0) + 1);
  }
  const notQualifiedReasons = [...reasonCounts.entries()]
    .map(([code, n]) => ({ code, count: n }))
    .sort((a, b) => b.count - a.count);

  // Call types
  const typeCounts = new Map<string, number>();
  for (const r of rows) {
    const k = r.callType ?? "unknown";
    typeCounts.set(k, (typeCounts.get(k) ?? 0) + 1);
  }
  const callTypes = [...typeCounts.entries()].map(([code, n]) => ({ code, count: n })).sort((a, b) => b.count - a.count);

  // Calls per day: last 14 IST days
  const perDay: { key: string; date: Date; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = istDayStart(now, -i);
    perDay.push({ key: istDateKey(d), date: d, count: 0 });
  }
  const dayIdx = new Map(perDay.map((d, i) => [d.key, i]));
  // Compliance flags per week: last 8 weeks (each bucket ends on today)
  const weeks: { start: Date; critical: number; warning: number }[] = [];
  for (let i = 7; i >= 0; i--) weeks.push({ start: istDayStart(now, -7 * i - 6), critical: 0, warning: 0 });
  const totalCompliance = { critical: 0, warning: 0 };
  const complianceByCode = new Map<string, number>();

  for (const r of rows) {
    const at = r.startedAt ?? r.createdAt;
    const idx = dayIdx.get(istDateKey(at));
    if (idx != null) perDay[idx].count++;
    for (const f of r.complianceFlags ?? []) {
      const sev = f.severity === "critical" ? "critical" : "warning";
      totalCompliance[sev]++;
      complianceByCode.set(f.code, (complianceByCode.get(f.code) ?? 0) + 1);
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

  // Cost (functional_design §13)
  const totalMinutes = rows.reduce((s, r) => s + (r.durationSec ?? 0), 0) / 60;
  const voiceCost = totalMinutes * VOICE_INR_PER_MIN;
  const aiCost = total * AI_INR_PER_CALL;
  const totalCost = voiceCost + aiCost;
  const pipelineValue = qualified.length * AVG_PROJECT_VALUE_INR;

  return {
    period,
    start,
    total,
    funnel,
    wonValue,
    bookedRate,
    medianEmailMinutes,
    emailSamples: emailMinutes.length,
    afterHoursShare,
    overdueFollowups,
    notQualifiedReasons,
    callTypes,
    perDay,
    complianceWeeks: weeks,
    totalCompliance,
    complianceByCode: [...complianceByCode.entries()].map(([code, n]) => ({ code, count: n })),
    overrideRate,
    overridden,
    judged: judged.length,
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
