// A change of floor level that is part of the building — the three steps down from the entrance
// lobby into the hall, the curved steps round an arch, the ramp outside a side door.
//
// They are FEATURES of their own (kinds "stairs" and "ramp"), not flights hung off something raised
// (./stairs.ts). That model needs a deck to climb onto, and these have none: the floor itself is
// what changes height, and the room has no floor heights to hang them on. So each one stands on the
// plan by itself, like a door, and carries the one number that makes it what it is — the height it
// climbs (the feature's `heightMm`).
//
// THE HEIGHT IS THE INPUT; THE REST IS DERIVED FROM IT. Stairs take risers of at most 18cm and 28cm
// treads — the same rule as a stage's flights (lib/design-document/stage.ts), so a step in a venue
// and a step onto a stage are the same step. A ramp climbs at 1:12. Changing the height re-derives
// the run while keeping what the designer chose: a flight keeps its tread, a ramp keeps its slope.
// The run is still the feature's own measurement (its depth, or a curved flight's band), so the
// resize handles stretch it like any other, and the panel says when a ramp has become too steep
// rather than refusing the drag.
//
// Everything here is in the feature's OWN frame — centred on its box, before its turn — because
// every renderer already draws a feature inside a group that places and turns it. Pure, no DOM,
// self-checked: `npm run check:climb`.
import type { Point } from "@/lib/studio/hall";
import type { ArcSpec, MapShape } from "@/lib/catalog/types";
import { arcSpecOf, buildArcOutline } from "@/lib/studio/footprint";

export type ClimbKind = "stairs" | "ramp";

export function isClimb(kind: string): kind is ClimbKind {
  return kind === "stairs" || kind === "ramp";
}

/** The catalog rows that ARE a flight or a ramp — the stage parts a studio rents. Placed at /halls
 *  they become the venue's own (lib/venues/add-tools.ts); dropped on a sketch they stand on their
 *  own (lib/studio/climb-item.ts). */
export const CLIMB_BY_CATEGORY: Record<string, ClimbKind> = {
  "stage-stairs": "stairs",
  "stage-ramps": "ramp",
};

/** How a free-standing flight or ramp climbs, beyond the height it climbs (the feature's own
 *  `heightMm`). Absent altogether = the defaults below, which is every one placed and left alone. */
export interface FeatureClimb {
  /** Climbs toward +y — down the box as drawn, or toward the INNER rim of a curved flight — instead
   *  of toward −y / the outer rim. Turning the feature cannot say this for a curved flight, whose
   *  two rims are different lengths. */
  reversed?: boolean;
  /** Risers, when the designer typed them. Absent = derived from the height (RISER_MAX_MM). Stairs
   *  only: a ramp has no steps. */
  risers?: number;
}

export const RISER_MAX_MM = 180;
export const TREAD_MM = 280;
/** Run per unit of rise — 1:12, the accessible slope. */
export const RAMP_SLOPE = 12;
export const MAX_RISERS = 30;
/** Never shorter than this, however small the rise: a run of a few millimetres cannot be drawn,
 *  grabbed or walked. */
const MIN_RUN_MM = 200;

/** What this module reads off a feature — structural, so it can be handed a feature or a draft. */
export interface ClimbHost {
  kind: string;
  shape: MapShape;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  arc?: ArcSpec;
  climb?: FeatureClimb;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A curved flight is drawn as a piece of a ring: `widthMm` is its outer diameter and the band of
 *  the ring is its run, exactly as an arc feature is drawn (lib/venues/structure.ts featureFootprint). */
export const climbCurved = (f: Pick<ClimbHost, "shape">): boolean => f.shape === "arc";

/** How many risers a rise needs at most RISER_MAX_MM each. Never zero: a flight placed at all is
 *  at least one step. */
export function risersForRise(heightMm: number): number {
  return clamp(Math.ceil(Math.max(0, heightMm) / RISER_MAX_MM), 1, MAX_RISERS);
}

export function climbRisers(f: ClimbHost): number {
  const typed = f.climb?.risers;
  return typed && typed > 0 ? clamp(Math.round(typed), 1, MAX_RISERS) : risersForRise(f.heightMm);
}

/** N risers stand on N−1 treads between the two floors — the last riser lands on the upper floor
 *  (the convention of ./stairs.ts). A single step still takes one tread of floor. */
export const climbTreads = (f: ClimbHost): number => Math.max(1, climbRisers(f) - 1);

/** How far it runs along the climb: its depth, or a curved flight's band. */
export function climbRunMm(f: ClimbHost): number {
  return climbCurved(f) ? arcSpecOf(f.widthMm, f.arc).bandMm : f.depthMm;
}

export const treadDepthMm = (f: ClimbHost): number => climbRunMm(f) / climbTreads(f);
export const riserHeightMm = (f: ClimbHost): number => f.heightMm / climbRisers(f);

/** A ramp's slope as 1:N — N run per unit of rise. Infinity for a ramp that climbs nothing. */
export function rampRatio(f: ClimbHost): number {
  return f.heightMm > 0 ? climbRunMm(f) / f.heightMm : Infinity;
}

/** Steeper than 1:12, with a centimetre of slack for a run typed in whole centimetres. */
export function rampTooSteep(f: ClimbHost): boolean {
  return f.heightMm > 0 && climbRunMm(f) + 10 < f.heightMm * RAMP_SLOPE;
}

/** "1:12" — one decimal only when it is not whole. */
export function formatRatio(n: number): string {
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 10) / 10;
  return `1:${Number.isInteger(r) ? r : r.toFixed(1)}`;
}

