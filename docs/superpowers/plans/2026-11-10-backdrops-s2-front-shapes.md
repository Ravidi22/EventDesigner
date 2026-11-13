# Backdrops S2 — Front Shapes (and the קירות רקע category) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shape may be drawn on the FRONT plane (a panel, an arch, a wave, a petal) with a thickness, a bend and a turn in its face; it is a band on the plan and itself in the room; and a studio can create a קיר רקע row of its own and draw it from the front.

**Architecture:** A front shape is a `ShapePart` with `plane: "front"`: its existing profile fields (`shape`, `widthMm`, `depthMm`, `outline`, `hollow`…) describe the FACE (x across, the second axis UP, stored as the elevation canvas draws it: y = −up), and the footprint engine turns it into its PLAN BAND (across extent × thickness, bent) at the one seam every plan reader already goes through (`shapeFootprint`/`shapePieces`/`hollowOuter`), so the sketch, print, clearance, hit-testing and the element model see the band without knowing what a front shape is. The element model gains a `panel` op that the room builds as the face profile pushed back by its thickness (bent through pure math in `lib/element/front.ts`). The editor's חזית view (S1) becomes a place to draw them.

**Tech Stack:** Next.js 16 / React 19 / TypeScript; pure modules self-checked with `tsx`; three.js only under `components/scene`.

**Spec:** docs/superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-design.md (§1, §2, §4, §6, §9 S2; DECIDEs 1, 2, 3, 6). **Ruling (this plan):** the קירות רקע category (spec §6, planned for S3) is pulled into S2 so Ravid can create a backdrop row at the end of this stage — he asked "can I create a קיר רקע already?" on 2026-11-10. Only the category, its new-row seed and its preview move; the six faces, the swag, the frame preset, the stage edge wearing a row and the seed rows stay in S3.

## Global Constraints

