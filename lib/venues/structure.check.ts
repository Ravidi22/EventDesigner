// npm run check:structure — the self-check of ./structure.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import { footprintBounds, type Footprint } from "@/lib/studio/footprint";
import { absoluteControlPoints, bulgeToCurve, cubicPointAt, setBulgeDepth, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";
import { addEntrance, addFeature, bulgeWall, canRestack, doorDistanceFrom, doorOffsets, doorsOf, DUPLICATE_OFFSET_MM, duplicateFeatures, emptyStructure, featureEdgeItems, featureFootprint, featureMovable, featureStage, isDoor, isVitrine, isWindow, moveWallControlPoint, nearestWall, newFeature, newFeatureFromProduct, openingsOn, removeEntrance, removeFeature, removeNode, removeWall, restackFeatures, setWallAngle, setWallBulge, setWallHeight, setWallLength, updateEntrance, updateFeature, wallBulgeMm, wallPoints, WINDOW_HEAD_MM, WINDOW_SILL_MM, windowHeights, type VenueStructure } from "./structure";

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/structure.ts
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const at = (s: VenueStructure, id: string) => s.nodes.find((n) => n.id === id)!;

// Two rooms sharing the wall n2→n3, the case the whole graph model exists for:
//   n1───n2───n5
//    │    │    │
//   n4───n3───n6
const base: VenueStructure = {
  nodes: [
    { id: "n1", x: 0, y: 0 },
    { id: "n2", x: 5000, y: 0 },
    { id: "n3", x: 5000, y: 4000 },
    { id: "n4", x: 0, y: 4000 },
    { id: "n5", x: 9000, y: 0 },
    { id: "n6", x: 9000, y: 4000 },
  ],
  walls: [
    { id: "w-top-a", a: "n1", b: "n2", kind: "wall" },
    { id: "w-shared", a: "n2", b: "n3", kind: "wall" },
    { id: "w-bot-a", a: "n3", b: "n4", kind: "wall" },
    { id: "w-left", a: "n4", b: "n1", kind: "wall" },
    { id: "w-top-b", a: "n2", b: "n5", kind: "wall" },
    { id: "w-right", a: "n5", b: "n6", kind: "wall" },
    { id: "w-bot-b", a: "n6", b: "n3", kind: "wall" },
  ],
  entrances: [],
  features: [],
};

// --- setWallLength on a shared wall -----------------------------------------------------------
// Lengthening the shared wall drags node n3 with it. The neighbouring walls that also end at n3
// must still end at n3 — if a "wall length" edit ever detached one, a gap would open between two
// rooms that are physically joined, which is exactly the bug the graph exists to prevent.
const stretched = setWallLength(base, "w-shared", 6000);
assert(at(stretched, "n3").y === 6000, "setting a wall's length moves its far node along the wall's own direction");
assert(at(stretched, "n2").y === 0, "…and leaves the near node alone");
for (const id of ["w-bot-a", "w-bot-b"]) {
  const w = stretched.walls.find((x) => x.id === id)!;
  const pts = wallPoints(stretched, w)!;
  const touches = (pts.a.x === 5000 && pts.a.y === 6000) || (pts.b.x === 5000 && pts.b.y === 6000);
  assert(touches, `${id} still meets the moved corner — no gap opened between the two rooms`);
}
assert(stretched.nodes.length === base.nodes.length, "no corner was duplicated by the edit");

// --- setWallAngle -----------------------------------------------------------------------------
const turned = setWallAngle(base, "w-shared", 45);
const tp = wallPoints(turned, turned.walls.find((w) => w.id === "w-shared")!)!;
// Within a millimetre, not exactly: corners are stored as whole millimetres (as everything the
// snapper emits is), and rounding x and y independently costs a fraction of the Euclidean length.
// The guarantee is "the wall did not change size", not a bit-exact float.
assert(Math.abs(wallLengthMm(tp.a, tp.b) - 4000) < 1, "re-aiming a wall keeps its length");
assert(Math.round(wallAngleDeg(tp.a, tp.b)) === 45, "…at exactly the angle asked for");

// --- setWallHeight ----------------------------------------------------------------------------
// A typed height is stored in whole millimetres on that wall alone; cleared (or 0, or nonsense) the
// key is GONE, so the wall reads exactly as one never typed — the derived height comes back.
{
  const typed = setWallHeight(base, "w-shared", 1200.4);
  assert(typed.walls.find((w) => w.id === "w-shared")!.heightMm === 1200, "a typed wall height is stored, in whole millimetres");
  assert(typed.walls.filter((w) => w.heightMm !== undefined).length === 1, "…on that wall alone — never the room's other walls");
  assert(!("heightMm" in base.walls.find((w) => w.id === "w-shared")!), "…without touching the structure it was given");
  for (const cleared of [undefined, 0, -5, NaN]) {
    const back = setWallHeight(typed, "w-shared", cleared).walls.find((w) => w.id === "w-shared")!;
    assert(!("heightMm" in back), `clearing the height (${cleared}) drops the key — the wall is derived again`);
  }
  assert(setWallHeight(typed, "w-shared", 1200) === typed, "the same height again is no edit");
  assert(setWallHeight(base, "no-such-wall", 1200) === base, "an unknown wall id is a no-op");
  assert(setWallLength(typed, "w-shared", 6000).walls.find((w) => w.id === "w-shared")!.heightMm === 1200, "a wall keeps its height through a change of length");
}

// A length of zero is not an edit, it's a request to collapse a wall into nothing — refused.
assert(setWallLength(base, "w-shared", 0) === base, "a zero length is rejected rather than collapsing the wall");
assert(setWallLength(base, "no-such-wall", 3000) === base, "an unknown wall id is a no-op");

// --- nearestWall ------------------------------------------------------------------------------
const near = nearestWall(base, { x: 4900, y: 1000 })!;
assert(near.wallId === "w-shared", "a point beside the shared wall finds that wall, not the far ones");
assert(near.distanceMm === 1000, "…and reports how far along its chord the point projects");
// Past either end of a segment the projection clamps, rather than reporting a door hanging off
// the end of the wall it is supposedly on. Checked on a lone wall so there is no second candidate
// at the same distance to make the answer ambiguous.
const oneWall: VenueStructure = {
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 4000, y: 0 },
  ],
  walls: [{ id: "w", a: "a", b: "b", kind: "wall" }],
  entrances: [],
  features: [],
};
assert(nearestWall(oneWall, { x: -5000, y: 100 })!.distanceMm === 0, "a point beyond the start clamps to the start, never to a negative distance");
assert(nearestWall(oneWall, { x: 9000, y: 100 })!.distanceMm === 4000, "a point beyond the end clamps to the end, never past it");
assert(nearestWall(emptyStructure(), { x: 0, y: 0 }) === null, "with no walls there is nothing to hang a door on");

