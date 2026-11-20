# Connected drawings: joining a new outline to one already drawn (design)

Version 0.2 | 2026-11-20 | **Approved to plan ("continue"), not built.** v0.2 adds Ravid's follow-up: a point added to a wall splits it (§5), and "add a point" is one gesture on every outline (§5.1). This is a definition, written to be argued with. It comes from Ravid's request and his answers to one round of questions. Each **DECIDE** is a point he left open ("IDK" or "wherever it fits"), with the answer this document assumes. Change any of them here before anything is built.

Ravid, 2026-11-20: *"I want to have an option to connect drawings. In /halls I have drawn an area, now I want to create another area connected to the previous one, sort of extend it — I want to be able to click on a point from the previous one and continue drawing. Another example, in the appearance modal — I want to connect between shapes using the already existing points, and connect between shapes with custom lines."*

His answers:
1. What was being drawn: IDK.
2. The finished area is a new area OR the old one grown: **choose at the finish**.
3. **It closes by itself** along the old border.
4. **Corners, anywhere on a side, plus the middle of each side and a round shape's quarter points.**
5. Stay joined afterwards: IDK.
6. **All /halls drawings take part.**
7. What lines between two shapes make: IDK. His example is *a table or a pool that is two circles that need to be connected*.
8. **Lines follow a shape when it is moved or resized.**
9. Wherever it fits: *"the app's drawing actions should be aligned between all spaces."*

## 0. What exists

- **Walls already connect.** A wall run clicked on an existing corner reuses it: `addNode` takes any node within 250 mm (lib/venues/structure.ts:475). Two rooms then share that corner, and dragging it moves both. A run that closes a loop offers to name the new room (halls-screen `onPick`, faces from `detectFaces`).
- **A wall cannot start from the middle of a wall.** A click there makes a free node that is not connected to the wall. Nothing splits a wall (faces.ts:10-13: walls that cross mid-span are not split). A wall's middle is reached only BY `t`, never in the graph: a sail's tie `{ kind: "wall", t }` and the sketch's drapes `WallRail { wallId, from, to }` both ride along a wall this way.
- **Traced outlines are islands.** The traced shapes are a zone (`ZoneSource.region`), a free surface, a pool and a building. While tracing, the snap reference list is the wall nodes plus the grid (`outline=[]`, halls-screen:1952). Other traced outlines' corners are not in it, and neither are the trace's own earlier points. Nothing ties two traces together once drawn.
- **Catalog shapes are islands.** Each `ShapePart` is separate. A free drawing snaps only to its own points plus the grid. Another shape's corner is never a reference. Lines only (`open`) and the `line` shape exist.
- **No snap lands ON a point.** `snapPoint` (lib/studio/snap.ts) aligns x and y separately, within 6 px. A point reaches another corner only when both axes happen to align. The two exceptions are the studio's sail tie (`snapTie`: a candidate's real corner within 14 px, else a wall's line) and the swag end (`snapSwagEnd`).
- **"Follows what it is drawn against" is an established pattern, and this round reuses it:**
  - A face-filling surface or building is a WRITTEN outline plus a recipe, re-laid by `syncFaceSurfaces` in the same history entry (`settleWalls`). Every other reader sees an ordinary outline.
  - A features zone is re-derived on every read (`resolveZone`), and is `detached` when its features are gone.
  - A sail tied to a corner is carried when the corner moves.
  - Curtains and LED strips on walls and sides are re-laid by `syncCurtains`/`syncLeds`.
- **Merging exists, at polygon level:** `unionShapes`/`unionOutline` (lib/studio/stage-draw.ts) and `mergeStages`/`mergeTouching` (lib/design-document/stage.ts).
- **Sub-paths exist only privately.** Bezier splitting is private in shaped-outline.ts (`bezSplit`, `bezWindow`, `cutSeg`) and footprint.ts. Partial versions are `wallSegmentD`, `WallTrack.path(t0, t1)`, `sidePath`, `faceStrokeD` and `splitSide`. **No exported function returns the stretch of a closed outline between two arbitrary points.**
- **The drawing tools disagree on their keys.** The audit is in §7. Three examples: Backspace removes the last point in the stage and rod tools, but not in the /halls trace or the shape editor. /halls offers "הקלידו אורך" but no typed length is reachable there. /halls "עריכת הקווים" snaps to nothing at all.

## 1. The one idea of this round: a JOIN POINT

**Every drawing tool knows the other drawings around it. A point can land exactly on one of them, and the tool remembers which.**

