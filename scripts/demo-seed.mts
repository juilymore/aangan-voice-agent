// Demo data: runs the 40 September 2026 enquiries through the FULL post-call pipeline into the
// database, with all-mock providers (no real AI, email, CRM or calendar is contacted).
// Demo rows are marked is_test=true and use vaani_call_id "demo-…".
// Usage: npm run demo:seed            (re-creates the demo data)
//        npm run demo:seed -- --clean (removes it)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { readFileSync } = await import("node:fs");
const { and, eq, like, inArray, sql } = await import("drizzle-orm");
const { db, schema } = await import("../lib/db");
const { mockDeps } = await import("../lib/providers");
const { MockLlmProvider } = await import("../lib/ai/types");
const { parseEnquiries } = await import("../lib/pipeline/enquiry-text");
const { processCall } = await import("../lib/pipeline/process");
const { computeSlots, blockMinutes } = await import("../lib/calendar/slots");
const { FIXTURES } = await import("../tests/fixtures/sep2026");
const { mockExtractionJson, NAMES } = await import("../tests/fixtures/mock-extraction");

const conn = db();

async function clean() {
  const demoCalls = await conn.select({ id: schema.calls.id }).from(schema.calls).where(like(schema.calls.vaaniCallId, "demo-%"));
  if (demoCalls.length) await conn.delete(schema.calls).where(inArray(schema.calls.id, demoCalls.map((c) => c.id)));
  await conn.delete(schema.bookings).where(like(schema.bookings.vaaniCallId, "demo-%"));
  await conn.delete(schema.toolCalls).where(like(schema.toolCalls.vaaniCallId, "demo-%"));
  console.log(`Removed ${demoCalls.length} demo calls and their bookings.`);
}

await clean();
if (process.argv.includes("--clean")) process.exit(0);

const enquiries = new Map(parseEnquiries(readFileSync("docs/enquiries_sep2026.txt", "utf8")).map((e) => [e.id, e]));
const number = (i: number) => `+91 00000 ${String(10000 + i).slice(-5)}`; // clearly fake numbers

// Consultations the front desk booked on these calls, placed on the shared calendar from now on.
const BOOKED: Record<string, "site_visit" | "phone_call"> = {
  T01: "site_visit", T02: "phone_call", T05: "site_visit", T06: "site_visit", T11: "phone_call", T12: "site_visit",
  T13: "phone_call", T15: "site_visit", T16: "phone_call", T17: "site_visit", T20: "site_visit",
  W01: "site_visit", W03: "site_visit", W04: "site_visit", W06: "site_visit",
};
const designers = (await conn.select().from(schema.designers).where(eq(schema.designers.active, true))).map((d) => ({
  key: d.key, name: d.name, maxPerDay: d.maxPerDay,
}));
const busy: { start: Date; end: Date }[] = [];
const load: Record<string, Record<string, number>> = {};
const now = new Date();
let i = 0;

for (const f of FIXTURES) {
  i++;
  const e = enquiries.get(f.id)!;
  const vaaniCallId = `demo-${f.id}`;

  if (BOOKED[f.id]) {
    const mode = BOOKED[f.id];
    // Start offering from ~1 hour from now so "today" has consultations too.
    const [slot] = computeSlots({ now: new Date(now.getTime() - 11 * 3600_000), mode, busy, designers, load, limit: 1 });
    if (slot) {
      busy.push({ start: slot.start, end: new Date(slot.start.getTime() + blockMinutes(mode) * 60_000) });
      const p = slot.start.toISOString();
      load[slot.designer] ??= {};
      load[slot.designer][p] = 1;
      await conn.insert(schema.bookings).values({
        vaaniCallId,
        designer: slot.designer,
        startAt: slot.start,
        endAt: slot.end,
        mode,
        googleEventId: `demo-event-${f.id}`,
        callerName: NAMES[f.id] ?? null,
        callbackNumber: number(i),
        locality: (f.input.locality as string | undefined) ?? null,
      });
    }
  }

  if (f.id === "T17") {
    // The dropped first call, two minutes earlier (linked to T17 by the pipeline).
    await processCall(
      {
        providerCallId: "demo-T17-dropped",
        startedAt: new Date(e.startedAt.getTime() - 2 * 60_000),
        endedAt: new Date(e.startedAt.getTime() - 2 * 60_000 + 72_000),
        durationSec: 72,
        callerNumber: number(i),
        status: "dropped",
        language: "en",
        transcript: [
          { role: "agent", text: "Good afternoon, Aangan Studio." },
          { role: "caller", text: "Hi, I wanted to inquire about --" },
        ],
      },
      { deps: mockDeps(new MockLlmProvider()), isTest: true, checkDisclosure: false },
    );
  }

  const llm = new MockLlmProvider();
  llm.fallback = mockExtractionJson(f, e.transcript);
  await processCall(
    {
      providerCallId: vaaniCallId,
      startedAt: e.startedAt,
      endedAt: e.durationSec ? new Date(e.startedAt.getTime() + e.durationSec * 1000) : e.startedAt,
      durationSec: e.durationSec,
      callerNumber: number(i),
      status: e.id === "T08" ? "dropped" : "completed",
      language: f.id === "W03" ? "hi" : "en",
      transcript: e.transcript,
    },
    { deps: mockDeps(llm), isTest: true, checkDisclosure: false },
  );
  process.stdout.write(".");
}

