"use client";
import { useActionState, useEffect, useRef } from "react";
import { buttonClass } from "./ui";
import { CheckIcon } from "./icons";

type State = { ok: boolean; message: string; at?: number } | null;

/**
 * A form bound to a server action with inline success/error feedback.
 * Works without JS (progressive enhancement); with JS it stays on the page and shows the message.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "primary",
  className = "",
  resetOnSuccess = false,
  confirmText,
}: {
  action: (state: State, fd: FormData) => Promise<State>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  resetOnSuccess?: boolean;
  confirmText?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={`space-y-3 ${className}`}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass(variant, "sm")}>
          {pending ? pendingLabel : submitLabel}
        </button>
        <p
          role="status"
          aria-live="polite"
          className={`text-xs transition-opacity duration-300 ${state ? "opacity-100" : "opacity-0"} ${
            state?.ok ? "text-sage" : "text-alert"
          }`}
        >
          {state?.ok && <CheckIcon size={12} className="mr-1 inline" />}
          {state?.message}
        </p>
      </div>
    </form>
  );
}
