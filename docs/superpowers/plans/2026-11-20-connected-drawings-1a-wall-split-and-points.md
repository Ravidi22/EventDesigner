# Connected drawings 1a — wall split, join back, and one "add a point" gesture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wall can be split at any point into two real walls (and joined back), without moving anything any event hangs on it; and every outline editor adds and removes a point the same way.

**Architecture:** A pure module `lib/venues/wall-split.ts` splits, joins and merges in the wall graph and writes a LINEAGE (`VenueStructure.wallLineage`) from an old wall id to the walls now standing in its place. `wallTrack` (lib/studio/anchor.ts, the seam every wall-hung thing already reads through) resolves a lineage id into a CHAIN track, so a drape in any sketch stays where it was. /halls gets the verbs; every outline editor gets "double-click a side adds a point there, double-click a point removes it".

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching framework code — AGENTS.md), React, TypeScript, SVG canvas (`components/plan-canvas.tsx`), self-checks run with `tsx`.

**Spec:** [docs/superpowers/specs/2026-11-20-connected-drawings-design.md](../specs/2026-11-20-connected-drawings-design.md) — §5, §5.1, §6 (the "add a point" / "remove a point" rows), DECIDEs 15, 23, 24, 25. Plan 1b (join points, §1–§1.1) follows this one and uses `splitWall`.

## Global Constraints

- Branch: `feat/2026-11-20-connected-drawings`, made from the current HEAD of `feat/2026-11-13-catalog-repairs` (it carries the /halls rail work this touches). **Never stage `lib/catalog/standard/backfill.ts`** — it is someone else's uncommitted change.
- Pure geometry lives in `lib/`, with its self-check at the bottom of the module under `if (isMain(import.meta.url)) { … }` (local `assert = (c, m) => { if (!c) throw new Error("FAIL: " + m) }`), and a `"check:<name>": "tsx <path>"` script in package.json. No `node:` imports in a module a client component imports.
- Every structure edit at /halls goes through `editStructure` (one history entry) or `dragStructure` (amended into the open entry) in halls-screen.tsx, so `settleWalls` runs on it.
- Canvas speed (CLAUDE.md "The camera is a transform"): no setState per pointermove; every drag through `startPointerGesture`; no fresh closures/objects as node props on hundreds of nodes.
- RTL: logical properties only (`ms-*`/`me-*`, `start`/`end`).
- Hebrew copy, verbatim: wall bar **"הוספת נקודה באמצע"**; node bar **"חיבור הקירות"**; refusal in an opening **"הנקודה בתוך פתח הדלת"**; refusal of two kinds **"קיר וגבול שטח לא מתחברים"**; after a join that could not keep the bow **"חובר כקיר ישר"**; outline side bar **"הוספת נקודה באמצע"**.
- No migration: `wallLineage` lives inside the `venue_structures.structure` JSONB, which is stored whole (lib/venues/db-mapping.ts `toStructureRow`).
- Verify before done: `npm run typecheck`, every check named in a task, and `npm run check:actions`.

## Review Focus

1. **A drape in an event's sketch on a wall that is then split** — it must hang exactly where it hung (same path within 0.5 mm), and bend with the wall if the new point is dragged out. → Task 3, `check:anchor`.
2. **Split, split a half again, then join** — nested lineage resolves; joining the inner pair restores the half's id, not the original. → Task 2, `check:wall-split`.
3. **The venue's own curtain on a wall that is split** — it must still part for its "main door" (`curtainClear`), now standing on a half. → Task 3, `check:curtain`.
4. **Delete on a corner** — today Delete on a node removes the node and every wall on it. After this, a node with exactly two walls of one kind JOINS them; a node with 1 or 3+ walls (or two of different kinds) keeps today's behaviour, except two different kinds refuse with the hint. → Task 2 (`joinRefusal`) + Task 4.
5. **A split point dropped inside a door** — refused with the hint, nothing written (including on a bowed wall, where the opening is measured on the chord). → Task 1, `check:wall-split`.

---

### Task 0: Branch and the spec

- [ ] **Step 1:** `git switch -c feat/2026-11-20-connected-drawings`
- [ ] **Step 2:** Commit the spec and both plan files only:

```bash
git add docs/superpowers/specs/2026-11-20-connected-drawings-design.md docs/superpowers/plans/2026-11-20-connected-drawings-1a-wall-split-and-points.md
git commit -m "docs(spec): connected drawings — join points, close along a border, grow, stay joined, wall split"
```

---

### Task 1: Split a wall, with its lineage

