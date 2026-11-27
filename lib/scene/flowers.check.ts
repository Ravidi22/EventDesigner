// npm run check:scene-flowers — the self-check of ./flowers.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { FLOWER_PROFILES } from "@/lib/catalog/flower-draw";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import type { InstanceRequest } from "./collect";
import { applyTransform } from "./frame";
import { type NodeTag, type Part, vec3 } from "./types";
import { bloomMesh, flowerBuild, headPart, LEAF_Z, MASS_SINK, TRUNK, TRUNK_STEMS } from "./flowers";

// ponytail: self-check. Run: npx tsx lib/scene/flowers.ts
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const product = {
  id: "p-roses",
  name: "ורדים ואקליפטוס",
  category: "flower-arrangements",
  layer: "table" as const,
  dimensions: { diameterMm: 400, heightMm: 350 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  flowers: [
    { id: "l1", name: "ורד", qty: 20 },
    { id: "l2", name: "אקליפטוס", qty: 8 },
  ],
};
const tag: NodeTag = { type: "flowers" };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
// A head stands at its centre: a bloom and a ball are both built about their own middle.
const centreOf = (r: InstanceRequest) => r.at.at.z + r.parts[0].at.z;

// The blooms: each family at the plan's size (its widest ring is r), centred on its height, within
// its triangle budget, every index a vertex, every vertex a colour.
for (const [form, opts] of [["rose", {}], ["peony", {}], ["cup", {}], ["star", {}], ["face", { petals: 16, disc: "#6b5a2e" }], ["face", { petals: 6 }], ["orchid", {}]] as const) {
  const m = bloomMesh(form, 40, 7, opts);
  const n = m.positions.length / 3;
  let rho = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    rho = Math.max(rho, Math.hypot(m.positions[3 * i], m.positions[3 * i + 1]));
    lo = Math.min(lo, m.positions[3 * i + 2]);
    hi = Math.max(hi, m.positions[3 * i + 2]);
  }
  const tris = m.indices.length / 3;
  assert(near(rho, 40, 1e-6) && near(lo, -hi, 1e-6), `a ${form}'s widest ring is r and it is centred on its height`);
  assert(tris >= 40 && tris <= 170, `a ${form} is ${tris} triangles — petals, within a head's budget`);
  assert(m.colours.length === m.positions.length && m.indices.every((i) => i >= 0 && i < n) && m.colours.every((c) => c > 0 && c <= 1), `a ${form}'s indices and colours are whole`);
  assert(JSON.stringify(bloomMesh(form, 40, 7, opts)) === JSON.stringify(m), `a ${form} is the same twice`);
}
assert(headPart({ t: "head", kind: "rose", r: 38 }).shape === "bloom" && headPart({ t: "head", kind: "hydrangea", r: 80 }).shape === "blob" && headPart({ t: "fill", kind: "gyps", r: 20 }).shape === "blob", "a rose is petals; a mophead and a filler are balls of florets");
const face = headPart({ t: "head", kind: "sunflower", r: 75 });
assert(face.shape === "bloom" && face.form === "face" && face.disc === "#3d2a14", "a sunflower is a face with a brown disc");

