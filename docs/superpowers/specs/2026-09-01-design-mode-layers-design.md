# Design mode: real layers, ceiling rods, bulk dressing, layered export

Date: 2026-09-01 · Branch: `feat/production-runway` · Status: approved, ready for planning

## The problem

The studio's hall pass works. The design pass does not, for four separate reasons:

1. **Layers are a filter, not a plane.** `Layer = "table" | "floor" | "ceiling"` exists on every
   `Placement` and `Product`, and the toolbar has three eye-toggles — but a chandelier draws
   identically to a candlestick draws identically to a rug. There is no sense of what is overhead.
   Worse, it is wrong: `classify()` in `app/(app)/studio/canvas-stage.tsx` puts ceiling placements
   into `floorStack()`, so a chandelier is z-ordered among rugs and tables and **can draw behind a
   table**.
2. **There is nothing to hang from.** `VenueStructure` holds nodes, walls, entrances and features —
   every one of them on the floor plane. Real halls have rods built into the ceiling, and a designer
   plans around them: a table goes under a rod *because* a chandelier is going on that rod.
3. **Bulk is one command on one layer.** `applyToTableType` and `applyToAllTables` dress every table
   of a type, or every table. There is no "these tables", no "this zone", and no way to dress one
   table properly and copy that whole dressing onto the other 23 — which is the single most
   repeated action in an evening of design work.
4. **Export has three fixed sheets.** The crew needs a plan per trade: the room, the dressing, the
   ceiling, the stage, the chairs.

## What is NOT changing

- No migrations. `venue_structures.structure` and `design_documents.content` are both JSONB typed
  through TypeScript (`lib/db/schema.ts`), so every new field below is optional and additive.
  `export_type` is a real pgEnum and is deliberately left alone — see §4c.
- No new dependency. Every geometry routine needed already exists in `lib/studio/geometry.ts`,
  `lib/studio/anchor.ts` and `lib/studio/snap.ts`.
- The document stays pure data (ADR-4). Rods live on the **venue**, not the document; what the
  document stores is which rod an item hangs on, exactly as a drape stores which wall it hangs on.

---

## §1 — Layers become a plane

### 1a. Ceiling leaves the floor stack (the bug)

`lib/design-document/stacking.ts` is about *the floor*. Its docstring already says a cloth and a
drape are not in it because neither is an object standing on the floor of the room — a chandelier is
not either, and only reached the stack because `classify()` never asked about `layer`.

In `canvas-stage.tsx`:

```ts
const classify = useCallback((p: Placement): StackKind | undefined => {
  const r = resolve(p.variantId);
  if (r?.anchor === "wall") return undefined;              // a drape hangs on a wall
  if (p.layer === "ceiling") return undefined;             // ← NEW: overhead, not on the floor
  if (p.layer === "table" && p.tableId) return undefined;  // a cloth or a chip belongs to a table
  return r?.sizing === "stretch" ? "carpet" : "item";
}, []);
```

Ceiling placements then draw in **their own pass, last** — after the floor stack, table chips,
group outlines and drapes. Nothing overhead can be occluded by anything on the floor, ever.

The `stacking.ts` self-check gains a case: a ceiling placement is in no stack, and `isStackable()`
is false for it, so the front/back buttons are not offered — a chandelier has nothing on the floor
to be in front of.

### 1b. The overhead look

Ceiling items render with the architectural convention for "above the cut plane":

- dashed stroke (roughly `"120 90"` in world mm, `vectorEffect: non-scaling-stroke`)
- fill at low opacity, or none
- no drop shadow

This is not decoration. It is what makes the ceiling sheet legible in black and white (PRODUCT.md:
B&W-print-legible outputs), and it is what tells the designer at a glance that the thing under the
cursor is overhead. `components/footprint-shape.tsx` takes an `overhead?: boolean` prop; the
placement map reads the same flag so screen and print agree.

### 1c. An active layer

`app/(app)/studio/studio-screen.tsx` state gains one field beside the existing `layerVisible`:

```ts
const [activeLayer, setActiveLayer] = useState<LayerId | null>(null);
```

