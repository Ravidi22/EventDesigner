ALTER TABLE "studio_settings" ADD COLUMN "business_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "quote_validity_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "quote_terms" text DEFAULT '' NOT NULL;