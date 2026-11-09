# Backdrops S1 — the חזית and צד views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The catalog's shape editor gets a view switch — תוכנית · חזית · צד — where every shape is dragged up and down and made taller or shorter, a round shape's גוף is shaped at full size, and the item's real 3D is drawn under the drawing from the front or the side.

**Architecture:** A pure module (`lib/element/elevation.ts`) projects the shape list to boxes in (across, up) and reads canvas edits back into `ShapePart` patches. The elevation canvas is the existing `PlanCanvas` whose world is (across, −z), with the shapes as rect features of the existing feature layer. Under it, a new orthographic three.js underlay (`components/scene/ortho-underlay.tsx`) draws `itemScene` at exactly the canvas's settled view, carried through pans by the HUD's CSS transform.

**Tech Stack:** Next.js / React 19, TypeScript, @react-three/fiber + three (components/scene only), tsx self-checks.

**Spec:** `docs/superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-design.md` — §4 (the editor) and §9 S1; DECIDEs 4 and 5.

## Global Constraints

- Work only in the worktree `C:\dev\EventDesigner\.claude\worktrees\backdrops` (branch `feat/2026-11-09-backdrops`). Run every command there.
- three / @react-three are imported ONLY under `components/scene/` (`npm run check:scene-boundary`).
- PlanCanvas's camera rules (CLAUDE.md "The camera is a transform"): no setState per pointermove, never render from `live.current`, a host layer is a pure function of what it is handed, every drag through `startPointerGesture`.
- Shaders compile once per GL context: the underlay is mounted on the first entry to חזית/צד and then HIDDEN (FrameGate `hidden`), never unmounted, while the view is תוכנית.
- RTL: logical properties only (`ms-`/`me-`/`start`/`end`); on the canvas the arrows are SCREEN direction (a drawing is a picture).
- No schema or migration. `ShapePart` gains no field in S1.
- Escape in the editor stays: field → the canvas's own → the outline editor's selection → drawing → armed shape → selection; it never closes the modal.
- One drag = one undo entry: live edits go through `hist.amend`, the gesture's end through `hist.commit` (the plan canvas's pattern).
- Hebrew copy is exactly as written in the tasks.
- Headless runs NEVER press a save button.

## Review Focus

1. **A turned shape (45°) in חזית/צד** — its box is its turned bounds; it moves up/down and across, but a side handle must not rewrite its width (`across: null`). Pinned in Task 1.
2. **Below the floor / to nothing** — a shape dragged under the floor stops at z 0; a height never goes under 10 mm; the base never leaves the floor. Pinned in Task 1.
3. **A ceiling row (a chandelier)** — the drawing's z 0 is its underside; the room under it must be shifted by the hang height, or the boxes float beside the picture. Pinned in Task 2 (`itemBaseZ`) and Task 1 (`orthoFrame` with a base z).
4. **Undo after a vertical drag or a profile drag** — one Ctrl+Z puts it back whole, not frame by frame. Checked headlessly in Task 6.
5. **The room while dragging** — it must not rebuild per frame (settle, never while a button is held) and must stay registered with the drawing through a pan and a zoom. Checked headlessly in Task 6.

---

### Task 1: The projection — `lib/element/elevation.ts`

**Files:**
- Create: `lib/element/elevation.ts`
- Modify: `app/(app)/catalog/elevation-view.tsx` (draw from `elevationBoxes(…, "front")` instead of its own loop — same picture)
- Modify: `package.json` (add `"check:elevation": "tsx lib/element/elevation.ts"` beside `check:revolve`)

