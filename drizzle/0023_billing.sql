CREATE TABLE "billing_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"series" text NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid,
	"document_date" date NOT NULL,
	"follows_id" uuid,
	"design_document_id" uuid,
	"document_version" integer,
	"customer" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"schedule" jsonb,
	"payment" jsonb,
	"credit" jsonb,
	"allocation_number" text,
	"allocation_status" text DEFAULT 'n/a' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"original_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_to" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"superseded_by_id" uuid,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"organization_id" uuid NOT NULL,
	"series" text NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "document_counters_organization_id_series_pk" PRIMARY KEY("organization_id","series")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "billing_number" text;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "vat_status" text DEFAULT 'licensed' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "bank_details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_design_document_id_design_documents_id_fk" FOREIGN KEY ("design_document_id") REFERENCES "public"."design_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_documents_number_key" ON "billing_documents" USING btree ("organization_id","series","number");--> statement-breakpoint
CREATE INDEX "billing_documents_org_date_idx" ON "billing_documents" USING btree ("organization_id","document_date");--> statement-breakpoint
CREATE INDEX "billing_documents_event_idx" ON "billing_documents" USING btree ("event_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_documents_frozen() RETURNS trigger AS $$
BEGIN
  -- A billing document may not change after it has a number (הוראות ניהול ספרים s.18, s.23א).
  -- Only the columns the law lets move after issue are open: the allocation number, the status
  -- stamps (original / sent / cancelled) with their details, and the superseding link.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.series IS DISTINCT FROM OLD.series
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
     OR NEW.document_date IS DISTINCT FROM OLD.document_date
     OR NEW.follows_id IS DISTINCT FROM OLD.follows_id
     OR NEW.design_document_id IS DISTINCT FROM OLD.design_document_id
     OR NEW.document_version IS DISTINCT FROM OLD.document_version
     OR NEW.customer IS DISTINCT FROM OLD.customer
     OR NEW.lines IS DISTINCT FROM OLD.lines
     OR NEW.totals IS DISTINCT FROM OLD.totals
     OR NEW.schedule IS DISTINCT FROM OLD.schedule
     OR NEW.payment IS DISTINCT FROM OLD.payment
     OR NEW.credit IS DISTINCT FROM OLD.credit
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
  THEN
    RAISE EXCEPTION 'billing_documents are frozen after issue (document % % )', OLD.series, OLD.number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER billing_documents_frozen BEFORE UPDATE ON "billing_documents" FOR EACH ROW EXECUTE FUNCTION billing_documents_frozen();
