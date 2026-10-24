// The venue's planting in 3D, by species — the plan's drawings (components/plant-glyph.tsx,
// item-symbol.tsx `tree`) lifted into height. Spec §3.1.
//
// Seen on plan A's venue in a browser (2026-10-24, Ravid: "improve the visual of … the trees"): a
// tree of nine smooth spheres read as cotton wool, a palm of eight flat boxes as a propeller, a
// hedge as a crate. Now every leafy mass is a BLOB (./organic.ts — a sphere pushed in and out by
// seeded lumps, smooth-shaded) and every palm leaf a FROND (a spine that rises and arches, pinnate
// leaflets hanging off it in a V):
//
//   tree   a trunk tapering to 0.62 h, three limbs into the crown, the plan's nine canopy lobes
//          (TREE_CLUMPS, each touching the rim, the bigger higher) round a middle mass and a crown
//   palm   a ringed trunk to 0.86 h on a flared foot, the boot of old leaf bases, three tiers of
//          arching fronds (the lowest yellowing), and bunches of dates under them
//   shrub  the first five lobes and a middle mass, no trunk
//   pot    a terracotta pot with a rim, a shrub standing in it
//   hedge  clipped: a run of overlapping blobs along its length, its height, its depth
//   bed    a soil slab and heads on a grid inside its outline (./envelope.ts keeps the bed)
//
// One body per species × size × colour, shared by every plant like it (./collect.ts); the
// instances turn by a hash of the feature's id, so a row of identical trees is not a row of
// clones. Deterministic. `npx tsx lib/scene/plants.ts` holds the shapes.
import { TREE_CLUMPS } from "@/components/item-symbol";
import { isMain } from "../self-check";
import { turn } from "./frame";
import { ENVELOPE, foliageMaterial } from "./materials";
import { seedOf, seeded } from "./organic";
import { type MaterialRef, type Part, vec3 } from "./types";

const TRUNK: MaterialRef = { colour: ENVELOPE.trunk, kind: "matte" };
const PALM_TRUNK: MaterialRef = { colour: "#9a8466", kind: "matte" };
const PALM_BOOT: MaterialRef = { colour: "#76603f", kind: "matte" };
const DATES: MaterialRef = { colour: "#8f5228", kind: "matte" };
export const POT_MATERIAL: MaterialRef = { colour: "#b06a4a", kind: "matte" };

/** A canopy clump's lumps: a few big ones round a clump; rougher on a shrub. */
const CLUMP = { lumps: 3, rough: 0.17, detail: 2 } as const;
const BUSH = { lumps: 3.5, rough: 0.2, detail: 2 } as const;

/** Where a TREE_CLUMPS lobe stands: `frac` of the radius wide, (1 − frac) of the radius out along
 *  its bearing — so it touches the rim — on an rx × ry crown (item-symbol.tsx `tree`). */
function lobeAt(frac: number, deg: number, rx: number, ry: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: (1 - frac) * rx * Math.cos(a), y: (1 - frac) * ry * Math.sin(a) };
}

/** The first `count` of TREE_CLUMPS as blobs, each frac·R wide at its lobe's place, stacked
 *  through the band z0..h with the BIGGER lobes higher (the plan draws them over the smaller): the
 *  k-th by size stands k/(n−1) of the way up the room the band leaves it, its own height being
 *  `squash` of its width. A band too thin for a lobe centres it. */
export function lobes(rx: number, ry: number, z0: number, h: number, count: number, squash: number, look: { lumps: number; rough: number; detail: number }, seed = 11): Part[] {
  const R = Math.min(rx, ry);
  const picked = TREE_CLUMPS.slice(0, count);
  const bySize = picked.map((_, i) => i).sort((i, j) => picked[i][0] - picked[j][0]);
  const rank: number[] = [];
  bySize.forEach((i, k) => (rank[i] = k));
  return picked.map(([frac, deg], i) => {
    const r = frac * R;
    const p = lobeAt(frac, deg, rx, ry);
    const half = r * squash;
    const lo = z0 + half;
    const hi = h - half;
    const t = picked.length > 1 ? rank[i] / (picked.length - 1) : 0.5;
    const z = hi >= lo ? lo + t * (hi - lo) : (z0 + h) / 2;
    return { shape: "blob", r, at: vec3(p.x, p.y, z), seed: seed + i, squash, ...look };
  });
}

