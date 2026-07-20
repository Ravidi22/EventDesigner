# Catalog Item Map Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render catalog items on the 2D hall map as true-scale footprints (rect / circle / ellipse / custom polygon) carrying a per-item icon, name, or nothing — instead of the current fixed-size text chip.

**Architecture:** Add one optional `appearance` field to `Product`; a pure resolver collapses it (or its absence) into a footprint + content descriptor. The Konva map (`canvas-stage.tsx`) draws that descriptor; a new drawer section (preview + shape toggle + content toggle + polygon editor + Lucide icon picker) edits it. rect/circle/ellipse reuse the dimensions the drawer already collects; only custom stores its own outline.

**Tech Stack:** Next.js 16, React 19, TypeScript, Konva/react-konva (map), plain SVG (drawer editor/preview), lucide-react (icons), localStorage storage seam.

## Global Constraints

- **RTL / Hebrew-first.** All new DOM UI uses CSS logical properties (`ms-*`/`me-*`, `inset-inline-*`, `start`/`end`) — never `left`/`right`. All user-facing strings are Hebrew.
- **Storage seam.** No `localStorage` calls outside `lib/*/storage.ts`. `appearance` persists through the existing catalog JSON — no new storage code.
- **Design tokens.** Konva code mirrors the `C` token map already in `canvas-stage.tsx`; DOM code uses existing token classes (`text-ink`, `border-border`, `bg-surface`, `text-accent`, etc.). No new colors. Oxblood accent stays ≤10% of the surface.
- **No new dependencies.** konva, react-konva, lucide-react, react-dom are already installed.
- **Verify gate (every task):** `npm run typecheck` must pass (tsc --noEmit; a Stop hook also runs it). Task 1 additionally runs its node self-check. Final task also runs `npm run check:actions`.
- **Repo is not git-initialized.** "Commit" is optional — the real gate is `npm run typecheck`. If you want history, run `git init` once before Task 1; otherwise treat each task's final step as a verify checkpoint.
- **`/present` and meeting mode carry no internal data.** `appearance` holds no prices/quantities, so nothing new leaks — but do not add any to those views.

---

## File Structure

**Create:**
- `lib/studio/footprint.ts` — pure resolver: `resolveFootprint`, `resolveContent`, `footprintBounds`, `outlineBounds`, `MIN_FOOTPRINT_MM`, types `Footprint`/`ResolvedContent`. Includes an `import.meta.main` self-check.
- `lib/catalog/map-icons.ts` — curated Lucide set: `MAP_ICONS`, `ICON_BY_NAME`.
- `components/konva-icon.tsx` — `<KonvaIcon>`: renders a Lucide glyph inside the Konva map via an SVG→Image cache.
- `app/(app)/catalog/appearance-preview.tsx` — `<AppearancePreview>`: read-only SVG of a product's resolved footprint + content (drawer preview).
- `app/(app)/catalog/polygon-editor.tsx` — `<PolygonEditor>`: interactive SVG outline draw/edit for custom footprints.
- `app/(app)/catalog/icon-picker.tsx` — `<IconPicker>`: searchable Lucide grid.

**Modify:**
- `lib/catalog/types.ts` — add `MapAppearance` + `Product.appearance`.
- `app/(app)/studio/canvas-stage.tsx` — replace `PlacementChip` with `PlacementNode`.
- `app/(app)/catalog/product-drawer.tsx` — add the "מראה על התוכנית" section + custom-shape validation.
- `lib/catalog/sample-data.ts` — add `appearance` to a few seed products.
- `package.json` — add `check:footprint` script.

---

## Task 1: Data model + footprint/content resolver

**Files:**
- Modify: `lib/catalog/types.ts`
- Create: `lib/studio/footprint.ts`
- Modify: `package.json` (add `check:footprint` script)

**Interfaces:**
- Produces:
  - `MapAppearance { shape: "rect"|"circle"|"ellipse"|"custom"; outline?: Point[]; content: "icon"|"name"|"none"; icon?: string }`
  - `Product.appearance?: MapAppearance`
  - `MIN_FOOTPRINT_MM = 600`
  - `type Footprint = { kind:"rect"; widthMm; depthMm } | { kind:"circle"; diameterMm } | { kind:"ellipse"; widthMm; depthMm } | { kind:"custom"; outline: Point[] }`
  - `resolveFootprint(product: Product): Footprint`
  - `resolveContent(product: Product): { mode:"icon"|"name"|"none"; icon?: string; name: string }`
  - `outlineBounds(outline: Point[]): { minX; maxX; minY; maxY; w; h; cx; cy }`
  - `footprintBounds(f: Footprint): { w: number; h: number }`

