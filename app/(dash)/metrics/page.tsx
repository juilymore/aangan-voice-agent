import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPersona } from "@/lib/persona";
import { getMetrics, type Period } from "@/lib/data/metrics";
import { formatInr, formatInrCompact, formatNumber, formatPct } from "@/lib/data/format";
import { callTypeLabel, complianceLabel, decidedByLabel } from "@/lib/data/labels";
import {
  COST_NOTE,
  AI_INR_PER_CALL,
  AVG_PROJECT_VALUE_INR,
  BASELINE_AFTER_HOURS_SHARE,
  BASELINE_NOTE,
  BUSINESS_HOURS_IST,
  VOICE_INR_PER_MIN,
} from "@/lib/data/metrics-config";
import { CountUp } from "@/components/count-up";
import { EmptyState, Eyebrow, GlassCard, SectionTitle, StatTile } from "@/components/ui";
import { CalendarIcon, ChartIcon, ClockIcon, MailIcon, ShieldIcon, SparkleIcon, WalletIcon } from "@/components/icons";

export const metadata = { title: "Metrics · Aangan Leads" };

const PERIODS: { key: Period; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const wdFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "narrow" });

export default async function MetricsPage({ searchParams }: PageProps<"/metrics">) {
  const persona = await currentPersona();
  if (persona.role !== "owner") redirect("/");
  const sp = await searchParams;
  const period: Period = PERIODS.some((p) => p.key === sp.period) ? (sp.period as Period) : "all";
  const now = new Date();
  const m = await getMetrics(period, now);

  const funnelMax = Math.max(1, m.funnel[0].count);
  const reasonMax = Math.max(1, ...m.notQualifiedReasons.map((r) => r.count));
  const typeMax = Math.max(1, ...m.callTypes.map((r) => r.count));
  const dayMax = Math.max(1, ...m.perDay.map((d) => d.count));
  const weekMax = Math.max(1, ...m.complianceWeeks.map((w) => w.critical + w.warning));

  return (
    <div className="stagger space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="eyebrow mb-3">For Nikhil · the monthly pull, done</p>
          <h1 className="display text-3xl text-ink sm:text-4xl">Metrics</h1>
          <p className="mt-2 text-sm text-slate">
            {m.total === 0 ? "No calls in this period yet." : `${formatNumber(m.total)} calls · ${formatNumber(m.cost.totalMinutes)} minutes on the line`}
          </p>
        </div>
        <nav aria-label="Period" className="glass inline-flex rounded-full p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "all" ? "/metrics" : `/metrics?period=${p.key}`}
              aria-current={p.key === period ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] transition-all duration-200 ${
                p.key === period ? "bg-ink text-white shadow-sm" : "text-mute hover:text-ink"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </section>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={CalendarIcon}
          value={m.bookedRate == null ? "—" : <CountUp value={m.bookedRate} format="pct" />}
          label="Booked on the call"
          hint="of qualified leads"
        />
        <StatTile
          icon={MailIcon}
          value={m.medianEmailMinutes == null ? "—" : <><CountUp value={m.medianEmailMinutes} format="dec1" /> min</>}
          label="Call end → designer email"
          hint={m.emailSamples ? `median of ${m.emailSamples} qualified` : "no emails yet"}
        />
        <StatTile
          icon={ClockIcon}
          tone="clay"
          value={m.afterHoursShare == null ? "—" : <CountUp value={m.afterHoursShare} format="pct" />}
          label="After hours"
          hint={`outside ${BUSINESS_HOURS_IST.start}:00–${BUSINESS_HOURS_IST.end}:00 · was ${formatPct(BASELINE_AFTER_HOURS_SHARE)}`}
        />
        <StatTile
          icon={ShieldIcon}
          tone="sage"
          value={m.overrideRate == null ? "—" : <CountUp value={m.overrideRate} format="pct" />}
          label="Override rate"
          hint={`${m.overridden} of ${m.judged} verdicts changed`}
        />
      </div>

      <p className="glass rounded-2xl px-5 py-3 text-sm text-slate">
        <span className="eyebrow mr-2">Baseline</span>
        {BASELINE_NOTE}
        {m.overdueFollowups > 0 && (
          <span className="ml-2 text-terracotta">· {m.overdueFollowups} {m.overdueFollowups === 1 ? "follow-up" : "follow-ups"} overdue past 24h right now.</span>
        )}
      </p>

      {/* Funnel */}
      <GlassCard className="p-5 sm:p-7">
        <SectionTitle
          eyebrow="From ring to signed"
          title="Funnel"
          action={
            <span className="text-sm text-slate">
              Won value <span className="font-[family-name:var(--font-jost)] text-lg text-ink">{formatInr(m.wonValue)}</span>
            </span>
          }
        />
        {m.total === 0 ? (
          <EmptyState icon={ChartIcon} title="Nothing to count yet">
            The funnel fills in as calls arrive and designers record outcomes.
          </EmptyState>
        ) : (
          <ol className="space-y-2.5">
            {m.funnel.map((f, i) => {
              const prev = i > 0 ? m.funnel[i - 1].count : null;
              const conv = prev ? f.count / prev : null;
              return (
                <li key={f.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[10rem_1fr_7rem]">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate">{f.label}</span>
                  <span className="relative h-8 overflow-hidden rounded-md bg-linen/70">
                    <span
                      className="bar-grow absolute inset-y-0 left-0 rounded-md"
                      style={{
                        width: `${Math.max(f.count ? 2 : 0, (f.count / funnelMax) * 100)}%`,
                        background: f.key === "won" ? "#3f6b4f" : `rgba(17,24,39,${0.92 - i * 0.1})`,
                        animationDelay: `${i * 70}ms`,
                      }}
                    />
                  </span>
                  <span className="text-right">
                    <span className="font-[family-name:var(--font-jost)] text-lg text-ink">
                      <CountUp value={f.count} />
                    </span>
                    {conv != null && <span className="ml-2 text-[11px] text-mute">{formatPct(conv)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calls per day */}
        <GlassCard className="p-5 sm:p-6">
          <SectionTitle eyebrow="Volume" title="Calls per day" action={<span className="text-xs text-mute">last 14 days</span>} />
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Calls per day over the last 14 days">
            {m.perDay.map((d, i) => (
              <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-mute">{d.count || ""}</span>
                <span
                  className="bar-grow-v w-full rounded-t-md bg-ink/85"
                  style={{ height: `${(d.count / dayMax) * 100}%`, minHeight: d.count ? 4 : 1, animationDelay: `${i * 30}ms` }}
                  title={`${dayFmt.format(d.date)}: ${d.count}`}
                />
                <span className="text-[9px] text-mute">{wdFmt.format(d.date)}</span>
              </div>
            ))}
          </div>
          {m.callTypes.length > 0 && (
            <ul className="mt-6 space-y-2 border-t border-line pt-4">
              {m.callTypes.map((t) => (
                <BarRow key={t.code} label={callTypeLabel(t.code)} count={t.count} max={typeMax} color="#9c8566" />
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Not-qualified reasons */}
        <GlassCard className="p-5 sm:p-6">
          <SectionTitle eyebrow="Quality" title="Why not qualified" />
          {m.notQualifiedReasons.length === 0 ? (
            <EmptyState icon={SparkleIcon} title="None turned away">
              No calls were marked not qualified in this period.
            </EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {m.notQualifiedReasons.map((r) => (
                <BarRow key={r.code} label={decidedByLabel(r.code)} count={r.count} max={reasonMax} color="#b0563a" />
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Compliance */}
      <GlassCard className="p-5 sm:p-6">
        <SectionTitle
          eyebrow="Never say a price"
          title="Compliance flags"
          action={
            <span className="flex items-center gap-3 text-[11px] text-mute">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-alert" /> Critical {m.totalCompliance.critical}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-[#d9a54c]" /> Warning {m.totalCompliance.warning}
              </span>
            </span>
          }
        />
        <div className="flex h-36 items-end gap-2 sm:gap-4" role="img" aria-label="Compliance flags per week, last 8 weeks">
          {m.complianceWeeks.map((w, i) => {
            const total = w.critical + w.warning;
            return (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-mute">{total || ""}</span>
                <div
                  className="bar-grow-v flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-md"
                  style={{ height: `${(total / weekMax) * 100}%`, minHeight: 1, animationDelay: `${i * 50}ms` }}
                >
                  <span className="w-full bg-[#d9a54c]" style={{ flexGrow: w.warning }} />
                  <span className="w-full bg-alert" style={{ flexGrow: w.critical }} />
                  {total === 0 && <span className="h-px w-full bg-line" />}
                </div>
                <span className="text-[9px] text-mute">{dayFmt.format(w.start)}</span>
              </div>
            );
          })}
        </div>
        {m.complianceByCode.length > 0 && (
          <p className="mt-4 text-xs text-slate">
            {m.complianceByCode.map((c) => `${complianceLabel(c.code)}: ${c.count}`).join(" · ")}
          </p>
        )}
      </GlassCard>

      {/* Cost */}
      <GlassCard className="p-5 sm:p-7">
        <SectionTitle eyebrow="What it costs, what it brings" title="Cost & value" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            <CostLine label={`Voice · ${formatNumber(m.cost.totalMinutes)} min × ₹${VOICE_INR_PER_MIN}`} value={formatInr(m.cost.voiceCost)} />
            <CostLine label={`AI · ${m.total} calls × ~₹${AI_INR_PER_CALL}`} value={formatInr(m.cost.aiCost)} />
            <CostLine label="Email, CRM" value="₹0 (free tiers)" muted />
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="eyebrow">Total running cost</span>
              <span className="font-[family-name:var(--font-jost)] text-2xl font-light text-ink">
                <CountUp value={Math.round(m.cost.totalCost)} format="inr" />
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-3">
            <MiniStat label="Per call" value={m.cost.perCall == null ? "—" : formatInr(m.cost.perCall, true)} />
            <MiniStat label="Per qualified lead" value={m.cost.perQualified == null ? "—" : formatInr(m.cost.perQualified, true)} />
            <MiniStat label="Per booked consult" value={m.cost.perBooked == null ? "—" : formatInr(m.cost.perBooked, true)} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-5 rounded-2xl bg-ink px-5 py-5 text-white sm:px-7">
          <span className="inline-flex size-12 items-center justify-center rounded-md bg-white/10">
            <WalletIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">Estimated pipeline value per ₹1 spent</p>
            <p className="font-[family-name:var(--font-jost)] text-3xl font-light">
              {m.cost.valuePerRupee == null ? "—" : <>₹<CountUp value={Math.round(m.cost.valuePerRupee)} /></>}
            </p>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-white/70">
            {formatNumber(m.funnel[2].count)} qualified × {formatInrCompact(AVG_PROJECT_VALUE_INR)} (midpoint of the usual ₹8–14 L project) ={" "}
            {formatInrCompact(m.cost.pipelineValue)} in pipeline. An estimate, not revenue.
          </p>
        </div>
        <p className="mt-3 text-[11px] text-mute">{COST_NOTE}</p>
      </GlassCard>
    </div>
  );
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3 sm:grid-cols-[minmax(0,13rem)_1fr_2rem]">
      <span className="truncate text-xs text-slate" title={label}>
        {label}
      </span>
      <span className="h-2.5 overflow-hidden rounded-full bg-linen/80">
        <span className="bar-grow block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: color }} />
      </span>
      <span className="text-right text-xs tabular-nums text-ink">{count}</span>
    </li>
  );
}

function CostLine({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate">{label}</span>
      <span className={muted ? "text-mute" : "tabular-nums text-ink"}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="lift rounded-xl border border-white/70 bg-white/55 px-4 py-4">
      <Eyebrow className="!text-[0.58rem]">{label}</Eyebrow>
      <p className="mt-1 font-[family-name:var(--font-jost)] text-xl font-light tabular-nums text-ink">{value}</p>
    </div>
  );
}
