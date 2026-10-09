"use client";
import { useTransition } from "react";
import type { Persona } from "@/config/team";
import { switchPersona } from "./actions";

export function PersonaSwitcher({ team, current }: { team: readonly Persona[]; current: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-stone-500">
      <span>Viewing as</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const key = e.target.value;
          startTransition(() => switchPersona(key));
        }}
        className="rounded border border-stone-300 bg-white px-2 py-1 text-stone-900 disabled:opacity-60"
      >
        {team.map((p) => (
          <option key={p.key} value={p.key}>
            {p.name} ({p.role === "owner" ? "Founder" : "Designer"})
          </option>
        ))}
      </select>
    </label>
  );
}
