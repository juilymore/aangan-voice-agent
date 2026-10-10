"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { PlusIcon, RefreshIcon, XIcon } from "@/components/icons";
import {
  applyCorrection,
  dismissCorrectionAction,
  recheckAll,
  resetSection,
  saveBusiness,
  saveRubricText,
  saveRules,
  type RubricState,
} from "./actions";

type Action = (s: RubricState, fd: FormData) => Promise<RubricState>;

/** Section form: owner gets Save (+ reason) and Reset; others see the same fields, disabled. */
export function SettingsForm({
  action,
  section,
  canEdit,
  children,
  resetLabel,
}: {
  action: Action;
  section: string;
  canEdit: boolean;
  children: React.ReactNode;
  resetLabel: string;
}) {
  if (!canEdit) {
    return (
      <fieldset disabled className="space-y-4">
        {children}
      </fieldset>
    );
  }
  return (
    <div className="space-y-3">
      <ActionForm action={action} submitLabel="Save" after={(s) => <Outcome state={s} />}>
        <input type="hidden" name="section" value={section} />
        {children}
        <Field label="Reason for the change (optional)">
          <input name="reason" maxLength={300} placeholder="e.g. Wagholi projects have gone well" className={inputClass} />
        </Field>
      </ActionForm>
      <ActionForm
        action={resetSection}
        submitLabel={resetLabel}
        pendingLabel="Resetting…"
        variant="ghost"
        confirmText={`${resetLabel}? Your saved values for this section are replaced by the original rubric.`}
        after={(s) => (s?.recheck ? <RecheckOffer /> : null)}
      >
        <input type="hidden" name="section" value={section} />
      </ActionForm>
    </div>
  );
}

function Outcome({ state }: { state: RubricState }) {
  if (!state) return null;
  return (
    <>
      {!state.ok && state.errors && state.errors.length > 0 && (
        <ul
          className="mt-2 space-y-1 rounded-lg border border-alert/25 bg-alert-soft/70 px-3 py-2 text-xs text-alert"
          role="alert"
        >
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {state.ok && state.recheck && <RecheckOffer />}
    </>
  );
}

/** "Re-check all calls with this rubric" (reevaluateAll). */
export function RecheckOffer() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-sage/30 bg-sage-soft/70 px-4 py-3">
      <RefreshIcon size={15} className="text-sage" />
      <p className="flex-1 text-xs text-ink">Calls already in the list keep their old verdicts until you re-check them.</p>
      <ActionForm
        action={recheckAll}
        submitLabel="Re-check all calls with this rubric"
        pendingLabel="Re-checking…"
        variant="ghost"
      />
    </div>
  );
}