const spec = flowerDrawSpecOf(product, { kind: "circle", diameterMm: 400 }, "#e8bcce");
assert(spec.form === "dome", `a 35cm arrangement is a dome (${spec.form})`);
const dome = flowerBuild(spec, 350, tag);
const heads = dome.instanced.filter((r) => r.key.startsWith("flower:"));
assert(heads.length > 5, `a ⌀40 dome has heads (${heads.length})`);
assert(heads.every((r) => centreOf(r) > 0 && centreOf(r) <= 350), "every head's centre is between the table and the row's height");
const highest = heads.reduce((a, b) => (centreOf(b) > centreOf(a) ? b : a));
const nearest = heads.reduce((a, b) => (Math.hypot(b.at.at.x, b.at.at.y) < Math.hypot(a.at.at.x, a.at.at.y) ? b : a));
assert(highest === nearest, "the head nearest the middle is the highest — the dome law");
assert(heads.some((r) => r.key.startsWith("flower:rose:")), "the roses are keyed by kind");
assert(dome.instanced.some((r) => r.key.startsWith("leaf:")), "the eucalyptus is leaves");
assert(dome.instanced.every((r) => r.castShadow === false), "nothing in an arrangement casts a shadow");
const leaves = dome.instanced.filter((r) => r.key.startsWith("leaf:"));
assert(leaves.every((r) => (r.at.scale ?? 1) > 0 && r.at.at.z === 350 * LEAF_Z), "a leaf is the unit leaf scaled to its sprig, drooping at 0.45 h");
assert(JSON.stringify(flowerBuild(spec, 350, tag)) === JSON.stringify(dome), "the same spec builds the same twice");
const mass = dome.parts.find((p): p is Extract<Part, { shape: "blob" }> => p.shape === "blob");
assert(!!mass && near(mass.at.z + mass.r * (mass.squash ?? 1), 350 * 0.8) && near(mass.at.z - mass.r * (mass.squash ?? 1), -350 * MASS_SINK) && mass.material?.kind === "petal", "the heads sit in a mass of greenery, its top under theirs (0.8 h), sinking a little into the vase");
const lum = (hex: string) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0) / 3;
assert(!!mass?.material && lum(mass.material.colour) < lum("#a9bdb0") * 0.6, "…a deep leaf green, the shadowed foliage between flowers — not a pale ball");
const sprigs = dome.parts.find((p): p is Extract<Part, { shape: "leaves" }> => p.shape === "leaves");
assert(!!sprigs && sprigs.cards.length > 10 && sprigs.material?.kind === "leaves" && sprigs.cards.every((c) => c.z < 350 * 0.9), `leaf cards dress the mass, the greenery between the blooms, never above the top heads (${sprigs?.cards.length})`);

// Every bloom looks OUT of the dome: a head off the middle leans away from it, further the
// further out it sits; the middle one stands nearly upright.
const blooms = heads.filter((r) => r.parts[0].shape === "bloom");
const lookOf = (r: InstanceRequest) => {
  const up = applyTransform({ ...r.at, at: vec3(0, 0, 0) }, vec3(0, 0, 1));
  return { x: up.x, y: up.y, z: up.z };
};
const plain = blooms.filter((r) => (r.at.tiltDeg ?? 0) > 20 && r.at.at.z > 350 * 0.45);
assert(plain.length > 3 && plain.every((r) => lookOf(r).x * r.at.at.x + lookOf(r).y * r.at.at.y > 0), "a head on the dome's side faces away from its middle");
const outer = blooms.reduce((a, b) => (Math.hypot(b.at.at.x, b.at.at.y) > Math.hypot(a.at.at.x, a.at.at.y) ? b : a));
assert((outer.at.tiltDeg ?? 0) > (nearest.at.tiltDeg ?? 0) + 20, `the outermost head leans further than the middle one (${outer.at.tiltDeg} vs ${nearest.at.tiltDeg ?? 0})`);
const under = blooms.filter((r) => (r.at.tiltDeg ?? 0) > 85 - 1e-9);
assert(under.length >= 5 && under.every((r) => lookOf(r).z < 0.2), "a ring of blooms below the mass's widest looks out and down, dressing its side");
assert(new Set(blooms.map((r) => r.at.spinDeg)).size > blooms.length * 0.8, "…and the heads are spun, so no two are stamped");

const lines = spec.lines;
const cushion = flowerBuild({ form: "cushion", w: 400, h: 400, lines, shade: "#e8bcce", seed: 7, sparse: true }, 250, tag);
const cHeads = cushion.instanced.filter((r) => r.key.startsWith("flower:"));
const cTop = Math.max(...cHeads.map(centreOf));
const cLow = Math.min(...cHeads.map(centreOf));
assert(cTop <= 250 && cTop > 200 && cLow > 250 * 0.5, `a cushion by its spec tops at its height and stays flat (${Math.round(cLow)}–${Math.round(cTop)})`);
const fullCushion = flowerBuild({ form: "cushion", w: 400, h: 400, lines, shade: "#e8bcce", seed: 7 }, 250, tag).instanced.filter((r) => r.key.startsWith("flower:"));
assert(Math.max(...fullCushion.map(centreOf)) <= 250 && Math.min(...fullCushion.map(centreOf)) < 250 * 0.3 && Math.min(...fullCushion.map(centreOf)) > 0, "a FULL cushion's side is flowered down to the table");

