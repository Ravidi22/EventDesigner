// A pool's שפה, and an edging round any surface (the user, 2026-11-07: "add to pool שפה like a
// stroke"; spec docs/superpowers/specs/2026-11-07-venue-heights-rails-and-covers-design.md §9).
//
// The band lies INSIDE the feature's outline and the water shrinks: the outline — the box the
// handles drag, the two numbers the bar shows — is the pool's, and the rim is part of it. So the
// band is the hollow band's (lib/studio/footprint.ts buildHollow), `widthMm` deep, one keyhole round
// the whole outline, and what lies inside it is the inset outline (insetOutline): the same offset
// arithmetic, so an ellipse's water is the ellipse's quarters moved in, a round pool's is
// concentric, and a band as deep as the shape is the solid shape — no water at all.
//
// Nothing is stored but the spec (StructureFeature.rim): every reader asks here, per feature object
// (features are replaced on every edit, never mutated, so the cache needs no key but the object):
//   - the plan draws the band in its material and the water — or the surface's own material —
//     inside (components/rim-fill.tsx, on /halls, the sketch and both printed looks);
//   - the 3D cuts the floor at the WATER's edge and lays the band as a slab (lib/scene/envelope.ts);
//   - the sketch's clearance and tape read a pool as its water (obstacleFootprint): the rim is floor
//     people stand on.
import type { Point } from "@/lib/studio/hall";
import { buildHollow, flattenEdge, footprintOutlines, insetOutline, type BuiltOutline, type Footprint } from "@/lib/studio/footprint";
import { featureFootprint, type FeatureRim, type StructureFeature } from "./structure";

/** A new rim's band, when its material is picked before a width is typed: 30cm of stone — a pool's
 *  usual coping. */
export const DEFAULT_RIM_MM = 300;
export const DEFAULT_RIM_MATERIAL: FeatureRim["material"] = "paving";

/** Which features may carry a rim: a pool, and any surface (a lawn's kerb, a bed's edging). Not a
 *  fountain — its basin is its symbol's. */
export const takesRim = (f: Pick<StructureFeature, "kind">): boolean => f.kind === "pool" || f.kind === "surface";

/** The feature's rim, when it has one that draws anything: a pool or a surface, a positive width. */
export function rimSpecOf(f: Pick<StructureFeature, "kind" | "rim">): FeatureRim | null {
  const r = f.rim;
  return takesRim(f) && r && Number.isFinite(r.widthMm) && r.widthMm > 0 ? r : null;
}

/** A rim read off its feature, in the feature's OWN frame (centred on its origin, unturned — where
 *  featureFootprint draws). */
export interface RimReading {
  rim: FeatureRim;
  /** The feature's outline(s) — the rim's outer edge. */
  outer: BuiltOutline[];
  /** What lies inside the band, one per outer outline that keeps a middle. Empty = the band is the
   *  whole shape: no water. */
  inner: BuiltOutline[];
  /** The band itself, as a footprint (one keyhole per outline — buildHollow's closed band — or the
   *  whole outline when nothing is left inside). A `multi`, so nothing recentres it. */
  band: MultiFootprint;
  /** The inside as a footprint, null when there is none. A `multi` too: an inner outline is not
   *  centred on its own box when the shape is not symmetric, and recentring it would move the water. */
  inside: MultiFootprint | null;
}

type MultiFootprint = Extract<Footprint, { kind: "multi" }>;

const READINGS = new WeakMap<StructureFeature, RimReading | null>();

/** The feature's rim, read once per feature object. Null without one (rimSpecOf). */
export function rimOf(f: StructureFeature): RimReading | null {
  if (READINGS.has(f)) return READINGS.get(f)!;
  const rim = rimSpecOf(f);
  let reading: RimReading | null = null;
  if (rim) {
    const outer = footprintOutlines(featureFootprint(f));
    const inner: BuiltOutline[] = [];
    const band: BuiltOutline[] = [];
    for (const o of outer) {
      const hole = insetOutline(o, rim.widthMm);
      if (hole) inner.push(hole);
      // buildHollow's closed band: the outline, a cap in, the inner edge back — or the solid
      // outline when nothing is left inside, the same answer insetOutline gave.
      band.push(...(hole ? buildHollow(o, { bandMm: rim.widthMm }) : [o]));
    }
    reading = { rim, outer, inner, band: { kind: "multi", parts: band }, inside: inner.length ? { kind: "multi", parts: inner } : null };
  }
  READINGS.set(f, reading);
  return reading;
}