// A bowed wall: the nearest point is wherever the wall actually bends to, not on the straight
// chord it bows away from — the bug that put a newly-hung door somewhere the designer never
// clicked (see doorGeometry's own curve handling in geometry.ts, fixed alongside this).
const bowCurve = bulgeToCurve({ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 2000, y: 800 });
const bowedWall: VenueStructure = {
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 4000, y: 0 },
  ],
  walls: [{ id: "w", a: "a", b: "b", kind: "wall", curve: bowCurve }],
  entrances: [],
  features: [],
};
const nearBowed = nearestWall(bowedWall, { x: 2000, y: 800 })!;
const { c1: bc1, c2: bc2 } = absoluteControlPoints({ x: 0, y: 0 }, { x: 4000, y: 0 }, bowCurve);
const onCurve = cubicPointAt({ x: 0, y: 0 }, bc1, bc2, { x: 4000, y: 0 }, nearBowed.distanceMm / 4000);
assert(
  Math.hypot(onCurve.x - 2000, onCurve.y - 800) < 50,
  "a click on a bowed wall's curve lands within 5cm of it, not on the straight chord ~800mm away",
);

// --- doors and features -----------------------------------------------------------------------
const { structure: withDoor, entranceId } = addEntrance(base, {
  wallId: "w-shared",
  distanceMm: 2000,
  widthMm: 1600,
  swingInward: true,
  doubleDoor: true,
});
assert(withDoor.entrances.length === 1 && base.entrances.length === 0, "adding a door does not mutate the input");
const widened = updateEntrance(withDoor, entranceId, { widthMm: 900 });
assert(widened.entrances[0].widthMm === 900 && widened.entrances[0].distanceMm === 2000, "a patch touches only the fields it names");
assert(removeWall(withDoor, "w-shared").entrances.length === 0, "deleting a wall takes its doors with it");
assert(removeNode(withDoor, "n3").entrances.length === 0, "deleting a corner takes the doors on every wall it killed");
assert(removeEntrance(withDoor, entranceId).entrances.length === 0, "a door can also be removed on its own");

