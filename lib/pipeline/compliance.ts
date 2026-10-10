// Compliance scan on the AGENT's lines only — build_spec §8.7, functional_design §7.8.
import type { TranscriptTurn } from "@/db/schema";
import type { ComplianceFlag } from "@/lib/types/call-json";

const CURRENCY = /₹|\brs\.?\b|\binr\b|rupees?|\blakhs?\b|\blacs?\b|\bcrores?\b|लाख|रुपय|रुपये|हज़ार|हजार|कोटी|करोड़/i;
const PER_SQ = /per\s*(sq|square)/i;
const STARTING = /starting (from|at)|rates? start/i;
const AROUND_NUM = /\b(around|about|approx(?:imately)?|roughly)\s+(\d|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)/i;
const COST_WORD = /\b(cost|costs|price|prices|pricing|rate|rates|budget|charge|charges|fee|fees|quote|amount)\b|कीमत|किंमत|खर्च/i;
const NUMBER = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand)\b/i;
const ASK_BUDGET = /\b(what('?s| is) your budget|budget in mind|how much (are you|do you) (plan|want|looking) to spend|budget range)\b/i;
const BOOKED_CLAIM = /\b(you'?re booked|you are booked|you'?re all set|you are all set|is booked|i'?ve booked|have booked|booking is confirmed|consultation is confirmed|confirmed (for|your))\b/i;
const AI_STATEMENT = /\b(ai|artificial intelligence|virtual) assistant\b|\bi'?m an ai\b/i;
const RECORDING = /\brecord(ed|ing)\b/i;

/** Cost words within five words of a number (either direction). */
function numberNearCost(text: string): boolean {
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    if (!COST_WORD.test(words[i])) continue;
    const window = words.slice(Math.max(0, i - 5), i + 6).join(" ");
    if (NUMBER.test(window.replace(words[i], ""))) return true;
  }
  return false;
}

export type ComplianceInput = {
  transcript: TranscriptTurn[];
  /** True if book_consultation succeeded during this call (from tool_calls). */
  bookingSucceeded: boolean;
  /** Legacy/demo transcripts were handled by the human front desk: skip the AI disclosure check. */
  checkDisclosure?: boolean;
};

export function scanCompliance({ transcript, bookingSucceeded, checkDisclosure = true }: ComplianceInput): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  const agentTurns = transcript.map((t, i) => ({ ...t, i })).filter((t) => t.role === "agent");

  for (const t of agentTurns) {
    const s = t.text;
    if (CURRENCY.test(s) || (PER_SQ.test(s) && COST_WORD.test(s)) || STARTING.test(s) || (AROUND_NUM.test(s) && COST_WORD.test(s)) || numberNearCost(s)) {
      flags.push({ code: "price_leak", severity: "critical", turn: t.i, text: s });
    }
    if (ASK_BUDGET.test(s)) flags.push({ code: "asked_budget", severity: "warning", turn: t.i, text: s });
    if (!bookingSucceeded && BOOKED_CLAIM.test(s)) {
      flags.push({ code: "false_booking_claim", severity: "critical", turn: t.i, text: s });
    }
  }

  if (checkDisclosure) {
    const first = agentTurns[0];
    if (!first || !(AI_STATEMENT.test(first.text) && RECORDING.test(first.text))) {
      flags.push({ code: "missing_disclosure", severity: "warning", turn: first?.i ?? null, text: first?.text ?? "" });
    }
  }
  return flags;
}
