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
// colour and radius, so a room of forty arrangements draws one bloom geometry per (kind, colour)
// however many tables there are (./collect.ts). Greens are one flat leaf per colour, scaled to each
// sprig's length; trails droop as three small orchids; the foliage `base` is nothing — the vase or
// the table is under it. Deterministic: composeFlowers is seeded and memoised, and nothing here
// draws a random number. `npx tsx lib/scene/flowers.ts` runs the self-check.
//
// A HEAD IS A FLOWER (2026-10-27, the user: "more alive, not a circle — look like the flower"):
// real petals per family (`bloomMesh` — a rose's spiral, a peony's ruffled layers, a tulip's cup, a
// lily's star, a gerbera's ring round its disc), shaded by vertex colour from a dark heart to a light
// rim, ~50–160 triangles, one geometry per key. Each head FACES OUT of the arrangement's surface
// (`Transform.tiltDeg`, the dome's normal; a cascade's fall and a ring round the mass's side lie
// over further), spun by its seeded `rot` so no two are stamped. The mass under them is the shade
// gone dark and green — the depth between flowers — not a pale ball, and two rings of the main
// bloom dress its side, where the plan (seen from above) lays none.
import { FORMS, type FlowerDrawSpec, type FlowerItem, composeFlowers } from "@/lib/catalog/flower-draw";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import type { FlowerKindId } from "@/lib/catalog/flower-kinds";
import { isMain } from "../self-check";
import type { InstanceRequest, ItemBuild } from "./collect";
import { applyTransform } from "./frame";
import { foliageMaterial } from "./materials";
import { seedOf } from "./organic";
import { leafCards } from "./plants";
import { type BloomForm, type NodeTag, type Part, type Transform, transform, vec3 } from "./types";

/** The foliage's colour when the spec has no green of its own (item-symbol.tsx LEAF). */
const LEAF = "#8fae84";
/** A leaf geometry is one unit long; each sprig scales it to its length. */
const LEAF_UNIT_MM = 100;
/** A leaf's width over its length. */
const LEAF_WIDTH = 0.38;
const STEM_R_MM = 3;
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
/** The mass the heads sit in: this share of the heads' rim across, sinking this share of the height
 *  into the vase — the arrangement's green taken this far toward a deep leaf green and darkened to
 *  this: what shows between real blooms is the shadowed foliage they are packed into. */
const MASS_SHARE = 0.74;
const MASS_SINK = 0.08;
const MASS_DEEP = "#2f4a2a";
const MASS_GREEN = 0.85;
const MASS_DARK = 0.7;
/** A leaf card over the mass is this share of the mass's radius across (70–180 mm: a sprig). */
const CARD_SHARE = 0.55;
/** The rings of the main bloom round the mass's side, staggered: each at this share of the mass's
 *  half height from its middle, leaning out this far, this full (1 = petal to petal). */
const RINGS: readonly [share: number, tiltDeg: number, fill: number][] = [
  [0.55, 48, 0.9],
  [0.12, 76, 1],
  [-0.36, 100, 0.85],
];
/** Ring heads stand this many of their own radii apart, centre to centre. */
const RING_SPACING = 2.05;
/** No head leans further than this (past level: the ring under the mass looks a little down); a
 *  seeded jitter of ± this. */
const MAX_TILT = 105;
const TILT_JITTER = 9;