// Measured from either corner: a 1.6m door whose middle is 2m from node a on a 4m wall.
{
  const door = { distanceMm: 2000, widthMm: 1600 };
  assert(JSON.stringify(doorOffsets(door, 4000)) === JSON.stringify({ toEdgeMm: 1200, toCentreMm: 2000, farEdgeMm: 1200 }), "from node a: 1.20 to the opening, 2.00 to its middle");
  const offB = doorOffsets({ distanceMm: 1000, widthMm: 1000, measureFrom: "b" }, 4000);
  assert(offB.toEdgeMm === 2500 && offB.toCentreMm === 3000 && offB.farEdgeMm === 500, "from node b, the same door reads from the other corner");
  assert(doorDistanceFrom({ widthMm: 1000, measureFrom: "b" }, 4000, 3000) === 1000, "a distance typed from node b is stored from node a");
  assert(doorDistanceFrom({ widthMm: 1000 }, 4000, 100) === 500, "an opening is never pushed past its wall's end");
}

const { structure: withPool, featureId } = addFeature(base, newFeature("pool", { x: 2500, y: 2000 }));
assert(withPool.features[0].shape === "ellipse" && withPool.features[0].heightMm === 0, "a pool starts as a flat ellipse");
assert(updateFeature(withPool, featureId, { x: 3000 }).features[0].y === 2000, "moving a feature in x leaves y alone");
assert(removeFeature(withPool, featureId).features.length === 0, "a feature can be removed");

