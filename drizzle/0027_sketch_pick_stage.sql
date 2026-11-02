ALTER TABLE "sketch_templates" ADD COLUMN "photo_url" text;--> statement-breakpoint
-- Written by hand below this line (drizzle emits schema, not data). The meeting gained סקיצת פתיחה
-- right after `details` (spec 2026-11-01-meeting-sketch-pick-design.md). A studio that saved its own
-- flow gets it too — an empty flow reads DEFAULT_FLOW, which already lists it. Rebuilt as
-- normalizeFlow writes it: `details` first, then the new stage, then the rest in their order.
UPDATE "studio_settings"
SET "meeting_flow" = ARRAY['details', 'start']::text[] || array_remove("meeting_flow", 'details')
WHERE cardinality("meeting_flow") > 0 AND NOT ('start' = ANY("meeting_flow"));--> statement-breakpoint
-- events.step is an INDEX into the flow, so every studio event past the details moves one along —
-- otherwise an event parked at the quote would read as the stage before it and find its quote locked.
-- Only studios run this meeting; a venue's bookings walk their own steps.
UPDATE "events"
SET "step" = "step" + 1
WHERE "step" >= 1
  AND "organization_id" IN (SELECT "id" FROM "organizations" WHERE "kind" = 'studio');
