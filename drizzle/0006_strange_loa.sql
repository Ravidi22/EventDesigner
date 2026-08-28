ALTER TABLE "events" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "setup_date" date;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "checkpoint_offsets" jsonb;