| `activeLayer` | behaviour |
|---|---|
| `null` (the default, and today's behaviour exactly) | every visible layer is live |
| a layer | that layer at full opacity and hit-testable; other *visible* layers at 35% opacity and `pointer-events: none` |

This is layer **locking** obtained for free — no `locked` flag, no per-layer state machine, no third
toggle in the UI. Dressing tables without dragging a rug by accident is one click.

Consequences that must be honoured:

- `movable` (the list a marquee catches, a group drag carries, and alignment measures against)
  already filters on `layerVisible`. It filters on `activeLayer` too — a rubber-band must never
  catch what the designer cannot interact with. Tables count as the `floor` layer for this purpose.
- Venue features are floor-plane and follow the `floor` layer.
- Keyboard delete, copy and cut operate on the selection, which by the above can only hold live
  items. No further change needed.

Toolbar (`app/(app)/studio/toolbar.tsx`): each of the three layer chips becomes *click = make this
the active layer, click again = back to all*, with the eye icon a separate small toggle inside the
chip. `aria-pressed` on the chip reports active; the eye keeps its own label.

---

## §2 — Ceiling rods

### 2a. The type

```ts
// lib/venues/structure.ts
/** A rod or truss built into the hall's ceiling — the thing a chandelier or a ceiling installation
 *  is physically hung from. The PROPERTY's, like a wall: measured once at /halls, and every event
 *  held in the room plans around the same rods.
 *
 *  Two absolute points rather than a node graph. Rods cross the room and share nothing with the
 *  walls, so there is no shared endpoint to keep in step and nothing a graph would buy. `a === b`
 *  is a single hanging point (an eyebolt), drawn as a cross rather than a line. */
export interface CeilingRig {
  id: string;
  label: string;      // "מוט מרכזי", "מוט 3"
  a: Point;
  b: Point;
  heightMm: number;   // above the floor
  loadKg?: number;    // rated load. RECORDED AND PRINTED, never validated against — see §5.
}

export interface VenueStructure {
  nodes: StructureNode[];
  walls: Wall[];
  entrances: StructureEntrance[];
  features: StructureFeature[];
  rigs?: CeilingRig[];   // absent on every venue drawn before this existed
}
```

`emptyStructure()` leaves `rigs` absent. Every reader defaults it to `[]`. No migration.

Editing helpers live beside the existing ones in `structure.ts` and follow the same shape (every
mutation returns a new structure): `addRig`, `updateRig`, `removeRig`, plus `rigLengthMm`.

### 2b. Drawing them at /halls

`app/(app)/halls/halls-screen.tsx` has a bottom dock with `mode: "walls" | "select"` and a
`wallKind` sub-control. A third mode joins it: **מוטות תקרה**.

- Press–drag–release draws one rod. Rods are standalone segments, so there is no chained
  `runNodeId` run the way walls have — press for `a`, release for `b`.
- Angle constraint reuses `constrainAngleDeg` from `snap.ts`; a rod is almost always square to the
  room.
- A click without a drag (under the snap tolerance) places a single hanging point (`a === b`).
- Rods are **only drawn in this mode** at /halls, so the wall drawing and zone tools are unchanged
  and uncluttered.
- Selection: `PlanSelectionKind` in `lib/venues/selection.ts` gains `"rig"`, and that module's
  rectangle hit-test picks up rods alongside nodes, walls, doors, features and zones.
  `components/venue-inspector.tsx` gains a rig panel: label, height (m), rated load (kg, optional),
  and a read-only length.

### 2c. Hanging an item on one

A drape *spans* a wall; a chandelier hangs at a *point* on a rod. Different shapes, so a separate
field rather than a widened `WallSpan`:

```ts
// lib/design-document/types.ts
/** Where a ceiling item hangs. When set, `position` is derived from the rod and ignored — the same
 *  contract WallSpan has, and for the same reason: the rod belongs to the property, so a hall
 *  re-surveyed at /halls carries its chandeliers with it instead of leaving them in mid-air.
 *  A `rigId` that no longer resolves is ignored on read, exactly like a dangling wallId. */
export interface RigHang {
  rigId: string;
  t: number;         // 0..1 along the rod
  dropMm?: number;   // how far below the rod it hangs; absent = flush
}

export interface Placement {
  // ...
  hang?: RigHang;
}
```

`lib/studio/anchor.ts` gains three functions mirroring its wall trio, reusing `pointAtDistance` and
`projectOntoWall` verbatim:

- `rigSegment(structure, rigId): WallSegment | null`
- `resolveHang(structure, hang): Point | null`
- `nearestRig(structure, p): { rigId; distanceMm; t } | null`

Its self-check gains cases for a zero-length rod (a hanging point: `t` is always 0, resolving to
that point) and a dangling `rigId`.

### 2d. The two gestures the designer asked for

**Hang a chandelier on a rod.** Dropping or dragging a ceiling-layer item within `RIG_SNAP_MM`
(400mm) of a rod writes `hang` and drops `position` from the item's meaning. Further away it stays a
free point, exactly as today. A hung item travels with its rod if the rod is later moved at /halls.

**Put the table under the rod.** While the `ceiling` layer is *visible*, a dragged table's centre
snaps onto the nearest rod's centre-line. This is a line snap, not the existing box-alignment snap:
`snapPoint()` in `lib/studio/snap.ts` gains an optional `lines?: { a: Point; b: Point }[]` in
`SnapContext`, and projects the candidate point onto any line within tolerance. Guides draw in the
same accent as the existing alignment guides. When the ceiling layer is hidden, no lines are passed
and the behaviour is bit-for-bit what it is today.

`snap.ts`'s self-check gains: a point near a line snaps onto it; a point far from it does not; an
empty `lines` list changes nothing.

### 2e. Knowing there is a rod there

Two answers, because the question is asked in two situations:

- **The inspector**, on any selected ceiling placement: `תלוי על: מוט מרכזי · 4.2מ׳`, or
  `אין מוט במיקום הזה` in alert ink when the item is free. A `dropMm` field when it is hung.
- **The canvas**, when the ceiling layer is visible: rods draw as thin dashed overhead lines with
  their label and height. Off by default, so the designer never sees the rigging plan until they
  ask — which is the stated requirement. There is no fourth toggle: rods are part of the ceiling
  layer's own visibility.

---

## §3 — Bulk operations

The generalisation is in the *selection*, not in a matrix of commands. Every operation the studio
already has — drag, rotate, delete, style, restack, copy, paste — takes a list of refs. Make the
selection easy to build and they all become bulk operations at no cost.

### 3a. Selection commands

In the inspector, and on the canvas context menu:

- **בחר דומים** — every placement of the same variant, or every table of the same `type`.
- **בחר הכל באזור** — everything whose centre falls inside the focused zone's boundary
  (point-in-polygon against `plan.zones[].boundary`).
- **בחר שכבה** — everything on the active layer.

All three route through the existing `pickMany`, so group expansion, feature exclusion and the
`docRefs`/`featureRefs` split are already handled.

### 3b. Two new actions

In `lib/design-document/actions.ts`:

```ts
| { type: "applyToTables"; tableIds: string[]; placement: Omit<Placement, "id" | "tableId">; replaces?: string[] }
| { type: "copyDressing"; fromTableId: string; toTableIds: string[]; mode: "add" | "replace" }
```

**`applyToTables` replaces `applyToTableType` and `applyToAllTables`.** Both become one-line callers
that compute an id list and delegate to the same `spreadOverTables()` body that exists today. The
net effect is *fewer* branches than the current code, and "החל על הנבחרים" and "החל על האזור" fall
out for free. The `exceptions` contract (F-5.3) is unchanged: a table with a recorded exception for
this variant is skipped, and a `replaces` swap is a substitution rather than remove+add so it never
records a false divergence.

**`copyDressing`** is the one that saves an evening. It takes every table-layer placement on the
source table and reproduces it on each target, minting new ids and preserving `quantity`,
`rotation`, `scale` and `position`.

- `mode: "add"` leaves what the target already wears and adds what it lacks (idempotent, like
  `spreadOverTables`).
- `mode: "replace"` clears the target's table-layer placements first — "make these look like that
  one", which is what a designer means when they say it.
- The source table's own cover is spread with the same `replaces` logic the current `spreadCloth`
  uses, so a target already wearing gold is recoloured rather than given a second cloth.
- Exceptions are respected in `add` mode and **cleared for the targets** in `replace` mode — an
  explicit "make it identical" overrides an earlier divergence, and silently honouring a months-old
  exception there would read as the button being broken.

The `actions.ts` self-check gains cases for: applying to an explicit id list; a target list holding
an id that no longer exists (ignored, not a crash); `copyDressing` in both modes; copying from an
undressed table (a no-op that returns the same document, so no history entry is pushed).

### 3c. Distribute

**פיזור אחיד** on 3+ selected items with free positions: equal gaps along the dominant axis of the
selection. `snap.ts` already computes equal-gap runs for the *preview*; this writes them as one
history entry. Offered only when every selected item has a position of its own — not for a cloth
(its table's surface), not for a drape (pinned by both ends), and not for a hung ceiling item (its
rod owns its position, and distributing along a rod is `t`, a later idea).

---

## §4 — Export by layer

### 4a. The sheet

```ts
// lib/outputs/sheets.ts
export interface PlanSheet {
  id: string;
  label: string;
  layers: Layer[];
  groups?: CategoryGroupId[];         // "במה" is a category group, not a layer
  tables: "none" | "ghost" | "full";  // ghost = faint outline for reference
  chairs: boolean;
  rigs: boolean;
  numbers: boolean;
}
```

Presets, in one array:

| id | label | what it carries |
|---|---|---|
| `hall` | שרטוט אולם | walls, doors, features, tables full, chairs, numbers |
| `design` | שרטוט עיצוב | the above plus the `floor` and `table` layers |
| `ceiling` | תוכנית תקרה | rods and the `ceiling` layer, tables **ghosted** so the rigger sees what is underneath |
| `stage` | במה | `grp-stages` only, plus walls for orientation |
| `chairs` | פריסת כיסאות | tables ghosted, chairs and numbers full |

Walls, doors and zone floors are on **every** sheet — a plan with no room on it is not a plan.

### 4b. Wiring

`app/(app)/outputs/placement-map.tsx` takes a `sheet: PlanSheet` prop and filters what it draws.
Every filter decision is a lookup on the sheet, never a hard-coded category test in the renderer.

`app/(app)/outputs/outputs-screen.tsx`: the `map` view gains a multi-select of sheets; ticking three
renders three pages, which the existing `window.print()` path prints as three pages. Each page
carries its own sheet name beside the existing date and version stamp.

### 4c. The export log

Every plan sheet records as `placement_map`. The `export_type` pgEnum is **not** extended: a ceiling
plan is a placement map of the ceiling, the log's job is "a plan went out on this date at this
document version", and five new enum values would buy a migration and a more granular log nobody
reads. If that turns out to be wrong it is one migration later.

Sealing is unchanged: printing seals the document (`sealDocument`), and printing three sheets in one
press is one seal at one version, because it is one export of one drawing.

---

## §5 — Deliberately not built

- **Positions of items on a table.** `Placement.position` is documented as "offset within table" but
  the renderer ignores it and fans chips vertically at fixed 840mm steps (`canvas-stage.tsx`).
  Making it honest and draggable is a small change and the field already persists — but it was
  raised and not taken, so it stays as it is. Add when arranging a centrepiece against candlesticks
  on one table actually matters.
- **Per-event rods.** An event bringing its own truss cannot be drawn. Rods are the property's.
  Add when a real job needs it; the shape would mirror `FeaturePlacement`.
- **Load validation.** `loadKg` is recorded and printed. Nothing sums the weight hanging off a rod
  and warns. That needs a weight per product, which the catalog does not have.
- **A 3D or elevation view.** Rod height is a number on a 2D plan. ADR-8 territory; not reopened.
- **A free-form layer builder in outputs.** Five named sheets is what a crew is handed. A sixth is
  one line in the array.

---

## Verification

Per CLAUDE.md's working rules, plus the self-checks this change adds:

- `npm run typecheck`
- `npm run check:stacking` — ceiling leaves the floor stack
- `npm run check:anchor` — rod resolution, hanging points, dangling ids
- `npm run check:snap` — line snapping
- `npm run check:actions` — `applyToTables`, `copyDressing` in both modes
- `npm run check:structure` — `addRig`/`updateRig`/`removeRig`, zero-length rods
- `npm run check:selection` — a rod is selectable and a rod id under another kind is not it
- `npm run check:access`
- `npm run check:costs` — §4 touches `app/(app)/outputs`, which is a printing surface: no
  `costPrice`, no `lib/suppliers/`, no margin may appear on any sheet.

## Build order

1. §1 + §2 together — rods are useless without the ceiling layer reading as overhead.
2. §3 — bulk.
3. §4 — export sheets, which are a filter over what §1 and §2 established.
