"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { CheckIcon, LightbulbIcon, PencilIcon } from "@/components/icons";
import {
  addNote,
  cancelBooking,
  changeQualification,
  changeTemperature,
  fixFact,
  markFollowupDone,
  reassignDesigner,
  rescheduleBooking,
  retrySyncJob,
  setOutcome,
  type Learned,
} from "../../edit-actions";
import { applyCorrection } from "../../rubric/actions";

type Opt = { value: string; label: string };

function Hidden({ callId }: { callId: string }) {
  return <input type="hidden" name="callId" value={callId} />;
}

export function QualificationForm({
  callId,
  current,
  options,
  isOwner,
}: {
  callId: string;
  current: string | null;
  options: Opt[];
  isOwner: boolean;
}) {
  return (
    <ActionForm
      action={changeQualification}
      submitLabel="Change qualification"
      resetOnSuccess
      after={(s) => (s?.learned ? <LearnedPanel learned={s.learned} callId={callId} isOwner={isOwner} /> : null)}
    >
      <Hidden callId={callId} />
      <Field label="Qualification">
        <select name="qualification" defaultValue={current ?? ""} className={inputClass} required>
          <option value="" disabled>
            Choose…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reason (required)">
        <textarea
          name="reason"
          required
          minLength={3}
          rows={2}
          placeholder="Why do you disagree with the engine?"
          className={inputClass}
        />
      </Field>
      <TeachCheckbox what="verdict" />
    </ActionForm>
  );
}

export function TemperatureForm({
  callId,
  current,
  options,
  isOwner,
}: {
  callId: string;
  current: string | null;
  options: Opt[];
  isOwner: boolean;
}) {
  return (
    <ActionForm
      action={changeTemperature}
      submitLabel="Save temperature"
      variant="ghost"
      after={(s) => (s?.learned ? <LearnedPanel learned={s.learned} callId={callId} isOwner={isOwner} /> : null)}
    >
      <Hidden callId={callId} />
      <div role="radiogroup" aria-label="Temperature" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name="temperature"
              value={o.value}
              defaultChecked={o.value === current}
              className="peer sr-only"
            />
            <span className="chip inline-flex rounded-full border border-ink/15 bg-white/60 px-3.5 py-1.5 text-xs text-slate peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      <Field label="Reason (needed to teach the AI)">
        <input name="reason" maxLength={500} placeholder="e.g. Wants to start next month, very keen" className={inputClass} />
      </Field>
      <TeachCheckbox what="temperature" />
    </ActionForm>
  );
}

/** "Teach the AI: this verdict was wrong", in the same form as the change. */
function TeachCheckbox({ what }: { what: "verdict" | "temperature" }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-clay/30 bg-terracotta-soft/40 px-3 py-2.5 text-sm text-ink transition-colors hover:bg-terracotta-soft/70">
      <input type="checkbox" name="teach" value="1" className="mt-0.5 size-4 shrink-0 rounded accent-ink" />
      <span>
        <span className="inline-flex items-center gap-1.5 font-medium">
          <LightbulbIcon size={14} className="text-terracotta" /> Teach the AI: this {what} was wrong
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-slate">
          Records the AI&apos;s value and yours, and suggests a rubric change for Nikhil to approve.
        </span>
      </span>
    </label>
  );
}

/** Shown after a correction was recorded: the suggested rubric change, with Apply for the owner. */
function LearnedPanel({ learned, callId, isOwner }: { learned: Learned; callId: string; isOwner: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-sage/30 bg-sage-soft/80 px-4 py-3 text-sm">
      <p className="flex items-start gap-2 text-ink">
        <CheckIcon size={15} className="mt-0.5 shrink-0 text-sage" />
        <span>
          <span className="font-medium">Learned.</span>{" "}
          {learned.applicable ? <>Suggested rubric change: {learned.label}.</> : <>{learned.label}.</>}
        </span>
      </p>
      {learned.applicable &&
        (isOwner ? (
          <div className="mt-2.5 pl-6">
            <ActionForm action={applyCorrection} submitLabel="Apply now" pendingLabel="Applying…" variant="ghost">
              <input type="hidden" name="id" value={learned.id} />
              <input type="hidden" name="callId" value={callId} />
            </ActionForm>
          </div>
        ) : (
          <p className="mt-1 pl-6 text-xs text-slate">
            Nikhil can apply this on the{" "}
            <Link href="/rubric#learning" className="underline underline-offset-2 hover:text-ink">
              Rubric tab
            </Link>
            .
          </p>
        ))}
    </div>
  );
}

const FACT_CHOICES: Record<string, Opt[]> = {
  scope: [
    { value: "full_home", label: "Whole home / office" },
    { value: "partial", label: "Partial (a floor or 2+ rooms)" },
    { value: "single_room", label: "Single room" },
  ],
  consultation_mode: [
    { value: "site_visit", label: "Site visit" },
    { value: "phone_call", label: "Phone call" },
  ],
};

