// Node-side smoke test of components/scene without a GPU: geometry counts, NaN-freedom, the
// frame mapping (plan +y → three +z, extrusion up), winding (signed volume positive = outward
// faces), plane facing, the cache, the materials table and the camera's inverse mapping.
import { DoubleSide, Vector3 } from "three";
import { GeometryCache, bodyGeometry, geometrySignature, partGeometry } from "@/components/scene/scene-geometry";
import { previewScene } from "@/components/scene/preview-scene";
import { MaterialCache, tint } from "@/components/scene/scene-materials";
import { toWorld } from "@/lib/scene/frame";
import { vec3, type BodyNode } from "@/lib/scene/types";

let failed = 0;
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    failed++;
    console.error("FAIL", msg);
  } else console.log("ok  ", msg);
};
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;

function bbox(g: ReturnType<typeof partGeometry>) {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
}

function signedVolume(g: ReturnType<typeof partGeometry>): number {
  const flat = g.index ? g.toNonIndexed() : g;
  const p = flat.getAttribute("position");
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

function windingNormalY(g: ReturnType<typeof partGeometry>): number {
  const flat = g.index ? g.toNonIndexed() : g;
  const p = flat.getAttribute("position");
  const a = new Vector3().fromBufferAttribute(p, 0);
  const b = new Vector3().fromBufferAttribute(p, 1);
  const c = new Vector3().fromBufferAttribute(p, 2);
  return b.sub(a).cross(c.sub(a)).normalize().y;
}

function noNaN(g: ReturnType<typeof partGeometry>): boolean {
  for (const name of ["position", "normal", "uv"]) {
    const att = g.getAttribute(name);
    if (!att) return false;
    const arr = att.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  }
  return true;
}

// --- parts ---
const box = partGeometry({ shape: "box", w: 1000, d: 500, h: 200, at: vec3(0, 0, 0) });
const bb = bbox(box);
assert(near(bb.minX, -0.5) && near(bb.maxX, 0.5) && near(bb.minY, 0) && near(bb.maxY, 0.2) && near(bb.minZ, -0.25) && near(bb.maxZ, 0.25), "box: metres, base on y=0, plan depth along three z");
assert(near(signedVolume(box), 0.1, 1e-6), "box: outward winding (signed volume +0.1 m³)");

const ext = partGeometry({ shape: "extrude", outline: { outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 2000 }, { x: 0, y: 2000 }] }, h: 300, at: vec3(0, 0, 0) });
const eb = bbox(ext);
assert(near(eb.minX, 0) && near(eb.maxX, 1) && near(eb.minZ, 0) && near(eb.maxZ, 2) && near(eb.minY, 0) && near(eb.maxY, 0.3), "extrude: plan (x, y) lands on three (x, z), extruded UP 0.3 m");
assert(near(signedVolume(ext), 0.6, 1e-6), "extrude: outward winding after the mirror + −90° turn (signed volume +0.6 m³)");
assert(noNaN(ext), "extrude: finite attributes");

const bowed = partGeometry({ shape: "extrude", outline: { outline: [{ x: -500, y: -500 }, { x: 500, y: -500 }, { x: 500, y: 500 }, { x: -500, y: 500 }], edgeCurves: [null, { c1: { x: 400, y: 0 }, c2: { x: 400, y: 0 } }, null, null] }, h: 100, at: vec3(0, 0, 0) });
assert(bbox(bowed).maxX > 0.7, "extrude: a bezier edge bows the outline past the square (absoluteControlPoints honoured)");

const up = partGeometry({ shape: "plane", outline: { outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }] }, at: vec3(0, 0, 0), side: "up" });
assert(windingNormalY(up) > 0.99 && near(up.getAttribute("normal").getY(0), 1), "plane up: faces +y by winding and by normal");
const down = partGeometry({ shape: "plane", outline: { outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }] }, at: vec3(0, 0, 0), side: "down" });
assert(windingNormalY(down) < -0.99 && near(down.getAttribute("normal").getY(0), -1), "plane down: faces −y by winding and by normal");
const db = bbox(down);
assert(near(db.minZ, 0) && near(db.maxZ, 1) && near(db.minX, 0) && near(db.maxX, 1), "plane down: still lies on plan (x, y) → three (x, z)");
const both = partGeometry({ shape: "plane", outline: { outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 1000 }] }, at: vec3(0, 0, 0), side: "both" });
assert(both.getAttribute("position").count === 6, "plane both: two faces");

const cyl = partGeometry({ shape: "cylinder", rTop: 100, rBottom: 300, h: 700, at: vec3(0, 0, 0) });
const cb = bbox(cyl);
assert(near(cb.minY, 0) && near(cb.maxY, 0.7) && near(cb.maxX, 0.3, 1e-3), "cylinder: base at 0, bottom radius 0.3");

const lathe = partGeometry({ shape: "lathe", profile: [{ r: 500, z: 0 }, { r: 400, z: 700 }, { r: 0, z: 720 }], at: vec3(0, 0, 0) });
const lb = bbox(lathe);
assert(near(lb.minY, 0) && near(lb.maxY, 0.72) && near(lb.maxX, 0.5, 1e-3), "lathe: (r, z) revolved about the vertical");

const sphere = partGeometry({ shape: "sphere", r: 250, at: vec3(0, 0, 0) });
const sb = bbox(sphere);
assert(near(sb.minY, -0.25) && near(sb.maxY, 0.25), "sphere: centred");