- [ ] **Step 1: Add the types**

In `lib/catalog/types.ts`, `Point` is available from the design-document types. Add the import and the new interface, and extend `Product`:

```ts
import type { Layer, Point } from "../design-document/types";

export type { Layer };

// Map appearance (studio 2D plan). Footprint is always drawn at true scale; `content`
// is what appears inside it. rect/circle/ellipse read from `dimensions` (single source
// of truth) — only "custom" stores its own outline. Outline coordinates are in mm and
// are rendered centered on their bounding box (no pre-centering required).
export interface MapAppearance {
  shape: "rect" | "circle" | "ellipse" | "custom";
  outline?: Point[]; // required iff shape === "custom"
  content: "icon" | "name" | "none";
  icon?: string; // Lucide name, iff content === "icon"
}
```

Then add to the `Product` interface (after `variants`):

```ts
  appearance?: MapAppearance; // absent → derived from dimensions (see resolveFootprint)
```

- [ ] **Step 2: Write the resolver with an inline self-check**

Create `lib/studio/footprint.ts`:

```ts
// Pure appearance resolver (no window/localStorage) — shared by the Konva map renderer
// and the drawer preview. Absence of `appearance` is derived from `dimensions` so every
// legacy/seed product keeps rendering (name-in-a-shape = today's behavior).
import type { Product } from "@/lib/catalog/types";
import type { Point } from "@/lib/design-document/types";

export const MIN_FOOTPRINT_MM = 600; // floor so missing/zero dims never render at zero size

export type Footprint =
  | { kind: "rect"; widthMm: number; depthMm: number }
  | { kind: "circle"; diameterMm: number }
  | { kind: "ellipse"; widthMm: number; depthMm: number }
  | { kind: "custom"; outline: Point[] };

export interface ResolvedContent {
  mode: "icon" | "name" | "none";
  icon?: string;
  name: string;
}

export function resolveFootprint(product: Product): Footprint {
  const d = product.dimensions;
  const shape = product.appearance?.shape ?? (d.diameterMm ? "circle" : "rect");
  if (shape === "custom") {
    const outline = product.appearance?.outline;
    if (outline && outline.length >= 3) return { kind: "custom", outline };
    // malformed custom → fall through to a safe rectangle
  }
  if (shape === "circle") return { kind: "circle", diameterMm: d.diameterMm || MIN_FOOTPRINT_MM };
  const widthMm = d.widthMm || MIN_FOOTPRINT_MM;
  const depthMm = d.depthMm || MIN_FOOTPRINT_MM;
  return { kind: shape === "ellipse" ? "ellipse" : "rect", widthMm, depthMm };
}

export function resolveContent(product: Product): ResolvedContent {
  const a = product.appearance;
  let mode: ResolvedContent["mode"] = a?.content ?? "name";
  if (mode === "icon" && !a?.icon) mode = "name"; // never render blank
  return { mode, icon: a?.icon, name: product.name };
}

export function outlineBounds(outline: Point[]) {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function footprintBounds(f: Footprint): { w: number; h: number } {
  switch (f.kind) {
    case "circle": return { w: f.diameterMm, h: f.diameterMm };
    case "rect":
    case "ellipse": return { w: f.widthMm, h: f.depthMm };
    case "custom": { const b = outlineBounds(f.outline); return { w: b.w, h: b.h }; }
  }
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/footprint.ts
if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m); };
  const base: Product = {
    id: "x", name: "בדיקה", category: "chairs", layer: "floor",
    dimensions: { heightMm: 900 }, categoryFields: {}, styleTags: [], variants: [],
  };
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 } }), { kind: "circle", diameterMm: 1800 }), "diameter derives circle");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 420, depthMm: 450, heightMm: 920 } }), { kind: "rect", widthMm: 420, depthMm: 450 }), "w/d derives rect");
  assert(eq(resolveFootprint(base), { kind: "rect", widthMm: 600, depthMm: 600 }), "missing dims → floor default");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 800, depthMm: 400, heightMm: 100 }, appearance: { shape: "ellipse", content: "none" } }), { kind: "ellipse", widthMm: 800, depthMm: 400 }), "explicit ellipse");
  const outline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
  assert(eq(resolveFootprint({ ...base, appearance: { shape: "custom", outline, content: "none" } }), { kind: "custom", outline }), "valid custom");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 200, depthMm: 200, heightMm: 1 }, appearance: { shape: "custom", outline: [{ x: 0, y: 0 }], content: "none" } }), { kind: "rect", widthMm: 200, depthMm: 200 }), "malformed custom → rect fallback");

  assert(resolveContent(base).mode === "name", "content defaults to name");
  assert(resolveContent({ ...base, appearance: { shape: "rect", content: "icon" } }).mode === "name", "icon without icon → name");
  assert(eq(resolveContent({ ...base, appearance: { shape: "rect", content: "icon", icon: "wine" } }), { mode: "icon", icon: "wine", name: "בדיקה" }), "icon with icon");

  assert(eq(footprintBounds({ kind: "circle", diameterMm: 800 }), { w: 800, h: 800 }), "circle bounds");
  assert(eq(footprintBounds({ kind: "custom", outline }), { w: 100, h: 100 }), "custom bounds");
  console.log("footprint self-check passed");
}
```