/** A mass `share` of R wide centred at `z`, held inside the band z0..h. */
function mass(R: number, share: number, z: number, z0: number, h: number, squash: number, seed: number, look: { lumps: number; rough: number; detail: number }): Part {
  const r = share * R;
  const half = r * squash;
  const zc = h - z0 >= 2 * half ? Math.max(z0 + half, Math.min(h - half, z)) : (z0 + h) / 2;
  return { shape: "blob", r, at: vec3(0, 0, zc), seed, squash, ...look };
}

/** Small clumps standing out of a crown's surface: what breaks a canopy's outline from a cloud's
 *  into a tree's. `count` of them, each `share` of its host lobe wide, on the host's upper half and
 *  sides at seeded bearings — cheap (detail 1), the leaf texture does the rest. */
function sprigs(hosts: readonly Part[], count: number, share: number, seed: number): Part[] {
  const rnd = seeded(seed);
  const out: Part[] = [];
  const blobs = hosts.filter((p): p is Extract<Part, { shape: "blob" }> => p.shape === "blob");
  if (!blobs.length) return out;
  for (let i = 0; i < count; i++) {
    const host = blobs[Math.floor(rnd() * blobs.length)];
    const az = rnd() * 2 * Math.PI;
    const el = (rnd() * 0.75 - 0.15) * (Math.PI / 2);
    const sq = host.squash ?? 1;
    const reach = host.r * 0.92;
    const r = host.r * share * (0.75 + 0.5 * rnd());
    out.push({
      shape: "blob",
      r,
      at: vec3(host.at.x + reach * Math.cos(el) * Math.cos(az), host.at.y + reach * Math.cos(el) * Math.sin(az), host.at.z + reach * sq * Math.sin(el)),
      seed: seed * 31 + i,
      squash: sq,
      lumps: 3,
      rough: 0.22,
      detail: 1,
    });
  }
  return out;
}

export const TREE = { trunkTop: 0.62, crownFrom: 0.5, squash: 0.82, sprigs: 16 } as const;

/** A tree: a trunk to 0.62 h with three limbs leaning out into the crown, the nine lobes stacked
 *  from half its height to its top, the middle mass at 0.72 h and a crown over it. */
export function treeParts(rx: number, ry: number, h: number): Part[] {
  const R = Math.min(rx, ry);
  const parts: Part[] = [{ shape: "cylinder", rTop: 0.05 * R, rBottom: 0.085 * R, h: TREE.trunkTop * h, at: vec3(0, 0, 0), segments: 10, material: TRUNK }];
  for (let k = 0; k < 3; k++) {
    const rot = 25 + k * 120;
    parts.push({ shape: "cylinder", rTop: 0.022 * R, rBottom: 0.045 * R, h: 0.3 * h, at: vec3(0, 0, 0.42 * h), segments: 7, rotDeg: rot, tiltDeg: 38, material: TRUNK });
  }
  const crown: Part[] = [
    ...lobes(rx, ry, TREE.crownFrom * h, h, TREE_CLUMPS.length, TREE.squash, CLUMP),
    mass(R, 0.62, 0.72 * h, TREE.crownFrom * h, h, TREE.squash, 3, CLUMP),
    mass(R, 0.42, h, TREE.crownFrom * h, h, TREE.squash, 4, CLUMP),
  ];
  parts.push(...crown, ...sprigs(crown, TREE.sprigs, 0.38, 71));
  return parts;
}

/** The palm's trunk: a lathe from a flared foot to the crown, a growth ring every RING_MM (a
 *  bulge and a waist), tapering to 0.82 of its foot's radius. */