// FULL (the default): the dome's whole side is dressed in its own mix, level under level, and
// "by the spec" is the three rings it always was.
const mixed = [{ kind: "rose" as const, qty: 30 }, { kind: "peony" as const, qty: 12 }, { kind: "euca" as const, qty: 8 }];
const big = { form: "dome" as const, w: 900, h: 900, lines: mixed, shade: "#e8bcce", seed: 11 };
const fullHeads = flowerBuild(big, 1000, tag).instanced.filter((r) => r.key.startsWith("flower:"));
const specHeads = flowerBuild({ ...big, sparse: true }, 1000, tag).instanced.filter((r) => r.key.startsWith("flower:"));
assert(fullHeads.length > specHeads.length * 3, `a full ⌀90 × 100 dome wears many times the heads of its bare spec (${fullHeads.length} vs ${specHeads.length})`);
const sideHeads = fullHeads.filter((r) => centreOf(r) < 450 && (r.at.tiltDeg ?? 0) > 60);
const bands = new Set(sideHeads.map((r) => Math.round(centreOf(r) / 60)));
assert(bands.size >= 5 && new Set(sideHeads.map((r) => r.key.split(":")[1])).size >= 2, `…its side dressed level under level (${bands.size} bands), roses and peonies both`);
assert(fullHeads.every((r) => centreOf(r) > 0 && centreOf(r) <= 1000), "…between the vase's mouth and the row's height");

const cascade = flowerBuild({ form: "cascade", w: 500, h: 500, lines, shade: "#e8bcce", seed: 3 }, 400, tag);
const fall = cascade.instanced.filter((r) => r.key.startsWith("flower:") && r.at.at.x > 0.5 * 250).sort((a, b) => a.at.at.x - b.at.at.x);
assert(fall.length >= 3 && centreOf(fall[0]) > centreOf(fall[fall.length - 1]), "a cascade's fall descends toward +x");
assert(centreOf(fall[fall.length - 1]) < 400 * 0.35, "…down to a fifth of its height at the tip");

const garden = flowerBuild({ form: "garden", w: 500, h: 500, lines, shade: "#e8bcce", seed: 5 }, 400, tag);
const proud = garden.instanced.filter((r) => r.key.startsWith("flower:") && centreOf(r) > 400);
assert(proud.length === 3 && garden.parts.filter((p) => p.shape === "cylinder").length === 3, "a garden's three long-stem heads stand above the mass on stems");

const runner = flowerBuild({ form: "runner", w: 1800, h: 400, lines, shade: "#e8bcce", seed: 2, sparse: true }, 250, tag);
const rHeads = runner.instanced.filter((r) => r.key.startsWith("flower:"));
assert(rHeads.length > 4 && rHeads.every((r) => Math.abs(centreOf(r) - 125) < 1e-6 || Math.abs(centreOf(r) - 105) < 1e-6), "a runner by its spec: heads level at half its height");
assert(rHeads.some((r) => r.at.at.x > 500) && rHeads.some((r) => r.at.at.x < -500), "…along the strip");
// FULL: a mound, highest down its spine; and a FALL hangs from its end to the floor.
const mound = flowerBuild({ form: "runner", w: 1800, h: 400, lines, shade: "#e8bcce", seed: 2 }, 250, tag).instanced.filter((r) => r.key.startsWith("flower:"));
const spine = mound.filter((r) => Math.abs(r.at.at.y) < 30);
const edge = mound.filter((r) => Math.abs(r.at.at.y) > 140);
assert(mound.length > rHeads.length * 1.5 && spine.length > 0 && edge.length > 0 && Math.min(...spine.map(centreOf)) > Math.max(...edge.map(centreOf)), "a full runner is a mound: higher along its spine than at its edges");
const fallB = flowerBuild({ form: "runner", w: 1800, h: 400, lines, shade: "#e8bcce", seed: 2, fall: "end" }, 250, tag, { dropMm: 750 }).instanced.filter((r) => r.key.startsWith("flower:") && r.at.at.x > 900);
const fallZ = fallB.map(centreOf);
assert(fallB.length > 20 && Math.max(...fallZ) > 0 && Math.min(...fallZ) < -700 && Math.min(...fallZ) >= -750, `a fall hangs from the table's edge to the floor 75 cm below (${Math.round(Math.min(...fallZ))}…${Math.round(Math.max(...fallZ))})`);
assert(fallB.filter((r) => centreOf(r) > -600).every((r) => r.at.at.x < 900 + 120) && fallB.length > 80, `…straight down off the end, shoulder to shoulder (${fallB.length}), spreading only where it lies on the floor`);

