// npm run check:organic — the self-check of ./organic.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { bladeHalfWidth, frondSpan, frondSpine, frondTriangles, lumpField, seeded, SPINE_STEPS, type FrondSpec, type V3 } from "./organic";

// ponytail: self-check. Run: npx tsx lib/scene/organic.ts
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
