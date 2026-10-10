import Link from "next/link";
import { currentPersona } from "@/lib/persona";
import { getBusinessSettings, getRubricText, getRuleSettings, settingsHistory } from "@/lib/rules/settings";
import { listCorrections } from "@/lib/learning";
import { formatDateTime, humanize } from "@/lib/data/format";
import { QUALIFICATION_LABELS, TEMPERATURE_LABELS } from "@/lib/data/labels";
import { EmptyState, Eyebrow, GlassCard, SectionTitle } from "@/components/ui";
import { ArrowRightIcon, BookIcon, LightbulbIcon, NoteIcon } from "@/components/icons";
import { AreaForm, BusinessForm, CorrectionActions, CriteriaForm, NumbersForm, TemperatureRulesForm } from "./forms";
import { MONEY_FIELDS, PRICING_FIELDS } from "./sections";

export const metadata = { title: "Rubric · Aangan Leads" };

const KEY_LABELS: Record<string, string> = { rules: "Rules", rubric_text: "Criteria", business: "Business assumptions" };

const FIELD_LABELS: Record<string, string> = {
  minWeeksToCompletion: "Minimum weeks",
  tightTimelineWeeks: "Tight timeline",
  lateStartDays: "Late start",
  commercialMinSqft: "Smallest office",
  commercialMaxSqft: "Largest office",
  residentialFloorPerSqft: "Residential floor",
  commercialFloorPerSqft: "Commercial floor",
  singleRoomFloor: "Single-room floor",
  budgetFailRatio: "Budget fail ratio",
  assumedCarpetByBhk: "Carpet per BHK",
  temperaturePoints: "Temperature points",
  soonDays: "Soon",
  hotMinScore: "Hot from",
  warmMinScore: "Warm from",
  areaPassTerms: "Service area",
  areaFailTerms: "Outside area",
  avgProjectValueInr: "Average project value",
  qualifiedToWonPct: "Qualified to won",
  voiceRatePerMinInr: "Voice rate",
  aiCostPerCallInr: "AI cost",
  officeStartHour: "Office opens",
  officeEndHour: "Office closes",
  officeDays: "Office days",
  intro: "Intro",
  criteria: "Criteria",
  neverDisqualify: "Never disqualify",
};

const short = (v: unknown): string => {
  if (v == null) return "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  return "edited";
};

/** "Minimum weeks 4 → 3 · Service area +wagholi" */
function describeChange(oldV: unknown, newV: unknown, hidden: readonly string[]): string {
  if (newV == null) return "Reset to defaults";
  const o = (oldV ?? {}) as Record<string, unknown>;
  const n = newV as Record<string, unknown>;
  const parts: string[] = [];
  let hiddenChanged = false;
  for (const k of Object.keys(n)) {
    if (JSON.stringify(o[k]) === JSON.stringify(n[k])) continue;
    if (hidden.includes(k)) {
      hiddenChanged = true;
      continue;
    }
    const label = FIELD_LABELS[k] ?? humanize(k);
    if (Array.isArray(n[k]) && Array.isArray(o[k]) && (k === "areaPassTerms" || k === "areaFailTerms")) {
      const before = o[k] as string[];
      const after = n[k] as string[];
      const added = after.filter((t) => !before.includes(t)).map((t) => `+${t}`);
      const removed = before.filter((t) => !after.includes(t)).map((t) => `−${t}`);
      parts.push(`${label} ${[...added, ...removed].join(" ")}`);
    } else if (typeof n[k] === "object") parts.push(`${label} edited`);
    else parts.push(`${label} ${short(o[k])} → ${short(n[k])}`);
  }
  if (hiddenChanged) parts.push("internal pricing values");
  return parts.length ? parts.join(" · ") : "No visible change";
}

function valueLabel(kind: string, v: unknown): string {
  if (typeof v !== "string") return v == null ? "not heard" : String(v);
  if (kind === "qualification") return QUALIFICATION_LABELS[v]?.label ?? v;
  if (kind === "temperature") return TEMPERATURE_LABELS[v]?.label ?? v;
  return v;
}