const bud = flowerBuild({ form: "bud", w: 300, h: 300, lines, shade: "#e8bcce", seed: 4 }, 300, tag);
const bottles = bud.parts.filter((p) => p.shape === "cylinder" && p.material?.kind === "glass");
assert(bottles.length >= 3 && bud.instanced.filter((r) => r.key.startsWith("flower:")).every((r) => Math.abs(centreOf(r) - 270) < 1e-6), "a bud cluster: glass bottles, heads at 0.9 h");

const single = flowerBuild({ form: "single", w: 80, h: 80, lines: [{ kind: "rose", qty: 1 }], shade: "#e8bcce", seed: 1 }, 500, tag);
const sHead = single.instanced.find((r) => r.key.startsWith("flower:rose:"));
assert(!!sHead && Math.abs(centreOf(sHead) + 80 * 0.47 - 500) < 1e-6 && single.parts.some((p) => p.shape === "cylinder"), "a single stem: one head topping at h on a stem");

// An ENVELOPE (the base's צללית): the heads on its top and round its side, the mass inside it,
// never a solid — and no envelope builds exactly what it always built.
const roses = [{ kind: "rose" as const, qty: 120 }, { kind: "euca" as const, qty: 10 }];
const domeSpec = { form: "dome" as const, w: 500, h: 500, lines: roses, shade: "#f4f1ea", seed: 9 };
assert(JSON.stringify(flowerBuild({ ...domeSpec, profile: undefined }, 500, tag)) === JSON.stringify(flowerBuild(domeSpec, 500, tag)), "no envelope: the dome, to the digit");
const ballB = flowerBuild({ ...domeSpec, profile: FLOWER_PROFILES.ball }, 500, tag);
const ballHeads = ballB.instanced.filter((r) => r.key.startsWith("flower:rose:"));
const below = ballHeads.filter((r) => centreOf(r) < 250 && (r.at.tiltDeg ?? 0) > 95);
assert(below.length >= 8, `a ball: heads under its equator, looking down (${below.length})`);
assert(ballHeads.every((r) => centreOf(r) <= 500 + 1e-6 && centreOf(r) >= 0), "…and none above the row's height or under its foot");
assert(!ballB.parts.some((p) => p.shape === "lathe") && ballB.parts.filter((p) => p.shape === "blob").length >= 2, "…filled by a stack of clumps, never a lathe");
const treeB = flowerBuild({ ...domeSpec, profile: FLOWER_PROFILES.tree }, 900, tag);
const trunk = treeB.parts.filter((p) => p.shape === "cylinder" && p.material?.colour === TRUNK);
assert(trunk.length === TRUNK_STEMS && trunk.every((p) => p.at.z === 0), "a tree: its neck a bundle of stems from the foot");
assert(treeB.instanced.filter((r) => r.key.startsWith("flower:")).every((r) => centreOf(r) > 900 * 0.4), "…and every flower up in its crown");
console.log("scene flowers ok");
