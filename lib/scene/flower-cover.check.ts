// npm run check:scene-flower-cover — the self-check of ./flower-cover.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type FlowerDrawSpec } from "@/lib/catalog/flower-draw";
import type { InstanceRequest, ItemBuild } from "./collect";
import { type NodeTag, vec3 } from "./types";
import { coverBuild, faceCoverBuild, WALL_LIFT_DEG, type Panel } from "./flower-cover";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const tag: NodeTag = { type: "flowers" };
const TAU = Math.PI * 2;
const lines = [{ kind: "rose" as const, qty: 40 }, { kind: "peony" as const, qty: 10 }, { kind: "euca" as const, qty: 10 }];
const circle = (r: number, n = 40) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i * TAU) / n), y: r * Math.sin((i * TAU) / n) }));
const flowersOf = (b: ItemBuild) => b.instanced.filter((r) => r.key.startsWith("flower:"));
const zOf = (r: InstanceRequest) => r.at.at.z;
const rOf = (r: InstanceRequest) => Math.hypot(r.at.at.x, r.at.at.y);

// A disc is the dome: the middle highest, the rim leaning out, nothing above the row's height.
const disc: FlowerDrawSpec = { form: "shape", w: 600, h: 600, lines, seed: 4, shade: "#e8bcce", cover: [{ poly: circle(300) }] };
const dome = flowersOf(coverBuild(disc, () => ({ zMm: 0, heightMm: 320 }), tag));
const mid = dome.reduce((a, b) => (rOf(b) < rOf(a) ? b : a));
assert(dome.length > 60 && dome.every((r) => zOf(r) > 0 && zOf(r) <= 320) && zOf(mid) > 280, `a disc 32 cm high is a dome, its middle on top (${dome.length} heads, the middle at ${Math.round(zOf(mid))})`);
assert(dome.filter((r) => rOf(r) > 250 && r.parts[0].shape === "bloom").every((r) => (r.at.tiltDeg ?? 0) > 40), "…its rim heads leaning out");

// A wreath: a ring's band is a half-round ridge, heads looking out of both rims.
const o = circle(500);
const h = circle(350).reverse();
const ring: FlowerDrawSpec = { form: "shape", w: 1000, h: 1000, lines, seed: 4, shade: "#e8bcce", cover: [{ poly: [...o, o[0], h[h.length - 1], ...h, h[h.length - 1]] }] };
const wreath = flowersOf(coverBuild(ring, () => ({ zMm: 0, heightMm: 150 }), tag));
assert(wreath.length > 80 && wreath.every((r) => rOf(r) > 320 && rOf(r) < 540 && zOf(r) <= 150), `a wreath lies on its band, 15 cm high (${wreath.length} heads)`);

// The same ring 3 m tall is a SLEEVE: walls dressed level under level to the floor.
const sleeve = flowersOf(coverBuild(ring, () => ({ zMm: 0, heightMm: 3000 }), tag));
const bands = new Set(sleeve.map((r) => Math.round(zOf(r) / 200)));
assert(sleeve.length > wreath.length * 5 && bands.size >= 14 && Math.min(...sleeve.map(zOf)) < 120, `a ring 3 m tall is a sleeve of flowers, floor to top (${sleeve.length} heads over ${bands.size} bands)`);
assert(sleeve.filter((r) => zOf(r) < 2500).every((r) => r.parts[0].shape !== "bloom" || ((r.at.tiltDeg ?? 0) >= 90 - WALL_LIFT_DEG - 1 && (r.at.tiltDeg ?? 0) <= 91)), "…its wall heads looking out, every other level a little up");
// …wound as a SPIRAL it wears about a third of them.
const wound = flowersOf(coverBuild({ ...ring, spiral: 3 }, () => ({ zMm: 0, heightMm: 3000 }), tag));
assert(wound.length < sleeve.length * 0.6 && wound.length > sleeve.length * 0.2, `a spiral winds up it instead (${wound.length} of ${sleeve.length})`);

// Off the floor it is a lens: flowered underneath, heads looking down.
const hoop = flowersOf(coverBuild(ring, () => ({ zMm: 2200, heightMm: 300 }), tag));
assert(hoop.every((r) => zOf(r) >= 2200 - 1 && zOf(r) <= 2500 + 1) && hoop.filter((r) => (r.at.tiltDeg ?? 0) > 120).length > 20, "a ring 2.2 m up is flowered underneath too");

// Lines only: a garland — a rope of heads along the line, low, nothing extruded.
const line: FlowerDrawSpec = { form: "shape", w: 2000, h: 200, lines, seed: 4, cover: [{ poly: [{ x: -1000, y: 0 }, { x: 0, y: 200 }, { x: 1000, y: 0 }], open: true }] };
const rope = coverBuild(line, () => ({ zMm: 0, heightMm: 150 }), tag);
assert(flowersOf(rope).length > 20 && flowersOf(rope).every((r) => zOf(r) < 260) && rope.parts.length === 0, `lines are a garland (${flowersOf(rope).length} heads)`);
const backs = coverBuild(disc, () => ({ zMm: 0, heightMm: 320 }), tag).instanced.filter((r) => r.key.startsWith("flower-mass:"));
assert(backs.length > 40 && backs.every((r) => r.at.at.z < 320 && r.material?.kind === "matte"), "behind every bloom its clump of dark foliage, under the heads — never a solid the shape of the outline");
assert(rope.instanced.some((r) => r.key.startsWith("leaf:")), "…with its sprigs");

// A FACE: a flower wall 3 × 2.4 m — every head on the board's front, looking out of it.
const wallPanel: Panel = { shape: "panel", face: [{ outline: [{ x: -1500, y: -1200 }, { x: 1500, y: -1200 }, { x: 1500, y: 1200 }, { x: -1500, y: 1200 }] }], widthMm: 3000, faceHeightMm: 2400, thicknessMm: 20, bendDeg: 0, at: vec3(0, 0, 0) };
const wall = flowersOf(faceCoverBuild(disc, wallPanel, tag, 1));
assert(wall.length > 500 && wall.every((r) => r.at.at.y > 0 && r.at.at.y < 200 && zOf(r) > 0 && zOf(r) < 2400 && Math.abs(r.at.at.x) < 1520), `a flower wall: heads over the whole face, proud of the board (${wall.length})`);
// An arch's limb (a face 20 cm wide) is covered all round: front and back.
const limb: Panel = { ...wallPanel, face: [{ outline: [{ x: -100, y: -1200 }, { x: 100, y: -1200 }, { x: 100, y: 1200 }, { x: -100, y: 1200 }] }], widthMm: 200 };
const post = flowersOf(faceCoverBuild(disc, limb, tag, 2));
assert(post.some((r) => r.at.at.y > 40) && post.some((r) => r.at.at.y < -40), "a narrow face is flowered front and back");
console.log("scene flower-cover self-check passed");
