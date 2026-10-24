// What hangs from the ceiling — a chandelier, an arrangement hung mass-up — and the curtains along
// a wall. Spec §3.4 (the curtains row), §3.5 (ceiling items), §4 (the bulbs glow at night).
//
// Lifted from the plan's own pictures, like every kind in ./items.ts. `chandelier()` in
// components/item-symbol.tsx:923 says the arms reach 0.74 R (:926), the crystal ring sits at 0.48 R
// (:934), the hub is 0.13 R (:942), there are max(3, n) arms (:925) and a bulb is min(0.1 R, 0.35 of
// the ring's pitch) (:927) — here each gets a z. A hung arrangement is ./flowers.ts's dome turned
// upside down: the same `flowerBuild`, then `flipZ` about its height, so the foliage mass is at the
// top and the heads hang under it, the one nearest the middle lowest (a cascade's fall, which
// already descends toward +x, hangs lowest of all). The curtains are `DrapePleats`
// (item-symbol.tsx:1275) stood up: a pleat every 150 mm (:1276), amplitude 0.28 of the band
// (:1279), the band the canvas draws 220 mm thick (canvas-stage.tsx:2775 DRAPE_MM).
//
// FRAMES. A ceiling item's transform puts its UNDERSIDE at `at.z` (build.ts ceilingPlacement:
// `hangHeightOf`, else `ceilingUndersideMm` below), so every body here grows UP from z 0 to its
// height h, and the chain — when `ctx.chainMm` says how far above h the ceiling is — rises from h
// to exactly h + chainMm. No chainMm is open sky: it hangs from nothing, as the plan draws it. A
// curtain is built in the ROOM frame: `path` is the wall stretch in room mm, every part's `at` is
// the room origin and the ribbon's path carries the room coordinates, so the caller places the
// build at `transform(vec3(0, 0, 0), 0)` and nothing else.
//
// Pure: no React, no three. `npx tsx lib/scene/overhead.ts` runs the self-check.
import type { Point } from "@/lib/studio/hall";
import type { SymbolKind } from "@/lib/catalog/symbols";
import { FORMS, type FlowerDrawSpec, isPale } from "@/lib/catalog/flower-draw";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { isMain } from "../self-check";
import type { InstanceRequest, ItemBuild } from "./collect";
import { type ItemContext, fallbackBody } from "./item-context";
import { flowerBuild } from "./flowers";
import { ENVELOPE, clothMaterial, emissiveMaterial, foliageMaterial, glassMaterial, metalMaterial } from "./materials";
import { type MaterialRef, type NodeTag, type Part, type Vec3, vec3 } from "./types";
import { frondSpan } from "./organic";

// ── the constants ───────────────────────────────────────────────────────────────────────────────

/** A ceiling item with no hang height of its own hangs this far under the ceiling (a chandelier
 *  clears a standing guest), or at this height when nothing above it is roofed. Spec §3.5. */
export const HANG_UNDER_CEILING_MM = 1200;
export const HANG_OPEN_SKY_MM = 3000;

/** A chandelier whose row has no height (the plan draws it flat): a plain one's. */
const CHANDELIER_H_MM = 600;
/** An arm's section (items.ts ARM_MM — the same thin bar a candelabrum's arms are). */
const ARM_MM = 10;
const CHAIN_R_MM = 8;
const CABLE_R_MM = 4;
/** Past this drop one chain would read as a pole: three cables at 120° instead. */
const CABLES_FROM_MM = 3000;
/** types.ts EmitterNode: "a chandelier bulb ~0.7". */
const BULB = 0.7;
/** Glass drops under the ring. */
const DROPS = 12;
/** DrapePleats (item-symbol.tsx:1276, :1279): a pleat every 150 mm, amplitude 0.28 of the band —
 *  the band the canvas draws 220 mm thick (canvas-stage.tsx:2775 DRAPE_MM). */
const PLEAT_MM = 150;
const DRAPE_BAND_MM = 220;
const PLEAT_AMPLITUDE_MM = Math.round(DRAPE_BAND_MM * 0.28); // 62
const ROD_R_MM = 15;
const ROD_ABOVE_MM = 30;
/** The rod's and a hung arrangement's cable: the plan's muted metal, not the designer's tone. */
const ROD = "#b6b2c4";
/** The foliage disc a hung arrangement is built on. */
const BASE_DISC_MM = 30;
/** The foliage's colour when nothing says otherwise (item-symbol.tsx LEAF). */
const LEAF = "#8fae84";

