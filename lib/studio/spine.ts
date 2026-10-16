// THE SPINE OF A TABLE — the line things are spread ALONG.
//
// "Three pendants along the head table" is a sentence about a line through the middle of the
// table, and on most tables that line is obvious: the long axis of a rectangle, a diameter of a
// round. On the tables a designer actually draws head tables as, it is not: an arc's middle runs
// round the band, a horseshoe's follows the ח, a fan's runs from its wide end to its point. Laying
// items along the x axis of those puts them in the air the ring curves round — which is where the
// old "row" layout put them.
//
// So the spine is derived from the SHAPE, the way the label point is (lib/studio/label-anchor.ts):
// a rectangle, a round and an ellipse get their long axis analytically; any other outline gets its
// mid-line WALKED — from the shape's deepest point (the label point) along the ridge of depth in
// both directions, each step settled onto the ridge, until the band thins out (an end cap, a fan's
// point) or the walk comes back round to where it started (a closed ring). The line is in the
// footprint's own frame, so a turned table carries its spine round with it like its number.
//
// `alongSpine` then hands out N points evenly along that line, inset from both ends — the one
// function table dressing (lib/design-document/dressing.ts) and ceiling items (hang-over.ts) both
// spread with, so a candlestick run and a pendant run over the same table fall on the same line.
//
// Pure, cached per footprint like the label point; self-checked: npm run check:spine.
import type { Point } from "@/lib/design-document/types";
import { footprintOutlines, type Footprint } from "./footprint";
import { flatRing, nearestEdgePoint, pole, signedDistance } from "./label-anchor";
import { polygonAreaMm2 } from "./geometry";
import { isMain } from "../self-check";

const cache = new Map<string, Point[]>();
const CACHE_MAX = 300;

/** How thin the band may get before the spine stops, as a fraction of the depth at its deepest
 *  point: a fan's spine reaches toward its point until the band is a third as wide as its middle. */
const THIN = 0.3;

/** The most the walk's heading turns in one step, radians (20°): a band turns gently; anything
 *  sharper is a hop sideways the heading should not follow. */
const MAX_TURN = Math.PI / 9;

/** The long centre line of a footprint, in its own frame: a polyline of two or more points. */
export function footprintSpine(f: Footprint): Point[] {
  if (f.kind === "rect" || f.kind === "circle" || f.kind === "ellipse") {
    const w = f.kind === "circle" ? f.diameterMm : f.widthMm;
    const h = f.kind === "circle" ? f.diameterMm : f.depthMm;
    // A round's spine is its horizontal diameter: a square or a round has no long side, and a row
    // across it reads left to right like a row on anything else.
    return w >= h ? [{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }] : [{ x: 0, y: -h / 2 }, { x: 0, y: h / 2 }];
  }
  const key = JSON.stringify(f);
  const hit = cache.get(key);
  if (hit) return hit;
  // A composite's spine runs through its largest part — the counter, not the round end against it.
  const ring = footprintOutlines(f)
    .map(flatRing)
    .filter((r) => r.length >= 3)
    .sort((a, b) => polygonAreaMm2(b) - polygonAreaMm2(a))[0];
  const spine = ring ? walkRidge(ring) : [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, spine);
  return spine;
}

