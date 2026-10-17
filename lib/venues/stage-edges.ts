// A venue's built stage has the SKETCH'S edge items — its flights of stairs and its ramps are
// StageStair rows on a StageBuild (lib/design-document/types.ts), read off the feature by
// lib/venues/structure.ts featureStage, and every rule about them is the sketch's own
// (lib/design-document/stage.ts): any number per stage, on any side, following a round rim, settled
// against the walls, two never sharing a stretch of a side. The user asked for the venue's stairs to
// be EXACTLY the sketch's (2026-10-16) — the one way to be sure is for them to be the same code.
//
// What is the VENUE'S here: which kinds a built stage carries (stairs and a ramp — a banquette, a
// barrier and a backdrop are event items, placed in the sketch and quoted there), that a new stage
// gets the sketch's default flights, and the handful of operations the hall editor's bar and canvas
// call, each one undoable step on the VenueStructure.
import type { Point } from "../studio/hall";
import type { StageEdgeKind, StageStair } from "../design-document/types";
import {
  autoRisers,
  defaultEdgeItems,
  edgeGaps,
  edgeItemInRoom,
  edgeItemShape,
  edgeKind,
  fillGaps,
  itemAt,
  placeEdgeItem,
  settleEdgeItems,
  shareSide,
  stageSide,
  stairFits,
  MIN_EDGE_ITEM_MM,
  type DeckLookup,
  type EdgeItemShape,
  type EdgeRun,
  type WallDistance,
} from "../design-document/stage";
import { featureEdgeItems, featurePlacement, newFeature, updateFeature, type StructureFeature, type VenueStructure } from "./structure";
// The STUDIO's nearestWall (how far a point stands from the nearest real wall), not structure.ts's
// (how far along a wall a point lands — what a door is hung by). The sketch settles its flights
// against this one; so does the venue, or a stage 5cm from a wall would still get a flight there.
import { nearestWall } from "../studio/anchor";
import { isMain } from "../self-check";

/** The kinds a built stage carries. */
export type VenueEdgeKind = Extract<StageEdgeKind, "stairs" | "ramp">;
export const VENUE_EDGE_KINDS: VenueEdgeKind[] = ["stairs", "ramp"];
export const VENUE_EDGE_LABEL: Record<VenueEdgeKind, string> = { stairs: "מדרגות", ramp: "רמפה" };

/** Which venue features are offered flights and ramps (the bar's "קצוות").
 *
 *  A stage, always. A "מבנה" or "אחר" only when it is something a guest climbs ONTO: a platform —
 *  raised 30cm to 1.5m and at least 1.2m across both ways. The rule used to be "anything 30cm or
 *  taller", and the user found it on everything (2026-10-17, "the bar has an option to add stairs"):
 *  a 1.1m bar counter, every 1m fence panel and 3m post round the property, the 9m columns of the
 *  קוליסאום — each offered stairs and a red "open edges" warning. A bar, a pool, the planting and the
 *  ground are never climbed onto. Whatever already carries items keeps the panel, so they can be
 *  taken off again. */
export function takesEdgeItems(f: Pick<StructureFeature, "kind" | "heightMm" | "widthMm" | "depthMm" | "edgeItems" | "stairs">): boolean {
  if (f.kind === "stage") return true;
  if ((f.edgeItems?.length ?? 0) > 0 || f.stairs) return true;
  if (f.kind !== "structure" && f.kind !== "other") return false;
  return f.heightMm >= 300 && f.heightMm <= 1500 && Math.min(f.widthMm, f.depthMm) >= 1200;
}

/** Whether a bare edge is worth a warning — a stage's, where people stand and perform. A platform
 *  someone may climb is offered its stairs, but an edge left open there is not called a fault. */
export function edgesMatter(f: Pick<StructureFeature, "kind">): boolean {
  return f.kind === "stage";
}

/** A built stage is built of nothing the catalog knows: its height is its own (featureStage sets
 *  `heightMm`), so the deck lookup is never asked anything. */
export const NO_DECKS: DeckLookup = () => undefined;

export const newEdgeId = (): string => crypto.randomUUID();

