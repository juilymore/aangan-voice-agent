"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export default function DashError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="glass mx-auto mt-10 max-w-lg rounded-2xl p-8 text-center">
      <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-md bg-ink text-white">
        <AlertIcon size={20} />
      </span>
      <h1 className="display text-lg text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate">
        The page could not load. This is usually the database waking up; try again in a moment.
      </p>
      {error.digest && <p className="mt-2 text-[11px] text-mute">Reference: {error.digest}</p>}
      <button type="button" onClick={() => retry()} className={`${buttonClass("primary")} mt-6`}>
        Try again
      </button>
    </div>
  );
}
