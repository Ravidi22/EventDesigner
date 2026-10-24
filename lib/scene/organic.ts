// The arithmetic of the two organic parts — a BLOB (a canopy's clump, a shrub, a hydrangea's
// mophead) and a FROND (a palm's leaf, a eucalyptus sprig, a monstera leaf) — pure, so the shapes
// are the builder's to decide and `npx tsx lib/scene/organic.ts` can hold them, and the viewer
// (components/scene/scene-geometry.ts) only turns them into triangles.
//
// Seen on plan A in a browser (2026-10-24, Ravid: "work and improve the visual of the objects — the
// coliseum, the trees, the flowers"): trees built of smooth spheres read as cotton balls, palms of
// flat boxes as propellers, a hydrangea's head as a ping-pong ball. Nature is lumpy and leaves bend:
// a blob is a sphere whose surface a seeded sum of waves pushes in and out (a few big lumps for a
// tree's clump, many small ones for florets); a frond is a curved spine that rises and droops, with
// a blade or pairs of leaflets hung off it. Deterministic: the same seed is the same blob.
import { isMain } from "../self-check";

type V3 = { x: number; y: number; z: number };

/** mulberry32: a small seeded generator, so a blob's lumps are the same on every build. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for a string (an id), for seeding. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const WAVES = 9;

/**
 * How far a blob's surface stands out along the unit direction `u`, as a factor of its radius:
 * 1 + rough·f(u), f a sum of WAVES sines along seeded directions at about `lumps` cycles round the
 * girth (a second, finer octave at 2.6× for florets when `lumps` ≥ 8), normalised to about ±1.
 */
export function lumpField(seed: number, lumps: number, rough: number): (u: V3) => number {
  const rnd = seeded(seed);
  const waves: { d: V3; f: number; ph: number; a: number }[] = [];
  const octaves = lumps >= 8 ? 2 : 1;
  for (let o = 0; o < octaves; o++) {
    for (let k = 0; k < WAVES; k++) {
      // A uniform direction on the sphere.
      const z = 2 * rnd() - 1;
      const t = 2 * Math.PI * rnd();
      const s = Math.sqrt(1 - z * z);
      const freq = lumps * (o ? 2.6 : 1) * (0.75 + 0.5 * rnd());
      waves.push({ d: { x: s * Math.cos(t), y: s * Math.sin(t), z }, f: freq, ph: 2 * Math.PI * rnd(), a: o ? 0.45 : 1 });
    }
  }
  const norm = waves.reduce((m, w) => m + w.a, 0) / 2.2;
  return (u) => {
    let f = 0;
    for (const w of waves) f += w.a * Math.sin(w.f * (w.d.x * u.x + w.d.y * u.y + w.d.z * u.z) + w.ph);
    return 1 + rough * Math.max(-1.4, Math.min(1.4, f / norm));
  };
}

// --- the frond ------------------------------------------------------------------------------------

export interface FrondSpec {
  len: number;
  w: number;
  liftDeg?: number;
  droopDeg?: number;
  leaflets?: number;
  foldDeg?: number;
}

const SPINE_STEPS = 12;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** The frond's spine in its own frame (x across, y along its heading, z up), base at the origin:
 *  SPINE_STEPS + 1 points, rising at `liftDeg` and bending down by `droopDeg` at the tip — the
 *  bend growing as t^1.5, so a frond arches rather than kinks. */