export function NumField({
  name,
  label,
  value,
  suffix,
  step = 1,
  hint,
}: {
  name: string;
  label: string;
  value: number;
  suffix?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block !text-[0.6rem]">{label}</span>
      <span className="relative block">
        <input
          type="number"
          name={name}
          defaultValue={value}
          step={step}
          required
          className={`${inputClass} ${suffix ? "pr-14" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-mute">{suffix}</span>
        )}
      </span>
      {hint && <span className="mt-1 block text-[11px] leading-snug text-mute">{hint}</span>}
    </label>
  );
}

// ------------------------------------------------------------------ section forms

export function CriteriaForm({
  canEdit,
  intro,
  criteria,
  neverDisqualify,
}: {
  canEdit: boolean;
  intro: string;
  criteria: { key: string; title: string; description: string; whenUnclear: string }[];
  neverDisqualify: string[];
}) {
  return (
    <SettingsForm action={saveRubricText} section="criteria" canEdit={canEdit} resetLabel="Reset criteria to defaults">
      <Field label="Intro">
        <textarea name="intro" defaultValue={intro} rows={3} maxLength={2000} className={inputClass} />
      </Field>
      <ol className="space-y-4">
        {criteria.map((c, i) => (
          <li key={c.key} className="rounded-xl border border-line bg-white/45 p-4">
            <input type="hidden" name="criterionKey" value={c.key} />
            <div className="mb-3 flex items-center gap-3">
              <span className="font-[family-name:var(--font-jost)] text-lg font-light text-mute">
                {String(i + 1).padStart(2, "0")}
              </span>
              <label className="block flex-1">
                <span className="sr-only">Criterion {i + 1} title</span>
                <input
                  name={`title_${i}`}
                  defaultValue={c.title}
                  required
                  minLength={2}
                  maxLength={120}
                  className={`${inputClass} font-medium`}
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="What it means">
                <textarea
                  name={`description_${i}`}
                  defaultValue={c.description}
                  rows={4}
                  maxLength={2000}
                  className={inputClass}
                />
              </Field>
              <Field label="When unclear">
                <textarea
                  name={`whenUnclear_${i}`}
                  defaultValue={c.whenUnclear}
                  rows={4}
                  maxLength={500}
                  className={inputClass}
                />
              </Field>
            </div>
          </li>
        ))}
      </ol>
      <Field label="Never disqualify for (one per line)">
        <textarea name="neverDisqualify" defaultValue={neverDisqualify.join("\n")} rows={6} className={inputClass} />
      </Field>
    </SettingsForm>
  );
}

export type NumbersValues = {
  minWeeksToCompletion: number;
  tightTimelineWeeks: number;
  lateStartDays: number;
  commercialMinSqft: number;
  commercialMaxSqft: number;
  pricing: {
    residentialFloorPerSqft: number;
    commercialFloorPerSqft: number;
    singleRoomFloor: number;
    budgetFailRatio: number;
    assumedCarpetByBhk: Record<string, number>;
  } | null;
};

export function NumbersForm({ canEdit, v }: { canEdit: boolean; v: NumbersValues }) {
  return (
    <SettingsForm action={saveRules} section="numbers" canEdit={canEdit} resetLabel="Reset numbers to defaults">
      <Group title="Timeline">
        <NumField
          name="minWeeksToCompletion"
          label="Minimum weeks to finish"
          value={v.minWeeksToCompletion}
          suffix="weeks"
          hint="Sooner than this: not qualified (a later date is offered first)."
        />
        <NumField
          name="tightTimelineWeeks"
          label="Tight timeline under"
          value={v.tightTimelineWeeks}
          suffix="weeks"
          hint="Qualified, flagged as a tight deadline."
        />
        <NumField
          name="lateStartDays"
          label="Late start after"
          value={v.lateStartDays}
          suffix="days"
          hint="Starting later than this is flagged, not declined."
        />
      </Group>
      <Group title="Office size">
        <NumField name="commercialMinSqft" label="Smallest office" value={v.commercialMinSqft} suffix="sq ft" />
        <NumField name="commercialMaxSqft" label="Largest office" value={v.commercialMaxSqft} suffix="sq ft" />
      </Group>
      {v.pricing && (
        <Group title="Budget check · internal, owner only">
          <NumField
            name="residentialFloorPerSqft"
            label="Residential floor"
            value={v.pricing.residentialFloorPerSqft}
            suffix="₹/sq ft"
          />
          <NumField
            name="commercialFloorPerSqft"
            label="Commercial floor"
            value={v.pricing.commercialFloorPerSqft}
            suffix="₹/sq ft"
          />
          <NumField name="singleRoomFloor" label="Single-room floor" value={v.pricing.singleRoomFloor} suffix="₹" />
          <NumField
            name="budgetFailRatioPct"
            label="Fail below"
            value={Math.round(v.pricing.budgetFailRatio * 1000) / 10}
            step={0.1}
            suffix="% of floor"
            hint="A volunteered budget under this share of the floor is clearly too low."
          />
          {Object.entries(v.pricing.assumedCarpetByBhk).map(([bhk, sqft]) => (
            <NumField key={bhk} name={`carpet_${bhk}`} label={`Assumed carpet, ${bhk} BHK`} value={sqft} suffix="sq ft" />
          ))}
        </Group>
      )}
    </SettingsForm>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export function AreaForm({ canEdit, pass, fail }: { canEdit: boolean; pass: string[]; fail: string[] }) {
  return (
    <SettingsForm action={saveRules} section="area" canEdit={canEdit} resetLabel="Reset service area to defaults">
      <div className="grid gap-5 md:grid-cols-2">
        <TermList name="areaPassTerms" title="We serve" tone="sage" initial={pass} canEdit={canEdit} />
        <TermList name="areaFailTerms" title="Outside our area" tone="terracotta" initial={fail} canEdit={canEdit} />
      </div>
      <p className="text-[11px] text-mute">Places in neither list are never declined: a designer reviews them.</p>
    </SettingsForm>
  );
}

function TermList({
  name,
  title,
  tone,
  initial,
  canEdit,
}: {
  name: string;
  title: string;
  tone: "sage" | "terracotta";
  initial: string[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().toLowerCase();
    if (t.length >= 2 && !items.includes(t)) setItems([...items, t]);
    setDraft("");
  };
  const chip = tone === "sage" ? "bg-sage-soft text-sage ring-sage/20" : "bg-terracotta-soft text-terracotta ring-terracotta/20";
  return (
    <div>
      <p className="eyebrow mb-2">
        {title} <span className="normal-case tracking-normal text-mute">({items.length})</span>
      </p>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <ul className="flex flex-wrap gap-1.5" aria-label={title}>
        {items.map((t) => (
          <li
            key={t}
            className={`chip inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 text-[11px] font-medium ring-1 ring-inset ${chip} ${canEdit ? "pr-1" : "pr-2.5"}`}
          >
            {t}
            {canEdit && (
              <button
                type="button"
                onClick={() => setItems(items.filter((x) => x !== t))}
                className="inline-flex size-4 items-center justify-center rounded-full hover:bg-white/70"
                aria-label={`Remove ${t}`}
              >
                <XIcon size={10} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-2 flex gap-2">
          <label className="block flex-1">
            <span className="sr-only">Add to {title}</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              maxLength={40}
              placeholder="Add a place…"
              className={inputClass}
            />
          </label>
          <button type="button" onClick={add} className={buttonClass("ghost", "sm")}>
            <PlusIcon size={13} /> Add
          </button>
        </div>
      )}
    </div>
  );
}

const POINT_WORDS: Record<string, string> = {
  consultIntent: "Wants a consultation",
  referral: "Referred by someone",
  soon: "Starting soon",
  commitment: "Committed (budget set, keys in hand…)",
  clearScopeAndSize: "Clear scope and size",
  exploring: "Just exploring",
  priceOnly: "Only asking prices",
  noRushToDecide: "No rush to decide",
};

export function TemperatureRulesForm({
  canEdit,
  points,
  soonDays,
  hotMinScore,
  warmMinScore,
}: {
  canEdit: boolean;
  points: Record<string, number>;
  soonDays: number;
  hotMinScore: number;
  warmMinScore: number;
}) {
  return (
    <SettingsForm action={saveRules} section="temperature" canEdit={canEdit} resetLabel="Reset temperature to defaults">
      <div>
        <p className="eyebrow mb-2">Points per signal</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(points).map(([k, v]) => (
            <NumField key={k} name={`pt_${k}`} label={POINT_WORDS[k] ?? k} value={v} suffix="pts" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumField name="soonDays" label="“Soon” means within" value={soonDays} suffix="days" />
        <NumField name="hotMinScore" label="Hot from" value={hotMinScore} suffix="points" />
        <NumField name="warmMinScore" label="Warm from" value={warmMinScore} suffix="points" hint="Below this: cold." />
      </div>
    </SettingsForm>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BusinessForm({
  canEdit,
  money,
  officeStartHour,
  officeEndHour,
  officeDays,
}: {
  canEdit: boolean;
  money: { avgProjectValueInr: number; qualifiedToWonPct: number; voiceRatePerMinInr: number; aiCostPerCallInr: number } | null;
  officeStartHour: number;
  officeEndHour: number;
  officeDays: number[];
}) {
  return (
    <SettingsForm action={saveBusiness} section="business" canEdit={canEdit} resetLabel="Reset assumptions to defaults">
      {money && (
        <Group title="Money · owner only">
          <NumField name="avgProjectValueInr" label="Average project value" value={money.avgProjectValueInr} suffix="₹" />
          <NumField
            name="qualifiedToWonPct"
            label="Qualified leads that become projects"
            value={money.qualifiedToWonPct}
            step={0.1}
            suffix="%"
          />
          <NumField name="voiceRatePerMinInr" label="Voice cost" value={money.voiceRatePerMinInr} step={0.01} suffix="₹/min" />
          <NumField name="aiCostPerCallInr" label="AI cost" value={money.aiCostPerCallInr} step={0.01} suffix="₹/call" />
        </Group>
      )}
      <Group title="Office hours (IST)">
        <NumField name="officeStartHour" label="Opens at" value={officeStartHour} suffix=":00" />
        <NumField name="officeEndHour" label="Closes at" value={officeEndHour} suffix=":00" />
      </Group>
      <fieldset>
        <legend className="eyebrow mb-2">Open on</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label key={d} className="cursor-pointer">
              <input
                type="checkbox"
                name="officeDays"
                value={i}
                defaultChecked={officeDays.includes(i)}
                className="peer sr-only"
              />
              <span className="chip inline-flex rounded-full border border-ink/15 bg-white/60 px-3 py-1.5 text-xs text-slate peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
                {d}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </SettingsForm>
  );
}

// ------------------------------------------------------------------ learning inbox

export function CorrectionActions({ id, callId, applicable }: { id: string; callId: string | null; applicable: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {applicable && (
        <ActionForm
          action={applyCorrection}
          submitLabel="Apply"
          pendingLabel="Applying…"
          after={(s) => (s?.ok && s.recheck ? <RecheckOffer /> : null)}
        >
          <input type="hidden" name="id" value={id} />
          {callId && <input type="hidden" name="callId" value={callId} />}
        </ActionForm>
      )}
      <ActionForm action={dismissCorrectionAction} submitLabel="Dismiss" pendingLabel="Dismissing…" variant="ghost">
        <input type="hidden" name="id" value={id} />
      </ActionForm>
    </div>
  );
}