/** The ridge of depth through a ring, walked both ways from its deepest point. */
function walkRidge(ring: Point[]): Point[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) return [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const start = pole(ring);
  const d0 = signedDistance(start.x, start.y, ring);
  if (!(d0 > 0)) return [start, start];
  const minDepth = Math.max(d0 * THIN, 1);
  // Steps a hundredth of the shape's size, and never under a centimetre — fine enough to follow a
  // curved band, few enough that a 12m run is a few hundred steps each way.
  const step = Math.max(10, span / 100);
  const ok = (p: Point) => signedDistance(p.x, p.y, ring) >= minDepth;
  // Which way the ridge RUNS from the deepest point. Not "across the nearest edge, turned a quarter":
  // at the deepest point of a fan the sides and the arc are all equally near, and the nearest one
  // is whichever the sampling happened to favour. The ridge is the direction the depth holds up
  // best along — summed at a quarter, a half and three quarters of the depth out, in two dozen
  // directions, far enough out that the sampled chords of a curved edge cannot tip the choice.
  let h0 = { x: 1, y: 0 };
  let best = -Infinity;
  for (let k = 0; k < 24; k++) {
    const a = (k * Math.PI) / 12;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    let score = 0;
    for (const f of [0.25, 0.5, 0.75]) score += signedDistance(start.x + u.x * d0 * f, start.y + u.y * d0 * f, ring);
    if (score > best) {
      best = score;
      h0 = u;
    }
  }
  /** Is the edge nearest `p` BESIDE the walk (a band's side) rather than ahead of it (an end cap,
   *  the arc of a fan)? Only a side is something to settle between: with the governing edge ahead
   *  the depth across the heading is flat or tilted, and settling on it slides the walk sideways. */
  const beside = (p: Point, heading: Point): boolean => {
    const e = nearestEdgePoint(p.x, p.y, ring);
    const l = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    return Math.abs(((e.x - p.x) / l) * heading.x + ((e.y - p.y) / l) * heading.y) < 0.5;
  };

  /** The deepest point across the heading within ±r of `p` — the ridge, where the band's depth
   *  peaks. Sampled, not bisected on the slope: across an end cap the depth is FLAT (the cap is the
   *  nearest edge all the way across), and a bisection on a flat slope walks off to one side. A
   *  gain under `gain` is no gain — a curved edge is sampled into chords, and the depth ripples by
   *  a few millimetres along a band that is perfectly straight. */
  const gain = Math.max(0.5, d0 * 0.01);
  const settle = (p: Point, n: Point, r: number): Point => {
    let bestP = p;
    let bestD = signedDistance(p.x, p.y, ring) + gain;
    let lo = -r;
    let hi = r;
    for (let round = 0; round < 3; round++) {
      let pick: number | null = null;
      for (let k = 0; k <= 8; k++) {
        const u = lo + ((hi - lo) * k) / 8;
        const q = { x: p.x + n.x * u, y: p.y + n.y * u };
        const d = signedDistance(q.x, q.y, ring);
        if (d > bestD) {
          bestD = d;
          bestP = q;
          pick = u;
        }
      }
      if (pick === null) break;
      const h = (hi - lo) / 8;
      lo = pick - h;
      hi = pick + h;
    }
    return bestP;
  };

  /** The points along the ridge `sign` way from the start, nearest first. Each step goes `len`
   *  along the heading and is settled ACROSS the heading onto the ridge (the ridge is transverse to
   *  the travel by definition — the nearest edge is no guide, it is ambiguous wherever two edges are
   *  equally near). The heading is the direction of the last few points, turned at most a little per
   *  step, so a curved band is followed round and a settle's sideways hop does not swing the walk
   *  off onto a side branch of the medial axis (a fan's deepest point has three). Whole steps while
   *  they stay deep enough, then shorter ones to reach the band's end. The walk stops where the band
   *  thins — an end cap, a fan's point, the arc of a fan — or where a closed band brings it back to
   *  its start. */
  const walk = (sign: 1 | -1): { pts: Point[]; closed: boolean } => {
    const pts: Point[] = [];
    let at = start;
    let heading = { x: h0.x * sign, y: h0.y * sign };
    let travelled = 0;
    for (let len = step, i = 0; len >= 1 && i < 1200; i++) {
      const n = { x: -heading.y, y: heading.x };
      const ahead = { x: at.x + heading.x * len, y: at.y + heading.y * len };
      const next = beside(ahead, heading) ? settle(ahead, n, len * 0.75) : ahead;
      const moved = Math.hypot(next.x - at.x, next.y - at.y);
      if (ok(next) && moved >= len * 0.25) {
        at = next;
        travelled += moved;
        pts.push(at);
        // The new heading: from three points back to here, turned no more than MAX_TURN from the old.
        const from = pts.length >= 4 ? pts[pts.length - 4] : pts.length >= 2 ? pts[0] : start;
        const L = Math.hypot(at.x - from.x, at.y - from.y) || 1;
        const want = { x: (at.x - from.x) / L, y: (at.y - from.y) / L };
        const turn = Math.atan2(heading.x * want.y - heading.y * want.x, heading.x * want.x + heading.y * want.y);
        const t = Math.max(-MAX_TURN, Math.min(MAX_TURN, turn));
        heading = { x: heading.x * Math.cos(t) - heading.y * Math.sin(t), y: heading.x * Math.sin(t) + heading.y * Math.cos(t) };
        // Round a closed band the walk arrives back where it set out from.
        if (travelled > step * 6 && Math.hypot(at.x - start.x, at.y - start.y) < step * 1.5) return { pts, closed: true };
      } else {
        len /= 2;
      }
    }
    return { pts, closed: false };
  };

  const fwd = walk(1);
  // A closed ring is one loop: the forward walk already came round, so the way back is the same line.
  const back = fwd.closed ? { pts: [] as Point[], closed: true } : walk(-1);
  const line = [...back.pts.reverse(), start, ...fwd.pts];
  return thin(line.length >= 2 ? line : [start, start], Math.max(step, span / 60));
}

/** The polyline with runs of near-collinear points dropped, so a straight spine is two points and a
 *  curved one a few dozen rather than a thousand. */
