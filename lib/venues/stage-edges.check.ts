// npm run check:stage-edges — the self-check of ./stage-edges.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { edgeKind, stageSide } from "../design-document/stage";
import { featureEdgeItems, featurePlacement, newFeature, updateFeature, type StructureFeature, type VenueStructure } from "./structure";
import { addEdgeItemAt, changeEdgeItem, edgeRows, edgesMatter, featureEdgeShapes, featureGaps, fillFeatureEdges, removeEdgeItem, setEdgeItems, takesEdgeItems, wallDistanceOf, withDefaultEdges } from "./stage-edges";

// ponytail: self-check. Run: npm run check:stage-edges
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const empty: VenueStructure = { nodes: [], walls: [], entrances: [], features: [] };
const stageAt = (s: VenueStructure, patch: Partial<StructureFeature> = {}): VenueStructure => ({
  ...s,
  features: [...s.features, { id: "st", ...newFeature("stage", { x: 0, y: 0 }), ...patch }],
});
const itemsOf = (s: VenueStructure) => featureEdgeItems(s.features.find((f) => f.id === "st")!);

// ── who is offered stairs at all ─────────────────────────────────────────────────────────────
const of = (kind: StructureFeature["kind"], heightMm: number, widthMm = 4000, depthMm = 3000) => takesEdgeItems({ kind, heightMm, widthMm, depthMm });
assert(of("stage", 200) && edgesMatter({ kind: "stage" }), "a stage, however low, takes stairs — and its open edges are flagged");
assert(!of("bar", 1100, 4000, 1200), "a bar counter is never climbed onto (the user's report)");
assert(!of("structure", 1000, 2400, 1000) && !of("structure", 3000, 750, 750) && !of("structure", 9000, 2000, 2000), "nor a fence panel, a post or a column");
assert(of("structure", 600, 3000, 2000) && !edgesMatter({ kind: "structure" }), "a 60cm built platform is offered stairs, without a warning for its edges");
assert(!of("pool", 0) && !of("plant", 1000) && !of("surface", 0), "nor a pool, a plant or the ground");
assert(takesEdgeItems({ kind: "bar", heightMm: 1100, widthMm: 4000, depthMm: 1200, edgeItems: [{ id: "x", edge: 0, t: 0.5, widthMm: 1000 }] }), "…but what already carries a flight keeps the panel, to take it off");

// ── a new rectangular stage gets the sketch's default: a flight on every open side ──────────
const rect = withDefaultEdges(stageAt(empty), "st", wallDistanceOf(empty));
assert(itemsOf(rect).length === 4 && itemsOf(rect).every((it) => edgeKind(it) === "stairs" && it.full), "a 6×3 stage in the open gets a full flight on each of its four sides");
const rows = edgeRows(rect.features[0]);
assert(rows.some((r) => r.side === "בחזית") && rows.some((r) => r.side === "מאחור") && rows.filter((r) => r.side === "בצד").length === 2, "the bar names the sides: front, back, two sides");
assert(rows.every((r) => r.risers === 4 && r.riserMm === 150), "a 60cm deck climbs in four risers of 15cm — the sketch's rule");

// …and against a wall, that side is left bare (no barrier on a venue stage) and the flight that
// would have needed floor there is not made.
const walled: VenueStructure = {
  ...empty,
  nodes: [
    { id: "a", x: -10000, y: 1550 },
    { id: "b", x: 10000, y: 1550 },
  ],
  walls: [{ id: "w", a: "a", b: "b", kind: "wall" }],
};
const byWall = withDefaultEdges(stageAt(walled), "st", wallDistanceOf(walled));
assert(itemsOf(byWall).length === 3, "a wall along the front leaves three flights");
assert(itemsOf(byWall).every((it) => edgeKind(it) === "stairs"), "…and no barrier stands in for the fourth: a venue stage carries stairs and ramps only");

// ── a round stage gets ONE flight, at its back ───────────────────────────────────────────────
const round = withDefaultEdges(stageAt(empty, { shape: "circle", widthMm: 4000, depthMm: 4000 }), "st", wallDistanceOf(empty));
const rim = itemsOf(round);
assert(rim.length === 1 && !rim[0].full, "a round stage gets one flight of a standard width");
const rimShape = featureEdgeShapes(round.features[0])[0].shape;
assert(rimShape.base.y < 0, "…at its back — away from the front, which faces +y on a venue plan");
assert(rimShape.polygon.length > 4, "…following the rim as a curve, not a chord");
assert(featureGaps(round.features[0]).length === 0, "a round rim is finished by its skirt: no bare stretch is reported");