const RING_MM = 170;
export function palmTrunk(rb: number, crownZ: number): Part {
  const profile: { r: number; z: number }[] = [
    { r: 0, z: 0 },
    { r: 1.4 * rb, z: 0 },
    { r: 1.15 * rb, z: 0.025 * crownZ },
  ];
  const rings = Math.max(4, Math.floor((crownZ - 0.04 * crownZ) / RING_MM));
  for (let i = 1; i <= rings; i++) {
    const z = 0.04 * crownZ + ((crownZ - 0.04 * crownZ) * i) / rings;
    const taper = 1 - 0.18 * (z / crownZ);
    profile.push({ r: rb * taper * 0.97, z: z - RING_MM * 0.55 }, { r: rb * taper * 1.05, z });
  }
  profile.push({ r: 0, z: crownZ });
  return { shape: "lathe", profile, at: vec3(0, 0, 0), segments: 12, material: PALM_TRUNK };
}

/** The three tiers of a palm's crown: how many fronds, how they rise and arch, how long (of R). */
export const PALM_TIERS = [
  { n: 6, lift: 62, droop: 58, len: 0.78, yellow: 0 },
  { n: 7, lift: 26, droop: 72, len: 1.0, yellow: 0 },
  { n: 6, lift: -2, droop: 84, len: 0.93, yellow: 0.4 },
] as const;
export const PALM_LEAFLETS = 18;

