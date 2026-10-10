// Database schema — build_spec.md §5. Postgres on Neon, managed by drizzle-kit.
import { sql } from "drizzle-orm";
import type { ComplianceFlag, DesignerBrief, ExtractedCall, QualificationReasons } from "../lib/types/call-json";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const callType = pgEnum("call_type", [
  "new_enquiry",
  "existing_client_issue", // complaint / escalation
  "followup_update", // existing client asking for an update on their project
  "reschedule_request",
  "vendor_other",
  "wrong_number",
  "incomplete",
]);
export const qualification = pgEnum("qualification", [
  "qualified",
  "not_qualified",
  "needs_review",
  "not_a_lead",
]);
export const temperature = pgEnum("temperature", ["hot", "warm", "cold"]);
export const outcomeStage = pgEnum("outcome_stage", [
  "none",
  "consultation_done",
  "no_show",
  "proposal_sent",
  "won",
  "lost",
]);
export const bookingMode = pgEnum("booking_mode", ["site_visit", "phone_call"]);
export const bookingStatus = pgEnum("booking_status", ["confirmed", "cancelled", "rescheduled"]);
export const syncStatus = pgEnum("sync_status", ["pending", "ok", "failed", "dead"]);

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type TranscriptTurn = { role: "agent" | "caller"; text: string; at_ms?: number };

export const designers = pgTable("designers", {
  key: text("key").primaryKey(), // "ruhi", "jay"
  name: text("name").notNull(),
  email: text("email").notNull(),
  active: boolean("active").notNull().default(true),
  maxPerDay: integer("max_per_day").notNull().default(4),
});

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaaniCallId: text("vaani_call_id").notNull().unique(),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    durationSec: integer("duration_sec"),
    callerNumber: text("caller_number"),
    callerName: text("caller_name"),
    language: text("language"),

    callType: callType("call_type"),

    transcript: jsonb("transcript").$type<TranscriptTurn[]>(),
    extracted: jsonb("extracted").$type<ExtractedCall>(),
    summary: text("summary"),
    designerBrief: jsonb("designer_brief").$type<DesignerBrief>(),
    followUpQuestions: jsonb("follow_up_questions").$type<string[]>(),

    qualification: qualification("qualification"),
    qualificationReasons: jsonb("qualification_reasons").$type<QualificationReasons>(),
    temperature: temperature("temperature"),
    temperatureReasons: jsonb("temperature_reasons").$type<string[]>(),

    flags: jsonb("flags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    complianceFlags: jsonb("compliance_flags").$type<ComplianceFlag[]>().notNull().default(sql`'[]'::jsonb`),

    assignedDesigner: text("assigned_designer").references(() => designers.key),
    needsFollowup: boolean("needs_followup").notNull().default(false),
    followupReason: text("followup_reason"),
    followupDoneAt: ts("followup_done_at"),

    linkedCallIds: jsonb("linked_call_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    emailStatus: text("email_status"),
    emailSentAt: ts("email_sent_at"),
    hubspotContactId: text("hubspot_contact_id"),
    hubspotDealId: text("hubspot_deal_id"),
    hubspotStatus: text("hubspot_status"),

    outcomeStage: outcomeStage("outcome_stage").notNull().default("none"),
    outcomeValue: integer("outcome_value"),
    outcomeReason: text("outcome_reason"),

    // true when created from a fixture/test; never routed to real services
    isTest: boolean("is_test").notNull().default(false),

    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("calls_caller_number_idx").on(t.callerNumber),
    index("calls_started_at_idx").on(t.startedAt),
    index("calls_followup_idx").on(t.needsFollowup),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // vaani call id, not calls.id: a booking can exist before the post-call webhook creates the call row
    vaaniCallId: text("vaani_call_id").notNull(),
    designer: text("designer").notNull().references(() => designers.key),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    mode: bookingMode("mode").notNull(),
    googleEventId: text("google_event_id"),
    status: bookingStatus("status").notNull().default("confirmed"),
    callerName: text("caller_name"),
    callbackNumber: text("callback_number"),
    locality: text("locality"),
    society: text("society"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One shared studio calendar: no two confirmed bookings may overlap, whichever designer they belong to.
    // Enforced by the exclusion constraint `bookings_no_overlap` in db/migrations/0001_bookings_no_overlap.sql
    // (drizzle can't express EXCLUDE constraints). This index makes the same start time fail fast too.
    uniqueIndex("bookings_start_confirmed_uq").on(t.startAt).where(sql`${t.status} = 'confirmed'`),
    index("bookings_vaani_call_idx").on(t.vaaniCallId),
  ],
);

export const rawEvents = pgTable(
  "raw_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // "vaani"
    eventId: text("event_id"), // envelope id (evt_...) — dedupe key
    receivedAt: ts("received_at").notNull().defaultNow(),
    signatureOk: boolean("signature_ok").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: ts("processed_at"),
    error: text("error"),
  },
  (t) => [uniqueIndex("raw_events_source_event_uq").on(t.source, t.eventId)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaaniCallId: text("vaani_call_id"),
    tool: text("tool").notNull(),
    request: jsonb("request"),
    response: jsonb("response"),
    latencyMs: integer("latency_ms"),
    ok: boolean("ok").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("tool_calls_vaani_call_idx").on(t.vaaniCallId)],
);

export const callAudit = pgTable("call_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(), // user email or "system"
  at: ts("at").notNull().defaultNow(),
  field: text("field").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
});

export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id").references(() => calls.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // designer_email | escalation_email | hubspot_upsert | calendar_update | ...
  status: syncStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextRetryAt: ts("next_retry_at").notNull().defaultNow(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  payload: jsonb("payload"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// Editable lead rubric and business assumptions (Rubric tab). Missing keys fall back to config/rules.ts.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(), // "rules" | "rubric_text" | "business"
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const settingsAudit = pgTable("settings_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  actor: text("actor").notNull(),
  at: ts("at").notNull().defaultNow(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
});

// "Teach the AI": a designer marks the system's verdict, temperature or a fact as wrong.
export const aiCorrections = pgTable(
  "ai_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // "qualification" | "temperature" | "fact"
    field: text("field").notNull(), // e.g. qualification, temperature, locality
    aiValue: jsonb("ai_value"),
    humanValue: jsonb("human_value"),
    reason: text("reason"),
    context: jsonb("context"), // snapshot: quote, decidedBy, locality… used for suggestions and prompt hints
    suggestion: jsonb("suggestion"), // proposed rubric change, if any
    status: text("status").notNull().default("open"), // open | applied | dismissed
    createdBy: text("created_by").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    resolvedBy: text("resolved_by"),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("ai_corrections_status_idx").on(t.status)],
);

export type Call = typeof calls.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Designer = typeof designers.$inferSelect;
