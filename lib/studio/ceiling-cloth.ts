// SAILS and CEILING DRAPES — cloth in the air (spec docs/superpowers/specs/2026-11-07-venue-heights-
// rails-and-covers-design.md §6.3, §6.4). Both hang on a RAIL (./rail.ts): a sail (מפרש) on a `sail`
// rail — a sheet tied at three or four corners, each at its own height — and a ceiling drape (בד
// תקרה) on a `run` (a swag from A to B) or a `canopy` (an area of parallel swags). The rail stores
// what the designer chose; everything here is DERIVED from it on every read: the runs a canopy is
// cut into, each run's width, its scallops and its sag, the band the plan draws, the area a sail is
// billed by, the tie a click lands on.
//
// Which placements are these is the CATEGORY's (`sails`, `ceiling-drapes`) — never guessed from the
// rail: a run rail is an LED strip's too (spec §7.1).
//
// Pure: no React, no DOM. The canvas node (app/(app)/studio/ceiling-cloth-node.tsx), the printed map,
// the 3D room (lib/scene/overhead.ts) and the quote all read through here.
import type { Point } from "@/lib/studio/hall";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import type { StructureFeature, VenueStructure } from "@/lib/venues/structure";
import { wallTrack } from "./anchor";
import {
  canopyRuns,
  defaultRailHeight,
  featureHost,
  featureHosts,
  hostCorners,
  isRailed,
  placementHost,
  resolveRail,
  SIDE_MIN_HEIGHT_MM,
  type CanopyRail,
  type Rail,
  type RailContext,
  type RailHost,
  type RailSheet,
  type RunRail,
  type SailRail,
  type SailTie,
  type TieTarget,
} from "./rail";
import { polygonAreaMm2 } from "./geometry";

// ── What is one ─────────────────────────────────────────────────────────────────────────────────

/** The catalog categories this module draws: a sail (`sails`, per m² of its polygon) and a ceiling
 *  drape (`ceiling-drapes`, per metre of its runs). */
export const CEILING_CLOTH_CATEGORIES: readonly string[] = ["sails", "ceiling-drapes"];

/** A row of one of them — what the drop starts drawing instead of hanging it on a wall. */
export function isCeilingClothCategory(category: string | undefined): boolean {
  return !!category && CEILING_CLOTH_CATEGORIES.includes(category);
}

export type ClothKind = "sail" | "drape";

/** Which cloth a placement of `category` on `rail` is — null for anything else (a curtain, an LED
 *  strip on a run, a sail row that somehow hangs on a wall). */
export function clothKindOf(category: string | undefined, rail: Rail | null | undefined): ClothKind | null {
  if (!rail) return null;
  if (category === "sails" && rail.type === "sail") return "sail";
  if (category === "ceiling-drapes" && (rail.type === "run" || rail.type === "canopy")) return "drape";
  return null;
}

// ── Defaults ────────────────────────────────────────────────────────────────────────────────────

/** A drape's cloth across its line when the rail says nothing (spec §6.4): a 1.2 m width. */
export const CLOTH_WIDTH_MM = 1200;
/** One scallop per this much run when the rail does not count them. */
export const WAVE_PITCH_MM = 1500;
/** How low a run's middle hangs when the rail does not say. */
export const RUN_SAG_MM = 300;
/** A sail's tie or a swag's height under open sky (a rod's is 2.4 m — ./rail.ts ROD_HEIGHT_MM). */
export const CLOTH_OPEN_SKY_MM = 3000;
export const SAIL_MIN_TIES = 3;
export const SAIL_MAX_TIES = 4;
/** How much of its width a swag keeps where it is gathered to its line, at the end of every
 *  scallop — the plan's pinch and the room's. */
export const GATHER = 0.7;
/** …and ONE swag from point to point is bunched at the two points it hangs from: a third of its width
 *  there (2026-11-13 — a single scallop is tied at its ends, not caught up along a line). */
export const SWAG_GATHER = 0.35;
/** How much of its width a run keeps where it is gathered: a lone swag's ends, a scalloped run's
 *  gathers. */