// ── small helpers (items.ts's, kept local: items.ts imports this module) ───────────────────────

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const polar = (r: number, d: number): Point => ({ x: r * Math.cos(rad(d)), y: r * Math.sin(rad(d)) });

/** Near-white — crystal, white porcelain (item-symbol.tsx:352 paleTone, items.ts:79 pale). */
const pale = (tone: string): boolean => HEX.test(tone.trim()) && isPale(tone.trim());

/** A chandelier's frame: the metal where it has a colour; faint and clear where it is crystal or
 *  white, or the frame would be the only thing you see of it (items.ts armMaterial). */
const frameMaterial = (tone: string): MaterialRef => (pale(tone) ? { colour: "#d6d2dd", kind: "glass", opacity: 0.5 } : metalMaterial(tone));

const GLASS = glassMaterial();

const box = (w: number, d: number, h: number, at: Vec3, material?: MaterialRef, rotDeg?: number): Part => {
  const p: Part = { shape: "box", w, d, h, at };
  if (material) p.material = material;
  if (rotDeg) p.rotDeg = rotDeg;
  return p;
};
const cyl = (r: number, h: number, at: Vec3, material?: MaterialRef, segments?: number): Part => {
  const p: Part = { shape: "cylinder", rTop: r, rBottom: r, h, at };
  if (material) p.material = material;
  if (segments) p.segments = segments;
  return p;
};
const sphere = (r: number, at: Vec3, material?: MaterialRef, segments?: number): Part => {
  const p: Part = { shape: "sphere", r, at };
  if (material) p.material = material;
  if (segments) p.segments = segments;
  return p;
};
const torus = (r: number, tube: number, at: Vec3, material?: MaterialRef): Part => (material ? { shape: "torus", r, tube, at, material } : { shape: "torus", r, tube, at });

const make = (material: MaterialRef): ItemBuild => ({ parts: [], material, instanced: [], emitters: [] });

/** An arm from the hub out to `p` at height `z`: a thin bar lying along its bearing (items.ts arm). */
function arm(b: ItemBuild, p: Point, z: number, material: MaterialRef) {
  const len = Math.hypot(p.x, p.y);
  if (len < 1) return;
  b.parts.push(box(len, ARM_MM, ARM_MM, vec3(p.x / 2, p.y / 2, z - ARM_MM / 2), material, deg(Math.atan2(p.y, p.x))));
}

/** What joins a hung thing to the ceiling: from its top at `top`, `chainMm` straight up — one
 *  chain at the centre, or past CABLES_FROM_MM three cables standing `spread` out at 120°. Nothing
 *  when there is no ceiling (open sky). */
function chainParts(top: number, chainMm: number | undefined, spread: number, material: MaterialRef): Part[] {
  if (!chainMm || chainMm <= 0) return [];
  if (chainMm > CABLES_FROM_MM) {
    return [0, 1, 2].map((i) => {
      const p = polar(spread, -90 + i * 120);
      return cyl(CABLE_R_MM, chainMm, vec3(p.x, p.y, top), material, 6);
    });
  }
  return [cyl(CHAIN_R_MM, chainMm, vec3(0, 0, top), material, 8)];
}

// ── the chandelier (item-symbol.tsx:923 chandelier) ─────────────────────────────────────────────

/** A chandelier standing on its underside: the ring at 0.74 R and the arms out to it at 0.2 h, a
 *  bulb at every arm's end (lit), the hub up to 0.5 h, the crystal ring at 0.48 R lower down and
 *  twelve drops hanging under the ring to z 0, a crown at the top, and the chain above it. */