While a point is being placed (a click, a press-drag, or a drag of an existing point), the pointer is pulled onto the nearest **join point** of a **join target**. A join target is another outline on the same canvas. The join points, strongest first:

```
 ■ a corner      ◆ the middle of a side      ● a round shape's quarter points      · anywhere on a side
```

- **DECIDE 1 (priority and reach):** a corner wins over the marks (◆ ●), which win over "on a side". Corners and marks pull from 10 screen px, a side from 6 px (today's alignment reach). Inside those, a join beats the per-axis alignment and the grid. **Alt frees** the point from joins as well as from alignment, so Alt means "put it exactly where the pointer is" in every tool.
- **What you see:** the target's outline lights in accent while the pointer is on it, and the mark under the pointer is drawn (■ ◆ ● or a small dot on the side). Then:
  - The point lands ON it.
  - A hint pill names it ("פינה של ורדה", "אמצע הצלע", "על הצלע").
- **What it records** is a `JoinRef`. It is either `{ to, corner }` or `{ to, side, t }`, where `to` names the target (a node, a wall, a feature, a zone, a catalog shape). The ref is what §2 closes along and what §4 keeps joined.
- **Round shapes:** a circle or ellipse has no corners. Its marks are its four quarter points in its own frame, turned with it. Its "side" is the whole rim, so `t` runs round the rim. The marks are a bowed side's middle and a rounded corner's middle.
- The pure half is **`lib/studio/joins.ts`** (`check:joins`):
  - `JoinTarget` is an id, a kind, a closed or open outline with its curves, and its marks.
  - `snapJoin(raw, targets, reach)` returns `{ p, ref, mark } | null`.
  - `joinPoint(target, ref)` resolves a ref back to a point.
  - `borderBetween(target, a, b, way)` returns the exact stretch of the outline between two refs, curves kept (bezier split, the private `bezSplit`/`bezWindow` lifted out and shared).
- **Canvas speed:** PlanCanvas takes the targets as a LAZY getter, `joinTargets?: () => JoinTarget[]`, read when a gesture starts. This is the `measureTargets` rule. Targets are cached per outline object, so a pan or a drag frame rebuilds nothing (CLAUDE.md, "how it breaks again" items 1, 2 and 4). The marker is drawn in the `topmost` layer from a ref, with no setState per pointermove (§7.3).

### 1.1 What each canvas offers as targets

| Canvas | Targets |
| --- | --- |
| /halls (every tool) | **walled rooms**, each ONE target (DECIDE 17) · wall nodes and walls standing in no room · traced zones · every feature with an outline: surface, pool, building, pergola, stage, bar, other, column plinth. **Not:** plants, seating, curtains, LED, catalog items (DECIDE 2: they are not boundaries anyone extends). |
| Catalog shape editor, תוכנית | every other plan shape of the item, the first one included; **not** a shape with a pin or a repeat, and not a repeat's copies (DECIDE 20) |
| Catalog shape editor, חזית | every other front shape's face, and the floor line |
| Studio stage area tool and "עריכת הבמה" | the walls, every other stage in the sketch, the venue's features as arranged, the zones' boundaries |
| Studio rod / LED / canopy / sail / swag | today's `snapTie` candidates (corners) and walls, plus the marks and "on a side" through the same module. `snapTie` becomes a caller of `snapJoin`, not a second rule. |
| Tape | the same targets as the canvas it is on; an end on a corner measures from the corner exactly |

- **A walled room is one target (DECIDE 17).** Its outline is the face's boundary, so a terrace started on a hall's east wall and ended on its south wall closes round the corner, and the pill can say "פינה של ורדה". A ref INTO a room is stored by what does not move under it: a node id for a corner, `{ wall, t }` on a side. `JoinRef.to` therefore names a node or a wall, and the room is only the grouping that §2's "reaches T again" reads. This is not a join to the zone, so DECIDE 12's "features do not join zones" stands: a feature joined to a hall is joined to its walls.
- **Where several targets share a point (DECIDE 18):** for example a node, the corner of the room it closes, and the corner of a face-filling surface in that room. The target the drawing STARTED on wins. Otherwise the smallest outline wins (the surface over the room). A face-filling surface or building is never a target of its own: it IS its room's outline.

## 2. It closes by itself (answer 3)

**A drawing that started on a target T closes itself when it reaches T again.** The click on any of T's join points finishes it. The closing stretch is T's own border between the two refs, so only the new sides are drawn.

```
 drawn             start on A's corner,        click A's other corner:
 ┌──────┐          draw the new sides          it closes along A by itself
 │  A   │          ┌──────┐┄┄┄┄┐               ┌──────┬────┐
 │      │          │  A   │    ┆               │  A   │ B  │
 └──────┘          └──────┘┄┄┄┄┘ ← click here  └──────┴────┘
```

- **Which way round (DECIDE 3).** The tool takes the stretch that keeps the new piece OUTSIDE T, the side of the border facing the new sides. Before the click, the stretch it will take is previewed dashed in accent along T. **Tab flips it** (the curtain's side flip), for the rare drawing that is meant to wrap round T.
- **Two targets, a bridge (answer 7's example).** A drawing may touch a second target B on the way. Two clicks in a row on the same target follow its border between them, the way that does not enter it (DECIDE 4). Where that border is straight, the side is straight. A chord straight across B would cut into B, which DECIDE 5 refuses, so there is no modifier for one.

```
 ( A )        ( B )      p1 on A → q1 on B → q2 on B (follows B's near rim)
    p1 ┄┄┄┄┄┄ q1          → p2 on A (closes along A's near rim)
    p2 ┄┄┄┄┄┄ q2
```

- **A drawing never enters what it joins (DECIDE 5).** A close whose new sides cross a target it is joined to is refused, with a hint, as a self-crossing close is today. This is also why §3's "grow" needs no general polygon union.
- An **open** drawing (a lines-only shape, a rod, a wall run) has no area to close. Its ends may still land on join points, and those stay joined (§4). For walls, closing is already done by face detection: a run ending on an existing node encloses a room through the walls already there.

## 3. What the closed drawing becomes: choose at the finish (answer 2)

Two answers, offered once the drawing touched a target:

- **NEW**: a separate area or shape, joined to the others (§4).
- **GROW** (in the shape editor, **איחוד**): one outline. The target and the new piece become one. A bridge between A and B makes A, the bridge and B into one.

**Grow is exact splicing, not a polygon union.** The new piece shares only border stretches with what it grows (§2 refuses anything else). So the grown outline is A's border with the shared stretch cut out and the new sides put in, keeping curves (the cut is a bezier split at the join points). A circle grown this way becomes a hand-drawn outline: its ⌀ field goes, and resizing still scales it.

Where the choice is asked, per space:

| Space | The choice | Default |
| --- | --- | --- |
| /halls trace (zone, surface, pool, building) | The draft bar that already asks after a trace closes (name · "משטח בלבד" · "מבנה") gains **"הרחבה של <A>"**. Joined to two targets of the same kind: **"איחוד של A ו־B"**. | new (DECIDE 6) |
| /halls walls (W) | A run that encloses a room beside a named room: the existing "name it" draft gains **"הרחבה של <A>"**, which REMOVES the walls of the shared stretch so the two faces become one. The bar lists what goes with them ("2 דלתות על הקיר יוסרו"). **The shared stretch is always whole walls, node to node** (DECIDE 19). A run that started or ended in a wall's middle split that wall there (§5). Removing the shared walls removes exactly the stretch the new room touches, and their lineage goes with them, so a drape that hung there resolves to nothing, as when a wall is deleted. /halls cannot see the events' drapes, so the bar names the walls that go ("קירות שיוסרו: 2") along with the doors. | new |
| Catalog shape editor | The drawing bar shows **"צורה חדשה · איחוד"** as soon as the drawing touches another shape, and it may be switched until the close. "סיום כקווים" stays, for lines only. | **איחוד when the drawing bridges two shapes** (Ravid's two-circle table or pool), new when it touches one (DECIDE 7) |
| Studio stage area tool | **"במה חדשה · הרחבת הבמה"**. Grow is the existing `mergeStages` (levels kept by height, items re-homed). New is a separate stage flush against it. | new |

- **What grow keeps (DECIDE 8).** The grown thing is the target the drawing STARTED on: its id, name, kind, material, zone settings and everything placed against it. A second target joined in must be of the SAME kind (zone with zone, pool with pool, surface with surface, shape with shape). It is merged in and removed, and the bar names it before the click ("ביאנקו יימחק ויצורף"). With targets of different kinds, grow is not offered.
- **What merging B in does to what points at B (DECIDE 21).** Merging B in is exactly DELETING B as /halls deletes it today, with the same consequences. Nothing is rewritten onto A, and nothing is written into anyone's events: no sketch is reachable from /halls, and some belong to other studios.
  - **Features and walls:** every sketch already tolerates a venue feature or wall going away. A cover detaches, a rail on a gone wall resolves to nothing, and a removed or moved feature's row is ignored. The bar names what goes, as the delete question does.
  - **A zone that any event uses** cannot be deleted (`event_zones.zone_id` is `restrict`), so it cannot be merged in either. The draft offers no "איחוד של A ו־B" and says why ("ביאנקו משויך ל־3 אירועים").
- **A walled room grows only in the walls tool (DECIDE 9).** A traced outline is not walls. Growing a hall by tracing would have to either cut the hall loose from its walls or invent walls the designer did not draw. The trace tool offers "הרחבה" for traced outlines only: zones, free surfaces, pools, free buildings. A face-filling surface or building grows by itself when its face grows.
- **The grow in the shape editor** writes one shape in place of the shapes joined. Its list position, colours, texture and height are those of the shape started on. If that is the first shape, the result is the base (`lookOf`'s rule).

## 4. Staying joined (answers 5 and 8)

**DECIDE 10: a NEW drawing stays joined.**
- Its joined points and the stretches it follows are stored as a RECIPE beside its outline. The recipe is re-laid whenever what it is joined to changes, the same way face surfaces, curtains and sail ties already work.
- Moving, resizing, turning or reshaping A carries B's joined points (by their refs) and re-follows the shared stretch. B's own drawn points stay where they are.
- Answer 8 asked this for the shape editor. The same rule everywhere is answer 9.

The rules:

- **Written, then read.** The resolved outline is WRITTEN where outlines already live (`StructureFeature.outline` via `asOutline`, a part's `outline`, a zone's `boundary`). Every reader (canvas, print, clearance, 3D, the quote) is unchanged. Only the settle pass and the outline editor read the recipe.
- **Direction.** A join points from the newer drawing to the older one, and the older never knows. A drawing never offers as a target anything joined to it, directly or through a chain, so there are no cycles. Chains resolve oldest first.
- **Detach.** "ניתוק" on the drawing's bar keeps the current outline and drops the recipe, like "ניתוק מהקירות". If a target is deleted, the drawing keeps where it is, detached, and says so in its bar (the features zone's `detached` pattern).
- **A joined drawing does not move as a whole (DECIDE 22).** It takes no body drag, nudge, turn, resize grip, flip, align or group carry. It moves when what it is joined to moves. This follows the precedent of a face-filling surface (`followsWalls`) and a covered rug: both are locked to what they follow until "ניתוק". Selected together with its targets and dragged, it follows them, and nothing else is needed. Its own free points are still edited in "עריכת הקווים". One guard, `joinedOf(x)`, sits beside `followsWalls` in each move path, on all three canvases.
- **Editing a joined outline** in "עריכת הקווים":
  - Its own points move as before.
  - A joined point slides along its target, like a sail's tie on a wall. Alt pulls it free, which detaches that one point.
  - A followed stretch has no grips: it is the other drawing's border, reshaped by editing that drawing.
- **Refs survive the target's edits.**
  - A ref by corner index is re-indexed when the target gains or loses points (`sideIndicesAfterInsert`-style maps, done where the target's editor makes the change).
  - Every ref also keeps the point it last resolved to. If its index is gone, it resolves to the nearest point of the target's border to that point (DECIDE 11).

Where the recipe lives and who re-lays it:

| Drawing | Recipe on | Joins | Re-laid by |
| --- | --- | --- | --- |
| /halls feature (surface, pool, building, other) | `StructureFeature.join?` | walls, nodes, other features | `syncJoins` inside `settleWalls`, in the same history entry, after `syncFaceSurfaces` |
| /halls traced zone | `ZoneSource.region.join?` | walls, nodes, features, other zones | `resolveZone`, on every read (it gets the structure as well as faces and features) |
| Catalog shape | `ShapePart.join?` | other shapes of the item | the editor, on every shape edit, before `lookOf` writes |
| A split wall's old id | `VenueStructure.wallLineage?` | the walls in its place | `wallTrack`, on every read (§5) |

- **DECIDE 12: a /halls feature joins walls and features, not zones.** Features are re-laid inside structure edits; zones are saved apart and resolved on read. A feature drawn from a zone's corner still LANDS on it (§1), but is not kept there. A zone may join anything.
- **DECIDE 13: on the plan, a catalog item is scaled whole, which keeps every join.** An affine stretch maps a point on a circle's rim to the same point on the stretched ellipse's rim, and a line to a line. Nothing about joins reaches `sizedShapes`.
- **DECIDE 20: neither end of a catalog join may have a pin or a repeat**, and a repeat's copies are not targets. Pins and repeats move a shape on their own terms, and copies come and go with the size. A shape that is joined, or joined to, offers no עיגון/חזרה. Setting one on either end detaches the join.
- **The first shape needs a stable id.** `shapesOf` mints a fresh UUID for the base each time the editor opens, so a ref to it would not survive a reopen. The base gets a stored id (`MapAppearance.baseId?`, written on the first save that needs it).
- **Stages are not kept joined** (DECIDE 14). A sketch's stages already have their own rules for standing together (`besideNeighbours`, Ctrl+G merges touching ones).

## 5. A point in the middle of a wall: a real split (answer 6; Ravid, 2026-11-20: *"an option to add a middle point, or separate a wall by adding another point — good for shapes also"*)

**DECIDE 15: adding a point to a wall SPLITS it into two walls. The old wall's id lives on as a LINEAGE, so nothing that hung on it moves.**

- **The verbs:**
  - Double-click a wall adds a point where you clicked. This is the stage outline's gesture, and §6 makes it the gesture everywhere.
  - The wall bar has **"הוספת נקודה באמצע"** (the catalog's button).
  - A wall run started or ended on "· on a side" of a wall splits it there and runs from the new node. That is the T-junction, so the room closes through ordinary faces and `detectFaces` is unchanged.
- **The two halves:** the new node stands where the point was put, on the bow if the wall is bowed. Each half is an ordinary wall with its own id:
  - It inherits the wall's `kind` and `heightMm`.
  - A bowed wall's curve is cut by de Casteljau, using geometry.ts's private `splitCubic`, exported. The two halves draw exactly the curve that was there.
  - From then on each half is its own wall: its own height, its own kind, bowed on its own. Dragging the new point bends the wall there. That is what "separate a wall" is for.
- **Why a lineage, not a rewrite.** Every event's drapes and rails on that wall hold its id and fractions (`WallRail { wallId, from, to }`, sail ties `{ kind: "wall", wallId, t }`), and so do the venue's own curtains and LED. The sketches cannot be reached from /halls, and some belong to other studios.
  - So the split writes **`VenueStructure.wallLineage?: { id: string; chain: string[] }[]`**: the old id, and the walls now standing in its place from its node a to its node b.
  - **`wallTrack(structure, id)`** (lib/studio/anchor.ts, the one seam every wall reader already goes through) resolves an id it does not find through the lineage. The result is a CHAIN track along those walls, measured by arc length, with the same `at`/`nearestT`/`path`/`lengthMm`.
  - A drape on the old wall therefore stays exactly where it was. If the new point is later dragged out, the drape follows the bend, as it follows a bow today. A chain whose pieces are gone resolves to nothing, exactly as a deleted wall does today.
  - Readers that look a wall up by id without `wallTrack` are routed through it in step 1. The plan lists them; rail.ts, measure.ts and envelope.ts are the main ones.
- **Doors and windows are rewritten, not traced.** They are the venue's own and measured from node a. Each goes to the half its middle stands on, with its distance re-measured. **A point inside a door's or window's opening is refused**, with a hint ("הנקודה בתוך פתח הדלת").
- **Removing the point joins the walls back (DECIDE 24).** Double-click a node, or Delete it, where exactly two walls meet. It becomes one wall again.
  - If those two walls are a lineage's whole chain, the ORIGINAL id comes back and the lineage entry is dropped. Split and unsplit leaves the venue exactly as it was.
  - Otherwise it is a new wall with a lineage of its own: two old ids, one wall, `chain` length one.
  - A node with doors close to it, or bows the straight join cannot carry, is joined as a straight wall, and the bar says so.
- **Dragging an existing node joins it too (DECIDE 23):**
  - A node dropped on another node MERGES into it: one node, with every wall of both. A wall that would collapse to zero length goes.
  - A node dropped on a wall's middle SPLITS the wall there and merges into the new node.
  - Alt drops it free, which is today's behaviour.

  Only landing a node on the other one, without merging, would leave two coincident unconnected nodes, and the room would silently fail to close. Drawing and dragging keep one promise: a shared point is a connected one.

### 5.1 Adding a point to any outline: one gesture

Shapes already have this three different ways: the catalog's "הוספת נקודה באמצע הצלע" button, the stage outline's double-click, and /halls "עריכת הקווים" pressing and dragging a side. After this round, every outline the designer edits point by point works the same way: walls, a traced zone, a surface, a pool, a building, a stage, a catalog shape (plan and חזית).

- **Double-click a side** adds a point where you clicked.
- **"הוספת נקודה באמצע"** on the selected side's bar adds one at its middle (the bow's middle on a bowed side).
- **Double-click a point, or Delete it,** removes it, down to three points on a closed outline and two on an open one.
- /halls keeps its press-drag insert as well (DECIDE 25). The catalog and the stage use a press-drag on a side to PUSH the side, and changing either would undo a gesture somebody uses.

## 6. One way to draw, everywhere (answer 9)

§1–§4 are the same in every tool by construction: one module, one marker, one close rule, one finish choice. The tools' KEYS differ, mostly by accident. This is the contract every point-by-point tool follows after this round:

| Action | The contract | Tools that differ today (audit §7) |
| --- | --- | --- |
| Add a point | click (press-drag where the tool draws by dragging: the swag) | — |
| Land on another drawing | §1, everywhere, including while dragging an existing point | all but sail/swag; "עריכת הקווים" (/halls) and the stage grips snap to nothing at all |
| Typed length | digits → a cm box at the pointer, Enter lays it; Tab → the angle | /halls walls and trace: the box is unreachable (`outline.length > 0` guard) though the hint offers it; stage: no angle |
| Add a point to a side | double-click the side; "הוספת נקודה באמצע" on the side's bar (§5.1); on a wall it splits it (§5) | walls: none; catalog: button only; stage: double-click only; /halls outline: press-drag only |
| Remove a point | double-click it, or Delete; down to 3 points (2 on an open line); on a wall node between two walls it joins them back | catalog: Delete only |
| Remove the last point | **Backspace**, and Ctrl+Z while the drawing is still open | /halls trace: neither; shape editor: Ctrl+Z only (`removeLastVertex` unused); /halls walls: Ctrl+Z undoes the wall but keeps the run going from the gone node |
| Close an area | click on the first point (16 px, everywhere), double-click, or Enter with ≥3 points; a self-crossing close is refused with a hint | stage: 10 px; /halls trace: no double-click, no self-crossing check, no minimum |
| End an open line | Enter or double-click; the shape editor keeps its "סיום כקווים/כקו" | — |
| Escape | the typed digits first, then the drawing in progress, then the tool | /halls trace and the shape editor drop the whole drawing on the first press |
| Alt | frees the point: no join, no alignment, and the space's angle rule inverted | consistent |

- **Each space keeps its angle rule (DECIDE 16).** Every one was asked for:
  - /halls traces with 5° steps on and Alt freeing.
  - The shape editor draws where the pointer is, with Alt holding 45° from the first side (2026-11-01).
  - The stage tool keeps the room's 45° grid plus the wall frame (2026-10-31).
  - Rods keep the stage tool's rule.

  "Aligned" here means the same keys, the same snapping onto other drawings, and the same close. It does not mean one angle rule. That would undo three of Ravid's own calls.

## 7. The audit (2026-11-20, read from the code)

### 7.1 What each tool does today

| # | Tool | Snaps to while drawing | Typed length | Close / end | Last point · Esc | Dragging a point |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | /halls walls (W) | wall nodes (per axis) + grid; lock on, 5° from the page | unreachable | Enter ends; an existing node closes a room | Ctrl+Z undoes the wall, the run stays · Esc ends the run | nodes: other nodes' x/y + grid; never merged |
| 2 | /halls trace (zone, surface, pool) | wall nodes + grid; NOT its own points; lock on, 5° | unreachable | first point (16 px) or Enter ≥3; no checks | none · Esc drops it all | → row 3 |
| 3 | /halls "עריכת הקווים" | — | bow / radius in the bar | — | dbl-click or Delete removes a point · Esc unpicks, then ends | **no snap at all**, raw to the mm |
| 4 | /halls rod / LED free | 45° room grid + first side, 10 cm lengths; no references | cm + Enter | LED ends at 2; rod Enter / dbl-click | Backspace · Esc digits, then cancel | — |
| 5 | Studio stage area | 1st corner `ctx.snap` (nodes, item boxes, grid); then 45° grid + wall frame, deck lengths, `clipToWalls` | cm + Enter, no angle | first corner (10 px), dbl-click, Enter; `squareUp`; self-crossing refused | Backspace · Esc digits, then cancel | `OutlineHandles`: deck lengths, typed pills, refusals; **no alignment** |
| 6 | Studio rod / canopy / sail / swag | rod and canopy as row 4; sail `snapTie` (real corners 14 px, then walls); swag `snapSwagEnd` | rod, canopy | canopy first point (16 px) / Enter / dbl-click; sail at 4, swag at 2 | as row 4 | ties and ends as drawn; a rod post is raw |
| 7 | Catalog plan shape | its own points + grid only; lock off, Alt = 45° from the first side | cm + Tab angle | first point (16 px), dbl-click, Enter ≥3; "סיום כקווים" | Ctrl+Z per point, Backspace unbound · Esc drops it | own points + grid |
| 8 | Catalog חזית | as row 7 (the floor line is not a reference) | as row 7 | as row 7; a 2-point line refused | as row 7 | as row 7 |
| 9 | Tape | outline, nodes, fixtures, grid; studio items' outlines | — | — | — | — |

### 7.2 Answers to the three checks

- Landing exactly on another outline's corner works only for wall nodes in the walls tool and for sail and swag ends.
- Nothing splits a wall or makes a T.
- No exported "stretch between two points" exists.

### 7.3 Canvas-speed rules this round must keep

The marker and the target highlight are drawn from the ref the snap returned, painted by ref or once per animation frame. A target's outline and marks are cached per object. `joinTargets` is a getter read at gesture start. None of this may re-render PlanCanvas or a host layer per pointermove.

## 8. Data model, in one place

| Field | On | Store | Read by |
| --- | --- | --- | --- |
| `JoinRef` (`{ to, corner }` / `{ to, side, t }` + the last point) | — | — | lib/studio/joins.ts |
| `StructureFeature.join?` (own points, joined points' refs, followed stretches) | structure | JSONB | `syncJoins`, the outline editor |
| `ZoneSource.region.join?` | zones.source | JSONB | `resolveZone`, the outline editor |
| `ShapePart.join?` (and the base's, through `MapAppearance`) | appearance | JSONB | the shape editor only |
| `VenueStructure.wallLineage?` (`{ id, chain }[]`, an old wall id → the walls standing in its place) | structure | JSONB | `wallTrack` (a chain track), the unsplit join |
| `MapAppearance.baseId?` (the first shape's stable id) | appearance | JSONB | `shapesOf`, catalog joins |

**No migration.** Every field is inside existing JSONB, and an absent field is today's drawing. `check:costs` is unaffected. Nothing here reaches a client surface beyond the outlines it already sees.

## 9. Checks

- **New: `check:joins`:**
  - corner, mark and side priority
  - the quarter points of a turned ellipse
  - `borderBetween` both ways round a rounded, bowed outline (the stretch's length equals the outline's length between the two refs, within 0.1%)
  - the close picks the outside stretch, and Tab flips it
  - a crossing close is refused
  - a two-circle bridge closes into one outline when grown, and its area equals A + B + the bridge
  - a ref survives an inserted point and a removed one
- **Extended:**
  - **New: `check:wall-split`:**
    - a bowed wall split at t draws the same curve as before (sampled, within 0.5 mm)
    - a door goes to the half its middle stands on, at the same world position; a point inside an opening is refused
    - `wallTrack` of the old id is a chain track: a `WallRail { from: 0.2, to: 0.8 }` resolves to the same path before and after the split, and bends with the new point when it is dragged
    - unsplitting a lineage's whole chain gives back the original id and drops the entry
    - a run started mid-wall closes a room through ordinary faces
    - a node dropped on a node merges and a zero-length wall goes
  - `check:face-surfaces`: `syncJoins` re-lays a surface joined to a pool after the pool moves, in one entry.
  - the zone resolver's check: a joined zone follows a moved feature, and is `detached` when it is deleted.
  - `check:shape-list`: a joined part follows a resized circle, and `lookOf` round-trips the recipe.
  - `check:stage`: the stage tool's grow equals `mergeStages`.

## 10. Build order

Each step stands on its own. Each ends with `npm run typecheck`, its checks, and a headless look on a throwaway studio's own venue (never אמרה, which is another studio's).

1. **Join points everywhere** (§1, §6's "land on another drawing"):
   - `lib/studio/joins.ts`, PlanCanvas `joinTargets` + the marker, every tool's targets (§1.1), `snapTie` over `snapJoin`
   - the wall split with its lineage, and every wall-by-id reader routed through `wallTrack` (§5)
   - "add a point" as one gesture on every outline (§5.1)

   Nothing new is stored except the lineage. **After step 1:** every tool can land exactly on any point or side of any other drawing; a wall can be split, bent at the new point, and joined back; a wall can start mid-wall; and every outline adds a point the same way.
2. **The key contract** (§6): Backspace, Ctrl+Z, the typed box on /halls, double-click and the self-crossing refusal on the trace, the Escape order, the 16 px close. Small, and independent of the rest.
3. **It closes by itself + the finish choice** (§2, §3): the close rule, the preview and Tab, then grow by splicing in the four places of §3's table. Results are plain outlines, nothing joined yet. **After step 3:** a terrace is drawn off a hall in three clicks, and a two-circle table is one shape.
4. **Staying joined** (§4): the shape editor first (answer 8, and the smallest store), then /halls features (`syncJoins`), then zones (`resolveZone`). "ניתוק" and the sliding joined point in "עריכת הקווים" come in the same step.

## 11. Not in this round

- **Cutting an area in two** by drawing across it, from one border point to another. It is the same join points, used as a knife. Later.
- **A general boolean union** of overlapping outlines. Joined drawings never overlap (DECIDE 5), so splicing suffices.
- **Joins across canvases** (a catalog shape to a venue feature), and joins on sketch items or stages.
- **One angle rule for every space** (DECIDE 16).

## 12. DECIDEs: the answers this document assumes

1. A corner wins over the marks (the middle of a side, quarter points), which win over "on a side". Corners and marks pull from 10 px, a side from 6 px. Alt frees the point from joins too.
2. /halls targets are the boundaries: walls, zones, surfaces, pools, buildings, pergolas, stages, bars, "other", column plinths. Not plants, seating, curtains, LED or catalog items.
3. The close takes the stretch that keeps the new piece outside the target. Tab flips it.
4. Two clicks in a row on one target follow its border. There is no straight chord across a target.
5. A drawing never enters what it joins, so a crossing close is refused.
6. /halls defaults to NEW; the draft bar offers "הרחבה של <A>".
7. (Answer 7, IDK) In the shape editor, a drawing that bridges two shapes defaults to **איחוד** (one shape: the table or pool of two circles). Touching one shape defaults to a new shape. Lines only stays "סיום כקווים", with its ends joined.
8. Grow keeps the target started on. A second target of the same kind is merged in and removed, named in the bar first. With targets of different kinds, grow is not offered.
9. A walled room grows only in the walls tool, by removing the shared walls (doors on them listed). The trace tool grows traced outlines only.
10. (Answer 5, IDK) A new drawing stays joined: a stored recipe beside a written outline, re-laid when its target changes, with "ניתוק". It is built last (step 4), so steps 1–3 stand without it.
11. A ref keeps its last point, and falls back to the nearest point of the target's border when its index is gone.
12. A /halls feature joins walls and features. A zone joins anything. A feature drawn on a zone's corner lands there but is not kept there.
13. On the plan, a catalog item is scaled whole, which keeps joins. A joined shape offers no pin or repeat; setting one detaches it.
14. Stages are not kept joined; growing a stage is `mergeStages`.
15. (Ravid's ask, replacing the pinned node of v0.1) Adding a point to a wall SPLITS it into two real walls. The old id lives on as a lineage that `wallTrack` resolves to a chain track, so every sketch's drapes, ties and the venue's curtains stay where they were. Doors are rewritten onto their half, and a point inside an opening is refused.
16. Each space keeps its own angle rule. "Aligned" means the same keys, join points and close.
17. A walled room is ONE join target (its face). Its refs are stored as node ids and `{ wall, t }`.
18. Where targets share a point, the one started on wins, else the smallest outline. A face-filling surface is its room's outline, not a target of its own.
19. Growing a walled room removes the shared walls node to node. That is always whole walls, because a run started mid-wall split it.
20. Neither end of a catalog join may have a pin or a repeat, and copies are not targets. The first shape gets a stored id.
21. Merging B in is deleting B, with today's consequences. A zone any event uses cannot be merged in.
22. A joined drawing does not move as a whole until "ניתוק". It moves with what it is joined to.
23. A dragged wall node dropped on a node merges into it, and dropped on a wall's middle splits the wall and merges into the new node. Alt keeps it free.
24. Removing a node between exactly two walls joins them back into one. A lineage's whole chain gets its original id back.
25. "Add a point" is a double-click on a side, plus "הוספת נקודה באמצע" on the side's bar, on every outline. /halls keeps its press-drag insert, and the catalog and the stage keep press-drag as "push the side".
