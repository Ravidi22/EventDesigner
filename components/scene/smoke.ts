// Node-side smoke test of components/scene without a GPU: geometry counts, NaN-freedom, the
// frame mapping (plan +y → three +z, extrusion up), winding (signed volume positive = outward
// faces), plane facing, holes, the tilt rule, the torus, the cache and its far box, the materials
// table (with the floors' polygon offset), the viewer's pure rules (lights, LOD, floor ranks) and
// the camera's inverse mapping.
import { DoubleSide, Vector3 } from "three";
import { GeometryCache, bodyGeometry, geometrySignature, partGeometry, proxyGeometry } from "@/components/scene/scene-geometry";
import { previewScene } from "@/components/scene/preview-scene";
import { MaterialCache, tint } from "@/components/scene/scene-materials";
import { CHAIR_BOX_MM, floorRank, intensityOf, lightDistanceM, lodVisibility, pickLit, polygonOffsetOf, renderOrderOf } from "@/components/scene/scene-rules";
import { CAPABLE, MODEST, resolveDevice } from "@/components/scene/device";
import { COMPOSED_ASPECT, fitFov,
  CENTRED,
  FOV_MAX_DEG,
  FOV_MIN_DEG,
  HEAD_PITCH_MAX_DEG,
  HEAD_YAW_MAX_DEG,
  RECENTRE_MS,
  dragHead,
  easedHead,
  pinchHead,
  resumeStop,
  samePose,
  tourFrom,
  turnedLook,
  wheelHead,
  zoomedFov,
} from "@/components/scene/camera-rules";
import { toWorld } from "@/lib/scene/frame";
import { vec3, type BodyNode, type Part } from "@/lib/scene/types";

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

/** The summed area of every triangle, in m². */
function triangleArea(g: ReturnType<typeof partGeometry>): number {
  const flat = g.index ? g.toNonIndexed() : g;
  const p = flat.getAttribute("position");
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

/** The mean of the vertices `pick` accepts. */
function centroidWhere(g: ReturnType<typeof partGeometry>, pick: (v: Vector3) => boolean): Vector3 {
  const p = g.getAttribute("position");
  const v = new Vector3();
  const sum = new Vector3();
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (!pick(v)) continue;
    sum.add(v);
    n++;
  }
  return n ? sum.divideScalar(n) : sum;
}

const square = (s: number, cx = 0, cy = 0) => ({
  outline: [
    { x: cx - s / 2, y: cy - s / 2 },
    { x: cx + s / 2, y: cy - s / 2 },
    { x: cx + s / 2, y: cy + s / 2 },
    { x: cx - s / 2, y: cy + s / 2 },
  ],
});
const reversed = (o: { outline: { x: number; y: number }[] }) => ({ outline: [...o.outline].reverse() });

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

// --- holes ---
const solid = partGeometry({ shape: "plane", outline: square(1000), at: vec3(0, 0, 0) });
const holed = partGeometry({ shape: "plane", outline: square(1000), holes: [square(400)], at: vec3(0, 0, 0) });
assert(near(triangleArea(solid), 1) && near(triangleArea(holed), 0.84), "plane: a 400 square hole takes 0.16 m² off a 1000 square (0.84 left)");
const sameWinding = partGeometry({ shape: "plane", outline: square(1000), holes: [reversed(square(400))], at: vec3(0, 0, 0) });
assert(near(triangleArea(sameWinding), 0.84), "plane: a hole handed in the outline's own winding is normalised and still cut");
assert(windingNormalY(holed) > 0.99 && noNaN(holed), "plane with a hole: still faces +y, finite");
const twoHoles = partGeometry({ shape: "plane", outline: square(2000), holes: [square(400, -500, 0), square(400, 500, 0)], at: vec3(0, 0, 0), side: "down" });
assert(near(triangleArea(twoHoles), 4 - 0.32) && windingNormalY(twoHoles) < -0.99, "plane down with two holes: both cut, still faces −y");
const degenerateHole = partGeometry({ shape: "plane", outline: square(1000), holes: [{ outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, { outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }] }], at: vec3(0, 0, 0) });
assert(near(triangleArea(degenerateHole), 1), "plane: a two-point hole and a zero-area hole are ignored");
const holedExtrude = partGeometry({ shape: "extrude", outline: square(1000), holes: [square(400)], h: 300, at: vec3(0, 0, 0) });
assert(near(signedVolume(holedExtrude), 0.84 * 0.3, 1e-6) && noNaN(holedExtrude), "extrude with a hole: outward winding, volume = 0.84 × 0.3 m³ (the well's walls are built)");
const holedBowed = partGeometry({ shape: "extrude", outline: square(1000), holes: [{ outline: square(400).outline, edgeCurves: [null, { c1: { x: 100, y: 0 }, c2: { x: 100, y: 0 } }, null, null] }], h: 100, at: vec3(0, 0, 0) });
assert(signedVolume(holedBowed) < 0.084 - 1e-4 && signedVolume(holedBowed) > 0, "extrude: a hole's bezier edge bows it bigger (less volume left) — the curve is honoured on the hole");