**Interfaces:**
- Consumes: `placedPartOutline`, `sampledBounds` (lib/studio/footprint.ts); `usesDiameter` (lib/catalog/types.ts); `RevolvePoint`, `ShapePart` (lib/catalog/types.ts); `cleanRevolve` (lib/element/revolve.ts).
- Produces:
  ```ts
  export type ElevationView = "front" | "side";
  export const ELEVATION_MIN_H_MM = 10;
  export interface ElevationBox {
    id: string;
    index: number;                 // in the shape list; 0 = the base
    a0: number; a1: number;        // across, mm — front: plan x; side: plan y (seen from the item's −x end, its front +y to the right)
    z: number; h: number;          // bottom above the item's floor, and rise
    revolve?: RevolvePoint[];      // circle/ellipse, not hollow, ≥ 2 points
    outlineOnly: boolean;          // body === "none"
    across: "width" | "depth" | "diameter" | null; // what an across resize writes; null = none
  }
  export function elevationBoxes(shapes: readonly ShapePart[], itemHeightMm: number, view: ElevationView): ElevationBox[];
  export function boxRect(b: ElevationBox): { x: number; y: number; widthMm: number; depthMm: number }; // canvas world (across, −z)
  export function rectEdit(shape: ShapePart, b: ElevationBox, rect: { x: number; y: number; widthMm: number; depthMm: number }, view: ElevationView): { patch: Partial<ShapePart>; itemHeightMm?: number };
  export function elevationNudge(shape: ShapePart, index: number, view: ElevationView, dAcrossMm: number, dUpMm: number): Partial<ShapePart>;
  export function profileHandles(b: ElevationBox): { x: number; y: number }[];        // canvas world, the right half, one per revolve point
  export function profilePoint(b: ElevationBox, p: { x: number; y: number }): RevolvePoint; // r measured off the axis either side
  export interface OrthoFrame { position: [number, number, number]; rotationY: number; left: number; right: number; top: number; bottom: number; near: number; far: number } // metres, three's world
  export function orthoFrame(view: ElevationView, visible: { minX: number; minY: number; w: number; h: number }, itemAt: { x: number; y: number }, baseZMm: number): OrthoFrame;
  ```

The rules the tests pin:
- Box: `sampledBounds([placedPartOutline(s)])` → front `a0/a1 = minX/maxX`, side `minY/maxY`. Base: `z = 0`, `h = max(10, itemHeightMm)`. Others: `z = s.zMm ?? 0`, `h = max(10, s.heightMm ?? itemHeightMm)`.
- `across`: null when the turn is not a multiple of 90°, or the shape is `custom`, `arc`, `half-circle`, `quarter-circle`, `crescent`, `oval-ring`, `horseshoe`, `u-shape`, `rounded-u`; `"diameter"` for `circle`; otherwise front → `rot % 180 === 0 ? "width" : "depth"`, side → the other one.
- `boxRect`: `x = (a0+a1)/2`, `y = −(z + h/2)`, `widthMm = a1−a0`, `depthMm = h`.
- `rectEdit`: the centre's across shift (written only when |Δ| > 0.5 mm, as the new rounded value) goes to plan `x` (front) or `y` (side). A width change (|Δ| > 0.5 mm) is written only when `across` is set (`widthMm`/`depthMm`/`diameterMm`, rounded). Base: never a `zMm`; the rect's height becomes `itemHeightMm` only when it differs (> 0.5 mm) — a pure vertical move of the base returns no `itemHeightMm`. Others: `zMm = max(0, round(−rect.y − rect.depthMm/2))`, `heightMm = max(10, round(rect.depthMm))`.
- `elevationNudge`: returns the NEW values (not deltas) — across → plan `x`/`y`; up → `zMm` (≥ 0), never for the base; a zero component is left out.
- `profileHandles`: axis `cx = (a0+a1)/2`, `R = (a1−a0)/2`; point i at `(cx + r·R, −(z + zf·h))`. `profilePoint` is its inverse, `r = |x − cx| / R`.
- `orthoFrame`: camera 15 m out, `near` 0.1, `far` 60. Front: `position [0, 0, 15]`, `rotationY 0`, `left = (minX − itemAt.x)/1000`, `right = (minX + w − itemAt.x)/1000`, `top = (−minY + baseZMm)/1000`, `bottom = (−(minY + h) + baseZMm)/1000`. Side: `position [−15, 0, 0]`, `rotationY −π/2`, left/right from `itemAt.y`.

