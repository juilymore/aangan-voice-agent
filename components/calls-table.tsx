import Link from "next/link";
import type { CallRow, BookingRow, DesignerOption } from "@/lib/data/calls";
import { designerName } from "@/lib/data/calls";
import { formatDateTime, formatDuration, formatPhone, formatWhen } from "@/lib/data/format";
import { modeLabel } from "@/lib/data/labels";
import { CallTypeChip, ComplianceChip, DemoChip, FlagChip, OutcomeChip, TemperatureChip } from "./chips";
import { CalendarIcon, ChevronRightIcon } from "./icons";

type Props = {
  rows: CallRow[];
  meetings: Map<string, BookingRow>;
  designers: DesignerOption[];
  now: Date;
};

function Flags({ call, max = 3 }: { call: CallRow; max?: number }) {
  const comp = call.complianceFlags ?? [];
  const flags = call.flags ?? [];
  const shown = flags.slice(0, Math.max(0, max - comp.length));
  const extra = flags.length - shown.length;
  if (!comp.length && !flags.length) return <span className="text-xs text-mute/60">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {comp.map((f, i) => (
        <ComplianceChip key={`c${i}`} code={f.code} severity={f.severity} />
      ))}
      {shown.map((f) => (
        <FlagChip key={f} code={f} />
      ))}
      {extra > 0 && <span className="text-[11px] text-mute">+{extra}</span>}
    </div>
  );
}

function Meeting({ booking, now }: { booking: BookingRow | undefined; now: Date }) {
  if (!booking) return <span className="text-xs text-mute/60">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft">
      <CalendarIcon size={13} className="text-mute" />
      {formatWhen(booking.startAt, now)}
      <span className="text-mute">· {modeLabel(booking.mode)}</span>
    </span>
  );
}

/** Desktop table + mobile card list for calls. */
export function CallsTable({ rows, meetings, designers, now }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.18em] text-mute">
              {["Caller", "Number", "Time", "Length", "Type", "Outcome", "Temp", "Designer", "Meeting", "Flags"].map((h) => (
                <th key={h} scope="col" className="border-b border-line px-3 py-3 font-medium first:pl-5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="stagger">
            {rows.map((c) => (
              <tr key={c.id} className="group relative transition-colors duration-200 hover:bg-white/70">
                <td className="whitespace-nowrap border-b border-line/70 px-3 py-3 pl-5">
                  <Link
                    href={`/calls/${c.id}`}
                    className="font-medium text-ink after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:decoration-ink/30 group-hover:underline-offset-4"
                  >
                    {c.callerName || "Unknown caller"}
                  </Link>
                  {c.isTest && (
                    <span className="ml-2 align-middle">
                      <DemoChip />
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap border-b border-line/70 px-3 py-3 text-slate tabular-nums">
                  {formatPhone(c.callerNumber)}
                </td>
                <td className="whitespace-nowrap border-b border-line/70 px-3 py-3 text-slate">
                  {formatDateTime(c.startedAt ?? c.createdAt)}
                </td>
                <td className="whitespace-nowrap border-b border-line/70 px-3 py-3 text-slate tabular-nums">
                  {formatDuration(c.durationSec)}
                </td>
                <td className="whitespace-nowrap border-b border-line/70 px-3 py-3">
                  <CallTypeChip type={c.callType} />
                </td>
                <td className="border-b border-line/70 px-3 py-3">
                  <OutcomeChip value={c.qualification} />
                </td>
                <td className="border-b border-line/70 px-3 py-3">
                  <TemperatureChip value={c.temperature} />
                </td>
                <td className="whitespace-nowrap border-b border-line/70 px-3 py-3 text-slate">
                  {designerName(designers, c.assignedDesigner) ?? <span className="text-mute/60">—</span>}
                </td>
                <td className="border-b border-line/70 px-3 py-3">
                  <Meeting booking={meetings.get(c.vaaniCallId)} now={now} />
                </td>
                <td className="relative z-10 border-b border-line/70 px-3 py-3 pr-5">
                  <Flags call={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="stagger divide-y divide-line/70 md:hidden">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/calls/${c.id}`} className="block px-4 py-4 transition-colors hover:bg-white/60">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {c.callerName || "Unknown caller"} {c.isTest && <DemoChip />}
                  </p>
                  <p className="mt-0.5 text-xs text-mute">
                    {formatPhone(c.callerNumber)} · {formatDateTime(c.startedAt ?? c.createdAt)} · {formatDuration(c.durationSec)}
                  </p>
                </div>
                <ChevronRightIcon size={16} className="mt-1 shrink-0 text-mute" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <CallTypeChip type={c.callType} />
                <OutcomeChip value={c.qualification} />
                <TemperatureChip value={c.temperature} />
                {c.assignedDesigner && (
                  <span className="text-[11px] text-mute">· {designerName(designers, c.assignedDesigner)}</span>
                )}
              </div>
              {meetings.get(c.vaaniCallId) && (
                <div className="mt-2">
                  <Meeting booking={meetings.get(c.vaaniCallId)} now={now} />
                </div>
              )}
              {(c.flags.length > 0 || c.complianceFlags.length > 0) && (
                <div className="mt-2">
                  <Flags call={c} max={4} />
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