function thin(line: Point[], tol: number): Point[] {
  if (line.length <= 2) return line;
  const out: Point[] = [line[0]];
  let anchor = line[0];
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i];
    const q = line[i + 1];
    // Keep `p` where the chord anchor→q leaves p further than `tol` off the line.
    const L = Math.hypot(q.x - anchor.x, q.y - anchor.y) || 1;
    const off = Math.abs((q.x - anchor.x) * (anchor.y - p.y) - (anchor.x - p.x) * (q.y - anchor.y)) / L;
    if (off > tol * 0.15 || Math.hypot(p.x - anchor.x, p.y - anchor.y) > tol * 6) {
      out.push(p);
      anchor = p;
    }
  }
  out.push(line[line.length - 1]);
  return out;
}

/** The length of a polyline, mm. */
export function spineLength(spine: readonly Point[]): number {
  let L = 0;
  for (let i = 1; i < spine.length; i++) L += Math.hypot(spine[i].x - spine[i - 1].x, spine[i].y - spine[i - 1].y);
  return L;
}

/** The point `dist` mm along a polyline from its first point (clamped to its ends). */
export function pointAlong(spine: readonly Point[], dist: number): Point {
  if (spine.length === 0) return { x: 0, y: 0 };
  let left = Math.max(0, dist);
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1];
    const b = spine[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg || i === spine.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg;
  }
  return spine[spine.length - 1];
}

/** How far along the spine the point nearest `p` lies, mm from its first point — what orders
 *  items "along" a curved table the way their x orders them along a straight one. */
export function spineParam(spine: readonly Point[], p: Point): number {
  let bestD = Infinity;
  let bestAt = 0;
  let acc = 0;
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1];
    const b = spine[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);
    const t = seg > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (seg * seg))) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) {
      bestD = d;
      bestAt = acc + seg * t;
    }
    acc += seg;
  }
  return bestAt;
}

/** `n` points evenly along the spine, each centred in its own share of the length left after
 *  `inset` (a fraction of the length) is kept clear at each end. One point is the middle. */
export function alongSpine(spine: readonly Point[], n: number, inset = 0.08): Point[] {
  const L = spineLength(spine);
  const usable = L * (1 - inset * 2);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const d = n === 1 ? L / 2 : L * inset + ((i + 0.5) * usable) / n;
    const p = pointAlong(spine, d);
    out.push({ x: Math.round(p.x), y: Math.round(p.y) });
  }
  return out;
}

/** `n` points from the spine's first point to its last, the ENDS INCLUDED — a run strung between
 *  two things (the first and last table of a row) rather than laid within one. One point is the middle. */
export function spanAlong(spine: readonly Point[], n: number): Point[] {
  const L = spineLength(spine);
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const p = pointAlong(spine, n === 1 ? L / 2 : (i * L) / (n - 1));
    return { x: Math.round(p.x), y: Math.round(p.y) };
  });
}

