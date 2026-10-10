import Link from "next/link";
import { currentPersona } from "@/lib/persona";
import { flagOptions, listCalls, listDesigners, PAGE_SIZE, scopeFor, type CallFilters } from "@/lib/data/calls";
import {
  CALL_CATEGORIES,
  CATEGORY_KEYS,
  COMPLIANCE_LABELS,
  OUTCOME_STAGE_LABELS,
  QUALIFICATION_LABELS,
  TEMPERATURE_LABELS,
  complianceLabel,
  flagLabel,
} from "@/lib/data/labels";
import { CallsTable } from "@/components/calls-table";
import { ScopeToggle } from "@/components/scope-toggle";
import { EmptyState, GlassCard, buttonClass, inputClass } from "@/components/ui";
import { ChevronLeftIcon, ChevronRightIcon, PhoneIcon, SearchIcon } from "@/components/icons";

export const metadata = { title: "Calls · Aangan Leads" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[]) =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CallsPage({ searchParams }: PageProps<"/calls">) {
  const sp = await searchParams;
  const persona = await currentPersona();
  const isOwner = persona.role === "owner";
  const showAll = !isOwner && one(sp.scope) === "all";
  const scope = scopeFor(persona, showAll);

  const designers = await listDesigners();
  const raw = {
    q: one(sp.q)?.slice(0, 80),
    outcome: oneOf(one(sp.outcome), Object.keys(QUALIFICATION_LABELS)),
    temperature: oneOf(one(sp.temperature), Object.keys(TEMPERATURE_LABELS)),
    designer: oneOf(one(sp.designer), [...designers.map((d) => d.key), "none"]),
    booked: oneOf(one(sp.booked), ["yes", "no"] as const),
    followup: one(sp.followup) === "1",
    flag: one(sp.flag)?.match(/^[a-z_]{2,40}$/) ? one(sp.flag) : undefined,
    category: oneOf(one(sp.category), CATEGORY_KEYS),
    stage: oneOf(one(sp.stage), Object.keys(OUTCOME_STAGE_LABELS)),
    from: DATE_RE.test(one(sp.from) ?? "") ? one(sp.from) : undefined,
    to: DATE_RE.test(one(sp.to) ?? "") ? one(sp.to) : undefined,
  };
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const filters: CallFilters = { ...raw, page };
  const now = new Date();
  const [{ rows, total, meetings }, flags] = await Promise.all([listCalls(filters, scope), flagOptions()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const keep: Record<string, string | undefined> = {
    q: raw.q,
    outcome: raw.outcome,
    temperature: raw.temperature,
    designer: raw.designer,
    booked: raw.booked,
    followup: raw.followup ? "1" : undefined,
    flag: raw.flag,
    category: raw.category,
    stage: raw.stage,
    from: raw.from,
    to: raw.to,
    scope: showAll ? "all" : undefined,
  };
  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/calls?${s}` : "/calls";
  };
  const activeFilters = Object.entries(keep).filter(([k, v]) => v && k !== "scope").length;
  const allFlags = [...new Set([...flags, ...Object.keys(COMPLIANCE_LABELS)])];

  return (
    <div className="stagger space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="eyebrow mb-3">Every enquiry, in one place</p>
          <h1 className="display text-3xl text-ink sm:text-4xl">Calls</h1>
          <p className="mt-2 text-sm text-slate">
            {total === 0 ? "No calls match." : `${total} ${total === 1 ? "call" : "calls"}`}
            {!isOwner && !showAll ? " assigned to you" : ""}
            {activeFilters ? ` · ${activeFilters} filter${activeFilters > 1 ? "s" : ""} on` : ""}
          </p>
        </div>
        {!isOwner && <ScopeToggle showAll={showAll} basePath="/calls" params={keep} />}
      </section>

      <GlassCard className="p-4 sm:p-5" aria-label="Filters">
        <form key={JSON.stringify(keep)} method="get" action="/calls" className="space-y-4">
          {showAll && <input type="hidden" name="scope" value="all" />}
          <div className="relative">
            <label htmlFor="q" className="sr-only">
              Search by name or number
            </label>
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={raw.q}
              placeholder="Search by name or number"
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Select name="category" label="Call type" value={raw.category}>
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CALL_CATEGORIES[k].label}
                </option>
              ))}
            </Select>
            <Select name="outcome" label="Outcome" value={raw.outcome}>
              {Object.entries(QUALIFICATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select name="temperature" label="Temperature" value={raw.temperature}>
              {Object.entries(TEMPERATURE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select name="designer" label="Designer" value={raw.designer}>
              {designers.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.name}
                </option>
              ))}
              <option value="none">Unassigned</option>
            </Select>
            <Select name="booked" label="Meeting" value={raw.booked}>
              <option value="yes">Booked</option>
              <option value="no">Not booked</option>
            </Select>
            <Select name="stage" label="Stage" value={raw.stage}>
              {Object.entries(OUTCOME_STAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select name="flag" label="Flag" value={raw.flag}>
              {allFlags.map((f) => (
                <option key={f} value={f}>
                  {COMPLIANCE_LABELS[f] ? complianceLabel(f) : flagLabel(f)}
                </option>
              ))}
            </Select>
            <label className="flex items-end gap-2 pb-2.5 text-sm text-slate">
              <input
                type="checkbox"
                name="followup"
                value="1"
                defaultChecked={raw.followup}
                className="size-4 rounded border-ink/30 accent-ink"
              />
              Needs follow-up
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="eyebrow mb-1.5 block !text-[0.6rem]">From</span>
              <input type="date" name="from" defaultValue={raw.from} className={inputClass} />
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block !text-[0.6rem]">To</span>
              <input type="date" name="to" defaultValue={raw.to} className={inputClass} />
            </label>
            <div className="ml-auto flex gap-2">
              {activeFilters > 0 && (
                <Link href={showAll ? "/calls?scope=all" : "/calls"} className={buttonClass("ghost")}>
                  Clear
                </Link>
              )}
              <button type="submit" className={buttonClass("primary")}>
                Apply
              </button>
            </div>
          </div>
        </form>
      </GlassCard>

      <GlassCard className="overflow-hidden" aria-label="Calls">
        {rows.length === 0 ? (
          <EmptyState
            icon={PhoneIcon}
            title={activeFilters ? "Nothing matches these filters" : "No calls yet"}
            action={
              activeFilters ? (
                <Link href={showAll ? "/calls?scope=all" : "/calls"} className={buttonClass("ghost")}>
                  Clear filters
                </Link>
              ) : !isOwner && !showAll ? (
                <Link href="/calls?scope=all" className={buttonClass("ghost")}>
                  See all studio calls
                </Link>
              ) : null
            }
          >
            {activeFilters
              ? "Try widening the date range or removing a filter."
              : "Calls answered by the phone assistant will be listed here, newest first."}
          </EmptyState>
        ) : (
          <CallsTable rows={rows} meetings={meetings} designers={designers} now={now} />
        )}
      </GlassCard>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          <p className="text-xs text-mute">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonClass("ghost", "sm")} rel="prev">
                <ChevronLeftIcon size={14} /> Newer
              </Link>
            ) : (
              <span className={`${buttonClass("ghost", "sm")} pointer-events-none opacity-40`} aria-disabled="true">
                <ChevronLeftIcon size={14} /> Newer
              </span>
            )}
            {page < pages ? (
              <Link href={pageHref(page + 1)} className={buttonClass("ghost", "sm")} rel="next">
                Older <ChevronRightIcon size={14} />
              </Link>
            ) : (
              <span className={`${buttonClass("ghost", "sm")} pointer-events-none opacity-40`} aria-disabled="true">
                Older <ChevronRightIcon size={14} />
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function Select({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block !text-[0.6rem]">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={inputClass}>
        <option value="">Any</option>
        {children}
      </select>
    </label>
  );
}
