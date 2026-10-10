ALTER TYPE "public"."call_type" ADD VALUE 'followup_update' BEFORE 'reschedule_request';--> statement-breakpoint
CREATE TABLE "ai_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid,
	"kind" text NOT NULL,
	"field" text NOT NULL,
	"ai_value" jsonb,
	"human_value" jsonb,
	"reason" text,
	"context" jsonb,
	"suggestion" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "ai_corrections" ADD CONSTRAINT "ai_corrections_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_corrections_status_idx" ON "ai_corrections" USING btree ("status");