**Files:**
- Create: `lib/venues/wall-split.ts`
- Modify: `lib/venues/structure.ts` (types near `VenueStructure`, line ~444), `lib/studio/geometry.ts:165` (export `splitCubic`), `package.json` (`"check:wall-split": "tsx lib/venues/wall-split.ts"`)

**Interfaces:**
- Produces (structure.ts):
  ```ts
  export interface WallPiece { wallId: string; from: number; to: number } // the share of the OLD wall's parameter it covers
  export interface WallLineage { id: string; chain: WallPiece[]; curve?: EdgeCurve | null } // curve: the old wall's, for a faithful join-back
  // VenueStructure gains: wallLineage?: WallLineage[];
  ```
- Produces (wall-split.ts):
  ```ts
  export function splitWall(s: VenueStructure, wallId: string, t: number): { structure: VenueStructure; nodeId: string } | { error: string };
  export function wallChain(s: VenueStructure, id: string): { wall: Wall; from: number; to: number }[] | null;
  export function hasWall(s: VenueStructure, id: string): boolean; // a wall, or a lineage whose chain fully resolves
  ```
- Produces (geometry.ts): `export function splitCubic(c: Cubic, t: number): { left: Cubic; right: Cubic }` and `export type Cubic`.

`t` everywhere is the wall's own parameter: the chord fraction on a straight wall, the bezier's parameter on a bowed one — the same `t` doors (`distanceMm / chordMm`) and `WallRail.from/to` already use.

- [ ] **Step 1: Write the failing self-check** at the bottom of `lib/venues/wall-split.ts`. Fixture: nodes A(0,0), B(10000,0); wall `w` A→B kind "wall" heightMm 2800; a door `d` on `w` at distanceMm 2000 width 1000; a bowed copy `wb` (curve `{ c1: {x: 3000, y: -2000}, c2: {x: -3000, y: -2000} }` — offsets, c1 from a, c2 from b).

```ts
const r = splitWall(s, "w", 0.6);
assert(!("error" in r), "a split returns a node");
const [left, right] = wallChain(r.structure, "w")!;
assert(left.from === 0 && left.to === 0.6 && right.from === 0.6 && right.to === 1, "the old id resolves to two pieces covering 0–0.6 and 0.6–1");
assert(left.wall.heightMm === 2800 && right.wall.kind === "wall", "both halves inherit height and kind");
assert(r.structure.walls.length === 2 && !r.structure.walls.some((w) => w.id === "w"), "the old wall is gone from walls");
const door = r.structure.entrances[0];
assert(door.wallId === left.wall.id && Math.abs(door.distanceMm - 2000) < 1, "the door goes to the half its middle stands on, same world position");
assert("error" in splitWall(s, "w", 0.2) && (splitWall(s, "w", 0.2) as { error: string }).error === "הנקודה בתוך פתח הדלת", "a point inside an opening is refused");
// bowed: the two halves draw the old curve — sample 20 points of the old cubic and of the halves, within 0.5 mm
// nested: split the right half again at 0.5 → wallChain(s2, "w") has three pieces 0–0.6, 0.6–0.8, 0.8–1
// dangling: remove one piece's wall → wallChain(…, "w") === null and hasWall(…, "w") === false
```

