// Parses docs/enquiries_sep2026.txt (the 40 anonymised September enquiries) into transcripts.
// Used by the fixture tests and the demo seed. WhatsApp threads and web forms become simulated calls.
import type { TranscriptTurn } from "@/db/schema";

export type LegacyEnquiry = {
  id: string; // T01..T20, W01..W10, F01..F10
  channel: "phone" | "whatsapp" | "form";
  startedAt: Date; // IST, 2026
  durationSec: number | null;
  transcript: TranscriptTurn[];
  rawHeader: string;
};

const MONTHS: Record<string, number> = { september: 8, sept: 8, sep: 8, october: 9 };

function istDate(day: number, month: number, time?: string): Date {
  let h = 10;
  let m = 0;
  const t = time?.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (t) {
    h = Number(t[1]) % 12 + (t[3].toLowerCase() === "pm" ? 12 : 0);
    m = Number(t[2]);
  }
  // IST = UTC+05:30
  return new Date(Date.UTC(2026, month, day, h, m) - 330 * 60_000);
}

function parseHeader(line: string): Omit<LegacyEnquiry, "transcript"> {
  const id = line.slice(0, 3);
  const channel = id[0] === "T" ? "phone" : id[0] === "W" ? "whatsapp" : "form";
  const d = line.match(/(\d{1,2})(?:[–\-\s\d]*)\s+(September|Sept|October)/i);
  const time = line.match(/\d{1,2}:\d{2}\s*(?:am|pm)/i)?.[0];
  const dur = line.match(/(\d+)\s*min\s*(\d+)\s*sec/i);
  const startedAt = d ? istDate(Number(d[1]), MONTHS[d[2].toLowerCase()], time) : istDate(1, 8);
  return {
    id,
    channel,
    startedAt,
    durationSec: dur ? Number(dur[1]) * 60 + Number(dur[2]) : null,
    rawHeader: line,
  };
}

const SKIP = /^(\[|note:|status:|section \d|first call|second call|missed call|messages received|submitted through|front desk handles|anonymised records|aangan studio -- enquiry)/i;

function toTurns(channel: LegacyEnquiry["channel"], body: string[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  if (channel === "form") {
    const text = body.join(" ").replace(/\s+/g, " ").trim();
    return text ? [{ role: "caller", text }] : [];
  }
  for (const raw of body) {
    const line = raw.trim();
    if (!line || SKIP.test(line)) continue;
    let m = line.match(/^(Front Desk|Caller)\s*:\s*(.*)$/i);
    if (channel === "whatsapp") {
      const w = line.match(/^\d{1,2} Sept?,? [\d:]+\s*(?:am|pm)?(?: \(\w+\))? -- ([^:]+):\s*(.*)$/i);
      if (w) m = [line, /front desk/i.test(w[1]) ? "Front Desk" : "Caller", /front desk/i.test(w[1]) ? w[2] : `${w[1].trim()}: ${w[2]}`] as RegExpMatchArray;
    }
    if (m) {
      turns.push({ role: /front desk/i.test(m[1]) ? "agent" : "caller", text: m[2].trim() });
    } else if (turns.length) {
      turns[turns.length - 1].text += " " + line; // wrapped line continues the previous turn
    }
  }
  return turns;
}

export function parseEnquiries(text: string): LegacyEnquiry[] {
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const out: LegacyEnquiry[] = [];
  let header: Omit<LegacyEnquiry, "transcript"> | null = null;
  let body: string[] = [];
  const flush = () => {
    if (header) out.push({ ...header, transcript: toTurns(header.channel, body) });
  };
  for (const line of lines) {
    if (/^[TWF]\d\d ·/.test(line.trim())) {
      flush();
      header = parseHeader(line.trim());
      body = [];
    } else if (/^SECTION \d/.test(line.trim())) {
      flush();
      header = null;
      body = [];
    } else if (header) {
      body.push(line);
    }
  }
  flush();
  return out;
}