// --- the tilt rule ---
const leaning = partGeometry({ shape: "box", w: 100, d: 100, h: 1000, at: vec3(0, 0, 0), tiltDeg: 45 });
const topOf = centroidWhere(leaning, (v) => v.y > 0.5);
const baseOf = centroidWhere(leaning, (v) => v.y < 0.1);
assert(near(topOf.x, 0, 1e-3) && near(topOf.y, 0.7071, 1e-3) && near(topOf.z, 0.7071, 1e-3), "tilt: a box 1000 high leaned 45° has its top 707 up and 707 toward three +z = plan +y");
assert(near(baseOf.x, 0, 1e-3) && near(baseOf.y, 0, 1e-3) && near(baseOf.z, 0, 1e-3), "tilt: …and its base centre stays put");
const leaningBack = partGeometry({ shape: "cylinder", rTop: 10, rBottom: 10, h: 1000, at: vec3(0, 0, 0), segments: 8, tiltDeg: -30 });
const topBack = centroidWhere(leaningBack, (v) => v.y > 0.5);
assert(near(topBack.y, 0.866, 2e-3) && near(topBack.z, -0.5, 2e-3), "tilt: a negative tilt leans the top toward plan −y");
const turnedLean = bodyGeometry({ ...previewScene().nodes.find((n): n is BodyNode => n.kind === "body" && n.id === "chairs")!, parts: [{ shape: "box", w: 100, d: 100, h: 1000, at: vec3(0, 0, 0), rotDeg: 90, tiltDeg: 45 }] })[0].geometry;
const turnedTop = centroidWhere(turnedLean, (v) => v.y > 0.5);
assert(near(turnedTop.x, -0.7071, 1e-3) && near(turnedTop.z, 0, 1e-3), "tilt + rotDeg 90: the lean follows the turn — the top goes toward plan −x (the part's own +y after a clockwise quarter turn)");
assert(near(signedVolume(leaning), 0.01, 1e-6), "tilt: a proper rotation — the winding stays outward");

