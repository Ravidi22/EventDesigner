// The stage, lifted into height — a sketch's `Placement.stage` and a venue's `stage` feature alike.
// Spec: docs/superpowers/specs/2026-10-23-3d-scene-design.md §3.6, §3.7.
//
// Nothing here derives a deck, a tread or a run of skirt: every piece of geometry is read off
// lib/design-document/stage.ts — `layStage` for the decks, `edgeItemShape` for each flight,
// banquette, barrier, backdrop and ramp, `stageCorners` for the corner pieces, `openEdges` for the
// skirt and `railingRuns` for the rail — in the STAGE'S OWN FRAME, exactly as the canvas, the quote
// and the printed stage plan read them. This file only gives each of those a height and a material,
// and emits the whole stage as a few bodies placed at ONE transform (`roomTransform`), so a turned or
// mirrored stage is carried into the room by the same arithmetic that carries a chip onto a table.
// The banquette's chairs are instanced through the same transform and share their geometry with
// every other chair of that style in the room.
//
// Heights (z, mm above the venue floor): a base deck's top is `stageHeight`; a level's is its own; an
// edge item on a level stands on the base deck and climbs the difference; a banquette's top is
// `BenchLayout.heightMm` above the surface ITS CHAIRS stand on (the deck for the stage side, the
// floor for the room side of an outer banquette); a sofa seat is `sofaHeightMm` above its sitters'
// floor. A TREAD is a solid block from the flight's floor to its own top: the tread against the edge
// is one riser under the deck, the one at the foot one riser above the floor (an inner flight the
// other way round — it is climbed from the edge in). A RAMP is one tilted slab over a stepped dark
// infill, so it reads as a wedge whichever way the viewer pivots a tilt.
//
// Pure, no DOM; `npx tsx lib/scene/stage.ts` runs the self-check at the bottom.
import type { Point } from "@/lib/studio/hall";
import type { StageBuild, StageStair } from "@/lib/design-document/types";
import {
  BARRIER_MM,
  BENCH_TOP_MM,
  TREAD_MM,
  edgeItemShape,
  layStage,
  openEdges,
  railingRuns,
  stageCorners,
  stageHeight,
  type CornerPiece,
  type EdgeItemShape,
  type EdgeRun,
  type StageDeck,
  type StagePlacement,
} from "@/lib/design-document/stage";
import { deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { footprintOutlines } from "@/lib/studio/footprint";
import { wallDistanceOf } from "@/lib/venues/stage-edges";
import { emptyStructure, featurePlacement, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import type { ChairStyle } from "@/lib/catalog/symbols";
import { primeCatalog } from "@/lib/catalog/storage";
import { pointInPolygon } from "@/lib/venues/faces";
import { rectOutline, roundOutline, skirtMm } from "@/lib/design-document/stage";
import { isMain } from "../self-check";
import { SceneCollector } from "./collect";
import { applyTransform, headingDeg, roomTransform, turn } from "./frame";
import { ENVELOPE, metalMaterial, surfaceMaterial, swatchMaterial } from "./materials";
import { type MaterialRef, type NodeTag, type Part, type Transform, type Vec3, transform, vec3 } from "./types";
import { chairRequest } from "./items";

/** The top slab of a deck — what the surface material is laid on; the dark body is under it. */
export const DECK_TOP_MM = 40;
/** The dark body stands this far in from the slab's edge on a rectangular deck — the legs' line. */
export const DECK_INSET_MM = 40;
/** A bare deck: timber boards, muted — the plan draws stages empty, 3D wants a floor to stand on. */
export const DECK_TONE = "#cfc7bb";
/** A banquette's strip is a solid block; a sofa cushion is this thick; its backrest this high. */
export const BENCH_TONE = "#d8d1c8";
export const CUSHION_MM = 120;
export const SOFA_BACK_HEIGHT_MM = 450;
export const SOFA_BACK_THICK_MM = 60;
/** A ramp's walking slab, and a short flat landing where it meets the deck. */
export const RAMP_SLAB_MM = 60;
export const RAMP_LANDING_MM = 120;
export const BARRIER_HEIGHT_MM = 1000;
export const BACKDROP_HEIGHT_MM = 2400;
export const BARRIER_TONE = "#9a9aa6";
export const BACKDROP_TONE = "#efece6";
export const SKIRT_TONE = "#2b2a2e";
export const SKIRT_PLEAT_MM = 120;
export const SKIRT_AMPLITUDE_MM = 25;
export const RAIL_HEIGHT_MM = 1000;
export const RAIL_POST_R_MM = 20;
export const RAIL_POST_EVERY_MM = 1200;
export const RAIL_MM = 40;

export interface StageChair {
  style: ChairStyle;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** #rrggbb, lower case — part of the instancing key. */
  tone: string;
}

export interface StageOpts {
  /** The venue's structure WITH this event's moves applied — its walls say which edges hug one. */
  structure: VenueStructure;
  /** The designer's view (labels; nothing about the stage differs). */
  author: boolean;
  /** The chair a banquette seats — the studio's default (lib/scene/tables.ts chairSpecOf). */
  chair: StageChair;
  /** The studio's railing rule (studio_settings.stage_railing_above_mm); null/absent = off. */
  railingAboveMm?: number | null;
  /** The height of the floor the stage stands on. */
  floorZ?: number;
}

/** A sketch stage: decks, levels, every edge item, corners, skirt, railings — and the rim pieces
 *  the studio does not have yet, built as deck like the rest. */
export function stageNodes(p: StagePlacement, out: SceneCollector, opts: StageOpts): void {
  buildStage(p, p.id, out, opts);
}

/** A venue's raised feature as the same stage (lib/venues/structure.ts featureStage): built of no
 *  decks, so it stands as one slab of its outline; its flights and ramps are the sketch's. */
export function venueStageNodes(f: StructureFeature, out: SceneCollector, opts: StageOpts): void {
  buildStage(featurePlacement(f), `feature:${f.id}`, out, opts);
}

// --- the build --------------------------------------------------------------------------------

const matte = (colour: string): MaterialRef => ({ colour, kind: "matte" });

/** A finish row's material: its swatch, else its fill, else the kind's tone. */
function rowMaterial(variantId: string | undefined, fallback: string, kind: MaterialRef["kind"], surfaced = false): MaterialRef {
  const r = variantId ? resolve(variantId) : undefined;
  return r ? swatchMaterial(r, r.product, fallback, kind, surfaced) : { colour: fallback, kind };
}

/** A finish row's height, when the catalog has one. */
function rowHeight(variantId: string | undefined): number | undefined {
  const h = variantId ? resolve(variantId)?.product.dimensions.heightMm : undefined;
  return h && h > 0 ? h : undefined;
}

function buildStage(p: StagePlacement, id: string, out: SceneCollector, opts: StageOpts): void {
  const stage = p.stage;
  const at = roomTransform(p, opts.floorZ ?? 0);
  const baseH = stageHeight(stage, deckOf);
  const levelTop = (level: string | undefined): number => (level ? (stage.levels?.find((l) => l.id === level)?.heightMm ?? baseH) : baseH);
  /** The floor an edge item on `level` climbs from, and stands on outside the stage. */
  const levelFloor = (level: string | undefined): number => (level ? baseH : 0);
  const layout = layStage(stage, deckOf);
  const deckTop = stage.surfaceVariant ? rowMaterial(stage.surfaceVariant, DECK_TONE, "matte", true) : surfaceMaterial("deck", DECK_TONE);
  const deckUnder = matte(ENVELOPE.deckUnderside);

  // 1. Decks — or, built of none (a venue stage, a stage whose decks left the catalog), one slab.
  const tops: Part[] = [];
  const bodies: Part[] = [];
  if (layout.decks.length) {
    for (const d of layout.decks) {
      const { top, body } = deckParts(d);
      tops.push(top);
      bodies.push(body);
    }
    // 2. The rim pieces the studio does not own yet ("חסר" on the plan, layStage's `missing`) are
    // still the stage: the room is what will stand there, and a round apron left as a hole put
    // plan A's podium 40cm in the air over the dance floor (2026-10-24). Buying them is the
    // studio's business, shown in the stage tool — never in the room.
    for (const m of layout.missing) {
      const c = m.outline.reduce((a, q) => ({ x: a.x + q.x / m.outline.length, y: a.y + q.y / m.outline.length }), { x: 0, y: 0 });
      const level = (stage.levels ?? []).filter((l) => pointInPolygon(c, l.outline)).reduce((h, l) => Math.max(h, l.heightMm), 0);
      const { top, body } = deckParts({ outline: m.outline, heightMm: level || baseH } as StageDeck);
      tops.push(top);
      bodies.push(body);
    }
  } else {
    tops.push({ shape: "extrude", outline: { outline: stage.outline }, h: DECK_TOP_MM, at: vec3(0, 0, baseH - DECK_TOP_MM) });
    bodies.push({ shape: "extrude", outline: { outline: stage.outline }, h: baseH - DECK_TOP_MM, at: vec3(0, 0, 0) });
    for (const l of stage.levels ?? []) {
      tops.push({ shape: "extrude", outline: { outline: l.outline }, h: DECK_TOP_MM, at: vec3(0, 0, l.heightMm - DECK_TOP_MM) });
      bodies.push({ shape: "extrude", outline: { outline: l.outline }, h: l.heightMm - DECK_TOP_MM, at: vec3(0, 0, 0) });
    }
  }
  const deckTag: NodeTag = { type: "deck", id, label: "במה" };
  out.body(`${id}:decks`, deckTag, deckTop, tops, [at]);
  out.body(`${id}:deck-under`, deckTag, deckUnder, bodies.filter((b) => b.shape !== "extrude" || b.h > 0), [at]);

  // 3. Edge items.
  const shapes: { item: StageStair; shape: EdgeItemShape }[] = [];
  for (const item of stage.stairs ?? []) {
    const shape = edgeItemShape(stage, item, deckOf);
    if (shape) shapes.push({ item, shape });
  }
  const benchMaterial = rowMaterial(stage.benchVariant, BENCH_TONE, "fabric");
  const barrierMaterial = rowMaterial(stage.barrierVariant, BARRIER_TONE, "metal");
  const backdropMaterial = rowMaterial(stage.backdropVariant, BACKDROP_TONE, "fabric");
  const barrierH = rowHeight(stage.barrierVariant) ?? BARRIER_HEIGHT_MM;
  const backdropH = rowHeight(stage.backdropVariant) ?? BACKDROP_HEIGHT_MM;
  for (const { item, shape } of shapes) {
    const tag: NodeTag = { type: "edge", id: item.id, label: shape.kind };
    const floor = levelFloor(item.level);
    const top = levelTop(item.level);
    const bid = `${id}:edge:${item.id}`;
    switch (shape.kind) {
      case "stairs":
        out.body(bid, tag, deckTop, treadParts(shape, floor), [at]);
        break;
      case "ramp": {
        const { slab, infill } = rampParts(shape, floor);
        out.body(bid, tag, deckTop, slab, [at]);
        out.body(`${bid}:under`, tag, deckUnder, infill, [at]);
        break;
      }
      case "bench": {
        const b = benchParts(shape, floor, top);
        out.body(bid, tag, benchMaterial, b.parts, [at]);
        for (const c of b.chairs) {
          out.instance(chairRequest(opts.chair.style, opts.chair.widthMm, opts.chair.depthMm, opts.chair.heightMm, opts.chair.tone, c, { type: "chair", id }), at);
        }
        break;
      }
      case "barrier":
        out.body(bid, tag, barrierMaterial, [{ shape: "extrude", outline: { outline: shape.polygon }, h: barrierH, at: vec3(0, 0, top) }], [at]);
        break;
      case "backdrop":
        out.body(bid, tag, backdropMaterial, [{ shape: "extrude", outline: { outline: shape.polygon }, h: backdropH, at: vec3(0, 0, top) }], [at]);
        break;
    }
  }

  // 4. Corner pieces where two runs of stairs or two banquettes meet.
  const cornerParts: Part[] = [];
  for (const c of stageCorners(stage, deckOf)) cornerParts.push(...cornerPieceParts(c, shapes, levelFloor(c.level), levelTop(c.level)));
  if (cornerParts.length) out.body(`${id}:corners`, { type: "corner", id, label: "פינה" }, deckTop, cornerParts, [at]);

  // 5. The skirt: a pleated strip hanging down every open edge nothing stands against.
  const wallDistance = wallDistanceOf(opts.structure);
  const runs = openEdges(p, deckOf, wallDistance);
  if (runs.length) {
    const parts: Part[] = runs.map((r) => ({ shape: "ribbon", path: r.path, h: r.dropMm, at: vec3(0, 0, levelTop(r.level) - r.dropMm), pleatMm: SKIRT_PLEAT_MM, amplitudeMm: SKIRT_AMPLITUDE_MM }));
    out.body(`${id}:skirt`, { type: "skirt", id, label: "חצאית" }, rowMaterial(stage.skirtVariant, SKIRT_TONE, "fabric"), parts, [at]);
  }

  // 6. Railings, when the studio's rule asks for them.
  const rails = railingRuns(p, deckOf, opts.railingAboveMm, wallDistance);
  if (rails.length) {
    const parts = rails.flatMap((r) => railParts(r, levelTop(r.level)));
    out.body(`${id}:railing`, { type: "railing", id, label: "מעקה" }, metalMaterial(BARRIER_TONE), parts, [at]);
  }
}

// --- decks -----------------------------------------------------------------------------------

/** A deck as laid (lib/design-document/stage.ts StageDeck, in the stage's frame): its top slab and
 *  the dark body under it. A rectangle is two boxes, the body stepped in for the legs' line; a
 *  round piece a cylinder (an oval the ellipse extruded); a shaped piece its placed outline. */
export function deckParts(d: StageDeck): { top: Part; body: Part } {
  const topZ = d.heightMm - DECK_TOP_MM;
  const bodyH = Math.max(0, topZ);
  if (d.outline) {
    // Already where it stands — turned and flipped by the fill (placedPiece / the rim) — so no
    // rotation and no mirror of our own: the outline IS the footprint.
    return {
      top: { shape: "extrude", outline: { outline: d.outline }, h: DECK_TOP_MM, at: vec3(0, 0, topZ) },
      body: { shape: "extrude", outline: { outline: d.outline }, h: bodyH, at: vec3(0, 0, 0) },
    };
  }
  const at = (z: number): Vec3 => vec3(d.centre.x, d.centre.y, z);
  if (d.round) {
    if (Math.abs(d.widthMm - d.depthMm) < 1) {
      const r = d.widthMm / 2;
      return {
        top: { shape: "cylinder", rTop: r, rBottom: r, h: DECK_TOP_MM, at: at(topZ), segments: 48 },
        body: { shape: "cylinder", rTop: r - DECK_INSET_MM, rBottom: r - DECK_INSET_MM, h: bodyH, at: at(0), segments: 48 },
      };
    }
    const oval = footprintOutlines({ kind: "ellipse", widthMm: d.widthMm, depthMm: d.depthMm })[0];
    return {
      top: { shape: "extrude", outline: oval, h: DECK_TOP_MM, at: at(topZ), rotDeg: d.rotation },
      body: { shape: "extrude", outline: oval, h: bodyH, at: at(0), rotDeg: d.rotation },
    };
  }
  return {
    top: { shape: "box", w: d.widthMm, d: d.depthMm, h: DECK_TOP_MM, at: at(topZ), rotDeg: d.rotation },
    body: { shape: "box", w: Math.max(1, d.widthMm - 2 * DECK_INSET_MM), d: Math.max(1, d.depthMm - 2 * DECK_INSET_MM), h: bodyH, at: at(0), rotDeg: d.rotation },
  };
}

// --- stairs ----------------------------------------------------------------------------------

/** The lines across a flight, from its edge on the stage to its foot: the edge line (the first half
 *  of `polygon`), then `treads` regrouped into one polyline per line (on a curved side each line is
 *  several segments), then `farLine`. `treads + 1` lines; the strip between two is one tread. */
export function treadLines(shape: EdgeItemShape): Point[][] {
  const n = shape.polygon.length / 2;
  const edge = shape.polygon.slice(0, n);
  const per = Math.max(1, n - 1);
  const lines: Point[][] = [edge];
  for (let i = 0; i + per <= shape.treads.length; i += per) {
    const segs = shape.treads.slice(i, i + per);
    lines.push([segs[0][0], ...segs.map((s) => s[1])]);
  }
  lines.push(shape.farLine);
  return lines;
}

/** The TOP of tread `k` of a flight (k = 0 against the edge), above the flight's own floor. An outer
 *  flight descends from one riser under the deck; an inner one is climbed from the edge — its first
 *  tread is one riser up — and reaches the deck at its far end. */
export function treadTop(shape: EdgeItemShape, k: number): number {
  return shape.inner ? (k + 1) * shape.riserMm : shape.riseMm - (k + 1) * shape.riserMm;
}

/** One solid block per tread, from the flight's floor to the tread's top. */
export function treadParts(shape: EdgeItemShape, floorZ: number): Part[] {
  const lines = treadLines(shape);
  const parts: Part[] = [];
  for (let k = 0; k + 1 < lines.length; k++) {
    const h = treadTop(shape, k);
    if (h <= 0) continue;
    parts.push({ shape: "extrude", outline: { outline: [...lines[k], ...[...lines[k + 1]].reverse()] }, h, at: vec3(0, 0, floorZ) });
  }
  return parts;
}

// --- ramp ------------------------------------------------------------------------------------

/** A ramp: one slab tilted from the deck down to the floor over its run, a short flat landing at the
 *  deck, and a stepped dark infill under the slab (so it is a wedge, not a floating plank). Built
 *  in a frame whose +y runs from the edge to the foot, so the tilt is always positive: `tiltDeg`
 *  tips a box's top toward +y, which drops its +y end — the foot. */
export function rampParts(shape: EdgeItemShape, floorZ: number): { slab: Part[]; infill: Part[] } {
  const rise = shape.riseMm;
  const depth = shape.depthMm;
  if (rise <= 0 || depth <= 0) return { slab: [], infill: [] };
  const centre = { x: (shape.base.x + shape.foot.x) / 2, y: (shape.base.y + shape.foot.y) / 2 };
  // Local +y = edge → foot (outward); local x along the edge.
  const rotDeg = headingDeg(shape.base, shape.foot) - 90;
  const theta = Math.atan2(rise, depth);
  const tiltDeg = (theta * 180) / Math.PI;
  const cos = Math.cos(theta);
  const slope = Math.hypot(depth, rise);
  const local = (y: number): Point => {
    const q = turn({ x: 0, y }, rotDeg);
    return { x: centre.x + q.x, y: centre.y + q.y };
  };
  const slab: Part[] = [
    // Pivoted on its base centre: the −y end (the edge) rises by rise/2, the +y end (the foot) drops
    // by it; lowered by the slab's own thickness so its TOP meets the floor and the deck.
    { shape: "box", w: shape.widthMm, d: slope, h: RAMP_SLAB_MM, at: vec3(centre.x, centre.y, floorZ + rise / 2 - RAMP_SLAB_MM * cos), rotDeg, tiltDeg },
  ];
  const landing = local(-depth / 2 + RAMP_LANDING_MM / 2);
  slab.push({ shape: "box", w: shape.widthMm, d: RAMP_LANDING_MM, h: RAMP_SLAB_MM, at: vec3(landing.x, landing.y, floorZ + rise - RAMP_SLAB_MM), rotDeg });
  const n = Math.max(4, Math.min(40, Math.round(depth / 200)));
  const step = depth / n;
  const infill: Part[] = [];
  for (let k = 0; k < n; k++) {
    // Box k from the edge outward; its top kept under the slab's underside at its OUTER end.
    const h = rise * (1 - (k + 1) / n) - RAMP_SLAB_MM * cos;
    if (h <= 0) continue;
    const c = local(-depth / 2 + (k + 0.5) * step);
    infill.push({ shape: "box", w: Math.max(1, shape.widthMm - 20), d: step, h, at: vec3(c.x, c.y, floorZ), rotDeg });
  }
  return { slab, infill };
}

// --- bench -----------------------------------------------------------------------------------

/** A banquette on an edge: the strip as a solid block up to its top, a sofa side's cushions and
 *  backrest, and where each chair stands (as transforms in the stage's frame, to be instanced).
 *  `floorZ` is the floor outside the stage, `deckZ` the deck inside it. The bench's own layout
 *  (`shape.bench`, in its frame: back = the stage side at −y) says which side each chair and
 *  cushion belongs to — `shape.chairs`/`cushions` are the same lists carried onto the edge. */
export function benchParts(shape: EdgeItemShape, floorZ: number, deckZ: number): { parts: Part[]; chairs: Transform[] } {
  const lay = shape.bench;
  if (!lay) return { parts: [], chairs: [] };
  // The surface each side's people stand or rest their feet on: the stage side is the deck; the
  // room side is the floor for a banquette outside the edge, the deck for one standing on it.
  const backFloor = deckZ;
  const frontFloor = shape.inner ? deckZ : floorZ;
  const standsOn = shape.inner ? deckZ : floorZ;
  const seatZ = (side: "back" | "front") => (side === "back" ? backFloor : frontFloor) + lay.sofaHeightMm;
  let top: number;
  if (lay.back.kind === "chairs") top = backFloor + lay.heightMm;
  else if (lay.front.kind === "chairs") top = frontFloor + lay.heightMm;
  else if (lay.back.kind === "sofa" || lay.front.kind === "sofa") top = Math.max(lay.back.kind === "sofa" ? seatZ("back") : 0, lay.front.kind === "sofa" ? seatZ("front") : 0) - CUSHION_MM;
  else top = standsOn + BENCH_TOP_MM;
  top = Math.max(standsOn + CUSHION_MM, top);
  const parts: Part[] = [{ shape: "extrude", outline: { outline: shape.polygon }, h: top - standsOn, at: vec3(0, 0, standsOn) }];

  // Sofa cushions and backrests: the back side's first, then the front's (bench.ts lays them so).
  const backCushions = lay.back.kind === "sofa" ? lay.back.seats : 0;
  shape.cushions.forEach((quad, i) => {
    const side = i < backCushions ? "back" : "front";
    parts.push({ shape: "extrude", outline: { outline: quad }, h: CUSHION_MM, at: vec3(0, 0, seatZ(side) - CUSHION_MM) });
  });
  const backIsSofa = lay.back.kind === "sofa";
  shape.backs.forEach(([a, b], i) => {
    const side = backIsSofa && i === 0 ? "back" : "front";
    const z = seatZ(side);
    parts.push({ shape: "box", w: Math.hypot(b.x - a.x, b.y - a.y), d: SOFA_BACK_THICK_MM, h: SOFA_BACK_HEIGHT_MM, at: vec3((a.x + b.x) / 2, (a.y + b.y) / 2, z), rotDeg: headingDeg(a, b) });
  });

  // Chairs: the stage side's stand on the deck, the room side's on their floor; each faces the strip
  // (a chair body's front is +y, so it turns facingDeg − 90, as seatTransform does).
  const chairs: Transform[] = shape.chairs.map((seat, i) => {
    const own = lay.chairs[i];
    const z = own && own.y < 0 ? backFloor : frontFloor;
    return transform(vec3(seat.x, seat.y, z), seat.facingDeg - 90);
  });
  return { parts, chairs };
}

// --- corners ---------------------------------------------------------------------------------

/** A corner piece between two runs: a flight's corner as L-shaped steps turning the corner, level
 *  with the adjoining treads; a banquette's as a block at the adjoining banquette's height. */
export function cornerPieceParts(c: CornerPiece, shapes: readonly { item: StageStair; shape: EdgeItemShape }[], floorZ: number, deckZ: number): Part[] {
  const corner = c.polygon[0];
  const d = c.depthMm;
  if (d <= 0 || c.polygon.length < 4) return [];
  const n1 = { x: (c.polygon[1].x - corner.x) / d, y: (c.polygon[1].y - corner.y) / d };
  const n2 = { x: (c.polygon[3].x - corner.x) / d, y: (c.polygon[3].y - corner.y) / d };
  const pt = (k1: number, k2: number): Point => ({ x: corner.x + n1.x * k1 + n2.x * k2, y: corner.y + n1.y * k1 + n2.y * k2 });
  const neighbour = shapes.find((s) => s.shape.kind === c.kind && (s.item.level ?? undefined) === (c.level ?? undefined) && !s.shape.inner && Math.abs(s.shape.depthMm - d) < 1)?.shape;
  if (c.kind === "bench") {
    const top = neighbour ? benchParts(neighbour, floorZ, deckZ).parts[0] : undefined;
    const h = top && top.shape === "extrude" ? top.h : BENCH_TOP_MM + (deckZ - floorZ);
    return [{ shape: "extrude", outline: { outline: c.polygon }, h, at: vec3(0, 0, floorZ) }];
  }
  const treads = Math.max(1, Math.round(d / TREAD_MM));
  const rise = deckZ - floorZ;
  const riserMm = neighbour?.riserMm || Math.round(rise / (treads + 1));
  const parts: Part[] = [];
  for (let k = 0; k < treads; k++) {
    const h = neighbour ? treadTop(neighbour, k) : rise - (k + 1) * riserMm;
    if (h <= 0) continue;
    const a = k * TREAD_MM;
    const b = Math.min(d, (k + 1) * TREAD_MM);
    const outline: Point[] = k === 0 ? [corner, pt(b, 0), pt(b, b), pt(0, b)] : [pt(a, 0), pt(b, 0), pt(b, b), pt(0, b), pt(0, a), pt(a, a)];
    parts.push({ shape: "extrude", outline: { outline }, h, at: vec3(0, 0, floorZ) });
  }
  return parts;
}

// --- railings --------------------------------------------------------------------------------

/** Posts along a run — at both ends and every RAIL_POST_EVERY_MM between — and a rail on top. */
export function railParts(run: EdgeRun, topZ: number): Part[] {
  const parts: Part[] = [];
  const path = run.path;
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y));
  const L = cum[cum.length - 1];
  if (L <= 0) return parts;
  const posts = Math.max(1, Math.ceil(L / RAIL_POST_EVERY_MM));
  for (let i = 0; i <= posts; i++) {
    const s = (L * i) / posts;
    let k = 0;
    while (k < path.length - 2 && cum[k + 1] < s) k++;
    const f = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const q = { x: path[k].x + (path[k + 1].x - path[k].x) * f, y: path[k].y + (path[k + 1].y - path[k].y) * f };
    parts.push({ shape: "cylinder", rTop: RAIL_POST_R_MM, rBottom: RAIL_POST_R_MM, h: RAIL_HEIGHT_MM, at: vec3(q.x, q.y, topZ), segments: 12 });
  }
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    if (w <= 0) continue;
    parts.push({ shape: "box", w, d: RAIL_MM, h: RAIL_MM, at: vec3((a.x + b.x) / 2, (a.y + b.y) / 2, topZ + RAIL_HEIGHT_MM - RAIL_MM), rotDeg: headingDeg(a, b) });
  }
  return parts;
}

