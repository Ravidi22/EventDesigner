ALTER TABLE "events" ADD COLUMN "event_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "signature_url" text;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "show_bsd" boolean DEFAULT false NOT NULL;