// --- torus ---
const ring = partGeometry({ shape: "torus", r: 500, tube: 50, at: vec3(0, 0, 0) });
const rbx = bbox(ring);
assert(near(rbx.maxX - rbx.minX, 1.1, 1e-3) && near(rbx.maxZ - rbx.minZ, 1.1, 1e-3), "torus: 2(r + tube) wide both ways on the floor");
assert(near(rbx.minY, 0, 1e-6) && near(rbx.maxY, 0.1, 1e-3), "torus: 2·tube high with its BASE at 0, like every other part");
assert(noNaN(ring) && ring.getAttribute("position").count === (12 + 1) * (48 + 1), "torus: 12 round the tube × 48 round the ring, finite");
const uvRing = ring.getAttribute("uv");
let uMax = 0;
for (let i = 0; i < uvRing.count; i++) uMax = Math.max(uMax, uvRing.getX(i));
assert(near(uMax, 2 * Math.PI * 0.5, 1e-3), "torus: u runs the ring's circumference in metres, like every other UV");
const coarse = partGeometry({ shape: "torus", r: 500, tube: 50, at: vec3(0, 0, 0), segments: 16 });
assert(coarse.getAttribute("position").count === 13 * 17, "torus: segments is the count round the ring");

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
const tiltedPart: Part = { ...(chairs.parts[0] as Extract<Part, { shape: "box" }>), tiltDeg: 10 };
assert(geometrySignature({ ...chairs, parts: [tiltedPart, ...chairs.parts.slice(1)] }) !== sig1, "signature changes with a tilt");
const floorPlain: BodyNode = { ...chairs, parts: [{ shape: "plane", outline: square(1000), at: vec3(0, 0, 0) }] };
const floorHoled: BodyNode = { ...chairs, parts: [{ shape: "plane", outline: square(1000), holes: [square(300)], at: vec3(0, 0, 0) }] };
assert(geometrySignature(floorPlain) !== geometrySignature(floorHoled), "signature changes with a hole");
const ringBody: BodyNode = { ...chairs, parts: [{ shape: "torus", r: 300, tube: 20, at: vec3(0, 0, 0) }] };
assert(geometrySignature(ringBody) !== geometrySignature({ ...ringBody, parts: [{ shape: "torus", r: 300, tube: 25, at: vec3(0, 0, 0) }] }), "signature changes with a torus's tube");
const cache = new GeometryCache();
const first = cache.get(chairs);
assert(cache.get({ ...chairs }) === first, "cache: an equal body hits");
const chairBox = cache.proxy(chairs);
assert(cache.proxy({ ...chairs }) === chairBox, "cache: the far box is kept beside the geometry");
const cbx = bbox(chairBox);
assert(near(cbx.minX, -0.22) && near(cbx.maxX, 0.22) && near(cbx.minY, 0) && near(cbx.maxY, 0.9) && near(cbx.minZ, -0.22) && near(cbx.maxZ, 0.22), "far box: the chair's bounding box — 440 wide, 900 high, 440 deep, on the floor");
assert(chairBox.getAttribute("position").count === 24, "far box: one BoxGeometry, twelve triangles");
assert(cache.get({ ...chairs, parts: chairs.parts.slice(1) }) !== first, "cache: a changed body rebuilds");
assert(cache.proxy({ ...chairs, parts: chairs.parts.slice(1) }) !== chairBox, "cache: …and its box with it");
cache.sweep(new Set());
assert(cache.get(chairs) !== first, "cache: sweep drops what is not live");
cache.dispose();
assert(proxyGeometry([]).getAttribute("position") === undefined, "far box of nothing: an empty geometry, no NaN box");

// --- the phone's field of view ---
{
  assert(fitFov(55, COMPOSED_ASPECT) === 55 && fitFov(55, 2) === 55, "fov: a canvas as wide as the view was composed for, or wider, keeps it");
  const tall = fitFov(55, 390 / 700);
  assert(tall > 80 && tall <= 100, `fov: a phone held upright widens it to keep the room's breadth (${tall.toFixed(1)}°)`);
}

// --- materials ---
assert(tint("#ffffff", "#000000", 0.5) === "#808080", "tint: halfway to black");
const materials = new MaterialCache();
const metal = materials.get({ colour: "#ff0000", kind: "metal" }, true);
assert(metal.side === DoubleSide && near(metal.metalness, 0.92) && near(metal.roughness, 0.24), "metal, mirrored: two-sided and polished (reflects the environment)");
const cloth = materials.get({ colour: "#4b3a6e", kind: "fabric" }, false) as { sheen?: number };
assert((cloth.sheen ?? 0) > 0, "fabric: physical, with a sheen");
assert(near(materials.get({ colour: "#2b2a2e", kind: "matte", texture: "tile" }, false).roughness, 0.27), "a tiled floor is polished");
assert(materials.get({ colour: "#ff0000", kind: "metal" }, true) === metal, "materials: cached by (ref, mirrored)");
assert(materials.get({ colour: "#ff0000", kind: "metal" }, false) !== metal, "materials: the unmirrored one is another material");
const glass = materials.get({ colour: "#e8f0f5", kind: "glass", opacity: 0.35 }, false);
assert(glass.transparent && near(glass.opacity, 0.35) && glass.depthWrite === false, "glass: transparent, no depth write");
const wood = materials.get({ colour: "#b98a5e", kind: "matte", texture: "wood" }, false);
assert(wood.map === null && wood.color.getHexString() !== "ffffff", "textured ref without a document: no map, the colour kept");
const paving = { colour: "#d9d3c7", kind: "matte", texture: "paving" } as const;
const groundMat = materials.get(paving, false, -2);
const floorMat = materials.get(paving, false, 0);
const surfaceMat = materials.get(paving, false, 1);
assert(groundMat !== floorMat && floorMat !== surfaceMat, "materials: the same paving at three floor ranks is three materials");
assert(groundMat.polygonOffset && groundMat.polygonOffsetFactor === 2 && groundMat.polygonOffsetUnits === 2, "ground (rank −2): pushed back by a polygon offset of +2");
assert(!floorMat.polygonOffset, "floor (rank 0): no offset — the reference plane");
assert(surfaceMat.polygonOffset && surfaceMat.polygonOffsetFactor === -1, "a surface on the floor (rank 1): pulled toward the camera by −1");
assert(materials.get(paving, false) === floorMat, "materials: rank 0 is the plain material");
materials.dispose();

