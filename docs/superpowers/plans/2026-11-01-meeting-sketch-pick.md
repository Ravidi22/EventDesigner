# סקיצת פתיחה Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A meeting stage after פרטי האירוע where the designer and the couple pick a saved sketch from picture cards and start the event's drawing from the layers they tick.

**Architecture:** A pure layer filter beside `adoptSketch` decides which layer every element belongs to. The stage fetches a sketch's content (already adopted to the event's venue), filters it on the client, draws THAT document as the preview, and writes THAT document through `saveDocument`, so the preview cannot differ from what lands. A photo URL column on `sketch_templates` is the card cover; one data migration adds the stage to saved flows and shifts existing events' `step` index.

**Tech Stack:** Next.js (app router, server actions), drizzle + Postgres, React client components.

**Spec:** `docs/superpowers/specs/2026-11-01-meeting-sketch-pick-design.md`

**Deviation from spec, deliberate:** the spec says the filter runs "on the server when writing and on the client for the live preview". It runs on the client only and the filtered document is written with `saveDocument` (the autosave's own path). The catalog lookup it needs is the client's primed cache; and one filtered object for both preview and write is what makes the anti-goal "preview = result" true by construction.

## Global Constraints

- Stage id `start`, label `סקיצת פתיחה`, ranked between `details` and `hall`, in `DEFAULT_FLOW`.
- Layers, in this order: `tables` "שולחנות וריהוט" · `stages` "במות" · `design` "עיצוב" · `ceiling` "תקרה". Default: all four ticked.
- No prices, costs or stock counts anywhere on the stage.
- RTL: logical properties only (`ms-`/`me-`/`start`/`end`).
- Destructive confirmation: `components/confirm-dialog.tsx`, ביטול first.
- Migrations generated (`npm run db:generate`), never `db:push`; NOT applied to any shared database without the user's go-ahead (the step shift rewrites live rows).

## Review Focus

- A sketch whose venue was deleted (`venueId` null) — preview draws on an empty plan, write still works.
- A sketch deleted between listing and picking — `fetchSketchTemplateContent` returns null; the stage says so and refreshes the list.
- Unticking tables with design ticked — no item is left with a `tableId` pointing at nothing (self-check).
- A group whose members are split across layers — groups left with fewer than two members are dropped and their `groupId`s cleared (self-check).
- A drape (`span`) from another venue — already gone through `adoptSketch` before filtering; the ceiling count must not count it.

---

### Task 1: The layer filter

**Files:** Modify `lib/studio/sketches.ts` (self-check at its foot), `lib/design-document/actions.ts` (export `pruneGroups`).

**Interfaces — Produces:**
- `type SketchLayer = "tables" | "stages" | "design" | "ceiling"`
- `SKETCH_LAYERS: { id: SketchLayer; label: string }[]`
- `layerOf(p: Placement, categoryOf: (variantId: string) => string | undefined): SketchLayer`
- `takeLayers(doc, take: Record<SketchLayer, boolean>, categoryOf): DesignDocumentContent`

Rules (spec table): ceiling layer → `ceiling`; `stage` → `stages`; `perch` or `layer === "table"` → `design`; category in group `grp-stages` → `stages`; `categoryInPass(c, "hall")` → `tables`; else `design`. Tables, groups and `features` belong to `tables`. Dependencies: a table item goes without tables; a perched item goes when its stage is not kept; a kept ceiling item whose `over` table is not kept loses `over`. `exceptions` kept only when tables and design are both taken, filtered to kept tables. Ends in `pruneGroups`.

- [ ] Self-check cases: each layer alone; all four = the document (deep-equal on ids); tables off + design on → no `tableId` placement survives, floor design does; stages off → perched item gone; tables off + ceiling on → chandelier kept without `over`; a group of one table + one ceiling item with ceiling off → group gone, `groupId` cleared.
- [ ] `npm run check:sketches` passes.

### Task 2: Stage id, photo column, data migration, photo action

**Files:** `lib/meeting/steps.ts` (+ its self-check), `lib/db/schema.ts`, `drizzle/0027_*.sql` (generated, then the data UPDATEs appended by hand), `lib/files/keys.ts` (kind `sketch`), `lib/studio/sketches.ts` (`photoUrl` on the summary), `lib/studio/sketch-actions.ts`.

**Interfaces — Produces:**
- `MeetingStepId` gains `"start"`; `STEP_BY_ID.start`.
- `SketchTemplateSummary.photoUrl: string | null`
- `setSketchPhoto(id: unknown, url: unknown): Promise<SketchTemplateSummary[]>` — `ownedFileUrl`, then `removeReplacedFile` with the old URL read first; `null` removes.

- [ ] steps self-check: `DEFAULT_FLOW[1] === "start"`; `toggleStep` of `start` into `["details","hall"]` lands at index 1.
- [ ] Migration SQL (after the generated `ALTER TABLE`): stored non-empty flows lacking `start` get it at position 2; `events.step = step + 1 where step >= 1` for events of `kind = 'studio'` organisations.
- [ ] `npm run check:meeting`, `npm run typecheck`, `npm run check:actions` pass.

### Task 3: Photo in the studio's סקיצות panel

**Files:** `app/(app)/studio/toolbar.tsx` (`SketchMenu`), `app/(app)/studio/studio-screen.tsx`.

- [ ] Each row: a 32px thumbnail when it has a photo; a camera `BarButton` "הוספת תמונה"/"החלפת תמונה" opening a hidden `<input type="file" accept="image/*">` → `uploadFile(file, "sketch")` → `setSketchPhoto`; with a photo, an `ImageOff` danger `BarButton` "הסרת התמונה". (Photo at save time: not built — save, then add on the row.)

### Task 4: The stage

**Files:** Create `app/meeting/sketch-pick-stage.tsx`. Modify `app/meeting/meeting-screen.tsx`, `components/event-form.tsx` (prop `offerSketch?: boolean`, default true; `DetailsStep` passes false).

**Interfaces — Consumes:** Task 1's `takeLayers`/`layerOf`/`SKETCH_LAYERS`, Task 2's `photoUrl`, `fetchSketchTemplateContent`, `fetchVenueGeometry`, `useEventWorkspace`, `useCatalog`, `PlacementMap` (`bare colour`, sheet layers floor+table+ceiling, no numbers), `saveDocument`.

- [ ] Grid of cards (first card "דף חלק" / "הסקיצה הנוכחית" by whether the event's document has content), filter chips, sticky preview column with תמונה | תוכנית, four checkboxes with per-layer lines, an empty layer disabled, the other-venue line, the empty-library line, "התחלה מהסקיצה" / "המשך" / "המשך עם הנוכחית".
- [ ] Replacing a non-empty drawing asks first; ביטול primary.
- [ ] meeting-screen: renders the stage for `start`; the footer shows only the back button there; `onDone` = `advance(at + 1)`.
- [ ] `npm run typecheck` passes.
