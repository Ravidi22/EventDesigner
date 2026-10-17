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
import { isMain } from "../self-check";

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

// ponytail: self-check. Run: npm run check:climb
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
  const stairs: ClimbHost = { kind: "stairs", shape: "rect", widthMm: 3000, depthMm: 560, heightMm: 450 };

  // --- the rise decides the steps ---------------------------------------------------------------
  assert(climbRisers(stairs) === 3, "45cm climbs in 3 risers of 15cm");
  assert(risersForRise(540) === 3 && risersForRise(541) === 4, "…and a riser is never over 18cm");
  assert(risersForRise(0) === 1, "a flight that climbs nothing is still one step");
  assert(climbTreads(stairs) === 2 && near(treadDepthMm(stairs), 280), "3 risers stand on 2 treads of 28cm");
  assert(climbRisers({ ...stairs, climb: { risers: 5 } }) === 5, "typed risers win over the derived count");
  assert(near(riserHeightMm({ ...stairs, climb: { risers: 5 } }), 90), "…and the riser follows them");

  // --- the height carries the run with it ---------------------------------------------------------
  const higher = patchForHeight(stairs, 900);
  assert(higher.heightMm === 900 && "depthMm" in higher && higher.depthMm === 4 * 280, "90cm is 5 risers on 4 treads, at the tread the flight had");
  const wide = { ...stairs, depthMm: 700 }; // treads of 35cm, the designer's choice
  const wider = patchForHeight(wide, 900);
  assert("depthMm" in wider && wider.depthMm === 4 * 350, "…and a flight with deep treads keeps them");
  const typed = patchForRisers(stairs, 6);
  assert(typed.climb.risers === 6 && "depthMm" in typed && typed.depthMm === 5 * 280, "typing risers re-derives the run at the same tread");
  assert(patchForRisers({ ...stairs, climb: { risers: 6 } }, undefined).climb.risers === undefined, "clearing them goes back to deriving");

  const ramp: ClimbHost = { kind: "ramp", shape: "rect", widthMm: 1500, depthMm: 5400, heightMm: 450 };
  assert(near(rampRatio(ramp), 12, 0.001) && !rampTooSteep(ramp), "45cm over 5.4m is 1:12");
  assert(formatRatio(rampRatio(ramp)) === "1:12" && formatRatio(8.53) === "1:8.5", "the slope reads 1:12, or 1:8.5");
  const raised = patchForHeight(ramp, 600);
  assert("depthMm" in raised && raised.depthMm === 7200, "a 1:12 ramp raised to 60cm stays 1:12 — 7.2m");
  const short = { ...ramp, depthMm: 3600 };
  assert(rampTooSteep(short) && formatRatio(rampRatio(short)) === "1:8", "a 3.6m ramp over 45cm is 1:8, and too steep");
  const fixed = patchToAccessible(short);
  assert("depthMm" in fixed && fixed.depthMm === 5400, "…until it is set back to 1:12");
  assert(rampRatio({ ...ramp, heightMm: 0 }) === Infinity && !rampTooSteep({ ...ramp, heightMm: 0 }), "a ramp that climbs nothing is no slope at all");

  // --- drawing ------------------------------------------------------------------------------------
  const drawn = climbDrawing(stairs);
  assert(drawn.treads.length === 1, "2 treads show one step edge inside; the outline's two ends are the others");
  assert(drawn.arrow.from.y > 0 && drawn.arrow.head[0].y < 0, "by default it climbs toward −y: the arrow runs up the box");
  const down = climbDrawing({ ...stairs, climb: { reversed: true } });
  assert(down.arrow.from.y < 0 && down.arrow.head[0].y > 0, "reversed, it climbs the other way");
  assert(drawn.arrow.head.every((p) => Math.abs(p.y) <= 280 + 1e-6), "the arrow stays inside the flight");
  assert(!drawn.slope, "stairs print no slope");
  const rampDrawn = climbDrawing(ramp);
  assert(rampDrawn.treads.length === 0 && rampDrawn.slope?.text === "1:12", "a ramp has no step edges, and says its slope");
  assert(climbDrawing(short).slope?.tooSteep === true, "…and says when it is too steep");
  // The walking line on its own — what a stage's flights borrow: from the foot to the head, the
  // arrowhead at the head, sized to the run and never past 45cm; the slope at its middle, along it.
  const borrowed = walkingLine({ x: 0, y: 1000 }, { x: 0, y: 0 }, 1200);
  assert(borrowed.from.y === 1000 && borrowed.head[0].y === 0 && borrowed.to.y > 0 && borrowed.to.y < 1000, "the walking line runs foot to head, its arrowhead at the head");
  assert(walkingLine({ x: 0, y: 9000 }, { x: 0, y: 0 }, 9000).head[0].y - walkingLine({ x: 0, y: 9000 }, { x: 0, y: 0 }, 9000).to.y === -450, "…its head at most 45cm long");
  const written = slopeOn({ x: 0, y: 7200 }, { x: 0, y: 0 }, 7200, 600);
  assert(written.text === "1:12" && !written.tooSteep && near(written.at.y, 3600) && near(written.angleDeg, -90), "the slope sits at the middle of the line, along it, and reads 1:12 for 7.2m over 60cm");
  assert(slopeOn({ x: 0, y: 3600 }, { x: 0, y: 0 }, 3600, 600).tooSteep, "…and is flagged when steeper");
  assert(walkingPadMm(560) === Math.min(560 * 0.12, 150) && walkingPadMm(7200) === 150, "the line stands in from the ends by 12% of the run, at most 15cm");

  // A curved flight: the band is the run, its step edges are arcs of the ring, its arrow crosses the
  // band at the top of the sweep.
  const curved: ClimbHost = { kind: "stairs", shape: "arc", widthMm: 8000, depthMm: 0, heightMm: 450, arc: { sweepDeg: 120, bandMm: 840 } };
  assert(climbRunMm(curved) === 840 && near(treadDepthMm(curved), 420), "a curved flight runs across its band");
  const arcs = climbDrawing(curved);
  assert(arcs.treads.length === 1 && arcs.treads[0].includes(" A "), "its step edge is an arc");
  const outline = buildArcOutline(8000, curved.arc).outline;
  const top = Math.min(...outline.map((p) => p.y));
  assert(near(arcs.arrow.head[0].y, top + Math.min(840 * 0.12, 150), 2) && near(arcs.arrow.head[0].x, 0), "it climbs to the outer rim, at the top of the sweep");
  assert(climbDrawing({ ...curved, climb: { reversed: true } }).arrow.head[0].y > arcs.arrow.head[0].y, "…or reversed, to the inner one");
  const curvedPatch = patchToCurved(stairs);
  assert(curvedPatch.arc.bandMm === 560 && curvedPatch.widthMm / 2 > 560, "made curved, it keeps its run inside a ring wider than it");
  const back = patchToStraight({ ...stairs, ...curvedPatch });
  assert(near(back.widthMm, 3000, 2) && back.depthMm === 560, "…and made straight again, it is the flight it was");
  const tallBand = withRun(curved, 99999);
  assert("arc" in tallBand && tallBand.arc.bandMm === 4000, "a curved flight's run never exceeds its radius");

  console.log("climb self-check passed");
}
