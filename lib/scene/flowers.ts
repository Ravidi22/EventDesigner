// An arrangement's heads lifted off the plan into height. Spec §3.3.
//
// The plan lays an arrangement out head by head at real size (lib/catalog/flower-draw.ts
// composeFlowers: a rose is 76 mm wherever it stands, thinned to what the surface has room for,
// seeded by the row) and foreshortens each head by where it sits on a hemisphere — `sc` =
// sqrt(1 − (d/rim)²) with rim = 1.1·R·core, flower-draw.ts:318–321. That law IS a height model:
// the same square root, times the row's height, is how high the head stands. This module reads
// composeFlowers' items and gives each a z by its form — a dome's slope, a cushion's flatter one, a
// garden's long stems standing proud, a cascade falling off its +x side, a runner's level run, a bud
// cluster's bottles, a single stem — and turns every head into an INSTANCE request keyed by kind,
// colour and radius, so a room of forty arrangements draws one sphere geometry per (kind, colour)
// however many tables there are (./collect.ts). Greens are one flat leaf per colour, scaled to each
// sprig's length; trails droop as three beads; the foliage `base` is nothing — the vase or the
// table is under it. Deterministic: composeFlowers is seeded and memoised, and nothing here draws
// a random number. `npx tsx lib/scene/flowers.ts` runs the self-check.
import { FORMS, type FlowerDrawSpec, type FlowerItem, composeFlowers } from "@/lib/catalog/flower-draw";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { isMain } from "../self-check";
import type { InstanceRequest, ItemBuild } from "./collect";
import { foliageMaterial } from "./materials";
import { seedOf } from "./organic";
import { type NodeTag, type Part, transform, vec3 } from "./types";

/** The foliage's colour when the spec has no green of its own (item-symbol.tsx LEAF). */
const LEAF = "#8fae84";
/** A leaf geometry is one unit long; each sprig scales it to its length. */
const LEAF_UNIT_MM = 100;
/** A leaf's width over its length. */
const LEAF_WIDTH = 0.38;
const STEM_R_MM = 3;
const HEAD_SEGMENTS = 10;
/** Fills vanish past this distance (spec §3.3, §8): the heads carry the shape, the fills the detail. */
const FILL_LOD_MM = 15000;
/** How much flatter a cushion's slope is than a dome's: it still tops at the row's height (spec
 *  §3.3 "scaled to the row's heightMm"), but falls to the rim only 0.6 as far. */
const CUSHION_FLATTEN = 0.6;
/** A garden's long-stem heads stand above the mass (flower-draw.ts:365–372). */
const REACH_RISE = 1.1;
/** A cascade's fall ends this far down at its tip (its start is the dome's height at the mass's
 *  edge, flower-draw.ts:346–358). */
const FALL_END = 0.2;
const RUNNER_HEAD = 0.5;
const RUNNER_FILL = 0.42;
const BUD_HEAD = 0.9;
const BUD_BOTTLE = 0.65;
const LEAF_Z = 0.45;
/** The filler mass: this share of the heads' rim across, sinking this share of the height into the
 *  vase, this pale a tint of the shade. */
const MASS_SHARE = 0.9;
const MASS_SINK = 0.08;
const MASS_PALE = 0.55;
/** The shoulder ring stands this share of the mass's half height above its middle. */
const SHOULDER = 0.35;