// Three extra, clearly synthetic demo calls showing the other call types (not from the September PDF).
const extra: { id: string; at: string; dur: number; name: string; turns: [string, string][]; fields: Record<string, { value: string; quote: string }> }[] = [
  {
    id: "X1-update",
    at: "2026-10-09T15:40:00Z", // 9:10 pm IST, after hours
    dur: 140,
    name: "Rohan Kulkarni",
    turns: [
      ["agent", "Hello, thank you for calling Aangan Studio. I'm the studio's AI assistant, and this call is recorded. How can I help you today?"],
      ["caller", "Hi, I'm Rohan Kulkarni. Ruhi is doing our flat in Baner. I wanted to know when the wardrobes will be delivered."],
      ["agent", "Sure, I'll note this down and get back to you. Which area is the project in?"],
      ["caller", "Baner, Sai Siddhi society."],
      ["agent", "Thank you. I've noted it, and your designer or someone from our team will get back to you during office hours."],
    ],
    fields: {
      caller_name: { value: "Rohan Kulkarni", quote: "I'm Rohan Kulkarni" },
      call_type: { value: "followup_update", quote: "I wanted to know when the wardrobes will be delivered" },
      locality: { value: "Baner", quote: "Baner, Sai Siddhi society" },
      society: { value: "Sai Siddhi", quote: "Baner, Sai Siddhi society" },
      existing_client_details: { value: "Designer Ruhi; Baner flat; asking when the wardrobes will be delivered", quote: "Ruhi is doing our flat in Baner" },
    },
  },
  {
    id: "X2-wrong",
    at: "2026-10-09T08:15:00Z",
    dur: 35,
    name: "Unknown",
    turns: [
      ["agent", "Hello, thank you for calling Aangan Studio. I'm the studio's AI assistant, and this call is recorded. How can I help you today?"],
      ["caller", "Oh, is this not the tiles showroom? Sorry, wrong number."],
      ["agent", "No problem at all. Have a good day."],
    ],
    fields: { call_type: { value: "wrong_number", quote: "Sorry, wrong number" } },
  },
  {
    id: "X3-complaint",
    at: "2026-10-09T16:20:00Z", // 9:50 pm IST
    dur: 210,
    name: "Meera Iyer",
    turns: [
      ["agent", "Hello, thank you for calling Aangan Studio. I'm the studio's AI assistant, and this call is recorded. How can I help you today?"],
      ["caller", "This is Meera Iyer. The carpenter left our kitchen half done in Aundh and nobody has come for a week. Jay is our designer."],
      ["agent", "I'm really sorry about this. That's not the experience we want you to have. I've noted everything, and I'm passing it to the studio head. Someone from our team will reach out to you during office hours."],
    ],
    fields: {
      caller_name: { value: "Meera Iyer", quote: "This is Meera Iyer" },
      call_type: { value: "existing_client_issue", quote: "nobody has come for a week" },
      locality: { value: "Aundh", quote: "half done in Aundh" },
      tone: { value: "frustrated", quote: "nobody has come for a week" },
      existing_client_details: { value: "Designer Jay; Aundh kitchen left half done; nobody has come for a week", quote: "The carpenter left our kitchen half done in Aundh" },
    },
  },
];
for (const [k, x] of extra.entries()) {
  const llm = new MockLlmProvider();
  llm.fallback = JSON.stringify({ fields: x.fields });
  const start = new Date(x.at);
  await processCall(
    {
      providerCallId: `demo-${x.id}`,
      startedAt: start,
      endedAt: new Date(start.getTime() + x.dur * 1000),
      durationSec: x.dur,
      callerNumber: number(100 + k),
      status: "completed",
      language: "en",
      transcript: x.turns.map(([role, text]) => ({ role: role as "agent" | "caller", text })),
    },
    { deps: mockDeps(llm), isTest: true },
  );
}

// The demo calls happened in September, so give their designer emails a realistic "about a minute
// after the call ended" timestamp instead of today's seeding time.
await conn.execute(
  sql`update calls set email_sent_at = ended_at + (interval '50 seconds' + random() * interval '60 seconds')
      where vaani_call_id like 'demo-%' and email_sent_at is not null and ended_at is not null`,
);

// A little history so the funnel and audit trail have something to show.
const byId = async (id: string) => (await conn.select().from(schema.calls).where(eq(schema.calls.vaaniCallId, `demo-${id}`)))[0];
const story: [string, Partial<typeof schema.calls.$inferInsert>, string][] = [
  ["T05", { outcomeStage: "consultation_done" }, "Site visit done; client loved the warm-minimal direction."],
  ["F05", { outcomeStage: "proposal_sent" }, "Proposal sent for the Hinjewadi office fitout."],
  ["W06", { outcomeStage: "won", outcomeValue: 1_850_000 }, "Signed: full 3BHK in Koregaon Park."],
  ["T01", { outcomeStage: "consultation_done" }, "First site visit done. Follow-up with material board next week."],
];
for (const [id, patch, note] of story) {
  const c = await byId(id);
  if (!c) continue;
  await conn.update(schema.calls).set({ ...patch, updatedAt: new Date() }).where(eq(schema.calls.id, c.id));
  await conn.insert(schema.callAudit).values([
    { callId: c.id, actor: c.assignedDesigner === "jay" ? "Jay" : "Ruhi", field: "outcome_stage", oldValue: "none", newValue: patch.outcomeStage, reason: null },
    { callId: c.id, actor: c.assignedDesigner === "jay" ? "Jay" : "Ruhi", field: "note", oldValue: null, newValue: note, reason: null },
  ]);
}

const counts = await conn
  .select({ q: schema.calls.qualification })
  .from(schema.calls)
  .where(and(like(schema.calls.vaaniCallId, "demo-%")));
const tally = counts.reduce<Record<string, number>>((a, r) => ((a[r.q ?? "?"] = (a[r.q ?? "?"] ?? 0) + 1), a), {});
console.log(`\nSeeded ${counts.length} demo calls:`, tally);
process.exit(0);
