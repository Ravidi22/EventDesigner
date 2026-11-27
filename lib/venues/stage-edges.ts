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
  stairStepOf,
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
  type DoorOpening,
  type EdgeItemShape,
  type EdgeRun,
  type WallDistance,
} from "../design-document/stage";
import { featureEdgeItems, featurePlacement, updateFeature, type StructureFeature, type VenueStructure } from "./structure";
// The STUDIO's nearestWall (how far a point stands from the nearest real wall), not structure.ts's
// (how far along a wall a point lands — what a door is hung by). The sketch settles its flights
// against this one; so does the venue, or a stage 5cm from a wall would still get a flight there.
import { nearestWall } from "../studio/anchor";

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

export function edgeRows(f: StructureFeature, wallDistance?: WallDistance, doors?: readonly DoorOpening[]): VenueEdgeRow[] {
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
        outerFits: sinkable ? stairFits(p, { ...st, inner: undefined }, NO_DECKS, wallDistance, doors).ok : true,
        innerFits: sinkable ? stairFits(p, { ...st, inner: true }, NO_DECKS, wallDistance, doors).ok : false,
        side: stageSide(stage, undefined, st.edge)?.curved ? "על הקשת" : side(st.edge),
        widthMm: shape.widthMm,
        full: !!st.full,
        risers: shape.risers,
        riserMm: shape.riserMm,
        autoRisers: autoRisers(shape.riseMm, stairStepOf(stage).riserMm),
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
  doors?: readonly DoorOpening[],
): { ok: true; structure: VenueStructure; item: StageStair } | { ok: false; reason: EdgeRefusal } {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return { ok: false, reason: "flat" };
  const p = featurePlacement(f);
  const placed = placeEdgeItem(p, itemAt(p, NO_DECKS, kind, undefined, edge, t, newEdgeId(), wallDistance), NO_DECKS, wallDistance, doors);
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
  doors?: readonly DoorOpening[],
): { ok: true; structure: VenueStructure } | { ok: false; reason: EdgeRefusal } {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return { ok: false, reason: "flat" };
  const p = featurePlacement(f);
  const st = p.stage.stairs?.find((x) => x.id === itemId);
  if (!st) return { ok: true, structure: s };
  if (patch.inner !== undefined) {
    const fits = stairFits(p, { ...st, inner: patch.inner || undefined }, NO_DECKS, wallDistance, doors);
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
export function fillFeatureEdges(s: VenueStructure, featureId: string, kind: VenueEdgeKind, wallDistance?: WallDistance, doors?: readonly DoorOpening[]): VenueStructure {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return s;
  const p = featurePlacement(f);
  const add = settleEdgeItems(p, fillGaps(p, NO_DECKS, kind, newEdgeId, wallDistance, { rims: true }), NO_DECKS, newEdgeId, wallDistance, { inner: true, otherwise: "keep", doors });
  return add.length ? setEdgeItems(s, featureId, [...(p.stage.stairs ?? []), ...add]) : s;
}

/** The sketch's "stairs everywhere" finish on a venue stage — a flight along every side with floor
 *  in front of it, one at the back of a round one — less the barriers the sketch would put where a
 *  wall leaves no floor (a venue's stage has no barriers; that side stays bare). /halls no longer
 *  applies it when a stage is placed (2026-10-30, the user: "put nothing"); the self-check keeps the
 *  rule, and the bar's one-click finish is `fillFeatureEdges`. */
export function withDefaultEdges(s: VenueStructure, featureId: string, wallDistance?: WallDistance): VenueStructure {
  const f = s.features.find((x) => x.id === featureId);
  if (!f) return s;
  const items = defaultEdgeItems(featurePlacement(f), NO_DECKS, newEdgeId, wallDistance).filter((it) => {
    const k = edgeKind(it);
    return k === "stairs" || k === "ramp";
  });
  return setEdgeItems(s, featureId, items);
}
