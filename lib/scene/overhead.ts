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
// Pure: no React, no three. `npm run check:overhead` runs the self-check.
import type { Point } from "@/lib/studio/hall";
import type { CurtainStyle, SymbolKind } from "@/lib/catalog/symbols";
import { FORMS, type FlowerDrawSpec, isPale } from "@/lib/catalog/flower-draw";
import { CASCADE, EMPIRE, FITTING_COLOUR, PENDANT_GLASS, SPIRAL, type CrystalBead, chandelierOf, chandelierTiers, crystalBeads, empireCrownR, equalGlobes, glassFinishOf, globeRise, ringGlobe, ringPoint } from "@/lib/catalog/chandelier";
import type { PendantFitting } from "@/lib/catalog/types";
import { revolveProfileMm } from "@/lib/element/revolve";
import { darkerShade } from "@/lib/catalog/border";
import { packCircles } from "@/components/item-symbol";
import type { InstanceRequest, ItemBuild } from "./collect";
import { type ItemContext, fallbackBody } from "./item-context";
import { flowerBuild } from "./flowers";
import { shapedFlowersBody } from "./flower-cover";
import { ENVELOPE, clothMaterial, crystalMaterial, emissiveMaterial, foliageMaterial, materialRefOf, metalMaterial } from "./materials";
import type { Material } from "@/lib/catalog/material";
import { type MaterialRef, type NodeTag, type Part, type Vec3, vec3 } from "./types";
import { frondSpan } from "./organic";
import { runDrop, runHalfWidth, runLights, runTop, type ClothRun } from "@/lib/studio/ceiling-cloth";

// ── the constants ───────────────────────────────────────────────────────────────────────────────

/** A ceiling item with no hang height of its own hangs this far under the ceiling (a chandelier
 *  clears a standing guest), or at this height when nothing above it is roofed. Spec §3.5. */
export const HANG_UNDER_CEILING_MM = 1200;
export const HANG_OPEN_SKY_MM = 3000;

/** A chandelier whose row has no height (the plan draws it flat): a plain one's. */
export const CHANDELIER_H_MM = 600;
/** An arm's section (items.ts ARM_MM — the same thin bar a candelabrum's arms are). */
const ARM_MM = 10;
export const CHAIN_R_MM = 8;
export const CABLE_R_MM = 4;
/** Past this drop one chain would read as a pole: three cables at 120° instead. */
const CABLES_FROM_MM = 3000;
/** types.ts EmitterNode: "a chandelier bulb ~0.7". */
export const BULB = 0.7;
/** DrapePleats (item-symbol.tsx:1276, :1279): a pleat every 150 mm, amplitude 0.28 of the band —
 *  the band the canvas draws 220 mm thick (canvas-stage.tsx:2775 DRAPE_MM). */
export const PLEAT_MM = 150;
const DRAPE_BAND_MM = 220;
const PLEAT_AMPLITUDE_MM = Math.round(DRAPE_BAND_MM * 0.28); // 62
export const ROD_R_MM = 15;
const ROD_ABOVE_MM = 30;
/** A free-standing rod's post: a 5cm square section. */
export const POST_MM = 50;
/** Each curtain style's pleat in the room — the plan's (components/curtain-cloth.tsx STYLE_DRAW)
 *  lifted: its pitch, and how far the cloth swings off its line (the band's share × 220). Waves is
 *  the one every curtain always had. */
export const CURTAIN_PLEATS: Record<CurtainStyle, { pleatMm: number; amplitudeMm: number }> = {
  waves: { pleatMm: PLEAT_MM, amplitudeMm: PLEAT_AMPLITUDE_MM },
  pinch: { pleatMm: 70, amplitudeMm: Math.round(DRAPE_BAND_MM * 0.2) },
  sheer: { pleatMm: 600, amplitudeMm: Math.round(DRAPE_BAND_MM * 0.06) },
  swag: { pleatMm: 700, amplitudeMm: Math.round(DRAPE_BAND_MM * 0.3) },
  ruffle: { pleatMm: 55, amplitudeMm: Math.round(DRAPE_BAND_MM * 0.14) },
};
/** What else a curtain's body is told: how its cloth is gathered, how far it drops from the rail
 *  (absent = to the floor), and where a free-standing rod's posts stand. */
export interface CurtainOpts {
  style?: CurtainStyle;
  dropMm?: number;
  posts?: Point[];
  /** A free-standing rod's own thickness and its posts' (lib/studio/rail.ts rodThickMm / rodPostMm).
   *  Absent = the 3 cm rod on 5 cm posts every curtain has had. */
  rodMm?: number;
  postMm?: number;
  /** A BARE ROD — the rod and its posts with no cloth on them (the built-in מוט וילון placed by
   *  itself), in `rodColour` when its row has a shade. */
  bare?: boolean;
  rodColour?: string;
}
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
const frameMaterial = (tone: string, material?: Material): MaterialRef => (material ? materialRefOf(material, tone) : pale(tone) ? { colour: "#d6d2dd", kind: "glass", opacity: 0.5 } : metalMaterial(tone));

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

/** The blush the floral hoop's flowers are, when the row's tone is its metal. */
const FLORAL_BLOOM = "#f1c2cf";
/** A chandelier's candle at its REAL size, whatever the plan draws (the plan's bulbs are fat enough
 *  to find at 1:100 — in the room they read as snowballs; seen headless, 2026-11-08): a sleeve 2–3 cm
 *  across in its drip pan, a flame bulb on top. */
export const CANDLE_SLEEVE = "#f4efe4";
/** A lamp at its real size: a bulb is a few centimetres across, never the plan's dot. */
export const LAMP_MAX_R_MM = 22;
/** Cut glass (types.ts `crystal`): beads, drops, rods, a finial. */
const CRYSTAL = crystalMaterial();
/** A floating ring's GLOBE: amber glass lit from within, in a cut deep enough to stay amber lit. */
export const GLOBE = "#d9a650";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A glass pendant's glass, by its shade (lib/catalog/chandelier.ts glassFinishOf): clear barely
 *  there; tinted half-clear in its colour (amber, smoke); mirrored as a silvered metal the lamp
 *  shows faintly through; frosted a milky gloss. */
function pendantGlass(name: string, swatch: string): MaterialRef {
  switch (glassFinishOf(name, swatch)) {
    case "clear":
      return { colour: "#eef3f6", kind: "glass", opacity: 0.2 };
    case "mirror":
      return { colour: swatch || "#a9afb6", kind: "metal", opacity: 0.86 };
    case "frosted":
      return { colour: swatch || "#f4f2ee", kind: "gloss", opacity: 0.9 };
    default:
      return { colour: swatch, kind: "glass", opacity: 0.4 };
  }
}

/** A glass's profile made smooth for the lathe: every span cut in `steps` along a Catmull-Rom curve
 *  through the points (a globe of seven points turned in 32 segments read as a faceted ball). */