- [ ] **Step 3: Add the check script**

In `package.json` `scripts`, after the `check:actions` line:

```json
    "check:footprint": "node --experimental-strip-types lib/studio/footprint.ts",
```

- [ ] **Step 4: Run the self-check — expect it to pass**

Run: `npm run check:footprint`
Expected: prints `footprint self-check passed`, exit code 0. (If it throws `FAIL: …`, fix the resolver, not the assertion.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

---

## Task 2: Map footprint rendering (no icons yet)

Replaces the fixed-size text chip with a true-scale footprint node. After this task, **every existing product already renders as a correctly-sized shape** with its name inside — the core complaint is fixed. Icons come in Task 3.

**Files:**
- Modify: `app/(app)/studio/canvas-stage.tsx` (replace `PlacementChip`, lines ~346-424, and its two call sites ~239 and ~254)
- Modify: `lib/catalog/sample-data.ts`

**Interfaces:**
- Consumes: `resolveFootprint`, `resolveContent`, `footprintBounds`, `outlineBounds` (Task 1); `resolve` from `catalog-resolver` (existing).
- Produces: `PlacementNode` (same props as the old `PlacementChip`: `placement, x, y, selected, onSelect, draggable?, onMove?`) so the two call sites only change the component name.

- [ ] **Step 1: Add imports**

At the top of `canvas-stage.tsx`, add `Ellipse` to the react-konva import and import the resolver helpers:

```ts
import { Stage, Layer, Rect, Circle, Ellipse, Group, Text, Line } from "react-konva";
import { resolveFootprint, resolveContent, footprintBounds, outlineBounds, type Footprint } from "@/lib/studio/footprint";
```

- [ ] **Step 2: Replace `PlacementChip` with `PlacementNode` + a footprint shape helper**

Delete the entire `PlacementChip` function (and the `CHIP_W`/`CHIP_H` constants near the top) and replace with:

```tsx
// Draws a footprint shape centered on (0,0). Custom outlines are translated so their
// bounding-box center sits at (0,0), so all four kinds share one local frame.
function FootprintShape({ footprint, fill, stroke, strokeWidth }: {
  footprint: Footprint;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const common = { fill, stroke, strokeWidth, strokeScaleEnabled: false, listening: false } as const;
  if (footprint.kind === "circle") return <Circle radius={footprint.diameterMm / 2} {...common} />;
  if (footprint.kind === "ellipse") return <Ellipse radiusX={footprint.widthMm / 2} radiusY={footprint.depthMm / 2} {...common} />;
  if (footprint.kind === "custom") {
    const b = outlineBounds(footprint.outline);
    const points = footprint.outline.flatMap((p) => [p.x - b.cx, p.y - b.cy]);
    return <Line points={points} closed {...common} />;
  }
  const { widthMm: w, depthMm: d } = footprint;
  return <Rect x={-w / 2} y={-d / 2} width={w} height={d} cornerRadius={Math.min(w, d) * 0.06} {...common} />;
}

function PlacementNode({
  placement, x, y, selected, onSelect, draggable, onMove,
}: {
  placement: Placement;
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  draggable?: boolean;
  onMove?: (pos: { x: number; y: number }) => void;
}) {
  const r = resolve(placement.variantId);
  const product = r?.product;
  const footprint: Footprint = product ? resolveFootprint(product) : { kind: "rect", widthMm: 600, depthMm: 600 };
  const content = product ? resolveContent(product) : { mode: "name" as const, name: r?.label ?? "פריט" };
  const bounds = footprintBounds(footprint);
  const stroke = selected ? C.accent : C.border;
  const fill = selected ? C.accentTint : C.surface;

  return (
    <Group
      x={x}
      y={y}
      rotation={placement.rotation || 0}
      scaleX={placement.scale || 1}
      scaleY={placement.scale || 1}
      draggable={draggable}
      onDragEnd={draggable && onMove ? (e) => onMove({ x: e.target.x(), y: e.target.y() }) : undefined}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
    >
      <FootprintShape footprint={footprint} fill={fill} stroke={stroke} strokeWidth={selected ? 4 : 2} />

      {content.mode === "name" && (
        <Text
          x={-bounds.w / 2}
          y={-bounds.h / 2}
          width={bounds.w}
          height={bounds.h}
          text={content.name}
          align="center"
          verticalAlign="middle"
          fontSize={Math.max(140, Math.min(bounds.h * 0.4, bounds.w * 0.22))}
          fontFamily="Heebo, sans-serif"
          fill={C.ink}
          padding={Math.min(bounds.w, bounds.h) * 0.08}
          ellipsis
          wrap="none"
          listening={false}
        />
      )}
      {/* content.mode === "icon" wired in Task 3; "none" renders nothing */}

      {placement.quantity > 1 && (
        <Group listening={false}>
          <Rect x={-bounds.w / 2 + 40} y={bounds.h / 2 - 380} width={340} height={340} cornerRadius={70} fill={C.accent} />
          <Text
            x={-bounds.w / 2 + 40}
            y={bounds.h / 2 - 380}
            width={340}
            height={340}
            text={`×${placement.quantity}`}
            align="center"
            verticalAlign="middle"
            fontSize={220}
            fontStyle="600"
            fontFamily="Heebo, sans-serif"
            fill="#ffffff"
          />
        </Group>
      )}
    </Group>
  );
}
```

- [ ] **Step 3: Update the two call sites**

The table-layer placements block (~line 239) and the free placements block (~line 254) each render `<PlacementChip … />`. Rename both to `<PlacementNode … />`. The props are unchanged (both already pass `placement`, `x`, `y`, `selected`, `onSelect`, and the free one adds `draggable`/`onMove`).

- [ ] **Step 4: Add non-icon sample appearances**

In `lib/catalog/sample-data.ts`, add an `appearance` field to two seed products to exercise custom + explicit content:

On **"במה מודולרית"** (the stage), add after `variants: []`:

```ts
    appearance: {
      shape: "custom",
      content: "none",
      outline: [
        { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1000 },
        { x: 1200, y: 1000 }, { x: 1200, y: 2000 }, { x: 0, y: 2000 },
      ],
    },
```

On **"בר עגול מואר"** (the round bar), add after `variants: []`:

```ts
    appearance: { shape: "circle", content: "name" },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`, open the studio for an event, drag several products onto the map (or use one with existing placements). Confirm:
- A chair (420×450) renders as a small rectangle; a round table (Ø1800) as a large circle — sizes visibly differ and match reality.
- The stage renders as an L-shaped polygon with nothing inside.
- The round bar renders as a circle with its name inside.
- Selecting a placement still highlights it (accent stroke); dragging a floor placement still moves it.

---

## Task 3: Curated Lucide set + icons on the map

**Files:**
- Create: `lib/catalog/map-icons.ts`
- Create: `components/konva-icon.tsx`
- Modify: `app/(app)/studio/canvas-stage.tsx` (wire the `icon` branch in `PlacementNode`)
- Modify: `lib/catalog/sample-data.ts`

**Interfaces:**
- Produces:
  - `MAP_ICONS: { name: string; label: string; Icon: LucideIcon }[]`
  - `ICON_BY_NAME: Record<string, LucideIcon>`
  - `<KonvaIcon name={string} color={string} x={number} y={number} size={number} />`
- Consumes: `MAP_ICONS`/`ICON_BY_NAME` in `KonvaIcon` and (Task 5) the picker.

- [ ] **Step 1: Curate the icon set**

Create `lib/catalog/map-icons.ts`. Keep to glyphs that exist in the installed `lucide-react`; if any import fails to resolve at typecheck, remove that entry.

```ts
// Curated glyphs offered for a catalog item's map appearance. `name` is the stable
// string stored on Product.appearance.icon; the component is used both in the DOM
// picker and (via KonvaIcon) on the Konva map.
import {
  Armchair, Table2, Lightbulb, Flame, Frame, Square, Flower2, Wine, Martini,
  Sofa, Speaker, Music, Utensils, Coffee, Gift, Sparkles, Cake, TreePine,
  Star, Heart, Crown, Lamp, GlassWater, Disc, LayoutGrid, Tent, Umbrella, Circle,
  type LucideIcon,
} from "lucide-react";

export interface MapIcon {
  name: string;
  label: string;
  Icon: LucideIcon;
}

export const MAP_ICONS: MapIcon[] = [
  { name: "armchair", label: "כיסא", Icon: Armchair },
  { name: "table", label: "שולחן", Icon: Table2 },
  { name: "lightbulb", label: "תאורה", Icon: Lightbulb },
  { name: "flame", label: "נר / פמוט", Icon: Flame },
  { name: "frame", label: "שטיח / מסגרת", Icon: Frame },
  { name: "square", label: "מפה", Icon: Square },
  { name: "flower", label: "פרחים", Icon: Flower2 },
  { name: "wine", label: "בר", Icon: Wine },
  { name: "martini", label: "קוקטייל", Icon: Martini },
  { name: "sofa", label: "ספה", Icon: Sofa },
  { name: "speaker", label: "רמקול", Icon: Speaker },
  { name: "music", label: "מוזיקה", Icon: Music },
  { name: "utensils", label: "כלי אוכל", Icon: Utensils },
  { name: "coffee", label: "קפה", Icon: Coffee },
  { name: "gift", label: "מתנה", Icon: Gift },
  { name: "sparkles", label: "נצנוץ", Icon: Sparkles },
  { name: "cake", label: "עוגה", Icon: Cake },
  { name: "tree", label: "עץ", Icon: TreePine },
  { name: "star", label: "כוכב", Icon: Star },
  { name: "heart", label: "לב", Icon: Heart },
  { name: "crown", label: "כתר", Icon: Crown },
  { name: "lamp", label: "מנורה", Icon: Lamp },
  { name: "glass", label: "כוס", Icon: GlassWater },
  { name: "disc", label: "רחבה", Icon: Disc },
  { name: "grid", label: "רשת", Icon: LayoutGrid },
  { name: "tent", label: "אוהל", Icon: Tent },
  { name: "umbrella", label: "שמשייה", Icon: Umbrella },
  { name: "circle", label: "עיגול", Icon: Circle },
];

export const ICON_BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  MAP_ICONS.map((i) => [i.name, i.Icon]),
);
```

- [ ] **Step 2: Konva icon renderer**

Create `components/konva-icon.tsx`. Renders the glyph to an SVG string, caches it as an `HTMLImageElement` by name+color, and draws it with react-konva's `Image`.

```tsx
"use client";

import { createElement, useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Image as KonvaImage } from "react-konva";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";

const cache = new Map<string, HTMLImageElement>();

function iconImage(name: string, color: string): HTMLImageElement | undefined {
  const key = `${name}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const Icon = ICON_BY_NAME[name];
  if (!Icon) return undefined;
  const svg = renderToStaticMarkup(createElement(Icon, { color, size: 96 }));
  const img = new window.Image();
  img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  cache.set(key, img);
  return img;
}

