# Catalog Item Map Appearance — Design

**Date:** 2026-07-20
**Status:** Approved (brainstorm) — ready for implementation plan

## Problem

When a catalog product is dragged onto the 2D hall map (studio), it renders as a
fixed-size white rounded rectangle with the product name as text — [`PlacementChip`](../../../app/(app)/studio/canvas-stage.tsx)
(≈1650×720 mm, constants `CHIP_W`/`CHIP_H`). It ignores the product's real
dimensions, so a candle holder and a bar look identical, and nothing reads as a
recognizable object. Designers want catalog items to render like the hall's
stage/bar fixtures: a real footprint at true scale, optionally carrying an icon
or the item's name.

## Goal

A catalog item renders on the 2D map as its **true-scale footprint**, and the
designer chooses, per item, what appears **inside** that footprint: an **icon**,
the **product name**, or **nothing**.

- פמוט (candle holder) → small circle + icon
- bar → footprint + icon or name
- stage-like item → footprint, empty

## Decisions (from brainstorm)

1. **Footprint is always the element**, drawn at true scale. Content (icon / name /
   none) is a per-item choice drawn inside it.
2. **Shape fidelity includes an arbitrary polygon editor** — not just rect/circle/
   ellipse. Products can have custom outlines (e.g. an L-shaped or curved piece).
3. **Icons come from a curated Lucide set** — a searchable grid, stored as an icon
   name string. `lucide-react` is already a dependency used throughout the app.
4. **One unified "appearance" control** in the product drawer, built around a live
   preview — not two separate icon/shape features.

---

## Section A — Data Model

Add **one optional field** to `Product`. Legacy and sample products remain valid
untouched (absence is resolved to a sensible default).

```ts
// lib/catalog/types.ts
import type { Point, EdgeCurve } from "../design-document/types"; // Point already exported there
// (EdgeCurve currently lives in lib/studio/hall.ts — re-export or move alongside Point.)

export interface MapAppearance {
  // Footprint. rect/circle/ellipse read from `dimensions` (no duplication);
  // "custom" is the only variant that stores its own geometry.
  shape: "rect" | "circle" | "ellipse" | "custom";
  outline?: Point[];                 // required iff shape === "custom"; mm, centered on (0,0)
  edgeCurves?: (EdgeCurve | null)[]; // optional curved edges — reserved for phase 2

  // What's drawn inside the footprint.
  content: "icon" | "name" | "none";
  icon?: string;                     // Lucide icon name, iff content === "icon"
}

export interface Product {
  // …existing fields…
  appearance?: MapAppearance;        // absent → derived from dimensions (see resolver)
}
```

Reuse choices:

- `shape` **extends the hall's `FixtureShape`** (`"rect" | "circle" | "ellipse"`)
  with `"custom"` — the same vocabulary the hall editor and studio `TableNode`
  already use.
- rect / circle / ellipse footprints come from the **`dimensions` the drawer already
  collects** (`diameterMm`, `widthMm`, `depthMm`). One source of truth; the quote and
  packing lists keep reading the same numbers. Only `custom` introduces new geometry.

### Resolver

A shared `resolveFootprint(product)` in `lib/studio/` (next to
[`catalog-resolver.ts`](../../../lib/studio/catalog-resolver.ts)) collapses the
optional field into something the renderer and the preview can both draw:

- Explicit `appearance.shape` wins.
- Otherwise **derive**: `dimensions.diameterMm` present → circle; else `widthMm`/
  `depthMm` present → rect; else a **floor default (~600 mm square)** so nothing ever
  renders at zero size.
- Default `content` = `"name"` → **preserves today's behavior** (name shown in a
  shape) for every existing product.

### Storage seam

No change to the pattern. `appearance` rides through the existing JSON
`saveProducts`/`loadProducts` in [`lib/catalog/storage.ts`](../../../lib/catalog/storage.ts).
Later it becomes a JSONB column in [`lib/db/schema.ts`](../../../lib/db/schema.ts),
exactly like `dimensions` and `categoryFields` are handled today. A few
`SAMPLE_PRODUCTS` entries get an `appearance` to demonstrate; the rest rely on the
resolver default.

---

## Section B — Drawer UX (unified control)

One new section in [`ProductDrawer`](../../../app/(app)/catalog/product-drawer.tsx),
**"מראה על התוכנית"**, built around a shared live preview:

```
┌─ מראה על התוכנית ──────────────────────┐
│  ┌───────────┐   צורה:                  │
│  │           │   (▢ מלבן)(○ עיגול)       │
│  │   live    │   (⬮ אליפסה)(✎ מותאם)      │
│  │  preview  │                          │
│  │           │   תוכן:                   │
│  └───────────┘   (🪑 אייקון)(Aa שם)(∅ ריק) │
│   true-scale, same renderer as editor    │
└──────────────────────────────────────────┘
```