function chandelierBody(ctx: ItemContext): ItemBuild {
  const R = Math.max(50, Math.min(ctx.widthMm, ctx.depthMm) / 2); // item-symbol.tsx:924
  const h = ctx.heightMm > 0 ? ctx.heightMm : CHANDELIER_H_MM;
  const count = Math.max(3, Math.round(ctx.count) || 8); // :925, symbolCount's default of 8
  const frame = frameMaterial(ctx.tone);
  const b = make(frame);
  const ringR = R * 0.74; // :926
  const ringZ = h * 0.2;
  const bulb = Math.min(R * 0.1, ((Math.PI * ringR) / count) * 0.35); // :927
  const bulbM = emissiveMaterial(ENVELOPE.bulb);

  b.parts.push(torus(ringR, Math.max(8, R * 0.03), vec3(0, 0, ringZ), frame));
  b.parts.push(cyl(R * 0.13, h * 0.5, vec3(0, 0, 0), frame)); // :942 the hub
  b.parts.push(torus(R * 0.48, Math.max(4, R * 0.02), vec3(0, 0, h * 0.1), GLASS)); // :934 the crystal ring
  const drop = Math.max(6, R * 0.03);
  for (let i = 0; i < DROPS; i++) {
    const p = polar(ringR, -90 + (i + 0.5) * (360 / DROPS));
    b.parts.push(sphere(drop, vec3(p.x, p.y, drop), GLASS, 6));
  }
  for (let i = 0; i < count; i++) {
    const p = polar(ringR, -90 + (i * 360) / count); // :926 the plan's angles
    arm(b, p, ringZ, frame);
    const z = ringZ + h * 0.1;
    b.parts.push(sphere(bulb, vec3(p.x, p.y, z), bulbM, 8));
    b.emitters.push({ at: vec3(p.x, p.y, z), radiusMm: bulb * 2, colour: ENVELOPE.bulb, strength: BULB });
  }
  b.parts.push(cyl(R * 0.2, h * 0.1, vec3(0, 0, h * 0.9), frame)); // the crown
  b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
  return b;
}

// ── a hung arrangement (./flowers.ts upside down) ───────────────────────────────────────────────

/** The z a part spans in its own frame, bottom to top. */
function partSpan(p: Part): [number, number] {
  switch (p.shape) {
    case "box":
    case "cylinder":
    case "extrude":
    case "ribbon":
    case "drape":
      return [p.at.z, p.at.z + p.h];
    case "sphere":
      return [p.at.z - p.r, p.at.z + p.r];
    case "blob": {
      const h = p.r * (p.squash ?? 1) * (1 + (p.rough ?? 0.2));
      return [p.at.z - h, p.at.z + h];
    }
    case "frond": {
      const [lo, hi] = frondSpan(p);
      return [p.at.z + lo, p.at.z + hi];
    }
    case "torus":
      return [p.at.z - p.tube, p.at.z + p.tube];
    case "lathe": {
      let lo = 0;
      let hi = 0;
      for (const q of p.profile) {
        lo = Math.min(lo, q.z);
        hi = Math.max(hi, q.z);
      }
      return [p.at.z + lo, p.at.z + hi];
    }
    case "plane":
      return [p.at.z, p.at.z];
    case "leaves": {
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of p.cards) {
        lo = Math.min(lo, c.z - c.size / 2);
        hi = Math.max(hi, c.z + c.size / 2);
      }
      return Number.isFinite(lo) ? [p.at.z + lo, p.at.z + hi] : [p.at.z, p.at.z];
    }
  }
}

/** One part turned upside down about z = H/2: what stood between z and z + h now stands between
 *  H − (z + h) and H − z. A tapered cylinder swaps its radii, a lathe's profile is read the other
 *  way up, a plane faces the other way, a lean tips the other way (mirrored about its base line —
 *  nothing hung is tilted today). A sphere and a torus flip by their centre. */
function flipPart(p: Part, H: number): Part {
  switch (p.shape) {
    case "box": {
      const q: Part = { ...p, at: vec3(p.at.x, p.at.y, H - (p.at.z + p.h)) };
      if (p.tiltDeg) q.tiltDeg = -p.tiltDeg;
      return q;
    }
    case "cylinder": {
      const q: Part = { ...p, rTop: p.rBottom, rBottom: p.rTop, at: vec3(p.at.x, p.at.y, H - (p.at.z + p.h)) };
      if (p.tiltDeg) q.tiltDeg = -p.tiltDeg;
      return q;
    }
    case "extrude":
    case "ribbon":
    case "drape":
      return { ...p, at: vec3(p.at.x, p.at.y, H - (p.at.z + p.h)) };
    case "sphere":
    case "torus":
    case "blob":
      return { ...p, at: vec3(p.at.x, p.at.y, H - p.at.z) };
    case "frond":
      // Hung upside down, a leaf that rose now falls: the lift and the droop change sign.
      return { ...p, at: vec3(p.at.x, p.at.y, H - p.at.z), liftDeg: -(p.liftDeg ?? 20), droopDeg: -(p.droopDeg ?? 40) };
    case "lathe": {
      const zmax = p.profile.reduce((m, q) => Math.max(m, q.z), 0);
      const profile = [...p.profile].reverse().map((q) => ({ r: q.r, z: zmax - q.z }));
      return { ...p, profile, at: vec3(p.at.x, p.at.y, H - p.at.z - zmax) };
    }
    case "plane":
      return { ...p, at: vec3(p.at.x, p.at.y, H - p.at.z), side: p.side === "down" ? "up" : p.side === "both" ? "both" : "down" };
    case "leaves":
      return { ...p, at: vec3(p.at.x, p.at.y, H - p.at.z), centre: vec3(p.centre.x, p.centre.y, -p.centre.z), cards: p.cards.map((c) => ({ ...c, z: -c.z, pitchDeg: -c.pitchDeg })) };
  }
}