// Centered on (x, y), drawn `size`×`size` in Konva user units (mm on this stage).
export function KonvaIcon({ name, color, x, y, size }: {
  name: string;
  color: string;
  x: number;
  y: number;
  size: number;
}) {
  const [, force] = useState(0);
  const img = iconImage(name, color);
  useEffect(() => {
    if (!img || img.complete) return;
    const on = () => force((n) => n + 1);
    img.addEventListener("load", on);
    return () => img.removeEventListener("load", on);
  }, [img]);
  if (!img) return null;
  return <KonvaImage image={img} x={x - size / 2} y={y - size / 2} width={size} height={size} listening={false} />;
}
```

- [ ] **Step 3: Wire the icon branch in `PlacementNode`**

In `canvas-stage.tsx`, import `KonvaIcon`:

```ts
import { KonvaIcon } from "@/components/konva-icon";
```

Then, in `PlacementNode`, replace the comment `{/* content.mode === "icon" wired in Task 3; … */}` with:

```tsx
      {content.mode === "icon" && content.icon && (
        <KonvaIcon
          name={content.icon}
          color={selected ? C.accent : C.inkSoft}
          x={0}
          y={0}
          size={Math.min(bounds.w, bounds.h) * 0.6}
        />
      )}
```

- [ ] **Step 4: Add an icon sample**

In `lib/catalog/sample-data.ts`, on **"פמוט זכוכית"** (the candlestick, 120×120), add after `categoryFields: { arms: 5 }`… actually add after `variants: []`:

```ts
    appearance: { shape: "circle", content: "icon", icon: "flame" },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If a `lucide-react` import in `map-icons.ts` is unresolved, remove that entry and its `MAP_ICONS` row, then re-run.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`, open the studio, place the candlestick (פמוט זכוכית). Confirm it renders as a small circle with a flame glyph centered inside. Select it — the glyph recolors to the accent. Zoom out — the glyph stays legible; zoom in — the circle is true-scale (12cm).

---

## Task 4: Drawer preview + polygon editor

Two SVG building blocks for the drawer. Standalone — not yet wired into the drawer (Task 6).

**Files:**
- Create: `app/(app)/catalog/appearance-preview.tsx`
- Create: `app/(app)/catalog/polygon-editor.tsx`

**Interfaces:**
- Consumes: `resolveFootprint`, `resolveContent`, `outlineBounds` (Task 1); `ICON_BY_NAME` (Task 3); `Product`, `Point`.
- Produces:
  - `<AppearancePreview product={Product} className?={string} />`
  - `<PolygonEditor outline={Point[]} onChange={(o: Point[]) => void} />`

- [ ] **Step 1: Read-only preview**

Create `app/(app)/catalog/appearance-preview.tsx`. It draws the resolved footprint fit into a padded SVG viewBox, plus the content (icon glyph or name). Reuses the same resolver as the map, so preview == map.

```tsx
"use client";