export function gatherOf(run: Pick<ClothRun, "waves">): number {
  return run.waves === 1 ? SWAG_GATHER : GATHER;
}
/** The narrowest cloth and the shortest scallop honoured — a typo must not draw a hairline. */
const MIN_WIDTH_MM = 100;

/** Where a new sail tie or swag starts: the roof over the point (./rail.ts defaultRailHeight — the
 *  hook the next round's roofs and pergolas plug into), else the open-sky 3 m. */
export function defaultClothHeight(point: Point, roofAt?: (p: Point) => number | null): number {
  const roof = roofAt?.(point);
  return roof && roof > 0 ? defaultRailHeight(point, roofAt) : CLOTH_OPEN_SKY_MM;
}

/** How many scallops a run of `lengthMm` has: the rail's count, else one per WAVE_PITCH_MM. */
export function wavesFor(lengthMm: number, waves?: number): number {
  if (waves && waves > 0) return Math.max(1, Math.round(waves));
  return Math.max(1, Math.round(lengthMm / WAVE_PITCH_MM));
}

// ── A drape's runs ──────────────────────────────────────────────────────────────────────────────

/** The cloth never comes closer to the floor than this, however deep it is asked to hang. */
const SWAG_FLOOR_MM = 200;

/** One swag of cloth in the air, as every reader draws it. */
export interface ClothRun {
  a: Point;
  b: Point;
  heightMm: number;
  /** End B's height when the swag is not level (RunRail.heightBMm). Absent = `heightMm`. */
  heightBMm?: number;
  sagMm: number;
  widthMm: number;
  waves: number;
  lengthMm: number;
  /** Fairy lights woven into the cloth (RunRail.lights / CanopyRail.lights). */
  lights: boolean;
}

const runsCache = new WeakMap<RunRail | CanopyRail, ClothRun[]>();
/** A run's one swag, or a canopy's runs (./rail.ts canopyRuns, re-cut on every read) — each with its
 *  width, its scallops and its sag, the rail's or the defaults. Remembered per rail object, so a
 *  drape that did not change hands every reader the same array. */
export function clothRuns(rail: RunRail | CanopyRail): ClothRun[] {
  const hit = runsCache.get(rail);
  if (hit) return hit;
  const widthMm = Math.max(MIN_WIDTH_MM, rail.widthMm ?? CLOTH_WIDTH_MM);
  const lines = rail.type === "run" ? [rail] : canopyRuns(rail);
  const out = lines
    .map((r) => {
      const lengthMm = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
      const tilt: { heightBMm?: number } = rail.type === "run" && rail.heightBMm !== undefined && rail.heightBMm !== rail.heightMm ? { heightBMm: rail.heightBMm } : {};
      // The cloth never hangs to the floor: a depth typed before an end was lowered is held above it.
      const lowEnd = Math.min(r.heightMm, tilt.heightBMm ?? r.heightMm);
      const sagMm = Math.min(Math.max(0, rail.sagMm ?? RUN_SAG_MM), Math.max(0, lowEnd - SWAG_FLOOR_MM));
      return { a: r.a, b: r.b, heightMm: r.heightMm, ...tilt, sagMm, widthMm, waves: wavesFor(lengthMm, rail.waves), lengthMm, lights: rail.lights === true };
    })
    .filter((r) => r.lengthMm >= 1);
  runsCache.set(rail, out);
  return out;
}

/** Where along a run the cloth is gathered to its line — the ends and every scallop's end. */
export function runGathers(run: ClothRun): Point[] {
  const out: Point[] = [];
  for (let k = 0; k <= run.waves; k++) {
    const f = k / run.waves;
    out.push({ x: run.a.x + (run.b.x - run.a.x) * f, y: run.a.y + (run.b.y - run.a.y) * f });
  }
  return out;
}

/** How far across its line the cloth reaches, a fraction `s` (0..1) along the run: the full width at
 *  the middle of every scallop, GATHER of it where it is gathered. */
export function runHalfWidth(run: ClothRun, s: number): number {
  const g = gatherOf(run);
  return (run.widthMm / 2) * (g + (1 - g) * Math.abs(Math.sin(Math.PI * run.waves * s)));
}