// --- the viewer's rules ---
assert(near(intensityOf(0.4), 1.5) && near(intensityOf(0.7), 5) && near(intensityOf(1), 7.5), "lights: a candle 1.5 cd, a bulb 5, a lamp 7.5");
assert(near(intensityOf(0.5), 1.5 + 3.5 / 3) && near(intensityOf(0), 0) && near(intensityOf(2), 7.5), "lights: linear between, clamped past 1");
assert(near(lightDistanceM(0.025), 1.6) && near(lightDistanceM(0.1), 1.9), "lights: a flame reaches 1.6 m, a lamp's bulb 1.9");
const lit = pickLit(
  [
    { index: 0, lamp: false, distance: 1 },
    { index: 1, lamp: true, distance: 50 },
    { index: 2, lamp: false, distance: 4 },
    { index: 3, lamp: true, distance: 9 },
    { index: 4, lamp: false, distance: 2 },
  ],
  3,
);
assert(lit.join() === "3,1,0", "lights: both lamps first (nearest first), then the nearest candle");
assert(pickLit([{ index: 0, lamp: false, distance: 1 }], 0).length === 0 && pickLit([], 5).length === 0, "lights: none asked or none there = none");
assert(pickLit([{ index: 7, lamp: false, distance: 1 }], 16).join() === "7", "lights: fewer emitters than the pool = all of them");
const fill: BodyNode["lod"] = { tier: "near", beyondMm: 15000 };
assert(lodVisibility(fill, false, 14000, 1).main && !lodVisibility(fill, false, 16000, 1).main, "lod: a near body shows up to its threshold and hides past it");
assert(!lodVisibility(fill, false, 8000, 0.5).main && lodVisibility(fill, false, 7000, 0.5).main, "lod: a phone's 0.5 halves the threshold");
const farBody: BodyNode["lod"] = { tier: "far", beyondMm: 15000 };
assert(!lodVisibility(farBody, false, 14000, 1).main && lodVisibility(farBody, false, 16000, 1).main, "lod: a far body is the complement");
assert(lodVisibility(undefined, true, CHAIR_BOX_MM - 1, 1).main && !lodVisibility(undefined, true, CHAIR_BOX_MM - 1, 1).far, "lod: a chair within 25 m is itself");
const boxed = lodVisibility(undefined, true, CHAIR_BOX_MM + 1, 1);
assert(!boxed.main && boxed.far, "lod: a chair past 25 m is its box, never both");
assert(!lodVisibility(undefined, true, 13000, 0.5).main && lodVisibility(undefined, true, 13000, 0.5).far, "lod: …at 12.5 m on a phone");
const gone = lodVisibility(fill, true, 30000, 1);
assert(!gone.main && !gone.far, "lod: a near body out of range shows neither itself nor a box");
assert(lodVisibility(undefined, false, 1e9, 1).main, "lod: a body with no lod and no box is always drawn");
const sceneBodies = previewScene().nodes.filter((n): n is BodyNode => n.kind === "body");
const rankOf = (id: string) => floorRank(sceneBodies.find((b) => b.id === id)!);
assert(rankOf("ground") === -2 && rankOf("floor") === 0, "floors: the ground ranks −2, a zone floor 0");
assert(rankOf("table") === null && rankOf("ceiling") === null && rankOf("leaves") === null, "floors: a table, a ceiling and a leaf (planes, but not a floor) do not rank");
const lawn: BodyNode = { ...sceneBodies[0], tag: { type: "feature" }, parts: [{ shape: "plane", outline: square(2000), at: vec3(0, 0, 1) }, { shape: "plane", outline: square(500), at: vec3(0, 0, 3) }] };
assert(floorRank(lawn) === 1, "floors: a surface feature ranks by its lowest plane's height over the floor (1 mm → 1)");
assert(floorRank({ ...lawn, parts: [{ shape: "plane", outline: square(2000), at: vec3(0, 0, 40) }] }) === 8, "floors: …capped at 8");
assert(floorRank({ ...lawn, parts: [...lawn.parts, { shape: "box", w: 100, d: 100, h: 100, at: vec3(0, 0, 0) }] }) === null, "floors: a feature with anything but planes is not a floor");
assert(polygonOffsetOf(-2) === 2 && polygonOffsetOf(3) === -3 && renderOrderOf(-2) < renderOrderOf(0) && renderOrderOf(0) < renderOrderOf(1) && renderOrderOf(8) < 0, "floors: offset is minus the rank; draw order follows the rank and every floor goes before the furniture");
assert(CAPABLE.pointLights === 16 && CAPABLE.lodScale === 1 && CAPABLE.shadows && MODEST.pointLights === 0 && MODEST.lodScale === 0.5 && !MODEST.shadows && MODEST.maxDpr <= 1.25 && MODEST.fogScale < 1, "device: the two profiles as spec §8 states them");
const partial = resolveDevice({ shadows: false, maxDpr: 1.25 });
assert(!partial.shadows && partial.maxDpr === 1.25 && partial.pointLights === 16 && partial.lodScale === 1, "device: a partial profile is filled from CAPABLE");

