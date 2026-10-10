import {
  QUALIFICATION_LABELS,
  TEMPERATURE_LABELS,
  CALL_CATEGORIES,
  callCategory,
  callTypeLabel,
  complianceLabel,
  flagLabel,
  type Tone,
} from "@/lib/data/labels";
import { FlameIcon } from "./icons";

const TONES: Record<Tone, string> = {
  sage: "bg-sage-soft text-sage ring-sage/20",
  terracotta: "bg-terracotta-soft text-terracotta ring-terracotta/20",
  amber: "bg-amber-soft text-amber ring-amber/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-400/20",
  ink: "bg-ink text-white ring-ink",
  alert: "bg-alert-soft text-alert ring-alert/25",
};

const base =
  "chip inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ring-1 ring-inset";

export function Chip({ tone = "slate", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`${base} ${TONES[tone]}`} title={title}>
      {children}
    </span>
  );
}

export function OutcomeChip({ value }: { value: string | null | undefined }) {
  if (!value) return <Chip tone="slate">Processing</Chip>;
  const v = QUALIFICATION_LABELS[value] ?? { label: value, tone: "slate" as Tone };
  return (
    <Chip tone={v.tone}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {v.label}
    </Chip>
  );
}

export function TemperatureChip({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-xs text-mute">—</span>;
  const v = TEMPERATURE_LABELS[value] ?? { label: value, tone: "slate" as Tone };
  return (
    <span className={`${base} ${TONES[v.tone]} ${value === "hot" ? "chip-hot" : ""}`}>
      {value === "hot" && <FlameIcon size={11} />}
      {v.label}
    </span>
  );
}

export function FlagChip({ code }: { code: string }) {
  return (
    <span className="chip inline-flex items-center whitespace-nowrap rounded-full border border-ink/15 bg-white/50 px-2 py-0.5 text-[11px] text-slate">
      {flagLabel(code)}
    </span>
  );
}

export function ComplianceChip({ code, severity }: { code: string; severity?: string }) {
  return (
    <Chip tone={severity === "critical" ? "alert" : "amber"} title={code}>
      {complianceLabel(code)}
    </Chip>
  );
}

export function DemoChip() {
  return (
    <span
      className="inline-flex items-center rounded-md border border-dashed border-ink/25 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.18em] text-mute"
      title="Demo data (is_test)"
    >
      Demo
    </span>
  );
}

export function ReasonChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="chip inline-flex items-center whitespace-nowrap rounded-full bg-linen px-2.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-inset ring-sand">
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: string | null | undefined }) {
  // Statuses look like "ok", "sent", "sent (mock)", "synced", "retrying", "pending", "failed", "dead".
  const s = (status ?? "").toLowerCase();
  const cls = /^(ok|sent|synced|done)/.test(s)
    ? "bg-sage"
    : /^(pending|queued|retrying)/.test(s)
      ? "bg-amber"
      : /^(failed|dead|error)/.test(s)
        ? "bg-alert"
        : "bg-slate-300";
  return <span className={`inline-block size-2 shrink-0 rounded-full ${cls}`} aria-hidden="true" />;
}

const CATEGORY_DOT: Record<string, string> = {
  lead: "bg-sage",
  client_update: "bg-amber",
  complaint: "bg-alert",
  other: "bg-slate-400",
};

/**
 * The call's category (Lead / Client update / Complaint / Other) as a coloured chip.
 * For "Other" the specific type is shown (Reschedule, Wrong number, Dropped call…).
 */
export function CallTypeChip({ type, detail = false }: { type: string | null | undefined; detail?: boolean }) {
  const cat = callCategory(type);
  const c = CALL_CATEGORIES[cat];
  const text = cat === "other" || detail ? callTypeLabel(type) : c.short;
  return (
    <Chip tone={c.tone} title={`${c.label}: ${c.hint}`}>
      <span className={`size-1.5 rounded-full ${CATEGORY_DOT[cat]}`} aria-hidden="true" />
      {type ? text : "Processing"}
    </Chip>
  );
}