function smoothProfile(pts: { r: number; z: number }[], steps = 5): { r: number; z: number }[] {
  if (pts.length < 3) return pts;
  const out: { r: number; z: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ r: Math.max(0.5, cr(p0.r, p1.r, p2.r, p3.r)), z: cr(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(pts[pts.length - 1]);
  // Never fold back on itself in height.
  return out.filter((q, i) => i === 0 || q.z > out[i - 1].z);
}
/** A pendant's cap, socket, cord and canopy in its metal (white is enamel, not metal). */
const fittingMaterial = (f: PendantFitting): MaterialRef => (f === "white" ? { colour: FITTING_COLOUR.white, kind: "gloss" } : metalMaterial(FITTING_COLOUR[f]));
/** An Edison bulb (an ST64 teardrop), bottom to top as fractions of its radius and height; its glass,
 *  its filament. */
const EDISON = [
  { r: 0.05, z: 0 },
  { r: 0.7, z: 0.1 },
  { r: 1, z: 0.35 },
  { r: 0.85, z: 0.6 },
  { r: 0.42, z: 0.85 },
  { r: 0.36, z: 1 },
];
const BULB_GLASS: MaterialRef = { colour: "#f6ead2", kind: "glass", opacity: 0.3 };
const FILAMENT: MaterialRef = { colour: "#ffb347", kind: "emissive" };
/** A pendant's cord: a few millimetres, never a chandelier's chain. */
const CORD_R_MM = 2.5;

/** A round bar from `a` to `c` (body frame): a cylinder standing on `a`, turned toward `c` on the
 *  plan and leaned to reach it (types.ts tiltDeg: the top toward its own +y after rotDeg — the
 *  sputnik's rods use the same turn). */
function rod(a: Vec3, c: Vec3, r: number, material: MaterialRef, segments = 6): Part {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const dz = c.z - a.z;
  const len = Math.max(1, Math.hypot(dx, dy, dz));
  const across = Math.hypot(dx, dy);
  const p: Part = { shape: "cylinder", rTop: r, rBottom: r, h: len, at: a, segments, material };
  if (across > 1e-6) {
    p.rotDeg = deg(Math.atan2(dy, dx)) - 90;
    p.tiltDeg = deg(Math.atan2(across, dz));
  } else if (dz < 0) p.tiltDeg = 180;
  return p;
}

/** A turned profile (bottom to top, body frame) standing at `at`. */
const lathe = (profile: { r: number; z: number }[], at: Vec3, material?: MaterialRef, segments = 16): Part => (material ? { shape: "lathe", profile, at, segments, material } : { shape: "lathe", profile, at, segments });

/** A bead of cut crystal where the layout hangs it (fractions of R and h): a round bead, or — the
 *  big ones, the PEARS under an arm, the balls of a spiral — a teardrop, its point up. */
function crystalPart(b: ItemBuild, bd: CrystalBead, R: number, h: number, round = false) {
  const r = Math.max(5, bd.r * R);
  const at = vec3(bd.x * R, bd.y * R, bd.z * h);
  if (!round && bd.r >= 0.028 * 1.4) {
    b.parts.push(sphere(r, at, CRYSTAL, 6));
    b.parts.push({ shape: "cylinder", rTop: r * 0.12, rBottom: r * 0.9, h: r * 1.6, at: vec3(at.x, at.y, at.z + r * 0.15), segments: 6, material: CRYSTAL });
  } else b.parts.push(sphere(r, at, CRYSTAL, 6));
}

/** Every strand's beads linked into one chain of crystal, bead to bead in hanging order: from the
 *  floor a strand of octagons touching reads as a line of light, never as a row of dots. */
function chains(b: ItemBuild, beads: readonly CrystalBead[], R: number, h: number) {
  const last = new Map<number, CrystalBead>();
  for (const bd of beads) {
    if (bd.strand === undefined) continue;
    const prev = last.get(bd.strand);
    last.set(bd.strand, bd);
    if (!prev) continue;
    b.parts.push(rod(vec3(prev.x * R, prev.y * R, prev.z * h), vec3(bd.x * R, bd.y * R, bd.z * h), Math.max(1.5, Math.min(prev.r, bd.r) * R * 0.32), CRYSTAL, 4));
  }
}

/** The column a chandelier's arms come out of, turned like a baluster stack: a bulb at the foot, a
 *  collar under every tier where its arms join, a vase between tiers, a neck up to the crown —
 *  `r` its narrowest radius, `tierZs` the tiers' heights (mm, ascending), from `z0` to `z1`. */
function columnProfile(r: number, z0: number, z1: number, tierZs: number[], h: number): { r: number; z: number }[] {
  const pts: { r: number; z: number }[] = [
    { r: r * 0.4, z: z0 },
    { r: r * 1.5, z: z0 + h * 0.035 },
    { r: r * 0.7, z: z0 + h * 0.07 },
  ];
  let last = z0 + h * 0.07;
  tierZs.forEach((zt, k) => {
    const mid = k === 0 ? (last + zt) / 2 : (tierZs[k - 1] + zt) / 2;
    if (mid - h * 0.02 > last) pts.push({ r: r * 1.3, z: mid });
    const ring = [
      { r: r * 0.75, z: zt - h * 0.045 },
      { r: r * 1.9, z: zt - h * 0.03 },
      { r: r * 1.9, z: zt - h * 0.012 },
      { r: r * 0.8, z: zt + h * 0.005 },
    ];
    for (const p of ring) if (p.z > pts[pts.length - 1].z + 1) pts.push(p);
    last = zt + h * 0.005;
  });
  if (z1 - h * 0.04 > last) pts.push({ r: r * 1.15, z: (last + z1) / 2 });
  pts.push({ r: r * 0.7, z: z1 });
  return pts.filter((p, i) => i === 0 || p.z > pts[i - 1].z);
}

/** A chandelier standing on its underside, in its STYLE (the plan's — lib/catalog/symbols.ts
 *  ChandelierStyle) and its build (MapAppearance.chandelier, and the base's body as its SILHOUETTE
 *  → lib/catalog/chandelier.ts: tiers of lights and the crystal that hangs from them — the same
 *  layout the plan draws, so a bead seen from above hangs here as a bead of cut crystal). Every
 *  piece is held by something: the column, a spoke, a cable, the crown — nothing floats.
 *    arms      — a turned column; every tier's arms curve down out of a collar and up to a candle in
 *                its drip pan, its flame lit; a garland of crystal round the arms' dip (the plan's
 *                dashed circle at 0.48 R), the crystal as the spec says (drops by default), a crystal
 *                finial under the column, the crown, the chain.
 *    crystal   — the same column; straight arms out to a ring at every tier (0.84 R), candles, strands.
 *    hoop      — rings of light (a metal hoop, an LED strip in it), cables from the crown to each.
 *    sputnik   — a sphere and rods to every side, up, level and down, a lamp on each.
 *    pendants  — glass globes of different sizes on cables from one canopy plate, a lamp in each.
 *    linear    — a bar with its lamps in a row under it, two cables; crystal under the bar if asked.
 *    floral    — a hoop wound with foliage, clusters of blooms on it, lights between them.
 *    drums     — stacked drum shades, the widest on top (CASCADE): lit drums of the row's cloth
 *                with metal rims, lamps inside, a rod down to the tail (the user's photographs).
 *    prisms    — a cascade of crystal rods: a frame ring on every band held by spokes off the rod,
 *                a faceted rod and its bead per rod, a crystal tail to a point under the lowest.
 *    empire    — baskets: crown, every ring held by spokes, strands of beads — the lowest sweeping in
 *                to a small ring, every upper ring's a curtain down to the ring under it.
 *    spiral    — a plate with its downlights; strands of beads from it, a ball at every end, the
 *                balls winding down in a helix.
 *    rings     — floating rings, each leaned its own way, an LED strip in it and an amber globe
 *                inside, hung by cables from the crown. */
function chandelierBody(ctx: ItemContext): ItemBuild {
  const R = Math.max(50, Math.min(ctx.widthMm, ctx.depthMm) / 2); // item-symbol.tsx:924
  const h = ctx.heightMm > 0 ? ctx.heightMm : CHANDELIER_H_MM;
  const built = chandelierOf(ctx.drawStyle, ctx.chandelier);
  const tiers = chandelierTiers(built, ctx.count);
  const frame = frameMaterial(ctx.tone, ctx.material);
  const b = make(frame);
  const bulbM = emissiveMaterial(ENVELOPE.bulb);
  const light = (p: Point, z: number, r: number) => {
    b.parts.push(sphere(r, vec3(p.x, p.y, z), bulbM, 8));
    b.emitters.push({ at: vec3(p.x, p.y, z), radiusMm: r * 2, colour: ENVELOPE.bulb, strength: BULB });
  };
  /** A lamp you do not see as a bulb — an LED in a hoop, a downlight in a plate: its glow only. */
  const glowAt = (p: Point, z: number, r: number) => b.emitters.push({ at: vec3(p.x, p.y, z), radiusMm: r * 2, colour: ENVELOPE.bulb, strength: BULB });
  const lampR = (pitch: number) => Math.min(LAMP_MAX_R_MM, pitch);
  const beads = () => {
    const all = crystalBeads(built, tiers);
    for (const bd of all) crystalPart(b, bd, R, h);
    chains(b, all, R, h);
  };
  /** The crown on top, from the body's highest joint up to h: a turned cup the chain rises from. */
  const crown = (r: number, from = h * 0.9) =>
    b.parts.push(lathe([{ r: r * 0.45, z: 0 }, { r: r, z: (h - from) * 0.45 }, { r: r * 0.9, z: (h - from) * 0.8 }, { r: r * 0.35, z: h - from }], vec3(0, 0, from), frame));
  /** A candle on an arm's end at `p`, its drip pan at `z`: sleeve, flame, its glow. */
  const candle = (p: Point, z: number) => {
    const cr = clamp(R * 0.02, 8, 14);
    const ch = clamp(h * 0.085, 40, 120);
    b.parts.push(cyl(cr * 2.6, Math.max(4, cr * 0.4), vec3(p.x, p.y, z), frame, 12));
    b.parts.push(cyl(cr, ch, vec3(p.x, p.y, z + cr * 0.4), { colour: CANDLE_SLEEVE, kind: "matte" }, 10));
    const fz = z + cr * 0.4 + ch + cr * 0.9;
    b.parts.push(sphere(cr * 0.9, vec3(p.x, p.y, fz), bulbM, 8));
    b.emitters.push({ at: vec3(p.x, p.y, fz), radiusMm: cr * 2, colour: ENVELOPE.bulb, strength: BULB });
  };
  /** Cables from the crown's rim down to points of a ring (body frame). */
  const cables = (to: Vec3[], fromR: number) => {
    for (const q of to) {
      const a = Math.atan2(q.y, q.x);
      b.parts.push(rod(vec3(q.x, q.y, q.z), vec3(Math.cos(a) * fromR, Math.sin(a) * fromR, h * 0.97), CABLE_R_MM * 0.5, frame, 4));
    }
  };
  /** Spokes from the column at `z` out to a ring of radius `r`. */
  const spokes = (r: number, z: number, from: number, n = 4, turn = 45) => {
    for (let i = 0; i < n; i++) {
      const p = polar(r, turn + (i * 360) / n);
      b.parts.push(rod(vec3(Math.cos(rad(turn + (i * 360) / n)) * from, Math.sin(rad(turn + (i * 360) / n)) * from, z), vec3(p.x, p.y, z), Math.max(3, R * 0.006), frame, 5));
    }
  };

  switch (built.style) {
    case "sputnik": {
      // A sphere at half height; rods out at the golden angle, each its own length (the plan's
      // :sputnik), a third pointing down, a third level, a third up; a lamp on every end. The rod is
      // a cylinder standing on the core, leaned (90° − its elevation) from vertical toward its own
      // +y, turned so that +y faces its bearing (types.ts: tiltDeg after rotDeg).
      const m = Math.max(12, Math.round(ctx.count) || 8);
      const core = h * 0.5;
      b.parts.push(sphere(R * 0.17, vec3(0, 0, core), frame, 12));
      for (let i = 0; i < m; i++) {
        const len = R * (0.6 + 0.36 * (((i * 7) % 5) / 4));
        const bearing = i * 137.508;
        const elev = ((i % 3) - 1) * 30;
        b.parts.push({ shape: "cylinder", rTop: ARM_MM / 2, rBottom: ARM_MM / 2, h: len, at: vec3(0, 0, core), rotDeg: bearing - 90, tiltDeg: 90 - elev, segments: 6, material: frame });
        light(polar(len * Math.cos(rad(elev)), bearing), core + len * Math.sin(rad(elev)), R * 0.05);
      }
      b.parts.push(cyl(CHAIN_R_MM, h - core, vec3(0, 0, core), frame, 8));
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
    case "pendants": {
      // Glass pendants — one globe or a group (lib/catalog/chandelier.ts): every globe where the plan
      // puts it (packed in sizes, or all one size), at its own drop, the lowest at the underside; its
      // glass in the shade's finish (amber, smoke, clear, chrome — or the next of the row's shades
      // per globe) and the base's shape; a cap and socket in the fitting's metal, an Edison bulb
      // round its lit filament, and its own cord up to the canopy — at the ceiling when there is one.
      const n = Math.max(1, Math.round(ctx.count) || 8);
      const fit = fittingMaterial(built.fitting);
      const shape = built.profile ?? PENDANT_GLASS.globe;
      const palette = built.glassMix ? ctx.chandelier?.palette : undefined;
      const shades = palette?.length ? palette : [{ name: ctx.resolved?.variant?.name ?? "", swatch: ctx.tone }];
      const globes = built.equal ? equalGlobes(n) : packCircles(n);
      const top = h + (ctx.chainMm && ctx.chainMm > 0 ? ctx.chainMm : 0);
      const canopyH = 25;
      b.parts.push(cyl(n === 1 ? clamp(R * 0.35, 40, 70) : Math.max(60, R * 0.3), canopyH, vec3(0, 0, top - canopyH), fit, 24));
      globes.forEach((g, i) => {
        const x = n === 1 ? 0 : (g.x * ctx.widthMm) / 2;
        const y = n === 1 ? 0 : (g.y * ctx.depthMm) / 2;
        const gr = Math.max(40, (n === 1 ? 0.98 : g.r * 0.94) * R);
        const capH = clamp(gr * 0.3, 30, 70);
        const capR = clamp(gr * 0.24, 16, 45);
        const gh = Math.max(gr, Math.min(gr * 2, h - capH));
        const zb = Math.max(0, h - gh - capH) * globeRise(i, n);
        const shade = shades[i % shades.length];
        b.parts.push(lathe(smoothProfile(revolveProfileMm(shape, gr, gh)), vec3(x, y, zb), pendantGlass(shade.name, shade.swatch), 40));
        const capZ = zb + gh - capH * 0.35;
        b.parts.push(cyl(capR, capH, vec3(x, y, capZ), fit, 16));
        // The socket under the cap and the Edison bulb hanging from it: a clear teardrop round its
        // glowing filament, inside the glass.
        const br = clamp(gr * 0.26, 16, 34);
        const sockH = clamp(br * 1.2, 22, 45);
        b.parts.push(cyl(Math.max(9, br * 0.45), sockH, vec3(x, y, capZ - sockH), fit, 12));
        const bulbTop = capZ - sockH;
        const bulbH = Math.max(br, Math.min(br * 2.6, (bulbTop - zb) * 0.9));
        b.parts.push(lathe(EDISON.map((q) => ({ r: q.r * br, z: q.z * bulbH })), vec3(x, y, bulbTop - bulbH), BULB_GLASS, 16));
        b.parts.push(cyl(2.5, bulbH * 0.45, vec3(x, y, bulbTop - bulbH * 0.72), FILAMENT, 6));
        b.emitters.push({ at: vec3(x, y, bulbTop - bulbH * 0.5), radiusMm: br * 1.5, colour: ENVELOPE.bulb, strength: BULB });
        // A short rod over the cap, as the photographs' pendants have, then the cord.
        const cordFrom = capZ + capH;
        const rod = Math.min(clamp(gr * 1.1, 60, 200), Math.max(0, top - canopyH - cordFrom));
        if (rod > 0) b.parts.push(cyl(clamp(capR * 0.28, 5, 9), rod, vec3(x, y, cordFrom), fit, 10));
        b.parts.push(cyl(CORD_R_MM, Math.max(1, top - canopyH - cordFrom - rod), vec3(x, y, cordFrom + rod), fit, 6));
      });
      return b;
    }
    case "linear": {
      // A bar along the long side at 0.7 h, its lamps hung under it in a row, cables near each end,
      // crystal drops under the bar between the lamps when asked.
      const L = Math.max(ctx.widthMm, ctx.depthMm);
      const D = Math.max(60, Math.min(ctx.widthMm, ctx.depthMm));
      const alongX = ctx.widthMm >= ctx.depthMm;
      const at = (s: number): Point => (alongX ? { x: s, y: 0 } : { x: 0, y: s });
      const barZ = h * 0.7;
      const barH = D * 0.14;
      b.parts.push(box(L * 0.94, barH, barH, vec3(0, 0, barZ), frame, alongX ? 0 : 90));
      const m = Math.max(2, Math.round(ctx.count) || 2);
      const r = Math.min(D * 0.34, (L * 0.9) / (m * 3.2)) * 0.6;
      const span = L * 0.9 - r * 2;
      const drop = D * 0.25;
      for (let i = 0; i < m; i++) {
        const p = at(-span / 2 + (i * span) / (m - 1));
        light(p, barZ - drop, r);
        b.parts.push(cyl(3, Math.max(1, drop - r), vec3(p.x, p.y, barZ - drop + r), frame, 6));
        if (built.crystals !== "none" && i < m - 1) {
          const q = at(-span / 2 + ((i + 0.5) * span) / (m - 1));
          b.parts.push(sphere(Math.max(6, R * 0.028), vec3(q.x, q.y, barZ - D * 0.1), CRYSTAL, 6), sphere(Math.max(6, R * 0.04), vec3(q.x, q.y, barZ - D * 0.2), CRYSTAL, 6));
        }
      }
      for (const s of [-1, 1]) {
        const p = at(s * L * 0.32);
        b.parts.push(cyl(CABLE_R_MM, Math.max(1, h - (barZ + barH)), vec3(p.x, p.y, barZ + barH), frame, 6));
      }
      b.parts.push(...chainParts(h, ctx.chainMm, L * 0.32, frame));
      return b;
    }
    case "floral": {
      // The plan's hoop at 0.8 R wound with greenery (eighteen clumps in and out of the line), five
      // clusters of blooms on it, a light between each pair, three cables up.
      const ringR = R * 0.8;
      const z = h * 0.5;
      b.parts.push(torus(ringR, Math.max(8, R * 0.03), vec3(0, 0, z), frame));
      const leaf = foliageMaterial(LEAF);
      for (let i = 0; i < 18; i++) {
        const p = polar(R * (i % 2 ? 0.86 : 0.74), i * 20);
        b.parts.push({ shape: "blob", r: Math.max(20, R * 0.09), at: vec3(p.x, p.y, z), seed: i + 1, squash: 0.55, material: leaf });
      }
      const petal: MaterialRef = { colour: FLORAL_BLOOM, kind: "petal" };
      for (let k = 0; k < 5; k++) {
        const a = -72 + k * 72;
        const c = polar(ringR, a);
        for (let j = 0; j < 5; j++) {
          const o = polar(R * 0.08 * (j ? 1 : 0), j * 72 + k * 13);
          b.parts.push({ shape: "bloom", form: j % 2 ? "rose" : "peony", r: Math.max(12, R * 0.065), at: vec3(c.x + o.x, c.y + o.y, z + R * (0.04 + (j % 2) * 0.03)), seed: k * 5 + j + 1, material: petal });
        }
        light(polar(ringR, a + 36), z + R * 0.05, Math.max(8, Math.min(LAMP_MAX_R_MM, R * 0.04)));
      }
      cables([-60, 60, 180].map((a) => ({ ...polar(ringR, a), z: z + Math.max(8, R * 0.03) })).map((p) => vec3(p.x, p.y, p.z)), R * 0.15);
      b.parts.push(cyl(R * 0.15, h * 0.03, vec3(0, 0, h * 0.97), frame));
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
    case "drums": {
      // Stacked drum shades, the widest on top (lib/catalog/chandelier.ts CASCADE): every band a lit
      // drum of the row's cloth — its own light (emissive, in a darker cut of the tone so it reads
      // as the tone lit, never white), a metal rim top and bottom, its lamps inside — the rod down
      // the middle from the tail to the canopy plate, the chain.
      const rim = metalMaterial(pale(ctx.tone) ? "#c9a24a" : ctx.tone);
      const cloth: MaterialRef = { colour: darkerShade(ctx.tone, 0.45), kind: "emissive" };
      for (const t of tiers) {
        const r = R * t.r;
        const z = h * t.z;
        const hh = h * (t.h ?? 0.2);
        b.parts.push(cyl(r, hh, vec3(0, 0, z), cloth, 40));
        const tube = Math.max(4, R * 0.012);
        b.parts.push(torus(r, tube, vec3(0, 0, z), rim), torus(r, tube, vec3(0, 0, z + hh), rim));
        const lr = Math.min(R * 0.05, ((Math.PI * r * CASCADE.lightR) / t.count) * 0.3);
        for (const a of t.angles) light(polar(r * CASCADE.lightR, a), z + hh * 0.5, lr);
      }
      const last = tiers[tiers.length - 1];
      const rodFrom = tiers.length > 1 ? 0 : h * (last.z + (last.h ?? 0));
      b.parts.push(cyl(Math.max(6, R * 0.04), Math.max(1, h * 0.97 - rodFrom), vec3(0, 0, rodFrom), rim, 8));
      b.parts.push(cyl(R * 0.15, h * 0.03, vec3(0, 0, h * 0.97), rim));
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, rim));
      return b;
    }
    case "prisms": {
      // A cascade of crystal rods (CASCADE): a frame ring at the top of every band held by spokes off
      // the rod, every rod the plan's dot as a faceted bar of cut crystal the band tall with a bead
      // at its foot, the lamps inside each band, the rod down the middle — through every band to a
      // crystal tail under the lowest, or, a single drum of crystal, only down to its ring — the
      // canopy, the chain.
      const rodR = Math.max(6, R * 0.03);
      const tube = clamp(R * 0.016, 5, 16);
      for (const t of tiers) {
        const r = R * t.r;
        const z = h * t.z;
        const hh = h * (t.h ?? 0.2);
        b.parts.push(torus(r, tube, vec3(0, 0, z + hh), frame));
        spokes(r, z + hh + tube, rodR, 4);
        const lr = lampR(Math.min(R * 0.05, ((Math.PI * r * CASCADE.lightR) / t.count) * 0.3));
        for (const a of t.angles) light(polar(r * CASCADE.lightR, a), z + hh * 0.5, lr);
      }
      for (const bd of crystalBeads(built, tiers)) {
        const w = Math.max(5, bd.r * R * 0.9);
        const len = Math.max(1, (bd.h ?? 0) * h);
        b.parts.push({ shape: "cylinder", rTop: w, rBottom: w, h: len, at: vec3(bd.x * R, bd.y * R, bd.z * h), segments: 6, material: CRYSTAL });
        b.parts.push(sphere(w * 1.35, vec3(bd.x * R, bd.y * R, bd.z * h), CRYSTAL, 6));
      }
      const lowest = tiers[0];
      if (tiers.length > 1) {
        // The tail: beads down the middle from the lowest band to a drop at the point.
        const from = h * lowest.z;
        const tip = Math.max(h * 0.03, from - h * 0.12);
        b.parts.push(cyl(rodR, h * 0.97 - from, vec3(0, 0, from), frame, 8));
        for (let z = from - h * 0.03; z > tip; z -= Math.max(20, h * 0.03)) b.parts.push(sphere(Math.max(6, R * 0.03), vec3(0, 0, z), CRYSTAL, 6));
        crystalPart(b, { x: 0, y: 0, z: tip / h, r: 0.06 }, R, h);
      } else {
        const top = h * (lowest.z + (lowest.h ?? 0));
        b.parts.push(cyl(rodR, Math.max(1, h * 0.97 - top), vec3(0, 0, top), frame, 8));
      }
      b.parts.push(cyl(R * 0.15, h * 0.03, vec3(0, 0, h * 0.97), frame));
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
    case "empire": {
      // Crystal baskets (EMPIRE): the crown ring up top, every ring held by spokes off the rod, the
      // small ring the lowest bag sweeps in to; every bead where the layout hangs it — the bag, the
      // curtains between rings, the tent to the crown, the fringes, the drop cluster; the lamps in
      // the bag and inside every ring over it; a rod from the finial to the crown; the chain.
      const rodR = Math.max(5, R * 0.025);
      const crownR = empireCrownR(tiers);
      b.parts.push(torus(R * crownR, Math.max(5, R * 0.015), vec3(0, 0, h * EMPIRE.crownZ), frame));
      tiers.forEach((t) => {
        b.parts.push(torus(R * t.r, Math.max(6, R * 0.02), vec3(0, 0, h * t.z), frame));
        spokes(R * t.r, h * t.z, rodR, 4);
      });
      b.parts.push(torus(R * EMPIRE.bottomR, Math.max(4, R * 0.012), vec3(0, 0, h * EMPIRE.bottomZ), frame));
      spokes(R * EMPIRE.bottomR, h * EMPIRE.bottomZ, rodR, 3, 90);
      tiers.forEach((t, k) => {
        const below = k === 0 ? EMPIRE.bottomZ : tiers[k - 1].z;
        const lz = k === 0 && tiers.length === 1 ? EMPIRE.lightZ : (below + t.z) / 2;
        const lightR = EMPIRE.lightR * t.r;
        const lr = lampR(Math.min(R * 0.06, ((Math.PI * R * lightR) / t.count) * 0.3));
        for (const a of t.angles) light(polar(R * lightR, a), h * lz, lr);
      });
      beads();
      const finial = Math.max(10, R * 0.06);
      b.parts.push(sphere(finial, vec3(0, 0, finial), CRYSTAL, 10));
      b.parts.push(cyl(rodR, Math.max(1, h * EMPIRE.crownZ - finial * 2), vec3(0, 0, finial * 2), frame, 8));
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
    case "spiral": {
      // A plate the size of the piece at the top, its downlights; a strand from it to every ball —
      // a thread with its beads, the ball at its end where the helix passes.
      const plate = tiers[0];
      b.parts.push(cyl(R * 0.98, h * (1 - SPIRAL.plateZ), vec3(0, 0, h * SPIRAL.plateZ), frame, 40));
      for (const a of plate.angles) {
        const p = polar(R * plate.r, a);
        b.parts.push(cyl(R * 0.045, 4, vec3(p.x, p.y, h * SPIRAL.plateZ - 4), bulbM, 10));
        glowAt(p, h * SPIRAL.plateZ - 10, R * 0.05);
      }
      const all = crystalBeads(built, tiers);
      const ends = all.filter((bd) => bd.r > 0.03);
      for (const e of ends) b.parts.push(cyl(1.2, Math.max(1, h * SPIRAL.plateZ - e.z * h), vec3(e.x * R, e.y * R, e.z * h), { colour: "#e9eef3", kind: "glass", opacity: 0.5 }, 3));
      for (const bd of all) crystalPart(b, bd, R, h, true);
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
    case "rings": {
      // Floating rings: each a leaned metal hoop with an LED strip inside it, hung from the crown by
      // two cables to its highest and lowest points; an amber globe in each, lit, on its own cable.
      const tube = clamp(R * 0.018, 5, 18);
      const led = emissiveMaterial(ENVELOPE.bulb);
      const aspect = R / h;
      const crownR = R * 0.3;
      tiers.forEach((t, k) => {
        const at = vec3(0, 0, h * t.z);
        const lean = { rotDeg: t.turnDeg ?? 0, tiltDeg: t.tiltDeg ?? 0 };
        b.parts.push({ shape: "torus", r: R * t.r, tube, at, segments: 64, ...lean, material: frame });
        b.parts.push({ shape: "torus", r: R * t.r - tube * 1.1, tube: tube * 0.45, at, segments: 64, ...lean, material: led });
        const tops = [90, 270].map((a) => ringPoint(t, (t.turnDeg ?? 0) + a, aspect));
        cables(tops.map((q) => vec3(q.x * R, q.y * R, q.z * h + tube)), crownR);
        for (const a of [0, 120, 240]) {
          const q = ringPoint(t, (t.turnDeg ?? 0) + a, aspect);
          glowAt({ x: q.x * R, y: q.y * R }, q.z * h, tube * 2);
        }
        const g = ringGlobe(t, k);
        const gr = g.r * R;
        const gc = vec3(g.x * R, g.y * R, g.z * h);
        // A lit globe: amber light through its glass — it is the piece's lamp, seen by day too.
        b.parts.push(sphere(gr, gc, { colour: GLOBE, kind: "emissive" }, 16));
        b.emitters.push({ at: gc, radiusMm: gr * 2, colour: ENVELOPE.bulb, strength: BULB });
        b.parts.push(cyl(CABLE_R_MM * 0.5, Math.max(1, h * 0.97 - (gc.z + gr)), vec3(gc.x, gc.y, gc.z + gr), frame, 4));
      });
      b.parts.push(cyl(crownR, h * 0.03, vec3(0, 0, h * 0.97), frame, 32));
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
    case "hoop": {
      // Rings of light: each tier's metal hoop with an LED strip along its inside, glowing where the
      // plan puts its lamps; crystal if asked; cables from the crown down to every hoop.
      const tube = clamp(R * 0.025, 6, 22);
      const led = emissiveMaterial(ENVELOPE.bulb);
      for (const t of tiers) {
        const ringR = R * t.r;
        const z = h * t.z;
        b.parts.push(torus(ringR, tube, vec3(0, 0, z), frame));
        b.parts.push(torus(ringR - tube * 1.1, tube * 0.45, vec3(0, 0, z), led));
        for (const a of t.angles) glowAt(polar(ringR, a), z + tube, tube * 2);
        cables([-60, 60, 180].map((a) => polar(ringR, a)).map((p) => vec3(p.x, p.y, z + tube * 2)), R * 0.12);
      }
      beads();
      b.parts.push(cyl(R * 0.12, h * 0.03, vec3(0, 0, h * 0.97), frame));
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
    default: {
      // Arms and crystal: a turned column from the finial to the crown; every tier's arms out of a
      // collar to a candle — an ARMS piece's curving down and up again in three runs, with a garland
      // of crystal draped round the lowest dip (the plan's dashed 0.48 R); a CRYSTAL piece's straight
      // out to a thin ring that carries its strands. The crystal as laid, the crown, the chain.
      const hubR = clamp(R * 0.05, 12, 50);
      const armR = clamp(R * 0.008, 4, 9);
      const arms = built.style === "arms";
      const tierZs = tiers.map((t) => h * t.z);
      const topZ = h * 0.9;
      const finial = clamp(R * 0.05, 10, 40);
      b.parts.push(lathe(columnProfile(hubR, finial * 1.6, topZ, tierZs, h), vec3(0, 0, 0), frame));
      crystalPart(b, { x: 0, y: 0, z: finial / h, r: finial / R }, R, h);
      for (const t of tiers) {
        const ringR = R * t.r;
        const z = h * t.z;
        for (const a of t.angles) {
          const d = polar(1, a);
          const at = (r: number, zz: number) => vec3(d.x * r, d.y * r, zz);
          if (arms) {
            const path = [at(hubR * 1.6, z - h * 0.02), at(ringR * 0.5, z - h * 0.075), at(ringR * 0.88, z - h * 0.06), at(ringR, z - h * 0.012)];
            for (let i = 1; i < path.length; i++) b.parts.push(rod(path[i - 1], path[i], armR, frame));
          } else {
            b.parts.push(rod(at(hubR * 1.6, z - h * 0.02), at(ringR, z - h * 0.012), armR, frame));
          }
          candle(polar(ringR, a), z - h * 0.012);
        }
        if (!arms) b.parts.push(torus(ringR * 1.05, clamp(R * 0.008, 3, 8), vec3(0, 0, z - h * 0.02), frame));
      }
      if (arms) {
        // The garland round the lowest dip: a necklace of beads at 0.48 R.
        const z = h * tiers[0].z - h * 0.075;
        const n = Math.max(16, Math.round((Math.PI * 2 * R * 0.48) / Math.max(20, R * 0.06)));
        for (let i = 0; i < n; i++) {
          const p = polar(R * 0.48, (i * 360) / n);
          b.parts.push(sphere(Math.max(5, R * 0.016), vec3(p.x, p.y, Math.max(0, z)), CRYSTAL, 6));
        }
      }
      beads();
      crown(clamp(R * 0.14, 25, 160), topZ);
      b.parts.push(...chainParts(h, ctx.chainMm, R * 0.2, frame));
      return b;
    }
  }
}

// ── a hung arrangement (./flowers.ts upside down) ───────────────────────────────────────────────

/** The z a part spans in its own frame, bottom to top. */
export function partSpan(p: Part): [number, number] {
  switch (p.shape) {
    case "box":
    case "cylinder":
    case "extrude":
    case "ribbon":
    case "drape":
      return [p.at.z, p.at.z + p.h];
    case "sphere":
    case "bloom":
      // A bloom is centred on its height and never taller than it is wide: r bounds it either way.
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
    case "panel":
      return [p.at.z, p.at.z + p.faceHeightMm];
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
    case "sheet": {
      let lo = Infinity;
      let hi = -Infinity;
      for (const row of p.rows)
        for (const q of row) {
          lo = Math.min(lo, q.z);
          hi = Math.max(hi, q.z);
        }
      return Number.isFinite(lo) ? [p.at.z + lo, p.at.z + hi] : [p.at.z, p.at.z];
    }
  }
}

/** One part turned upside down about z = H/2: what stood between z and z + h now stands between
 *  H − (z + h) and H − z. A tapered cylinder swaps its radii, a lathe's profile is read the other
 *  way up, a plane faces the other way, a lean tips the other way (mirrored about its base line —
 *  nothing hung is tilted today). A sphere and a torus flip by their centre. */
export function flipPart(p: Part, H: number): Part {
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
    case "panel":
      return { ...p, at: vec3(p.at.x, p.at.y, H - (p.at.z + p.faceHeightMm)) };
    case "sphere":
    case "torus":
    case "blob":
    case "bloom":
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
    case "sheet":
      return { ...p, at: vec3(p.at.x, p.at.y, H - p.at.z), rows: p.rows.map((row) => row.map((q) => vec3(q.x, q.y, -q.z))) };
  }
}

/** An instance keeps its PARTS — its geometry stays the one shared with every upright arrangement
 *  in the room (a head, a leaf's slab) — and only its `at.z` moves, by the parts' local extent
 *  [lo, hi]: the instance spanned [at.z + lo, at.z + hi] and now spans [H − at.z − hi, H − at.z −
 *  lo], so at.z' = H − at.z − hi − lo. A head is built about its centre, so its centre lands at
 *  H − centre. A BLOOM also turns over — it leans 180° − its lean, so a head that looked up and out
 *  of the dome looks down and out of the hung one — about its own middle, where it stands. */
function flipInstance(r: InstanceRequest, H: number): InstanceRequest {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of r.parts) {
    const [a, b] = partSpan(p);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  if (!r.parts.length) lo = hi = 0;
  const at = { ...r.at, at: vec3(r.at.at.x, r.at.at.y, H - r.at.at.z - hi - lo) };
  if (r.parts[0]?.shape === "bloom") at.tiltDeg = 180 - (r.at.tiltDeg ?? 0);
  return { ...r, at };
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
    // A head is a ball of florets or a bloom (flowers.ts headPart), built about its own centre.
    if (!r.key.startsWith("flower:") || !(p?.shape === "sphere" || p?.shape === "blob" || p?.shape === "bloom")) continue;
    const x = r.at.at.x;
    if (x < fallFrom - R * 0.06) continue;
    const t = Math.max(0, Math.min(1, (x - fallFrom) / (R * 0.72)));
    const centre = Math.max(0, L * (1 - t));
    r.at = { ...r.at, at: vec3(x, r.at.at.y, centre - p.at.z) };
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
  // Flowers that follow their shape (a hoop, a flower ceiling, a cloud of any outline): built
  // upright and turned over, so the cap of every shape looks DOWN at the room.
  const shaped = ctx.flowers.form === "shape";
  const b = flipZ(shaped ? shapedFlowersBody(ctx, tag) : flowerBuild(ctx.flowers, H, tag), H);
  if (ctx.flowers.form === "cascade") hangFall(b, ctx.flowers, H);
  if (!shaped) b.parts.push(cyl(r, BASE_DISC_MM, vec3(0, 0, H - BASE_DISC_MM), b.material));
  if (ctx.flowers.trailMm) hangStrands(b, ctx.flowers.trailMm, H, tag);
  b.parts.push(...chainParts(H, ctx.chainMm, r * 0.6, cable));
  return b;
}

/** A strand is cut to one of this many lengths (one instanced geometry each); a bead every this far
 *  down it; every this-many-th low head lets one fall. */
const STRAND_LENGTHS = 5;
const STRAND_BEAD_MM = 46;
const STRAND_EVERY = 2;
const STRAND_MAX = 420;

/** STRANDS under a hung piece (FlowerDrawSpec.trailMm — wisteria under a flower ceiling): from the
 *  heads on its underside, a thread of small florets each, the longest `trailMm`, in the head's own
 *  colour a little paler toward the tip. Instanced per colour and length. */
function hangStrands(build: ItemBuild, trailMm: number, H: number, tag: NodeTag): void {
  const low = build.instanced.filter((r) => r.key.startsWith("flower:") && r.parts[0]?.shape === "bloom" && r.at.at.z < H * 0.55);
  const every = Math.max(STRAND_EVERY, Math.ceil(low.length / STRAND_MAX));
  low.forEach((r, i) => {
    if (i % every) return;
    const colour = r.material?.colour ?? "#d9c7e8";
    // Seeded by where it hangs: lengths wander, the long ones the fewest.
    const u = Math.abs(Math.sin(r.at.at.x * 12.9898 + r.at.at.y * 78.233) * 43758.5453) % 1;
    const step = 1 + Math.floor(u * u * STRAND_LENGTHS);
    const len = Math.max(120, (trailMm * step) / STRAND_LENGTHS);
    const beads = Math.max(3, Math.round(len / STRAND_BEAD_MM));
    const parts: Part[] = [{ shape: "cylinder", rTop: 1.5, rBottom: 1.5, h: len, at: vec3(0, 0, -len), segments: 5, material: foliageMaterial("#7d9a6e") }];
    for (let k = 0; k < beads; k++) {
      const t = (k + 0.6) / beads;
      // Fuller in the middle, a point at the tip — a raceme.
      const rr = 9 + 13 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.45 * t);
      parts.push({ shape: "blob", r: rr, at: vec3(Math.sin(k * 2.4) * rr * 0.5, Math.cos(k * 2.4) * rr * 0.5, -len * t), seed: k + 1, lumps: 6, rough: 0.2, detail: 1 });
    }
    build.instanced.push({ key: `strand:${colour}:${step}:${Math.round(trailMm)}`, parts, material: { colour, kind: "petal" }, tag, at: { at: vec3(r.at.at.x, r.at.at.y, r.at.at.z), rotationDeg: Math.round(u * 360) }, castShadow: false });
  });
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
export function curtainBody(path: Point[], topMm: number, colour: string, tag: NodeTag, opts: CurtainOpts = {}): ItemBuild {
  void tag;
  const h = Math.max(10, topMm);
  const b = make(clothMaterial(colour));
  if (path.length < 2) return b;
  // The style's pleat (the plan's own STYLE_DRAW, lifted — components/curtain-cloth.tsx), and the
  // drop: the cloth hangs from the rail down `dropMm`, the floor when absent or longer.
  const pleat = CURTAIN_PLEATS[opts.style ?? "waves"] ?? CURTAIN_PLEATS.waves;
  const drop = opts.dropMm && opts.dropMm > 0 && opts.dropMm < h ? opts.dropMm : h;
  if (!opts.bare) b.parts.push({ shape: "ribbon", path, h: drop, at: vec3(0, 0, h - drop), pleatMm: pleat.pleatMm, amplitudeMm: pleat.amplitudeMm });
  // The rod's own section and its posts' (a typed thickness — lib/studio/rail.ts), in its shade when
  // it is a bare rod with one.
  const rodR = opts.rodMm && opts.rodMm > 0 ? opts.rodMm / 2 : ROD_R_MM;
  const post = opts.postMm && opts.postMm > 0 ? opts.postMm : POST_MM;
  const metal = metalMaterial(opts.rodColour ?? ROD);
  // A free-standing rod's posts (spec 2026-11-07 §6.2): a square post from the floor to the rod at
  // every end and bend but a cantilevered tip.
  for (const q of opts.posts ?? []) b.parts.push({ shape: "box", w: post, d: post, h: h + ROD_ABOVE_MM + rodR, at: vec3(q.x, q.y, 0), material: metal });
  // The rail, one length per stretch of the path — a single rod on a straight wall, bent round the
  // bow of a curved one (a straight rod from end to end would cut through the room).
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const z = path[i];
    const len = Math.hypot(z.x - a.x, z.y - a.y);
    if (len < 1) continue;
    // A cylinder grows up from its base; tilted 90° about its own x axis AFTER rotDeg (types.ts
    // Part) it lies along its turned +y — rotDeg = bearing − 90 lays that along the stretch.
    const bearing = deg(Math.atan2(z.y - a.y, z.x - a.x));
    b.parts.push({ shape: "cylinder", rTop: rodR, rBottom: rodR, h: len, at: vec3(a.x, a.y, h + ROD_ABOVE_MM), rotDeg: bearing - 90, tiltDeg: 90, segments: 10, material: metal });
  }
  return b;
}

// ── cloth in the air: a sail and a ceiling drape (spec 2026-11-07 §6.3/§6.4) ──────────────────────

/** The grid a sail's sheet and a swag are stitched from: this many cells a side of a sail, this many
 *  a scallop of a swag, this many across it. */
export const SAIL_GRID = 12;
const SWAG_PER_WAVE = 12;
export const SWAG_ACROSS = 4;
/** ONE swag from point to point (2026-11-13) is a long curve seen whole and from below: a finer grid,
 *  a belly across its width as cloth hangs between its two edges, and soft folds along it. */
export const SWAG_ONE_ALONG = 36;
export const SWAG_ONE_ACROSS = 16;
/** How far the cloth's middle bellies under its edges, as a share of its half-width there. */
const SWAG_BELLY = 0.22;
/** Its lengthwise folds: how many across the cloth, and how deep the deepest hangs, mm. */
const SWAG_FOLDS = 3;
const SWAG_FOLD_MM = 26;
/** A sail's post of its own: a pole 4 cm across, from the ground to its tie. */
const SAIL_POST_R_MM = 40;

/** A sail's sheet as a grid in room mm (Part "sheet"): its corners at their tie heights, straight and
 *  taut along every edge, and its middle `sagMm` below the ties' mean — a quad by its two edge
 *  fractions (the bump 16·u(1−u)·v(1−v), 1 at the middle), a triangle from its first edge to its apex
 *  (27·b₁b₂b₃ over its barycentric weights, 1 at the centroid). */
export function sailGrid(polygon: Point[], heights: number[], sagMm: number, n = SAIL_GRID): Vec3[][] {
  const h = (i: number) => heights[i] ?? heights[0] ?? 0;
  const rows: Vec3[][] = [];
  if (polygon.length === 3) {
    const [A, B, C] = polygon;
    for (let j = 0; j <= n; j++) {
      const v = j / n;
      const row: Vec3[] = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const b1 = (1 - v) * (1 - u);
        const b2 = (1 - v) * u;
        const b3 = v;
        row.push(vec3(b1 * A.x + b2 * B.x + b3 * C.x, b1 * A.y + b2 * B.y + b3 * C.y, b1 * h(0) + b2 * h(1) + b3 * h(2) - sagMm * 27 * b1 * b2 * b3));
      }
      rows.push(row);
    }
    return rows;
  }
  if (polygon.length !== 4) return rows;
  const [A, B, C, D] = polygon;
  for (let j = 0; j <= n; j++) {
    const v = j / n;
    const row: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const wA = (1 - u) * (1 - v);
      const wB = u * (1 - v);
      const wC = u * v;
      const wD = (1 - u) * v;
      row.push(vec3(wA * A.x + wB * B.x + wC * C.x + wD * D.x, wA * A.y + wB * B.y + wC * C.y + wD * D.y, wA * h(0) + wB * h(1) + wC * h(2) + wD * h(3) - sagMm * 16 * u * (1 - u) * v * (1 - v)));
    }
    rows.push(row);
  }
  return rows;
}

/** A SAIL (lib/studio/ceiling-cloth.ts, rail.ts RailSheet): its sagging sheet, two-sided, in its
 *  cloth, and a pole under every tie that stands on a post of its own. Built in the ROOM frame, as a
 *  curtain is: the caller places it at `transform(vec3(0, 0, 0), 0)`. */
export function sailBody(sheet: { polygon: Point[]; heights: number[]; sagMm: number; posts: Point[] }, colour: string): ItemBuild {
  const b = make(clothMaterial(colour));
  if (sheet.polygon.length < 3) return b;
  b.parts.push({ shape: "sheet", rows: sailGrid(sheet.polygon, sheet.heights, sheet.sagMm), at: vec3(0, 0, 0) });
  for (const q of sheet.posts) {
    const i = sheet.polygon.findIndex((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1);
    const h = i >= 0 ? (sheet.heights[i] ?? 0) : 0;
    if (h > 0) b.parts.push(cyl(SAIL_POST_R_MM, h + 60, vec3(q.x, q.y, 0), metalMaterial(ROD), 10));
  }
  return b;
}

/** How far ONE swag's cloth hangs under its own curve, `s` along it and `t` (−1…1) across it: the
 *  belly between its two edges and its soft lengthwise folds, both fading to nothing at the two points
 *  it is tied to. Nothing for a scalloped run. The grid and the lights woven in both read it. */
function swagUnder(run: ClothRun, s: number, t: number): number {
  if (run.waves !== 1) return 0;
  const open = Math.sin(Math.PI * s);
  const belly = SWAG_BELLY * runHalfWidth(run, s) * (1 - t * t) * open;
  const folds = Math.abs(t) < 1 ? (SWAG_FOLD_MM * open * (1 + Math.cos(Math.PI * SWAG_FOLDS * t))) / 2 : 0;
  return belly + folds;
}

/** One swag as a grid (Part "sheet"): along the run, its height less its drop in every scallop
 *  (ceiling-cloth.ts runDrop); across it, as wide as the plan draws it there (runHalfWidth — gathered
 *  to GATHER of its width at every gather), its middle a little lower than its edges, as cloth hangs. */
export function swagGrid(run: ClothRun): Vec3[][] {
  const u = { x: (run.b.x - run.a.x) / (run.lengthMm || 1), y: (run.b.y - run.a.y) / (run.lengthMm || 1) };
  const nrm = { x: -u.y, y: u.x };
  const one = run.waves === 1;
  const cols = one ? SWAG_ONE_ALONG : Math.max(8, run.waves * SWAG_PER_WAVE);
  const across = one ? SWAG_ONE_ACROSS : SWAG_ACROSS;
  const rows: Vec3[][] = [];
  for (let k = 0; k <= across; k++) {
    const t = (k / across) * 2 - 1;
    const row: Vec3[] = [];
    for (let i = 0; i <= cols; i++) {
      const s = i / cols;
      const drop = runDrop(run, s);
      const half = runHalfWidth(run, s);
      if (one) {
        // Its two edges ride the swag's own curve; between them the cloth bellies, and hangs in soft
        // folds that fade to nothing at the two points it is tied to (and at its edges).
        row.push(vec3(run.a.x + (run.b.x - run.a.x) * s + nrm.x * t * half, run.a.y + (run.b.y - run.a.y) * s + nrm.y * t * half, runTop(run, s) - drop - swagUnder(run, s, t)));
        continue;
      }
      row.push(vec3(run.a.x + (run.b.x - run.a.x) * s + nrm.x * t * half, run.a.y + (run.b.y - run.a.y) * s + nrm.y * t * half, runTop(run, s) - drop - 0.15 * drop * (1 - t * t)));
    }
    rows.push(row);
  }
  return rows;
}

/** A fairy light's bulb on a lit run: a warm point, and the halo the room gives every emitter — too
 *  faint for the light pool, which lamps and candles fill first. */
export const FAIRY_R_MM = 9;
const FAIRY = "#fff1cf";
const FAIRY_STRENGTH = 0.12;

/** A CEILING DRAPE — a run, or a canopy's runs: one swag each, two-sided, in its cloth; a run with
 *  lights woven in (ClothRun.lights — ceiling-cloth.ts runLights lays them) carries a warm point at
 *  every one, a hair under the cloth where it hangs there. Room frame. */
export function ceilingDrapeBody(runs: readonly ClothRun[], colour: string): ItemBuild {
  const b = make(clothMaterial(colour));
  const bulb = emissiveMaterial(FAIRY);
  for (const run of runs) {
    b.parts.push({ shape: "sheet", rows: swagGrid(run), at: vec3(0, 0, 0) });
    for (const q of runLights(run)) {
      // How far along the run this light is — its line's height there (a swag hung end to end at two
      // heights, ceiling-cloth.ts runTop).
      const s = run.lengthMm > 0 ? ((q.x - run.a.x) * (run.b.x - run.a.x) + (q.y - run.a.y) * (run.b.y - run.a.y)) / (run.lengthMm * run.lengthMm) : 0;
      // …and how far across the cloth, for the belly it hangs in there.
      const off = run.lengthMm > 0 ? ((q.x - run.a.x) * -(run.b.y - run.a.y) + (q.y - run.a.y) * (run.b.x - run.a.x)) / run.lengthMm : 0;
      const half = runHalfWidth(run, s);
      const at = vec3(q.x, q.y, runTop(run, s) - q.dropMm - swagUnder(run, s, half > 0 ? off / half : 0) - FAIRY_R_MM * 2);
      b.parts.push(sphere(FAIRY_R_MM, at, bulb, 6));
      b.emitters.push({ at, radiusMm: FAIRY_R_MM * 5, colour: FAIRY, strength: FAIRY_STRENGTH });
    }
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