/** Small "Fix" action on a key fact: inline edit + optional note, then shows the re-check result. */
export function FactFix({ callId, field, label, value }: { callId: string; field: string; label: string; value: string }) {
  const choices = FACT_CHOICES[field];
  return (
    <details className="group mt-1">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-mute transition-colors hover:text-ink">
        <PencilIcon size={11} /> <span className="group-open:hidden">Fix</span>
        <span className="hidden group-open:inline">Close</span>
        <span className="sr-only"> {label}</span>
      </summary>
      <div className="mt-2 rounded-lg border border-line bg-white/70 p-3">
        <ActionForm action={fixFact} submitLabel="Save fact" variant="ghost">
          <Hidden callId={callId} />
          <input type="hidden" name="field" value={field} />
          <Field label={`Correct ${label.toLowerCase()}`}>
            {choices ? (
              <select name="value" defaultValue={value} className={inputClass} required>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <input name="value" defaultValue={value} required maxLength={200} className={inputClass} />
            )}
          </Field>
          <Field label="Note (optional)">
            <input name="note" maxLength={500} placeholder="e.g. The caller said Kharadi, not Karadi" className={inputClass} />
          </Field>
        </ActionForm>
      </div>
    </details>
  );
}

export function DesignerForm({ callId, current, options }: { callId: string; current: string | null; options: Opt[] }) {
  return (
    <ActionForm action={reassignDesigner} submitLabel="Reassign" variant="ghost">
      <Hidden callId={callId} />
      <Field label="Designer">
        <select name="designer" defaultValue={current ?? ""} className={inputClass} required>
          <option value="" disabled>
            Choose…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </ActionForm>
  );
}

export function FollowupForm({ callId }: { callId: string }) {
  return (
    <ActionForm action={markFollowupDone} submitLabel="Mark follow-up done" pendingLabel="Marking…">
      <Hidden callId={callId} />
      <Field label="What happened (optional)">
        <input name="note" className={inputClass} placeholder="e.g. Called back, booked for Saturday" />
      </Field>
    </ActionForm>
  );
}

export function OutcomeForm({ callId, current, options }: { callId: string; current: string; options: Opt[] }) {
  const [stage, setStage] = useState(options.some((o) => o.value === current) ? current : "");
  return (
    <ActionForm action={setOutcome} submitLabel="Save outcome" variant="ghost">
      <Hidden callId={callId} />
      <Field label="Stage">
        <select name="stage" value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass} required>
          <option value="" disabled>
            Choose…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {stage === "won" && (
        <Field label="Project value (₹)">
          <input
            name="value"
            inputMode="numeric"
            required
            pattern="[0-9₹, ]+"
            placeholder="e.g. 1200000"
            className={inputClass}
          />
        </Field>
      )}
      {stage === "lost" && (
        <Field label="Why was it lost?">
          <input name="reason" required minLength={3} className={inputClass} placeholder="e.g. Went with another studio" />
        </Field>
      )}
    </ActionForm>
  );
}

export function NoteForm({ callId }: { callId: string }) {
  return (
    <ActionForm action={addNote} submitLabel="Add note" resetOnSuccess>
      <Hidden callId={callId} />
      <label htmlFor="note" className="sr-only">
        Note
      </label>
      <textarea
        id="note"
        name="note"
        required
        rows={3}
        maxLength={4000}
        placeholder="Add a note for the team…"
        className={inputClass}
      />
    </ActionForm>
  );
}

export function RescheduleForm({ callId, bookingId, defaultStart }: { callId: string; bookingId: string; defaultStart: string }) {
  return (
    <ActionForm action={rescheduleBooking} submitLabel="Move consultation" variant="ghost">
      <Hidden callId={callId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field label="New start (IST)">
        <input type="datetime-local" name="start" required defaultValue={defaultStart} className={inputClass} />
      </Field>
      <p className="text-[11px] text-mute">Keeps the same length. The studio calendar must be free at that time.</p>
    </ActionForm>
  );
}

export function CancelBookingForm({ callId, bookingId }: { callId: string; bookingId: string }) {
  return (
    <ActionForm
      action={cancelBooking}
      submitLabel="Cancel consultation"
      pendingLabel="Cancelling…"
      variant="danger"
      confirmText="Cancel this consultation? The customer is not told automatically."
    >
      <Hidden callId={callId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field label="Reason (optional)">
        <input name="reason" className={inputClass} placeholder="e.g. Customer asked to cancel" />
      </Field>
    </ActionForm>
  );
}

export function RetryForm({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={retrySyncJob} submitLabel="Retry" pendingLabel="Retrying…" variant="ghost">
      <input type="hidden" name="jobId" value={jobId} />
    </ActionForm>
  );
}
