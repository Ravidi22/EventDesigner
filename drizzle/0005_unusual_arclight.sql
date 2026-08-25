CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"google_email" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"calendar_id" text NOT NULL,
	"calendar_name" text DEFAULT '' NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"pull_enabled" boolean DEFAULT true NOT NULL,
	"last_push_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_event_links" ADD CONSTRAINT "google_event_links_connection_id_google_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_event_links" ADD CONSTRAINT "google_event_links_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_connections_user_key" ON "google_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "google_connections_org_idx" ON "google_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_event_links_pair_key" ON "google_event_links" USING btree ("connection_id","appointment_id");--> statement-breakpoint
CREATE INDEX "google_event_links_appointment_idx" ON "google_event_links" USING btree ("appointment_id");