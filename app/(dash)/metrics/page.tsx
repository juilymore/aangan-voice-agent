import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPersona } from "@/lib/persona";
import { getMetrics, isOutsideOffice, resolveRange, type Period } from "@/lib/data/metrics";
import { formatFullDate, formatInr, formatInrCompact, formatNumber, formatPct } from "@/lib/data/format";
import { CALL_CATEGORIES, callTypeLabel, complianceLabel, decidedByLabel, type CallCategory } from "@/lib/data/labels";
import { BASELINE_AFTER_HOURS_SHARE, BASELINE_NOTE, COST_NOTE } from "@/lib/data/metrics-config";
import { CountUp } from "@/components/count-up";
import { EmptyState, Eyebrow, GlassCard, InfoTip, SectionTitle, StatTile, buttonClass, inputClass } from "@/components/ui";
import { HourChart, LeadFlow, PipelineSteps, WeekHeatmap } from "@/components/metrics-charts";
import { ArrowRightIcon, CalendarIcon, ChartIcon, ClockIcon, MailIcon, ShieldIcon, WalletIcon } from "@/components/icons";

export const metadata = { title: "Metrics · Aangan Leads" };

const PERIODS: { key: Exclude<Period, "custom">; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

const CATEGORY_COLORS: Record<CallCategory, string> = {
  lead: "#3b7d55",
  client_update: "#c99234",
  complaint: "#b0563a",
  other: "#4b5f86",
};

const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const wdFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "narrow" });
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function officeDaysText(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (s.join() === "1,2,3,4,5,6") return "Mon–Sat";
  if (s.join() === "1,2,3,4,5") return "Mon–Fri";
  if (s.length === 7) return "every day";
  return s.map((d) => DAY_NAMES[d]).join(", ");
}