/** How far below its height the cloth hangs, a fraction `s` along the run: `sagMm` at the middle of
 *  every scallop, none where it is gathered. */
export function runDrop(run: ClothRun, s: number): number {
  return run.sagMm * Math.abs(Math.sin(Math.PI * run.waves * s));
}

/** The height of the LINE the cloth hangs from, a fraction `s` along the run: A's height at 0, B's at
 *  1 (a level run's one height all along). */
export function runTop(run: ClothRun, s: number): number {
  return run.heightMm + ((run.heightBMm ?? run.heightMm) - run.heightMm) * s;
}

/** How high the cloth itself is there: its line less its drop. */
export function runZ(run: ClothRun, s: number): number {
  return runTop(run, s) - runDrop(run, s);
}

/** The swag's LOWEST point from the floor — the headroom under it. Walked, not solved: a tilted swag's
 *  low point is neither its middle nor its low end. */
export function runLowestMm(run: ClothRun): number {
  const steps = Math.max(24, run.waves * 16);
  let low = Infinity;
  for (let i = 0; i <= steps; i++) low = Math.min(low, runZ(run, i / steps));
  return Math.round(low);
}

/** The cloth's own length along its curve, end to end — what is cut, as against the plan's straight
 *  line the row is billed by. Walked in the room (plan distance and height both). */
export function runClothLengthMm(run: ClothRun): number {
  const steps = Math.max(48, run.waves * 24);
  let sum = 0;
  let prev = runZ(run, 0);
  for (let i = 1; i <= steps; i++) {
    const z = runZ(run, i / steps);
    sum += Math.hypot(run.lengthMm / steps, z - prev);
    prev = z;
  }
  return Math.round(sum);
}

// ── One swag, point to point (2026-11-13; the user: "drag it from point to point and put the curve of
// it (depth)") ───────────────────────────────────────────────────────────────────────────────────
//
// A swag is drawn with one press-drag, and its depth is a HANDLE on the plan. A plan cannot show a
// sag — it is straight down — so the swag's PROFILE is folded onto the plan beside its line (the
// gate's convention, lib/catalog/symbols.ts): the curve the cloth makes seen from the side, 1:1, with
// the handle at its lowest point. Pulling the handle away from the line deepens the swag.

/** A new swag's depth as a share of its length, and the least and most that gives. */
export const SWAG_SAG_SHARE = 0.12;
const SWAG_SAG_MIN_MM = 200;
const SWAG_SAG_MAX_MM = 1500;

/** The depth a newly drawn swag of `lengthMm` starts with: 12% of its length, whole centimetres. */
export function swagSagFor(lengthMm: number): number {
  return Math.round(Math.min(SWAG_SAG_MAX_MM, Math.max(SWAG_SAG_MIN_MM, lengthMm * SWAG_SAG_SHARE)) / 10) * 10;
}

/** A new swag from A to B: ONE scallop the whole way, its depth written (swagSagFor) so stretching it
 *  later keeps the curve the designer set, each end at its own height when they differ. */
export function newSwag(a: Point, b: Point, heightMm: number, heightBMm?: number): RunRail {
  const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
  const hA = Math.round(heightMm);
  const hB = heightBMm === undefined ? hA : Math.round(heightBMm);
  return { type: "run", a: round(a), b: round(b), heightMm: hA, ...(hB !== hA ? { heightBMm: hB } : {}), waves: 1, sagMm: swagSagFor(lengthMm) };
}

/** A run's two end heights, A then B. */
export function runEndHeights(rail: RunRail): [number, number] {
  return [rail.heightMm, rail.heightBMm ?? rail.heightMm];
}

/** A run with end `which` (0 = A, 1 = B) at `heightMm` — the OTHER end stays where it is (a level
 *  run stops being level); B at A's height is stored as nothing. */
export function runEndHeight(rail: RunRail, which: 0 | 1, heightMm: number): RunRail {
  const [hA, hB] = runEndHeights(rail);
  const a = which === 0 ? Math.max(0, Math.round(heightMm)) : hA;
  const b = which === 1 ? Math.max(0, Math.round(heightMm)) : hB;
  const { heightBMm: _was, ...rest } = rail;
  void _was;
  return { ...rest, heightMm: a, ...(b !== a ? { heightBMm: b } : {}) };
}

