// The stage, lifted into height — a sketch's `Placement.stage` and a venue's `stage` feature alike.
// Spec: docs/superpowers/specs/2026-10-23-3d-scene-design.md §3.6, §3.7.
//
// Nothing here derives a tread or a run of skirt: every piece of geometry is read off
// lib/design-document/stage.ts — `edgeItemShape` for each flight, banquette, barrier, backdrop and
// ramp, `stageCorners` for the corner pieces, `openEdges` for the skirt and `railingRuns` for the
// rail — in the STAGE'S OWN FRAME, exactly as the canvas, the quote and the printed stage plan read
// them. The platform is the stage's OUTLINE and its levels', never the decks `layStage` builds it
// from (see buildStage). This file only gives each of those a height and a material,
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
import type { StageStair } from "@/lib/design-document/types";
import { BENCH_TOP_MM, TREAD_MM, edgeItemShape, openEdges, railingRuns, stageCorners, stageHeight, type CornerPiece, type EdgeItemShape, type EdgeRun, stageHoles, type StagePlacement } from "@/lib/design-document/stage";
import { deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { wallDistanceOf } from "@/lib/venues/stage-edges";
import { featurePlacement, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import type { ChairStyle } from "@/lib/catalog/symbols";
import type { BenchBlock } from "@/lib/design-document/bench";
import { SceneCollector } from "./collect";
import { headingDeg, roomTransform, turn } from "./frame";
import { ENVELOPE, hexOf, metalMaterial, surfaceMaterial, swatchMaterial } from "./materials";
import { type MaterialRef, type NodeTag, type Part, type Transform, type Vec3, transform, vec3 } from "./types";
import { chairRequest } from "./items";

/** The top slab of a stage — what the surface material is laid on; the dark body is under it. */
export const DECK_TOP_MM = 40;
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
  /** A BUILT platform's colour (#rrggbb): the venue's own stage, painted at /halls — stone in that
   *  colour, top, sides and steps, and no cloth skirt round it. Absent = a timber stage. */
  built?: string;
}

/** A sketch stage: its platform and levels whole, every edge item, corners, skirt, railings. */
export function stageNodes(p: StagePlacement, out: SceneCollector, opts: StageOpts): void {
  buildStage(p, p.id, out, opts);
}

/** A venue's raised feature as the same stage (lib/venues/structure.ts featureStage): built of no
 *  decks, so it stands as one slab of its outline; its flights and ramps are the sketch's. Painted
 *  a colour of its own at /halls, it is the venue's BUILT platform in that colour — the קוליסאום's
 *  white stone (2026-10-24), which stood as a timber deck in a black skirt. */
export function venueStageNodes(f: StructureFeature, out: SceneCollector, opts: StageOpts): void {
  const built = hexOf(f.style?.fill);
  buildStage(featurePlacement(f), `feature:${f.id}`, out, built ? { ...opts, built } : opts);
}

/** A built platform's sides: its colour a shade darker than its top, so the edge reads. */
function sideTone(hex: string, k = 0.9): string {
  const ch = (i: number) => Math.round(parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) * k);
  return `#${[0, 1, 2].map((i) => ch(i).toString(16).padStart(2, "0")).join("")}`;
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
  /** The floor a corner piece on `level` stands on: the base deck, or the room's where the level
   *  looks out at it (a part merged in at its own height). An edge item says its own (floorMm). */
  const levelFloor = (level: string | undefined, outer = false): number => (level && !outer ? baseH : 0);
  const deckTop = opts.built
    ? // Stone slabs, matte: marble's veins on a near-white platform read as cracks up close.
      surfaceMaterial("paving", opts.built)
    : stage.surfaceVariant
      ? rowMaterial(stage.surfaceVariant, DECK_TONE, "matte", true)
      : surfaceMaterial("deck", DECK_TONE);
  const deckUnder = matte(opts.built ? sideTone(opts.built) : ENVELOPE.deckUnderside);

  const shapes: { item: StageStair; shape: EdgeItemShape }[] = [];
  for (const item of stage.stairs ?? []) {
    const shape = edgeItemShape(stage, item, deckOf);
    if (shape) shapes.push({ item, shape });
  }

  // 1. The platform: ONE slab per surface — the base outline at the stage's height, each level's
  // outline at its own — over a solid body down to the floor, with only the recesses inner flights
  // are sunk into left open. Never the decks one by one: which decks build it is the plan's business
  // (the stage tool, the quote, the printed stage plan); in the room a stage is a floor to stand on.
  // Laid deck by deck it left every stretch the fill could not deck — a leftover narrower than the
  // narrowest deck, a gap where a curve's run fell between rows — as a hole down to the floor
  // (2026-10-27, the user: "the stage needs to look full"); a missing rim piece before that put plan
  // A's podium in the air (2026-10-24).
  const surfaces = [{ level: undefined as string | undefined, outline: stage.outline, top: baseH }, ...(stage.levels ?? []).map((l) => ({ level: l.id as string | undefined, outline: l.outline, top: l.heightMm }))];
  const tops: Part[] = [];
  const bodies: Part[] = [];
  for (const s of surfaces) {
    // …and the spots left bare on purpose (StagePiece.hole), open all the way down.
    const holes = [
      ...shapes.filter(({ item, shape }) => shape.inner && shape.kind === "stairs" && item.level === s.level).map(({ shape }) => ({ outline: recessHole(shape.polygon) })),
      ...stageHoles(stage, deckOf)
        .filter((h) => h.level === s.level)
        .map((h) => ({ outline: recessHole(h.outline) })),
    ];
    const hollow = holes.length ? { holes } : {};
    tops.push({ shape: "extrude", outline: { outline: s.outline }, h: DECK_TOP_MM, at: vec3(0, 0, s.top - DECK_TOP_MM), ...hollow });
    if (s.top - DECK_TOP_MM > 0) bodies.push({ shape: "extrude", outline: { outline: s.outline }, h: s.top - DECK_TOP_MM, at: vec3(0, 0, 0), ...hollow });
  }
  const deckTag: NodeTag = { type: "deck", id, label: "במה" };
  out.body(`${id}:decks`, deckTag, deckTop, tops, [at]);
  out.body(`${id}:deck-under`, deckTag, deckUnder, bodies, [at]);

  // 2. Edge items.
  const benchMaterial = rowMaterial(stage.benchVariant, BENCH_TONE, "fabric");
  const barrierMaterial = rowMaterial(stage.barrierVariant, BARRIER_TONE, "metal");
  const backdropMaterial = rowMaterial(stage.backdropVariant, BACKDROP_TONE, "fabric");
  const barrierH = rowHeight(stage.barrierVariant) ?? BARRIER_HEIGHT_MM;
  const backdropH = rowHeight(stage.backdropVariant) ?? BACKDROP_HEIGHT_MM;
  for (const { item, shape } of shapes) {
    const tag: NodeTag = { type: "edge", id: item.id, label: shape.kind };
    const floor = shape.floorMm;
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

  // 3. Corner pieces where two runs of stairs or two banquettes meet.
  const cornerParts: Part[] = [];
  for (const c of stageCorners(stage, deckOf)) cornerParts.push(...cornerPieceParts(c, shapes, levelFloor(c.level, c.outer), levelTop(c.level)));
  if (cornerParts.length) out.body(`${id}:corners`, { type: "corner", id, label: "פינה" }, deckTop, cornerParts, [at]);

  // 4. The skirt: a pleated strip hanging down every open edge nothing stands against.
  const wallDistance = wallDistanceOf(opts.structure);
  // A built platform's sides are its stone, not a cloth.
  const runs = opts.built ? [] : openEdges(p, deckOf, wallDistance);
  if (runs.length) {
    const parts: Part[] = runs.map((r) => ({ shape: "ribbon", path: r.path, h: r.dropMm, at: vec3(0, 0, levelTop(r.level) - r.dropMm), pleatMm: SKIRT_PLEAT_MM, amplitudeMm: SKIRT_AMPLITUDE_MM }));
    out.body(`${id}:skirt`, { type: "skirt", id, label: "חצאית" }, rowMaterial(stage.skirtVariant, SKIRT_TONE, "fabric"), parts, [at]);
  }

  // 5. Railings, when the studio's rule asks for them.
  const rails = railingRuns(p, deckOf, opts.railingAboveMm, wallDistance);
  if (rails.length) {
    const parts = rails.flatMap((r) => railParts(r, levelTop(r.level)));
    out.body(`${id}:railing`, { type: "railing", id, label: "מעקה" }, metalMaterial(BARRIER_TONE), parts, [at]);
  }
}

// --- decks -----------------------------------------------------------------------------------

/** How far a recess hole is drawn in from its own outline. */
export const RECESS_INSET_MM = 3;

/** A sunk flight's polygon as a hole in the slab it is cut from: every side moved RECESS_INSET_MM
 *  in (mitred, the mitre capped at three times that on a sharp corner). The flight's own edge lies ON
 *  the stage's rim, and a hole that touches its outline is beyond the triangulation; 3 mm of slab
 *  over the top riser is invisible. */
export function recessHole(polygon: readonly Point[]): Point[] {
  const n = polygon.length;
  if (n < 3) return [...polygon];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  // The inward normal of edge a→b: left of the walk for a positive (counter-clockwise in x/y) area.
  const s = area > 0 ? 1 : -1;
  const inward = (a: Point, b: Point): Point => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (-(b.y - a.y) / L) * s, y: ((b.x - a.x) / L) * s };
  };
  return polygon.map((q, i) => {
    const n1 = inward(polygon[(i - 1 + n) % n], q);
    const n2 = inward(q, polygon[(i + 1) % n]);
    const k = Math.min(3, 1 / Math.max(1e-3, (1 + n1.x * n2.x + n1.y * n2.y) / 2));
    const mx = (n1.x + n2.x) / 2;
    const my = (n1.y + n2.y) / 2;
    return { x: q.x + mx * k * RECESS_INSET_MM, y: q.y + my * k * RECESS_INSET_MM };
  });
}


