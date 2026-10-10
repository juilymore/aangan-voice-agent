"use client";
import { useTransition } from "react";
import type { Persona } from "@/config/team";
import { initials } from "@/lib/data/format";
import { ChevronDownIcon } from "@/components/icons";
import { switchPersona } from "./actions";

/**
 * "Viewing as" glass pill. A native <select> sits invisibly over the pill so keyboard, screen readers
 * and mobile pickers all work as usual; the pill shows the selected person prominently.
 */
export function PersonaSwitcher({ team, current }: { team: readonly Persona[]; current: string }) {
  const [pending, startTransition] = useTransition();
  const persona = team.find((p) => p.key === current) ?? team[0];
  return (
    <div
      className={`glass relative flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-opacity focus-within:ring-2 focus-within:ring-ink/30 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <span
        className="inline-flex size-8 items-center justify-center rounded-full bg-ink font-[family-name:var(--font-jost)] text-xs tracking-wider text-white"
        aria-hidden="true"
      >
        {initials(persona.name)}
      </span>
      <span className="flex flex-col leading-tight" aria-hidden="true">
        <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-mute">Viewing as</span>
        <span className="text-sm font-medium text-ink">
          {persona.name}
          <span className="ml-1.5 text-[11px] font-normal text-mute">{persona.role === "owner" ? "Founder" : "Designer"}</span>
        </span>
      </span>
      <ChevronDownIcon size={14} className="text-mute" />
      <label className="sr-only" htmlFor="persona-select">
        Viewing as
      </label>
      <select
        id="persona-select"
        value={current}
        disabled={pending}
        onChange={(e) => {
          const key = e.target.value;
          startTransition(() => switchPersona(key));
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
      >
        {team.map((p) => (
          <option key={p.key} value={p.key}>
            {p.name} ({p.role === "owner" ? "Founder" : "Designer"})
          </option>
        ))}
      </select>
    </div>
  );
}
