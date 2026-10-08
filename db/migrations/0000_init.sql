CREATE TYPE "public"."booking_mode" AS ENUM('site_visit', 'phone_call');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."call_type" AS ENUM('new_enquiry', 'existing_client_issue', 'reschedule_request', 'vendor_other', 'wrong_number', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."outcome_stage" AS ENUM('none', 'consultation_done', 'no_show', 'proposal_sent', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."qualification" AS ENUM('qualified', 'not_qualified', 'needs_review', 'not_a_lead');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'ok', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."temperature" AS ENUM('hot', 'warm', 'cold');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('designer', 'owner');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vaani_call_id" text NOT NULL,
	"designer" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"mode" "booking_mode" NOT NULL,
	"google_event_id" text,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"caller_name" text,
	"callback_number" text,
	"locality" text,
	"society" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vaani_call_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"caller_number" text,
	"caller_name" text,
	"language" text,
	"call_type" "call_type",
	"transcript" jsonb,
	"extracted" jsonb,
	"summary" text,
	"designer_brief" jsonb,
	"follow_up_questions" jsonb,
	"qualification" "qualification",
	"qualification_reasons" jsonb,
	"temperature" "temperature",
	"temperature_reasons" jsonb,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compliance_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_designer" text,
	"needs_followup" boolean DEFAULT false NOT NULL,
	"followup_reason" text,
	"followup_done_at" timestamp with time zone,
	"linked_call_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_status" text,
	"email_sent_at" timestamp with time zone,
	"hubspot_contact_id" text,
	"hubspot_deal_id" text,
	"hubspot_status" text,
	"outcome_stage" "outcome_stage" DEFAULT 'none' NOT NULL,
	"outcome_value" integer,
	"outcome_reason" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_vaani_call_id_unique" UNIQUE("vaani_call_id")
);
--> statement-breakpoint
CREATE TABLE "designers" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"google_calendar_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"max_per_day" integer DEFAULT 4 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"event_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signature_ok" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid,
	"kind" text NOT NULL,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vaani_call_id" text,
	"tool" text NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"latency_ms" integer,
	"ok" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"designer_key" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_designer_designers_key_fk" FOREIGN KEY ("designer") REFERENCES "public"."designers"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_audit" ADD CONSTRAINT "call_audit_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_assigned_designer_designers_key_fk" FOREIGN KEY ("assigned_designer") REFERENCES "public"."designers"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_designer_key_designers_key_fk" FOREIGN KEY ("designer_key") REFERENCES "public"."designers"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_designer_start_confirmed_uq" ON "bookings" USING btree ("designer","start_at") WHERE "bookings"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "bookings_vaani_call_idx" ON "bookings" USING btree ("vaani_call_id");--> statement-breakpoint
CREATE INDEX "calls_caller_number_idx" ON "calls" USING btree ("caller_number");--> statement-breakpoint
CREATE INDEX "calls_started_at_idx" ON "calls" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "calls_followup_idx" ON "calls" USING btree ("needs_followup");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_events_source_event_uq" ON "raw_events" USING btree ("source","event_id");--> statement-breakpoint
CREATE INDEX "tool_calls_vaani_call_idx" ON "tool_calls" USING btree ("vaani_call_id");