/** An instance keeps its PARTS — its geometry stays the one shared with every upright arrangement
 *  in the room (a head's sphere, a leaf's slab: symmetric about their own middle) — and only its
 *  `at.z` moves, by the parts' local extent [lo, hi]: the instance spanned [at.z + lo, at.z + hi]
 *  and now spans [H − at.z − hi, H − at.z − lo], so at.z' = H − at.z − hi − lo. A head sphere at
 *  local z = r (centre at at.z + r) lands with its centre at H − (at.z + r). */
function flipInstance(r: InstanceRequest, H: number): InstanceRequest {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of r.parts) {
    const [a, b] = partSpan(p);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  if (!r.parts.length) lo = hi = 0;
  return { ...r, at: { ...r.at, at: vec3(r.at.at.x, r.at.at.y, H - r.at.at.z - hi - lo) } };
}

/** `build` turned upside down about z = H/2: every part, instance and emitter that stood at z now
 *  stands at H − z, so a thing built up from its floor hangs down from its top. */
export function flipZ(build: ItemBuild, H: number): ItemBuild {
  return {
    material: build.material,
    parts: build.parts.map((p) => flipPart(p, H)),
    instanced: build.instanced.map((r) => flipInstance(r, H)),
    emitters: build.emitters.map((e) => ({ ...e, at: vec3(e.at.x, e.at.y, H - e.at.z) })),
  };
}

/** A cascade's fall re-hung after the flip. Upright it descends off the mass toward +x, from the
 *  dome's height at the mass's edge down to FALL_END (flowers.ts:70–80, flower-draw.ts:351); turned
 *  over as it is, that run would climb toward the ceiling. A hung cascade trails DOWN instead: the
 *  same heads (the ones past `fallFrom`, by the same rule) from the inverted rim's level L = H −
 *  start to the underside at the tip and never below it — a head's CENTRE stops at 0, as the
 *  dome's apex does, the way an upright head's centre tops at H (flowerBuild's rule). */
function hangFall(build: ItemBuild, spec: FlowerDrawSpec, H: number): void {
  const F = FORMS.cascade;
  const R = Math.min(spec.w, spec.h) / 2;
  const cx = (F.shift ?? 0) * R;
  const fallFrom = cx + R * F.core * 0.85;
  const start = H * Math.sqrt(1 - (0.85 / 1.1) ** 2);
  const L = H - start;
  for (const r of build.instanced) {
    const p = r.parts[0];
    // A head is a ball of florets or a bloom (flowers.ts headPart); either way its centre is one
    // radius up.
    const radius = p?.shape === "sphere" || p?.shape === "blob" ? p.r : p?.shape === "lathe" ? p.profile.reduce((m, q) => Math.max(m, q.r), 0) : 0;
    if (!r.key.startsWith("flower:") || radius <= 0) continue;
    const x = r.at.at.x;
    if (x < fallFrom - R * 0.06) continue;
    const t = Math.max(0, Math.min(1, (x - fallFrom) / (R * 0.72)));
    const centre = Math.max(0, L * (1 - t));
    r.at = { ...r.at, at: vec3(x, r.at.at.y, centre - radius) };
  }
}

/** An arrangement hung from the ceiling: the plan's layout (`ctx.flowers`) built by ./flowers.ts
 *  and inverted, so the mass is at the top (a foliage disc the width of the footprint, 30 thick,
 *  under the chain) and the heads hang under it — the dome's apex lowest; a cascade's fall re-hung
 *  to trail down to the underside (`hangFall`). With no spec a foliage ball of the footprint's
 *  radius at the top. */