export default async function MetricsPage({ searchParams }: PageProps<"/metrics">) {
  const persona = await currentPersona();
  if (persona.role !== "owner") redirect("/");
  const sp = await searchParams;
  const now = new Date();
  const range = resolveRange({ period: one(sp.period), from: one(sp.from), to: one(sp.to) }, now);
  const m = await getMetrics(range, now);
  const b = m.business;
  const officeLabel = `${hh(b.officeStartHour)}–${hh(b.officeEndHour)}, ${officeDaysText(b.officeDays)}`;

  const catMax = Math.max(1, ...m.categories.map((c) => c.count));
  const dayMax = Math.max(1, ...m.perDay.map((d) => d.count));
  const weekMax = Math.max(1, ...m.complianceWeeks.map((w) => w.critical + w.warning));
  const isOutside = (h: number, d: number) => isOutsideOffice(h, d, b);

  const rangeText =
    range.period === "custom"
      ? `${range.from ? formatFullDate(range.start) : "the start"} to ${range.to ? formatFullDate(new Date(range.end!.getTime() - 1)) : "today"}`
      : PERIODS.find((p) => p.key === range.period)?.label.toLowerCase();

  return (
    <div className="stagger space-y-8">
      <section className="space-y-4 pt-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">For Nikhil · the monthly pull, done</p>
            <h1 className="display text-3xl text-ink sm:text-4xl">Metrics</h1>
            <p className="mt-2 text-sm text-slate">
              {m.total === 0
                ? "No calls in this period yet."
                : `${formatNumber(m.total)} calls · ${formatNumber(m.cost.totalMinutes)} minutes on the line`}
              <span className="text-mute"> · {rangeText}</span>
            </p>
          </div>
          <nav aria-label="Period" className="glass inline-flex max-w-full overflow-x-auto rounded-full p-1">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={p.key === "all" ? "/metrics" : `/metrics?period=${p.key}`}
                aria-current={p.key === range.period ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] transition-all duration-200 ${
                  p.key === range.period ? "bg-ink text-white shadow-sm" : "text-mute hover:text-ink"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        <form
          method="get"
          action="/metrics"
          className="glass grid grid-cols-2 items-end gap-3 rounded-2xl px-4 py-3 sm:flex sm:flex-wrap"
          aria-label="Custom date range"
        >
          <label className="block">
            <span className="eyebrow mb-1.5 block !text-[0.6rem]">From</span>
            <input type="date" name="from" defaultValue={range.from} className={inputClass} />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block !text-[0.6rem]">To</span>
            <input type="date" name="to" defaultValue={range.to} className={inputClass} />
          </label>
          <button type="submit" className={buttonClass(range.period === "custom" ? "primary" : "ghost")}>
            Apply range
          </button>
          {range.period === "custom" && (
            <Link href="/metrics" className="text-[10px] uppercase tracking-[0.18em] text-mute hover:text-ink">
              Clear
            </Link>
          )}
          <span className="col-span-2 text-[11px] text-mute sm:ml-auto">Dates in IST, both days included.</span>
        </form>
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
          value={
            m.medianEmailMinutes == null ? (
              "—"
            ) : m.medianEmailMinutes < 120 ? (
              <>
                <CountUp value={m.medianEmailMinutes} format="dec1" /> min
              </>
            ) : m.medianEmailMinutes < 48 * 60 ? (
              <>
                <CountUp value={m.medianEmailMinutes / 60} format="dec1" /> hrs
              </>
            ) : (
              <>
                <CountUp value={m.medianEmailMinutes / 1440} format="dec1" /> days
              </>
            )
          }
          label="Call end → designer email"
          hint={m.emailSamples ? `median of ${m.emailSamples} qualified` : "no emails yet"}
        />
        <StatTile
          icon={ClockIcon}
          tone="clay"
          value={m.afterHoursShare == null ? "—" : <CountUp value={m.afterHoursShare} format="pct" />}
          label="After hours"
          hint={`outside ${officeLabel} · was ${formatPct(BASELINE_AFTER_HOURS_SHARE)}`}
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
          <span className="ml-2 text-terracotta">
            · {m.overdueFollowups} {m.overdueFollowups === 1 ? "follow-up" : "follow-ups"} overdue past 24h right now.
          </span>
        )}
      </p>

      {/* Revenue */}
      <GlassCard className="p-5 sm:p-7" aria-labelledby="revenue-title">
        <SectionTitle
          id="revenue-title"
          eyebrow="An estimate, not booked revenue"
          title="Revenue the AI can bring"
          action={
            <Link
              href="/rubric#business"
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-mute hover:text-ink"
            >
              Edit assumptions <ArrowRightIcon size={12} />
            </Link>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-ink px-5 py-5 text-white sm:col-span-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">Tentative revenue · estimate</p>
            <p className="mt-1 font-[family-name:var(--font-jost)] text-3xl font-light">
              {formatInrCompact(m.revenue.tentative)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/70">
              {formatNumber(m.revenue.qualified)} qualified × {b.qualifiedToWonPct}% usually won ×{" "}
              {formatInrCompact(b.avgProjectValueInr)} average project
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/55 px-5 py-5">
            <p className="eyebrow !text-[0.6rem]">Actually won</p>
            <p className="mt-1 font-[family-name:var(--font-jost)] text-3xl font-light text-ink">
              {formatInrCompact(m.revenue.wonValue)}
            </p>
            <p className="mt-2 text-xs text-slate">
              {m.revenue.wonCount} {m.revenue.wonCount === 1 ? "project" : "projects"} marked won, from recorded values.
            </p>
          </div>
          <div className="rounded-2xl border border-clay/30 bg-terracotta-soft/50 px-5 py-5">
            <p className="eyebrow !text-[0.6rem]">From after-hours leads</p>
            <p className="mt-1 font-[family-name:var(--font-jost)] text-3xl font-light text-ink">
              {formatInrCompact(m.revenue.afterHoursTentative)}
            </p>
            <p className="mt-2 text-xs text-slate">
              {m.revenue.afterHoursQualified} qualified {m.revenue.afterHoursQualified === 1 ? "lead" : "leads"} called outside
              office hours
              {m.revenue.tentative > 0
                ? ` (${formatPct(m.revenue.afterHoursTentative / m.revenue.tentative)} of the estimate)`
                : ""}
              : the front desk would have missed them.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mute">
          Assumptions: average project {formatInr(b.avgProjectValueInr)}, {b.qualifiedToWonPct}% of qualified leads become
          projects. Change them on{" "}
          <Link href="/rubric#business" className="underline underline-offset-2 hover:text-ink">
            Rubric → Business assumptions
          </Link>
          .
        </p>
      </GlassCard>

      {/* What the AI handled */}
      <GlassCard className="p-5 sm:p-7" aria-labelledby="handled-title">
        <SectionTitle id="handled-title" eyebrow="Every call, sorted" title="What the AI handled" />
        {m.total === 0 ? (
          <EmptyState icon={ChartIcon} title="Nothing to count yet">
            This fills in as calls arrive and designers record outcomes.
          </EmptyState>
        ) : (
          <div className="space-y-8">
            <ul className="space-y-2.5">
              {m.categories.map((c) => (
                <BarRow
                  key={c.key}
                  label={c.label}
                  count={c.count}
                  max={catMax}
                  color={CATEGORY_COLORS[c.key]}
                  hint={CALL_CATEGORIES[c.key].hint}
                />
              ))}
            </ul>
            {m.otherTypes.length > 0 && (
              <p className="-mt-5 text-[11px] text-mute">
                Other: {m.otherTypes.map((t) => `${callTypeLabel(t.code)} ${t.count}`).join(" · ")}
              </p>
            )}

            <div className="border-t border-line pt-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Eyebrow>Where the {m.leadFlow.leads} leads ended up</Eyebrow>
                <InfoTip label="About the lead flow" align="left">
                  Each lead gets a verdict from the studio rubric. Qualified leads are rated hot, warm or cold; not-qualified
                  leads show the rule that decided it. Hover a band for its count.
                </InfoTip>
              </div>
              {m.leadFlow.leads === 0 ? (
                <p className="text-sm text-mute">No leads in this period.</p>
              ) : (
                <LeadFlow flow={m.leadFlow} />
              )}
            </div>

            <div className="border-t border-line pt-6">
              <Eyebrow className="mb-3">Then, after the call</Eyebrow>
              <PipelineSteps flow={m.leadFlow} />
              <p className="mt-2 text-[11px] text-mute">
                Booked counts consultations made on the call, even if moved or cancelled later.
              </p>
            </div>
          </div>
        )}
      </GlassCard>

      {/* When calls come in */}
      <GlassCard className="p-5 sm:p-7" aria-labelledby="when-title">
        <SectionTitle
          id="when-title"
          eyebrow="Hour of day, IST"
          title="When calls come in"
          action={
            <span className="text-xs text-mute">
              {m.afterHours} of {m.timedCalls} outside office hours
            </span>
          }
        />
        <HourChart hours={m.hours} officeLabel={officeLabel} />
        <div className="mt-8 border-t border-line pt-6">
          <Eyebrow className="mb-3">Weekday × hour</Eyebrow>
          <WeekHeatmap heat={m.heat} isOutside={isOutside} />
        </div>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calls per day */}
        <GlassCard className="p-5 sm:p-6">
          <SectionTitle
            eyebrow="Volume"
            title="Calls per day"
            action={<span className="text-xs text-mute">14 days to {dayFmt.format(m.perDay[13].date)}</span>}
          />
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Calls per day over 14 days">
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
        </GlassCard>

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
          <div className="flex h-36 items-end gap-2 sm:gap-4" role="img" aria-label="Compliance flags per week, 8 weeks">
            {m.complianceWeeks.map((w, i) => {
              const total = w.critical + w.warning;
              return (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] tabular-nums text-mute">{total || ""}</span>
                  <div
                    className="bar-grow-v flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-md"
                    style={{ height: `${(total / weekMax) * 100}%`, minHeight: 1, animationDelay: `${i * 50}ms` }}
                    title={`Week of ${dayFmt.format(w.start)}: ${w.critical} critical, ${w.warning} warning`}
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
      </div>

      {/* Cost */}
      <GlassCard className="p-5 sm:p-7">
        <SectionTitle eyebrow="What it costs" title="Cost & value" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            <CostLine
              label={`Voice · ${formatNumber(m.cost.totalMinutes)} min × ₹${b.voiceRatePerMinInr}`}
              value={formatInr(m.cost.voiceCost)}
            />
            <CostLine label={`AI · ${m.total} calls × ~₹${b.aiCostPerCallInr}`} value={formatInr(m.cost.aiCost)} />
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
            <MiniStat
              label="Per qualified lead"
              value={m.cost.perQualified == null ? "—" : formatInr(m.cost.perQualified, true)}
            />
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
              {m.cost.valuePerRupee == null ? (
                "—"
              ) : (
                <>
                  ₹<CountUp value={Math.round(m.cost.valuePerRupee)} />
                </>
              )}
            </p>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-white/70">
            {formatNumber(m.revenue.qualified)} qualified × {formatInrCompact(b.avgProjectValueInr)} average project ={" "}
            {formatInrCompact(m.cost.pipelineValue)} in pipeline. An estimate, not revenue.
          </p>
        </div>
        <p className="mt-3 text-[11px] text-mute">{COST_NOTE}</p>
      </GlassCard>

      {m.leadFlow.reasons.length > 0 && (
        <p className="sr-only">
          Not qualified reasons: {m.leadFlow.reasons.map((r) => `${decidedByLabel(r.code)} ${r.count}`).join(", ")}.
        </p>
      )}
    </div>
  );
}

function BarRow({ label, count, max, color, hint }: { label: string; count: number; max: number; color: string; hint?: string }) {
  return (
    <li
      className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 sm:grid-cols-[minmax(0,13rem)_1fr_2.5rem]"
      title={hint}
    >
      <span className="truncate text-xs text-slate">{label}</span>
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
