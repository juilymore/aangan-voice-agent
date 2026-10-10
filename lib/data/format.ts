// Small formatting helpers for the dashboard. Pure functions: safe in server and client components.
// All wall-clock times are shown in IST (Asia/Kolkata, UTC+05:30, no daylight saving).

export const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type DateLike = Date | string | null | undefined;

export function toDate(d: DateLike): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar parts of an instant as seen on a clock in Pune. */
export function istParts(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant of 00:00 IST on the day `offsetDays` from the IST day containing `now`. */
export function istDayStart(now: Date, offsetDays = 0): Date {
  const p = istParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - IST_OFFSET_MS + offsetDays * DAY_MS);
}

/** "2026-10-10" for an instant, in IST. */
export function istDateKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Parse "YYYY-MM-DD" as the start of that day in IST. */
export function parseIstDate(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
  return Number.isNaN(t) ? null : new Date(t);
}

/** Parse a <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm") as IST wall-clock time. */
export function parseIstLocal(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS);
}

/** Value for a datetime-local input, in IST. */
export function toIstLocalInput(d: DateLike): string {
  const date = toDate(d);
  if (!date) return "";
  const p = istParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, ...opts });
const fmtTime = dtf({ hour: "numeric", minute: "2-digit", hour12: true });
const fmtDay = dtf({ day: "numeric", month: "short" });
const fmtWeekday = dtf({ weekday: "short", day: "numeric", month: "short" });
const fmtFull = dtf({ weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function formatTime(d: DateLike): string {
  const date = toDate(d);
  return date ? fmtTime.format(date).replace(/\s?(am|pm)/i, (x) => x.trim().toLowerCase()) : "—";
}

/** "10 Oct, 4:05pm" */
export function formatDateTime(d: DateLike): string {
  const date = toDate(d);
  return date ? `${fmtDay.format(date)}, ${formatTime(date)}` : "—";
}

/** "Sat, 10 Oct 2026" */
export function formatFullDate(d: DateLike): string {
  const date = toDate(d);
  return date ? fmtFull.format(date) : "—";
}

/** "Today", "Tomorrow", "Yesterday", else "Sat, 11 Oct". */
export function formatDayLabel(d: DateLike, now: Date): string {
  const date = toDate(d);
  if (!date) return "—";
  const diff = Math.round((istDayStart(date).getTime() - istDayStart(now).getTime()) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtWeekday.format(date);
}

/** "Today, 4:05pm" / "Sat, 11 Oct, 11:00am" */
export function formatWhen(d: DateLike, now: Date): string {
  const date = toDate(d);
  return date ? `${formatDayLabel(date, now)}, ${formatTime(date)}` : "—";
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function formatRelative(d: DateLike, now: Date): string {
  const date = toDate(d);
  if (!date) return "—";
  const mins = Math.round((now.getTime() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function greeting(now: Date): string {
  const h = istParts(now).hour;
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inrFmt2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** "₹11,00,000" */
export function formatInr(n: number | null | undefined, decimals = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${(decimals ? inrFmt2 : inrFmt).format(n)}`;
}

/** "₹11 L", "₹1.2 Cr", "₹4,920" */
export function formatInrCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5)} L`;
  return formatInr(n);
}

function trim(n: number): string {
  return n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, "");
}

export function formatPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return inrFmt.format(n);
}

/** "+91 98220 12345" style grouping for Indian mobile numbers; anything else is returned as is. */
export function formatPhone(n: string | null | undefined): string {
  if (!n) return "—";
  const digits = n.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : null;
  if (!local) return n;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

export function telHref(n: string): string {
  return `tel:${n.replace(/[^\d+]/g, "")}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "budget_tight" → "Budget tight" */
export function humanize(code: string): string {
  const s = code.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : code;
}