/** The patch that sets the run: the depth, or a curved flight's band (never wider than its radius). */
export function withRun(f: ClimbHost, runMm: number): { depthMm: number } | { arc: ArcSpec } {
  const run = Math.max(MIN_RUN_MM, Math.round(runMm));
  if (!climbCurved(f)) return { depthMm: run };
  const spec = arcSpecOf(f.widthMm, f.arc);
  return { arc: { ...spec, bandMm: Math.min(run, f.widthMm / 2) } };
}

/** A new height, and the run re-derived from it — keeping the tread a flight was built with, or the
 *  slope a ramp was laid at (1:12 when it had none to keep). */
export function patchForHeight(f: ClimbHost, heightMm: number) {
  const h = Math.max(0, Math.round(heightMm));
  const next = { ...f, heightMm: h };
  if (f.kind === "ramp") {
    const ratio = f.heightMm > 0 && climbRunMm(f) > 0 ? climbRunMm(f) / f.heightMm : RAMP_SLOPE;
    return { heightMm: h, ...withRun(next, h * ratio) };
  }
  return { heightMm: h, ...withRun(next, climbTreads(next) * treadDepthMm(f)) };
}

/** Typed risers, and the run re-derived at the tread the flight already has. `undefined` goes back
 *  to deriving them from the height. */
export function patchForRisers(f: ClimbHost, risers: number | undefined) {
  const climb: FeatureClimb = { ...f.climb };
  if (risers && risers > 0) climb.risers = clamp(Math.round(risers), 1, MAX_RISERS);
  else delete climb.risers;
  const next = { ...f, climb };
  return { climb, ...withRun(next, climbTreads(next) * treadDepthMm(f)) };
}

/** The ramp's run set back to exactly 1:12. */
export function patchToAccessible(f: ClimbHost) {
  return withRun(f, f.heightMm * RAMP_SLOPE);
}

/** Straight ↔ curved, keeping the run and roughly the width the flight occupies: a curved flight is
 *  a quarter of a ring whose chord is the straight flight's width, and a straight one is as wide as
 *  the curved one's chord. */
const CURVED_SWEEP_DEG = 90;
export function patchToCurved(f: ClimbHost) {
  const run = climbRunMm(f);
  const half = (CURVED_SWEEP_DEG / 2) * (Math.PI / 180);
  const R = Math.max(f.widthMm / 2 / Math.sin(half), run + 300);
  return { shape: "arc" as const, widthMm: Math.round(R * 2), arc: { sweepDeg: CURVED_SWEEP_DEG, bandMm: Math.round(run) } };
}
export function patchToStraight(f: ClimbHost) {
  const spec = arcSpecOf(f.widthMm, f.arc);
  const R = f.widthMm / 2;
  const chord = spec.sweepDeg >= 180 ? f.widthMm : 2 * R * Math.sin((spec.sweepDeg / 2) * (Math.PI / 180));
  return { shape: "rect" as const, widthMm: Math.round(chord), depthMm: Math.round(spec.bandMm), arc: undefined };
}

/** The walking line of a climb — a dot at the foot, an arrowhead at the head — that says which way
 *  is UP. */
export interface ClimbArrow {
  from: Point;
  to: Point;
  head: Point[];
  dotR: number;
}

/** A ramp's slope, written ON its walking line and along it — "1:12" — as a plan writes one. */
export interface ClimbSlope {
  at: Point;
  angleDeg: number;
  text: string;
  tooSteep: boolean;
}

/** What a renderer draws on top of the footprint, in the feature's own frame. */
export interface ClimbDrawing {
  /** One SVG path per step edge INSIDE the footprint — its two ends are the outline's own. */
  treads: string[];
  /** The walking line, from the foot to the head of the climb. */
  arrow: ClimbArrow;
  /** A ramp's slope, written ON its walking line and along it — "1:12" — as a plan writes one. */
  slope?: ClimbSlope;
}

/** The walking line and the slope alone — what a STAGE's flights and ramps carry (lib/design-document/
 *  stage.ts EdgeItemShape.climb), drawn by the same picture as a free-standing one: the stage lays
 *  the steps itself, and borrows only the arrow. */
export type ClimbMark = Pick<ClimbDrawing, "arrow" | "slope">;

