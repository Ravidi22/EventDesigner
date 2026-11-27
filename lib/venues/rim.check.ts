// npm run check:rim — the self-check of ./rim.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { flattenEdge, footprintOutlines, sampledBounds, type BuiltOutline, type Footprint } from "@/lib/studio/footprint";
import { featureFootprint, type StructureFeature } from "./structure";
import { DEFAULT_RIM_MM, insideFootprint, insideOutlines, obstacleFootprint, rimMeasure, rimOf, rimPatch, rimSpecOf } from "./rim";

// ponytail: self-check. Run: npx tsx lib/venues/rim.ts
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
