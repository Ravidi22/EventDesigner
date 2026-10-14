CREATE TABLE "quote_drafts" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issued_quotes" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "instagram" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "prices_include_vat" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_drafts" ADD CONSTRAINT "quote_drafts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;