/** How far a point is from the nearest wall of the venue — what settles a flight against a wall. */
export function wallDistanceOf(s: VenueStructure): WallDistance {
  return (p: Point) => nearestWall(s, p)?.distanceMm ?? Infinity;
}

/** Every edge item of a feature with its shape in the ROOM — what the printed map and the sketch's
 *  clearance checks read. */
export function featureEdgeShapes(f: StructureFeature): { item: StageStair; shape: EdgeItemShape }[] {
  const p = featurePlacement(f);
  return (p.stage.stairs ?? []).flatMap((item) => {
    const shape = edgeItemShape(p.stage, item, NO_DECKS);
    return shape ? [{ item, shape: edgeItemInRoom(p, shape) }] : [];
  });
}

/** The bare stretches of a stage's edges — where somebody can walk off. */
export function featureGaps(f: StructureFeature, wallDistance?: WallDistance): EdgeRun[] {
  return edgeGaps(featurePlacement(f), NO_DECKS, wallDistance);
}

/** One edge item as the bar lists and edits it (the sketch's StageEdgeRow, for the two kinds). */
export interface VenueEdgeRow {
  id: string;
  kind: VenueEdgeKind;
  inner: boolean;
  outerFits: boolean;
  innerFits: boolean;
  /** Which side: "בחזית", "בצד", "מאחור", "על הקשת". */
  side: string;
  widthMm: number;
  full: boolean;
  risers: number;
  riserMm: number;
  autoRisers: number;
  manual: boolean;
  depthMm: number;
}

export function edgeRows(f: StructureFeature, wallDistance?: WallDistance): VenueEdgeRow[] {
  const p = featurePlacement(f);
  const stage = p.stage;
  const front = stage.outline[stage.front];
  const frontNext = stage.outline[(stage.front + 1) % stage.outline.length];
  const side = (edge: number) => {
    if (edge === stage.front) return "בחזית";
    const a = stage.outline[edge];
    const b = stage.outline[(edge + 1) % stage.outline.length];
    if (!a || !b || !front || !frontNext) return "בצד";
    const u = { x: b.x - a.x, y: b.y - a.y };
    const fr = { x: frontNext.x - front.x, y: frontNext.y - front.y };
    const cos = (u.x * fr.x + u.y * fr.y) / (Math.hypot(u.x, u.y) * Math.hypot(fr.x, fr.y) || 1);
    return cos < -0.9 ? "מאחור" : "בצד";
  };
  return (stage.stairs ?? []).flatMap((st) => {
    const shape = edgeItemShape(stage, st, NO_DECKS);
    const k = edgeKind(st);
    if (!shape || (k !== "stairs" && k !== "ramp")) return [];
    const sinkable = k === "stairs";
    return [
      {
        id: st.id,
        kind: k,
        inner: shape.inner,
        outerFits: sinkable ? stairFits(p, { ...st, inner: undefined }, NO_DECKS, wallDistance).ok : true,
        innerFits: sinkable ? stairFits(p, { ...st, inner: true }, NO_DECKS, wallDistance).ok : false,
        side: stageSide(stage, undefined, st.edge)?.curved ? "על הקשת" : side(st.edge),
        widthMm: shape.widthMm,
        full: !!st.full,
        risers: shape.risers,
        riserMm: shape.riserMm,
        autoRisers: autoRisers(shape.riseMm),
        manual: !!st.risers,
        depthMm: shape.depthMm,
      },
    ];
  });
}

/** The feature's edge items replaced wholesale — a drag frame, a slide. */
export function setEdgeItems(s: VenueStructure, featureId: string, items: StageStair[]): VenueStructure {
  return updateFeature(s, featureId, { edgeItems: items });
}

export type EdgeRefusal = "wall" | "short" | "flat" | "solid";

/** One item clicked onto a side (`edge`, `t` along that edge): settled outside if it fits, set into
 *  the stage where a wall leaves no floor for a flight, else why not. It takes its stretch; whatever
 *  else stood there gives way (shareSide). */