/** What lies inside a feature's rim as a footprint: a pool's WATER, a surface's own material. The
 *  whole footprint for a feature with no rim; null when the rim takes the whole shape. */
export function insideFootprint(f: StructureFeature): Footprint | null {
  const r = rimOf(f);
  return r ? r.inside : featureFootprint(f);
}

/** The same as outlines in the feature's frame — what the 3D cuts out of the floor (its well).
 *  Empty when the rim takes the whole shape. */
export function insideOutlines(f: StructureFeature): BuiltOutline[] {
  const r = rimOf(f);
  return r ? r.inner : footprintOutlines(featureFootprint(f));
}

/** A feature as an OBSTACLE — what a table keeps clear of and the tape measures to. A pool with a
 *  rim is its WATER: the rim is floor, people stand on it (the user, 2026-11-07). A pool that is all
 *  rim is the solid it is (buildHollow's rule), and everything else its footprint. */
export function obstacleFootprint(f: StructureFeature): Footprint {
  const r = f.kind === "pool" ? rimOf(f) : null;
  return r?.inside ?? featureFootprint(f);
}

/** The rim's width as a figure on the plan: from the outer edge's point furthest along +x (the
 *  middle of that run, where several tie) straight across to the nearest point of the inner edge.
 *  In the feature's own frame. Null without a rim, or with no inside to measure to. */
export function rimMeasure(f: StructureFeature): { a: Point; b: Point } | null {
  const r = rimOf(f);
  if (!r || !r.inner.length) return null;
  // Every edge walked in steps — a straight one too, so a rectangle's right side is a run of points
  // whose middle is ON the side (its two corners alone would put the figure on a corner).
  const samples = (o: BuiltOutline): Point[] =>
    o.outline.flatMap((p, i) => {
      const q = o.outline[(i + 1) % o.outline.length];
      const curve = o.edgeCurves?.[i];
      const pts = curve ? flattenEdge(p, q, curve, 32) : Array.from({ length: 33 }, (_, k) => ({ x: p.x + ((q.x - p.x) * k) / 32, y: p.y + ((q.y - p.y) * k) / 32 }));
      return pts.slice(0, -1);
    });
  const outerPts = r.outer.flatMap(samples);
  const maxX = Math.max(...outerPts.map((p) => p.x));
  // The run along the extreme (a rectangle's whole right side) — its middle, not a corner of it.
  const run = outerPts.filter((p) => p.x >= maxX - 0.5);
  const ys = run.map((p) => p.y);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const a = { x: maxX, y: run.reduce((best, p) => (Math.abs(p.y - midY) < Math.abs(best - midY) ? p.y : best), run[0].y) };
  let b = a;
  let bd = Infinity;
  for (const o of r.inner) {
    o.outline.forEach((p, i) => {
      const q0 = p;
      const pts = flattenEdge(q0, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i], 64);
      for (let k = 1; k < pts.length; k++) {
        const s = pts[k - 1];
        const e = pts[k];
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((a.x - s.x) * dx + (a.y - s.y) * dy) / l2));
        const q = { x: s.x + dx * t, y: s.y + dy * t };
        const d = Math.hypot(q.x - a.x, q.y - a.y);
        if (d < bd) [b, bd] = [q, d];
      }
    });
  }
  return bd < Infinity ? { a, b } : null;
}

/** What the bar writes for the rim: the fields given over the feature's own, a new rim starting
 *  DEFAULT_RIM_MM of DEFAULT_RIM_MATERIAL; a width of 0 (or `null`) takes the rim away — the key is
 *  dropped, so the pool reads as one that never had one. */
export function rimPatch(f: Pick<StructureFeature, "rim">, patch: Partial<FeatureRim> | null): Pick<StructureFeature, "rim"> {
  if (patch === null) return { rim: undefined };
  // A stored rim with no width (half-saved, hand-edited) restarts at the default like a new one.
  const was = f.rim && f.rim.widthMm > 0 ? f.rim : { ...f.rim, widthMm: DEFAULT_RIM_MM };
  const next: FeatureRim = { material: DEFAULT_RIM_MATERIAL, ...was, ...patch };
  if (!(next.widthMm > 0)) return { rim: undefined };
  const clean: FeatureRim = { widthMm: Math.round(next.widthMm), material: next.material };
  if (next.raisedMm && next.raisedMm > 0) clean.raisedMm = Math.round(next.raisedMm);
  if (next.style && Object.keys(next.style).length) clean.style = next.style;
  return { rim: clean };
}