- Rows WITHOUT a front shape are unchanged to the path string: `npm run check:element-parity`, `check:footprint`, `check:shape-list`, `check:element`, `check:scene-element`, `check:elevation-view` stay green.
- No migration: everything is jsonb under `products.appearance` / `products.dimensions`.
- `FRONT_THICK_MM = 20` (a panel with no thickness of its own); `|bendDeg| ≤ FRONT_BEND_MAX_DEG = 300`; + bend = concave toward the FRONT (+y, the side the item faces); the width stays the arc length of the band's mid-line.
- A front shape's `(x, y)` is the centre of its plan band's box, like every other shape's; `zMm` its bottom; `rotation` its turn on the plan; `faceTurnDeg` its turn within its face. Its `heightMm` is not read (its rise is its face's).
- A FRONT BASE (the first shape) is stored as: `appearance.plane = "front"`, `appearance.shape` + `outline`… the face profile, `dimensions.widthMm` (or `diameterMm`) its across size, `dimensions.heightMm` its face height (it stands on the floor, so the item's height IS its face height), `dimensions.depthMm` its THICKNESS, `appearance.bendDeg` / `faceTurnDeg`.
- `repeat` and `pin` on a front shape are not offered in S2 and are ignored by the engine (S3 brings them, with the petals).
- Pure modules import no React, no DB, no three; three only in `components/scene` (`npm run check:scene-boundary`); no price reaches the scene (`npm run check:costs`).
- Hebrew UI, RTL: logical properties only (`ms-`/`me-`, `start`/`end`). Popups use the shared parts (CloseButton, Popover, FoldRow); no new one-off chrome.
- `npm run typecheck` green at every commit.

## Review Focus

1. **A front first shape saved and reopened** (`lookOf` → `shapesOf`) must come back the same — depth ↔ thickness and height ↔ face height swap on the way through, and a slip corrupts every backdrop row. → Task 2's round-trip test.
2. **A front first shape TURNED on the plan** cannot be stored turned (the base has no turn): the whole list is turned back about it, every other shape keeping its place relative to it. → Task 2's turned test.
3. **The room and the plan must agree on a front row's footprint** (`elementOf(product, sizedFootprint(product))` non-null) — otherwise the room silently falls back to a plain extrude of the band. → Task 4's agreement test.
4. **Extreme bends** (300°, a 10 cm-wide panel, a thickness larger than the radius) give a closed, finite band and finite 3D vertices, never NaN. → Task 1 and Task 4 tests.
5. **A drag or a drawing in חזית is ONE undo step**, and the item's height follows a front base's face height both ways (the bar's height field, the face's top edge). → Task 6 tests on `rectEdit` + the headless check in Task 10.

---

## File map

| File | Change |
| --- | --- |
| `lib/catalog/types.ts` | `ShapePart` / `MapAppearance` front fields; `FRONT_THICK_MM`, `FRONT_BEND_MAX_DEG` |
| `lib/studio/footprint.ts` | `ShapeDims` front fields; `frontFace`, `frontBand`; the band at `solidFootprint`/`shapePieces`/`hollowOuter`; `rowShapeDims`; `BuiltOutline.face` + custom `Footprint.face` carried through |
| `lib/element/front.ts` (new) | `isFront`, `hasFront`, `bendKeepingMiddle`, `panelPoint`, `bendCuts`, `clipSlab`, `waveOutline`, `petalOutline`; self-check `check:front` |
| `lib/catalog/shape-list.ts` | front base in `shapesOf`/`lookOf`; a turned front first shape |
| `lib/element/types.ts`, `adapter.ts`, `geometry.ts` | `panel` op; `asShapePart` keeps the plane; `hasOwnBody` |
| `lib/scene/types.ts`, `element-body.ts`, `components/scene/scene-geometry.ts` | `Part` `panel`; built flat or bent |
| `lib/scene/front-check.ts` (new) | `check:scene-front` |
| `lib/element/elevation.ts` | front boxes (`front` on `ElevationBox`), `rectEdit` for a front shape, `placedFront`, `drawnFront` |
| `app/(app)/catalog/elevation-canvas.tsx` | a front shape drawn as itself in חזית, its face turn, the outline editor while drawing there |
| `app/(app)/catalog/appearance-modal.tsx` | rail live in חזית (tiles, ציור חופשי, גל, עלה); the plan band; the "חזית" group; item height ↔ front base |
| `components/footprint-shape.tsx` | the face mark (`BuiltOutline.face`) |
| `lib/catalog/categories.ts`, `app/(app)/catalog/product-drawer.tsx` | `grp-scenery` · `backdrops`; `CategoryDef.front`; seed; עובי |
| `app/(app)/catalog/front-preview.tsx` (new), `appearance-preview.tsx` | the card / drawer picture of a front row |
| `lib/catalog/symbols.ts` | arches, gates, chuppahs: a front drawing replaces the picture |
| `CLAUDE.md`, the spec's §13 | the stage written down |

---

### Task 1: The front shape and its plan band (the engine)

**Files:**
- Modify: `lib/catalog/types.ts` (ShapePart, MapAppearance), `lib/studio/footprint.ts`
- Create: `lib/element/front.ts` (+ `"check:front": "tsx lib/element/front.ts"` in package.json)

**Interfaces:**
- Produces (types.ts): `ShapePart.plane?: "front"`, `thicknessMm?: number`, `bendDeg?: number`, `faceTurnDeg?: number`; `MapAppearance.plane?: "front"`, `bendDeg?: number`, `faceTurnDeg?: number`; `export const FRONT_THICK_MM = 20; export const FRONT_BEND_MAX_DEG = 300;`
- Produces (footprint.ts): `ShapeDims` gains `plane?: "front"; thicknessMm?: number; bendDeg?: number; faceTurnDeg?: number`. `BuiltOutline.face?: number[]` (edge indices on the item's FRONT side) and the `custom` Footprint variant gains `face?: number[]`; `placeInPart`, `piecesFootprint`, `footprintOutlines` (custom), `scaleFootprint`, `recentred` carry it.
  - `export function frontFace(shape: MapShape, d: ShapeDims): { pieces: BuiltOutline[]; w: number; h: number }` — the face profile in the FACE frame (x across, y = −up), solid outer + a hollow's pieces (a hollow rect is a frame), turned by `d.faceTurnDeg` and centred on the turned box; `w`/`h` that box.
  - `export function frontBand(widthMm: number, thicknessMm: number, bendDeg: number): BuiltOutline` — the plan band centred on its own box, `face` set.
  - `export function rowShapeDims(product: Product): { shape: MapShape; dims: ShapeDims }` — the base as the engine reads it (a front base: `depthMm` ← `heightMm`, `thicknessMm` ← `depthMm`).
  - Behaviour: `shapeFootprint`, `shapePieces`, `hollowOuter` of dims with `plane === "front"` are the band of width `frontFace(…).w` (a front shape's `hollow` is its FACE's, never cut into the band); `resolveFootprint` and `sizedFootprint` read the base through `rowShapeDims`; `sizedShapes` scales a lone front base (it is never re-derived at the plan size); `repeatCopies` lays a front part as itself (no copies).
- Produces (front.ts): `export const isFront = (s: { plane?: string } | undefined): boolean`; `export function hasFront(product: Product): boolean` (base or any part).

- [ ] **Step 1: Write the failing tests** in `lib/element/front.ts`'s `isMain` block:

```ts
// A flat panel 300 wide, 2 thick, standing at (100, -400): its band is 3000 × 20 centred there.
const panel: ShapePart = { id: "p", plane: "front", shape: "rect", widthMm: 3000, depthMm: 2400, thicknessMm: 20, x: 100, y: -400, rotation: 0 };
const pb = sampledBounds(placedPartOutlines(panel));
assert(near(pb.w, 3000) && near(pb.h, 20) && near(pb.cx, 100) && near(pb.cy, -400), "a flat panel's plan band is width × thickness at its place");
assert(JSON.stringify(placedPartOutline(panel).face) === "[2]", "…its face is the +y side");
// No thickness → FRONT_THICK_MM.
assert(near(sampledBounds(placedPartOutlines({ ...panel, thicknessMm: undefined })).h, FRONT_THICK_MM), "a panel with no thickness is 2 cm");
// The face is not the plan: a half-circle arch 2400 across (diameter) is a 2400 band.
const arch: ShapePart = { id: "a", plane: "front", shape: "half-circle", diameterMm: 2400, x: 0, y: 0, rotation: 0 };
assert(near(sampledBounds(placedPartOutlines(arch)).w, 2400), "an arch's band is its face's width");
const ff = frontFace("half-circle", { diameterMm: 2400 });
assert(near(ff.w, 2400) && near(ff.h, 1200), "the arch's face is 2400 × 1200");
assert(Math.min(...ff.pieces[0].outline.map((v) => v.y)) < -500, "…its apex is UP (negative y in the face frame)");
// Turned in its face 90°: the band is the face's height wide.
assert(near(frontFace("rect", { widthMm: 3000, depthMm: 1000, faceTurnDeg: 90 }).w, 1000), "a face turned 90° is its height across");
// A hollow face (a frame) is still a solid band on the plan.
assert(placedPartOutlines({ ...panel, hollow: { bandMm: 100 } }).length === 1, "a frame is one band on the plan");
// Bent 180° concave toward the front: the mid-line stays 3000 long; the ends come forward.
const bent = placedPartOutline({ ...panel, x: 0, y: 0, bendDeg: 180 });
const bb = sampledBounds([bent]);
assert(near(bb.w, (2 * 3000) / Math.PI + 20, 2) && near(bb.h, 3000 / Math.PI + 10, 2), `a half-cylinder's box is its diameter by its radius (${bb.w}×${bb.h})`);
assert(bent.face!.length >= 2 && bent.face!.every((i) => i < bent.outline.length), "…its face is the inner arc's segments");
// Extremes stay finite and closed.
for (const [w, t, b] of [[100, 20, 300], [3000, 5000, 300], [3000, 20, -300], [10, 1, 1]] as const) {
  const o = frontBand(w, t, b);
  assert(o.outline.length >= 4 && o.outline.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)), `band ${w}/${t}/${b}° is finite`);
}
// A row whose BASE is front: resolveFootprint is its band; depth is the thickness.
const row = { id: "r", name: "קיר", category: "other", layer: "floor", dimensions: { widthMm: 4000, depthMm: 30, heightMm: 2600 }, categoryFields: {}, styleTags: [], variants: [], appearance: { shape: "rect", content: "none", plane: "front" } } as Product;
const rb = footprintBounds(resolveFootprint(row));
assert(near(rb.w, 4000) && near(rb.h, 30), "a front base row stands on a 4000 × 30 band");
assert(rowShapeDims(row).dims.depthMm === 2600 && rowShapeDims(row).dims.thicknessMm === 30, "…read as a 2600-high face, 30 thick");
// A plain row is read exactly as before.
const plainRow = { ...row, appearance: { shape: "rect", content: "none" } } as Product;
assert(JSON.stringify(resolveFootprint(plainRow)) === JSON.stringify({ kind: "rect", widthMm: 4000, depthMm: 30 }), "a plan row is untouched");
assert(hasFront(row) && !hasFront(plainRow), "hasFront");
```

- [ ] **Step 2: Run** `npm run check:front` — Expected: FAIL (module/fields missing).
- [ ] **Step 3: Implement** the types and the footprint functions above. The bent band: mid-line radius `R = W / θ` (θ = |bend| in radians), the inner and outer arcs at `R ∓ t/2` (inner clamped at ≥ 1 mm) cut into ≤ 90° bezier segments (`k = 4/3 · tan(α/4)`), straight end caps; centre of curvature on the +y side for + bend (−y for −); the face = the arc on the +y side (+ bend: the inner one; − bend: the outer one). Flat (|bend| < 0.5°): a rectangle outline, face = `[2]`.
- [ ] **Step 4: Run** `npm run check:front && npm run check:footprint && npm run check:element-parity && npm run check:shape-list && npm run typecheck` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(element): a front shape and its plan band`.