/** The height of another swag's end standing exactly at `p` — a swag drawn from (or to) a point
 *  another one hangs from is hung from the same hook, at the same height. Undefined when none is. */
export function endHeightAt(p: Point, rails: readonly (Rail | null | undefined)[]): number | undefined {
  for (const r of rails) {
    if (r?.type !== "run") continue;
    const [hA, hB] = runEndHeights(r);
    if (Math.hypot(r.a.x - p.x, r.a.y - p.y) <= 1) return hA;
    if (Math.hypot(r.b.x - p.x, r.b.y - p.y) <= 1) return hB;
  }
  return undefined;
}

/** The deepest a swag may hang: never nearer the floor than SWAG_FLOOR_MM under its lower end, never
 *  deeper than it is long. */
export function maxSagMm(run: ClothRun): number {
  return Math.max(0, Math.round(Math.min(Math.min(run.heightMm, run.heightBMm ?? run.heightMm) - SWAG_FLOOR_MM, run.lengthMm)));
}

/** Where a swag's depth is held on the plan: `base` on its line at the middle of its middle scallop,
 *  `n` the unit way its profile is folded (down the screen, else toward +x — one side, always the
 *  same for one line), `at` the handle itself, `sagMm` out from the line. */
export function swagHandle(run: ClothRun): { s: number; base: Point; n: Point; at: Point } {
  const u = { x: (run.b.x - run.a.x) / (run.lengthMm || 1), y: (run.b.y - run.a.y) / (run.lengthMm || 1) };
  let n = { x: -u.y, y: u.x };
  if (n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.x < 0)) n = { x: -n.x, y: -n.y };
  const s = (Math.floor((run.waves - 1) / 2) + 0.5) / run.waves;
  const base = { x: run.a.x + (run.b.x - run.a.x) * s, y: run.a.y + (run.b.y - run.a.y) * s };
  return { s, base, n, at: { x: base.x + n.x * run.sagMm, y: base.y + n.y * run.sagMm } };
}

/** The swag's profile folded onto the plan: its drop laid out sideways from its line, `per` points a
 *  scallop — the dashed curve the handle rides. */
export function swagProfile(run: ClothRun, per = 16): Point[] {
  const { n } = swagHandle(run);
  const steps = Math.max(2, run.waves * per);
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const d = runDrop(run, s);
    out.push({ x: run.a.x + (run.b.x - run.a.x) * s + n.x * d, y: run.a.y + (run.b.y - run.a.y) * s + n.y * d });
  }
  return out;
}

/** The depth a handle dragged to `p` asks for: how far `p` is out from the line on the fold's side —
 *  nothing on the other side, never past maxSagMm — in whole centimetres (`free`: millimetres). */
export function sagFromPoint(run: ClothRun, p: Point, free = false): number {
  const { base, n } = swagHandle(run);
  const d = Math.min(maxSagMm(run), Math.max(0, (p.x - base.x) * n.x + (p.y - base.y) * n.y));
  return free ? Math.round(d) : Math.round(d / 10) * 10;
}

/** A run or a canopy hanging `sagMm` deep. Always written — a depth set by hand is the rail's own,
 *  zero included (a taut cloth). */
export function withSag<R extends RunRail | CanopyRail>(rail: R, sagMm: number): R {
  return { ...rail, sagMm: Math.max(0, Math.round(sagMm)) };
}

/** Where a swag's END lands when it is put or dragged to `raw`: on another swag's end within `tolMm`
 *  (swags fanned from one point share it), else on a thing's MIDDLE (a column, a pergola's post) or
 *  its corner, else on a wall's line, else where it is — `tied` says it caught something. `free`
 *  (Alt) catches nothing. Nothing is stored of the catch: a swag's end is a point. */