- **Shape toggle** — reuses the `shapeToggle` pattern from
  [`SelectionInspector`](../../../app/(app)/halls/wall-canvas.tsx). rect/circle/
  ellipse need no extra inputs (they read the dimension fields already in the drawer).
- **"מותאם" (custom)** turns the preview into a **mini polygon editor**: click to drop
  vertices, click the first vertex to close, drag vertices to adjust; a "רשם מחדש"
  (redraw) action resets. Straight edges in v1; `edgeCurves` stays reserved so curved
  outlines can be added later with no data migration.
- **Content toggle** — icon / name / none. Choosing **"אייקון"** opens a **searchable
  Lucide grid** (~30–50 curated event glyphs — chair, candle, glass, speaker, …); the
  selected glyph appears in the preview.
- The **preview always shows the real footprint at scale** with the chosen content, so
  the designer sees exactly what will land on the map before saving.

---

## Section C — Map Rendering

Replace the fixed-size `PlacementChip` in
[`canvas-stage.tsx`](../../../app/(app)/studio/canvas-stage.tsx) with a
`PlacementNode` that draws the **resolved footprint at true scale**, honoring the
placement's existing `rotation` and `scale` fields via a Konva `Group` — the same
approach `FixtureMarker` and `TableNode` already use.

- **Footprint:** rect/circle/ellipse → Konva `Rect`/`Circle`/`Ellipse` from dimensions;
  custom → Konva `Line` (closed, points from `outline`). Fill/stroke reuse the existing
  `C` design tokens; selected = `accentTint` fill + `accent` stroke (unchanged).
- **Content:** `icon` → Lucide glyph centered inside; `name` → Konva `Text`, auto-shrink
  then ellipsis when the footprint is small; `none` → nothing.
- **Quantity `×N` badge** — kept as today.

---

## Section D — Edge Cases

- **Legacy / no `appearance`** → resolver derives shape from dimensions, content = name
  → today's behavior preserved.
- **`content: "icon"` with no icon chosen** → fall back to name (never silently blank).
- **`content: "name"`, footprint too small for text** → text shrinks to a floor, then
  ellipsis; illegible-when-tiny is acceptable (zoom in).
- **`shape: "custom"` not closed (<3 vertices)** → drawer blocks save, same as the
  existing name/height validation.
- **Resizing:** rect/circle/ellipse follow the dimension inputs; custom owns its
  outline. Map-level `scale`/`rotation` (already on `Placement`) transform the whole
  footprint.
- **RTL:** drawer and picker use CSS logical properties (existing convention). The Konva
  plan is a spatial map and is **not** mirrored (a hall isn't RTL-flipped — consistent
  with the current canvas); Lucide glyphs are direction-neutral; name text is Heebo.
  The mini-editor's arrow-key nudge follows the hall editor's `nudge` convention.
- **Icon render perf:** many placements sharing an icon must not each load an image —
  cache by icon name (see fork 1).

---

## Implementation Forks (with recommendations)

1. **Lucide inside Konva.** Konva draws canvas shapes, not React SVG components.
   **Recommended:** render the chosen glyph's SVG to a `data:` URI → Konva `Image`,
   **cached module-level by icon name** so N placements of the same glyph share one
   image. Uniform for single- and multi-path glyphs.
   *Alternative:* hand-map each glyph's path data to Konva shapes — more code, breaks on
   multi-element icons.

2. **Mini polygon editor.** **Recommended:** build a small standalone SVG
   `PolygonEditor`, **borrowing** the `clientToMm` (getScreenCTM) + `dragHandlers` math
   from [`wall-canvas.tsx`](../../../app/(app)/halls/wall-canvas.tsx) — **not** reusing
   `WallCanvas` itself, which is fused to entrances/stage/bars/columns. Leave
   `WallCanvas` untouched; no risky refactor of working hall code. `lib/studio/geometry.ts`
   helpers are available directly if curved edges land later.

---

## Out of Scope (v1)

- Curved custom edges (`edgeCurves`) — field reserved, editor is straight-line only.
- Icon color/variant customization — glyphs use the existing ink/accent tokens.
- Per-variant appearance — appearance is product-level; variants differ by shade/price
  only, as today.

## Verification

- `npm run typecheck` and `npm run check:actions` pass.
- Existing products (no `appearance`) still render on the map (name in a shape),
  proving backward compatibility.
- A product set to icon/circle renders a small circle with the glyph; a custom-outline
  product renders its polygon at true scale; a "none" product renders an empty
  footprint.
- `/present` and meeting mode remain free of any internal data (unchanged — appearance
  carries no prices/quantities).
