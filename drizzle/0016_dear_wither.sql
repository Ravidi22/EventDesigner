CREATE TYPE "public"."order_status" AS ENUM('sent', 'confirmed', 'partial', 'delivered', 'declined');--> statement-breakpoint
CREATE TYPE "public"."organization_kind" AS ENUM('studio', 'supplier');--> statement-breakpoint
CREATE TABLE "event_crew" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "event_crew_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_label" text NOT NULL,
	"unit_cost" numeric(12, 2),
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_org_id" uuid,
	"window_from" date NOT NULL,
	"window_to" date NOT NULL,
	"status" "order_status" DEFAULT 'sent' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "kind" "organization_kind" DEFAULT 'studio' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_product_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_org_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "linked_org_id" uuid;--> statement-breakpoint
ALTER TABLE "event_crew" ADD CONSTRAINT "event_crew_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_crew" ADD CONSTRAINT "event_crew_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_crew_user_idx" ON "event_crew" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_org_idx" ON "orders" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "orders_supplier_org_idx" ON "orders" USING btree ("supplier_org_id","sent_at");--> statement-breakpoint
CREATE INDEX "orders_window_idx" ON "orders" USING btree ("organization_id","window_from","window_to");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_linked_org_id_organizations_id_fk" FOREIGN KEY ("linked_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_source_idx" ON "products" USING btree ("organization_id","source_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_org_linked_key" ON "suppliers" USING btree ("organization_id","linked_org_id");