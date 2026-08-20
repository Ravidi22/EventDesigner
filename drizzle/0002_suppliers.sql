CREATE TYPE "public"."stock_kind" AS ENUM('owned', 'consumable', 'rented');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"event_id" uuid,
	"variant_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"spent_at" date NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"supplies" text,
	"note" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_kind" "stock_kind" DEFAULT 'owned' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_qty" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "order_unit" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "order_factor" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_org_date_idx" ON "expenses" USING btree ("organization_id","spent_at");--> statement-breakpoint
CREATE INDEX "expenses_supplier_idx" ON "expenses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "expenses_event_idx" ON "expenses" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "suppliers_org_idx" ON "suppliers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "suppliers_org_live_idx" ON "suppliers" USING btree ("organization_id","name") WHERE "suppliers"."archived" = false;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_supplier_idx" ON "products" USING btree ("supplier_id");