export function frondSpine(f: FrondSpec): V3[] {
  const lift = f.liftDeg ?? 20;
  const droop = f.droopDeg ?? 40;
  const ds = f.len / SPINE_STEPS;
  const out: V3[] = [{ x: 0, y: 0, z: 0 }];
  let y = 0;
  let z = 0;
  for (let i = 1; i <= SPINE_STEPS; i++) {
    const tMid = (i - 0.5) / SPINE_STEPS;
    const a = rad(lift - droop * Math.pow(tMid, 1.5));
    y += ds * Math.cos(a);
    z += ds * Math.sin(a);
    out.push({ x: 0, y, z });
  }
  return out;
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const unit = (a: V3): V3 => {
  const L = Math.hypot(a.x, a.y, a.z) || 1;
  return mul(a, 1 / L);
};

/** Where along the spine `t` (0–1) is, and its tangent there. */
function along(spine: V3[], t: number): { p: V3; d: V3 } {
  const x = Math.max(0, Math.min(1, t)) * (spine.length - 1);
  const i = Math.min(spine.length - 2, Math.floor(x));
  const k = x - i;
  const a = spine[i];
  const b = spine[i + 1];
  return { p: add(a, mul(sub(b, a), k)), d: unit(sub(b, a)) };
}

/**
 * The frond as triangles in its own frame (mm; x across, y along, z up), three points each, front
 * faces only — the foliage material draws both sides. A BLADE is a strip either side of the spine,
 * pointed at both ends and widest two fifths along, its halves folded up `foldDeg` (a leaf's trough);
 * a PINNATE frond is `leaflets` pairs of narrow diamonds off the spine, longest in the middle,
 * swept forward and hanging `foldDeg` below the rachis, steeper toward the tip.
 */
export function frondTriangles(f: FrondSpec): V3[] {
  const spine = frondSpine(f);
  const tris: V3[] = [];
  const up: V3 = { x: 0, y: 0, z: 1 };
  const across: V3 = { x: 1, y: 0, z: 0 };
  const n = f.leaflets ?? 0;
  if (n <= 0) {
    const fold = rad(f.foldDeg ?? 15);
    const half = (t: number) => (f.w / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85);
    const edge = (t: number, side: 1 | -1): V3 => {
      const { p } = along(spine, t);
      const h = half(t);
      return add(p, add(mul(across, side * h * Math.cos(fold)), mul(up, h * Math.sin(fold))));
    };
    const steps = SPINE_STEPS;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const m0 = along(spine, t0).p;
      const m1 = along(spine, t1).p;
      for (const side of [1, -1] as const) {
        const e0 = edge(t0, side);
        const e1 = edge(t1, side);
        if (side === 1) tris.push(m0, e0, e1, m0, e1, m1);
        else tris.push(m0, m1, e1, m0, e1, e0);
      }
    }
    return tris;
  }
  // The rachis: a thin strip down the middle.
  const rw = Math.max(6, f.len * 0.012);
  for (let i = 0; i + 1 < spine.length; i++) {
    const a = spine[i];
    const b = spine[i + 1];
    const wa = rw * (1 - i / spine.length);
    const wb = rw * (1 - (i + 1) / spine.length);
    const al = add(a, mul(across, -wa));
    const ar = add(a, mul(across, wa));
    const bl = add(b, mul(across, -wb));
    const br = add(b, mul(across, wb));
    tris.push(al, ar, br, al, br, bl);
  }
  const hangBase = f.foldDeg ?? 30;
  for (let k = 0; k < n; k++) {
    const t = 0.1 + 0.88 * ((k + 0.5) / n);
    const { p, d } = along(spine, t);
    // Longest in the middle, short at the base and the tip.
    const L = f.w * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.12 + t)));
    const lw = Math.max(8, L * 0.11);
    const hang = rad(hangBase + 25 * t);
    for (const side of [1, -1] as const) {
      // Out to the side, swept forward along the spine, hanging below it.
      const out = unit(add(add(mul(across, side * Math.cos(hang)), mul(up, -Math.sin(hang))), mul(d, 0.55)));
      const tip = add(p, mul(out, L));
      const mid = add(p, mul(out, L * 0.45));
      // The leaflet's width lies across its own length, in the frond's plane as near as it can.
      const wdir = unit(sub(d, mul(out, d.x * out.x + d.y * out.y + d.z * out.z)));
      const ml = add(mid, mul(wdir, lw / 2));
      const mr = add(mid, mul(wdir, -lw / 2));
      if (side === 1) tris.push(p, ml, tip, p, tip, mr);
      else tris.push(p, tip, ml, p, mr, tip);
    }
  }
  return tris;
}

/** The z span of a frond about its base, [lowest, highest] — what a hung arrangement flips by. */
export function frondSpan(f: FrondSpec): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const p of frondTriangles(f)) {
    lo = Math.min(lo, p.z);
    hi = Math.max(hi, p.z);
  }
  return [lo, hi];
}

/** A blade's outline from above (x across, y along), for checks: its half width at `t`. */
export function bladeHalfWidth(f: FrondSpec, t: number): number {
  return (f.w / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85);
}

// ponytail: self-check. Run: npx tsx lib/scene/organic.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  // A blob: the same seed is the same blob; lumpy but bounded.
  const f1 = lumpField(7, 4, 0.2);
  const f2 = lumpField(7, 4, 0.2);
  const dirs: V3[] = [];
  const rnd = seeded(1);
  for (let i = 0; i < 400; i++) {
    const z = 2 * rnd() - 1;
    const t = 2 * Math.PI * rnd();
    const s = Math.sqrt(1 - z * z);
    dirs.push({ x: s * Math.cos(t), y: s * Math.sin(t), z });
  }
  const r1 = dirs.map(f1);
  assert(r1.every((v, i) => v === f2(dirs[i])), "a blob's lumps are its seed's: built twice, the same");
  const lo = Math.min(...r1);
  const hi = Math.max(...r1);
  assert(lo >= 1 - 0.2 * 1.4 - 1e-9 && hi <= 1 + 0.2 * 1.4 + 1e-9, `…within its roughness (${lo.toFixed(2)}–${hi.toFixed(2)})`);
  assert(hi - lo > 0.15, "…and really lumpy");
  assert(lumpField(8, 4, 0.2)(dirs[0]) !== r1[0], "another seed is another blob");

  // A frond: rises, then droops below its base by the tip when it droops far enough.
  const palm: FrondSpec = { len: 2000, w: 700, liftDeg: 35, droopDeg: 80, leaflets: 20, foldDeg: 30 };
  const spine = frondSpine(palm);
  const top = Math.max(...spine.map((p) => p.z));
  assert(top > 100 && spine[spine.length - 1].z < top, "a palm frond arches: up from the crown, then down");
  const reach = Math.hypot(spine[spine.length - 1].y, spine[spine.length - 1].z);
  assert(reach < 2000 && reach > 1500, `…its tip short of its length by the bend (${Math.round(reach)})`);
  const tris = frondTriangles(palm);
  assert(tris.length % 3 === 0 && tris.length >= 20 * 2 * 6, "…pinnate: two diamonds per leaflet pair, and the rachis");
  const [zlo, zhi] = frondSpan(palm);
  assert(tris.every((p) => p.z >= zlo - 1 && p.z <= zhi + 1), "its span holds every point");
  const leaf = frondTriangles({ len: 100, w: 36, liftDeg: 20, droopDeg: 40, foldDeg: 20 });
  assert(leaf.length === SPINE_STEPS * 2 * 6, "a blade: a strip each side of the spine");
  assert(bladeHalfWidth({ len: 100, w: 36 }, 0) === 0 && bladeHalfWidth({ len: 100, w: 36 }, 1) < 1e-6, "…pointed at both ends");
  console.log("organic ok");
}