// ── clicking a side adds a flight that takes its stretch; a neighbour gives way ───────────────
const one = setEdgeItems(stageAt(empty), "st", []);
const added = addEdgeItemAt(one, "st", "stairs", 0, 0.5, wallDistanceOf(empty));
assert(added.ok && itemsOf(added.structure).length === 1 && !!itemsOf(added.structure)[0].full, "a click in a bare side fills that whole side");
const ramped = addEdgeItemAt(added.ok ? added.structure : one, "st", "ramp", 0, 0.2, wallDistanceOf(empty));
assert(ramped.ok, "a ramp may be clicked onto the same side");
const after = ramped.ok ? itemsOf(ramped.structure) : [];
// The ramp lands in the flight's middle stretch, so the flight is SPLIT round it: two pieces of
// stairs either side of one ramp, none of them the whole side any more.
assert(after.length === 3 && after.filter((it) => edgeKind(it) === "ramp").length === 1 && after.every((it) => !it.full), "the ramp takes its stretch and the flight is split round it — two items never share a stretch");

// ── the bar's changes ────────────────────────────────────────────────────────────────────────
const wider = changeEdgeItem(added.ok ? added.structure : one, "st", itemsOf(added.ok ? added.structure : one)[0].id, { full: false, widthMm: 1500 });
assert(wider.ok && itemsOf(wider.structure)[0].widthMm === 1500 && !itemsOf(wider.structure)[0].full, "a typed width replaces the whole side");
const stepped = changeEdgeItem(wider.ok ? wider.structure : one, "st", itemsOf(wider.ok ? wider.structure : one)[0].id, { risers: 6 });
assert(stepped.ok && edgeRows(stepped.structure.features[0])[0].risers === 6 && edgeRows(stepped.structure.features[0])[0].manual, "typed risers win over the derived count");
const auto = changeEdgeItem(stepped.ok ? stepped.structure : one, "st", itemsOf(stepped.ok ? stepped.structure : one)[0].id, { risers: null });
assert(auto.ok && !edgeRows(auto.structure.features[0])[0].manual, "…and null hands them back to the height");
const sunk = changeEdgeItem(auto.ok ? auto.structure : one, "st", itemsOf(auto.ok ? auto.structure : one)[0].id, { inner: true });
assert(sunk.ok && edgeRows(sunk.structure.features[0])[0].inner, "a flight may be set into a built stage");
const gone = removeEdgeItem(sunk.ok ? sunk.structure : one, "st", itemsOf(sunk.ok ? sunk.structure : one)[0].id);
assert(itemsOf(gone).length === 0, "and taken off again");
assert(featureGaps(gone.features[0]).length === 4, "a bare rectangle reports four open sides");
const filled = fillFeatureEdges(gone, "st", "stairs", wallDistanceOf(empty));
assert(itemsOf(filled).length === 4, "finishing the edges covers every one");

// ── a stage saved with the OLD one-flight model reads as an edge item ─────────────────────────
const legacy = stageAt(empty, { stairs: { side: "front", steps: 5, treadMm: 300, widthMm: 1200, offsetMm: 900, bothSides: true } });
const conv = itemsOf(legacy);
assert(conv.length === 2, "a pair (bothSides) converts to two flights");
const shapes = featureEdgeShapes(legacy.features[0]);
assert(shapes.every((x) => x.shape.risers === 5 && Math.abs(x.shape.widthMm - 1200) < 1), "…keeping its step count and width");
const front = shapes.find((x) => x.shape.base.y > 0)!;
assert(!!front && Math.abs(front.shape.base.x - 900) < 30, "…and its slide along the front edge (the +y side)");
const touched = updateFeature(legacy, "st", { heightMm: 700 }).features[0];
assert(!touched.stairs && touched.edgeItems?.length === 2, "the first edit writes the new form and drops the old field");

// ── a resized stage keeps its flights on their sides ─────────────────────────────────────────
const resized = updateFeature(rect, "st", { widthMm: 8000 }).features[0];
assert(featureEdgeItems(resized).length === 4 && featureEdgeItems(resized).every((it) => it.full), "stretching the stage stretches its full flights with it");
const reshaped = updateFeature(rect, "st", { shape: "circle", widthMm: 4000, depthMm: 4000 }).features[0];
assert(featureEdgeItems(reshaped).every((it) => stageSide(featurePlacement(reshaped).stage, undefined, it.edge) !== null), "a stage reshaped round keeps only items that still have a side");

console.log("stage edges self-check passed");