/** A colour `t` of the way from `a` to `b` (#rrggbb). */
function mix(a: string, b: string, t: number): string {
  const ch = (s: string, i: number) => parseInt(s.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A palm: a ringed trunk to 0.86 h, the boot of old leaf bases, PALM_TIERS of arching pinnate
 *  fronds from the crown (the lowest tier yellowing), and three bunches of dates under them. The
 *  fronds take the plant's colour; `colour` is it. */
export function palmParts(rx: number, ry: number, h: number, colour: string): Part[] {
  const R = Math.min(rx, ry);
  const crownZ = 0.86 * h;
  const rb = Math.max(110, Math.min(260, 0.07 * R));
  const parts: Part[] = [
    palmTrunk(rb, crownZ),
    { shape: "cylinder", rTop: 1.55 * rb, rBottom: 0.9 * rb, h: 0.07 * h, at: vec3(0, 0, crownZ - 0.05 * h), segments: 12, material: PALM_BOOT },
  ];
  PALM_TIERS.forEach((tier, ti) => {
    const material = foliageMaterial(tier.yellow ? mix(colour, "#b9a65a", tier.yellow) : colour);
    for (let i = 0; i < tier.n; i++) {
      // Bearings spread round the crown, each tier half a gap round from the last, with a little
      // stable jitter so the crown is not a turbine.
      const jitter = ((seedOf(`palm:${ti}:${i}`) % 1000) / 1000 - 0.5) * 14;
      const rot = (i * 360) / tier.n + ti * (180 / tier.n) + jitter;
      const len = tier.len * R;
      const base = turn({ x: 0, y: 0.6 * rb }, rot);
      parts.push({ shape: "frond", len, w: 0.42 * len, at: vec3(base.x, base.y, crownZ + 0.015 * h), rotDeg: rot, liftDeg: tier.lift, droopDeg: tier.droop, leaflets: PALM_LEAFLETS, foldDeg: 28, material });
    }
  });
  for (const deg of [30, 150, 270]) {
    const p = turn({ x: 0, y: 1.5 * rb }, deg);
    parts.push({ shape: "blob", r: Math.min(170, 0.055 * R), at: vec3(p.x, p.y, crownZ - 0.03 * h), seed: 90 + deg, lumps: 9, rough: 0.3, squash: 1.35, detail: 2, material: DATES });
  }
  return parts;
}

/** A shrub: the first five lobes and a middle mass through z0..h, no trunk. */
export function shrubParts(rx: number, ry: number, z0: number, h: number): Part[] {
  const R = Math.min(rx, ry);
  const body = [...lobes(rx, ry, z0, h, 5, 0.88, BUSH, 31), mass(R, 0.62, (z0 + h) / 2 + 0.1 * (h - z0), z0, h, 0.88, 37, BUSH)];
  return [...body, ...sprigs(body, 6, 0.4, 41)];
}

/** A potted plant: a terracotta pot (a lathe — a narrow foot flaring to its rim at 0.45 h, a rolled
 *  lip) with a shrub three quarters its width standing in it to the top. */
export function potParts(rx: number, ry: number, h: number): Part[] {
  const R = Math.min(rx, ry);
  const pot: Part = {
    shape: "lathe",
    profile: [
      { r: 0, z: 0 },
      { r: 0.32 * R, z: 0 },
      { r: 0.34 * R, z: 0.04 * h },
      { r: 0.9 * R, z: 0.38 * h },
      { r: R, z: 0.43 * h },
      { r: R, z: 0.45 * h },
      { r: 0.92 * R, z: 0.45 * h },
      { r: 0.86 * R, z: 0.4 * h },
    ],
    at: vec3(0, 0, 0),
    segments: 24,
    material: POT_MATERIAL,
  };
  return [pot, ...shrubParts(0.74 * rx, 0.74 * ry, 0.4 * h, h)];
}

/** A clipped hedge: blobs a little rounder than its depth, overlapping along its length (at most
 *  MAX_HEDGE_BLOBS — a long hedge spaces them out), each as tall as the hedge, over a core box that
 *  fills between them. */
const MAX_HEDGE_BLOBS = 60;
export function hedgeParts(w: number, d: number, h: number): Part[] {
  const alongX = w >= d;
  const L = Math.max(w, d);
  const D = Math.min(w, d);
  const r = (D / 2) * 1.04;
  const squash = h / 2 / r;
  const n = Math.max(1, Math.min(MAX_HEDGE_BLOBS, Math.ceil((L - D) / (0.75 * D)) + 1));
  const parts: Part[] = [{ shape: "box", w: alignW(alongX, L - D * 0.4, 0.82 * D), d: alignW(!alongX, L - D * 0.4, 0.82 * D), h: 0.9 * h, at: vec3(0, 0, 0) }];
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : -(L - D) / 2 + ((L - D) * i) / (n - 1);
    parts.push({ shape: "blob", r, at: vec3(alongX ? s : 0, alongX ? 0 : s, h / 2), seed: 50 + i, squash, lumps: 3, rough: 0.12, detail: 2 });
  }
  return parts;
}
const alignW = (long: boolean, l: number, d: number) => (long ? l : d);

/** How a plant of this footprint is turned in the room: a round crown takes a stable turn of its
 *  own (a hash of its id), so a row of identical trees is not a row of clones; a shaped one keeps
 *  the plan's. */
export function plantTurn(id: string, w: number, d: number, rotationDeg: number): number {
  return Math.abs(w - d) <= 0.05 * Math.max(w, d) ? rotationDeg + (seedOf(id) % 360) : rotationDeg;
}

// ponytail: self-check. Run: npx tsx lib/scene/plants.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
  type Blob = Extract<Part, { shape: "blob" }>;
  const blobs = (ps: Part[]) => ps.filter((p): p is Blob => p.shape === "blob");

  // A tree: a trunk, three limbs, the nine lobes, the middle mass and the crown.
  const tree = treeParts(1750, 1750, 4000);
  const trunk = tree[0];
  assert(trunk.shape === "cylinder" && near(trunk.h, 0.62 * 4000) && trunk.rTop < trunk.rBottom && trunk.material === TRUNK, "a tree's trunk tapers to 0.62 h, in bark");
  const limbs = tree.filter((p) => p.shape === "cylinder" && p.tiltDeg);
  assert(limbs.length === 3, "…three limbs lean out into the crown");
  const crown = blobs(tree);
  const main = crown.filter((p) => p.detail !== 1);
  assert(main.length === TREE_CLUMPS.length + 2 && crown.length === main.length + TREE.sprigs, `…the nine lobes, the middle mass and the crown, and the sprigs out of them (${main.length} + ${crown.length - main.length})`);
  assert(main.every((p) => p.at.z - p.r * TREE.squash >= TREE.crownFrom * 4000 - 1e-6 && p.at.z + p.r * TREE.squash <= 4000 + 1e-6), "every clump stands in the crown band, half way up to the top");
  assert(crown.every((p) => p.at.z > 0.4 * 4000), "…and no sprig hangs down the trunk");
  const nine = main.slice(0, TREE_CLUMPS.length);
  assert(nine.some((p) => near(Math.hypot(p.at.x, p.at.y) + p.r, 1750, 1e-3)), "…the lobes touching the rim, as on the plan");
  assert(new Set(main.map((p) => p.seed)).size === main.length, "…each clump its own lumps");

  // A palm: a ringed trunk, the boot, nineteen arching fronds, three bunches of dates.
  const palm = palmParts(2250, 2250, 6000, "#6f9a5a");
  const lathe = palm[0];
  assert(lathe.shape === "lathe" && near(Math.max(...lathe.profile.map((q) => q.z)), 0.86 * 6000) && lathe.profile.length > 40, "a palm's trunk is a ringed lathe to 0.86 h");
  const fronds = palm.filter((p): p is Extract<Part, { shape: "frond" }> => p.shape === "frond");
  assert(fronds.length === PALM_TIERS.reduce((s, t) => s + t.n, 0) && fronds.every((f) => f.leaflets === PALM_LEAFLETS), "…its crown three tiers of pinnate fronds");
  assert(fronds.every((f) => f.len <= 2250 + 1e-6 && f.len >= 0.7 * 2250), "…each about the crown's radius long");
  const lowest = fronds.filter((f) => (f.liftDeg ?? 0) <= 0);
  assert(lowest.length === 6 && lowest.every((f) => f.material!.colour !== "#6f9a5a"), "…the lowest tier hangs, yellowing");
  assert(blobs(palm).filter((b) => b.material === DATES).length === 3, "…and three bunches of dates under the crown");

  // Shrubs, pots, hedges.
  const shrub = shrubParts(600, 600, 0, 1000);
  const bushy = shrub.filter((p) => p.shape === "blob" && p.detail !== 1);
  assert(shrub.length === 12 && bushy.length === 6 && bushy.every((p) => p.shape === "blob" && p.at.z - p.r * 0.88 >= -1e-6 && p.at.z + p.r * 0.88 <= 1000 + 1e-6), "a shrub: five lobes and a middle mass on the ground, to its height, and six sprigs");
  const pot = potParts(350, 350, 900);
  assert(pot[0].shape === "lathe" && pot[0].material === POT_MATERIAL && blobs(pot).length === 12, "a pot: a terracotta lathe with a shrub in it");
  const hedge = hedgeParts(4000, 800, 1200);
  const hb = blobs(hedge);
  assert(hb.length >= 5 && hb.every((b) => near(b.at.z, 600) && near(b.r * (b.squash ?? 1), 600)), "a hedge: blobs as tall as it, along its length");
  assert(near(Math.min(...hb.map((b) => b.at.x)), -1600) && near(Math.max(...hb.map((b) => b.at.x)), 1600) && hb.every((b) => b.at.y === 0), "…from end to end, along its long side");
  assert(blobs(hedgeParts(800, 60000, 1200)).length === MAX_HEDGE_BLOBS, "a very long hedge spaces its blobs out");
  assert(plantTurn("a", 3000, 3000, 0) !== plantTurn("b", 3000, 3000, 0) && plantTurn("a", 4000, 800, 15) === 15, "round crowns turn by their id; a hedge keeps the plan's turn");
  console.log("scene plants ok");
}
