// Hand-made charts for the Metrics page (server components, no chart library).
// Colours come from the studio palette; every chart has direct labels or a legend, a native
// hover title per mark, and a text alternative.
import { decidedByLabel, TEMPERATURE_LABELS } from "@/lib/data/labels";
import type { Metrics } from "@/lib/data/metrics";
import { formatPct } from "@/lib/data/format";

// Validated as a set (adjacent CVD ΔE ≥ 12): muted to sit with the ivory/navy studio look.
export const FLOW_COLORS = {
  qualified: "#3b7d55",
  review: "#c99234",
  notQualified: "#b0563a",
  other: "#4b5f86",
  hot: "#b0563a",
  warm: "#c99234",
  cold: "#4b5f86",
  unrated: "#9aa3b2",
} as const;
const INK = "#1f2937";
const AFTER = "#c9774f";

const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
const hourRange = (h: number) => `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`;

function Legend({ items }: { items: { label: string; color?: string; swatch?: React.ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          {i.swatch ?? <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden="true" />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Calls by hour of day (IST), office hours shaded, after-hours part of each bar highlighted. */
export function HourChart({ hours, officeLabel }: { hours: Metrics["hours"]; officeLabel: string }) {
  const max = Math.max(1, ...hours.map((h) => h.office + h.after));
  const peak = hours.reduce((a, b) => (b.office + b.after > a.office + a.after ? b : a), hours[0]);
  return (
    <div>
      <div
        className="flex h-40 items-stretch gap-[2px]"
        role="img"
        aria-label={`Calls by hour of day. Busiest hour ${hourRange(peak.hour)} with ${peak.office + peak.after} calls. Office hours ${officeLabel}.`}
      >
        {hours.map((h, i) => {
          const total = h.office + h.after;
          return (
            <div
              key={h.hour}
              className={`flex min-w-0 flex-1 flex-col items-center justify-end rounded-t-[3px] ${h.inOfficeHours ? "bg-sage-soft/70" : ""}`}
              title={`${hourRange(h.hour)}: ${total} ${total === 1 ? "call" : "calls"}${h.after ? ` (${h.after} outside office hours)` : ""}`}
            >
              <span className="mb-0.5 text-[9px] tabular-nums text-mute">{total || ""}</span>
              <div
                className="bar-grow-v flex w-full max-w-5 flex-col justify-end gap-px overflow-hidden rounded-t-[4px]"
                style={{ height: `${(total / max) * 80}%`, minHeight: total ? 3 : 0, animationDelay: `${i * 18}ms` }}
              >
                {h.after > 0 && <span className="w-full" style={{ flexGrow: h.after, background: AFTER }} />}
                {h.office > 0 && <span className="w-full" style={{ flexGrow: h.office, background: INK }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-line pt-1" aria-hidden="true">
        {hours.map((h) => (
          <span key={h.hour} className="min-w-0 flex-1 text-center text-[9px] text-mute">
            {h.hour % 3 === 0 ? hourLabel(h.hour) : ""}
          </span>
        ))}
      </div>
      <div className="mt-3">
        <Legend
          items={[
            { label: "In office hours", color: INK },
            { label: "After hours / closed day", color: AFTER },
            {
              label: `Office hours ${officeLabel}`,
              swatch: <span className="h-2.5 w-4 rounded-sm bg-sage-soft ring-1 ring-sage/20" aria-hidden="true" />,
            },
          ]}
        />
      </div>
    </div>
  );
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday × hour heatmap. Cells outside office hours use the after-hours hue. */
export function WeekHeatmap({
  heat,
  isOutside,
}: {
  heat: Metrics["heat"];
  isOutside: (hour: number, weekday: number) => boolean;
}) {
  const max = Math.max(1, ...heat.flat());
  let best = { d: 1, h: 0, n: 0 };
  heat.forEach((row, d) => row.forEach((n, h) => n > best.n && (best = { d, h, n })));
  return (
    <div>
      <div
        className="grid max-w-3xl gap-[2px]"
        style={{ gridTemplateColumns: "1.9rem repeat(24, minmax(0, 1fr))" }}
        role="img"
        aria-label={
          best.n
            ? `Calls by weekday and hour. Busiest: ${WD[best.d]} ${hourRange(best.h)} with ${best.n} calls.`
            : "Calls by weekday and hour: no calls in this period."
        }
      >
        {WEEK_ORDER.map((d) => (
          <Row key={d} d={d} row={heat[d]} max={max} isOutside={isOutside} />
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center text-[9px] text-mute" aria-hidden="true">
            {h % 3 === 0 ? hourLabel(h) : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate">
        <span className="inline-flex items-center gap-1.5">
          Fewer
          {[0.2, 0.45, 0.7, 1].map((a) => (
            <span key={a} className="size-2.5 rounded-[2px]" style={{ background: `rgba(31,41,55,${a})` }} aria-hidden="true" />
          ))}
          More
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: AFTER }} aria-hidden="true" /> Outside office hours
        </span>
      </div>
    </div>
  );
}

function Row({
  d,
  row,
  max,
  isOutside,
}: {
  d: number;
  row: number[];
  max: number;
  isOutside: (hour: number, weekday: number) => boolean;
}) {
  return (
    <>
      <span className="self-center text-[10px] text-mute">{WD[d]}</span>
      {row.map((n, h) => {
        const out = isOutside(h, d);
        const a = n ? 0.18 + 0.82 * (n / max) : 0;
        return (
          <span
            key={h}
            className={`aspect-square min-w-0 rounded-[3px] ${n ? "" : out ? "bg-linen/50" : "bg-linen"}`}
            style={n ? { background: out ? `rgba(201,119,79,${a})` : `rgba(31,41,55,${a})` } : undefined}
            title={`${WD[d]} ${hourRange(h)}: ${n} ${n === 1 ? "call" : "calls"}${out ? " · outside office hours" : ""}`}
          />
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ lead flow

type FlowNode = { id: string; label: string; count: number; color: string; col: 0 | 1 | 2 };
type FlowLink = { from: string; to: string; count: number };

function buildFlow(f: Metrics["leadFlow"]) {
  const nodes: FlowNode[] = [
    { id: "leads", label: "Leads", count: f.leads, color: INK, col: 0 },
    { id: "qualified", label: "Qualified", count: f.qualified, color: FLOW_COLORS.qualified, col: 1 },
    { id: "review", label: "Needs review", count: f.needsReview, color: FLOW_COLORS.review, col: 1 },
    { id: "nq", label: "Not qualified", count: f.notQualified, color: FLOW_COLORS.notQualified, col: 1 },
    { id: "nj", label: "Not judged yet", count: f.notJudged, color: FLOW_COLORS.unrated, col: 1 },
  ];
  const links: FlowLink[] = [
    { from: "leads", to: "qualified", count: f.qualified },
    { from: "leads", to: "review", count: f.needsReview },
    { from: "leads", to: "nq", count: f.notQualified },
    { from: "leads", to: "nj", count: f.notJudged },
  ];
  for (const t of f.temperatures) {
    const color = FLOW_COLORS[t.code as keyof typeof FLOW_COLORS] ?? FLOW_COLORS.unrated;
    nodes.push({ id: `t-${t.code}`, label: TEMPERATURE_LABELS[t.code]?.label ?? "Not rated", count: t.count, color, col: 2 });
    links.push({ from: "qualified", to: `t-${t.code}`, count: t.count });
  }
  const shown = f.reasons.slice(0, 4);
  const rest = f.reasons.slice(4).reduce((s, r) => s + r.count, 0);
  const reasons = rest ? [...shown, { code: "other", count: rest }] : shown;
  reasons.forEach((r, i) => {
    nodes.push({
      id: `r-${r.code}`,
      label: r.code === "other" ? "Other reasons" : decidedByLabel(r.code),
      count: r.count,
      color: `rgba(176,86,58,${0.95 - i * 0.14})`,
      col: 2,
    });
    links.push({ from: "nq", to: `r-${r.code}`, count: r.count });
  });
  return { nodes: nodes.filter((n) => n.count > 0), links: links.filter((l) => l.count > 0) };
}

/** Leads → verdict → temperature / reason, as a hand-made SVG Sankey (desktop). */
function FlowSankey({ flow }: { flow: Metrics["leadFlow"] }) {
  const { nodes, links } = buildFlow(flow);
  const W = 860;
  const H = 300;
  const NODE_W = 12;
  const GAP = 14;
  const colX = [4, 300, 600];
  const cols = [0, 1, 2].map((c) => nodes.filter((n) => n.col === c));
  const k = Math.min(
    ...cols
      .filter((c) => c.length)
      .map(
        (c) =>
          (H - GAP * (c.length - 1)) /
          Math.max(
            1,
            c.reduce((s, n) => s + n.count, 0),
          ),
      ),
  );
  const pos = new Map<string, { x: number; y: number; h: number }>();
  for (const c of cols) {
    let y = 0;
    for (const n of c) {
      const h = Math.max(2, n.count * k);
      pos.set(n.id, { x: colX[n.col], y, h });
      y += h + GAP;
    }
  }
  const outOff = new Map<string, number>();
  const inOff = new Map<string, number>();
  const color = new Map(nodes.map((n) => [n.id, n.color]));
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 8}`}
      className="h-auto w-full"
      role="img"
      aria-label="Where leads ended up: verdict, then temperature or reason"
    >
      <g transform="translate(0,4)">
        {links.map((l) => {
          const s = pos.get(l.from)!;
          const t = pos.get(l.to)!;
          const h = l.count * k;
          const so = outOff.get(l.from) ?? 0;
          const to = inOff.get(l.to) ?? 0;
          outOff.set(l.from, so + h);
          inOff.set(l.to, to + h);
          const x0 = s.x + NODE_W;
          const x1 = t.x;
          const xm = (x0 + x1) / 2;
          const y0 = s.y + so;
          const y1 = t.y + to;
          return (
            <path
              key={`${l.from}-${l.to}`}
              d={`M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h} Z`}
              fill={color.get(l.to)}
              opacity={0.28}
              className="transition-opacity duration-200 hover:opacity-50"
            >
              <title>{`${label.get(l.from)} → ${label.get(l.to)}: ${l.count}`}</title>
            </path>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const ly = p.y + p.h / 2;
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={NODE_W} height={p.h} rx={3} fill={n.color}>
                <title>{`${n.label}: ${n.count}`}</title>
              </rect>
              <text
                x={p.x + NODE_W + 8}
                y={ly}
                dominantBaseline="middle"
                className="fill-ink text-[13px]"
                stroke="#fbf8f3"
                strokeWidth={4}
                paintOrder="stroke"
                strokeLinejoin="round"
              >
                {n.label} <tspan className="fill-slate font-medium tabular-nums">{n.count}</tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** The same flow as stacked bars, one level per row (mobile). */
function FlowBars({ flow }: { flow: Metrics["leadFlow"] }) {
  const { nodes } = buildFlow(flow);
  const levels = [
    { title: `${flow.leads} leads → verdict`, items: nodes.filter((n) => n.col === 1) },
    { title: `${flow.qualified} qualified → temperature`, items: nodes.filter((n) => n.id.startsWith("t-")) },
    { title: `${flow.notQualified} not qualified → reason`, items: nodes.filter((n) => n.id.startsWith("r-")) },
  ].filter((l) => l.items.length);
  return (
    <div className="space-y-5">
      {levels.map((lv) => (
        <div key={lv.title}>
          <p className="eyebrow mb-1.5 !text-[0.6rem]">{lv.title}</p>
          <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-[4px]">
            {lv.items.map((n) => (
              <span
                key={n.id}
                className="bar-grow h-full"
                style={{ flexGrow: n.count, background: n.color }}
                title={`${n.label}: ${n.count}`}
              />
            ))}
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate">
            {lv.items.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: n.color }} aria-hidden="true" />
                <span className="flex-1 truncate">{n.label}</span>
                <span className="tabular-nums text-ink">{n.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function LeadFlow({ flow }: { flow: Metrics["leadFlow"] }) {
  return (
    <>
      <div className="hidden sm:block">
        <FlowSankey flow={flow} />
      </div>
      <div className="sm:hidden">
        <FlowBars flow={flow} />
      </div>
    </>
  );
}

/** Booked → Consultation done → Proposal sent → Won, with Lost alongside. Vertical on mobile. */
export function PipelineSteps({ flow }: { flow: Metrics["leadFlow"] }) {
  const steps = flow.pipeline;
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch" aria-label="What happened after the call">
      {steps.map((s, i) => {
        const prev = i === 0 ? flow.leads : steps[i - 1].count;
        return (
          <li key={s.key} className="flex flex-1 flex-col sm:flex-row sm:items-center">
            {i > 0 && (
              <span className="mx-auto my-0.5 text-mute sm:mx-1.5 sm:my-0" aria-hidden="true">
                <span className="sm:hidden">↓</span>
                <span className="hidden sm:inline">→</span>
              </span>
            )}
            <div
              className={`flex flex-1 items-center justify-between gap-3 rounded-xl border px-4 py-3 sm:flex-col sm:items-start ${
                s.key === "won" ? "border-sage/30 bg-sage-soft/80" : "border-white/70 bg-white/55"
              }`}
            >
              <span className="eyebrow !text-[0.58rem]">{s.label}</span>
              <span className="text-right sm:text-left">
                <span className="font-[family-name:var(--font-jost)] text-2xl font-light tabular-nums text-ink">{s.count}</span>
                {prev > 0 && (
                  <span className="ml-2 text-[11px] text-mute">
                    {formatPct(s.count / prev)} of {i === 0 ? "leads" : steps[i - 1].label.toLowerCase()}
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
      <li className="flex flex-col sm:flex-row sm:items-center">
        <span className="mx-auto my-0.5 text-[11px] text-mute sm:mx-1.5 sm:my-0" aria-hidden="true">
          /
        </span>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-terracotta/25 bg-terracotta-soft/60 px-4 py-3 sm:flex-col sm:items-start">
          <span className="eyebrow !text-[0.58rem]">Lost</span>
          <span className="font-[family-name:var(--font-jost)] text-2xl font-light tabular-nums text-ink">{flow.lost}</span>
        </div>
      </li>
    </ol>
  );
}
