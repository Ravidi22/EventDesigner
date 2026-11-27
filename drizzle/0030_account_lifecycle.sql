CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_kind" text,
	"target_id" text,
	"summary" text NOT NULL,
	"people" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "organization_closures" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"closed_by" uuid,
	"erase_after" timestamp with time zone NOT NULL,
	"erased_at" timestamp with time zone,
	"files_erased_at" timestamp with time zone,
	"retain_until" date,
	"issuer" jsonb,
	"printed" jsonb
);
--> statement-breakpoint
CREATE INDEX "audit_log_org_at_idx" ON "audit_log" USING btree ("organization_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_documents_frozen() RETURNS trigger AS $$
BEGIN
  -- A billing document may not change after it has a number (הוראות ניהול ספרים s.18, s.23א).
  -- Only the columns the law lets move after issue are open: the allocation number, the status
  -- stamps (original / sent / cancelled) with their details, and the superseding link.
  --
  -- 0030 (EVE-22): `issued_by` may become NULL, and nothing else. A person may be erased — a member
  -- who deletes their account, or one the owner removes — and its foreign key is ON DELETE SET NULL;
  -- before this, deleting anyone who had ever issued a document failed. The document keeps every
  -- other column, the printed ones included.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.series IS DISTINCT FROM OLD.series
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (NEW.issued_by IS DISTINCT FROM OLD.issued_by AND NEW.issued_by IS NOT NULL)
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