export function snapSwagEnd(raw: Point, ctx: TieContext, ends: readonly Point[], tolMm: number, free = false): { p: Point; tied: boolean } {
  if (free) return { p: round(raw), tied: false };
  let best: Point | null = null;
  let bestD = tolMm;
  for (const e of ends) {
    const d = Math.hypot(e.x - raw.x, e.y - raw.y);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) return { p: round(best), tied: true };
  for (const c of ctx.candidates) {
    const o = c.host.outline;
    const mid = { x: o.reduce((k, q) => k + q.x, 0) / o.length, y: o.reduce((k, q) => k + q.y, 0) / o.length };
    const d = Math.hypot(mid.x - raw.x, mid.y - raw.y);
    if (d <= bestD) {
      bestD = d;
      best = mid;
    }
  }
  if (best) return { p: round(best), tied: true };
  const tie = snapTie(raw, ctx, tolMm);
  return { p: tie.p, tied: tie.to.kind !== "post" };
}

/** The swag as the plan draws it: a band along the run whose two edges swell out to the full width
 *  in every scallop and pinch in where it is gathered — one closed outline, `per` points a scallop. */
export function runOutline(run: ClothRun, per = 8): Point[] {
  const u = { x: (run.b.x - run.a.x) / (run.lengthMm || 1), y: (run.b.y - run.a.y) / (run.lengthMm || 1) };
  const n = { x: -u.y, y: u.x };
  // One long swag is one long curve: enough points that its edge reads round.
  const steps = Math.max(2, run.waves === 1 ? per * 3 : run.waves * per);
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const c = { x: run.a.x + (run.b.x - run.a.x) * s, y: run.a.y + (run.b.y - run.a.y) * s };
    const h = runHalfWidth(run, s);
    left.push({ x: c.x + n.x * h, y: c.y + n.y * h });
    right.push({ x: c.x - n.x * h, y: c.y - n.y * h });
  }
  return [...left, ...right.reverse()];
}

/** The line across the band at each gather — the plan's tick where the cloth is caught up. */
export function runGatherTicks(run: ClothRun): [Point, Point][] {
  const u = { x: (run.b.x - run.a.x) / (run.lengthMm || 1), y: (run.b.y - run.a.y) / (run.lengthMm || 1) };
  const n = { x: -u.y, y: u.x };
  const h = (run.widthMm / 2) * gatherOf(run);
  return runGathers(run).map((c) => [
    { x: c.x + n.x * h, y: c.y + n.y * h },
    { x: c.x - n.x * h, y: c.y - n.y * h },
  ]);
}

/** One fairy light on a run: where it is on the plan, and how far under the run's height the cloth
 *  hangs there (the room hangs it on the swag). */
export interface ClothLight {
  x: number;
  y: number;
  dropMm: number;
}
/** One light every this much along a lit run. */
export const LIGHT_PITCH_MM = 250;

/** Fairy lights woven into a run (ClothRun.lights — the user's photograph of אמרה's dance floor,
 *  2026-11-08: sheer runs crossing the room with lights in them): one every LIGHT_PITCH_MM along it,
 *  in from both ends, wandering across the cloth a third of its half-width either side of the line
 *  so they read as woven, never as a strip, each with the cloth's drop under it. Nothing for a run
 *  without lights. A drawing fact: the quote, the packing list and the orders never read it. */
export function runLights(run: ClothRun): ClothLight[] {
  if (!run.lights || run.lengthMm < LIGHT_PITCH_MM) return [];
  const u = { x: (run.b.x - run.a.x) / run.lengthMm, y: (run.b.y - run.a.y) / run.lengthMm };
  const n = { x: -u.y, y: u.x };
  const count = Math.floor(run.lengthMm / LIGHT_PITCH_MM);
  const out: ClothLight[] = [];
  for (let i = 0; i < count; i++) {
    const d = (i + 0.5) * (run.lengthMm / count);
    const s = d / run.lengthMm;
    const across = ((i % 3) - 1) * 0.35 * runHalfWidth(run, s);
    out.push({ x: run.a.x + u.x * d + n.x * across, y: run.a.y + u.y * d + n.y * across, dropMm: runDrop(run, s) });
  }
  return out;
}

// ── Making and editing them ─────────────────────────────────────────────────────────────────────