// --- frame round trip (the camera's inverse) ---
const w = toWorld(vec3(1000, 2000, 750));
assert(near(w[0], 1) && near(w[1], 0.75) && near(w[2], 2), "toWorld as frame.ts states it");

// --- the curated camera (./camera-rules.ts): the head, the zoom, the tour's resume ---
{
  const eye = vec3(0, 0, 1600);
  const ahead = vec3(5000, 0, 1600); // facing plan +x, level
  const same = turnedLook(eye, ahead, 0, 0);
  assert(same.x === ahead.x && same.y === ahead.y && same.z === ahead.z, "head: a centred head looks where the viewpoint looks");
  const left = turnedLook(eye, ahead, 90, 0);
  assert(near(left.x, 0, 1e-6) && near(left.y, -5000, 1e-6) && near(left.z, 1600, 1e-6), "head: +90° of yaw from facing plan +x faces plan −y, at the same distance and height");
  // …and that is a LEFT turn for the camera: three's +rotation about +y of the same direction.
  const w0 = toWorld(vec3(ahead.x - eye.x, ahead.y - eye.y, 0));
  const turned = new Vector3(w0[0], w0[1], w0[2]).applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const w1 = toWorld(vec3(left.x - eye.x, left.y - eye.y, 0));
  assert(near(turned.x, w1[0], 1e-6) && near(turned.z, w1[2], 1e-6), "head: plan yaw +θ is three's +θ about +y — a left turn, as a camera sees it");
  const up = turnedLook(eye, ahead, 0, 20);
  assert(up.z > ahead.z && near(Math.atan2(up.z - eye.z, up.x - eye.x), (20 * Math.PI) / 180, 1e-9), "head: +20° of pitch looks 20° up");
  const steep = turnedLook(eye, vec3(0, 1, -100000), 0, -20);
  assert(steep.z - eye.z < 0 && Math.hypot(steep.x - eye.x, steep.y - eye.y) > 0, "head: a tilt never flips the view over the pole");
  // A pixel of drag is a pixel of the room: 550 px tall at 55° is 0.1° a pixel.
  const d = dragHead(CENTRED, 10, -10, 550, 55, 55);
  assert(near(d.yawDeg, 1, 1e-9) && near(d.pitchDeg, -1, 1e-9) && d.fovDeltaDeg === 0, "drag: right turns the head left (yaw +), up tilts it down (pitch −) — the room follows the finger");
  const far = dragHead(CENTRED, 10000, 10000, 550, 55, 55);
  assert(far.yawDeg === HEAD_YAW_MAX_DEG && far.pitchDeg === HEAD_PITCH_MAX_DEG, "drag: the head stops at ±35° of yaw and ±20° of pitch");
  assert(zoomedFov(55, 100) === FOV_MAX_DEG && zoomedFov(55, -100) === FOV_MIN_DEG, "zoom: between 40° and 70°");
  assert(zoomedFov(30, 0) === 30 && zoomedFov(30, -10) === 30 && zoomedFov(30, 100) === FOV_MAX_DEG, "zoom: a viewpoint saved at 30° keeps it, and the zoom only widens it back toward the range");
  assert(wheelHead(CENTRED, 100, 55).fovDeltaDeg > 0 && wheelHead(CENTRED, -100, 55).fovDeltaDeg < 0, "wheel: down widens the view, up narrows it");
  const pinched = pinchHead(CENTRED, 100, 110, 55);
  assert(near(55 + pinched.fovDeltaDeg, 50, 1e-9), "pinch: fingers 10% apart narrow 55° to 50°");
  assert(near(55 + pinchHead(CENTRED, 100, 1000, 55).fovDeltaDeg, FOV_MIN_DEG, 1e-9), "pinch: …and never past 40°");
  const turnedHead = { yawDeg: 30, pitchDeg: -10, fovDeltaDeg: 6 };
  const half = easedHead(turnedHead, RECENTRE_MS / 2);
  assert(easedHead(turnedHead, 0).yawDeg === 30 && near(half.yawDeg, 15, 1e-9) && near(half.pitchDeg, -5, 1e-9), "recentre: eased, half way at half time");
  const home = easedHead(turnedHead, RECENTRE_MS);
  assert(home.yawDeg === 0 && home.pitchDeg === 0 && home.fovDeltaDeg === 0, "recentre: centred at 600 ms");
  const vp = { id: "a", name: "a", eye: vec3(0, 0, 1600), look: vec3(1000, 0, 1000) };
  assert(samePose(vp, { ...vp, eye: vec3(0.4, 0, 1600) }) && !samePose(vp, { ...vp, eye: vec3(5, 0, 1600) }) && !samePose(vp, { ...vp, fovDeg: 60 }), "fly: a pose within a millimetre is not worth a fly");

  const stops = ["a", "b", "c"].map((viewpointId) => ({ viewpointId, dwellMs: 4000, travelMs: 1500 }));
  const loop = { stops, loop: true };
  assert(resumeStop(loop, { stop: 1, viewpointId: "b", arrived: true }) === 2, "tour: ▶ after ⏸ at a stop goes on to the next");
  assert(resumeStop(loop, { stop: 1, viewpointId: "b", arrived: false }) === 1, "tour: ▶ after ⏸ mid-air finishes the leg it was on");
  assert(resumeStop(loop, { stop: 2, viewpointId: "c", arrived: true }) === 0, "tour: from the last stop a loop goes round");
  assert(resumeStop({ stops, loop: false }, { stop: 2, viewpointId: "c", arrived: true }) === 0, "tour: a finished one-way tour starts again");
  assert(resumeStop(loop, { stop: null, viewpointId: "c", arrived: true }) === 0 && resumeStop(loop, { stop: null, viewpointId: "b", arrived: true }) === 2, "tour: standing at a chip's viewpoint, ▶ goes on from it");
  assert(resumeStop(loop, { stop: null, viewpointId: null, arrived: true }) === 0, "tour: from anywhere else it starts at the first stop");
  const r = tourFrom(loop, 1);
  assert(r.tour.stops.map((s) => s.viewpointId).join() === "b,c,a" && r.indexOf(0) === 1 && r.indexOf(2) === 0, "tour: a loop played from stop 1 is b, c, a — and lights the designer's indices");
  const o = tourFrom({ stops, loop: false }, 1);
  assert(o.tour.stops.map((s) => s.viewpointId).join() === "b,c" && o.indexOf(1) === 2, "tour: a one-way tour played from stop 1 is b, c");
  assert(tourFrom(loop, 0).tour === loop, "tour: from the first stop it is the tour itself");
}

console.log(failed ? `\n${failed} FAILED` : "\nscene viewer smoke ok");
process.exit(failed ? 1 : 0);
