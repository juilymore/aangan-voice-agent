"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import {
  addNote,
  cancelBooking,
  changeQualification,
  changeTemperature,
  markFollowupDone,
  reassignDesigner,
  rescheduleBooking,
  retrySyncJob,
  setOutcome,
} from "../../edit-actions";

type Opt = { value: string; label: string };

function Hidden({ callId }: { callId: string }) {
  return <input type="hidden" name="callId" value={callId} />;
}

export function QualificationForm({ callId, current, options }: { callId: string; current: string | null; options: Opt[] }) {
  return (
    <ActionForm action={changeQualification} submitLabel="Change qualification" resetOnSuccess>
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
    </ActionForm>
  );
}

export function TemperatureForm({ callId, current, options }: { callId: string; current: string | null; options: Opt[] }) {
  return (
    <ActionForm action={changeTemperature} submitLabel="Save temperature" variant="ghost">
      <Hidden callId={callId} />
      <div role="radiogroup" aria-label="Temperature" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name="temperature" value={o.value} defaultChecked={o.value === current} className="peer sr-only" />
            <span className="chip inline-flex rounded-full border border-ink/15 bg-white/60 px-3.5 py-1.5 text-xs text-slate peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </ActionForm>
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

export function OutcomeForm({
  callId,
  current,
  options,
}: {
  callId: string;
  current: string;
  options: Opt[];
}) {
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
      <textarea id="note" name="note" required rows={3} maxLength={4000} placeholder="Add a note for the team…" className={inputClass} />
    </ActionForm>
  );
}

export function RescheduleForm({
  callId,
  bookingId,
  defaultStart,
}: {
  callId: string;
  bookingId: string;
  defaultStart: string;
}) {
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
