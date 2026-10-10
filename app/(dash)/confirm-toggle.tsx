"use client";
import { useOptimistic, useTransition } from "react";
import { setCustomerConfirmed } from "./edit-actions";
import { CheckIcon } from "@/components/icons";

/** "Confirmed with customer?" tick for one consultation. Optimistic; saved as a call_audit entry. */
export function ConfirmToggle({
  callId,
  bookingId,
  confirmed,
  label,
}: {
  callId: string | null;
  bookingId: string;
  confirmed: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useOptimistic(confirmed);
  const id = `confirm-${bookingId}`;
  if (!callId) {
    return <span className="text-[11px] text-mute">Call still processing</span>;
  }
  return (
    <label htmlFor={id} className="group inline-flex cursor-pointer select-none items-center gap-2 text-xs text-slate">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            setValue(next);
            await setCustomerConfirmed(callId, bookingId, next);
          });
        }}
        aria-label={`Confirmed with customer: ${label}`}
      />
      <span
        className={`inline-flex size-5 items-center justify-center rounded-md border transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30 ${
          value ? "border-sage bg-sage text-white" : "border-ink/20 bg-white/70 text-transparent group-hover:border-ink/40"
        }`}
        aria-hidden="true"
      >
        <CheckIcon size={13} />
      </span>
      <span className={value ? "text-sage" : ""}>{value ? "Confirmed" : "Confirmed with customer?"}</span>
    </label>
  );
}
