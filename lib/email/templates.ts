// Email templates — build_spec §9. Studio look (ivory, navy, light uppercase headings), inline styles
// for email clients. Never includes the full transcript or any pricing.
import type { DesignerBrief } from "@/lib/types/call-json";

export type Rendered = { subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const IST = "Asia/Kolkata";
export const fmtMeeting = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
export const fmtDateTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);

function shell(eyebrow: string, title: string, body: string, cta?: { href: string; label: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f4ef;font-family:Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ef;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2da">
<tr><td style="padding:22px 28px;border-bottom:1px solid #eee8df">
<div style="font-size:18px;letter-spacing:8px;font-weight:300;color:#111827">AANGAN</div>
<div style="font-size:9px;letter-spacing:4px;color:#8a8580;margin-top:4px">STUDIO · LEADS</div></td></tr>
<tr><td style="padding:28px">
<div style="font-size:10px;letter-spacing:3px;color:#8a8580;text-transform:uppercase">${esc(eyebrow)}</div>
<h1 style="margin:8px 0 18px;font-size:22px;font-weight:300;letter-spacing:2px;text-transform:uppercase;color:#111827">${esc(title)}</h1>
${body}
${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr><td style="background:#111827"><a href="${esc(cta.href)}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase">${esc(cta.label)}</a></td></tr></table>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eee8df;font-size:11px;color:#8a8580">Aangan Studio · Pune · Sent automatically by the phone assistant</td></tr>
</table></td></tr></table></body></html>`;
}

const section = (label: string, inner: string) =>
  `<div style="margin-top:18px"><div style="font-size:10px;letter-spacing:3px;color:#8a8580;text-transform:uppercase;margin-bottom:6px">${esc(label)}</div>${inner}</div>`;
const list = (items: string[]) =>
  items.length ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p style="margin:0;font-size:14px;color:#8a8580">None</p>`;

const STATUS_MARK: Record<string, string> = { pass: "✓", fail: "✗", unclear: "?" };
const CRITERION: Record<string, string> = {
  real_project: "Real project",
  service_area: "Service area",
  timeline: "Timeline",
  budget: "Budget",
  decision_maker: "Decision-maker",
};

export function designerEmail(args: {
  callerName: string | null;
  temperature: string | null;
  brief: DesignerBrief;
  shortWhat: string; // e.g. "3BHK Kothrud"
  dashboardUrl: string;
}): Rendered {
  const { brief } = args;
  const name = args.callerName ?? "New caller";
  const temp = args.temperature ? `[${args.temperature.toUpperCase()}] ` : "";
  const meeting = brief.meeting
    ? `consultation ${fmtMeeting(brief.meeting.startAt)} (${brief.meeting.mode === "site_visit" ? "site visit" : "phone call"})`
    : "not booked, call to schedule";
  const subject = `${temp}${name}, ${args.shortWhat} — ${meeting}`;

  const body = [
    brief.warning ? `<p style="margin:0 0 14px;padding:10px 12px;background:#fdf1ec;border-left:3px solid #b45f3c;font-size:14px">${esc(brief.warning)}</p>` : "",
    `<p style="margin:0;font-size:16px;line-height:1.5">${esc(brief.oneLiner)}</p>`,
    section("Key facts", list(brief.keyFacts.map((f) => `${f.label}: ${f.value}`))),
    section(
      "Verdict",
      list(brief.verdict.map((v) => `${STATUS_MARK[v.status]} ${CRITERION[v.criterion] ?? v.criterion}: ${v.reason}`)),
    ),
    section("Budget (only what the caller said)", `<p style="margin:0;font-size:14px">${esc(brief.budgetSignal)}</p>`),
    section("Decision-maker", `<p style="margin:0;font-size:14px">${esc(brief.decisionMakerNote)}</p>`),
    section("Ask on your first call", list(brief.followUpQuestions)),
    section("Flags", list(brief.flags)),
    section("Suggested opening line", `<p style="margin:0;font-size:14px;font-style:italic">“${esc(brief.suggestedOpeningLine)}”</p>`),
    section("Meeting", `<p style="margin:0;font-size:14px">${esc(brief.meeting ? `${fmtMeeting(brief.meeting.startAt)} · ${brief.meeting.designerName} · ${brief.meeting.mode === "site_visit" ? "Site visit" : "Phone call"}` : "Not booked yet: please call to schedule.")}</p>`),
    `<p style="margin:22px 0 0;font-size:12px;color:#8a8580">The full transcript is on the dashboard.</p>`,
  ].join("");

  const text = [
    subject,
    "",
    brief.warning ?? "",
    brief.oneLiner,
    "",
    "Key facts:",
    ...brief.keyFacts.map((f) => `- ${f.label}: ${f.value}`),
    "",
    "Ask on your first call:",
    ...brief.followUpQuestions.map((q) => `- ${q}`),
    "",
    `Open in dashboard: ${args.dashboardUrl}`,
  ].join("\n");

  return { subject, html: shell("New qualified lead", name, body, { href: args.dashboardUrl, label: "Open in dashboard" }), text };
}

export function escalationEmail(args: {
  callerName: string | null;
  callerNumber: string | null;
  details: string | null;
  at: Date;
  dashboardUrl: string;
}): Rendered {
  const subject = `URGENT: existing client escalation — ${args.callerName ?? "caller"}`;
  const body = [
    `<p style="margin:0;font-size:15px;line-height:1.5">An existing client called with a problem and was promised a call-back from someone senior. No time was promised.</p>`,
    section("Caller", `<p style="margin:0;font-size:14px">${esc(args.callerName ?? "Not stated")} · ${esc(args.callerNumber ?? "number not available")}</p>`),
    section("Issue", `<p style="margin:0;font-size:14px">${esc(args.details ?? "See the call on the dashboard.")}</p>`),
    section("Called at", `<p style="margin:0;font-size:14px">${esc(fmtDateTime(args.at))}</p>`),
  ].join("");
  return {
    subject,
    html: shell("Escalation", "Client needs a call-back", body, { href: args.dashboardUrl, label: "Open the call" }),
    text: `${subject}\n${args.callerName ?? ""} ${args.callerNumber ?? ""}\n${args.details ?? ""}\n${args.dashboardUrl}`,
  };
}

export function priceLeakEmail(args: { lines: string[]; callerName: string | null; dashboardUrl: string }): Rendered {
  const subject = `ALERT: the phone assistant may have mentioned a price (${args.callerName ?? "caller"})`;
  const body = [
    `<p style="margin:0;font-size:15px;line-height:1.5">The compliance check flagged these lines spoken by the assistant. Review the call and fix the prompt if needed.</p>`,
    section("Flagged lines", list(args.lines)),
  ].join("");
  return {
    subject,
    html: shell("Compliance", "Possible price mention", body, { href: args.dashboardUrl, label: "Review the call" }),
    text: `${subject}\n${args.lines.join("\n")}\n${args.dashboardUrl}`,
  };
}

export type DigestData = {
  date: string;
  calls: number;
  qualified: number;
  booked: number;
  notQualified: number;
  needsReview: number;
  openEscalations: number;
  overdueFollowups: number;
  deadSyncJobs: number;
  complianceFlags: number;
  tomorrow: { time: string; name: string; designer: string; mode: string }[];
  silent: boolean;
  dashboardUrl: string;
};

export function digestEmail(d: DigestData): Rendered {
  const subject = d.silent
    ? `⚠ No calls in 24 hours: the phone line may be down (Aangan digest ${d.date})`
    : `Aangan daily digest ${d.date}: ${d.calls} calls, ${d.qualified} qualified, ${d.booked} booked`;
  const tile = (n: number, label: string) =>
    `<td style="padding:12px;background:#f7f4ef;text-align:center"><div style="font-size:24px;font-weight:300;color:#111827">${n}</div><div style="font-size:10px;letter-spacing:2px;color:#8a8580;text-transform:uppercase">${esc(label)}</div></td>`;
  const body = [
    d.silent
      ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fdf1ec;border-left:3px solid #b42318;font-size:14px">No calls reached the system in the last 24 hours (normally about six or seven a day). Please check the Vaani agent and the phone number.</p>`
      : "",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${tile(d.calls, "Calls")}${tile(d.qualified, "Qualified")}${tile(d.booked, "Booked")}</tr><tr>${tile(d.notQualified, "Not qualified")}${tile(d.needsReview, "Needs review")}${tile(d.complianceFlags, "Compliance flags")}</tr></table>`,
    section(
      "Needs attention",
      list([
        `${d.openEscalations} open escalation(s)`,
        `${d.overdueFollowups} follow-up(s) overdue (over 24 hours)`,
        `${d.deadSyncJobs} failed sync job(s)`,
      ]),
    ),
    section("Tomorrow's consultations", list(d.tomorrow.map((t) => `${t.time} · ${t.name} · ${t.designer} · ${t.mode}`))),
  ].join("");
  return {
    subject,
    html: shell(`Daily digest · ${d.date}`, "Yesterday at the studio", body, { href: d.dashboardUrl, label: "Open dashboard" }),
    text: `${subject}\nOpen escalations: ${d.openEscalations}\nOverdue follow-ups: ${d.overdueFollowups}\n${d.dashboardUrl}`,
  };
}

export function clientRequestEmail(args: {
  callerName: string | null;
  callerNumber: string | null;
  details: string | null;
  at: Date;
  dashboardUrl: string;
}): Rendered {
  const subject = `Client update request: ${args.callerName ?? "a client"} is waiting to hear back`;
  const body = [
    `<p style="margin:0;font-size:15px;line-height:1.5">An existing client asked for an update. The assistant told them it would note it down and that someone would get back to them.</p>`,
    section("Client", `<p style="margin:0;font-size:14px">${esc(args.callerName ?? "Not stated")} · ${esc(args.callerNumber ?? "number not available")}</p>`),
    section("What they asked", `<p style="margin:0;font-size:14px">${esc(args.details ?? "See the call on the dashboard.")}</p>`),
    section("Called at", `<p style="margin:0;font-size:14px">${esc(fmtDateTime(args.at))}</p>`),
  ].join("");
  return {
    subject,
    html: shell("Client request", "Please get back to the client", body, { href: args.dashboardUrl, label: "Open the call" }),
    text: `${subject}\n${args.callerName ?? ""} ${args.callerNumber ?? ""}\n${args.details ?? ""}\n${args.dashboardUrl}`,
  };
}