export default async function RubricPage() {
  const persona = await currentPersona();
  const isOwner = persona.role === "owner";
  const [rules, text, business, open, applied, history] = await Promise.all([
    getRuleSettings(),
    getRubricText(),
    getBusinessSettings(),
    listCorrections("open"),
    listCorrections("applied", 20),
    settingsHistory(30),
  ]);
  const hidden = isOwner ? [] : [...PRICING_FIELDS, ...MONEY_FIELDS];

  return (
    <div className="stagger space-y-8">
      <section className="pt-2">
        <p className="eyebrow mb-3">How a call becomes a lead</p>
        <h1 className="display text-3xl text-ink sm:text-4xl">Rubric</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate">
          Every verdict comes from these rules, not from the AI. The AI only reads the call; when a fact is fixed it learns to
          read better, and when a verdict is corrected it suggests a rule change below for Nikhil to approve.
        </p>
        {!isOwner && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-linen px-3.5 py-1.5 text-xs text-ink-soft ring-1 ring-sand">
            <NoteIcon size={13} /> Read-only. Only Nikhil can change the rubric. Pricing values are internal and not shown.
          </p>
        )}
        <nav
          aria-label="Rubric sections"
          className="mt-5 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.18em]"
        >
          {[
            ["criteria", "Criteria"],
            ["numbers", "Rules in numbers"],
            ["area", "Service area"],
            ["temperature", "Temperature"],
            ["business", "Business"],
            ["learning", `Learning inbox${open.length ? ` (${open.length})` : ""}`],
            ["history", "History"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="glass rounded-full px-3 py-1.5 text-mute transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
      </section>

      <Section id="criteria" eyebrow="In plain words" title="The five criteria">
        <CriteriaForm
          key={JSON.stringify(text)}
          canEdit={isOwner}
          intro={text.intro}
          criteria={text.criteria}
          neverDisqualify={text.neverDisqualify}
        />
      </Section>

      <Section id="numbers" eyebrow="What the rules check" title="Rules in numbers">
        <NumbersForm
          key={isOwner ? JSON.stringify(rules) : "numbers"}
          canEdit={isOwner}
          v={{
            minWeeksToCompletion: rules.minWeeksToCompletion,
            tightTimelineWeeks: rules.tightTimelineWeeks,
            lateStartDays: rules.lateStartDays,
            commercialMinSqft: rules.commercialMinSqft,
            commercialMaxSqft: rules.commercialMaxSqft,
            // Internal pricing floors never leave the server for designers.
            pricing: isOwner
              ? {
                  residentialFloorPerSqft: rules.residentialFloorPerSqft,
                  commercialFloorPerSqft: rules.commercialFloorPerSqft,
                  singleRoomFloor: rules.singleRoomFloor,
                  budgetFailRatio: rules.budgetFailRatio,
                  assumedCarpetByBhk: rules.assumedCarpetByBhk,
                }
              : null,
          }}
        />
      </Section>

      <Section id="area" eyebrow="Pune city and PCMC" title="Service area">
        <AreaForm
          key={JSON.stringify([rules.areaPassTerms, rules.areaFailTerms])}
          canEdit={isOwner}
          pass={rules.areaPassTerms}
          fail={rules.areaFailTerms}
        />
      </Section>

      <Section id="temperature" eyebrow="Hot, warm or cold" title="Temperature">
        <TemperatureRulesForm
          key={JSON.stringify([rules.temperaturePoints, rules.soonDays, rules.hotMinScore, rules.warmMinScore])}
          canEdit={isOwner}
          points={rules.temperaturePoints}
          soonDays={rules.soonDays}
          hotMinScore={rules.hotMinScore}
          warmMinScore={rules.warmMinScore}
        />
      </Section>

      <Section id="business" eyebrow="Used by Metrics" title="Business assumptions">
        <BusinessForm
          key={isOwner ? JSON.stringify(business) : "business"}
          canEdit={isOwner}
          money={
            isOwner
              ? {
                  avgProjectValueInr: business.avgProjectValueInr,
                  qualifiedToWonPct: business.qualifiedToWonPct,
                  voiceRatePerMinInr: business.voiceRatePerMinInr,
                  aiCostPerCallInr: business.aiCostPerCallInr,
                }
              : null
          }
          officeStartHour={business.officeStartHour}
          officeEndHour={business.officeEndHour}
          officeDays={business.officeDays}
        />
      </Section>

      <Section id="learning" eyebrow="Teach the AI" title="Learning inbox">
        <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-mute">
          <LightbulbIcon size={14} className="mt-0.5 shrink-0" />
          When a designer marks a verdict or temperature as wrong, the suggested rule change waits here. Nothing changes until
          Nikhil applies it.
        </p>
        {open.length === 0 ? (
          <EmptyState icon={LightbulbIcon} title="Nothing to review">
            Corrections from the call pages appear here.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {open.map((c) => {
              const raw = c.suggestion as { type?: string; label?: string; field?: string } | null;
              const sug =
                !isOwner && raw?.field && PRICING_FIELDS.includes(raw.field)
                  ? { ...raw, label: "Be gentler on low budgets" }
                  : raw;
              const ctx = c.context as { callerName?: string | null } | null;
              const applicable = ["add_area_pass", "add_area_fail", "set_rule"].includes(sug?.type ?? "");
              return (
                <li key={c.id} className="rounded-xl border border-white/70 bg-white/55 px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        <span className="font-medium">{c.createdBy}</span>
                        <span className="text-mute"> · {formatDateTime(c.createdAt)} · </span>
                        {c.callId ? (
                          <Link href={`/calls/${c.callId}`} className="underline-offset-4 hover:underline">
                            {ctx?.callerName || "the call"}
                          </Link>
                        ) : (
                          ctx?.callerName || "a deleted call"
                        )}
                      </p>
                      <p className="mt-1 text-sm text-slate">
                        {humanize(c.kind)}:{" "}
                        <span className="line-through decoration-terracotta/60">{valueLabel(c.kind, c.aiValue)}</span> →{" "}
                        <span className="font-medium text-ink">{valueLabel(c.kind, c.humanValue)}</span>
                      </p>
                      {c.reason && <p className="mt-0.5 text-xs text-mute">“{c.reason}”</p>}
                      {sug?.label && (
                        <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-sage-soft/70 px-2.5 py-1 text-xs text-sage">
                          <LightbulbIcon size={12} className="mt-0.5 shrink-0" />
                          {applicable ? `Suggested: ${sug.label}` : sug.label}
                        </p>
                      )}
                    </div>
                    {isOwner && <CorrectionActions id={c.id} callId={c.callId} applicable={applicable} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {applied.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <Eyebrow className="mb-2">Applied and learned</Eyebrow>
            <ul className="space-y-1.5 text-xs text-slate">
              {applied.map((c) => {
                const raw = c.suggestion as { label?: string; field?: string } | null;
                const sug =
                  !isOwner && raw?.field && PRICING_FIELDS.includes(raw.field) ? { label: "Be gentler on low budgets" } : raw;
                return (
                  <li key={c.id} className="flex flex-wrap gap-x-2">
                    <span className="text-mute">{formatDateTime(c.resolvedAt ?? c.createdAt)}</span>
                    <span>
                      {c.kind === "fact"
                        ? `${humanize(c.field)}: ${valueLabel("fact", c.aiValue)} → ${valueLabel("fact", c.humanValue)} (AI reading example)`
                        : sug?.label}
                    </span>
                    <span className="text-mute">· {c.resolvedBy ?? c.createdBy}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>

      <Section id="history" eyebrow="Who changed what" title="Change history">
        {history.length === 0 ? (
          <p className="text-sm text-mute">No changes yet: the rubric is on its original values.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span
                  className="absolute -left-[25px] top-1 inline-flex size-2.5 rounded-full border-2 border-ivory bg-ink"
                  aria-hidden="true"
                />
                <p className="text-sm text-ink">
                  <span className="font-medium">{h.actor}</span> · {KEY_LABELS[h.key] ?? h.key}
                </p>
                <p className="text-sm text-slate">{describeChange(h.oldValue, h.newValue, hidden)}</p>
                {h.reason && <p className="mt-0.5 text-xs text-mute">“{h.reason}”</p>}
                <p className="mt-0.5 text-[11px] text-mute">{formatDateTime(h.at)}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {isOwner && (
        <p className="text-xs text-mute">
          <Link href="/metrics" className="inline-flex items-center gap-1 hover:text-ink">
            See what these assumptions mean on Metrics <ArrowRightIcon size={12} />
          </Link>
        </p>
      )}
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <GlassCard id={id} className="scroll-mt-24 p-5 sm:p-7" aria-labelledby={`${id}-title`}>
      <SectionTitle id={`${id}-title`} eyebrow={eyebrow} title={title} action={<BookIcon size={16} className="text-mute" />} />
      {children}
    </GlassCard>
  );
}
