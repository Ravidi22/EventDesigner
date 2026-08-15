CREATE TYPE "public"."appointment_kind" AS ENUM('consultation', 'followup', 'walkthrough', 'other');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid,
	"client_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"venue_id" uuid,
	"date" date NOT NULL,
	"start_time" time,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"kind" "appointment_kind" DEFAULT 'consultation' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_org_date_idx" ON "appointments" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "appointments_event_idx" ON "appointments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "appointments_venue_idx" ON "appointments" USING btree ("venue_id");--> statement-breakpoint
-- HAND-ADDED, and it must stay above the DROP below. drizzle-kit writes the schema change; it has
-- no way to know that the column being dropped holds data that belongs in the table just created.
-- Every event that had a meeting booked against it becomes one consultation on the new calendar,
-- carrying the event's own organisation, client, phone and venue so it lands on the right dashboard.
--
-- `done` is left at its default false even for meetings long past: whether a booked meeting was
-- actually held is not something a date can answer, and guessing here would write a fact nobody
-- asserted. `created_at` is the event's, not now() — the row is new but the booking is not.
INSERT INTO "appointments" ("organization_id", "event_id", "client_name", "phone", "venue_id", "date", "kind", "created_at", "updated_at")
SELECT "organization_id", "id", "client_name", "phone", "venue_id", "meeting_date", 'consultation'::"public"."appointment_kind", "created_at", now()
FROM "events"
WHERE "meeting_date" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "meeting_date";