export function hungFlowersBody(ctx: ItemContext): ItemBuild {
  const w = Math.max(20, ctx.widthMm);
  const d = Math.max(20, ctx.depthMm);
  const r = Math.min(w, d) / 2;
  const cable = metalMaterial(ROD);
  if (!ctx.flowers) {
    const H = Math.max(ctx.heightMm, 2 * r);
    const b = make(foliageMaterial(LEAF));
    b.parts.push(sphere(r, vec3(0, 0, H - r)));
    b.parts.push(...chainParts(H, ctx.chainMm, r * 0.6, cable));
    return b;
  }
  const tag: NodeTag = ctx.tag ?? (ctx.product ? { type: "flowers", label: ctx.product.name } : { type: "flowers" });
  const H = Math.max(40, ctx.heightMm > 0 ? ctx.heightMm : Math.round(r * 1.2));
  const b = flipZ(flowerBuild(ctx.flowers, H, tag), H);
  if (ctx.flowers.form === "cascade") hangFall(b, ctx.flowers, H);
  b.parts.push(cyl(r, BASE_DISC_MM, vec3(0, 0, H - BASE_DISC_MM), b.material));
  b.parts.push(...chainParts(H, ctx.chainMm, r * 0.6, cable));
  return b;
}

// ── dispatch ────────────────────────────────────────────────────────────────────────────────────

/** The body of a ceiling kind. items.ts hands "chandelier" here; build.ts hands a flowers kind on
 *  the ceiling layer to `hungFlowersBody` (routed here too, for a caller that only has the kind).
 *  Anything else overhead is the honest box. */
export function overheadKindBody(kind: SymbolKind, ctx: ItemContext): ItemBuild {
  switch (kind) {
    case "chandelier":
      return chandelierBody(ctx);
    case "flowers":
    case "centerpiece":
      return hungFlowersBody(ctx);
    default:
      return fallbackBody(ctx);
  }
}

// ── the curtains (item-symbol.tsx:1275 DrapePleats, canvas-stage.tsx:2775 DRAPE_MM) ──────────────

/** A curtain hung along `path` (ROOM mm — the wall stretch `resolveSpan` gives) from the floor up
 *  to `topMm` (the zone's ceiling, or the row's height under open sky): a pleated ribbon — a pleat
 *  every 150 mm, 62 mm either side of the line — and its rod, a cylinder lying along the path's
 *  chord 30 above the top. Built in the room frame: every `at` is the room origin and the ribbon's
 *  path carries the room coordinates, so the caller places it at `transform(vec3(0, 0, 0), 0)`.
 *  `tag` is for instanced parts; a curtain has none today, its body wears the caller's tag. */
export function curtainBody(path: Point[], topMm: number, colour: string, tag: NodeTag): ItemBuild {
  void tag;
  const h = Math.max(10, topMm);
  const b = make(clothMaterial(colour));
  if (path.length < 2) return b;
  b.parts.push({ shape: "ribbon", path, h, at: vec3(0, 0, 0), pleatMm: PLEAT_MM, amplitudeMm: PLEAT_AMPLITUDE_MM });
  const a = path[0];
  const z = path[path.length - 1];
  const len = Math.hypot(z.x - a.x, z.y - a.y);
  if (len >= 1) {
    // A cylinder grows up from its base; tilted 90° about its own x axis AFTER rotDeg (types.ts
    // Part) it lies along its turned +y — rotDeg = bearing − 90 lays that along the chord.
    const bearing = deg(Math.atan2(z.y - a.y, z.x - a.x));
    b.parts.push({ shape: "cylinder", rTop: ROD_R_MM, rBottom: ROD_R_MM, h: len, at: vec3(a.x, a.y, h + ROD_ABOVE_MM), rotDeg: bearing - 90, tiltDeg: 90, segments: 10, material: metalMaterial(ROD) });
  }
  return b;
}

/** Where a ceiling item's underside goes when its placement has no hang height: a guest's
 *  clearance under the ceiling, or HANG_OPEN_SKY_MM when nothing above it is roofed (spec §3.5).
 *  `heightMm` is the item's, reserved for a per-kind clearance (the spec's −600 for a pendant). */
export function ceilingUndersideMm(roofedMm: number | null, heightMm: number): number {
  void heightMm;
  return roofedMm ? Math.max(roofedMm - HANG_UNDER_CEILING_MM, 0) : HANG_OPEN_SKY_MM;
}

