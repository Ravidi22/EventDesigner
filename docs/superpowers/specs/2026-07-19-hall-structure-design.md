# Hall Structure — fixed physical shell

Version 1 | 2026-07-19 | Scope: Hall create/edit flow only.

## Goal

The Hall create/edit flow (`app/(app)/halls/`) has no way to define a hall's fixed
architectural facts — the shell that never moves between events — as distinct from the
per-event "design" layer (`DesignDocumentContent`: tables/placements, edited in the Studio
screen). Add a **Hall Structure** section to the Hall create/edit form covering: room
outline (arbitrary polygon, not just a rectangle), entrances (location + count), ceiling
height, stage placement, and bar counters.

## Current state (from codebase survey)

- `lib/studio/hall.ts` → `Hall` is already the structural shell in intent ("Static hall
  shell: walls, columns, entrance, and near-fixed elements"), but underspecified:
  `widthMm`/`heightMm` (rectangle only), `columns` (obstacles), `entranceX` (single point,
  assumed to sit on the bottom wall), `fixtures?: Fixture[]` (generic array; stage/bar
  identified today by matching the Hebrew label string `"במה"`/`"בר"` — fragile).
- The "design" layer is `lib/design-document/types.ts` → `DesignDocumentContent` (tables,
  placements, sketch, calibration), **per-event**, lives only in `app/(app)/studio`. It never
  reads or writes `Hall`. Structure vs. design is already separated at the route/storage
  level — this work extends the structure side without touching design-document types.
- `HallTemplate` (`lib/setup/types.ts`) wraps `{ id, name, hall: Hall, mmPerUnit, createdAt }`
  and persists via `lib/setup/storage.ts` (`idesign.setup.templates` key) +
  `lib/studio/storage.ts` (`saveHall`/`loadHall`, per active event). Both are existing
  localStorage seams — no new storage module needed, extending `Hall` flows through them.
- Renderers that read `Hall` today: `components/plan-preview.tsx` (hall list card + editor
  preview), `app/(app)/studio/canvas-stage.tsx` (Konva studio canvas), `app/(app)/outputs/placement-map.tsx`
  (PDF-ish output), `app/meeting/import-flow.tsx` (sketch-import overlay), plus the seed data
  in `lib/setup/sample-data.ts` and `EMPTY_HALL` in `app/meeting/meeting-screen.tsx`.

## Data model (`lib/studio/hall.ts`)

```ts
export interface Point { x: number; y: number; }

export interface Column { x: number; y: number; rMm: number; } // unchanged

export interface Entrance { id: string; x: number; y: number; widthMm: number; }

export interface Fixture { id: string; label: string; x: number; y: number; widthMm: number; depthMm: number; } // unchanged shape

export interface Hall {
  widthMm: number;         // bounding box; still read as-is by canvas-stage/placement-map/import-flow (out of scope, unchanged)
  heightMm: number;        // bounding box; same
  outline?: Point[];       // polygon room outline in mm; optional (old saved halls won't have it) — absent falls back to the width×height rectangle
  ceilingHeightMm: number; // new, required going forward
  columns: Column[];       // unchanged
  entrances: Entrance[];   // replaces entranceX
  stage?: Fixture;         // replaces fixtures[] entries labeled "במה"; 0 or 1
  bars: Fixture[];         // replaces fixtures[] entries labeled "בר"; 0+
}
```

`entranceX` and `fixtures` are removed from the type. `Fixture` itself is unchanged (still
`{id, label, x, y, widthMm, depthMm}`) — `stage`/`bars` just give it typed, non-string-matched
homes.

**Blast radius decision (user-confirmed):** only `PlanPreview` becomes polygon/entrances/stage/bars-aware.
`canvas-stage.tsx`, `placement-map.tsx`, and `import-flow.tsx` keep reading `widthMm`/`heightMm`
as a plain rectangle (unaffected) but must be updated mechanically wherever they read the
now-removed `entranceX`/`fixtures` fields, since those fields no longer exist on `Hall`:
- `entranceX` usages → loop `hall.entrances` and draw one marker per entrance (was already a
  single hardcoded marker; becomes a `.map`).
- `fixtures` usages → loop `[hall.stage, ...hall.bars].filter(Boolean)` instead of `hall.fixtures ?? []`.

This is a rename-driven mechanical fix (~2-3 lines per file), not a rendering rewrite.

## Geometry helper (`lib/studio/geometry.ts`)

Add `polygonAreaMm2(outline: Point[]): number` (shoelace formula), used by the hall list card's
area figure when `outline` is set (today it's `widthMm * heightMm`, which overstates area once
outlines stop being rectangles). Extend the file's existing `import.meta.main` self-check block
with an assert against a known rectangle and a known right-triangle.

## `PlanPreview` (`components/plan-preview.tsx`)

- Outline: `<polygon points={...}>` from `hall.outline` when present (≥3 points), else the
  existing `<rect>` from `widthMm`/`heightMm` (backward-compat for old saved data).
- Entrances: loop `hall.entrances`, one marker rect per entry (was one hardcoded marker).
- Stage/bars: loop `[hall.stage, ...hall.bars].filter(Boolean)` instead of `hall.fixtures ?? []`
  — same rect+label rendering as today, just sourced from the typed fields.
- Columns: unchanged.

## Editor UI

`app/(app)/halls/halls-screen.tsx`'s `HallEditor` grows enough to split into its own file,
`app/(app)/halls/hall-editor.tsx` (`HallsScreen` in `halls-screen.tsx` imports it — same
list/preview/create/delete flow as today, only the editor form moves). Grouped under a
"שלד האולם" heading, in this order:

1. **שם האולם** — unchanged (existing name field).
2. **קווי מתאר** — width/depth number inputs (meters, as today) generate the default
   4-corner rectangle; below them, a repeatable vertex list (x/y meter pairs, add/remove row)
   lets the designer reshape into an L-shape etc. When the vertex list has been customized
   beyond the default rectangle, `widthMm`/`heightMm` are recomputed as the polygon's bounding
   box on save (inline min/max over the vertices — trivial, no separate helper) so the legacy
   rectangle-renderers stay roughly in sync.
3. **כניסות** — repeatable rows: x, y, door width (meters). Defaults to one entrance at
   bottom-center (matches today's default `entranceX = width/2`).
4. **גובה תקרה** — single number field (meters), default 4.0m for new halls.
5. **במה** — toggle; when on, reveals x/y/width/depth fields (meters). Replaces today's bare
   checkbox-with-hardcoded-position.
6. **עמדות בר** — repeatable rows: x, y, width, depth (meters). Replaces today's single bar
   checkbox.
7. **עמודים (מכשולים)** — unchanged (existing count field, evenly spread).

All new rows use existing form conventions (`controlClassName`, `Button`/`IconButton`,
logical Tailwind classes — `flex flex-col gap-*`, no hardcoded `left`/`right`). Three small
dedicated repeatable-row editors (outline vertices, entrances, bars) rather than one generic
list component — their field sets differ enough (2 vs 3 vs 4 fields) that a shared abstraction
would need more configuration surface than the three inline versions cost.

## Data touch-ups (seed + defaults)

- `lib/setup/sample-data.ts` — both seed halls get `outline`, `ceilingHeightMm`, `entrances`,
  `stage`, `bars` replacing `entranceX`/`fixtures`.
- `newHall()` in `halls-screen.tsx` — same new defaults (rectangle outline from default
  width/depth, one entrance, 4.0m ceiling, no stage, no bars).
- `EMPTY_HALL` in `app/meeting/meeting-screen.tsx` — same shape update, minimal (empty
  entrances/bars, no stage) since it's a placeholder-before-hall-selected state.

## Out of scope (explicit)

- Freehand/drawn floor-plan editing — this stays a form/list editor (dimensions, counts,
  positions as fields), per the assumption going in.
- Propagating the true polygon outline into the Konva studio canvas, PDF placement-map output,
  or sketch-import overlay — they keep the bounding-box rectangle. Flagged as a possible
  follow-up, not built here.
- Any change to `DesignDocumentContent` / the Studio screen / per-event tables — the design
  layer is untouched.
- Multiple stages per hall (rejected in favor of single optional stage, matching the ask's
  wording).
- Wall-edge-relative entrance placement (rejected in favor of a free x/y point, since it
  generalizes to any outline shape without an edge-picker UI).