import type { ReactNode } from "react";
import type { Product } from "@/lib/catalog/types";
import { resolveFootprint, resolveContent, outlineBounds } from "@/lib/studio/footprint";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";

export function AppearancePreview({ product, className }: { product: Product; className?: string }) {
  const f = resolveFootprint(product);
  const content = resolveContent(product);

  // Bounds in mm, centered on (0,0) to match the map's local frame.
  let w: number, h: number, shape: ReactNode;
  const shapeProps = { fill: "#ffffff", stroke: "currentColor", strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const };
  if (f.kind === "circle") { w = f.diameterMm; h = f.diameterMm; shape = <circle cx={0} cy={0} r={w / 2} {...shapeProps} />; }
  else if (f.kind === "ellipse") { w = f.widthMm; h = f.depthMm; shape = <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} {...shapeProps} />; }
  else if (f.kind === "custom") {
    const b = outlineBounds(f.outline); w = b.w; h = b.h;
    shape = <polygon points={f.outline.map((p) => `${p.x - b.cx},${p.y - b.cy}`).join(" ")} {...shapeProps} />;
  } else { w = f.widthMm; h = f.depthMm; shape = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(w, h) * 0.06} {...shapeProps} />; }

  const pad = Math.max(w, h) * 0.15 + 100;
  const vb = `${-(w / 2 + pad)} ${-(h / 2 + pad)} ${w + pad * 2} ${h + pad * 2}`;
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  const iconSize = Math.min(w, h) * 0.6;

  return (
    <svg viewBox={vb} className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
      {shape}
      {content.mode === "name" && (
        <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="currentColor"
          style={{ fontSize: Math.max(120, Math.min(h * 0.4, w * 0.22)) }}>
          {content.name}
        </text>
      )}
      {Icon && (
        <g transform={`translate(${-iconSize / 2} ${-iconSize / 2})`}>
          <Icon width={iconSize} height={iconSize} color="currentColor" />
        </g>
      )}
    </svg>
  );
}
```

- [ ] **Step 2: Polygon editor**

Create `app/(app)/catalog/polygon-editor.tsx`. Click to add vertices; click the first vertex (when ≥3) to close; drag vertices to adjust. Borrows the `getScreenCTM`-based `clientToMm` and pointer-capture drag pattern from `wall-canvas.tsx` — it does **not** import `WallCanvas`.

```tsx
"use client";