/** `hex` a share `t` of the way to white. */
function towardWhite(hex: string, t: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const ch = (i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(i) + (255 - ch(i)) * t).toString(16).padStart(2, "0")).join("")}`;
}

const deg = (rad: number) => (rad * 180) / Math.PI;

type Head = Extract<FlowerItem, { t: "head" | "fill" }>;
type Green = Extract<FlowerItem, { t: "green" }>;
type Trail = Extract<FlowerItem, { t: "trail" }>;

/** The instance key a head shares with every head of its kind, colour and size in the room. */
export const headKey = (kind: string, col: string, r: number): string => `flower:${kind}:${col}:${Math.round(r)}`;

/** Kinds that read as a ball from every side: a hydrangea's mophead, and the small fillers. */
const ROUND_KINDS = new Set(["hydrangea", "gyps", "phlox", "filler", "delphinium", "lavender"]);

/** One head, its BASE at the origin and its centre `r` up (the instance is placed at z − r); a
 *  bloom's widest ring is exactly `r`, as a ball's is. A real
 *  bloom — a rose, a peony, a lisianthus — is a cup, open on top, its few lathe facets standing for
 *  petals (seen close up on plan A: spheres read as grapes); a mophead or a filler stays a ball. */
export function headPart(it: { t: string; kind: string; r: number }): Part {
  const r = it.r;
  // A mophead is a ball of florets, a filler a froth of tiny ones: a blob (./organic.ts) whose many
  // small lumps are the florets — a smooth sphere read as a ping-pong ball (2026-10-24).
  if (it.t !== "head" || ROUND_KINDS.has(it.kind)) {
    const mop = it.kind === "hydrangea";
    return { shape: "blob", r, at: vec3(0, 0, r), seed: seedOf(it.kind), lumps: mop ? 10 : 8, rough: mop ? 0.1 : 0.16, squash: mop ? 0.88 : 1, detail: it.t === "fill" ? 1 : r >= 40 ? 3 : 2 };
  }
  // A flat face (daisy, sunflower, anemone) opens wider and lower than a cup (rose, peony, ranunculus).
  const flat = it.kind === "daisy" || it.kind === "sunflower" || it.kind === "anemone";
  const profile = flat
    ? [
        { r: 0, z: 0 },
        { r: 0.35 * r, z: 0.35 * r },
        { r: 0.9 * r, z: 0.85 * r },
        { r: 1.0 * r, z: 1.0 * r },
        { r: 0.55 * r, z: 1.12 * r },
        { r: 0, z: 1.18 * r },
      ]
    : [
        { r: 0, z: 0 },
        { r: 0.5 * r, z: 0.3 * r },
        { r: 0.92 * r, z: 0.85 * r },
        { r: 1.0 * r, z: 1.25 * r },
        { r: 0.86 * r, z: 1.6 * r },
        { r: 0.48 * r, z: 1.76 * r },
        { r: 0.18 * r, z: 1.62 * r },
        { r: 0, z: 1.66 * r },
      ];
  // Seated so the bloom's height is centred on the head's centre (a cup spans 0.12 r…1.88 r, a face
  // 0.41 r…1.59 r): a hung arrangement mirrors each head about the middle of its own height, and a
  // ball and a bloom must land in the same place.
  return { shape: "lathe", profile, at: vec3(0, 0, flat ? 0.41 * r : 0.12 * r), segments: BLOOM_PETALS };
}

/** A bloom's facets round its rim: few enough to read as petals, not as a smooth bowl. */
const BLOOM_PETALS = 9;

/** The arrangement described by `spec` (composeFlowers' layout, in the footprint frame) as a
 *  build whose heads are instanced per (kind, colour) across the room. `heightMm` is the row's:
 *  the top of the highest head's centre. */
export function flowerBuild(spec: FlowerDrawSpec, heightMm: number, tag: NodeTag): ItemBuild {
  const items = composeFlowers(spec);
  const H = Math.max(20, heightMm);
  const R = Math.min(spec.w, spec.h) / 2;
  const form = spec.form;
  const F = form === "runner" || form === "bud" || form === "single" ? undefined : FORMS[form];
  // The mass's centre and rim, as composeRound reads them (flower-draw.ts:289, :317).
  const cx = (F?.shift ?? 0) * R;
  const rim = F ? R * F.core * 1.1 : R;
  // Where the cascade's fall begins (flower-draw.ts:351): heads past it descend.
  const fallFrom = F?.fall ? cx + R * F.core * 0.85 : Infinity;
  const greenCol = items.find((it): it is Green => it.t === "green")?.col ?? LEAF;
  const build: ItemBuild = { parts: [], material: foliageMaterial(greenCol), instanced: [], emitters: [] };

  const dome = (x: number, y: number): number => H * Math.sqrt(Math.max(0, 1 - (Math.hypot(x - cx, y) / rim) ** 2));
  /** The height of a head's CENTRE. */
  const headZ = (it: Head, onStem: boolean): number => {
    if (form === "single") return H - it.r;
    if (form === "runner") return H * (it.t === "head" ? RUNNER_HEAD : RUNNER_FILL);
    if (form === "bud") return H * BUD_HEAD;
    if (onStem) return H * REACH_RISE;
    if (it.x >= fallFrom - R * 0.06) {
      const t = Math.max(0, Math.min(1, (it.x - fallFrom) / (R * 0.72)));
      const start = H * Math.sqrt(1 - (0.85 / 1.1) ** 2);
      return start + (H * FALL_END - start) * t;
    }
    const z = dome(it.x, it.y);
    return form === "cushion" ? H - (H - z) * CUSHION_FLATTEN : z;
  };
  const leafZ = form === "runner" ? H * 0.3 : form === "bud" ? H * 0.6 : H * LEAF_Z;

  const head = (it: Head, z: number) => {
    const req: InstanceRequest = {
      key: headKey(it.kind, it.col, it.r),
      parts: [headPart(it)],
      material: { colour: it.col, kind: "matte" },
      tag,
      at: transform(vec3(it.x, it.y, z - it.r), deg(it.rot)),
      castShadow: false,
    };
    if (it.t === "fill") req.lod = { tier: "near", beyondMm: FILL_LOD_MM };
    build.instanced.push(req);
  };
  const leaf = (it: Green) => {
    if (it.len <= 0) return;
    build.instanced.push({
      key: `leaf:${it.col}`,
      // A blade that rises off the mass and arches down, its halves folded up off the midrib —
      // grown along +x (a frond grows along its own +y, so it is turned a quarter back).
      parts: [{ shape: "frond", len: LEAF_UNIT_MM, w: LEAF_UNIT_MM * LEAF_WIDTH, at: vec3(0, 0, 0), rotDeg: -90, liftDeg: 18, droopDeg: 55, foldDeg: 22 }],
      material: foliageMaterial(it.col),
      tag,
      at: transform(vec3(it.x, it.y, leafZ), deg(it.ang), false, it.len / LEAF_UNIT_MM),
      castShadow: false,
    });
  };
  const trail = (it: Trail, from: number) => {
    const radii = [30, 26, 22];
    radii.forEach((r, k) => {
      const t = (k + 1) / radii.length;
      const z = from - H * 0.4 * t;
      build.instanced.push({
        key: `trail:${it.col}:${r}`,
        parts: [{ shape: "sphere", r, at: vec3(0, 0, r), segments: HEAD_SEGMENTS }],
        material: { colour: it.col, kind: "matte" },
        tag,
        at: transform(vec3(it.x + Math.cos(it.ang) * it.len * t, it.y + Math.sin(it.ang) * it.len * t, z - r)),
        castShadow: false,
      });
    });
  };
  const stem = (x: number, y: number, from: number, to: number) => {
    if (to - from < 5) return;
    build.parts.push({ shape: "cylinder", rTop: STEM_R_MM, rBottom: STEM_R_MM, h: to - from, at: vec3(x, y, from), segments: 6 });
  };

  // The mass the heads sit in: the small flowers and the filler packed between the blooms — a ball
  // of tiny florets (a blob with many small lumps) in a pale tint of the shade, sitting on the
  // vase's mouth, its top a little under the heads'. The plan lays only the heads it can show from
  // above; in a room, heads alone floated over the vase like a bunch of balloons, and a GREEN mass
  // read as a camouflage egg (2026-10-24).
  if (F) {
    const massTop = H * (form === "cushion" ? 0.78 : 0.8);
    const a = (massTop + MASS_SINK * H) / 2;
    const r = rim * MASS_SHARE;
    const tintOf = spec.shade ?? items.find((it): it is Head => it.t === "head")?.col ?? "#f2e6ea";
    build.parts.push({ shape: "blob", r, at: vec3(cx, 0, massTop - a), seed: spec.seed, squash: a / r, lumps: 13, rough: 0.07, detail: 3, material: { colour: towardWhite(tintOf, MASS_PALE), kind: "matte" } });
    // …and its shoulders dressed: a ring of the arrangement's main bloom round the mass a little
    // above its widest, where the plan (seen from above) lays none. Instanced with the rest.
    const blooms = items.filter((it): it is Head => it.t === "head" && !ROUND_KINDS.has(it.kind));
    if (blooms.length && form !== "cascade") {
      const tally = new Map<string, { it: Head; n: number }>();
      for (const it of blooms) {
        const k = headKey(it.kind, it.col, it.r);
        tally.set(k, { it, n: (tally.get(k)?.n ?? 0) + 1 });
      }
      const main = [...tally.values()].sort((x, y) => y.n - x.n)[0].it;
      const zc = massTop - a + a * SHOULDER;
      const ring = r * Math.sqrt(1 - SHOULDER * SHOULDER) * 0.97;
      const n = Math.max(5, Math.min(16, Math.floor((2 * Math.PI * ring) / (2.3 * main.r))));
      for (let k = 0; k < n; k++) {
        const ang = (2 * Math.PI * (k + 0.5 * (spec.seed % 2))) / n;
        head({ ...main, x: cx + ring * Math.cos(ang), y: ring * Math.sin(ang), rot: ang }, zc);
      }
    }
  }

  let afterStem = false;
  for (const it of items) {
    switch (it.t) {
      case "head":
      case "fill": {
        const z = headZ(it, afterStem);
        head(it, z);
        if (afterStem) stem(it.x, it.y, H * 0.35, z - it.r);
        else if (form === "single") stem(it.x, it.y, 0, z - it.r * 0.5);
        else if (form === "bud") stem(it.x, it.y, H * BUD_BOTTLE, z - it.r * 0.5);
        afterStem = false;
        continue;
      }
      case "stem":
        // A garden's long stem: the head that follows it stands proud (flower-draw.ts:370–371).
        afterStem = true;
        continue;
      case "green":
        leaf(it);
        break;
      case "trail":
        trail(it, form === "bud" ? H * BUD_HEAD : H * 0.75);
        break;
      case "bottle": {
        const bottle: Part = { shape: "cylinder", rTop: it.r, rBottom: it.r * 0.9, h: H * BUD_BOTTLE, at: vec3(it.x, it.y, 0), material: { colour: "#e8f0f5", kind: "glass", opacity: 0.35 } };
        build.parts.push(bottle);
        break;
      }
      case "base":
        // The foliage mass showing in the gaps on the plan: the vase or the table is under it here.
        break;
    }
    afterStem = false;
  }
  return build;
}

// ponytail: self-check. Run: npx tsx lib/scene/flowers.ts
if (isMain(import.meta.url)) {
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
  // A head's centre is one head-radius above its base — a ball's radius, a bloom's widest ring.
  const centreOf = (r: InstanceRequest) => {
    const p = r.parts[0];
    if (p.shape === "sphere" || p.shape === "blob") return r.at.at.z + p.r;
    if (p.shape === "lathe") return r.at.at.z + p.profile.reduce((m, q) => Math.max(m, q.r), 0);
    return r.at.at.z;
  };


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
  assert(!!mass && near(mass.at.z + mass.r * (mass.squash ?? 1), 350 * 0.8) && near(mass.at.z - mass.r * (mass.squash ?? 1), -350 * MASS_SINK) && mass.material?.kind === "matte", "the heads sit in a mass of filler, its top under theirs (0.8 h), sinking a little into the vase");

  const lines = spec.lines;
  const cushion = flowerBuild({ form: "cushion", w: 400, h: 400, lines, shade: "#e8bcce", seed: 7 }, 250, tag);
  const cHeads = cushion.instanced.filter((r) => r.key.startsWith("flower:"));
  const cTop = Math.max(...cHeads.map(centreOf));
  const cLow = Math.min(...cHeads.map(centreOf));
  assert(cTop <= 250 && cTop > 200 && cLow > 250 * 0.5, `a cushion tops at its height and stays flat (${Math.round(cLow)}–${Math.round(cTop)})`);

  const cascade = flowerBuild({ form: "cascade", w: 500, h: 500, lines, shade: "#e8bcce", seed: 3 }, 400, tag);
  const fall = cascade.instanced.filter((r) => r.key.startsWith("flower:") && r.at.at.x > 0.5 * 250).sort((a, b) => a.at.at.x - b.at.at.x);
  assert(fall.length >= 3 && centreOf(fall[0]) > centreOf(fall[fall.length - 1]), "a cascade's fall descends toward +x");
  assert(centreOf(fall[fall.length - 1]) < 400 * 0.35, "…down to a fifth of its height at the tip");

  const garden = flowerBuild({ form: "garden", w: 500, h: 500, lines, shade: "#e8bcce", seed: 5 }, 400, tag);
  const proud = garden.instanced.filter((r) => r.key.startsWith("flower:") && centreOf(r) > 400);
  assert(proud.length === 3 && garden.parts.filter((p) => p.shape === "cylinder").length === 3, "a garden's three long-stem heads stand above the mass on stems");

  const runner = flowerBuild({ form: "runner", w: 1800, h: 400, lines, shade: "#e8bcce", seed: 2 }, 250, tag);
  const rHeads = runner.instanced.filter((r) => r.key.startsWith("flower:"));
  assert(rHeads.length > 4 && rHeads.every((r) => Math.abs(centreOf(r) - 125) < 1e-6 || Math.abs(centreOf(r) - 105) < 1e-6), "a runner's heads ride level at half its height");
  assert(rHeads.some((r) => r.at.at.x > 500) && rHeads.some((r) => r.at.at.x < -500), "…along the strip");

  const bud = flowerBuild({ form: "bud", w: 300, h: 300, lines, shade: "#e8bcce", seed: 4 }, 300, tag);
  const bottles = bud.parts.filter((p) => p.shape === "cylinder" && p.material?.kind === "glass");
  assert(bottles.length >= 3 && bud.instanced.filter((r) => r.key.startsWith("flower:")).every((r) => Math.abs(centreOf(r) - 270) < 1e-6), "a bud cluster: glass bottles, heads at 0.9 h");

  const single = flowerBuild({ form: "single", w: 80, h: 80, lines: [{ kind: "rose", qty: 1 }], shade: "#e8bcce", seed: 1 }, 500, tag);
  const sHead = single.instanced.find((r) => r.key.startsWith("flower:rose:"));
  assert(!!sHead && Math.abs(centreOf(sHead) + 80 * 0.47 - 500) < 1e-6 && single.parts.some((p) => p.shape === "cylinder"), "a single stem: one head topping at h on a stem");
  console.log("scene flowers ok");
}