/** `a` a share `t` of the way to `b`, then scaled by `k` (0–1 darker). */
function mixHex(a: string, b: string, t: number, k = 1): string {
  const ok = (h: string) => /^#[0-9a-f]{6}$/i.test(h);
  if (!ok(a) || !ok(b)) return a;
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round((ch(a, i) + (ch(b, i) - ch(a, i)) * t) * k).toString(16).padStart(2, "0")).join("")}`;
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Head = Extract<FlowerItem, { t: "head" | "fill" }>;
type Green = Extract<FlowerItem, { t: "green" }>;
type Trail = Extract<FlowerItem, { t: "trail" }>;

/** The instance key a head shares with every head of its kind, colour and size in the room. */
export const headKey = (kind: string, col: string, r: number): string => `flower:${kind}:${col}:${Math.round(r)}`;

/** Kinds that read as a ball from every side: a hydrangea's mophead, and the small fillers. */
const ROUND_KINDS = new Set(["hydrangea", "gyps", "phlox", "filler", "delphinium", "lavender"]);

/** Each head kind's petals; a face's petal count and its disc's own colour. */
const BLOOM_OF: Partial<Record<FlowerKindId, { form: BloomForm; petals?: number; disc?: string }>> = {
  rose: { form: "rose" },
  spray: { form: "rose" },
  peony: { form: "peony" },
  ranunculus: { form: "peony" },
  carnation: { form: "peony" },
  lisianthus: { form: "cup" },
  tulip: { form: "cup" },
  calla: { form: "cup" },
  lily: { form: "star" },
  daisy: { form: "face", petals: 16, disc: "#6b5a2e" },
  sunflower: { form: "face", petals: 20, disc: "#3d2a14" },
  anemone: { form: "face", petals: 6, disc: "#1c1a22" },
  orchid: { form: "orchid" },
};

/** One head, about its CENTRE (the instance stands at the head's centre, so it leans and spins in
 *  place): a bloom of real petals whose widest ring is `r`, as the plan draws the head; a mophead or
 *  a filler a ball of florets — a blob (./organic.ts) whose many small lumps are the florets, shaded
 *  dark in its hollows by the petal material (a smooth sphere read as a ping-pong ball, 2026-10-24). */
export function headPart(it: { t: string; kind: string; r: number }): Part {
  const r = it.r;
  const bloom = it.t === "head" ? BLOOM_OF[it.kind as FlowerKindId] : undefined;
  if (!bloom || ROUND_KINDS.has(it.kind)) {
    const mop = it.kind === "hydrangea";
    return { shape: "blob", r, at: vec3(0, 0, 0), seed: seedOf(it.kind), lumps: mop ? 14 : 9, rough: mop ? 0.13 : 0.18, squash: mop ? 0.88 : 1, detail: it.t === "fill" ? 1 : r >= 40 ? 3 : 2 };
  }
  const part: Part = { shape: "bloom", form: bloom.form, r, at: vec3(0, 0, 0), seed: seedOf(it.kind) };
  if (bloom.disc) part.disc = bloom.disc;
  if (bloom.petals) part.petals = bloom.petals;
  return part;
}

/** A head's material: its colour on the petal material (two-sided, vertex-shaded). */
const petal = (colour: string) => ({ colour, kind: "petal" as const });

// --- the blooms -----------------------------------------------------------------------------------

/** One petal: a three-wide grid of `rows` along a spine that leaves the axis `base` out at azimuth
 *  `az` (radians), `open` from upright at its foot and `curl` further by its tip (+ out, − in); its
 *  edges brought `cup` of its half-width toward the axis, twisted `twist` by the tip, `len` long and
 *  `wid` half-wide at its widest; shaded `dark` at the foot to `light` at the tip. Units of r. */
interface Petal {
  az: number;
  base: number;
  z0: number;
  len: number;
  wid: number;
  open: number;
  curl: number;
  cup: number;
  twist: number;
  rows: number;
  dark: number;
  light: number;
}

/** A bloom's geometry in the plan frame (mm, z up, opening up +z), indexed so each petal is smooth;
 *  `colours` are linear RGB multipliers on the material's colour. */
export interface BloomMesh {
  positions: number[];
  colours: number[];
  indices: number[];
}

function petalInto(m: BloomMesh, p: Petal): void {
  const ex = Math.cos(p.az);
  const ey = Math.sin(p.az);
  const start = m.positions.length / 3;
  let sx = p.base * ex;
  let sy = p.base * ey;
  let sz = p.z0;
  const step = p.len / (p.rows - 1);
  const angle = (v: number) => p.open + p.curl * v * v;
  for (let k = 0; k < p.rows; k++) {
    const v = k / (p.rows - 1);
    if (k > 0) {
      const a = angle((k - 0.5) / (p.rows - 1));
      sx += step * Math.sin(a) * ex;
      sy += step * Math.sin(a) * ey;
      sz += step * Math.cos(a);
    }
    const a = angle(v);
    // n: the petal's outer face; d: along its spine; across it, the tangent (−ey, ex).
    const n = [Math.cos(a) * ex, Math.cos(a) * ey, -Math.sin(a)];
    const d = [Math.sin(a) * ex, Math.sin(a) * ey, Math.cos(a)];
    const w = p.wid * Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * v)), 0.6);
    for (const u of [-1, 0, 1]) {
      const off = -p.cup * u * u * w + p.twist * u * w * v * v;
      // The middle of the tip stands a little proud: a rounded petal, not a cut-off strip.
      const tip = u === 0 && k === p.rows - 1 ? 0.16 * p.len : 0;
      m.positions.push(sx - u * w * ey + off * n[0] + tip * d[0], sy + u * w * ex + off * n[1] + tip * d[1], sz + off * n[2] + tip * d[2]);
      const s = (p.dark + (p.light - p.dark) * v) * (u === 0 ? 1 : 0.93);
      m.colours.push(s, s, s);
    }
  }
  for (let k = 0; k + 1 < p.rows; k++) {
    for (let j = 0; j < 2; j++) {
      const a = start + k * 3 + j;
      m.indices.push(a, a + 1, a + 4, a, a + 4, a + 3);
    }
  }
}

/** `n` petals evenly round the axis from `phase`, each nudged by the bloom's seed. */
function ring(m: BloomMesh, n: number, phase: number, rnd: () => number, p: Omit<Petal, "az">): void {
  for (let i = 0; i < n; i++) {
    const j = rnd() - 0.5;
    petalInto(m, { ...p, az: phase + (i * 2 * Math.PI) / n + j * 0.35, len: p.len * (1 + j * 0.12), open: p.open + j * 0.12 });
  }
}

/** sRGB #rrggbb → linear RGB, which is what a vertex colour multiplies in. */
function linearOf(hex: string): [number, number, number] {
  const c = (i: number) => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [c(0), c(1), c(2)];
}

/** A face's disc: a low dome fanned from its raised middle, in its own colour. */
function discInto(m: BloomMesh, radius: number, hex: string): void {
  const [r, g, b] = linearOf(hex);
  const start = m.positions.length / 3;
  m.positions.push(0, 0, radius * 0.35);
  m.colours.push(r * 0.7, g * 0.7, b * 0.7);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    m.positions.push(radius * Math.cos(a), radius * Math.sin(a), 0);
    m.colours.push(r, g, b);
  }
  for (let i = 0; i < n; i++) m.indices.push(start, start + 1 + i, start + 1 + ((i + 1) % n));
}

/** mulberry32 — the bloom's petals vary by its seed, the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A bloom of `form`, scaled so its widest ring is `r` and centred on the middle of its height. */
export function bloomMesh(form: BloomForm, r: number, seed: number, opts: { petals?: number; disc?: string } = {}): BloomMesh {
  const m: BloomMesh = { positions: [], colours: [], indices: [] };
  const rnd = rng(seed);
  switch (form) {
    case "rose":
      // A tight bud wrapped by two looser rings, the outer ones curling back at their tips.
      ring(m, 3, 0, rnd, { base: 0.02, z0: 0, len: 0.5, wid: 0.3, open: 0.12, curl: -0.25, cup: 0.95, twist: 0, rows: 3, dark: 0.6, light: 0.84 });
      ring(m, 5, 0.3, rnd, { base: 0.08, z0: -0.1, len: 0.62, wid: 0.4, open: 0.42, curl: 0.05, cup: 0.75, twist: 0.08, rows: 3, dark: 0.66, light: 0.93 });
      ring(m, 5, 0.95, rnd, { base: 0.14, z0: -0.2, len: 0.72, wid: 0.5, open: 0.82, curl: 0.7, cup: 0.5, twist: 0.15, rows: 4, dark: 0.7, light: 1 });
      ring(m, 4, 0.4, rnd, { base: 0.18, z0: -0.26, len: 0.6, wid: 0.45, open: 1.3, curl: 0.5, cup: 0.4, twist: 0.1, rows: 3, dark: 0.72, light: 0.97 });
      break;
    case "peony":
      // Ruffled layers round a crumpled heart.
      ring(m, 6, 0, rnd, { base: 0.03, z0: 0.05, len: 0.38, wid: 0.28, open: 0.2, curl: -0.3, cup: 0.9, twist: 0.3, rows: 3, dark: 0.62, light: 0.88 });
      ring(m, 7, 0.4, rnd, { base: 0.08, z0: -0.05, len: 0.55, wid: 0.4, open: 0.55, curl: -0.1, cup: 0.8, twist: 0.35, rows: 3, dark: 0.68, light: 0.96 });
      ring(m, 7, 0.85, rnd, { base: 0.12, z0: -0.15, len: 0.7, wid: 0.5, open: 0.98, curl: 0.25, cup: 0.65, twist: 0.3, rows: 3, dark: 0.72, light: 1 });
      break;
    case "cup":
      // A tulip's or lisianthus's cup: three inside three, the outer ones lipping out.
      ring(m, 3, 0, rnd, { base: 0.1, z0: -0.4, len: 1, wid: 0.5, open: 0.1, curl: -0.08, cup: 0.8, twist: 0, rows: 4, dark: 0.55, light: 0.95 });
      ring(m, 3, Math.PI / 3, rnd, { base: 0.14, z0: -0.45, len: 1.05, wid: 0.55, open: 0.2, curl: 0.18, cup: 0.75, twist: 0.05, rows: 4, dark: 0.6, light: 1 });
      break;
    case "star":
      // A lily: six long petals swept back.
      ring(m, 6, 0, rnd, { base: 0.08, z0: -0.2, len: 0.95, wid: 0.28, open: 0.75, curl: 1, cup: 0.35, twist: 0.1, rows: 4, dark: 0.68, light: 1 });
      break;
    case "face": {
      // A gerbera, a sunflower, an anemone: a ring of petals round a disc in its own colour.
      const n = opts.petals ?? 16;
      const broad = n <= 8;
      const discR = broad ? 0.28 : n >= 20 ? 0.42 : 0.32;
      ring(m, n, 0, rnd, {
        base: discR * 0.9,
        z0: 0,
        len: 1 - discR,
        wid: broad ? 0.45 : Math.min(0.2, (Math.PI * discR * 1.15) / n),
        open: 1.32,
        curl: 0.12,
        cup: broad ? 0.45 : 0.25,
        twist: 0.05,
        rows: broad ? 3 : 2,
        dark: 0.72,
        light: 1,
      });
      discInto(m, discR, opts.disc ?? "#d8b84a");
      break;
    }
    case "orchid":
      // Three narrow sepals, two broad petals and a cupped lip, nearly flat — it faces out.
      for (const az of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) petalInto(m, { az, base: 0.06, z0: 0, len: 0.95, wid: 0.22, open: 1.4, curl: 0.1, cup: 0.3, twist: 0, rows: 3, dark: 0.7, light: 1 });
      for (const az of [Math.PI / 6, (5 * Math.PI) / 6]) petalInto(m, { az, base: 0.06, z0: 0.02, len: 0.8, wid: 0.4, open: 1.35, curl: 0.05, cup: 0.25, twist: 0.1, rows: 3, dark: 0.75, light: 1 });
      petalInto(m, { az: (3 * Math.PI) / 2, base: 0.05, z0: 0.04, len: 0.6, wid: 0.3, open: 1.05, curl: 0.4, cup: 0.9, twist: 0, rows: 3, dark: 0.5, light: 0.85 });
      break;
  }
  // To the plan's size — the widest ring is r — and centred on the middle of its height, so a head
  // leans and flips about its own middle.
  let rho = 0;
  let zLo = Infinity;
  let zHi = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    rho = Math.max(rho, Math.hypot(m.positions[i], m.positions[i + 1]));
    zLo = Math.min(zLo, m.positions[i + 2]);
    zHi = Math.max(zHi, m.positions[i + 2]);
  }
  const k = rho > 0 ? r / rho : 1;
  const mid = (zLo + zHi) / 2;
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i] *= k;
    m.positions[i + 1] *= k;
    m.positions[i + 2] = (m.positions[i + 2] - mid) * k;
  }
  return m;
}

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
  const inFall = (it: Head) => it.x >= fallFrom - R * 0.06;
  const fallT = (it: Head) => clamp((it.x - fallFrom) / (R * 0.72), 0, 1);
  /** The height of a head's CENTRE. */
  const headZ = (it: Head, onStem: boolean): number => {
    if (form === "single") return H - it.r;
    if (form === "runner") return H * (it.t === "head" ? RUNNER_HEAD : RUNNER_FILL);
    if (form === "bud") return H * BUD_HEAD;
    if (onStem) return H * REACH_RISE;
    if (inFall(it)) {
      const start = H * Math.sqrt(1 - (0.85 / 1.1) ** 2);
      return start + (H * FALL_END - start) * fallT(it);
    }
    const z = dome(it.x, it.y);
    return form === "cushion" ? H - (H - z) * CUSHION_FLATTEN : z;
  };
  /** Which way a head looks: out along `outRad` on the plan, leant `tiltDeg` from upright — the
   *  normal of the surface it sits on — give or take a seeded few degrees. */
  const facing = (it: Head, z: number, onStem: boolean): { outRad: number; tiltDeg: number } => {
    if (form === "single") return { outRad: it.rot, tiltDeg: 6 };
    if (form === "runner") return { outRad: it.y >= 0 ? Math.PI / 2 : -Math.PI / 2, tiltDeg: 40 * Math.min(1, Math.abs(it.y) / Math.max(1, spec.h / 2)) };
    if (form === "bud") return { outRad: Math.atan2(it.y, it.x), tiltDeg: 14 };
    if (onStem) return { outRad: Math.atan2(it.y, it.x - cx), tiltDeg: 10 };
    // A cascade's fall turns out over its +x end and down as it goes.
    if (inFall(it)) return { outRad: 0, tiltDeg: 55 + 40 * fallT(it) };
    // The dome is (d/rim)² + (z/H)² = 1; its normal leans atan((d/rim²) / (z/H²)) from upright. A
    // cushion's slope is CUSHION_FLATTEN of the dome's.
    const d = Math.hypot(it.x - cx, it.y);
    const lean = Math.atan2(d / (rim * rim), Math.max(z, H * 0.05) / (H * H));
    return { outRad: Math.atan2(it.y, it.x - cx), tiltDeg: deg(form === "cushion" ? Math.atan(CUSHION_FLATTEN * Math.tan(lean)) : lean) };
  };
  const leafZ = form === "runner" ? H * 0.3 : form === "bud" ? H * 0.6 : H * LEAF_Z;

  /** A head with its centre at `z`, looking out along `outRad` leant `tiltDeg`; spun by its `rot`.
   *  A ball of florets has no face to turn and only spins. */
  const head = (it: Head, z: number, look: { outRad: number; tiltDeg: number }) => {
    const part = headPart(it);
    const jitter = ((it.rot * 5.17) % 1) - 0.5;
    const at: Transform = part.shape === "bloom" ? { ...transform(vec3(it.x, it.y, z), deg(look.outRad) - 90), spinDeg: deg(it.rot) } : transform(vec3(it.x, it.y, z), deg(it.rot));
    const tilt = clamp(look.tiltDeg + jitter * 2 * TILT_JITTER, 0, MAX_TILT);
    if (part.shape === "bloom" && tilt > 0.5) at.tiltDeg = Math.round(tilt * 10) / 10;
    const req: InstanceRequest = { key: headKey(it.kind, it.col, it.r), parts: [part], material: petal(it.col), tag, at, castShadow: false };
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
  // An orchid's spray: three blooms down an arching stem, each looking out and a little down.
  const trail = (it: Trail, from: number) => {
    const radii = [30, 26, 22];
    radii.forEach((r, k) => {
      const t = (k + 1) / radii.length;
      const z = from - H * 0.4 * t;
      build.instanced.push({
        key: `trail:${it.col}:${r}`,
        parts: [{ shape: "bloom", form: "orchid", r, at: vec3(0, 0, 0), seed: seedOf(`orchid:${r}`) }],
        material: petal(it.col),
        tag,
        at: { ...transform(vec3(it.x + Math.cos(it.ang) * it.len * t, it.y + Math.sin(it.ang) * it.len * t, z), deg(it.ang) - 90), tiltDeg: 70 + 8 * k },
        castShadow: false,
      });
    });
  };
  const stem = (x: number, y: number, from: number, to: number) => {
    if (to - from < 5) return;
    build.parts.push({ shape: "cylinder", rTop: STEM_R_MM, rBottom: STEM_R_MM, h: to - from, at: vec3(x, y, from), segments: 6 });
  };

  // The mass the heads sit in: the small flowers, the filler and the greens packed between the
  // blooms, on the vase's mouth, its top a little under the heads' — leafy and deep green, a ball of
  // small clumps, its hollows darker still, mostly hidden by the heads round it. A PALE mass read as a
  // scoop of ice cream under the heads, a dark grey one as a bowling ball (both 2026-10-27); a bright
  // GREEN one, bare, as a camouflage egg (2026-10-24); heads alone floated over the vase like a bunch
  // of balloons.
  if (F) {
    const massTop = H * (form === "cushion" ? 0.78 : 0.8);
    const a = (massTop + MASS_SINK * H) / 2;
    const r = rim * MASS_SHARE;
    // The mass is plain and dark (shaded by its own clumps); the LEAVES are cards of the trees' leaf
    // atlas all over it (./plants.ts leafCards), the greenery showing between the blooms, top and
    // side — a textured ball striped where it squashed and read as a watermelon, and its bare crown
    // showed as a smooth olive cap between the top heads (both 2026-10-27).
    const massPart: Extract<Part, { shape: "blob" }> = { shape: "blob", r, at: vec3(cx, 0, massTop - a), seed: spec.seed, squash: a / r, lumps: 15, rough: 0.1, detail: 3, material: petal(mixHex(greenCol, MASS_DEEP, MASS_GREEN, MASS_DARK)) };
    build.parts.push(massPart);
    const cards = leafCards([massPart], clamp(r * CARD_SHARE, 70, 180), spec.seed);
    if (cards.length) build.parts.push({ shape: "leaves", at: vec3(0, 0, 0), centre: massPart.at, cards, material: { colour: greenCol, kind: "leaves" } });
    // …and its side dressed: staggered rings of the arrangement's main bloom round the mass, from
    // its shoulder to under its widest, looking out — where the plan (seen from above) lays none.
    // Instanced with the rest, so they cost no draw call.
    const blooms = items.filter((it): it is Head => it.t === "head" && !ROUND_KINDS.has(it.kind));
    if (blooms.length && form !== "cascade") {
      const tally = new Map<string, { it: Head; n: number }>();
      for (const it of blooms) {
        const k = headKey(it.kind, it.col, it.r);
        tally.set(k, { it, n: (tally.get(k)?.n ?? 0) + 1 });
      }
      const main = [...tally.values()].sort((x, y) => y.n - x.n)[0].it;
      // A cushion is low and flat on its table: its side is the shoulder alone.
      const rings = form === "cushion" ? RINGS.slice(0, 1) : RINGS;
      rings.forEach(([share, tilt, fill], i) => {
        const zc = massTop - a + a * share;
        // On the mass's surface, pushed out a little so the bloom sits on it, not in it.
        const ring = (r * Math.sqrt(1 - share * share) + main.r * 0.25) * 0.97;
        const n = Math.max(5, Math.min(20, Math.floor(((2 * Math.PI * ring) / (RING_SPACING * main.r)) * fill)));
        const phase = (i % 2) * 0.5 + 0.25 * (spec.seed % 2);
        for (let k = 0; k < n; k++) {
          const ang = (2 * Math.PI * (k + phase)) / n;
          head({ ...main, x: cx + ring * Math.cos(ang), y: ring * Math.sin(ang), rot: ang * 3.7 + k + i }, zc, { outRad: ang, tiltDeg: tilt });
        }
      });
    }
  }

  let afterStem = false;
  for (const it of items) {
    switch (it.t) {
      case "head":
      case "fill": {
        const z = headZ(it, afterStem);
        head(it, z, facing(it, z, afterStem));
        // A stem reaches the bloom's foot, a little under its centre.
        if (afterStem) stem(it.x, it.y, H * 0.35, z - it.r * 0.4);
        else if (form === "single") stem(it.x, it.y, 0, z - it.r * 0.4);
        else if (form === "bud") stem(it.x, it.y, H * BUD_BOTTLE, z - it.r * 0.4);
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
