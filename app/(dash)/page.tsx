import Link from "next/link";
import { currentPersona } from "@/lib/persona";
import { getToday, listDesigners, designerName, scopeFor, type CallRow } from "@/lib/data/calls";
import { formatDayLabel, formatPhone, formatRelative, formatTime, greeting, istDateKey, istDayStart } from "@/lib/data/format";
import { callCategory, flagLabel, followupReasons, modeLabel, promisedLine } from "@/lib/data/labels";
import { FOLLOWUP_OVERDUE_HOURS } from "@/lib/data/metrics-config";
import { CallTypeChip, DemoChip, OutcomeChip, ReasonChip, TemperatureChip } from "@/components/chips";
import { EmptyState, GlassCard, SectionTitle, StatTile } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { ScopeToggle } from "@/components/scope-toggle";
import {
  AlertIcon,
  ArrowRightIcon,
  CalendarIcon,
  FlameIcon,
  InboxIcon,
  MapPinIcon,
  PhoneIcon,
  SparkleIcon,
  UsersIcon,
} from "@/components/icons";
import { ConfirmToggle } from "./confirm-toggle";

export const metadata = { title: "Today · Aangan Leads" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const persona = await currentPersona();
  const isOwner = persona.role === "owner";
  const showAll = !isOwner && sp.scope === "all";
  const scope = scopeFor(persona, showAll);
  const now = new Date();
  const [data, designers] = await Promise.all([getToday(scope, now), listDesigners()]);
  const tomorrow = istDayStart(now, 1);
  const todays = data.consultations.filter((c) => c.startAt < tomorrow);
  const tomorrows = data.consultations.filter((c) => c.startAt >= tomorrow);
  const overdueBefore = now.getTime() - FOLLOWUP_OVERDUE_HOURS * 3600_000;

  const statusLine = [
    `${plural(data.stats.newEnquiries, "new enquiry", "new enquiries")} since yesterday`,
    `${plural(data.stats.consultationsToday, "consultation")} today`,
    data.stats.followupsOpen ? `${plural(data.stats.followupsOpen, "callback")} owed` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const scopeQ = showAll ? "&scope=all" : "";
  const callsHref = (q: string) => `/calls?${q}${scopeQ}`;

  return (
    <div className="stagger space-y-8">
      {/* Hero */}
      <section className="pt-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">Interior design studio · Pune</p>
            <h1 className="display text-3xl leading-tight text-ink sm:text-5xl">
              {greeting(now)},<br className="sm:hidden" /> {persona.name}
            </h1>
            <p className="mt-3 text-sm text-slate sm:text-base">{statusLine}.</p>
            <p className="mt-1 text-xs text-mute">
              {isOwner ? "Showing the whole studio." : showAll ? "Showing all studio calls." : "Showing your leads."}
            </p>
          </div>
          {!isOwner && <ScopeToggle showAll={showAll} basePath="/" />}
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={CalendarIcon}
            value={<CountUp value={data.stats.consultationsToday} />}
            label="Consultations today"
            hint="Meetings already booked for today"
            href="#consultations"
            info="Site visits and phone consultations on the studio calendar for today. Nothing to chase: just turn up."
          />
          <StatTile
            icon={InboxIcon}
            value={<CountUp value={data.stats.followupsOpen} />}
            label="Callbacks owed"
            hint="People someone must call back"
            href={callsHref("followup=1")}
            info="Callers not booked yet, dropped calls, leads that need review, and existing clients who asked for an update. Each one leaves the count when someone marks the follow-up done."
          />
          <StatTile
            icon={FlameIcon}
            tone="clay"
            value={<CountUp value={data.stats.hotOpen} />}
            label="Hot leads open"
            hint="Ready to go, no consultation yet"
            href={callsHref("temperature=hot&outcome=qualified&stage=none")}
            info="Qualified leads rated hot (clear project, soon, keen to meet) whose consultation has not happened yet. Booked or not, these are the ones to look after first."
          />
          <StatTile
            icon={SparkleIcon}
            value={<CountUp value={data.stats.newEnquiries} />}
            label="New enquiries"
            hint="Leads since yesterday"
            href={callsHref(`category=lead&from=${istDateKey(istDayStart(now, -1))}`)}
            info="Calls about a new project since the start of yesterday (IST), whatever the verdict."
          />
        </div>
      </section>

      {/* Alerts */}
      {(data.escalations.length > 0 || data.priceLeaks.length > 0) && (
        <section
          aria-labelledby="alerts-title"
          className="rounded-2xl border border-alert/25 bg-alert-soft/85 p-5 shadow-[0_10px_30px_-14px_rgba(180,35,24,0.35)] backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-alert text-white">
              <AlertIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="alerts-title" className="display text-sm text-alert">
                Needs attention now
              </h2>
              <ul className="mt-3 space-y-2">
                {data.escalations.map((c) => (
                  <AlertRow key={`e${c.id}`} call={c} kind="Complaint / escalation" now={now} promise={promisedLine(c.flags)} />
                ))}
                {data.priceLeaks.map((c) => (
                  <AlertRow key={`p${c.id}`} call={c} kind="Agent mentioned a price" now={now} />
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Client update requests */}
      {data.clientRequests.length > 0 && (
        <section
          aria-labelledby="requests-title"
          className="rounded-2xl border border-amber/30 bg-amber-soft/80 p-5 shadow-[0_10px_30px_-14px_rgba(154,106,28,0.35)] backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-amber text-white">
              <UsersIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="requests-title" className="display text-sm text-amber">
                Client requests
              </h2>
              <p className="mt-1 text-xs text-ink-soft">
                Existing clients asking how their project is going. They stay here until someone marks the follow-up done.
              </p>
              <ul className="mt-3 space-y-2">
                {data.clientRequests.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/calls/${c.id}`}
                      className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/65 px-3 py-2 text-sm transition-colors hover:bg-white"
                    >
                      <span className="font-medium text-ink">{c.callerName || formatPhone(c.callerNumber)}</span>
                      {c.isTest && <DemoChip />}
                      {c.flags?.includes("after_hours") && <ReasonChip>{flagLabel("after_hours")}</ReasonChip>}
                      <span className="text-xs text-mute">{formatRelative(c.startedAt ?? c.createdAt, now)}</span>
                      <span className="basis-full text-xs font-medium text-amber sm:basis-auto">{promisedLine(c.flags)}</span>
                      <ArrowRightIcon size={14} className="ml-auto text-amber transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Consultations */}
        <GlassCard id="consultations" className="scroll-mt-24 p-5 sm:p-6 lg:col-span-3" aria-labelledby="consult-title">
          <SectionTitle id="consult-title" eyebrow="Studio calendar" title="Consultations" />
          {data.consultations.length === 0 ? (
            <EmptyState icon={CalendarIcon} title="A quiet calendar">
              No consultations booked for today or tomorrow. New bookings from calls appear here.
            </EmptyState>
          ) : (
            <div className="space-y-5">
              {[
                { label: "Today", items: todays },
                { label: "Tomorrow", items: tomorrows },
              ].map((g) => (
                <div key={g.label}>
                  <p className="eyebrow mb-2">{g.label}</p>
                  {g.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-sand px-4 py-3 text-sm text-mute">Nothing booked.</p>
                  ) : (
                    <ul className="space-y-2">
                      {g.items.map((b) => (
                        <li
                          key={b.id}
                          className="lift flex flex-col gap-3 rounded-xl border border-white/70 bg-white/55 px-4 py-3 sm:flex-row sm:items-center"
                        >
                          <div className="flex w-20 shrink-0 flex-col">
                            <span className="font-[family-name:var(--font-jost)] text-lg font-light text-ink">
                              {formatTime(b.startAt)}
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.16em] text-mute">{modeLabel(b.mode)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-ink">
                              {b.callId ? (
                                <Link href={`/calls/${b.callId}`} className="hover:underline hover:underline-offset-4">
                                  {b.callerName || "Caller"}
                                </Link>
                              ) : (
                                b.callerName || "Caller"
                              )}{" "}
                              {b.isTest && <DemoChip />}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
                              {(b.locality || b.society) && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPinIcon size={12} />
                                  {[b.society, b.locality].filter(Boolean).join(", ")}
                                </span>
                              )}
                              <span>with {designerName(designers, b.designer)}</span>
                              {b.callbackNumber && <span>· {formatPhone(b.callbackNumber)}</span>}
                            </p>
                          </div>
                          <ConfirmToggle
                            callId={b.callId}
                            bookingId={b.id}
                            confirmed={b.confirmedWithCustomer}
                            label={`${b.callerName ?? "caller"} ${formatDayLabel(b.startAt, now)} ${formatTime(b.startAt)}`}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Follow-up queue */}
        <GlassCard className="p-5 sm:p-6 lg:col-span-2" aria-labelledby="followup-title">
          <SectionTitle
            id="followup-title"
            eyebrow="Waiting on us"
            title="Callbacks owed"
            action={
              data.followups.length > 0 ? (
                <Link
                  href={`/calls?followup=1${showAll ? "&scope=all" : ""}`}
                  className="text-[10px] uppercase tracking-[0.18em] text-mute hover:text-ink"
                >
                  See all
                </Link>
              ) : null
            }
          />
          {data.followups.length === 0 ? (
            <EmptyState icon={InboxIcon} title="All caught up">
              Nobody is waiting for a call back.
            </EmptyState>
          ) : (
            <ul className="-mx-2 space-y-1">
              {data.followups.slice(0, 8).map((c) => {
                const overdue = (c.endedAt ?? c.createdAt).getTime() < overdueBefore;
                const reasons = followupReasons(c.followupReason);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/calls/${c.id}`}
                      className="group flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-white/60"
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${overdue ? "bg-terracotta" : "bg-amber"}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">{c.callerName || formatPhone(c.callerNumber)}</span>
                          {c.isTest && <DemoChip />}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {callCategory(c.callType) !== "lead" && <CallTypeChip type={c.callType} />}
                          {reasons.length ? reasons.map((r) => <ReasonChip key={r}>{r}</ReasonChip>) : <ReasonChip>Follow up</ReasonChip>}
                        </span>
                        <span className={`mt-1 block text-[11px] ${overdue ? "text-terracotta" : "text-mute"}`}>
                          {overdue ? "Overdue · " : ""}
                          {formatRelative(c.endedAt ?? c.startedAt ?? c.createdAt, now)}
                        </span>
                      </span>
                      <ArrowRightIcon
                        size={14}
                        className="mt-1 shrink-0 text-mute opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Newest calls */}
      <GlassCard className="p-5 sm:p-6" aria-labelledby="newest-title">
        <SectionTitle
          id="newest-title"
          eyebrow="From the phone line"
          title="Newest calls"
          action={
            <Link
              href={showAll ? "/calls?scope=all" : "/calls"}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-mute hover:text-ink"
            >
              All calls <ArrowRightIcon size={12} />
            </Link>
          }
        />
        {data.newest.length === 0 ? (
          <EmptyState icon={PhoneIcon} title="No calls yet">
            {isOwner || showAll
              ? "When the phone assistant answers its first enquiry, it will appear here within a minute."
              : "No calls are assigned to you yet. Switch to All calls to see the studio."}
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.newest.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/calls/${c.id}`}
                  className="lift flex h-full flex-col gap-2 rounded-xl border border-white/70 bg-white/55 px-4 py-3"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {c.callerName || "Unknown caller"} {c.isTest && <DemoChip />}
                      </span>
                      <span className="block text-xs text-mute">
                        {formatRelative(c.startedAt ?? c.createdAt, now)}
                      </span>
                    </span>
                    <TemperatureChip value={c.temperature} />
                  </span>
                  <span className="line-clamp-2 text-xs leading-relaxed text-slate">
                    {c.designerBrief?.oneLiner || c.summary || "Processing the call…"}
                  </span>
                  <span className="mt-auto flex items-center gap-2 pt-1">
                    <CallTypeChip type={c.callType} />
                    {callCategory(c.callType) === "lead" && <OutcomeChip value={c.qualification} />}
                    {c.assignedDesigner && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-mute">
                        <UsersIcon size={12} />
                        {designerName(designers, c.assignedDesigner)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function AlertRow({ call, kind, now, promise }: { call: CallRow; kind: string; now: Date; promise?: string }) {
  return (
    <li>
      <Link
        href={`/calls/${call.id}`}
        className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/60 px-3 py-2 text-sm transition-colors hover:bg-white"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-alert">{kind}</span>
        <span className="font-medium text-ink">{call.callerName || formatPhone(call.callerNumber)}</span>
        {call.isTest && <DemoChip />}
        <span className="text-xs text-mute">{formatRelative(call.startedAt ?? call.createdAt, now)}</span>
        {promise && <span className="basis-full text-xs font-medium text-alert sm:basis-auto">{promise}</span>}
        <ArrowRightIcon size={14} className="ml-auto text-alert transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