const ribbon = partGeometry({ shape: "ribbon", path: [{ x: 0, y: 0 }, { x: 3000, y: 0 }], h: 600, at: vec3(0, 0, 0), pleatMm: 150, amplitudeMm: 40 });
const rb = bbox(ribbon);
assert(ribbon.getAttribute("position").count === 12 * 80 && noNaN(ribbon), "ribbon: a pleat every 150 sampled every 37.5 → 80 quads × 12 vertices, finite");
assert(near(rb.minY, 0) && near(rb.maxY, 0.6) && rb.maxZ > 0.03 && rb.minZ < -0.03, "ribbon: 0.6 high, swung ±40 mm by the sine");
const flatRibbon = partGeometry({ shape: "ribbon", path: [{ x: 0, y: 0 }, { x: 0, y: 2000 }], h: 1000, at: vec3(0, 0, 0) });
assert(flatRibbon.getAttribute("position").count === 12 && near(bbox(flatRibbon).maxZ, 2), "ribbon: flat = one quad both faces, along plan y → three z");

// --- bodies ---
const scene = previewScene();
const bodies = scene.nodes.filter((n): n is BodyNode => n.kind === "body");
for (const b of bodies) {
  const built = bodyGeometry(b);
  assert(built.length > 0 && built.every((g) => g.geometry.getAttribute("position").count > 0 && noNaN(g.geometry)), `body ${b.id}: ${built.length} material group(s), finite`);
}
const table = bodies.find((b) => b.id === "table")!;
const tableBuilt = bodyGeometry(table);
assert(tableBuilt.length === 2, "table: wood top and brass stem/foot merge into two groups");
const top = tableBuilt.find((g) => g.material.texture === "wood")!.geometry;
const tb = bbox(top);
assert(near(tb.minY, 0.72) && near(tb.maxY, 0.75), "table top: at 720–750 mm");
const chairs = bodies.find((b) => b.id === "chairs")!;
assert(chairs.instances.length === 8 && chairs.instances[4].mirrored === true, "chairs: 8 instances, one mirrored");
const chairBuilt = bodyGeometry(chairs);
assert(chairBuilt.length === 1 && chairBuilt[0].geometry.getAttribute("position").count === 6 * 36, "chairs: six boxes merged into one geometry (36 vertices each, non-indexed)");
const partAt = bodyGeometry({ ...chairs, parts: [{ shape: "box", w: 100, d: 100, h: 100, at: vec3(1000, 2000, 300), rotDeg: 90 }] })[0].geometry;
const pb = bbox(partAt);
assert(near(pb.minX, 0.95) && near(pb.maxX, 1.05) && near(pb.minZ, 1.95) && near(pb.maxZ, 2.05) && near(pb.minY, 0.3) && near(pb.maxY, 0.4), "a part's at is its base centre, through toWorld");
const turned = bodyGeometry({ ...chairs, parts: [{ shape: "box", w: 1000, d: 100, h: 100, at: vec3(0, 0, 0), rotDeg: 90 }] })[0].geometry;
const tt = bbox(turned);
assert(near(tt.minZ, -0.5) && near(tt.maxZ, 0.5) && near(tt.minX, -0.05) && near(tt.maxX, 0.05), "a part turned 90° clockwise on the plan lays its width along plan +y = three z");

// --- signature + cache ---
const sig1 = geometrySignature(chairs);
const sig2 = geometrySignature({ ...chairs, instances: [] });
assert(sig1 === sig2, "signature ignores instances (they are matrices, not geometry)");
const sig3 = geometrySignature({ ...chairs, parts: [{ ...chairs.parts[0], h: 41 } as BodyNode["parts"][number], ...chairs.parts.slice(1)] });
assert(sig1 !== sig3, "signature changes with a part's number");
const cache = new GeometryCache();
const first = cache.get(chairs);
assert(cache.get({ ...chairs }) === first, "cache: an equal body hits");
assert(cache.get({ ...chairs, parts: chairs.parts.slice(1) }) !== first, "cache: a changed body rebuilds");
cache.sweep(new Set());
assert(cache.get(chairs) !== first, "cache: sweep drops what is not live");
cache.dispose();

// --- materials ---
assert(tint("#ffffff", "#000000", 0.5) === "#808080", "tint: halfway to black");
const materials = new MaterialCache();
const metal = materials.get({ colour: "#ff0000", kind: "metal" }, true);
assert(metal.side === DoubleSide && near(metal.metalness, 0.85) && near(metal.roughness, 0.35), "metal, mirrored: two-sided, the table's numbers");
assert(materials.get({ colour: "#ff0000", kind: "metal" }, true) === metal, "materials: cached by (ref, mirrored)");
assert(materials.get({ colour: "#ff0000", kind: "metal" }, false) !== metal, "materials: the unmirrored one is another material");
const glass = materials.get({ colour: "#e8f0f5", kind: "glass", opacity: 0.35 }, false);
assert(glass.transparent && near(glass.opacity, 0.35) && glass.depthWrite === false, "glass: transparent, no depth write");
const wood = materials.get({ colour: "#b98a5e", kind: "matte", texture: "wood" }, false);
assert(wood.map === null && wood.color.getHexString() !== "ffffff", "textured ref without a document: no map, the colour kept");
materials.dispose();

// --- frame round trip (the camera's inverse) ---
const w = toWorld(vec3(1000, 2000, 750));
assert(near(w[0], 1) && near(w[1], 0.75) && near(w[2], 2), "toWorld as frame.ts states it");

console.log(failed ? `\n${failed} FAILED` : "\nscene viewer smoke ok");
process.exit(failed ? 1 : 0);
