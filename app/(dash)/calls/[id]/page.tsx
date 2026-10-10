import Link from "next/link";
import { notFound } from "next/navigation";
import { getCallDetail, listDesigners, designerName, type AuditRow, type DesignerOption } from "@/lib/data/calls";
import {
  formatDateTime,
  formatDuration,
  formatInr,
  formatPhone,
  formatWhen,
  humanize,
  telHref,
  toIstLocalInput,
} from "@/lib/data/format";
import {
  OUTCOME_STAGE_LABELS,
  QUALIFICATION_LABELS,
  TEMPERATURE_LABELS,
  auditFieldLabel,
  callTypeLabel,
  complianceLabel,
  criterionLabel,
  decidedByLabel,
  flagLabel,
  followupReasons,
  modeLabel,
  outcomeStageLabel,
  syncKindLabel,
} from "@/lib/data/labels";
import type { KeyFact } from "@/lib/types/call-json";
import { ComplianceChip, DemoChip, FlagChip, OutcomeChip, ReasonChip, StatusDot, TemperatureChip } from "@/components/chips";
import { EmptyState, Eyebrow, GlassCard, SectionTitle } from "@/components/ui";
import {
  AlertIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  GlobeIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  MessageIcon,
  NoteIcon,
  PhoneIcon,
  QuoteIcon,
  RefreshIcon,
  ShieldIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import {
  CancelBookingForm,
  DesignerForm,
  FollowupForm,
  NoteForm,
  OutcomeForm,
  QualificationForm,
  RescheduleForm,
  RetryForm,
  TemperatureForm,
} from "./controls";

export async function generateMetadata({ params }: PageProps<"/calls/[id]">) {
  const { id } = await params;
  const detail = await getCallDetail(id);
  return { title: `${detail?.call.callerName || "Call"} · Aangan Leads` };
}

const STATUS_STYLE = {
  pass: { label: "Pass", cls: "bg-sage-soft text-sage", icon: CheckIcon },
  fail: { label: "Fail", cls: "bg-terracotta-soft text-terracotta", icon: XIcon },
  unclear: { label: "Unclear", cls: "bg-amber-soft text-amber", icon: AlertIcon },
} as const;

export default async function CallDetailPage({ params }: PageProps<"/calls/[id]">) {
  const { id } = await params;
  const [detail, designers] = await Promise.all([getCallDetail(id), listDesigners()]);
  if (!detail) notFound();
  const { call, linked, bookings, audit, jobs } = detail;
  const now = new Date();

  const brief = call.designerBrief;
  const reasons = call.qualificationReasons;
  const transcript = call.transcript ?? [];
  const compliance = call.complianceFlags ?? [];
  const flags = call.flags ?? [];
  const complianceByTurn = new Map<number, typeof compliance>();
  for (const f of compliance) {
    if (f.turn == null) continue;
    complianceByTurn.set(f.turn, [...(complianceByTurn.get(f.turn) ?? []), f]);
  }
  const keyFacts: KeyFact[] =
    brief?.keyFacts ??
    Object.entries(call.extracted?.fields ?? {}).map(([k, f]) => ({
      label: humanize(k),
      value: String(f?.value ?? ""),
      evidence: f?.evidence ?? null,
    }));
  const followUps = brief?.followUpQuestions?.length ? brief.followUpQuestions : (call.followUpQuestions ?? []);
  const activeBooking = bookings.find((b) => b.status !== "cancelled");
  const pastBookings = bookings.filter((b) => b !== activeBooking);
  const followupOpen = call.needsFollowup && !call.followupDoneAt;
  const hasConflict = flags.includes("conflict");
  const turnOk = (t: number | null | undefined): t is number => t != null && t >= 0 && t < transcript.length;

  return (
    <div className="stagger space-y-6">
      <Link
        href="/calls"
        className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-mute hover:text-ink"
      >
        <ArrowLeftIcon size={13} /> All calls
      </Link>

      {/* Header */}
      <GlassCard className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Eyebrow>{callTypeLabel(call.callType)}</Eyebrow>
              {call.isTest && <DemoChip />}
            </div>
            <h1 className="display break-words text-2xl text-ink sm:text-4xl">{call.callerName || "Unknown caller"}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <OutcomeChip value={call.qualification} />
              <TemperatureChip value={call.temperature} />
              {call.outcomeStage !== "none" && (
                <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-white">
                  {outcomeStageLabel(call.outcomeStage)}
                  {call.outcomeStage === "won" && call.outcomeValue ? ` · ${formatInr(call.outcomeValue)}` : ""}
                </span>
              )}
              {followupOpen && <ReasonChip>Follow-up open</ReasonChip>}
              {call.followupDoneAt && <span className="text-[11px] text-sage">Follow-up done {formatDateTime(call.followupDoneAt)}</span>}
            </div>
          </div>
          {call.callerNumber && (
            <a
              href={telHref(call.callerNumber)}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm text-white shadow-sm transition-colors hover:bg-ink-soft"
            >
              <PhoneIcon size={15} />
              <span className="tabular-nums">{formatPhone(call.callerNumber)}</span>
            </a>
          )}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm sm:grid-cols-4">
          <Meta icon={ClockIcon} label="Called" value={formatDateTime(call.startedAt ?? call.createdAt)} />
          <Meta icon={PhoneIcon} label="Length" value={formatDuration(call.durationSec)} />
          <Meta icon={GlobeIcon} label="Language" value={call.language ? humanize(call.language) : "—"} />
          <Meta icon={UsersIcon} label="Designer" value={designerName(designers, call.assignedDesigner) ?? "Unassigned"} />
        </dl>
        {linked.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-mute">
              <LinkIcon size={13} /> Linked calls
            </span>
            {linked.map((l) => (
              <Link
                key={l.id}
                href={`/calls/${l.id}`}
                className="rounded-full border border-ink/15 bg-white/60 px-2.5 py-1 text-slate transition-colors hover:border-ink/40 hover:text-ink"
              >
                {formatDateTime(l.startedAt ?? l.createdAt)} · {callTypeLabel(l.callType)}
              </Link>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Warnings */}
      {(hasConflict || compliance.length > 0) && (
        <div className="space-y-3">
          {hasConflict && (
            <Banner tone="amber" title="Booking conflict">
              A consultation was booked on this call, but the rules say it is not qualified. Nothing was cancelled
              automatically: decide whether to keep the meeting.
            </Banner>
          )}
          {compliance.length > 0 && (
            <Banner tone="alert" title="Compliance">
              <span className="flex flex-wrap gap-1.5">
                {compliance.map((f, i) => (
                  <a key={i} href={turnOk(f.turn) ? `#turn-${f.turn}` : undefined} className="no-underline">
                    <ComplianceChip code={f.code} severity={f.severity} />
                  </a>
                ))}
              </span>
            </Banner>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column */}
        <div className="stagger min-w-0 space-y-6 lg:col-span-7">
          {/* Summary + brief */}
          <GlassCard className="p-5 sm:p-6">
            <SectionTitle eyebrow="For the designer" title="Brief" />
            {brief?.warning && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-terracotta/25 bg-terracotta-soft/80 px-4 py-3 text-sm text-terracotta">
                <AlertIcon size={16} className="mt-0.5 shrink-0" />
                <span>{brief.warning}</span>
              </div>
            )}
            {brief?.oneLiner && <p className="font-[family-name:var(--font-jost)] text-lg font-light leading-snug text-ink">{brief.oneLiner}</p>}
            {call.summary && <p className="mt-3 text-sm leading-relaxed text-slate">{call.summary}</p>}
            {!brief && !call.summary && <p className="text-sm text-mute">The brief is being prepared. Refresh in a minute.</p>}

            {keyFacts.length > 0 && (
              <div className="mt-6">
                <Eyebrow className="mb-2">Key facts · tap to see where it was said</Eyebrow>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {keyFacts.map((f, i) => {
                    const inner = (
                      <>
                        <span className="block text-[10px] uppercase tracking-[0.16em] text-mute">{f.label}</span>
                        <span className="mt-0.5 block text-sm text-ink">{f.value}</span>
                        {f.evidence?.quote && (
                          <span className="mt-1 block truncate text-[11px] italic text-mute">“{f.evidence.quote}”</span>
                        )}
                      </>
                    );
                    return (
                      <li key={i}>
                        {turnOk(f.evidence?.turn) ? (
                          <a
                            href={`#turn-${f.evidence!.turn}`}
                            className="lift block rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 hover:border-clay/40"
                          >
                            {inner}
                          </a>
                        ) : (
                          <div className="rounded-xl border border-white/70 bg-white/40 px-3 py-2.5">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {brief && (
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="eyebrow mb-1">Budget signal</dt>
                  <dd className="text-sm text-ink">{brief.budgetSignal || "Not stated"}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Decision-maker</dt>
                  <dd className="text-sm text-ink">{brief.decisionMakerNote || "Not discussed"}</dd>
                </div>
              </dl>
            )}

            {(flags.length > 0 || (brief?.flags?.length ?? 0) > 0) && (
              <div className="mt-6">
                <Eyebrow className="mb-2">Flags</Eyebrow>
                <div className="flex flex-wrap gap-1.5">
                  {flags.map((f) => (
                    <FlagChip key={f} code={f} />
                  ))}
                  {brief?.flags
                    ?.filter((f) => !flags.some((c) => flagLabel(c) === f))
                    .map((f) => (
                      <span key={f} className="rounded-full border border-ink/15 bg-white/50 px-2 py-0.5 text-[11px] text-slate">
                        {f}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {followUps.length > 0 && (
              <div className="mt-6">
                <Eyebrow className="mb-2">Ask on the follow-up</Eyebrow>
                <ol className="space-y-1.5 text-sm text-ink">
                  {followUps.map((q, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="font-[family-name:var(--font-jost)] text-mute">{String(i + 1).padStart(2, "0")}</span>
                      {q}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {brief?.suggestedOpeningLine && (
              <figure className="mt-6 rounded-xl bg-ink px-5 py-4 text-white">
                <QuoteIcon size={16} className="mb-2 text-white/50" />
                <blockquote className="text-sm leading-relaxed">{brief.suggestedOpeningLine}</blockquote>
                <figcaption className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/50">Suggested opening line</figcaption>
              </figure>
            )}
          </GlassCard>

          {/* Verdict */}
          <GlassCard className="p-5 sm:p-6">
            <SectionTitle
              eyebrow="Why this outcome"
              title="Verdict"
              action={reasons?.decidedBy ? <span className="text-xs text-mute">Decided by: {decidedByLabel(reasons.decidedBy)}</span> : null}
            />
            {reasons?.overriddenBy && (
              <p className="mb-4 rounded-xl bg-linen px-4 py-2.5 text-xs text-ink-soft">
                Changed by {reasons.overriddenBy.actor} on {formatDateTime(reasons.overriddenBy.at)}: “{reasons.overriddenBy.reason}”
              </p>
            )}
            {reasons?.exclusion && (
              <p className="mb-4 rounded-xl bg-terracotta-soft px-4 py-2.5 text-xs text-terracotta">
                Exclusion: {reasons.exclusion.reason}
              </p>
            )}
            {reasons?.perCriterion?.length ? (
              <ul className="divide-y divide-line/80">
                {reasons.perCriterion.map((c) => {
                  const s = STATUS_STYLE[c.status] ?? STATUS_STYLE.unclear;
                  const Icon = s.icon;
                  return (
                    <li key={c.criterion} className="flex gap-3 py-3">
                      <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md ${s.cls}`}>
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {criterionLabel(c.criterion)} <span className={`ml-1 text-[11px] font-normal ${s.cls} rounded px-1.5 py-px`}>{s.label}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-slate">{c.reason}</p>
                        {c.source && <p className="mt-1 text-[11px] text-mute">Source: {c.source}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-mute">No criteria were evaluated for this call type.</p>
            )}

            <div className="mt-5 border-t border-line pt-5">
              <div className="mb-2 flex items-center gap-2">
                <Eyebrow>Temperature</Eyebrow>
                <TemperatureChip value={call.temperature} />
              </div>
              {call.temperatureReasons?.length ? (
                <ul className="space-y-1 text-sm text-slate">
                  {call.temperatureReasons.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-mute">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-mute">No temperature signals recorded.</p>
              )}
            </div>
          </GlassCard>

          {/* Transcript */}
          <GlassCard className="p-5 sm:p-6">
            <SectionTitle eyebrow="What was said" title="Transcript" />
            {transcript.length === 0 ? (
              <EmptyState icon={MessageIcon} title="No transcript">
                The transcript has not arrived for this call yet.
              </EmptyState>
            ) : (
              <ol className="space-y-3" aria-label="Call transcript">
                {transcript.map((t, i) => {
                  const agent = t.role === "agent";
                  const hits = complianceByTurn.get(i);
                  return (
                    <li key={i} id={`turn-${i}`} className={`turn flex ${agent ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] ${agent ? "" : "text-right"}`}>
                        <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.2em] text-mute">
                          {agent ? "Assistant" : call.callerName?.split(" ")[0] || "Caller"}
                        </span>
                        <div
                          className={`bubble inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                            agent ? "rounded-tl-sm bg-white/80 text-ink ring-1 ring-line" : "rounded-tr-sm bg-ink text-white"
                          } ${hits ? "!bg-alert-soft !text-alert ring-2 !ring-alert/40" : ""}`}
                        >
                          {t.text}
                        </div>
                        {hits && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {hits.map((h, j) => (
                              <span key={j} className="inline-flex items-center gap-1 text-[11px] text-alert">
                                <ShieldIcon size={11} /> {complianceLabel(h.code)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </GlassCard>
        </div>

        {/* Right column */}
        <div className="stagger min-w-0 space-y-6 lg:col-span-5">
          {/* Meeting */}
          <GlassCard className="p-5 sm:p-6">
            <SectionTitle eyebrow="Consultation" title="Meeting" />
            {activeBooking ? (
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <span className="inline-flex size-12 shrink-0 flex-col items-center justify-center rounded-md bg-ink text-white">
                    <CalendarIcon size={18} />
                  </span>
                  <div>
                    <p className="font-[family-name:var(--font-jost)] text-xl font-light text-ink">{formatWhen(activeBooking.startAt, now)}</p>
                    <p className="text-sm text-slate">
                      {modeLabel(activeBooking.mode)} with {designerName(designers, activeBooking.designer)} · until{" "}
                      {formatWhen(activeBooking.endAt, now).split(", ").pop()}
                    </p>
                    {(activeBooking.society || activeBooking.locality) && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-mute">
                        <MapPinIcon size={12} /> {[activeBooking.society, activeBooking.locality].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {activeBooking.status === "rescheduled" && <p className="mt-1 text-xs text-amber">Marked rescheduled</p>}
                  </div>
                </div>
                <details className="group rounded-xl border border-line bg-white/40">
                  <summary className="cursor-pointer list-none px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-soft">
                    Reschedule
                  </summary>
                  <div className="px-4 pb-4">
                    <RescheduleForm
                      callId={call.id}
                      bookingId={activeBooking.id}
                      defaultStart={toIstLocalInput(activeBooking.startAt)}
                    />
                  </div>
                </details>
                <details className="rounded-xl border border-line bg-white/40">
                  <summary className="cursor-pointer list-none px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-alert">
                    Cancel
                  </summary>
                  <div className="px-4 pb-4">
                    <CancelBookingForm callId={call.id} bookingId={activeBooking.id} />
                  </div>
                </details>
              </div>
            ) : brief?.meeting ? (
              <p className="text-sm text-slate">
                {modeLabel(brief.meeting.mode)} with {brief.meeting.designerName} on {formatWhen(brief.meeting.startAt, now)} (calendar
                record pending).
              </p>
            ) : (
              <EmptyState icon={CalendarIcon} title="Not booked">
                No consultation was booked on this call.
              </EmptyState>
            )}
            {pastBookings.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-mute">
                {pastBookings.map((b) => (
                  <li key={b.id}>
                    <span className="line-through">{formatWhen(b.startAt, now)}</span> · {modeLabel(b.mode)} · {humanize(b.status)}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {/* Controls */}
          <GlassCard className="p-5 sm:p-6">
            <SectionTitle eyebrow="Your call" title="Actions" />
            <div className="space-y-2">
              {followupOpen && (
                <div className="rounded-xl border border-amber/30 bg-amber-soft/70 p-4">
                  <p className="mb-1 text-sm font-medium text-ink">Follow-up needed</p>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {followupReasons(call.followupReason).map((r) => (
                      <ReasonChip key={r}>{r}</ReasonChip>
                    ))}
                  </div>
                  <FollowupForm callId={call.id} />
                </div>
              )}
              <Control title="Outcome stage" summary={outcomeStageLabel(call.outcomeStage)}>
                <OutcomeForm
                  callId={call.id}
                  current={call.outcomeStage}
                  options={Object.entries(OUTCOME_STAGE_LABELS)
                    .filter(([k]) => k !== "none")
                    .map(([value, label]) => ({ value, label }))}
                />
              </Control>
              <Control title="Qualification" summary={call.qualification ? QUALIFICATION_LABELS[call.qualification]?.label : "—"}>
                <QualificationForm
                  callId={call.id}
                  current={call.qualification}
                  options={Object.entries(QUALIFICATION_LABELS).map(([value, v]) => ({ value, label: v.label }))}
                />
              </Control>
              <Control title="Temperature" summary={call.temperature ? TEMPERATURE_LABELS[call.temperature]?.label : "—"}>
                <TemperatureForm
                  callId={call.id}
                  current={call.temperature}
                  options={Object.entries(TEMPERATURE_LABELS).map(([value, v]) => ({ value, label: v.label }))}
                />
              </Control>
              <Control title="Designer" summary={designerName(designers, call.assignedDesigner) ?? "Unassigned"}>
                <DesignerForm
                  callId={call.id}
                  current={call.assignedDesigner}
                  options={designers.map((d) => ({ value: d.key, label: d.name }))}
                />
              </Control>
              <div className="pt-3">
                <Eyebrow className="mb-2">Add a note</Eyebrow>
                <NoteForm callId={call.id} />
              </div>
            </div>
          </GlassCard>

          {/* Integrations */}
          <GlassCard className="p-5 sm:p-6">
            <SectionTitle eyebrow="Behind the scenes" title="Integrations" />
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <MailIcon size={16} className="text-mute" />
                <span className="flex-1 text-ink">Designer email</span>
                <StatusDot status={call.emailStatus} />
                <span className="text-xs text-slate">
                  {call.emailStatus ? humanize(call.emailStatus) : "Not sent"}
                  {call.emailSentAt ? ` · ${formatDateTime(call.emailSentAt)}` : ""}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <RefreshIcon size={16} className="text-mute" />
                <span className="flex-1 text-ink">HubSpot</span>
                <StatusDot status={call.hubspotStatus} />
                <span className="text-xs text-slate">
                  {call.hubspotStatus ? humanize(call.hubspotStatus) : "Not synced"}
                  {call.hubspotDealId ? ` · deal ${call.hubspotDealId}` : ""}
                </span>
              </li>
            </ul>
            {jobs.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <Eyebrow className="mb-2">Sync jobs</Eyebrow>
                <ul className="space-y-3">
                  {jobs.map((j) => (
                    <li key={j.id} className="rounded-xl border border-line/80 bg-white/40 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <StatusDot status={j.status} />
                        <span className="flex-1 text-ink">{syncKindLabel(j.kind)}</span>
                        <span className={`text-xs ${j.status === "failed" || j.status === "dead" ? "text-alert" : "text-slate"}`}>
                          {humanize(j.status)} · {j.attempts} {j.attempts === 1 ? "try" : "tries"}
                        </span>
                      </div>
                      {j.lastError && <p className="mt-1 break-words text-[11px] text-alert/80">{j.lastError}</p>}
                      {(j.status === "failed" || j.status === "dead") && (
                        <div className="mt-2">
                          <RetryForm jobId={j.id} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>

          {/* Audit */}
          <GlassCard className="p-5 sm:p-6">
            <SectionTitle eyebrow="Who changed what" title="History" />
            {audit.length === 0 ? (
              <p className="text-sm text-mute">No changes yet. Every edit and note is recorded here.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {audit.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[25px] top-1 inline-flex size-2.5 rounded-full border-2 border-ivory bg-ink" aria-hidden="true" />
                    <p className="text-sm text-ink">
                      <span className="font-medium">{a.actor}</span> · {auditFieldLabel(a.field)}
                    </p>
                    <p className="text-sm text-slate">{describeAudit(a, designers)}</p>
                    {a.reason && a.field !== "outcome" && (
                      <p className="mt-0.5 inline-flex items-start gap-1 text-xs text-mute">
                        <NoteIcon size={12} className="mt-0.5" /> {a.reason}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-mute">{formatDateTime(a.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof ClockIcon; label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow mb-1 inline-flex items-center gap-1.5 !text-[0.6rem]">
        <Icon size={12} /> {label}
      </dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Banner({ tone, title, children }: { tone: "amber" | "alert"; title: string; children: React.ReactNode }) {
  const cls = tone === "alert" ? "border-alert/25 bg-alert-soft/85 text-alert" : "border-amber/30 bg-amber-soft/85 text-amber";
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 backdrop-blur ${cls}`} role="alert">
      <AlertIcon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]">{title}</p>
        <div className="text-ink-soft">{children}</div>
      </div>
    </div>
  );
}

function Control({ title, summary, children }: { title: string; summary?: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-line bg-white/40 transition-colors open:bg-white/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-soft">{title}</span>
        <span className="text-xs text-mute">
          {summary}
          <span className="ml-2 inline-block transition-transform duration-200 group-open:rotate-45" aria-hidden="true">
            +
          </span>
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function describeAudit(a: AuditRow, designers: DesignerOption[]): string {
  const v = a.newValue as Record<string, unknown> | string | null;
  const o = a.oldValue as Record<string, unknown> | string | null;
  const lbl = (map: Record<string, { label: string }>, x: unknown) => (typeof x === "string" ? (map[x]?.label ?? x) : "—");
  switch (a.field) {
    case "qualification":
      return `${lbl(QUALIFICATION_LABELS, o)} → ${lbl(QUALIFICATION_LABELS, v)}`;
    case "temperature":
      return `${lbl(TEMPERATURE_LABELS, o)} → ${lbl(TEMPERATURE_LABELS, v)}`;
    case "assigned_designer":
    case "designer":
      return `${designerName(designers, typeof o === "string" ? o : null) ?? "Unassigned"} → ${designerName(designers, typeof v === "string" ? v : null)}`;
    case "outcome": {
      const n = (v ?? {}) as { stage?: string; value?: number | null; reason?: string | null };
      return [outcomeStageLabel(n.stage), n.value ? formatInr(n.value) : null, n.reason].filter(Boolean).join(" · ");
    }
    case "note":
      return typeof v === "string" ? v : "";
    case "followup_done":
      return "Marked done";
    case "customer_confirmed":
      return (v as { confirmed?: boolean } | null)?.confirmed ? "Customer confirmed the consultation" : "Confirmation removed";
    case "booking_rescheduled": {
      const from = (o as { startAt?: string } | null)?.startAt;
      const to = (v as { startAt?: string } | null)?.startAt;
      return `${formatDateTime(from)} → ${formatDateTime(to)}`;
    }
    case "booking_cancelled":
      return "Consultation cancelled";
    default:
      if (typeof v === "string") return v;
      return v == null ? "" : JSON.stringify(v).slice(0, 200);
  }
}