const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** A new run from A to B at `heightMm` — nothing else written, so the defaults stay defaults. */
export function newRun(a: Point, b: Point, heightMm: number): RunRail {
  return { type: "run", a: round(a), b: round(b), heightMm: Math.round(heightMm) };
}

/** The bearing of an outline's longest side, degrees (0 = +x), folded into [0, 180). A canopy's
 *  default direction: its runs lie along the area's longest side. */
export function longestSideDeg(outline: readonly Point[]): number {
  let best = { l: -1, deg: 0 };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best.l) best = { l, deg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  }
  return ((Math.round(best.deg * 10) / 10) % 180 + 180) % 180;
}

/** A new canopy over `outline` at `heightMm`: its runs along the area's longest side, spaced the
 *  cloth's width apart (edge to edge — spec §6.4). */
export function newCanopy(outline: Point[], heightMm: number, widthMm = CLOTH_WIDTH_MM): CanopyRail {
  return { type: "canopy", outline: outline.map(round), heightMm: Math.round(heightMm), directionDeg: longestSideDeg(outline), spacingMm: widthMm };
}

/** A cloth drawn AGAIN (its bar's "ציור מחדש"): the new points, and what was typed for the old one —
 *  a sail's tie heights (by order) and sag; a drape's height, width, sag, scallops and, onto a
 *  canopy, its spacing. A run redrawn as an area, or an area as a run, keeps them too. The new
 *  area's direction is its own longest side's. */
export function redrawnCloth<R extends RunRail | CanopyRail | SailRail>(prior: Rail, next: R): R {
  if (next.type === "sail") {
    if (prior.type !== "sail") return next;
    return { ...next, ties: next.ties.map((t, i) => (prior.ties[i] ? { ...t, heightMm: prior.ties[i].heightMm } : t)), ...(prior.sagMm !== undefined ? { sagMm: prior.sagMm } : {}) } as R;
  }
  if (prior.type !== "run" && prior.type !== "canopy") return next;
  const kept = {
    heightMm: prior.heightMm,
    ...(prior.type === "run" && next.type === "run" && prior.heightBMm !== undefined ? { heightBMm: prior.heightBMm } : {}),
    ...(prior.sagMm !== undefined ? { sagMm: prior.sagMm } : {}),
    ...(prior.widthMm !== undefined ? { widthMm: prior.widthMm } : {}),
    ...(prior.waves !== undefined ? { waves: prior.waves } : {}),
  };
  if (next.type === "run") return { ...next, ...kept } as R;
  const spacingMm = prior.type === "canopy" ? prior.spacingMm : (prior.widthMm ?? next.spacingMm);
  return { ...next, ...kept, spacingMm } as R;
}

/** A run with end `which` (0 = A, 1 = B) at `p`. */
export function runEndMoved(rail: RunRail, which: 0 | 1, p: Point): RunRail {
  return which === 0 ? { ...rail, a: round(p) } : { ...rail, b: round(p) };
}

/** A canopy with its corner `i` at `p`. */
export function canopyCornerMoved(rail: CanopyRail, i: number, p: Point): CanopyRail {
  if (i < 0 || i >= rail.outline.length) return rail;
  const outline = rail.outline.slice();
  outline[i] = round(p);
  return { ...rail, outline };
}

// ── A sail's ties ───────────────────────────────────────────────────────────────────────────────

/** Things a sail may be tied to by a corner: a building, a stage, a bar, a column, a pergola — any
 *  that stands SIDE_MIN_HEIGHT_MM tall (a 40 cm stage is no anchor). Never a plant (its outline is
 *  its crown) or the ground. */
export const TIE_HOST_KINDS: readonly string[] = ["structure", "stage", "bar", "column", "other", "pergola"];

export interface TieCandidate {
  id: string;
  host: RailHost;
}

const tallEnough = (host: RailHost | null): host is RailHost => !!host && host.heightMm >= SIDE_MIN_HEIGHT_MM && host.outline.length >= 3;

/** Every thing a sail may be tied to: the venue's features (as this event stood them) and, in a
 *  sketch, the document's own floor items standing tall enough. */
