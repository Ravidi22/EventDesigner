ALTER TYPE "public"."appointment_kind" ADD VALUE 'tasting';--> statement-breakpoint
ALTER TYPE "public"."organization_kind" ADD VALUE 'venue';--> statement-breakpoint
CREATE TABLE "event_hosting" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"slot" text DEFAULT 'evening' NOT NULL,
	"hold_until" date,
	"guaranteed_min" integer,
	"final_guests" integer,
	"final_closed_at" timestamp with time zone,
	"children" integer DEFAULT 0 NOT NULL,
	"vendor_meals" integer DEFAULT 0 NOT NULL,
	"special_meals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"special_note" text DEFAULT '' NOT NULL,
	"service_style" text,
	"run_of_show" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"package_id" uuid,
	"menu_choices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extra_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kitchen_notes" text DEFAULT '' NOT NULL,
	"floor_notes" text DEFAULT '' NOT NULL,
	"vendors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"on_site_name" text DEFAULT '' NOT NULL,
	"on_site_phone" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_event_id" uuid NOT NULL,
	"venue_org_id" uuid NOT NULL,
	"studio_org_id" uuid,
	"studio_event_id" uuid,
	"invited_email" text NOT NULL,
	"invited_by" uuid,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "menu_dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"course" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_adult" numeric(12, 2) DEFAULT '0' NOT NULL,
	"price_child" numeric(12, 2) DEFAULT '0' NOT NULL,
	"price_vendor" numeric(12, 2) DEFAULT '0' NOT NULL,
	"min_guests" integer DEFAULT 0 NOT NULL,
	"courses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_hosting" ADD CONSTRAINT "event_hosting_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_hosting" ADD CONSTRAINT "event_hosting_package_id_menu_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."menu_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_venue_event_id_events_id_fk" FOREIGN KEY ("venue_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_studio_event_id_events_id_fk" FOREIGN KEY ("studio_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_links_venue_event_key" ON "event_links" USING btree ("venue_event_id");--> statement-breakpoint
CREATE INDEX "event_links_studio_event_idx" ON "event_links" USING btree ("studio_event_id");--> statement-breakpoint
CREATE INDEX "event_links_studio_org_idx" ON "event_links" USING btree ("studio_org_id");--> statement-breakpoint
CREATE INDEX "event_links_email_idx" ON "event_links" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "menu_dishes_org_idx" ON "menu_dishes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "menu_packages_org_idx" ON "menu_packages" USING btree ("organization_id");