// ponytail: self-check. Run: npm run check:spine
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (p: Point, q: Point, tol: number) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;

  // A rectangle: its long axis, end to end.
  const rect = footprintSpine({ kind: "rect", widthMm: 2400, depthMm: 1000 });
  assert(rect.length === 2 && near(rect[0], { x: -1200, y: 0 }, 1) && near(rect[1], { x: 1200, y: 0 }, 1), "a rectangle's spine is its long axis");
  const tall = footprintSpine({ kind: "rect", widthMm: 800, depthMm: 2000 });
  assert(near(tall[0], { x: 0, y: -1000 }, 1) && near(tall[1], { x: 0, y: 1000 }, 1), "…vertical when the depth is the long side");
  const round = footprintSpine({ kind: "circle", diameterMm: 1800 });
  assert(near(round[0], { x: -900, y: 0 }, 1) && near(round[1], { x: 900, y: 0 }, 1), "a round's spine is its horizontal diameter");

  // Three along a 2.4m table: symmetric, the middle one dead centre, inset from the ends.
  const three = alongSpine(rect, 3);
  assert(three.length === 3 && near(three[1], { x: 0, y: 0 }, 1) && Math.abs(three[0].x + three[2].x) < 1, "three along a rectangle are symmetric about its middle");
  assert(three[0].x > -1200 * 0.92 - 1 && three[0].x < -400, "…and inset from the ends");
  assert(near(alongSpine(rect, 1)[0], { x: 0, y: 0 }, 1), "one along is the middle");
  assert(near(pointAlong(rect, 600), { x: -600, y: 0 }, 1), "pointAlong walks the line");
  assert(Math.abs(spineParam(rect, { x: 300, y: 80 }) - 1500) < 1, "spineParam is the distance along to the nearest point");
  const strung = spanAlong([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 6000, y: 0 }], 4);
  assert(strung.length === 4 && strung[0].x === 0 && strung[3].x === 6000 && strung[1].x === 2000, "spanAlong strings a run end to end, the ends included");
  assert(spanAlong([{ x: 0, y: 0 }, { x: 6000, y: 0 }], 1)[0].x === 3000, "…one is the middle");

  // A half ring (an arc head table, as footprint.ts builds it: outer radius 2m, band 60cm): the
  // spine runs ROUND the band, not across the air inside it — every point on it is inside the
  // outline, about the band's middle radius, and it starts near one end and finishes near the
  // other.
  const R = 2000, r = 1400;
  const arc: Point[] = [];
  for (let k = 0; k <= 36; k++) arc.push({ x: R * Math.cos(Math.PI - (k * Math.PI) / 36), y: -R * Math.sin(Math.PI - (k * Math.PI) / 36) });
  for (let k = 36; k >= 0; k--) arc.push({ x: r * Math.cos(Math.PI - (k * Math.PI) / 36), y: -r * Math.sin(Math.PI - (k * Math.PI) / 36) });
  const ring = flatRing({ outline: arc });
  const arcSpine = footprintSpine({ kind: "custom", outline: arc });
  assert(arcSpine.length >= 8, "a curved band's spine has the points to follow the curve");
  const mid = (R + r) / 2;
  const cx = 0, cy = 0; // the ring is drawn about the origin, and the custom footprint's box centre is where footprintOutlines puts it
  void cx; void cy;
  // In the footprint's frame the outline is re-centred on its box, so compare radii about the box
  // centre: (0, -R/2 + something). Read the centre back off the first/last outline points instead.
  const outlines = footprintOutlines({ kind: "custom", outline: arc })[0].outline;
  const centre = { x: (outlines[0].x + outlines[36].x) / 2, y: outlines[0].y };
  for (const p of arcSpine) {
    const rad = Math.hypot(p.x - centre.x, p.y - centre.y);
    assert(Math.abs(rad - mid) < 120, `the spine keeps to the middle of the band (r=${rad.toFixed(0)} vs ${mid})`);
    assert(signedDistance(p.x, p.y, flatRing(footprintOutlines({ kind: "custom", outline: arc })[0])) > 0, "…and inside the outline");
  }
  void ring;
  const ends = [arcSpine[0], arcSpine[arcSpine.length - 1]];
  assert(ends.every((e) => Math.abs(e.y - centre.y) < 600), "the spine reaches down toward both ends of the arc");
  assert(ends[0].x * ends[1].x < 0, "…one end each side");
  const apex = alongSpine(arcSpine, 1)[0];
  assert(Math.abs(apex.x - centre.x) < 60 && apex.y < centre.y - 1000, "one item along an arc lands at its apex");
  const five = alongSpine(arcSpine, 5);
  assert(five.every((p) => Math.abs(Math.hypot(p.x - centre.x, p.y - centre.y) - mid) < 130), "five along an arc all sit on the band");

  // A fan (a sector): the spine runs down its axis of symmetry toward the point.
  const fan: Point[] = [{ x: 0, y: 1200 }];
  for (let k = 0; k <= 12; k++) fan.push({ x: 2000 * Math.sin(-0.6 + (k * 1.2) / 12), y: 1200 - 2000 * Math.cos(-0.6 + (k * 1.2) / 12) });
  const fanSpine = footprintSpine({ kind: "custom", outline: fan });
  assert(fanSpine.every((p) => Math.abs(p.x) < 60), "a fan's spine is its axis of symmetry");
  assert(fanSpine[0].y !== fanSpine[fanSpine.length - 1].y && Math.abs(fanSpine[0].y - fanSpine[fanSpine.length - 1].y) > 800, "…and runs from the wide end toward the point");

  // A closed oval ring: the spine is one loop, not a line walked twice.
  const oval: Point[] = [];
  for (let k = 0; k < 48; k++) oval.push({ x: 2000 * Math.cos((k * 2 * Math.PI) / 48), y: 1200 * Math.sin((k * 2 * Math.PI) / 48) });
  for (let k = 47; k >= 0; k--) oval.push({ x: 1400 * Math.cos((k * 2 * Math.PI) / 48), y: 600 * Math.sin((k * 2 * Math.PI) / 48) });
  // (Two concentric rings joined by a hairline — the keyhole the oval-ring builder draws.)
  const ovalSpine = footprintSpine({ kind: "custom", outline: [...oval, oval[0]] });
  assert(spineLength(ovalSpine) > 8000 && spineLength(ovalSpine) < 13000, `a closed ring's spine is one loop round it (${spineLength(ovalSpine).toFixed(0)}mm)`);

  console.log("spine: all checks passed");
}