// --- placed from the catalog -----------------------------------------------------------------
// The whole point of widening `shape`: a ח bar picked off the catalog has to REACH the plan as a
// ח. Placed as a rectangle it would be the same picture as a solid 3.6×1.8m block of bar, which
// is not where the staff stand.
const uBar: Product = {
  id: "p-bar",
  name: "בר בצורת ח 360×180",
  category: "bars",
  layer: "floor",
  dimensions: { widthMm: 3600, depthMm: 1800, heightMm: 1100 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  appearance: { shape: "u-shape", content: "none" },
};
const placed = newFeatureFromProduct("bar", uBar, { x: 1000.4, y: 2000.6 });
assert(placed.shape === "u-shape", "a ח bar lands on the plan as a ח");
assert(placed.label === "בר בצורת ח 360×180", "…under the catalog row's own name");
assert(placed.widthMm === 3600 && placed.depthMm === 1800 && placed.heightMm === 1100, "…at the row's own three measurements");
assert(placed.x === 1000 && placed.y === 2001, "…snapped to whole millimetres like everything else the plan stores");
const bounds = footprintBounds(featureFootprint(placed));
assert(bounds.w === 3600 && bounds.h === 1800, "the drawn ח measures what the inspector says it does");

// The counter is a depth of its own: an unmeasured ח writes down the 40cm it is drawn at the first
// time it is resized, a measured one keeps its number, and the catalog's number comes across.
{
  const { structure: one, featureId } = addFeature(base, { ...placed, widthMm: 9000, depthMm: 1200 });
  const stretched = updateFeature(one, featureId, { depthMm: 2400 }).features.find((f) => f.id === featureId)!;
  assert(stretched.ring?.bandMm === 400, `stretching an unmeasured ח keeps the counter it was drawn with (${stretched.ring?.bandMm})`);
  const typed = updateFeature(one, featureId, { ring: { bandMm: 600 } });
  assert(updateFeature(typed, featureId, { widthMm: 6000 }).features.find((f) => f.id === featureId)!.ring?.bandMm === 600, "…and a typed counter survives a resize");
  const rect = updateFeature(one, featureId, { shape: "rect", widthMm: 3000 }).features.find((f) => f.id === featureId)!;
  assert(!rect.ring, "a ח turned into a rectangle gains no counter");
  const fromRow = newFeatureFromProduct("bar", { ...uBar, appearance: { shape: "u-shape", content: "none", ring: { bandMm: 600 } } }, { x: 0, y: 0 });
  assert(fromRow.ring?.bandMm === 600, "a ח bar placed from the catalog brings its counter depth");
}

// A round product's diameter becomes the feature's width, which is the one number the circle
// renderer and the radius handle both read.
const roundBar = newFeatureFromProduct("bar", { ...uBar, id: "p-round", dimensions: { diameterMm: 1500, heightMm: 1100 }, appearance: undefined }, { x: 0, y: 0 });
assert(roundBar.shape === "circle" && roundBar.widthMm === 1500 && roundBar.depthMm === 1500, "a round bar is as wide as it is across");
assert(featureFootprint(roundBar).kind === "circle", "…and draws as a circle of that width");

// A pergola (./pergola.ts): a new one is 4 × 4 × 2.6 on 15cm posts with slats, fixed in a sketch;
// a hired row set down at /halls brings its post and its roof across.
const pergola = newFeature("pergola", { x: 0, y: 0 });
assert(pergola.widthMm === 4000 && pergola.depthMm === 4000 && pergola.heightMm === 2600 && pergola.pergola?.postMm === 150 && pergola.pergola.roof === "slats", "a new pergola: 4 × 4, 2.6 m, 15cm posts, slats");
assert(!featureMovable(pergola), "…fixed in every sketch");
const pergolaRow = newFeatureFromProduct("pergola", { ...uBar, id: "p-perg", category: "pergolas", categoryFields: { postMm: 120 }, appearance: { shape: "rect", content: "none", symbolStyle: "fabric" } }, { x: 0, y: 0 });
assert(pergolaRow.kind === "pergola" && pergolaRow.pergola?.postMm === 120 && pergolaRow.pergola.roof === "fabric", "a pergola row lands with its post and its cloth roof");

// A row drawn hollow comes across as the outline it resolves to — one keyhole, baked like the
// arc — and a band opened into two pieces as its outer shape, solid: a feature is one outline.
{
  const ringBar = newFeatureFromProduct("bar", { ...uBar, id: "p-ring", appearance: { shape: "rect", content: "none", hollow: { bandMm: 600 } } }, { x: 0, y: 0 });
  assert(ringBar.shape === "custom" && (ringBar.outline?.length ?? 0) > 4, "a hollow bar lands on the plan as its band, baked into an outline");
  assert(ringBar.widthMm === 3600 && ringBar.depthMm === 1800, "…at the row's own box");
  const ringArea = (f: Footprint) => {
    const o = f.kind === "custom" ? f.outline : [];
    return Math.abs(o.reduce((s, p, i) => s + p.x * o[(i + 1) % o.length].y - o[(i + 1) % o.length].x * p.y, 0)) / 2;
  };
  assert(Math.abs(ringArea(featureFootprint(ringBar)) - (3600 * 1800 - 2400 * 600)) < 1, "…the middle left open on the hall plan too");
  const twoBars = newFeatureFromProduct("bar", { ...uBar, id: "p-two", appearance: { shape: "rect", content: "none", hollow: { bandMm: 600, openSides: [1, 3] } } }, { x: 0, y: 0 });
  assert(twoBars.shape === "rect" && !twoBars.outline && twoBars.widthMm === 3600 && twoBars.depthMm === 1800, "a band opened in two comes across as its outer shape");
}

// A feature saved before any of this drew a plain box, and still does.
assert(
  JSON.stringify(featureFootprint({ shape: "rect", widthMm: 4000, depthMm: 1200 })) ===
    JSON.stringify({ kind: "rect", widthMm: 4000, depthMm: 1200 }),
  "an existing rectangular feature draws exactly as it always did",
);

// A hand-drawn outline follows the feature's own two numbers rather than the size it was drawn at
// — those are what the resize handles drag, so a shape that ignored them would draw one size and
// measure another.
const drawn = featureFootprint({
  shape: "custom",
  widthMm: 2000,
  depthMm: 1000,
  outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
});
assert(drawn.kind === "custom", "a drawn outline stays a drawn outline");
const drawnBounds = footprintBounds(drawn);
assert(drawnBounds.w === 2000 && drawnBounds.h === 1000, `a resized custom feature is redrawn to fit (${drawnBounds.w}×${drawnBounds.h})`);

// --- curved walls -----------------------------------------------------------------------------
// w-shared runs (5000,0)→(5000,4000). Bowing it 500mm to the left has to leave both corners put:
// the wall belongs to two rooms, and a bow that moved a node would reshape the room next door.
const bowed = bulgeWall(base, "w-shared", { x: 4500, y: 2000 });
assert(Math.abs(wallBulgeMm(bowed, "w-shared") - 500) < 1e-6, "dragging the bow handle curves the wall to the drag point");
assert(at(bowed, "n2").x === 5000 && at(bowed, "n3").y === 4000, "…without moving either corner it hangs between");
assert(bowed.walls.filter((w) => w.curve).length === 1, "only the wall that was dragged is curved");
// Straightness is stored as the absence of a curve, not as a curve of depth zero — otherwise
// every renderer would have to decide for itself how flat is flat.
assert(!setWallBulge(bowed, "w-shared", 0).walls.find((w) => w.id === "w-shared")!.curve, "a bow of zero straightens the wall outright");
assert(!bulgeWall(bowed, "w-shared", { x: 5001, y: 2000 }).walls.find((w) => w.id === "w-shared")!.curve, "dragging the handle back onto the chord straightens it too");
assert(Math.abs(wallBulgeMm(setWallBulge(base, "w-shared", 300), "w-shared") - 300) < 1e-6, "a bow can be dialled in by depth alone");
// The bow travels with its corners: it is stored against the wall's ends, so stretching the wall
// must not leave the curve behind at the old corner.
const bowedThenStretched = setWallLength(bowed, "w-shared", 8000);
assert(at(bowedThenStretched, "n3").y === 8000, "the stretched wall's far corner moved");
assert(!!bowedThenStretched.walls.find((w) => w.id === "w-shared")!.curve, "…and the wall is still bowed afterwards");
const leaned = moveWallControlPoint(bowed, "w-shared", "c1", { x: 3000, y: 1000 });
assert(wallBulgeMm(leaned, "w-shared") > 500, "dragging a control point out deepens the curve past its symmetric bow");
assert(moveWallControlPoint(base, "w-shared", "c1", { x: 3000, y: 1000 }) === base, "a straight wall has no control point to move");
assert(bulgeWall(base, "no-such-wall", { x: 0, y: 0 }) === base, "an unknown wall id is a no-op");

// --- stairs: the sketch's edge items (lib/venues/stage-edges.ts holds the behaviour) ------------
const { structure: withStage, featureId: stageId } = addFeature(base, newFeature("stage", { x: 2500, y: 2000 }));
const stageOf = (s: VenueStructure) => s.features.find((f) => f.id === stageId)!;
assert(featureEdgeItems(stageOf(withStage)).length === 0, "a stage arrives bare — the hall editor adds the default flights with the walls in view");
const asStage = featureStage(stageOf(withStage));
assert(asStage.outline.length === 4 && asStage.front === 2 && asStage.heightMm === 600 && asStage.decks.length === 0, "a 6×3 stage reads as the sketch's rectangle, its front the +y side, at its own height, built of no decks");
const roundStage = featureStage({ ...stageOf(withStage), shape: "circle", widthMm: 4000, depthMm: 4000 });
assert(roundStage.outline.length >= 24 && roundStage.smooth?.length === roundStage.outline.length, "a round stage is a smooth rim — one side all the way round");

// A duplicate is a new feature, offset, carrying everything the original did.
{
  const { structure: one, featureId } = addFeature(base, newFeature("plant", { x: 1000, y: 1000 }, "palm"));
  const { structure: two, featureIds } = duplicateFeatures(one, [featureId]);
  const copy = two.features.find((f) => f.id === featureIds[0])!;
  assert(two.features.length === one.features.length + 1 && copy.id !== featureId, "a duplicate is a second feature with its own id");
  assert(copy.plant === "palm" && copy.x === 1000 + DUPLICATE_OFFSET_MM, "…of the same species, offset from the original");
}

// Restacking: later in `features` draws on top.
{
  let st = base;
  const ids: string[] = [];
  for (const [x, sp] of [[0, "palm"], [1000, "tree"], [2000, "shrub"], [90000, "pot"]] as const) {
    const r = addFeature(st, newFeature("plant", { x, y: 0 }, sp));
    st = r.structure;
    ids.push(r.featureId);
  }
  const order = (x: VenueStructure) => x.features.map((f) => ids.indexOf(f.id)).join("");
  assert(order(restackFeatures(st, [ids[0]], "front")) === "1230", "front: to the top of the order");
  assert(order(restackFeatures(st, [ids[3]], "back")) === "3012", "back: to the bottom");
  assert(order(restackFeatures(st, [ids[0]], "forward")) === "1023", "forward: one step past the next overlapping feature");
  assert(order(restackFeatures(st, [ids[2]], "backward")) === "0213", "backward: one step under the one below it");
  assert(!canRestack(st, [ids[3]], "forward"), "the topmost feature has nowhere further forward to go");
  assert(!canRestack(st, [ids[3]], "backward"), "…and a feature overlapping nothing has no visible step back either");
  assert(order(restackFeatures(st, [ids[0], ids[1]], "front")) === "2301", "a group keeps its own order when moved");
}

// A window is an entrance with no leaf: positioned, measured and slid like a door, told apart by
// its kind; a ויטרינה is glass from the floor to the wall's top, a חלון has a sill and a head.
{
  const wallId = base.walls[0].id;
  const { structure: s1, entranceId: doorId } = addEntrance(base, { wallId, distanceMm: 1000, widthMm: 900, swingInward: true, doubleDoor: false });
  const { structure: s2, entranceId: winId } = addEntrance(s1, { wallId, distanceMm: 3000, widthMm: 2000, swingInward: false, doubleDoor: false, kind: "window" });
  const door = s2.entrances.find((e) => e.id === doorId)!;
  const win = s2.entrances.find((e) => e.id === winId)!;
  assert(isDoor(door) && !isWindow(door) && !isDoor(win) && isWindow(win), "a door without a kind is a door; a window says so");
  assert(doorsOf(s2).length === 1 && doorsOf(s2)[0].id === doorId, "doorsOf leaves the window out");
  assert(isVitrine(win), "a window with no sill and no head is a ויטרינה");
  const glass = windowHeights(win, 4000);
  assert(glass.sillMm === 0 && glass.headMm === 4000, "…glazed from the floor to the wall top");
  const sashed = windowHeights({ sillMm: WINDOW_SILL_MM, headMm: WINDOW_HEAD_MM }, 4000);
  assert(sashed.sillMm === 900 && sashed.headMm === 2100 && !isVitrine({ sillMm: 900, headMm: 2100 }), "a חלון keeps its sill and head");
  assert(windowHeights({ sillMm: 900, headMm: 5000 }, 4000).headMm === 4000, "…the head never above the wall");
  assert(windowHeights({ sillMm: 2500, headMm: 2100 }, 4000).headMm === 2500, "…and never under the sill");
  assert(doorOffsets(win, 6000).toEdgeMm === 2000 && doorOffsets(win, 6000).farEdgeMm === 2000, "a window is measured from a corner exactly as a door is");
  const removed = removeWall(s2, wallId);
  assert(removed.entrances.length === 0, "a wall taken away takes its windows with it, like its doors");
  assert(newFeature("fountain", { x: 0, y: 0 }).shape === "circle" && newFeature("fountain", { x: 0, y: 0 }).heightMm === 1500, "a new fountain is a round basin with the height of its jet");
  assert(!featureMovable({ kind: "fountain" }), "a fountain is the property's — a sketch does not move it");
}

// CURVES AND CORNERS on a hand-drawn feature (lib/studio/shaped-outline.ts, 2026-11-07): the
// footprint carries the arcs as curves, is drawn exactly in its box, and a radius is a measurement
// the feature's stretch does not scale.
{
  const sq = [{ x: -3000, y: -1500 }, { x: 3000, y: -1500 }, { x: 3000, y: 1500 }, { x: -3000, y: 1500 }];
  const pool = { shape: "custom" as const, widthMm: 6000, depthMm: 3000, outline: sq, corners: [500, 500, 500, 500] };
  const fp = featureFootprint(pool);
  assert(fp.kind === "custom" && fp.outline.length === 8 && (fp.edgeCurves ?? []).filter(Boolean).length === 4, "a rounded feature's footprint has its arcs as curves");
  const b = footprintBounds(fp);
  assert(Math.abs(b.w - 6000) < 1 && Math.abs(b.h - 3000) < 1, `…and still fills its box (${b.w.toFixed(1)} × ${b.h.toFixed(1)})`);
  const wide = featureFootprint({ ...pool, widthMm: 12000 });
  const firstArc = wide.kind === "custom" ? wide.edgeCurves!.findIndex(Boolean) : -1;
  const arcChord = wide.kind === "custom" ? Math.hypot(wide.outline[firstArc + 1].x - wide.outline[firstArc].x, wide.outline[firstArc + 1].y - wide.outline[firstArc].y) : 0;
  assert(Math.abs(arcChord - 500 * Math.SQRT2) < 1, `…stretched twice as wide, its corners stay R500 (chord ${arcChord.toFixed(1)})`);
  // A side bowed out is measured as drawn: the box is width × depth with the bow inside it, and the
  // drawing is centred on it — before, the points were, and the bow hung half outside the box.
  const bowed = { shape: "custom" as const, widthMm: 6000, depthMm: 4000, outline: sq, edgeCurves: [setBulgeDepth(sq[0], sq[1], null, 1000), null, null, null] };
  const bb = footprintBounds(featureFootprint(bowed));
  assert(Math.abs(bb.w - 6000) < 1 && Math.abs(bb.h - 4000) < 2, `a bowed feature is drawn exactly in its box (${bb.w.toFixed(1)} × ${bb.h.toFixed(1)})`);
  assert(featureFootprint({ shape: "custom", widthMm: 6000, depthMm: 3000, outline: sq }).kind === "custom", "a plain custom feature is drawn as it always was");
}

{
  // A wall's openings as the rows of its פתחים group: in order along the wall from the corner each
  // is measured from, a vitrine named as one.
  const s: VenueStructure = {
    ...emptyStructure(),
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10000, y: 0 },
      { id: "c", x: 10000, y: 5000 },
    ],
    walls: [
      { id: "w", a: "a", b: "b", kind: "wall" },
      { id: "bare", a: "b", b: "c", kind: "wall" },
    ],
    entrances: [
      { id: "door", wallId: "w", distanceMm: 6000, widthMm: 1600, swingInward: true, doubleDoor: false },
      { id: "vit", wallId: "w", distanceMm: 2000, widthMm: 2000, swingInward: false, doubleDoor: false, kind: "window" },
    ],
  };
  const rows = openingsOn(s, "w");
  assert(rows.map((r) => r.id).join() === "vit,door", "openings in order along the wall");
  assert(rows[0].label === "ויטרינה" && rows[0].fromCornerMm === 1000, "a vitrine, its near edge a metre from the corner");
  assert(rows[1].label === "דלת" && rows[1].fromCornerMm === 5200 && rows[1].widthMm === 1600, "the door, 5.20 m from the corner");
  assert(openingsOn(s, "bare").length === 0, "a wall with no openings has no rows");
  assert(openingsOn(s, "missing").length === 0, "…and so does a wall that is not there");
}

console.log("venue structure self-check passed");
