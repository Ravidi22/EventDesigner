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
import { buildHollow, flattenEdge, footprintOutlines, insetOutline, sampledBounds, type BuiltOutline, type Footprint } from "@/lib/studio/footprint";
import { featureFootprint, type FeatureRim, type StructureFeature } from "./structure";
import { isMain } from "../self-check";

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

// ponytail: self-check. Run: npx tsx lib/venues/rim.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;
  const pool = (over: Partial<StructureFeature> = {}): StructureFeature => ({
    id: "p",
    kind: "pool",
    label: "בריכה",
    x: 0,
    y: 0,
    widthMm: 12000,
    depthMm: 6000,
    heightMm: 0,
    shape: "ellipse",
    rotationDeg: 0,
    ...over,
  });
  const box = (fp: Footprint | null) => (fp ? sampledBounds(footprintOutlines(fp)) : null);
  const area = (o: BuiltOutline) => {
    const pts = o.outline.flatMap((p, i) => flattenEdge(p, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i], 32).slice(0, -1));
    return Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;
  };

  // No rim: everything reads as before — the water IS the footprint.
  {
    const bare = pool();
    assert(rimOf(bare) === null && rimSpecOf(bare) === null, "a pool with no rim has no rim");
    assert(JSON.stringify(insideFootprint(bare)) === JSON.stringify(featureFootprint(bare)), "…its water is its whole footprint");
    assert(JSON.stringify(obstacleFootprint(bare)) === JSON.stringify(featureFootprint(bare)), "…and so is the obstacle");
    assert(rimOf(pool({ rim: { widthMm: 0, material: "paving" } })) === null, "a rim 0 wide is no rim");
    assert(rimOf({ ...pool(), kind: "fountain", rim: { widthMm: 400, material: "paving" } }) === null, "a fountain takes no rim — its basin is its symbol");
  }

  // THE CASE (spec §9): a 12 × 6 m elliptical pool with a 40 cm rim holds water 11.2 × 5.2.
  {
    const rimmed = pool({ rim: { widthMm: 400, material: "paving" } });
    const r = rimOf(rimmed)!;
    assert(!!r && r.inner.length === 1, "a rimmed pool keeps water inside its band");
    const water = box(r.inside)!;
    assert(near(water.w, 11200) && near(water.h, 5200), `…11.2 × 5.2 inside a 12 × 6 ellipse with a 40cm rim (got ${water.w.toFixed(1)} × ${water.h.toFixed(1)})`);
    assert(near(water.cx, 0) && near(water.cy, 0), "…centred where the pool is");
    assert((r.inner[0].edgeCurves ?? []).filter(Boolean).length === 4, "…its edge still four bowed quarters — curves stay curves");
    const outer = box(featureFootprint(rimmed))!;
    assert(near(outer.w, 12000) && near(outer.h, 6000), "the pool's outline — its box — is untouched: the band is inside it");
    assert(r.band.kind === "multi" && r.band.parts.length === 1, "the band is ONE keyhole outline");
    assert(near(area(r.band.parts[0]), area(r.outer[0]) - area(r.inner[0]), 2000), "…whose area is the pool's less the water's");
    assert(JSON.stringify(obstacleFootprint(rimmed)) === JSON.stringify(r.inside), "the obstacle is the water: the rim is floor people stand on");
    assert(rimOf(rimmed) === r, "read once per feature object");
    const m = rimMeasure(rimmed)!;
    assert(near(m.a.x, 6000) && near(m.a.y, 0) && near(m.b.x, 5600, 2) && near(m.b.y, 0, 2), "the rim's figure runs across the band at the pool's +x apex");
  }

  // A round pool's water is concentric; a rectangle's square-cornered, its figure mid-side.
  {
    const round = rimOf(pool({ shape: "circle", widthMm: 4000, depthMm: 4000, rim: { widthMm: 500, material: "tile" } }))!;
    const w = box(round.inside)!;
    assert(near(w.w, 3000) && near(w.h, 3000), "a ⌀4 pool with a 50cm rim holds ⌀3 of water");
    const rect = pool({ shape: "rect", widthMm: 8000, depthMm: 4000, rim: { widthMm: 300, material: "deck" } });
    const rw = box(insideFootprint(rect))!;
    assert(near(rw.w, 7400) && near(rw.h, 3400), "a rectangle's water is 30cm in on every side");
    const rm = rimMeasure(rect)!;
    assert(near(rm.a.y, 0) && near(rm.b.x, 3700), "…its rim figured at the middle of a side, not a corner");
  }

  // A rim deeper than the pool is no water at all: the band is the solid (buildHollow's rule).
  {
    const solid = pool({ widthMm: 3000, depthMm: 1500, rim: { widthMm: 900, material: "paving" } });
    const r = rimOf(solid)!;
    assert(r.inner.length === 0 && r.inside === null, "a rim deeper than the pool leaves no water");
    assert(insideFootprint(solid) === null && insideOutlines(solid).length === 0, "…nothing inside, nothing cut out of the floor");
    assert(r.band.kind === "multi" && JSON.stringify(r.band.parts[0]) === JSON.stringify(r.outer[0]), "…the band is the whole outline");
    assert(JSON.stringify(obstacleFootprint(solid)) === JSON.stringify(featureFootprint(solid)), "…and the obstacle the whole shape");
    assert(rimMeasure(solid) === null, "…with no width to figure across");
  }

  // A surface takes an edging the same way; the obstacle rule is a pool's alone.
  {
    const lawn: StructureFeature = { ...pool(), id: "l", kind: "surface", surface: "grass", shape: "rect", widthMm: 6000, depthMm: 4000, rim: { widthMm: 200, material: "paving", raisedMm: 100 } };
    const inside = box(insideFootprint(lawn))!;
    assert(near(inside.w, 5600) && near(inside.h, 3600), "a lawn's 20cm kerb is inside its outline");
    assert(JSON.stringify(obstacleFootprint(lawn)) === JSON.stringify(featureFootprint(lawn)), "a surface's obstacle is untouched (it is no obstacle anyway)");
  }

  // The bar's patch: a new rim starts at the default, 0 takes it away, nothing empty is stored.
  {
    const fresh = rimPatch({}, { material: "tile" });
    assert(fresh.rim?.widthMm === DEFAULT_RIM_MM && fresh.rim.material === "tile" && !("raisedMm" in fresh.rim) && !("style" in fresh.rim), "a material picked first gives a rim of the default width, nothing else stored");
    const wide = rimPatch(fresh, { widthMm: 412.6, raisedMm: 0 });
    assert(wide.rim?.widthMm === 413 && wide.rim.material === "tile" && !("raisedMm" in wide.rim), "a width keeps the material; a flush rim stores no height");
    assert(rimPatch(wide, { raisedMm: 150 }).rim?.raisedMm === 150, "a raised rim stores its height");
    assert(rimPatch(wide, { widthMm: 0 }).rim === undefined && rimPatch(wide, null).rim === undefined, "a width of 0 takes the rim away");
  }

  console.log("rim self-check passed");
}