- [ ] **Step 2: Run it, expect FAIL** — `npm run check:wall-split` → error, `splitWall` not defined.
- [ ] **Step 3: Implement.** Export `splitCubic`/`Cubic` from geometry.ts unchanged. `splitWall`: refuse when `t` is within an opening of that wall (a door's chord interval `[distance − width/2, distance + width/2]` divided by `chordMm`) or within 1 % of either end; new node at the wall's point at `t` (`wallTrack(s, id).at(t).p`, rounded); two walls with fresh ids, `kind`/`heightMm` copied; a bowed wall's curve cut by `splitCubic` on `absoluteControlPoints` and written back as offsets (c1 from its a, c2 from its b); every opening re-homed to the half its middle is on, `distanceMm` re-measured on that half's chord, `measureFrom` kept; append `{ id, chain: [{left,0,t},{right,t,1}], curve }` to `wallLineage`. `wallChain`: a wall id → `[{wall,0,1}]`; a lineage id → its pieces, each resolved recursively and its range mapped into the parent's (`from + f·(to − from)`); any piece unresolved → `null`; depth cap 16.
- [ ] **Step 4: Run, expect PASS** — `npm run check:wall-split`; also `npm run check:structure` and `npm run check:faces` (unchanged, still green).
- [ ] **Step 5: Commit** — `git add lib/venues/wall-split.ts lib/venues/structure.ts lib/studio/geometry.ts package.json && git commit -m "feat(venues): split a wall into two, with a lineage for its old id"`

---

### Task 2: Join walls back, and merge nodes

**Files:** Modify `lib/venues/wall-split.ts`.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  export function joinable(s: VenueStructure, nodeId: string): boolean;          // exactly two walls meet there, of one kind
  export function joinRefusal(s: VenueStructure, nodeId: string): string | null; // "קיר וגבול שטח לא מתחברים" when exactly two walls of DIFFERENT kinds meet; else null
  export function joinWalls(s: VenueStructure, nodeId: string): { structure: VenueStructure; wallId: string; straightened: boolean } | { error: string };
  export function mergeNodes(s: VenueStructure, fromId: string, intoId: string): VenueStructure;
  ```

- [ ] **Step 1: Failing checks** (same fixture):

```ts
const split = splitWall(s, "w", 0.6) as { structure: VenueStructure; nodeId: string };
const back = joinWalls(split.structure, split.nodeId);
assert(!("error" in back) && back.wallId === "w", "joining a lineage's whole chain gives the ORIGINAL id back");
assert(!(back as { structure: VenueStructure }).structure.wallLineage?.some((l) => l.id === "w"), "and drops the lineage entry");
assert(Math.abs((back as any).structure.entrances[0].distanceMm - 2000) < 1, "the door is back on the original, same place");
// bowed: split wb at 0.4, join → curve restored within 1 mm, straightened === false;
//        split wb, move the new node 500 mm, join → straightened === true
// unrelated pair: two walls p (A→M) and q (M→B) with no lineage → joinWalls gives a NEW id and two lineage
//        entries {id:"p", chain:[{new,0,tm}]}, {id:"q", chain:[{new,tm,1}]}, tm = M's chord fraction on A→B
// refusal: M joining a "wall" and an "edge" → joinRefusal === "קיר וגבול שטח לא מתחברים"
// nested: split w at 0.6, split the right half at 0.5, join the inner node → the right half's id comes back,
//        wallChain(…, "w") still resolves to two pieces
// merge: mergeNodes(s, "X", "Y") rewires every wall of X to Y; a wall X→Y disappears (zero length)
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `joinWalls`: requires `joinable`; orients the two walls into one a→b through the node; if the two ids are exactly one lineage entry's whole chain in order → the original id, entry removed, the stored `curve` restored only when re-splitting it at the joint parameter reproduces both halves' current curves within 1 mm (else straight, `straightened: true`); otherwise a fresh id plus one lineage entry per old wall. Openings re-homed onto the joined wall by their world middles projected on its chord. `mergeNodes`: rewrite `a`/`b`, drop zero-length and duplicate walls (`addWall`'s duplicate rule), drop the `from` node.
- [ ] **Step 4: Run, expect PASS** — `npm run check:wall-split`.
- [ ] **Step 5: Commit** — `feat(venues): join two walls back into one; merge two nodes`

---

### Task 3: Everything hung on a wall reads through the chain

**Files:**
- Modify: `lib/studio/anchor.ts` (`wallSegment` :26, `wallTrack` :66 + its self-check), `lib/venues/curtain.ts` (:229 existence check, :334 doors parting the curtain), `lib/venues/led.ts:84`, `lib/scene/build.ts:290` (`wallTypedHeight`), `app/(app)/halls/halls-selection.tsx:818` (is a curtain on this door's wall).
- Modify: `lib/venues/wall-split.ts` — add `openingsAlong`.

**Interfaces:**
- Consumes: `wallChain`, `hasWall`.
- Produces: `wallTrack(structure, id)` returns a CHAIN track for a lineage id (same `WallTrack` interface: `a` = first piece's a, `b` = last piece's b, `curved` = true unless one straight collinear piece, `lengthMm` = sum, `at`/`nearestT`/`mmAt`/`tAt`/`path` mapped piecewise through each piece's `[from, to]`); `export function openingsAlong(s: VenueStructure, wallId: string): { opening: StructureEntrance; t: number }[]` — the openings on that wall or on its chain's pieces, each with its middle's `t` in THAT id's parameter.

- [ ] **Step 1: Failing checks.** In anchor.ts's self-check:

```ts
// a straight wall split at 0.6: resolveRail({ type: "wall", wallId: "w", from: 0.2, to: 0.8 }, ctx) gives the
// same path before and after (every point within 0.5 mm); a bowed one the same (sampled)
// drag the new node 1 m off the line: the rail's path now has a corner at the node (it bends with the wall)
// wallTrack(…, "gone") === null still
```
In curtain.ts's self-check: a venue curtain on `w` with `curtainClear` on the door, after `splitWall(s, "w", 0.6)` → `curtainPieces` still leaves the door's opening bare. In wall-split.ts: `openingsAlong(split, "w")[0].t` is 0.2 within 1e-4 (the door's middle, 2000 of 10000, on the OLD wall's parameter, though the door now stands on the left half).

- [ ] **Step 2: Run, expect FAIL** — `npm run check:anchor`, `npm run check:curtain`.
- [ ] **Step 3: Implement.** `wallTrack`/`wallSegment` fall back to `wallChain` when the id is not in `walls`. `curtain.ts:229` and `led.ts:84` use `hasWall`. `curtain.ts:334` reads `openingsAlong(s, c.wallId)` and uses its `t` (not `e.wallId === c.wallId`). `wallTypedHeight` takes the lowest typed `heightMm` among the chain's walls (undefined when none is typed). halls-selection:818 asks whether any curtain's `curtainOf(f)?.wallId` chain contains `door.wallId`.
- [ ] **Step 4: Run, expect PASS** — `npm run check:anchor && npm run check:curtain && npm run check:rail && npm run check:led && npm run check:scene && npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(venues): a split wall's old id resolves to a chain track — drapes, curtains and LED stay put`

---

### Task 4: The verbs at /halls

**Files:**
- Modify: `components/plan-canvas.tsx` — the graph wall hit path (:1894) and the graph node handles (:2010); the `onMoveGraphNode` prop type (:502).
- Modify: `app/(app)/halls/halls-screen.tsx` — `onPick` walls branch (:1153), `moveWithGroup` (:818), `endGesture` (:977), `deleteSelection` (:583), the PlanCanvas props (:1948).
- Modify: `app/(app)/halls/halls-selection.tsx` — the wall group (:604) and the node group (:761).

**Interfaces:**
- Consumes: `splitWall`, `joinWalls`, `joinable`, `joinRefusal`, `mergeNodes`, `nearestWall` (structure.ts:613), `wallTrack(...).nearestT`.
- Produces (PlanCanvas props): `onSplitGraphWall?: (wallId: string, p: Point) => void` (double-click on a wall's hit path); `onRemoveGraphNode?: (nodeId: string) => void` (double-click on a node handle); `onMoveGraphNode?: (nodeId: string, p: Point, info: { alt: boolean }) => void`.

- [ ] **Step 1: Wire PlanCanvas.** Double-click on a wall hit path → `onSplitGraphWall(w.id, clientToMm(…))` (stopPropagation, so the canvas's own double-click does nothing). Double-click on a node → `onRemoveGraphNode(n.id)`. The node drag passes `{ alt: e.altKey }` from the gesture's move event.
- [ ] **Step 2: Wire halls-screen.**
  - `onSplitGraphWall` → `editStructure(s => splitWall(s, id, wallTrack(s, id)!.nearestT(p)))`; on `{ error }` → `setHint(error)`, nothing written; on success select the new node.
  - Walls tool (`onPick`, mode "walls"): when no node is within `addNode`'s 250 mm and `nearestWall(structure, p)` is within 12 screen px (`closeSnapMmRef.current * 0.75`), split that wall at the nearest `t` first and run from the new node — in the SAME `editStructure` call as the wall being drawn.
  - Node drop: `moveWithGroup` remembers `{ id, alt }` of a single-node drag in a ref; `endGesture`, before `hist.commit()`, when that ref is set and `!alt`: a different node within 10 screen px → `dragStructure(s => mergeNodes(s, id, other))`; else a wall not attached to the node within 10 px → `splitWall` there and `mergeNodes` into the new node. Both amended into the drag's entry.
  - Delete on a selected node: `joinable` → `joinWalls` (hint "חובר כקיר ישר" when `straightened`); two kinds → hint from `joinRefusal`, nothing removed; otherwise today's `removeNode`.
  - `onRemoveGraphNode` → the same rule as Delete on that one node.
- [ ] **Step 3: Wire the bars.** The wall group gets a button **"הוספת נקודה באמצע"** → `splitWall(s, id, 0.5)` (hint on refusal). The node group gets **"חיבור הקירות"** when `joinable`.
- [ ] **Step 4: Verify** — `npm run typecheck && npm run check:actions`. Headless (memory `headless-browser-check`; the throwaway studio's own venue, never "Amare"): draw a 6×4 room; double-click its top wall at a third → a node there, two walls in the wall bar; drag the node 1 m up → the wall bends; Ctrl+Z restores in one step; double-click the node → one wall again; "הוספת נקודה באמצע" on a wall with a door in its middle → the refusal hint; start a wall run on the room's right wall's middle and close a second room → two named-able rooms; drag a free corner onto another → one corner.
- [ ] **Step 5: Commit** — `feat(halls): split a wall where you double-click or start a run, join it back, drop a corner on a corner`

---

### Task 5: One "add a point" gesture on every outline

**Files:**
- Modify: `components/venue-plan.tsx` — `RegionOutlineEditor`'s side line (`sideDown`, :602): add `onDoubleClick` → `onInsertPoint(i, nearestOnSide(shape, i, p))`.
- Modify: `app/(app)/halls/outline-bar.tsx` — while a side is picked (`side !== null`, :37), a button **"הוספת נקודה באמצע"** → the editor's insert at `t = 0.5`. (Pass `onInsertPoint` through `OutlineBar`'s props from halls-screen, where `editFeatureShape`/`editRegion` already apply `insertShapePoint`.)
- Modify: `components/plan-canvas.tsx` — outline edit mode: double-click on an outline side's hit path → `onInsertVertex?.(edgeIdx, t)`; double-click on a vertex handle → `onRemoveVertex?.(idx)`.
- Modify: `lib/studio/use-outline-editor.ts` — `insertVertexAt(edgeIdx: number, t: number)` beside `insertVertexOnWall` (which becomes `insertVertexAt(edgeIdx, 0.5)`); `withVertexInserted(s, edgeIdx, t = 0.5)` splits a bowed edge by de Casteljau (`splitCubic`), a straight one by lerp.
- Modify: `app/(app)/catalog/appearance-modal.tsx` (the drawing branch's PlanCanvas props, :2888) and `app/(app)/catalog/elevation-canvas.tsx` — pass `onInsertVertex: partEd.insertVertexAt`, `onRemoveVertex: partEd.removeVertex`.
- Modify: `lib/studio/stage-draw.ts:1013` — `splitSide(poly, front, i, t = 0.5)`; `app/(app)/studio/canvas-stage.tsx` `OutlineHandles` (:5431 side double-click) passes the clicked `t` (projection of the click on the side, clamped 0.05–0.95).

**Interfaces:**
- Produces: PlanCanvas `onInsertVertex?: (edgeIdx: number, t: number) => void`, `onRemoveVertex?: (idx: number) => void`; `useOutlineEditor().insertVertexAt(edgeIdx, t)`; `splitSide(poly, front, i, t?)`.

- [ ] **Step 1: Failing checks.** `check:stage-draw`: `splitSide(rect, 0, 0, 0.25)` puts its two coincident points at a quarter of side 0, and with no `t` at the middle (unchanged). `check:shaped-outline` already covers `insertShapePoint(s, edge, t)` — add: a bowed side split at 0.3 draws the same curve (sampled, 0.5 mm). Add a self-check to use-outline-editor.ts if it has none for `withVertexInserted`: export it for the check, a bowed edge split at 0.3 keeps its curve.
- [ ] **Step 2: Run, expect FAIL** — `npm run check:stage-draw && npm run check:shaped-outline`.
- [ ] **Step 3: Implement** the files above. Remove-point limits stay each editor's own (3 on a closed outline; RegionOutlineEditor already removes on double-click).
- [ ] **Step 4: Verify** — the checks green, `npm run typecheck`. Headless: a /halls pool's "עריכת הקווים" — double-click a side adds a corner where clicked, the bar's button adds one in the middle; the catalog shape editor's "עריכת הקווים" on a rectangle — double-click a side adds a point, double-click a point removes it, Ctrl+Z undoes each in one step; the stage tool's "עריכת הבמה" — double-click a side splits it where clicked.
- [ ] **Step 5: Commit** — `feat(outlines): double-click a side adds a point where you click, on every outline editor`

---

### Task 6: Close the round

- [ ] **Step 1:** `npm run typecheck && npm run check:actions && npm run check:wall-split && npm run check:anchor && npm run check:curtain && npm run check:rail && npm run check:led && npm run check:scene && npm run check:stage-draw && npm run check:shaped-outline && npm run check:faces && npm run check:structure` — all green, output pasted in the hand-off.
- [ ] **Step 2:** CLAUDE.md — one bullet under the /halls notes: a wall is split by a double-click, "הוספת נקודה באמצע" or a run started mid-wall; the old id lives on in `VenueStructure.wallLineage` and `wallTrack` resolves it to a chain track, so never look a wall up by id without `wallTrack`/`wallChain`/`hasWall`; join back restores the original id; Delete on a two-wall corner joins; "add a point" is a double-click on a side on every outline.
- [ ] **Step 3: Commit** — `docs: CLAUDE.md — the wall split and its lineage`
