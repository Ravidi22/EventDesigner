CREATE TYPE "public"."account_kind" AS ENUM('studio', 'client');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('amount', 'percent');--> statement-breakpoint
CREATE TYPE "public"."export_type" AS ENUM('placement_map', 'packing_list', 'quote');--> statement-breakpoint
CREATE TYPE "public"."grant_kind" AS ENUM('member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."invite_state" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TYPE "public"."layer" AS ENUM('table', 'floor', 'ceiling');--> statement-breakpoint
CREATE TYPE "public"."price_unit" AS ENUM('unit', 'm', 'm2');--> statement-breakpoint
CREATE TYPE "public"."studio_role" AS ENUM('owner', 'designer', 'crew');--> statement-breakpoint
CREATE TYPE "public"."venue_role" AS ENUM('viewer', 'editor', 'manager');--> statement-breakpoint
CREATE TYPE "public"."product_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."zone_kind" AS ENUM('hall', 'canopy', 'open', 'service');--> statement-breakpoint
CREATE TABLE "design_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"sealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_clients" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_clients_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "event_liked_images" (
	"event_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_liked_images_event_id_image_id_pk" PRIMARY KEY("event_id","image_id")
);
--> statement-breakpoint
CREATE TABLE "event_zones" (
	"event_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_zones_event_id_zone_id_pk" PRIMARY KEY("event_id","zone_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"contact_name" text,
	"contact2_name" text,
	"contact2_phone" text,
	"event_date" date,
	"start_time" time,
	"meeting_date" date,
	"venue_id" uuid,
	"zones_label" text DEFAULT '' NOT NULL,
	"guests" integer DEFAULT 0 NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"quote_sent_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"design_document_id" uuid,
	"type" "export_type" NOT NULL,
	"number" integer NOT NULL,
	"document_version" integer NOT NULL,
	"file_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"product_id" uuid,
	"image_url" text,
	"tone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issued_quotes" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"design_document_id" uuid,
	"document_version" integer NOT NULL,
	"discount_type" "discount_type" DEFAULT 'amount' NOT NULL,
	"discount_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"hidden_variant_ids" uuid[] DEFAULT '{}' NOT NULL,
	"merged_category_ids" text[] DEFAULT '{}' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packing_spares" (
	"event_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "packing_spares_event_id_variant_id_pk" PRIMARY KEY("event_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "presentation_images" (
	"presentation_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "presentation_images_presentation_id_image_id_pk" PRIMARY KEY("presentation_id","image_id")
);
--> statement-breakpoint
CREATE TABLE "presentations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"swatch" text,
	"image_url" text,
	"unit_price" numeric(12, 2),
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"layer" "layer" NOT NULL,
	"category" text NOT NULL,
	"diameter_mm" integer,
	"width_mm" integer,
	"depth_mm" integer,
	"height_mm" integer NOT NULL,
	"category_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spec" text,
	"unit_price" numeric(12, 2),
	"price_unit" "price_unit" DEFAULT 'unit' NOT NULL,
	"style_tags" text[] DEFAULT '{}' NOT NULL,
	"appearance" jsonb,
	"archived" boolean DEFAULT false NOT NULL,
	"visibility" "product_visibility" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "studio_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"business_name" text DEFAULT '' NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"logo_url" text,
	"vat_rate" numeric(5, 4) DEFAULT '0.18' NOT NULL,
	"currency" text DEFAULT '₪' NOT NULL,
	"meeting_flow" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"kind" "account_kind" DEFAULT 'studio' NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "studio_role" DEFAULT 'designer' NOT NULL,
	"state" "invite_state" DEFAULT 'pending' NOT NULL,
	"password_hash" text,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"joined_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venue_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"grantor_org_id" uuid NOT NULL,
	"grantee_org_id" uuid,
	"grantee_user_id" uuid,
	"grantee_email" text NOT NULL,
	"grantee_name" text,
	"kind" "grant_kind" NOT NULL,
	"role" "venue_role" DEFAULT 'viewer' NOT NULL,
	"state" "invite_state" DEFAULT 'pending' NOT NULL,
	"invited_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_structures" (
	"venue_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"structure" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "zone_kind" NOT NULL,
	"source" jsonb NOT NULL,
	"ceiling_height_mm" integer DEFAULT 0 NOT NULL,
	"capacity" jsonb,
	"style" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_documents" ADD CONSTRAINT "design_documents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_clients" ADD CONSTRAINT "event_clients_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_clients" ADD CONSTRAINT "event_clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_liked_images" ADD CONSTRAINT "event_liked_images_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_liked_images" ADD CONSTRAINT "event_liked_images_image_id_gallery_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."gallery_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_design_document_id_design_documents_id_fk" FOREIGN KEY ("design_document_id") REFERENCES "public"."design_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_quotes" ADD CONSTRAINT "issued_quotes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_quotes" ADD CONSTRAINT "issued_quotes_design_document_id_design_documents_id_fk" FOREIGN KEY ("design_document_id") REFERENCES "public"."design_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_spares" ADD CONSTRAINT "packing_spares_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_images" ADD CONSTRAINT "presentation_images_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_images" ADD CONSTRAINT "presentation_images_image_id_gallery_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."gallery_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD CONSTRAINT "studio_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_grants" ADD CONSTRAINT "venue_grants_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_grants" ADD CONSTRAINT "venue_grants_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_structures" ADD CONSTRAINT "venue_structures_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_documents_org_idx" ON "design_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_documents_event_version_key" ON "design_documents" USING btree ("event_id","version");--> statement-breakpoint
CREATE INDEX "event_clients_user_idx" ON "event_clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_liked_images_image_idx" ON "event_liked_images" USING btree ("image_id");--> statement-breakpoint
CREATE INDEX "event_zones_zone_idx" ON "event_zones" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "events_org_idx" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "events_venue_idx" ON "events" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "events_org_date_idx" ON "events" USING btree ("organization_id","event_date");--> statement-breakpoint
CREATE INDEX "exports_org_idx" ON "exports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "exports_document_idx" ON "exports" USING btree ("design_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exports_event_number_key" ON "exports" USING btree ("event_id","number");--> statement-breakpoint
CREATE INDEX "gallery_images_org_idx" ON "gallery_images" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gallery_images_product_idx" ON "gallery_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "issued_quotes_org_idx" ON "issued_quotes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "issued_quotes_document_idx" ON "issued_quotes" USING btree ("design_document_id");--> statement-breakpoint
CREATE INDEX "packing_spares_variant_idx" ON "packing_spares" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "presentation_images_image_idx" ON "presentation_images" USING btree ("image_id");--> statement-breakpoint
CREATE INDEX "presentations_org_idx" ON "presentations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "variants_org_idx" ON "product_variants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "products_org_live_idx" ON "products" USING btree ("organization_id","category") WHERE "products"."archived" = false;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_invite_token_key" ON "users" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE INDEX "venue_grants_venue_idx" ON "venue_grants" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "venue_grants_grantor_idx" ON "venue_grants" USING btree ("grantor_org_id");--> statement-breakpoint
CREATE INDEX "venue_grants_grantee_org_idx" ON "venue_grants" USING btree ("grantee_org_id");--> statement-breakpoint
CREATE INDEX "venue_grants_grantee_user_idx" ON "venue_grants" USING btree ("grantee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_grants_venue_email_key" ON "venue_grants" USING btree ("venue_id","grantee_email");--> statement-breakpoint
CREATE INDEX "venue_structures_org_idx" ON "venue_structures" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "venues_org_idx" ON "venues" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "zones_venue_idx" ON "zones" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "zones_org_idx" ON "zones" USING btree ("organization_id");