// ponytail: self-check. Run: npx tsx lib/scene/overhead.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
  const ctxOf = (diameterMm: number, heightMm: number, extra: Partial<ItemContext> = {}): ItemContext => ({
    product: undefined,
    resolved: undefined,
    footprint: { kind: "circle", diameterMm },
    widthMm: diameterMm,
    depthMm: diameterMm,
    heightMm,
    tone: "#c9a24a",
    count: 1,
    author: false,
    ...extra,
  });
  const top = (p: Part) => partSpan(p)[1];
  const arms = (b: ItemBuild) => b.parts.filter((p) => p.shape === "box" && p.d === ARM_MM && p.h === ARM_MM);

  // A ⌀1200 chandelier, 600 high, eight arms: the ring at 0.74 R, eight arms, eight lit bulbs.
  const eight = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8 }));
  const rings = eight.parts.filter((p) => p.shape === "torus" && near(p.r, 444));
  assert(rings.length === 1 && rings[0].shape === "torus" && near(rings[0].at.z, 120), `one ring at 0.74 R = 444, at 0.2 h (${rings.length})`);
  assert(arms(eight).length === 8, `eight arms (${arms(eight).length})`);
  assert(eight.emitters.length === 8 && eight.emitters.every((e) => near(e.at.z, 180) && e.strength === BULB && e.colour === ENVELOPE.bulb), "eight bulbs glow at 0.3 h, at 0.7");
  const bulbR = Math.min(60, ((Math.PI * 444) / 8) * 0.35);
  assert(eight.parts.filter((p) => p.shape === "sphere" && p.material?.kind === "emissive" && near(p.r, bulbR)).length === 8, "a bulb is the plan's radius, emissive");
  assert(eight.emitters.every((e) => near(e.radiusMm, bulbR * 2) && near(Math.hypot(e.at.x, e.at.y), 444)), "…its glow twice that, on the ring");
  assert(eight.parts.some((p) => p.shape === "torus" && near(p.r, 288) && p.material?.kind === "glass" && near(p.at.z, 60)), "the crystal ring at 0.48 R, glass, at 0.1 h");
  assert(eight.parts.filter((p) => p.shape === "sphere" && p.material?.kind === "glass").length === DROPS && eight.parts.filter((p) => p.shape === "sphere" && p.material?.kind === "glass").every((p) => near(partSpan(p)[0], 0)), "twelve drops hang to the underside");
  assert(eight.parts.some((p) => p.shape === "cylinder" && near(p.rBottom, 78) && near(p.at.z, 0) && near(p.h, 300)), "the hub 0.13 R from the underside to 0.5 h");
  assert(Math.max(...eight.parts.map(top)) === 600 && eight.parts.every((p) => partSpan(p)[0] >= -1e-9), "open sky: nothing above h and nothing under the underside");
  assert(eight.material.kind === "metal" && eight.material.colour === "#c9a24a", "a gold chandelier's frame is its metal");
  assert(overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, tone: "#f7f6fc" })).material.kind === "glass", "a crystal one's frame is faint glass");

  // The chain reaches the ceiling exactly; a long drop is three cables.
  const chained = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chainMm: 1500 }));
  const chains = chained.parts.filter((p) => p.shape === "cylinder" && p.at.z === 600);
  assert(chains.length === 1 && chains[0].shape === "cylinder" && chains[0].rBottom === CHAIN_R_MM && near(top(chains[0]), 2100), "one chain from h to h + chainMm");
  const cabled = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chainMm: 4000 }));
  const cables = cabled.parts.filter((p) => p.shape === "cylinder" && p.at.z === 600);
  assert(cables.length === 3 && cables.every((p) => p.shape === "cylinder" && p.rBottom === CABLE_R_MM && near(top(p), 4600)), "a 4 m drop is three cables, each to the ceiling");
  assert(arms(overheadKindBody("chandelier", ctxOf(800, 500, { count: 3 }))).length === 3, "three arms");
  assert(arms(overheadKindBody("chandelier", ctxOf(800, 500, { count: 1 }))).length === 3, "never fewer than three (item-symbol.tsx:925)");
  assert(arms(overheadKindBody("chandelier", ctxOf(800, 500, { count: 0 }))).length === 8, "no count: the plan's eight");
  assert(Math.max(...overheadKindBody("chandelier", ctxOf(800, 0, { count: 5 })).parts.map(top)) === CHANDELIER_H_MM, "no height: 600");

  // A hung dome: the same heads as on a table, upside down.
  const product = {
    id: "p-hung",
    name: "ורדים ואקליפטוס תלויים",
    category: "flower-arrangements",
    layer: "ceiling" as const,
    dimensions: { diameterMm: 600, heightMm: 400 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    flowers: [
      { id: "l1", name: "ורד", qty: 30 },
      { id: "l2", name: "אקליפטוס", qty: 10 },
    ],
  };
  const spec = flowerDrawSpecOf(product, { kind: "circle", diameterMm: 600 }, "#e8bcce");
  assert(spec.form === "dome", `a 40 cm arrangement is a dome (${spec.form})`);
  // A head's centre: its base plus a ball's radius, or a bloom's widest ring (flowers.ts headPart).
  const centreOf = (r: InstanceRequest) => {
    const p = r.parts[0];
    if (p.shape === "sphere" || p.shape === "blob") return r.at.at.z + p.r;
    if (p.shape === "lathe") return r.at.at.z + p.profile.reduce((m, q) => Math.max(m, q.r), 0);
    return r.at.at.z;
  };
  const upright = flowerBuild(spec, 400, { type: "flowers" });
  const hung = hungFlowersBody(ctxOf(600, 400, { flowers: spec }));
  const heads = hung.instanced.filter((r) => r.key.startsWith("flower:"));
  assert(heads.length > 5, `a ⌀60 hung dome has heads (${heads.length})`);
  assert(heads.every((r) => centreOf(r) >= 0 && centreOf(r) <= 400), "every head's centre is between the underside and the top");
  const lowest = heads.reduce((a, b) => (centreOf(b) < centreOf(a) ? b : a));
  const nearest = heads.reduce((a, b) => (Math.hypot(b.at.at.x, b.at.at.y) < Math.hypot(a.at.at.x, a.at.at.y) ? b : a));
  assert(lowest === nearest, "the head nearest the middle hangs lowest — the dome law, inverted");
  const upHeads = upright.instanced.filter((r) => r.key.startsWith("flower:"));
  assert(upHeads.length === heads.length && upHeads.every((r, i) => r.key === heads[i].key && near(centreOf(r) + centreOf(heads[i]), 400)), "every head is the table's head mirrored about H/2, keyed the same (one geometry for both)");
  const disc = hung.parts.find((p) => p.shape === "cylinder" && near(p.rBottom, 300));
  assert(!!disc && near(disc.at.z, 370) && near(top(disc), 400) && disc.material?.kind === "foliage", "a foliage disc the footprint's width at the top");
  assert(hung.parts.every((p) => p.shape === "blob" || partSpan(p)[0] >= 400 * 0.3 - 1e-9), "every part (the disc, any stem) is in the upper mass, not among the hanging heads");
  const leafy = hung.parts.find((p): p is Extract<Part, { shape: "blob" }> => p.shape === "blob");
  assert(!!leafy && near(partSpan(leafy)[0], 400 - 400 * 0.8, 400 * 0.05), "…and the filler the heads sit in hangs from the top, flipped with them, its underside above the lowest heads");
  const leaves = hung.instanced.filter((r) => r.key.startsWith("leaf:"));
  assert(
    leaves.length > 0 &&
      leaves.every((r) => {
        const [lo, hi] = partSpan(r.parts[0]);
        return near(r.at.at.z, 400 - 400 * 0.45 - hi - lo);
      }),
    "the leaves droop at 0.55 h from the top, moved by their own span",
  );
  const hungChained = hungFlowersBody(ctxOf(600, 400, { flowers: spec, chainMm: 2000 }));
  const cable = hungChained.parts.filter((p) => p.shape === "cylinder" && p.at.z === 400);
  assert(cable.length === 1 && near(top(cable[0]), 2400), "a hung arrangement's cable reaches the ceiling");
  const cascade = hungFlowersBody(ctxOf(600, 400, { flowers: { ...spec, form: "cascade", seed: 3 } }));
  const cHeads = cascade.instanced.filter((r) => r.key.startsWith("flower:"));
  const fall = cHeads.filter((r) => r.at.at.x > 150).sort((a, b) => a.at.at.x - b.at.at.x);
  const massLevel = 400 - 400 * Math.sqrt(1 - (0.85 / 1.1) ** 2);
  assert(fall.length >= 3 && centreOf(fall[fall.length - 1]) < centreOf(fall[0]) && centreOf(fall[fall.length - 1]) < 400 * 0.2, "a hung cascade's fall trails DOWN to the underside at its tip (not up, as the plain flip would have it)");
  assert(fall.every((r) => centreOf(r) <= massLevel + 1e-6) && cHeads.every((r) => centreOf(r) >= -1e-9 && centreOf(r) <= 400), "…from the inverted rim's level, and every head's centre stays between the underside and the top");
  const ball = hungFlowersBody(ctxOf(500, 500, { chainMm: 1000 }));
  assert(ball.parts.some((p) => p.shape === "sphere" && p.r === 250 && p.at.z === 250) && ball.material.kind === "foliage", "no spec: a foliage ball at the top");
  assert(ball.parts.some((p) => p.shape === "cylinder" && p.at.z === 500 && near(top(p), 1500)), "…on its cable");

  // flipZ on every shape.
  const every: Part[] = [
    { shape: "box", w: 10, d: 10, h: 100, at: vec3(0, 0, 50), tiltDeg: 20 },
    { shape: "cylinder", rTop: 5, rBottom: 10, h: 100, at: vec3(0, 0, 0) },
    { shape: "sphere", r: 20, at: vec3(0, 0, 300) },
    { shape: "torus", r: 50, tube: 5, at: vec3(0, 0, 100) },
    { shape: "extrude", outline: { outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }, h: 40, at: vec3(0, 0, 10) },
    { shape: "lathe", profile: [{ r: 10, z: 0 }, { r: 20, z: 50 }, { r: 5, z: 80 }], at: vec3(0, 0, 100) },
    { shape: "plane", outline: { outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }, at: vec3(0, 0, 250) },
    { shape: "ribbon", path: [{ x: 0, y: 0 }, { x: 100, y: 0 }], h: 60, at: vec3(0, 0, 20) },
  ];
  const flipped = flipZ({ parts: every, material: GLASS, instanced: [], emitters: [{ at: vec3(1, 2, 30), radiusMm: 5, colour: "#fff", strength: 1 }] }, 400);
  every.forEach((p, i) => {
    const [lo, hi] = partSpan(p);
    const [flo, fhi] = partSpan(flipped.parts[i]);
    assert(near(flo, 400 - hi) && near(fhi, 400 - lo), `${p.shape}: spans [${lo}, ${hi}] → [${400 - hi}, ${400 - lo}] (got [${flo}, ${fhi}])`);
  });
  const fc = flipped.parts[1];
  assert(fc.shape === "cylinder" && fc.rTop === 10 && fc.rBottom === 5, "a tapered cylinder swaps its radii");
  const fb = flipped.parts[0];
  assert(fb.shape === "box" && fb.tiltDeg === -20, "a lean tips the other way");
  const fl = flipped.parts[5];
  assert(fl.shape === "lathe" && fl.profile[0].r === 5 && fl.profile[0].z === 0 && fl.profile[2].r === 10 && fl.profile[2].z === 80, "a lathe's profile is read the other way up, still bottom to top");
  const fp = flipped.parts[6];
  assert(fp.shape === "plane" && fp.side === "down", "a plane that faced up faces down");
  assert(near(flipped.emitters[0].at.z, 370), "an emitter flips by its point");

  // A curtain along a 4 m wall under a 4 m ceiling.
  const curtain = curtainBody([{ x: 0, y: 0 }, { x: 4000, y: 0 }], 4000, "#a98db8", { type: "item" });
  const ribbons = curtain.parts.filter((p) => p.shape === "ribbon");
  assert(ribbons.length === 1 && ribbons[0].shape === "ribbon" && ribbons[0].h === 4000 && ribbons[0].pleatMm === PLEAT_MM && ribbons[0].amplitudeMm === 62 && ribbons[0].path.length === 2, "one pleated ribbon 4000 high, a pleat every 150, 62 either side");
  assert(curtain.material.kind === "fabric" && curtain.material.colour === "#a98db8", "in the row's cloth");
  const rod = curtain.parts.find((p) => p.shape === "cylinder");
  assert(!!rod && rod.shape === "cylinder" && rod.at.z === 4030 && rod.h === 4000 && rod.rTop === ROD_R_MM && rod.tiltDeg === 90 && near(rod.rotDeg ?? 0, -90) && rod.at.x === 0 && rod.at.y === 0, "a rod along the chord at 4030: tilted flat from the path's start, turned to lie along +x");
  const slanted = curtainBody([{ x: 0, y: 0 }, { x: 0, y: 3000 }], 2800, "#a98db8", { type: "item" }).parts.find((p) => p.shape === "cylinder");
  assert(!!slanted && slanted.shape === "cylinder" && near(slanted.rotDeg ?? 0, 0) && slanted.h === 3000, "a wall down the plan needs no turn: a tilted cylinder already lies along +y");
  assert(curtainBody([{ x: 0, y: 0 }], 3000, "#a98db8", { type: "item" }).parts.length === 0, "a path of one point is no curtain");

  assert(ceilingUndersideMm(4000, 600) === 2800, "under a 4 m ceiling a chandelier's underside is at 2.8 m");
  assert(ceilingUndersideMm(null, 600) === 3000, "under open sky it hangs at 3 m");
  assert(ceilingUndersideMm(800, 600) === 0, "…and never below the floor");
  console.log("scene overhead ok");
}