- [ ] **Step 1: Write the self-check** at the foot of `lib/element/elevation.ts` (`if (isMain(import.meta.url))`, the repo's `assert` + `console.log("  ok   …")` pattern, ending `console.log("elevation self-check passed")`), over the proving bar: base rect 3000×600 at (0,0); back-bar rect 3000×400 at (0,−900), `zMm 0`, `heightMm 2000`; shelf rect 3000×250 at (0,−600), `zMm 1000`, `heightMm 40`; item height 1100.
  ```ts
  const fb = elevationBoxes(bar, 1100, "front");
  assert(fb[0].a0 === -1500 && fb[0].a1 === 1500 && fb[0].z === 0 && fb[0].h === 1100, "the base stands on the floor, as tall as the item");
  assert(fb[2].z === 1000 && fb[2].h === 40, "the shelf at its own height");
  const sb = elevationBoxes(bar, 1100, "side");
  assert(sb[1].a0 === -1100 && sb[1].a1 === -700, "seen from the side, across is plan y");
  const up = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), y: boxRect(fb[2]).y - 200 }, "front");
  assert(up.patch.zMm === 1200 && up.patch.heightMm === 40 && up.patch.x === undefined, "dragged up 20 cm");
  const r0 = boxRect(fb[0]);
  const taller = rectEdit(bar[0], fb[0], { ...r0, y: r0.y - 150, depthMm: r0.depthMm + 300 }, "front");
  assert(taller.itemHeightMm === 1400 && taller.patch.zMm === undefined, "the base's top edge is the item's height");
  const lifted = rectEdit(bar[0], fb[0], { ...r0, y: r0.y - 500 }, "front");
  assert(lifted.itemHeightMm === undefined && lifted.patch.zMm === undefined, "the base never leaves the floor");
  const sunk = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), y: 100 }, "front");
  assert(sunk.patch.zMm === 0, "nothing goes under the floor");
  const turned = { ...bar[1], rotation: 45 };
  const tb = elevationBoxes([bar[0], turned], 1100, "front")[1];
  assert(tb.across === null && rectEdit(turned, tb, { ...boxRect(tb), widthMm: boxRect(tb).widthMm + 400 }, "front").patch.widthMm === undefined, "a turned shape's width is not rewritten across");
  const slid = rectEdit(bar[1], sb[1], { ...boxRect(sb[1]), x: boxRect(sb[1]).x + 100 }, "side");
  assert(slid.patch.y === -800 && slid.patch.x === undefined, "slid across in the side view moves plan y");
  ```
  Plus: a circle ⌀600 with `revolve: REVOLVE_PRESETS.vase` → `profileHandles(box).length === 7` and `profilePoint(box, profileHandles(box)[3])` is within 1e-3 of `REVOLVE_PRESETS.vase[3]` (after `cleanRevolve`); `elevationNudge(bar[2], 2, "front", 10, 50)` is `{ x: 10, zMm: 1050 }`, and `elevationNudge(bar[0], 0, "front", 0, 50)` has no `zMm`; `orthoFrame("front", { minX: -2000, minY: -2500, w: 4000, h: 3000 }, { x: 100, y: 0 }, 0)` gives `left -2.1, right 1.9, top 2.5, bottom -0.5, rotationY 0`; the same with base z 2800 gives `top 5.3`; `orthoFrame("side", …, { x: 0, y: 300 }, 0)` gives `rotationY === -Math.PI / 2`, `position[0] < 0`, `left === (-2000 - 300) / 1000`.

- [ ] **Step 2: Run it to see it fail**
  Run: `npm run check:elevation`
  Expected: FAIL — the functions do not exist yet.

- [ ] **Step 3: Implement the module** to the signatures and rules above (header comment in the repo's style: what it is, the spec, "Pure. Run: npm run check:elevation").

- [ ] **Step 4: Make `ElevationView` (the panel's small picture) draw from `elevationBoxes(shapes, itemHeightMm, "front")`** — the same picture, its own box loop deleted.

- [ ] **Step 5: Run the checks**
  Run: `npm run check:elevation && npm run check:revolve && npm run typecheck`
  Expected: `elevation self-check passed`, `revolve self-check passed`, tsc clean.

- [ ] **Step 6: Commit**
  ```bash
  git add lib/element/elevation.ts "app/(app)/catalog/elevation-view.tsx" package.json
  git commit -m "feat(element): the elevation projection — boxes, edits read back, profile handles, the ortho frame"
  ```

---

### Task 2: The room under the drawing — the ortho underlay

**Files:**
- Modify: `lib/scene/item-scene.ts` (add `itemBaseZ` + its asserts in the existing self-check)
- Modify: `components/scene/scene-lights.tsx` (`SceneLights` props `sky?: boolean`, `fog?: boolean`, both default true)
- Modify: `components/scene/scene-viewer.tsx` (`export` `FrameGate` — no other change)
- Create: `components/scene/ortho-underlay.tsx`
- Modify: `components/scene/lazy.tsx` (add `LazyOrthoUnderlay`)
- Modify: `app/(app)/catalog/scene-pane.tsx` (extract `useSettledScene`, the pane uses it)

**Interfaces:**
- Consumes: `OrthoFrame` (Task 1); `hangHeightOf` (lib/studio/hang.ts); `ceilingUndersideMm` (lib/scene/overhead.ts); `SceneSubject`, `SCENE_PANE_SETTLE_MS` (scene-pane.tsx); `useSettled`.
- Produces:
  ```ts
  // lib/scene/item-scene.ts — the z the build puts the item's own floor at: 0, or for a ceiling row
  // exactly lib/scene/build.ts ceilingPlacement's underside under open sky.
  export function itemBaseZ(product: Product): number;
  // components/scene/ortho-underlay.tsx (default export, loaded through lazy.tsx)
  export interface OrthoUnderlayProps { scene: Scene; frame: OrthoFrame; hidden?: boolean; className?: string }
  // components/scene/lazy.tsx
  export const LazyOrthoUnderlay: ComponentType<OrthoUnderlayProps>;
  // app/(app)/catalog/scene-pane.tsx
  export function useSettledScene(subject: SceneSubject | null): { scene: Scene | null; focus: Viewpoint | null; pending: boolean };
  ```

- [ ] **Step 1: Add the asserts** to item-scene.ts's self-check: a floor row → `itemBaseZ === 0`; a `chandeliers` row with `layer: "ceiling"` and `categoryFields: { hangHeightMm: 2800 }` → 2800; the same row without it → `ceilingUndersideMm(null, 0)`.

- [ ] **Step 2: Run to see it fail**
  Run: `npm run check:item-scene`
  Expected: FAIL — `itemBaseZ` is not defined.

- [ ] **Step 3: Implement `itemBaseZ`**: `product.layer === "ceiling" ? (hangHeightOf({}, product) ?? ceilingUndersideMm(null, product.dimensions.heightMm ?? 0)) : 0`.

- [ ] **Step 4: Run it**
  Run: `npm run check:item-scene`
  Expected: PASS.

- [ ] **Step 5: `SceneLights` `sky` / `fog`** — `sky={false}` mounts no dome; `fog={false}` leaves `scene.fog` null (and restores it when true). Defaults keep every existing caller as it is.

- [ ] **Step 6: The underlay component.** An R3F `<Canvas orthographic frameloop="demand" dpr={[1, 2]} gl={{ alpha: true, antialias: true, toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}>` with the viewer's `onCreated` (`checkShaderErrors = false`), containing `SceneLights` (mood `"day"`, `sky={false}`, `fog={false}`, `shadows={false}`), `EmitterLights` (count `resolveDevice(undefined).pointLights` — the pool's full size, never sized by the content), `SceneNodes` (`author={false}`, `lodScale={1}`), a small `OrthoCamera` child that writes `frame` onto the camera (`left/right/top/bottom/near/far`, `position`, `rotation.y`, `updateProjectionMatrix()`, `invalidate()`) in a layout effect keyed on the frame's numbers, and `FrameGate` (`hidden`). No WebGL → render nothing. Background transparent, so the canvas grid and colour show through. Header comment: what it is, why orthographic, the compile and hide rules.

- [ ] **Step 7: `useSettledScene`** — move the pane's snapshot + `useSettled` + build logic into the exported hook (`pending` = a subject exists whose key has not settled yet); the pane calls it and renders exactly as before.

- [ ] **Step 8: Run the checks**
  Run: `npm run check:scene-boundary && npm run check:scene-viewer && npm run check:item-scene && npm run typecheck`
  Expected: all pass; the boundary check accepts the new file (it is under components/scene).

- [ ] **Step 9: Commit**
  ```bash
  git add lib/scene/item-scene.ts components/scene "app/(app)/catalog/scene-pane.tsx"
  git commit -m "feat(scene): an orthographic underlay of the item's room; itemBaseZ; sky and fog switches"
  ```

---

### Task 3: PlanCanvas carries an underlay

**Files:**
- Modify: `components/plan-canvas.tsx`

**Interfaces:**
- Produces: a new optional prop on `PlanCanvas`:
  ```ts
  /** HTML drawn BEHIND the plan (a picture of the same world — the shape editor's room seen from the
   *  front). Laid out against the SETTLED view's world box and carried to the live view by the HUD's
   *  CSS transform, so a pan or a zoom re-renders nothing. Pass a stable function (useCallback). */
  underlay?: (view: { minX: number; minY: number; w: number; h: number }) => ReactNode;
  ```

- [ ] **Step 1: Implement.** A `<div ref={underlayRef} className="pointer-events-none absolute inset-0" style={{ transformOrigin: "0 0" }}>` rendered BEFORE the `<svg>` (only when `underlay` is set), its child `useMemo(() => underlay?.(vb), [underlay, vb.minX, vb.minY, vb.w, vb.h])` and only once `hasRect`; `applyView` writes the same `hudTransform(...)` string onto it as onto `hudRef`; the `<svg>` gets `relative` when `underlay` is set, so it paints above the absolutely positioned underlay. Nothing else changes for hosts that pass no underlay.

- [ ] **Step 2: Verify**
  Run: `npm run typecheck && npx eslint components/plan-canvas.tsx`
  Expected: clean. (Behaviour is checked headlessly in Task 6.)

- [ ] **Step 3: Commit**
  ```bash
  git add components/plan-canvas.tsx
  git commit -m "feat(canvas): an underlay behind the plan, carried by the HUD transform"
  ```

---

### Task 4: The elevation canvas in the shape editor

**Files:**
- Create: `app/(app)/catalog/elevation-canvas.tsx`
- Create: `app/(app)/catalog/elevation-bar.tsx`
- Modify: `app/(app)/catalog/appearance-modal.tsx`

**Interfaces:**
- Consumes: Task 1 (`elevationBoxes`, `boxRect`, `rectEdit`, `elevationNudge`, `orthoFrame`, `ElevationView`), Task 2 (`LazyOrthoUnderlay`, `useSettledScene`, `itemBaseZ`, `itemScene`, `itemSceneKey`), Task 3 (`underlay`); `StructureFeatures`, `emptyStructure`, `hitsInBox`, `mergeSelection` (as the modal uses them); `Dim` (venue-dims); `Bar`, `QuickNumber`, `QuickUnit`, `QuickSep`, `QuickTail` (components/inspector-bar.tsx); `Segmented` (components/segmented.tsx).
- Produces:
  ```ts
  export interface ElevationCanvasProps {
    view: ElevationView;
    shapes: readonly ShapePart[];
    itemHeightMm: number;
    selected: readonly string[];
    onSelect: (ids: string[]) => void;
    /** Live, inside the open undo entry (hist.amend): the shapes, and the item's height when the base's top moved. */
    onEdit: (fn: (list: ShapePart[]) => ShapePart[], itemHeightMm?: number) => void;
    onCommit: () => void;
    history: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };
    /** The room to draw under the drawing; null = none (off, or nothing drawn). */
    room: { subject: SceneSubject; itemAt: { x: number; y: number }; baseZMm: number } | null;
    hidden?: boolean;   // the view is תוכנית: kept mounted, the underlay held
  }
  export function ElevationCanvas(props: ElevationCanvasProps): JSX.Element;
  // elevation-bar.tsx
  export function ElevationQuickBar(props: { part: ShapePart; base: boolean; title: string; itemHeightMm: number; onChange: (p: Partial<ShapePart>) => void; onItemHeight: (mm: number) => void; onDuplicate: () => void; onRemove: () => void; more: MenuItem[]; onClose: () => void }): JSX.Element;
  ```

What the canvas does:
- `PlanCanvas` in edit mode at rest (the modal's resting prop block: no outline, `lengthUnit="cm"`, `gridMm`/`padMm`/`minExtentMm` from `PRODUCT_FRAME`, `defaultDims`), `framePoints` = every box rect's corners plus `(±1000, 0)` and `(0, −2000)`, history from `history`, `onCanvasClick` → `onSelect([])`, `onMarquee` → `hitsInBox` + `mergeSelection` over the box features.
- Each box is a `StructureFeature` rect (`kind: "other"`, `shape: "rect"`, `boxRect` place and size, `rotationDeg: 0`, `style.fillOpacity: 0` while the room shows, `dash: "dashed"` when `outlineOnly`). `onMove`/`onResize` → `ctx.snap` against the other boxes' rects (as the plan does), then `rectEdit` → `onEdit(list ⇒ list.map(patch for that id), itemHeightMm)`; `onRotate` not passed (no knob); `onCommit` → `ctx.endSnap()`, `onCommit()`.
- A revolve box draws its silhouette (`revolveSilhouette` in canvas coordinates, y negated) over its clear rect, pointer-none.
- The floor: one line at y 0 from −50 000 to 50 000, `stroke-border`, under the boxes.
- With `ctx.dims` and one box selected: its height as a `Dim` beside its `a1` end (`text` in cm, "ס״מ"), and, when `z > 0`, a second `Dim` from the floor to its bottom one gap further out.
- The underlay: `useSettledScene(room?.subject ?? null)`; `underlay` = a `useCallback((vb) => scene ? <LazyOrthoUnderlay scene={scene} frame={orthoFrame(view, vb, room.itemAt, room.baseZMm)} hidden={hidden} className="h-full w-full" /> : null, [...])`.

What the modal does:
- `const [view, setView] = useState<"plan" | ElevationView>("plan")`, and `elevationMounted` latched true on the first switch away from plan (the canvas is then kept, `hidden` while plan shows; the plan canvas likewise stays mounted and is hidden with `invisible pointer-events-none` while an elevation shows).
- The switch: `<Segmented label="מבט" value={view} options={[["plan", "תוכנית"], ["front", "חזית"], ["side", "צד"]]} onChange={setView} />` floating `absolute top-3 start-3 z-20` over the canvas area, with an icon toggle beside it — label `"החדר מאחורי השרטוט"`, pressed by default — shown only in חזית/צד; it feeds `room` (null when off).
- `room` = `shapes.length ? { subject: { key: itemSceneKey(preview), build: () => itemScene(preview) }, itemAt, baseZMm: itemBaseZ(preview) } : null`.
- `onEdit` = `hist.amend(d ⇒ withShapes(d, fn(d.shapes)), then the item height when given)`; `onCommit` = `hist.commit`.
- Arrow keys while the view is חזית/צד: each selected shape patched by `elevationNudge(shape, index, view, dx, −dy)` in one `editShapes` (→ = +across, ↑ = up; `NUDGE_MM` / Shift `NUDGE_BIG_MM`). Every other key (Ctrl+C/X/V/D/A, Delete, Escape) acts as in plan.
- `ShapeRail` gains `disabled?: boolean` (tiles and "ציור חופשי" inert, `opacity-50`, `title="צורות חדשות מונחות בתוכנית"`), set in חזית/צד; the plan's double-click and right-click menu do not reach the elevation canvas.
- The quick bar in חזית/צד: one shape → `ElevationQuickBar` (title = the shape's name; base: one number `"גובה הפריט (ס״מ)"` → `setItemHeight`; any other: `"גובה מהרצפה (ס״מ)"` → `zMm`, `"גובה (ס״מ)"` → `heightMm`; then `QuickTail` duplicate / delete / ⋯ as the plan's bar); several → the plan's align bar unchanged; none → the plan's item bar unchanged.
- The canvas hint, in חזית/צד with nothing selected and shapes present: `"גררו צורה למעלה או למטה כדי לשנות את גובהה מהרצפה"`; an empty item: the plan's empty hint.

- [ ] **Step 1: Write `elevation-bar.tsx`** to its signature (the same `Bar` / `QuickNumber` usage as the modal's item bar; numbers in cm, rounded to mm).
- [ ] **Step 2: Write `elevation-canvas.tsx`** as described (header comment: what it is, the spec §4, the view's world (across, −z), the underlay rules).
- [ ] **Step 3: Wire the modal** as described.
- [ ] **Step 4: Verify**
  Run: `npm run typecheck && npx eslint "app/(app)/catalog/elevation-canvas.tsx" "app/(app)/catalog/elevation-bar.tsx" "app/(app)/catalog/appearance-modal.tsx" && npm run check:shape-list && npm run check:element-parity`
  Expected: clean; both checks pass (nothing about saving changed).
- [ ] **Step 5: Commit**
  ```bash
  git add "app/(app)/catalog"
  git commit -m "feat(catalog): the shape editor's חזית and צד views, with the room under the drawing"
  ```

---

### Task 5: The גוף shaped on the view

**Files:**
- Modify: `app/(app)/catalog/elevation-canvas.tsx`
- Modify: `app/(app)/catalog/revolve-editor.tsx`
- Modify: `app/(app)/catalog/appearance-modal.tsx` (`PictureFields`, `ShapePanel`, their call sites)

**Interfaces:**
- Consumes: `profileHandles`, `profilePoint` (Task 1); `movedPoint`, `addedPoint`, `removedPoint` (lib/element/revolve.ts); `startPointerGesture`.
- Produces: `RevolveFields` prop `onEditInView?: () => void`; `ShapePanel` prop `onOpenElevation?: () => void`; `PictureFields` prop `onEditInView?: () => void`.

- [ ] **Step 1: The handles.** For the ONE selected box with a `revolve`: a handle (screen-sized, `ctx.mm(5)` radius, the canvas's handle classes) at each `profileHandles` point; a press drags it through `startPointerGesture` → `profilePoint(box, ctx.clientToMm(...))` → `onEdit(list ⇒ revolve = movedPoint(from, i, q.r, q.z) on that shape)`, the end → `onCommit()`; the first and last handles slide sideways only (movedPoint already holds their z); a click on the silhouette adds a point (`addedPoint`, its own undo entry: edit then commit); a double-click on a middle handle removes it (`removedPoint`). Handles are drawn in the `topmost` layer so nothing covers them.
- [ ] **Step 2: `RevolveFields onEditInView`.** When given, the small point editor (the 256 × 150 SVG) is replaced by `<Button variant="outline" size="sm" className="w-full" onClick={onEditInView}>עריכת הגוף בחזית</Button>` and `<Note>גררו את הנקודות על הצללית בחזית; לחיצה על הקו מוסיפה נקודה, לחיצה כפולה על נקודה מוחקת.</Note>`; the preset tiles stay. Without it the panel is unchanged.
- [ ] **Step 3: Pass it.** Every `RevolveFields` call in the modal gets `onEditInView` = switch to `"front"` and select the shape whose profile it is (the base for `PictureFields`' three; the panel's own part for `ShapePanel`'s). `ShapePanel`'s גובה group gets, under the small `ElevationView`, an outline small button `"פתיחה בחזית"` (`onOpenElevation`: switch to front, keep the selection).
- [ ] **Step 4: Verify**
  Run: `npm run typecheck && npx eslint "app/(app)/catalog" && npm run check:revolve`
  Expected: clean.
- [ ] **Step 5: Commit**
  ```bash
  git add "app/(app)/catalog"
  git commit -m "feat(catalog): the גוף shaped at full size on the חזית view"
  ```

---

### Task 6: Seen in a browser, and written down

**Files:**
- Create (scratchpad only, never the repo): `C:\Users\Ravid\AppData\Local\Temp\claude\be93d0f21d8125eb\b8577eaf-aa78-4a0b-a424-18058c5b036a\scratchpad\domtest\elevation-s1.js`
- Modify: `CLAUDE.md` (one bullet under the element model's, "The shape editor's חזית and צד views (2026-11-10)…")
- Modify: `docs/superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-design.md` (a §13 Status line: S1 built)

The recipe is the memory `headless-browser-check`: Playwright 1.49.1 in the scratchpad, system Chrome headless with SwiftShader, the dev server on :3000 started FROM THE WORKTREE (`npm run dev` in the worktree; copy `.env.local` there if missing), login `buki@bukiflowers.dev` / `buki-flowers-2026`, a NEW unsaved draft in `chandeliers` (and one in `bars`) via `button[aria-label="הוספת מוצר חדש"]` → `#p-cat` → the option → `button[aria-label="עריכת המראה על התוכנית"]`. Never press save.

- [ ] **Step 1: Bar draft.** Add a second rect, switch to חזית (the Segmented "חזית"): screenshot shows two boxes on a floor line with the room under them. Drag the second box up 300 px: its "גובה מהרצפה" in the quick bar reads > 0; the room re-draws it raised after ~0.5 s (screenshot). Ctrl+Z once: it is back on the floor in ONE step. Drag the base's top edge: the header's numbers change height.
- [ ] **Step 2: Pan and zoom in חזית** (Space+drag, wheel): screenshot after each — the room and the boxes stay registered.
- [ ] **Step 3: צד:** the same boxes seen across plan y.
- [ ] **Step 4: Chandelier draft** (ceiling row): in ציור pick a silhouette tile, press "עריכת הגוף בחזית": the view switches, the base is selected, the handles show on the silhouette over the room (the box's z 0 is the chandelier's underside — no float). Drag a handle: the silhouette follows live; the room follows after it settles (screenshot); Ctrl+Z restores in one step.
- [ ] **Step 5: Back to תוכנית:** the plan canvas is as before; the underlay is hidden (`invisible`), not unmounted. No console errors in the whole run.
- [ ] **Step 6: Write it down** — the CLAUDE.md bullet (the views, the room under the drawing, the גוף on the view, the files) and the spec status line; run `npm run typecheck`; commit:
  ```bash
  git add CLAUDE.md docs/superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-design.md
  git commit -m "docs: the shape editor's elevation views (backdrops S1)"
  ```