export function tieCandidates(
  features: readonly StructureFeature[],
  doc?: Pick<DesignDocumentContent, "placements">,
  productOf?: (variantId: string) => Product | undefined,
): TieCandidate[] {
  const out: TieCandidate[] = [];
  for (const f of features) {
    if (!TIE_HOST_KINDS.includes(f.kind)) continue;
    const host = featureHost(f);
    if (tallEnough(host)) out.push({ id: f.id, host });
  }
  for (const p of doc?.placements ?? []) {
    if (p.layer !== "floor" || p.tableId || p.perch || isRailed(p)) continue;
    const host = placementHost(p, productOf?.(p.variantId));
    if (tallEnough(host)) out.push({ id: p.id, host });
  }
  return out;
}

/** What a tie is snapped against: the venue's walls and the things a corner may be tied to. */
export interface TieContext {
  structure: VenueStructure;
  candidates: readonly TieCandidate[];
}

export interface SnappedTie {
  p: Point;
  to: TieTarget;
}

/** Where a tie put at `raw` lands: on the CORNER of a thing within `tolMm` (carried when it moves),
 *  else on a WALL within `tolMm` (slid along it), else a POST of its own on open ground. A corner
 *  wins over the wall it stands against — it is the stronger point. `free` (Alt) is always a post. */
export function snapTie(raw: Point, ctx: TieContext, tolMm: number, free = false): SnappedTie {
  if (!free) {
    let best: SnappedTie | null = null;
    let bestD = tolMm;
    for (const c of ctx.candidates) {
      const corners = hostCorners(c.host);
      for (let i = 0; i < corners.length; i++) {
        const d = Math.hypot(corners[i].x - raw.x, corners[i].y - raw.y);
        if (d <= bestD) {
          bestD = d;
          best = { p: round(corners[i]), to: { kind: "feature", featureId: c.id, corner: i } };
        }
      }
    }
    if (best) return best;
    for (const w of ctx.structure.walls) {
      if (w.kind === "edge") continue;
      const tr = wallTrack(ctx.structure, w.id);
      if (!tr) continue;
      const t = tr.nearestT(raw);
      const q = tr.at(t).p;
      const d = Math.hypot(q.x - raw.x, q.y - raw.y);
      if (d <= bestD) {
        bestD = d;
        best = { p: round(q), to: { kind: "wall", wallId: w.id, t: Math.round(t * 1e5) / 1e5 } };
      }
    }
    if (best) return best;
  }
  return { p: round(raw), to: { kind: "post" } };
}

/** A new sail from its ties as placed, each at `heightOf` its point — no sag written, so it is the
 *  8% default until the bar says otherwise. */
export function newSail(ties: SnappedTie[], heightOf: (p: Point) => number): SailRail {
  return { type: "sail", ties: ties.map((t) => ({ p: t.p, heightMm: Math.round(heightOf(t.p)), to: t.to })) };
}

/** A sail with tie `i` re-tied where it was dragged to — its height kept. */
export function sailTieMoved(rail: SailRail, i: number, tie: SnappedTie): SailRail {
  if (i < 0 || i >= rail.ties.length) return rail;
  const ties = rail.ties.slice();
  ties[i] = { ...ties[i], p: tie.p, to: tie.to };
  return { ...rail, ties };
}

/** A sail with tie `i` at `heightMm`. */
export function sailTieHeight(rail: SailRail, i: number, heightMm: number): SailRail {
  if (i < 0 || i >= rail.ties.length) return rail;
  const ties = rail.ties.slice();
  ties[i] = { ...ties[i], heightMm: Math.max(0, Math.round(heightMm)) };
  return { ...rail, ties };
}

/** Does this sail stand on its own posts alone — nothing in the room it is tied to? (What a copy may
 *  take along: a sail tied to a wall names that wall.) */
export function sailIsFree(rail: SailRail): boolean {
  return rail.ties.every((t: SailTie) => !t.to || t.to.kind === "post");
}

const sheetCache = new WeakMap<SailRail, { structure: VenueStructure; hosts: (RailHost | null)[]; out: RailSheet | null }>();
/** A sail resolved (./rail.ts resolveRail's sheet) — remembered per rail against the walls and the
 *  things its corners are tied to, so a sail nothing moved is the same object frame after frame
 *  (resolveRail itself never remembers a sail). Null when a wall or a thing it is tied to is gone. */