import { useRef, useState } from "react";
import type { Point } from "@/lib/design-document/types";
import { outlineBounds } from "@/lib/studio/footprint";

const WORK_MM = 3000; // default working extent when there's nothing drawn yet
const SNAP_PX = 14;

export function PolygonEditor({ outline, onChange }: { outline: Point[]; onChange: (o: Point[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const closed = outline.length >= 3; // in this editor a closed polygon = "edit"; open = "draw"

  const b = closed ? outlineBounds(outline) : { cx: WORK_MM / 2, cy: WORK_MM / 2, w: WORK_MM, h: WORK_MM };
  const pad = Math.max(b.w, b.h) * 0.15 + 150;
  const vb = `${b.cx - b.w / 2 - pad} ${b.cy - b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;

  const clientToMm = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(loc.x), y: Math.round(loc.y) };
  };
  const mmToClient = (p: Point): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = p.x; pt.y = p.y;
    const s = pt.matrixTransform(ctm);
    return { x: s.x, y: s.y };
  };

  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (closed) return; // editing: canvas clicks do nothing
    if (outline.length >= 3) {
      const first = mmToClient(outline[0]);
      if (Math.hypot(e.clientX - first.x, e.clientY - first.y) < SNAP_PX) return; // already ≥3 → treat as done (no-op; button closes)
    }
    onChange([...outline, clientToMm(e.clientX, e.clientY)]);
  };

  const moveVertex = (i: number, p: Point) => onChange(outline.map((v, j) => (j === i ? p : v)));

  const vertexDrag = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (e.buttons === 1) moveVertex(i, clientToMm(e.clientX, e.clientY)); },
    onPointerUp: (e: React.PointerEvent) => (e.currentTarget as Element).releasePointerCapture(e.pointerId),
  });

  const r = Math.max(b.w, b.h) * 0.02 + 30;
  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className={"h-full w-full text-ink-soft " + (closed ? "cursor-default" : "cursor-crosshair")}
      role="img"
      aria-label="עורך צורת הפריט — לחיצה להוספת נקודה, גרירה לשינוי"
      onClick={onCanvasClick}
      onPointerMove={(e) => !closed && setCursor(clientToMm(e.clientX, e.clientY))}
    >
      {closed && <polygon points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      {!closed && outline.length > 1 && (
        <polyline points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      {!closed && outline.length > 0 && cursor && (
        <line x1={outline[outline.length - 1].x} y1={outline[outline.length - 1].y} x2={cursor.x} y2={cursor.y}
          className="text-muted" stroke="currentColor" strokeWidth={1.5} strokeDasharray={6} vectorEffect="non-scaling-stroke" />
      )}
      {outline.map((v, i) => (
        <circle
          key={i}
          {...(closed ? vertexDrag(i) : {})}
          cx={v.x} cy={v.y} r={r}
          className={!closed && i === 0 && outline.length >= 2 ? "text-accent" : "text-ink-soft"}
          fill="currentColor"
          style={{ cursor: closed ? "move" : "pointer", touchAction: "none" }}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (These components are not rendered anywhere yet — Task 6 wires them.)

---

## Task 5: Icon picker

**Files:**
- Create: `app/(app)/catalog/icon-picker.tsx`

**Interfaces:**
- Consumes: `MAP_ICONS` (Task 3).
- Produces: `<IconPicker value={string | undefined} onPick={(name: string) => void} />`

- [ ] **Step 1: Searchable grid**

Create `app/(app)/catalog/icon-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { MAP_ICONS } from "@/lib/catalog/map-icons";
import { controlClassName } from "@/components/control";

export function IconPicker({ value, onPick }: { value: string | undefined; onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const items = term ? MAP_ICONS.filter((i) => i.label.includes(term) || i.name.includes(term.toLowerCase())) : MAP_ICONS;

  return (
    <div className="rounded-md border border-border bg-surface p-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש אייקון…"
        className={controlClassName + " mb-2 w-full px-2.5 placeholder:text-muted"}
      />
      <div className="grid grid-cols-6 gap-1">
        {items.map(({ name, label, Icon }) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            title={label}
            aria-label={label}
            aria-pressed={value === name}
            className={
              "flex aspect-square items-center justify-center rounded transition-colors " +
              (value === name ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")
            }
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </button>
        ))}
        {items.length === 0 && <p className="col-span-6 px-1 py-2 text-xs text-muted">לא נמצאו אייקונים.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

---

## Task 6: Drawer appearance section (wire it together)

**Files:**
- Modify: `app/(app)/catalog/product-drawer.tsx`

**Interfaces:**
- Consumes: `AppearancePreview` (Task 4), `PolygonEditor` (Task 4), `IconPicker` (Task 5), `resolveFootprint` (Task 1), `MapAppearance` (Task 1).

- [ ] **Step 1: Imports**

In `product-drawer.tsx` add:

```ts
import type { Product, Variant, MapAppearance } from "@/lib/catalog/types";
import { resolveFootprint } from "@/lib/studio/footprint";
import { AppearancePreview } from "./appearance-preview";
import { PolygonEditor } from "./polygon-editor";
import { IconPicker } from "./icon-picker";
```

(Merge the `MapAppearance` type into the existing `Product, Variant` import line.)

- [ ] **Step 2: Appearance helpers + local state**

Inside `ProductDrawer`, after the existing `toggleTag`/`setVariant` helpers, add:

```ts
  const [pickingIcon, setPickingIcon] = useState(false);

  // Current shape/content, falling back to what the resolver would derive when appearance is unset.
  const currentShape = draft.appearance?.shape ?? resolveFootprint(draft).kind;
  const currentContent = draft.appearance?.content ?? "name";

  // Patch appearance, always keeping the required fields present.
  const setAppearance = (patch: Partial<MapAppearance>) =>
    setDraft((d) => ({
      ...d,
      appearance: { shape: "rect", content: "name", ...d.appearance, ...patch },
    }));
```

- [ ] **Step 3: Add custom-shape validation to `save`**

In the `save` function, after the existing name/height guard, add an outline guard:

```ts
    if (draft.appearance?.shape === "custom" && (draft.appearance.outline?.length ?? 0) < 3) {
      setSubmitted(true);
      return;
    }
```

(Place it right after `if (draft.name.trim() === "" || !draft.dimensions.heightMm) return;`.)

- [ ] **Step 4: Render the appearance section**

In the scrollable body, after the image/price grid `</div>` and before the style-tags block, insert:

```tsx
          <div>
            <span className={fieldLabel}>מראה על התוכנית</span>
            <div className="flex gap-3">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-md border border-border bg-bg p-2">
                {currentShape === "custom" ? (
                  <PolygonEditor
                    outline={draft.appearance?.outline ?? []}
                    onChange={(outline) => setAppearance({ shape: "custom", outline })}
                  />
                ) : (
                  <AppearancePreview product={draft} className="h-full w-full" />
                )}
              </div>

              <div className="flex-1 space-y-2">
                <div>
                  <span className="mb-1 block text-xs text-muted">צורה</span>
                  <div className="flex flex-wrap gap-1 rounded-md border border-border p-0.5">
                    {([["rect", "מלבן"], ["circle", "עיגול"], ["ellipse", "אליפסה"], ["custom", "מותאם"]] as const).map(([s, label]) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setAppearance(s === "custom" ? { shape: "custom", outline: draft.appearance?.outline ?? [] } : { shape: s })}
                        className={"rounded px-2 py-1 text-xs transition-colors " + (currentShape === s ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1 block text-xs text-muted">תוכן</span>
                  <div className="flex flex-wrap gap-1 rounded-md border border-border p-0.5">
                    {([["icon", "אייקון"], ["name", "שם"], ["none", "ריק"]] as const).map(([c, label]) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setAppearance({ content: c }); setPickingIcon(c === "icon"); }}
                        className={"rounded px-2 py-1 text-xs transition-colors " + (currentContent === c ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {currentShape === "custom" && (draft.appearance?.outline?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setAppearance({ shape: "custom", outline: [] })}
                className="mt-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                רשם מחדש
              </button>
            )}
            {submitted && draft.appearance?.shape === "custom" && (draft.appearance.outline?.length ?? 0) < 3 && (
              <p className="mt-1 text-xs text-warn">יש לסמן צורה סגורה (לפחות 3 נקודות).</p>
            )}

            {currentContent === "icon" && pickingIcon && (
              <div className="mt-2">
                <IconPicker
                  value={draft.appearance?.icon}
                  onPick={(icon) => { setAppearance({ content: "icon", icon }); setPickingIcon(false); }}
                />
              </div>
            )}
          </div>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Verify the full flow in the running app**

Run: `npm run dev`, go to the catalog, open a product (or create one). In "מראה על התוכנית":
- Toggle shape rect→circle→ellipse: the preview updates and stays sized to the item's dimensions.
- Toggle content icon: the picker opens; search "בר", pick the wine glyph — it appears in the preview.
- Toggle shape "מותאם": the preview becomes the editor. Click 4–5 points, then continue — the polygon fills. Drag a vertex — it moves. Click "רשם מחדש" — it clears.
- Save with an unfinished custom outline (1–2 points) → the warn message blocks save.
- Save a valid product, then in the studio drag it onto the map → it renders exactly as the drawer preview showed.

- [ ] **Step 7: Full verification gate**

Run: `npm run typecheck` (expect clean), `npm run check:actions` (expect `actions self-check passed`), and `npm run check:footprint` (expect `footprint self-check passed`).

---

## Verification (whole feature)

- `npm run typecheck`, `npm run check:actions`, `npm run check:footprint` all pass.
- Existing products with no `appearance` render on the map as true-scale shapes with their name inside (backward compatible — no data migration).
- A product set to circle+icon renders a circle with a centered glyph; a custom product renders its polygon at true scale; a "none" product renders an empty footprint.
- The drawer preview matches what lands on the map (same resolver).
- `/present` and meeting mode are unchanged and still show no internal data.

## Out of scope (v1)

- Curved custom edges (would add an `edgeCurves` field + bezier handles to `PolygonEditor` later).
- Per-variant appearance (appearance is product-level).
- Icon stroke-width / color customization.
