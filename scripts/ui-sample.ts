// Temporary UI preview data: inserts 4 sample calls (vaani_call_id "ui-sample-*", is_test=true) and a booking.
// Usage: npx tsx --conditions=react-server scripts/ui-sample.ts            (insert)
//        npx tsx --conditions=react-server scripts/ui-sample.ts --cleanup  (delete every ui-sample row)
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { like } from "drizzle-orm";
import * as schema from "../db/schema";
import type { TranscriptTurn } from "../db/schema";

const PREFIX = "ui-sample-";
const MIN = 60_000;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL in .env.local");
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });

  // Always clean first so the script is re-runnable.
  await db.delete(schema.bookings).where(like(schema.bookings.vaaniCallId, `${PREFIX}%`));
  await db.delete(schema.calls).where(like(schema.calls.vaaniCallId, `${PREFIX}%`));
  if (process.argv.includes("--cleanup")) {
    console.log("Removed ui-sample rows.");
    await pool.end();
    return;
  }

  await db
    .insert(schema.designers)
    .values([
      { key: "ruhi", name: "Ruhi", email: "ruhi@aangan.example" },
      { key: "jay", name: "Jay", email: "jay@aangan.example" },
    ])
    .onConflictDoNothing();

  const now = Date.now();
  const at = (minsAgo: number) => new Date(now - minsAgo * MIN);

  const hotTranscript: TranscriptTurn[] = [
    { role: "agent", text: "Namaste, thank you for calling Aangan Studio. I'm the studio's AI assistant and this call is recorded. How can I help?" },
    { role: "caller", text: "Hi, I'm Priya Kulkarni. We just got possession of a 3BHK in Kharadi, Gera World of Joy, and we want the full home done." },
    { role: "agent", text: "Congratulations on the new home! Are you looking for us to design and carry out the work?" },
    { role: "caller", text: "Yes, design and execution both. We'd like to move in by March, so ideally we start next month." },
    { role: "agent", text: "That works well. Roughly how large is the flat?" },
    { role: "caller", text: "About 1450 square feet. My husband and I decide together, he'll join the visit." },
    { role: "agent", text: "Lovely. Ruhi from our team can come for a site visit tomorrow at 11 in the morning. Shall I book that?" },
    { role: "caller", text: "Yes please, book it. Our friend Ankit Shah recommended you, you did his place in Baner." },
    { role: "agent", text: "Done, Ruhi will visit tomorrow at 11 am. You'll get a confirmation on WhatsApp." },
  ];

  const [hot, notQ, review, escalation] = await db
    .insert(schema.calls)
    .values([
      {
        vaaniCallId: `${PREFIX}hot`,
        startedAt: at(95),
        endedAt: at(89),
        durationSec: 372,
        callerNumber: "+919822012345",
        callerName: "Priya Kulkarni",
        language: "english",
        callType: "new_enquiry",
        transcript: hotTranscript,
        summary:
          "Full-home interiors for a newly possessed 3BHK (~1450 sq ft) in Gera World of Joy, Kharadi. Wants to move in by March; couple decides together. Referred by a past client. Site visit booked with Ruhi.",
        designerBrief: {
          warning: null,
          oneLiner: "Full 3BHK in Kharadi, possession done, move-in by March: a referral, ready to start next month.",
          keyFacts: [
            { label: "Property", value: "3BHK, ~1450 sq ft", evidence: { quote: "About 1450 square feet", turn: 5 } },
            { label: "Location", value: "Gera World of Joy, Kharadi", evidence: { quote: "a 3BHK in Kharadi, Gera World of Joy", turn: 1 } },
            { label: "Scope", value: "Full home, design + execution", evidence: { quote: "design and execution both", turn: 3 } },
            { label: "Timeline", value: "Move in by March; start next month", evidence: { quote: "move in by March", turn: 3 } },
            { label: "Referral", value: "Ankit Shah (past client, Baner)", evidence: { quote: "Our friend Ankit Shah recommended you", turn: 7 } },
          ],
          verdict: [],
          budgetSignal: "Not stated",
          decisionMakerNote: "Couple decides together; husband will attend the visit.",
          flags: ["Referral from a past client"],
          followUpQuestions: ["Any rooms they want to prioritise?", "Is the kitchen to be redone or kept?"],
          suggestedOpeningLine: "Hi Priya, this is Ruhi from Aangan. Ankit's home was such a joy to do; I'm looking forward to seeing yours in Kharadi.",
          meeting: null,
        },
        followUpQuestions: ["Any rooms they want to prioritise?"],
        qualification: "qualified",
        qualificationReasons: {
          decidedBy: "all_pass",
          perCriterion: [
            { criterion: "real_project", status: "pass", reason: "Wants design and execution", source: "qualified.md §1" },
            { criterion: "service_area", status: "pass", reason: "In service area (Kharadi)", source: "qualified.md §2" },
            { criterion: "timeline", status: "pass", reason: "Deadline leaves enough time", source: "qualified.md §3" },
            { criterion: "budget", status: "pass", reason: "No budget mentioned", source: "qualified.md §4" },
            { criterion: "decision_maker", status: "pass", reason: "Caller decides", source: "qualified.md §5" },
          ],
          exclusion: null,
        },
        temperature: "hot",
        temperatureReasons: ["Booked a consultation on the call (+2)", "Referral from a named past client (+1)", "Wants to start within 90 days (+1)", "Clear scope and size (+1)"],
        flags: ["repeat_caller"],
        complianceFlags: [],
        assignedDesigner: "ruhi",
        emailStatus: "sent",
        emailSentAt: at(86),
        hubspotStatus: "ok",
        hubspotDealId: "1840021",
        isTest: true,
      },
      {
        vaaniCallId: `${PREFIX}notq`,
        startedAt: at(60 * 20),
        endedAt: at(60 * 20 - 4),
        durationSec: 241,
        callerNumber: "+919765400112",
        callerName: "Rahul Deshpande",
        language: "marathi",
        callType: "new_enquiry",
        transcript: [
          { role: "agent", text: "Namaskar, Aangan Studio. I'm the studio's AI assistant and this call is recorded." },
          { role: "caller", text: "I have a 2BHK in Talegaon, I need it done in three weeks for my daughter's wedding." },
          { role: "agent", text: "Thank you. Our team works within Pune city and PCMC, so Talegaon is outside our area, I'm sorry." },
          { role: "caller", text: "Okay. How much would it cost per square foot roughly?" },
          { role: "agent", text: "Pricing depends on the design, so our designers share that after a consultation." },
        ],
        summary: "2BHK in Talegaon needed in three weeks for a wedding. Outside service area and timeline too tight.",
        qualification: "not_qualified",
        qualificationReasons: {
          decidedBy: "service_area",
          perCriterion: [
            { criterion: "real_project", status: "pass", reason: "Wants design and execution", source: "qualified.md §1" },
            { criterion: "service_area", status: "fail", reason: "Outside Pune/PCMC (Talegaon)", source: "qualified.md §2" },
            { criterion: "timeline", status: "fail", reason: "Needs completion sooner than design and execution can take", source: "qualified.md §3" },
            { criterion: "budget", status: "pass", reason: "No budget mentioned", source: "qualified.md §4" },
            { criterion: "decision_maker", status: "unclear", reason: "Not discussed (not pushed)", source: "qualified.md §5" },
          ],
          exclusion: null,
        },
        temperature: "cold",
        temperatureReasons: ["Not qualified: always cold"],
        flags: ["tight_timeline", "price_asked", "later_start_not_offered"],
        complianceFlags: [{ code: "missing_disclosure", severity: "warning", turn: 0, text: "Disclosure shortened" }],
        isTest: true,
      },
      {
        vaaniCallId: `${PREFIX}review`,
        startedAt: at(60 * 27),
        endedAt: at(60 * 27 - 3),
        durationSec: 198,
        callerNumber: "+918600778899",
        callerName: "Sneha Iyer",
        language: "english",
        callType: "new_enquiry",
        transcript: [
          { role: "agent", text: "Hello, Aangan Studio. I'm the studio's AI assistant and this call is recorded." },
          { role: "caller", text: "Hi, I'm looking at doing up my parents' flat, I'm just collecting options for them." },
          { role: "agent", text: "Of course. Will your parents be part of the decision?" },
          { role: "caller", text: "They'll decide, I'm only researching. Can you tell me a starting price, like around 1500 per square foot?" },
          { role: "agent", text: "Projects usually start from around ₹1,500 per sq ft, but a designer will confirm." },
          { role: "caller", text: "Okay, I'd rather talk to a real person about this." },
        ],
        summary: "Researching for parents' flat; parents decide and may not be involved. Asked about price; prefers a human.",
        designerBrief: {
          warning: "Prefers to talk to a person. Call back personally.",
          oneLiner: "Daughter researching options for her parents' flat; parents decide.",
          keyFacts: [{ label: "Decision-maker", value: "Parents decide", evidence: { quote: "They'll decide, I'm only researching", turn: 3 } }],
          verdict: [],
          budgetSignal: "Not stated",
          decisionMakerNote: "Parents decide; caller is researching.",
          flags: ["Wants a person"],
          followUpQuestions: ["Where is the flat?", "Would her parents join a consultation?"],
          suggestedOpeningLine: "Hi Sneha, this is Jay from Aangan; happy to walk you and your parents through how we work.",
          meeting: null,
        },
        qualification: "needs_review",
        qualificationReasons: {
          decidedBy: "decision_maker",
          perCriterion: [
            { criterion: "real_project", status: "unclear", reason: "Scope or execution intent not stated", source: "qualified.md §1" },
            { criterion: "service_area", status: "unclear", reason: "Locality not recognised (not given)", source: "qualified.md §2" },
            { criterion: "timeline", status: "pass", reason: "No deadline given", source: "qualified.md §3" },
            { criterion: "budget", status: "pass", reason: "No budget mentioned", source: "qualified.md §4" },
            { criterion: "decision_maker", status: "fail", reason: "Only researching for others; owners not involved", source: "qualified.md §5" },
          ],
          exclusion: null,
        },
        temperature: "warm",
        temperatureReasons: ["No strong signals"],
        flags: ["price_asked", "frustrated"],
        complianceFlags: [{ code: "price_leak", severity: "critical", turn: 4, text: "around ₹1,500 per sq ft" }],
        assignedDesigner: "jay",
        needsFollowup: true,
        followupReason: "prefers_human,needs_review",
        isTest: true,
      },
      {
        vaaniCallId: `${PREFIX}escalation`,
        startedAt: at(40),
        endedAt: at(37),
        durationSec: 166,
        callerNumber: "+919890011223",
        callerName: "Mr. Anand Joshi",
        language: "hindi",
        callType: "existing_client_issue",
        transcript: [
          { role: "agent", text: "Namaste, Aangan Studio. I'm the studio's AI assistant and this call is recorded." },
          { role: "caller", text: "My designer hasn't replied in five days and the carpenters stopped work in Aundh. This is not acceptable." },
          { role: "agent", text: "I'm sorry about that. I'm passing this to Nikhil right away so someone calls you today." },
        ],
        summary: "Existing client in Aundh: no reply from designer for five days; carpenters stopped work. Escalated to Nikhil.",
        qualification: "not_a_lead",
        qualificationReasons: { decidedBy: "existing_client_issue", perCriterion: [], exclusion: null },
        temperature: "cold",
        flags: ["frustrated"],
        complianceFlags: [],
        needsFollowup: true,
        followupReason: "existing_client_issue",
        isTest: true,
      },
    ])
    .returning();

  // Booking for the hot lead: tomorrow ~11:00 IST, shifted if the shared calendar is busy.
  const istMidnightTomorrow = (() => {
    const shifted = new Date(now + 330 * MIN);
    return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - 330 * MIN;
  })();
  let booked = false;
  for (let h = 11; h <= 18 && !booked; h++) {
    const start = new Date(istMidnightTomorrow + h * 60 * MIN + 7 * MIN);
    try {
      await db.insert(schema.bookings).values({
        vaaniCallId: hot.vaaniCallId,
        designer: "ruhi",
        startAt: start,
        endAt: new Date(start.getTime() + 90 * MIN),
        mode: "site_visit",
        callerName: "Priya Kulkarni",
        callbackNumber: "+919822012345",
        locality: "Kharadi",
        society: "Gera World of Joy",
      });
      booked = true;
    } catch {
      // overlap: try the next hour
    }
  }

  await db.insert(schema.callAudit).values({
    callId: review.id,
    actor: "system",
    field: "note",
    newValue: "Price leak alert emailed to Nikhil.",
  });
  await db.insert(schema.syncJobs).values({
    callId: hot.id,
    kind: "hubspot_upsert",
    status: "failed",
    attempts: 3,
    lastError: "HubSpot 429: rate limited (sample)",
    idempotencyKey: `${PREFIX}${hot.id}-hubspot`,
  });

  console.log(`Inserted 4 sample calls (${[hot, notQ, review, escalation].map((c) => c.id).join(", ")}), booking: ${booked}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