// --- stairs ----------------------------------------------------------------------------------

/** The lines across a flight, from its edge on the stage to its foot (EdgeItemShape.lines): `treads
 *  + 1` of them, the strip between two one tread. A mitred end (lib/design-document/stage.ts
 *  edgeJoints) has already cut each where its neighbour's crosses it, so the treads of two flights
 *  meeting at an inside corner meet on the valley, block against block. */
export function treadLines(shape: EdgeItemShape): Point[][] {
  return shape.lines;
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
    if (h <= 0 || lines[k].length < 2 || lines[k + 1].length < 2) continue;
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

/** A banquette on an edge: the strip block by block, each side at ITS height (EdgeItemShape.blocks,
 *  bench.ts benchBlocks — QA BQ-5: it was one solid to the chairs' table round a sofa's cushions), a
 *  sofa side's cushions on its seat, and where each chair stands (as transforms in the stage's frame,
 *  to be instanced). `floorZ` is the floor outside the stage, `deckZ` the deck inside it. The bench's
 *  own layout (`shape.bench`, in its frame: back = the stage side at −y) says which side each chair
 *  and cushion belongs to — `shape.chairs`/`cushions` are the same lists carried onto the edge.
 *  `topMm` is its core's top (the chairs' table, or a sofa's solid back) — what a corner piece meets. */
export function benchParts(shape: EdgeItemShape, floorZ: number, deckZ: number): { parts: Part[]; chairs: Transform[]; topMm: number } {
  const lay = shape.bench;
  if (!lay) return { parts: [], chairs: [], topMm: floorZ + BENCH_TOP_MM };
  // The surface each side's people stand or rest their feet on: the stage side is the deck; the
  // room side is the floor for a banquette outside the edge, the deck for one standing on it.
  const backFloor = deckZ;
  const frontFloor = shape.inner ? deckZ : floorZ;
  const standsOn = shape.inner ? deckZ : floorZ;
  const floorOf = (side: BenchBlock["side"]) => (side === "back" ? backFloor : side === "front" ? frontFloor : Math.max(backFloor, frontFloor));
  const seatZ = (side: "back" | "front") => floorOf(side) + lay.sofaHeightMm;
  const topOf = (b: BenchBlock) =>
    Math.max(standsOn + 1, b.kind === "table" ? floorOf(b.side) + lay.heightMm : b.kind === "seat" ? floorOf(b.side) + lay.sofaHeightMm - CUSHION_MM : floorOf(b.side) + lay.sofaHeightMm + SOFA_BACK_HEIGHT_MM);
  const blocks = (shape.blocks ?? []).filter((b) => (b.outline?.length ?? 0) >= 3);
  const parts: Part[] = blocks.map((b) => ({ shape: "extrude", outline: { outline: b.outline! }, h: topOf(b) - standsOn, at: vec3(0, 0, standsOn) }));
  const core = blocks.find((b) => b.core);
  const topMm = core ? topOf(core) : blocks.length ? Math.max(...blocks.map(topOf)) : standsOn + BENCH_TOP_MM;

  // Sofa cushions on their seats: the back side's first, then the front's (bench.ts lays them so).
  // The backrests are the `back` blocks above.
  const backCushions = lay.back.kind === "sofa" ? lay.back.seats : 0;
  shape.cushions.forEach((quad, i) => {
    const side = i < backCushions ? "back" : "front";
    parts.push({ shape: "extrude", outline: { outline: quad }, h: CUSHION_MM, at: vec3(0, 0, seatZ(side) - CUSHION_MM) });
  });

  // Chairs: the stage side's stand on the deck, the room side's on their floor; each faces the strip
  // (a chair body's front is +y, so it turns facingDeg − 90, as seatTransform does).
  const chairs: Transform[] = shape.chairs.map((seat, i) => {
    const own = lay.chairs[i];
    const z = own && own.y < 0 ? backFloor : frontFloor;
    return transform(vec3(seat.x, seat.y, z), seat.facingDeg - 90);
  });
  return { parts, chairs, topMm };
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
    // At the height of the banquettes' core (their table, or a sofa's solid back).
    const h = neighbour ? benchParts(neighbour, floorZ, deckZ).topMm - floorZ : BENCH_TOP_MM + (deckZ - floorZ);
    return [{ shape: "extrude", outline: { outline: c.polygon }, h, at: vec3(0, 0, floorZ) }];
  }
  // In the stage's own tread (CornerPiece.treadMm — the crew's module), like the runs it joins.
  const treadMm = c.treadMm || TREAD_MM;
  const treads = Math.max(1, Math.round(d / treadMm));
  const rise = deckZ - floorZ;
  const riserMm = neighbour?.riserMm || Math.round(rise / (treads + 1));
  const parts: Part[] = [];
  for (let k = 0; k < treads; k++) {
    const h = neighbour ? treadTop(neighbour, k) : rise - (k + 1) * riserMm;
    if (h <= 0) continue;
    const a = k * treadMm;
    const b = Math.min(d, (k + 1) * treadMm);
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