### Task 2: A front first shape, saved and reopened

**Files:** Modify `lib/catalog/shape-list.ts` (tests in its `isMain`).

**Interfaces:**
- Consumes: `rowShapeDims`, `isFront` (Task 1).
- Produces: `shapesOf(row)` gives a front base as `{ plane: "front", shape, widthMm|diameterMm, depthMm: dimensions.heightMm, thicknessMm: dimensions.depthMm, bendDeg, faceTurnDeg, outline…, x: 0, y: 0, rotation: 0 }`; `lookOf(look, shapes)` writes a front first shape back as that (dimensions `{ widthMm|diameterMm, depthMm: thickness ?? FRONT_THICK_MM, heightMm: face height }`, appearance `plane`, `bendDeg`, `faceTurnDeg`, and the face `outline` for a custom one); a first shape that is NOT front clears `plane`/`bendDeg`/`faceTurnDeg`. `export function turnedAbout(list: readonly ShapePart[], about: { x: number; y: number }, deg: number): ShapePart[]` — every shape's place turned about a point and its `rotation` added.
- `upright` of a front shape keeps its face as it is: a plan turn is NOT baked (the base's face is not a plan outline); instead `lookOf` turns the WHOLE list back by the first shape's plan turn (`turnedAbout`) before storing.

- [ ] **Step 1: Write the failing tests**:

```ts
const wall = row({ shape: "rect", plane: "front", bendDeg: 40 }, { widthMm: 4000, depthMm: 30, heightMm: 2600 });
const ws = shapesOf(wall);
assert(ws[0].plane === "front" && ws[0].widthMm === 4000 && ws[0].depthMm === 2600 && ws[0].thicknessMm === 30 && ws[0].bendDeg === 40, "a front base opens as its face, 30 thick, bent 40°");
const wBack = { ...wall, ...lookOf(wall, ws) };
assert(wBack.dimensions.widthMm === 4000 && wBack.dimensions.depthMm === 30 && wBack.dimensions.heightMm === 2600 && wBack.appearance?.plane === "front" && wBack.appearance?.bendDeg === 40, "…and saves back the same");
// A petal drawn by hand as the base: its face outline is kept; height is its box's.
const petal = row({ shape: "custom", plane: "front", outline: [{ x: 0, y: 0 }, { x: 800, y: -2000 }, { x: 1600, y: 0 }] }, { widthMm: 1600, depthMm: 20, heightMm: 2000 });
const pBack = { ...petal, ...lookOf(petal, shapesOf(petal)) };
assert(pBack.dimensions.heightMm === 2000 && pBack.dimensions.depthMm === 20 && pBack.appearance?.outline?.length === 3, "a hand-drawn front base round-trips");
// Plan shapes behind a front base keep their places (picture 5's layers: two more panels behind).
const layered = [ws[0], { ...ws[0], id: "b", plane: "front" as const, y: -300 }, { ...ws[0], id: "c", plane: "front" as const, y: -600 }];
const lb = shapesOf({ ...wall, ...lookOf(wall, layered) });
assert(lb.length === 3 && lb[1].y === -300 && lb[2].y === -600 && lb.every((s) => s.plane === "front"), "three layers come back at their depths");
// The first shape turned 30° on the plan: the whole drawing turns back, nothing moves relative to it.
const turned = turnedAbout(layered, { x: 0, y: 0 }, 30);
const tb = shapesOf({ ...wall, ...lookOf(wall, turned) });
assert(tb[0].rotation === 0 && Math.abs(tb[2].y - -600) < 2 && Math.abs(tb[2].x) < 2 && tb[2].rotation === 0, "a turned front base is stored upright with the drawing turned back about it");
// A plan first shape clears the front fields.
const asPlan = lookOf(wall, [{ ...ws[0], plane: undefined, depthMm: 600 }]);
assert(asPlan.appearance.plane === undefined && asPlan.appearance.bendDeg === undefined && asPlan.dimensions.depthMm === 600, "a plan first shape leaves no front fields behind");
```

- [ ] **Step 2: Run** `npm run check:shape-list` — Expected: FAIL.
- [ ] **Step 3: Implement** in `shapesOf`/`lookOf`/`upright` (and `baseAt` returns (0, 0) for a front base).
- [ ] **Step 4: Run** `npm run check:shape-list && npm run check:front && npm run typecheck` — Expected: pass.
- [ ] **Step 5: Commit** `feat(catalog): a front first shape is the row's base`.

### Task 3: The element model's `panel`

**Files:** Modify `lib/element/types.ts`, `lib/element/adapter.ts`, `lib/element/geometry.ts` (tests in `geometry.ts`'s `isMain`).

**Interfaces:**
- Produces: `PartOp` gains `{ kind: "panel"; thicknessMm: number; bendDeg: number; faceTurnDeg: number }`. `partOf`/`definitionOf` read a front shape as op `panel` (thickness `?? FRONT_THICK_MM`, bend/face turn `?? 0`), `own: true`, `zMm` its z (a base 0), `heightMm` its face's `h` (`frontFace`); the base reads through `rowShapeDims`. `asShapePart` of a `panel` part puts back `plane: "front"`, `thicknessMm`, `bendDeg`, `faceTurnDeg`, so `composeShapes` plans its band. `hasOwnBody` is true for a row with any front shape.

- [ ] **Step 1: Write the failing tests**:

```ts
// Picture 5: three wave layers at three depths, 2.4 / 2.0 / 1.6 m tall.
const layers = def([
  part({ id: "l1", profile: { shape: "rect", widthMm: 4000, depthMm: 2400 }, y: -600, op: { kind: "panel", thicknessMm: 30, bendDeg: 0, faceTurnDeg: 0 }, heightMm: 2400, own: true }),
  part({ id: "l2", profile: { shape: "rect", widthMm: 3600, depthMm: 2000 }, y: -300, op: { kind: "panel", thicknessMm: 30, bendDeg: 0, faceTurnDeg: 0 }, heightMm: 2000, own: true }),
  part({ id: "l3", profile: { shape: "rect", widthMm: 3200, depthMm: 1600 }, y: 0, op: { kind: "panel", thicknessMm: 30, bendDeg: 0, faceTurnDeg: 0 }, heightMm: 1600, own: true }),
]);
const lg = elementGeometry(layers);
assert(lg.footprint.kind === "multi" && lg.footprint.parts.length === 3, "three panels are three bands");
assert(near(lg.box.w, 4000) && near(lg.box.h, 630), `…the lot 4000 × 630 (${lg.box.w}×${lg.box.h})`);
assert(lg.topMm === 2400, "…the tallest is the top");
// A row read off the catalog: a front base row's definition is a panel at z 0, its face height high.
const wallRow = { id: "w", name: "קיר", category: "other", layer: "floor", dimensions: { widthMm: 4000, depthMm: 30, heightMm: 2600 }, categoryFields: {}, styleTags: [], variants: [], appearance: { shape: "rect", content: "none", plane: "front" } } as Product;
const wd = definitionOf(wallRow);
assert(wd.parts[0].op.kind === "panel" && wd.parts[0].heightMm === 2600 && wd.parts[0].profile.depthMm === 2600, "a front base is a panel 2600 high");
assert(hasOwnBody(wallRow), "…and the element model builds it");
assert(sameFootprint(elementGeometry(wd).footprint, resolveFootprint(wallRow)), "the element's footprint is the row's");
```

- [ ] **Step 2: Run** `npm run check:element` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check:element && npm run check:element-parity && npm run check:scene-element && npm run typecheck` — Expected: pass.
- [ ] **Step 5: Commit** `feat(element): the panel op — a front shape in the element model`.

### Task 4: The panel in the room

**Files:**
- Modify: `lib/scene/types.ts` (Part), `lib/scene/element-body.ts` (`elementParts`), `components/scene/scene-geometry.ts` (`partGeometry`, the hash), `lib/element/front.ts` (pure bend math + tests)
- Create: `lib/scene/front-check.ts` (+ `"check:scene-front": "tsx lib/scene/front-check.ts"`)

**Interfaces:**
- Produces (front.ts): `export function panelPoint(u: number, w: number, widthMm: number, bendDeg: number): { x: number; y: number }` — a point of the panel, `u` across its mid-line (−W/2…W/2) and `w` through it (−t/2 back … +t/2 face), in plan mm relative to the band's BOX centre (matching `frontBand`); `export function bendCuts(widthMm: number, bendDeg: number): number[]` — the `u` positions the face is cut at to bend it (both ends included; a cut every ≤ 10° of sweep; `[−W/2, W/2]` when flat); `export function clipSlab(polygon: readonly Point[], a: number, b: number): Point[]` — Sutherland–Hodgman against `a ≤ x ≤ b`.
- Produces (types.ts): `| { shape: "panel"; face: BuiltOutline[]; thicknessMm: number; bendDeg: number; widthMm: number; at: Vec3; rotDeg?: number; material?: MaterialRef }` — `face` in the FACE frame (x across centred, y = −up, the face's bottom at y = h/2), `at` the band's box centre with z = the part's bottom.
- `elementParts`: a part with op `panel` → one `panel` Part per piece at the piece's box centre (`sampledBounds`), `rotDeg` = the part's `rotation`, `face` = `frontFace(...).pieces`.
- `scene-geometry`: `panelGeometry(part)` — flat: each face piece as `shapeOf` → `ExtrudeGeometry` (`depth` = thickness), stood up (face toward plan +y) and centred on its thickness; bent: every face piece flattened, clipped into slabs at `bendCuts`, each slab extruded flat and every vertex moved through `panelPoint`. The hash covers `face`, `thicknessMm`, `bendDeg`, `rotDeg`.

- [ ] **Step 1: Write the failing tests** (front.ts for the math; front-check.ts for the build):

```ts
// front.ts
const W = 3000;
assert(near(panelPoint(0, 0, W, 0).x, 0) && near(panelPoint(W / 2, 10, W, 0).y, 10), "flat: u across, w toward the face");
const mid = panelPoint(0, 0, W, 180);
const end = panelPoint(W / 2, 0, W, 180);
assert(end.y > mid.y + 900, "bent + : the ends come toward the front");
const band = sampledBounds([frontBand(W, 20, 180)]);
assert(near(Math.abs(end.x) + 10, band.w / 2, 2), "…the bend reaches the band's sides");
assert(bendCuts(W, 0).length === 2 && bendCuts(W, 180).length >= 19, "a cut every 10° of sweep");
const sq = [{ x: -10, y: -5 }, { x: 10, y: -5 }, { x: 10, y: 5 }, { x: -10, y: 5 }];
const half = clipSlab(sq, 0, 20);
assert(near(sampledBounds([{ outline: half }]).w, 10), "a slab clip keeps x ∈ [a, b]");
assert([300, -300, 1].every((b) => Number.isFinite(panelPoint(W / 2, -10, 100, b).x)), "extreme bends are finite");

// front-check.ts
const wallRow = /* the Task 3 row */;
const fp = sizedFootprint(wallRow);
assert(elementOf(wallRow, fp) !== null, "the room and the plan agree on a front row's footprint");
const built = elementBody(wallRow, fp, { colour: "#ffffff", kind: "matte" })!;
assert(built.parts.length === 1 && built.parts[0].shape === "panel" && built.parts[0].at.z === 0, "a backdrop row is one panel on the floor");
// Three layers: three panels at their depths, bottoms at their z.
// A bent base: one panel, its bend carried.
// A plan row with a front panel added (a bar with a front panel): ownBodyParts hands the panel to the model and the counter to the recipe.
// No price: JSON.stringify(built) contains no "unitPrice"/"costPrice".
```

- [ ] **Step 2: Run** `npm run check:front && npm run check:scene-front` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check:front && npm run check:scene-front && npm run check:scene-element && npm run check:scene && npm run check:scene-boundary && npm run check:costs && npm run typecheck` — Expected: pass.
- [ ] **Step 5: Commit** `feat(scene): a front shape stands in the room as itself`.

### Task 5: Front shapes in the side views (the pure half)

**Files:** Modify `lib/element/elevation.ts` (tests in its `isMain`); `lib/element/front.ts` (presets).

**Interfaces:**
- Produces: `ElevationBox.front?: { pieces: BuiltOutline[]; asItself: boolean }` — the face pieces in the canvas world about the box's centre; `asItself` = front view, plan turn ≈ 0 (within 1°) and no bend (then it is drawn and edited as its profile). A front box's `z` is its `zMm` (the base 0), `h` its face's `h`, `a0`/`a1` its band's (both views); `across` = `"width"` (or `"diameter"`) when `asItself` and not face-turned, else null.
- `rectEdit` of a front shape writes its FACE: across → `widthMm` (`diameterMm` for a round one, a hand-drawn one rescaled through `rescaleOutline`), its up size → `depthMm` (round: `diameterMm`), its bottom → `zMm`; the base's top edge → its face height AND the item's height (`itemHeightMm`).
- `export function placedFront(shape: MapShape, at: { x: number; y: number }, view: ElevationView, planY: number): ShapePart` — a tile clicked on the חזית canvas: a front shape of the tile's kind, face 1200 × 1200 (a half-circle ⌀ 2400, a line 2000 × 20), its centre at the click, never under the floor, at plan depth `planY`, `thicknessMm` FRONT_THICK_MM.
- `export function drawnFront(outline: Point[], edgeCurves: (EdgeCurve | null)[] | undefined, planY: number, open?: boolean): ShapePart | null` — an outline drawn on the חזית canvas as a front custom shape (x the box's across centre, `zMm` its bottom clamped at 0, the outline kept as drawn); null under three points or a box under 10 mm.
- front.ts: `export function waveOutline(widthMm: number, heightMm: number, crests = 3): { outline: Point[]; edgeCurves: (EdgeCurve | null)[] }` (a flat foot, a wavy top of `crests` hills, in the face frame); `export function petalOutline(widthMm: number, heightMm: number): { outline; edgeCurves }` (a pointed top, rounded shoulders, a flat foot).

- [ ] **Step 1: Write the failing tests**:

```ts
const panel: ShapePart = { id: "f", plane: "front", shape: "rect", widthMm: 3000, depthMm: 2000, thicknessMm: 30, x: 0, y: -300, rotation: 0, zMm: 400 };
const [fb] = elevationBoxes([panel], 1100, "front");
assert(fb.z === 400 && fb.h === 2000 && fb.a0 === -1500 && fb.a1 === 1500 && fb.front?.asItself === true && fb.across === "width", "a front panel in front: its face, 40 cm up");
const [sb] = elevationBoxes([panel], 1100, "side");
assert(near(sb.a1 - sb.a0, 30) && sb.front?.asItself === false && sb.across === null, "…from the side, its thickness");
const taller = rectEdit(panel, fb, { ...boxRect(fb), y: boxRect(fb).y - 250, depthMm: 2500 }, "front");
assert(taller.patch.depthMm === 2500 && taller.patch.heightMm === undefined && taller.patch.zMm === undefined, "its top pulled up makes its FACE taller");
const base = { ...panel, zMm: undefined };
const [bb] = elevationBoxes([base], 2000, "front");
const tb = rectEdit(base, bb, { ...boxRect(bb), y: boxRect(bb).y - 300, depthMm: 2600 }, "front");
assert(tb.itemHeightMm === 2600 && tb.patch.depthMm === 2600, "a front base's top edge is its face height and the item's height");
assert(elevationBoxes([{ ...panel, rotation: 30 }], 1100, "front")[0].front?.asItself === false, "turned on the plan, it is a box in front");
const tile = placedFront("half-circle", { x: 500, y: -100 }, "front", -200);
assert(tile.plane === "front" && tile.diameterMm === 2400 && tile.y === -200 && (tile.zMm ?? 0) === 0 && tile.x === 500, "a half-circle clicked low stands on the floor");
const drawn = drawnFront([{ x: 0, y: -100 }, { x: 1000, y: -100 }, { x: 500, y: -1800 }], undefined, 0)!;
assert(drawn.shape === "custom" && drawn.zMm === 100 && drawn.depthMm === 1700 && drawn.x === 500, "a free drawing in front is a front custom shape at its height");
const wave = waveOutline(3000, 1200, 3);
assert(sampledBounds([wave]).w === 3000 && near(sampledBounds([wave]).h, 1200, 1), "a wave fills its box");
```

- [ ] **Step 2: Run** `npm run check:elevation-view && npm run check:front` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check:elevation-view && npm run check:front && npm run typecheck` — Expected: pass.
- [ ] **Step 5: Commit** `feat(element): front shapes on the side views`.

### Task 6: Drawing from the front in the shape editor

**Files:** Modify `app/(app)/catalog/elevation-canvas.tsx`, `app/(app)/catalog/appearance-modal.tsx`.

**Interfaces:** Consumes Tasks 1, 2, 5.
- **The rail in חזית** is live: a tile arms a FRONT shape (`placedFront`, at plan depth = the selected shape's `y`, else 0); "ציור חופשי" draws on the חזית canvas (the elevation canvas takes the outline editor's props exactly as the plan canvas does while `drawingPart.plane === "front"`, and finishing writes `drawnFront`); two more tiles under a "חזית" heading — **גל** (`waveOutline`) and **עלה** (`petalOutline`) — place a front custom shape. In צד the rail stays inert ("ציור בחזית").
- **The חזית canvas** draws a front box `asItself` as its profile: a feature of the face's shape (custom outline / derived shape at its face size), resized as Task 5's `rectEdit` reads it, with a rotate knob that writes `faceTurnDeg` (snapped to 15°, Alt frees); any other front box is a box (move and z only).
- **The plan canvas** draws a front shape as its band (`placedPartOutline` as a custom feature) with its face mark; it moves and turns there; its resize handles write `widthMm` (across, flat only) and `thicknessMm` (depth).
- **The side panel** of a front shape opens a group **"חזית"** (summary: "עובי 2 · כיפוף 40°"): עובי (ס״מ, one decimal), כיפוף (° — through `bendKeepingMiddle` so the panel's middle stays where it is), סיבוב בחזית (°), and **"החזרה לתוכנית"** (drops the front fields; the face becomes a plan shape of the same numbers). The groups that do not apply to a front shape are not offered (גוף, עיגון, חזרה, קשת, רצועה). A plan shape's "…" gains **"העמדה בחזית"** (the reverse). The quick bar of a front shape asks רוחב × גובה (the face) and עובי.
- **Item height ↔ front base:** the item's height field and the base's face height are one number — setting either writes both, in one undo step.
- front.ts: `export function bendKeepingMiddle(s: ShapePart, bendDeg: number): Partial<ShapePart>` — the new bend plus the `x`/`y` that keep the mid-line's middle point where it stood (the band's box centre moves by the change in sagitta/2, turned by `rotation`); test it there:

```ts
const m0 = panelPoint(0, 0, 3000, 0);
const s1 = { id: "s", plane: "front", shape: "rect", widthMm: 3000, depthMm: 2000, x: 0, y: 0, rotation: 0 } as ShapePart;
const p1 = { ...s1, ...bendKeepingMiddle(s1, 120) };
const m1 = panelPoint(0, 0, 3000, 120);
assert(near(p1.y + m1.y, s1.y + m0.y, 1), "bending keeps the panel's middle where it was");
```

- [ ] **Step 1:** Write the `bendKeepingMiddle` test; run `npm run check:front` — FAIL; implement; PASS.
- [ ] **Step 2:** Wire the editor as above.
- [ ] **Step 3: Run** `npm run typecheck && npm run check:front && npm run check:elevation-view && npm run check:shape-list` — Expected: pass.
- [ ] **Step 4: Commit** `feat(catalog): draw from the front — panels, arches, waves and petals in חזית`.

### Task 7: The face mark on every plan

**Files:** Modify `components/footprint-shape.tsx`.

**Interfaces:** Consumes `BuiltOutline.face` / custom `Footprint.face` (Task 1).
- `OutlinePath` takes `face?: number[]` and draws those edges once more, over the outline, at 2.5× its stroke width in the stroke's colour (`vector-effect` as the outline's); `FootprintShape` passes each piece's `face` (multi) or the footprint's (custom). Every surface that draws a footprint through it (the sketch, the print, the card, the drag image, the editor's plan) shows the face without a change of its own.

- [ ] **Step 1:** Add a pure helper `faceStrokeD(outline, edgeCurves, face): string` beside `outlineStrokeD` in `lib/studio/geometry.ts` with a test in its self-check (`npm run check:geometry` if it exists, else in `check:front`): the rectangle band's face `[2]` gives `"M…L…"` of exactly that edge.
- [ ] **Step 2:** Draw it in `OutlinePath`.
- [ ] **Step 3: Run** `npm run typecheck` and the helper's check — Expected: pass.
- [ ] **Step 4: Commit** `feat(plan): a front shape's face is marked on the plan`.

### Task 8: The קירות רקע category

**Files:** Modify `lib/catalog/categories.ts`, `app/(app)/catalog/product-drawer.tsx`, `app/(app)/catalog/appearance-preview.tsx`; create `app/(app)/catalog/front-preview.tsx`.

**Interfaces:**
- `CategoryGroupId` gains `"grp-scenery"`; `CATEGORY_GROUPS` gains `{ id: "grp-scenery", label: "תפאורה" }` (after `grp-flowers`); `DESIGN_PASS_GROUPS` gains it.
- `CategoryDef.front?: true` — a new row's first shape is a front panel: `blankProduct` seeds `appearance: { shape: "rect", content: "none", plane: "front" }`, `dimensions: { heightMm: c.defaultHeightMm ?? 0, depthMm: FRONT_THICK_MM }`.
- `{ id: "backdrops", label: "קירות רקע", group: "grp-scenery", defaultLayer: "floor", icon: GalleryVerticalEnd, dims: "box", fields: [], defaultHeightMm: 2400, front: true }` — creatable, priced per unit.
- The drawer: with a front base, the depth field is **"עובי (ס״מ)"** (one decimal, like a line's), the picker tile's seed reads "פאנל חזית · גובה 240"; width/height of a hand-drawn front base rescale its FACE (width × height), never width × thickness.
- `FrontPreview({ product, className })` — the row's front shapes drawn from the front (`frontFace` pieces at x across, bottom at z, back to front by plan y, in their colours; a plan shape behind them as its box from the front, faint) on the plan tile's dotted ground, scaled to fit. `AppearancePreview` and `PlanPreview` draw it for a row whose first shape is front.

- [ ] **Step 1:** A test in `lib/catalog/built-in.ts`'s self-check (`check:built-in`): `backdrops` is offered (`offeredCategories` contains it), not built-in, and `stage-backdrops` still is.
- [ ] **Step 2: Run** `npm run check:built-in` — FAIL; implement the category; PASS.
- [ ] **Step 3:** The drawer and the preview.
- [ ] **Step 4: Run** `npm run typecheck && npm run check:built-in && npm run check:standard` — Expected: pass.
- [ ] **Step 5: Commit** `feat(catalog): קירות רקע — a creatable backdrop drawn from the front`.

### Task 9: Arches, gates and chuppahs drawn from the front

**Files:** Modify `lib/catalog/symbols.ts` (+ a test where its self-check lives, else in `lib/scene/front-check.ts`).

**Interfaces:** `export const FRONT_REPLACES_PICTURE: ReadonlySet<SymbolKind> = new Set(["arch", "gate", "chuppah"])`; `symbolOf` returns null for a row with `hasFront(product)` whose kind is in it — the plan then draws the bands, and the room's `itemBody` takes the element model's panels (kind null + `hasOwnBody`). Every other picture keeps its drawing and the front shapes are added to it in the room (`ownBodyParts`).

- [ ] **Step 1:** Test: an `arches` row with a front half-circle base → `symbolOf(row, resolveFootprint(row)) === null`, and `elementBody(...)` builds one panel; the same row without `plane` → `"arch"`.
- [ ] **Step 2:** Run — FAIL; implement; PASS.
- [ ] **Step 3: Run** `npm run check:scene-front && npm run check:scene && npm run typecheck`.
- [ ] **Step 4: Commit** `feat(catalog): an arch, a gate, a chuppah drawn from the front stands as drawn`.

### Task 10: Seen, and written down

- [ ] **Step 1:** Headless (memory `headless-browser-check`; the worktree's dev server on :3001; the buki supplier login; NEVER press save): a new קירות רקע row from the category picker → the editor → חזית → three גל tiles placed at three plan depths (bar's plan-depth numbers via the side panel), each a different height → screenshots of תוכנית (three bands, faces marked), חזית (the waves, the room under them), צד (three thin boxes), the 3D pane; a bend of 60° on the front layer; an arch row (קשתות) with a front half-circle base: the 3D pane shows the arch, the plan its band. Errors: none.
- [ ] **Step 2:** CLAUDE.md: extend "The shape editor has THREE VIEWS" with the front shape (the plane, the band, the base's dims mapping, the rail in חזית, the panel in the room, FRONT_REPLACES_PICTURE, the category); the spec's §13 status: S2 built, the category pulled forward.
- [ ] **Step 3:** All checks named in this plan + `npm run typecheck`. Commit `docs: backdrops S2 — front shapes`.
