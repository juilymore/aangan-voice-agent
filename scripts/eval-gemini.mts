// Real-AI evaluation: runs all 40 September enquiries through Gemini + the rule engine and prints agreement.
// Costs a few paise of Gemini usage. Usage: npm run eval:gemini
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { readFileSync } from "node:fs";
import { GeminiProvider } from "../lib/ai/gemini";
import { parseEnquiries } from "../lib/pipeline/enquiry-text";
import { analyzeCall } from "../lib/pipeline/analyze";
import { FIXTURES } from "../tests/fixtures/sep2026";
const enq = new Map(parseEnquiries(readFileSync("docs/enquiries_sep2026.txt", "utf8")).map((e) => [e.id, e]));
const llm = new GeminiProvider(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL!, 60_000);
let ok = 0, okHard = 0, nHard = 0; const rows: string[] = [];
const queue = [...FIXTURES];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const e = enq.get(f.id)!;
    const a = await analyzeCall({ transcript: e.transcript, startedAt: new Date(`${String(f.input.today)}T12:00:00+05:30`), durationSec: e.durationSec, dropped: false, bookingSucceeded: false, meeting: null, checkDisclosure: false }, llm);
    const good = a.evaluation.outcome === f.expect.outcome;
    const hard = ["service_area", "real_project", "excluded_type", "commercial_too_small", "existing_client_issue", "incomplete"].includes(f.expect.decidedBy) && f.expect.outcome !== "needs_review";
    if (good) ok++; if (hard) { nHard++; if (good) okHard++; }
    rows.push(`${f.id} ${good ? "OK " : "XX "} want=${f.expect.outcome}/${f.expect.decidedBy} got=${a.evaluation.outcome}/${a.evaluation.decidedBy}${a.flags.includes("extraction_failed") ? " EXTRACTION_FAILED" : ""}`);
  }
}));
console.log(rows.sort().filter((r) => r.includes("XX")).join("\n"));
console.log(`agreement ${ok}/40 = ${Math.round(ok / 0.4)}%; hard exclusions/not-a-lead ${okHard}/${nHard}`);