export function sailSheet(rail: SailRail, ctx: RailContext): RailSheet | null {
  const lookup = ctx.outlineOf ?? featureHosts(ctx.structure);
  const hosts = rail.ties.map((t) => (t.to?.kind === "feature" ? lookup(t.to.featureId) : null));
  const hit = sheetCache.get(rail);
  if (hit && hit.structure === ctx.structure && hit.hosts.every((h, i) => h === hosts[i])) return hit.out;
  const r = resolveRail(rail, ctx);
  const out = r?.type === "sheet" ? r.sheet : null;
  sheetCache.set(rail, { structure: ctx.structure, hosts, out });
  return out;
}

// ── What a reader draws ─────────────────────────────────────────────────────────────────────────

/** A cloth as every plan surface draws it: a sail's sheet (null when what it is tied to is gone — it
 *  still lists and prices, but has no honest place on the plan), a drape's runs, a canopy's area. */
export interface ClothView {
  kind: ClothKind;
  sheet: RailSheet | null;
  runs: readonly ClothRun[];
  area?: readonly Point[];
}

const NO_RUNS: readonly ClothRun[] = [];
const viewCache = new WeakMap<Rail, ClothView>();
/** The cloth a placement of `category` on `rail` draws, or null when it is not one (a curtain, an LED
 *  strip). Remembered per rail while its sheet and runs are the same objects, so a memoised node is
 *  handed the very same view frame after frame. */
export function clothView(category: string | undefined, rail: Rail, ctx: RailContext): ClothView | null {
  const kind = clothKindOf(category, rail);
  if (!kind) return null;
  const sheet = rail.type === "sail" ? sailSheet(rail, ctx) : null;
  const runs = rail.type === "run" || rail.type === "canopy" ? clothRuns(rail) : NO_RUNS;
  const hit = viewCache.get(rail);
  if (hit && hit.kind === kind && hit.sheet === sheet && hit.runs === runs) return hit;
  const out: ClothView = { kind, sheet, runs, ...(rail.type === "canopy" ? { area: rail.outline } : {}) };
  viewCache.set(rail, out);
  return out;
}

/** The cloth's outline(s) on the plan, room mm — what it is hit-tested and measured by: a sail's
 *  polygon, each run's band, a canopy's area. */
export function clothPolygons(view: ClothView): Point[][] {
  if (view.kind === "sail") return view.sheet ? [view.sheet.polygon] : [];
  if (view.area && view.area.length >= 3) return [[...view.area]];
  return view.runs.map((r) => runOutline(r, 4));
}

// ── What they bill ──────────────────────────────────────────────────────────────────────────────

/** The CLOTH a rail of these is, mm²: a sail's polygon (read against the room when `ctx` is given —
 *  a tie on a wall or a thing where it now stands — else off the points as placed); a drape's runs,
 *  each its length × its width. Undefined for any other rail. */
export function clothAreaMm2(rail: Rail, ctx?: RailContext): number | undefined {
  if (rail.type === "sail") {
    if (rail.ties.length < SAIL_MIN_TIES) return undefined;
    const sheet = ctx ? sailSheet(rail, ctx) : null;
    return sheet ? sheet.areaMm2 : Math.abs(polygonAreaMm2(rail.ties.map((t) => t.p)));
  }
  if (rail.type === "run" || rail.type === "canopy") return clothRuns(rail).reduce((n, r) => n + r.lengthMm * r.widthMm, 0);
  return undefined;
}

/** A sail's middle — where it is "at" for a zone sheet or a label: its corners' centroid, as placed. */
export function sailCentre(rail: SailRail, sheet?: RailSheet | null): Point | null {
  const pts = sheet?.polygon ?? rail.ties.map((t) => t.p);
  if (!pts.length) return null;
  return { x: pts.reduce((n, q) => n + q.x, 0) / pts.length, y: pts.reduce((n, q) => n + q.y, 0) / pts.length };
}