// ponytail: self-check. Run: npx tsx lib/scene/stage.ts
if (isMain(import.meta.url)) {
  {
    const assert = (ok: boolean, msg: string) => {
      if (!ok) {
        console.error("FAIL", msg);
        process.exit(1);
      }
    };
    const near = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;

    primeCatalog([
      { id: "deck-244x122", name: "פלטה 244×122", category: "stage-decks", layer: "floor", dimensions: { widthMm: 2440, depthMm: 1220, heightMm: 600 }, categoryFields: {}, styleTags: [], variants: [] },
      { id: "skirt", name: "חצאית", category: "stage-skirts", layer: "floor", dimensions: { widthMm: 1000, depthMm: 10, heightMm: 600 }, categoryFields: {}, styleTags: [], variants: [{ id: "v-skirt-black", name: "שחור", swatch: "#111111" }] },
    ]);
    const chair: StageChair = { style: "chiavari", widthMm: 420, depthMm: 340, heightMm: 900, tone: "#f7f6fc" };
    const opts: StageOpts = { structure: emptyStructure(), author: true, chair };

    // ── A 6×4 at 60cm, front along −y (rectOutline's edge 0): a full flight on the front, a banquette
    // across the back with the default chairs on the stage side, a barrier down one side.
    const stage: StageBuild = {
      outline: rectOutline(6000, 4000),
      front: 0,
      decks: ["deck-244x122"],
      skirtVariant: "v-skirt-black",
      stairs: [
        { id: "fl", edge: 0, t: 0.5, widthMm: 1000, full: true },
        { id: "bn", kind: "bench", edge: 2, t: 0.5, widthMm: 0, full: true },
        { id: "br", kind: "barrier", edge: 1, t: 0.5, widthMm: 0, full: true },
      ],
    };
    const p: StagePlacement = { id: "s1", variantId: "deck-244x122", layer: "floor", quantity: 1, scale: 1, position: { x: 10000, y: 8000 }, rotation: 0, stage };
    const out = new SceneCollector();
    stageNodes(p, out, opts);
    const nodes = out.nodes();
    const bodies = nodes.filter((n) => n.kind === "body");
    const ofType = (type: string) => bodies.filter((b) => b.tag.type === type);
    const topOf = (q: Part) => ("h" in q ? q.at.z + q.h : q.at.z);

    const decks = ofType("deck");
    const slabs = decks.find((b) => b.id === "s1:decks")!;
    assert(slabs.parts.length > 0, "a 6×4 of 244×122 sheets lays decks");
    assert(slabs.parts.every((q) => near(topOf(q), 600)), "every deck's top is at the stage height, 600");
    assert(slabs.instances.length === 1 && near(slabs.instances[0].at.x, 10000) && near(slabs.instances[0].at.y, 8000), "…placed at the stage's own transform in the room");
    const under = decks.find((b) => b.id === "s1:deck-under")!;
    assert(under.parts.every((q) => q.at.z === 0 && near(topOf(q), 600 - DECK_TOP_MM)), "the dark body stands from the floor to just under the slab");

    // Stairs: one block per tread, descending from the edge to the foot.
    const flight = bodies.find((b) => b.tag.type === "edge" && b.tag.id === "fl")!;
    const fs = edgeItemShape(stage, stage.stairs![0], deckOf)!;
    assert(fs.risers === 4 && fs.riserMm === 150, "60cm is four risers of 15cm");
    assert(flight.parts.length === fs.risers - 1, `one tread fewer than risers (got ${flight.parts.length})`);
    const treadTops = flight.parts.map(topOf);
    assert(near(treadTops[0], fs.riseMm - fs.riserMm), "the tread against the edge is one riser under the deck");
    assert(near(treadTops[treadTops.length - 1], fs.riserMm), "the tread at the foot is one riser above the floor");
    assert(treadTops.every((t, i) => i === 0 || t < treadTops[i - 1]), "…and the treads descend monotonically from the edge to the foot");
    const first = flight.parts[0];
    assert(first.shape === "extrude" && first.outline.outline.some((q) => near(q.y, -2000)) && first.outline.outline.every((q) => q.y <= -2000 + 1 && q.y >= -2000 - TREAD_MM - 1), "the first tread stands against the front edge, one tread deep");
    const foot = flight.parts[flight.parts.length - 1];
    assert(foot.shape === "extrude" && foot.outline.outline.some((q) => near(q.y, -2000 - fs.depthMm)), "the last tread reaches the flight's foot");
    // The same flight set INTO the stage climbs the other way.
    const inner = edgeItemShape({ ...stage, stairs: [{ id: "in", edge: 0, t: 0.5, widthMm: 1000, inner: true }] }, { id: "in", edge: 0, t: 0.5, widthMm: 1000, inner: true }, deckOf)!;
    const innerTops = treadParts(inner, 0).map(topOf);
    assert(near(innerTops[0], inner.riserMm) && near(innerTops[innerTops.length - 1], inner.riseMm - inner.riserMm), "an inner flight is climbed from the edge in: first tread low, last one riser under the deck");

    // The banquette: chairs on the deck behind it, facing it.
    const chairs = bodies.filter((b) => b.tag.type === "chair");
    const chairInstances = chairs.flatMap((b) => b.instances);
    assert(chairs.length === 1 && chairInstances.length === 10, `ten chairs along a 6m banquette, one instanced body (got ${chairInstances.length})`);
    assert(chairInstances.every((t) => near(t.at.z, 600)), "the banquette's chairs stand on the deck, at 600");
    const bench = bodies.find((b) => b.tag.type === "edge" && b.tag.id === "bn")!;
    const bs = edgeItemShape(stage, stage.stairs![1], deckOf)!;
    const benchMid = { x: 10000 + (bs.midline[0].x + bs.midline[1].x) / 2, y: 8000 + (bs.midline[0].y + bs.midline[1].y) / 2 };
    for (const t of chairInstances) {
      const front = applyTransform({ ...t, at: vec3(0, 0, 0) }, vec3(0, 1, 0));
      assert(front.x * (benchMid.x - t.at.x) + front.y * (benchMid.y - t.at.y) > 0, "each chair faces the banquette");
      assert(t.at.y < 8000 + 2000, "…standing inside the stage's edge");
    }
    const strip = bench.parts[0];
    assert(strip.shape === "extrude" && strip.at.z === 0 && near(topOf(strip), 600 + BENCH_TOP_MM), "the strip stands on the floor outside the stage, its top table-height above the deck its chairs stand on");

    // The barrier stands on the deck, to its default height.
    const barrier = bodies.find((b) => b.tag.type === "edge" && b.tag.id === "br")!;
    assert(barrier.parts.length === 1 && barrier.parts[0].at.z === 600 && near(topOf(barrier.parts[0]), 600 + BARRIER_HEIGHT_MM), "the barrier rises 1 m off the deck");
    assert(barrier.parts[0].shape === "extrude" && barrier.parts[0].outline.outline.every((q) => q.x <= 3000 + 1 && q.x >= 3000 - BARRIER_MM - 1), "…on the stage, inside its edge");

    // The skirt: the two bare sides — front and back are stood against — as pleated ribbons.
    const skirt = ofType("skirt");
    assert(skirt.length === 1, "one skirt body");
    const pathLength = (path: Point[]) => path.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - path[i].x, q.y - path[i].y), 0);
    const skirtLen = skirt[0].parts.reduce((s, q) => s + (q.shape === "ribbon" ? pathLength(q.path) : 0), 0);
    const expected = skirtMm(p, deckOf, wallDistanceOf(opts.structure));
    assert(expected === 8000 && Math.abs(skirtLen - expected) <= expected * 0.01, `the skirt's ribbons run the stage's skirt metres (${skirtLen} vs ${expected})`);
    assert(skirt[0].parts.every((q) => q.shape === "ribbon" && q.at.z === 0 && q.h === 600 && q.pleatMm === SKIRT_PLEAT_MM), "…each from the floor to the deck, pleated");
    assert(skirt[0].material.colour === "#111111" && skirt[0].material.kind === "fabric", "…in the skirt row's shade");
    assert(ofType("railing").length === 0, "no railing while the studio has no rule");

    // Railings when the rule asks: posts and a rail along the open drop that is not the front.
    const railed = new SceneCollector();
    stageNodes(p, railed, { ...opts, railingAboveMm: 500 });
    const rail = railed.nodes().filter((n) => n.kind === "body").filter((b) => b.tag.type === "railing");
    assert(rail.length === 1 && rail[0].parts.some((q) => q.shape === "cylinder" && q.at.z === 600) && rail[0].parts.some((q) => q.shape === "box" && near(topOf(q), 600 + RAIL_HEIGHT_MM)), "a 60cm drop above a 50cm rule gets posts on the deck and a rail a metre up");

    // A round stage built of sheets misses its rim pieces — and stands whole all the same.
    const disc = roundOutline(3000, 3000);
    const round: StagePlacement = { ...p, id: "s2", stage: { outline: disc.outline, smooth: disc.smooth, front: 0, decks: ["deck-244x122"] } };
    const authorOut = new SceneCollector();
    stageNodes(round, authorOut, opts);
    const clientOut = new SceneCollector();
    stageNodes(round, clientOut, { ...opts, author: false });
    const missing = layStage(round.stage, deckOf).missing;
    const deckTops = (c: SceneCollector) => c.nodes().filter((n) => n.kind === "body").filter((b) => b.id === "s2:decks").flatMap((b) => b.parts);
    const sheets = layStage(round.stage, deckOf).decks.length;
    // Laid of no sheet at all, it is one slab of its outline; else its sheets and the pieces.
    assert(missing.length > 0 && deckTops(clientOut).length === (sheets ? sheets + missing.length : 1), "a disc of sheets misses its rim pieces, and the room still has its whole deck — no holes");
    assert(deckTops(authorOut).length === deckTops(clientOut).length, "…the same for the designer and the client");

    // A ramp: one tilted slab over a stepped infill, from the floor to the deck.
    const ramped = edgeItemShape(stage, { id: "rp", kind: "ramp", edge: 3, t: 0.5, widthMm: 1200 }, deckOf)!;
    const rp = rampParts(ramped, 0);
    const slab = rp.slab[0];
    assert(slab.shape === "box" && near(slab.d, Math.hypot(ramped.depthMm, ramped.riseMm)) && !!slab.tiltDeg && near(slab.tiltDeg, (Math.atan2(600, 7200) * 180) / Math.PI, 0.01), "the slab is the slope's length, tilted by the slope");
    assert(rp.infill.length >= 4 && rp.infill.every((q) => q.shape === "box" && q.at.z === 0 && topOf(q) < 600) && topOf(rp.infill[0]) > topOf(rp.infill[rp.infill.length - 1]), "the infill steps down from the edge to the foot, under the slab");
    const tiltOk = (() => {
      // Local +y of the slab must point from the edge to the foot: a positive tilt then drops the foot.
      const yAxis = turn({ x: 0, y: 1 }, slab.shape === "box" ? (slab.rotDeg ?? 0) : 0);
      return yAxis.x * (ramped.foot.x - ramped.base.x) + yAxis.y * (ramped.foot.y - ramped.base.y) > 0;
    })();
    assert(tiltOk, "the slab's own +y runs from the edge to the foot, so its positive tilt drops the foot");

    // A venue's stage feature: no decks in the catalog, so one slab at its height; its flight the same.
    const feature: StructureFeature = {
      id: "vs",
      kind: "stage",
      label: "במה",
      x: 20000,
      y: 5000,
      widthMm: 6000,
      depthMm: 3000,
      heightMm: 600,
      shape: "rect",
      rotationDeg: 0,
      edgeItems: [{ id: "vf", edge: 0, t: 0.5, widthMm: 1200 }],
    };
    const vOut = new SceneCollector();
    venueStageNodes(feature, vOut, opts);
    const vBodies = vOut.nodes().filter((n) => n.kind === "body");
    const vSlab = vBodies.find((b) => b.id === "feature:vs:decks")!;
    assert(!!vSlab && vSlab.tag.id === "feature:vs" && vSlab.parts.length === 1 && near(topOf(vSlab.parts[0]), 600), "a venue stage stands as one slab at its own height, tagged feature:<id>");
    assert(near(vSlab.instances[0].at.x, 20000) && near(vSlab.instances[0].at.y, 5000), "…where the feature stands");
    const vFlight = vBodies.find((b) => b.tag.type === "edge" && b.tag.id === "vf")!;
    assert(!!vFlight && vFlight.parts.length === 3 && near(topOf(vFlight.parts[0]), 450), "its flight is the sketch's: three treads, the first one riser under the deck");

    const stats = out.stats();
    console.log(`scene stage ok: ${stats.bodies} bodies, ${stats.instances} instances for the 6×4`);
  }
}