export function addEdgeItemAt(
  s: VenueStructure,
  featureId: string,
  kind: VenueEdgeKind,
  edge: number,
  t: number,
  wallDistance?: WallDistance,
): { ok: true; structure: VenueStructure; item: StageStair } | { ok: false; reason: EdgeRefusal } {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return { ok: false, reason: "flat" };
  const p = featurePlacement(f);
  const placed = placeEdgeItem(p, itemAt(p, NO_DECKS, kind, undefined, edge, t, newEdgeId(), wallDistance), NO_DECKS, wallDistance);
  if (!placed.ok) return placed;
  const next = { ...p.stage, stairs: [...(p.stage.stairs ?? []), placed.item] };
  return { ok: true, structure: setEdgeItems(s, featureId, shareSide(next, placed.item.id)), item: placed.item };
}

/** What the bar may change about one item: what it is, how wide (a typed width or "the whole
 *  side" — the item then takes that stretch and its neighbours give way), how many risers (null =
 *  back to deriving them), and whether it is set into the stage (refused where it would not fit). */
export function changeEdgeItem(
  s: VenueStructure,
  featureId: string,
  itemId: string,
  patch: { kind?: VenueEdgeKind; widthMm?: number; risers?: number | null; full?: boolean; inner?: boolean },
  wallDistance?: WallDistance,
): { ok: true; structure: VenueStructure } | { ok: false; reason: EdgeRefusal } {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return { ok: false, reason: "flat" };
  const p = featurePlacement(f);
  const st = p.stage.stairs?.find((x) => x.id === itemId);
  if (!st) return { ok: true, structure: s };
  if (patch.inner !== undefined) {
    const fits = stairFits(p, { ...st, inner: patch.inner || undefined }, NO_DECKS, wallDistance);
    if (!fits.ok) return fits;
  }
  const items = (p.stage.stairs ?? []).map((x) => {
    if (x.id !== itemId) return x;
    const next: StageStair = {
      ...x,
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.widthMm !== undefined ? { widthMm: Math.max(MIN_EDGE_ITEM_MM, Math.round(patch.widthMm)) } : {}),
      ...(patch.full !== undefined ? { full: patch.full } : {}),
      ...(patch.inner !== undefined ? { inner: patch.inner || undefined } : {}),
    };
    if (patch.risers === null) {
      const { risers: _auto, ...rest } = next;
      return rest;
    }
    return patch.risers !== undefined ? { ...next, risers: Math.max(1, Math.round(patch.risers)) } : next;
  });
  const stage = { ...p.stage, stairs: items };
  return { ok: true, structure: setEdgeItems(s, featureId, patch.widthMm !== undefined || patch.full ? shareSide(stage, itemId) : items) };
}

export function removeEdgeItem(s: VenueStructure, featureId: string, itemId: string): VenueStructure {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return s;
  return setEdgeItems(s, featureId, featureEdgeItems(f).filter((x) => x.id !== itemId));
}

/** Every bare stretch finished with `kind` — the one-click "finish the edges". A round stage's open
 *  rim too, asked for outright. A flight set into the stage where a wall leaves it no floor. */
export function fillFeatureEdges(s: VenueStructure, featureId: string, kind: VenueEdgeKind, wallDistance?: WallDistance): VenueStructure {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return s;
  const p = featurePlacement(f);
  const add = settleEdgeItems(p, fillGaps(p, NO_DECKS, kind, newEdgeId, wallDistance, { rims: true }), NO_DECKS, newEdgeId, wallDistance, { inner: true, otherwise: "keep" });
  return add.length ? setEdgeItems(s, featureId, [...(p.stage.stairs ?? []), ...add]) : s;
}

/** A stage just placed: the sketch's own default finish — a flight along every side with floor in
 *  front of it, one at the back of a round one — less the barriers the sketch would put where a wall
 *  leaves no floor (a venue's stage has no barriers; that side stays bare). */
export function withDefaultEdges(s: VenueStructure, featureId: string, wallDistance?: WallDistance): VenueStructure {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return s;
  const items = defaultEdgeItems(featurePlacement(f), NO_DECKS, newEdgeId, wallDistance).filter((it) => {
    const k = edgeKind(it);
    return k === "stairs" || k === "ramp";
  });
  return setEdgeItems(s, featureId, items);
}

// ponytail: self-check. Run: npm run check:stage-edges
if (isMain(import.meta.url)) {
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
}