function arrowAlong(from: Point, to: Point, size: number): ClimbArrow {
  const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const u = { x: (to.x - from.x) / L, y: (to.y - from.y) / L };
  const n = { x: -u.y, y: u.x };
  const head = Math.min(size, L * 0.45);
  const base = { x: to.x - u.x * head, y: to.y - u.y * head };
  const hw = head * 0.42;
  return {
    from,
    to: base,
    head: [to, { x: base.x + n.x * hw, y: base.y + n.y * hw }, { x: base.x - n.x * hw, y: base.y - n.y * hw }],
    dotR: head * 0.2,
  };
}

/** The circle a curved flight is cut from, in its own frame: buildArcOutline centres the RING PIECE
 *  on its box, so the circle's centre is wherever that put it. */
function arcCircle(f: ClimbHost): { c: Point; R: number; r: number; a0: number; a1: number; spec: ArcSpec } {
  const spec = arcSpecOf(f.widthMm, f.arc);
  const R = f.widthMm / 2;
  const a0 = -90 - spec.sweepDeg / 2;
  const a1 = -90 + spec.sweepDeg / 2;
  const first = buildArcOutline(f.widthMm, f.arc).outline[0];
  const rad = (a0 * Math.PI) / 180;
  return { c: { x: first.x - R * Math.cos(rad), y: first.y - R * Math.sin(rad) }, R, r: Math.max(0, R - spec.bandMm), a0, a1, spec };
}

export function climbDrawing(f: ClimbHost): ClimbDrawing {
  const ramp = f.kind === "ramp";
  const up = f.climb?.reversed ? 1 : -1; // −1: toward −y / the outer rim
  const treads: string[] = [];
  let foot: Point;
  let top: Point;
  let across: number; // how wide the flight is where the arrow runs, for sizing the arrowhead

  if (climbCurved(f)) {
    const { c, R, r, a0, a1, spec } = arcCircle(f);
    const n = climbTreads(f);
    const large = spec.sweepDeg > 180 ? 1 : 0;
    const at = (rho: number, deg: number): Point => ({ x: c.x + rho * Math.cos((deg * Math.PI) / 180), y: c.y + rho * Math.sin((deg * Math.PI) / 180) });
    if (!ramp) {
      for (let k = 1; k < n; k++) {
        const rho = r + (k * (R - r)) / n;
        const p = at(rho, a0);
        const q = at(rho, a1);
        treads.push(`M ${p.x} ${p.y} A ${rho} ${rho} 0 ${large} 1 ${q.x} ${q.y}`);
      }
    }
    // The walking line runs across the band at the middle of the sweep, which is straight up.
    const pad = Math.min((R - r) * 0.12, 150);
    const inner = at(r + pad, -90);
    const outer = at(R - pad, -90);
    [foot, top] = up < 0 ? [inner, outer] : [outer, inner];
    across = ((r + R) / 2) * ((spec.sweepDeg * Math.PI) / 180);
  } else {
    const w = f.widthMm;
    const d = f.depthMm;
    const n = climbTreads(f);
    if (!ramp) {
      for (let k = 1; k < n; k++) {
        const y = d / 2 - (k * d) / n;
        treads.push(`M ${-w / 2} ${y} L ${w / 2} ${y}`);
      }
    }
    const pad = Math.min(d * 0.12, 150);
    foot = { x: 0, y: -up * (d / 2 - pad) };
    top = { x: 0, y: up * (d / 2 - pad) };
    across = w;
  }

  const arrow = walkingLine(foot, top, across);
  if (!ramp || f.heightMm <= 0) return { treads, arrow };
  return { treads, arrow, slope: slopeOn(foot, top, climbRunMm(f), f.heightMm) };
}

/** How far in from either end of a run the walking line starts and stops — so its dot and its
 *  arrowhead stand clear of the outline. */
export const walkingPadMm = (runMm: number): number => Math.min(runMm * 0.12, 150);

/** The walking line from the foot of a climb to its head, sized to the run it covers and the width
 *  across it (`across`) — never so big that the arrowhead swallows a short flight, never so small on
 *  a long ramp that it reads as a hair. */
export function walkingLine(foot: Point, top: Point, across: number): ClimbArrow {
  const run = Math.hypot(top.x - foot.x, top.y - foot.y);
  return arrowAlong(foot, top, clamp(Math.min(run * 0.35, across * 0.22), 80, 450));
}

/** A ramp's slope at the middle of its walking line, running with it: 1:N for `runMm` over
 *  `riseMm`, flagged when steeper than 1:12 (with a centimetre of slack, as rampTooSteep allows). */
export function slopeOn(foot: Point, top: Point, runMm: number, riseMm: number): ClimbSlope {
  const mid = { x: (foot.x + top.x) / 2, y: (foot.y + top.y) / 2 };
  const angleDeg = (Math.atan2(top.y - foot.y, top.x - foot.x) * 180) / Math.PI;
  const ratio = riseMm > 0 ? runMm / riseMm : Infinity;
  return { at: mid, angleDeg, text: formatRatio(ratio), tooSteep: riseMm > 0 && runMm + 10 < riseMm * RAMP_SLOPE };
}
