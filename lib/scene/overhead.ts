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
import type { CurtainStyle, SymbolKind } from "@/lib/catalog/symbols";
import { FORMS, type FlowerDrawSpec, isPale } from "@/lib/catalog/flower-draw";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { CASCADE, CHANDELIER_PROFILES, EMPIRE, FITTING_COLOUR, PENDANT_GLASS, SPIRAL, type CrystalBead, chandelierOf, chandelierTiers, crystalBeads, empireCrownR, equalGlobes, glassFinishOf, globeRise, profileAt, ringGlobe, ringPoint } from "@/lib/catalog/chandelier";
import type { PendantFitting } from "@/lib/catalog/types";
import { revolveProfileMm } from "@/lib/element/revolve";
import { darkerShade } from "@/lib/catalog/border";
import { packCircles } from "@/components/item-symbol";
import { isMain } from "../self-check";
import type { InstanceRequest, ItemBuild } from "./collect";
import { type ItemContext, fallbackBody } from "./item-context";
import { flowerBuild } from "./flowers";
import { shapedFlowersBody } from "./flower-cover";
import { applyTransform } from "./frame";
import { ENVELOPE, clothMaterial, crystalMaterial, emissiveMaterial, foliageMaterial, glassMaterial, metalMaterial } from "./materials";
import { type MaterialRef, type NodeTag, type Part, type Vec3, vec3 } from "./types";
import { frondSpan } from "./organic";
import { runDrop, runHalfWidth, runLights, runTop, type ClothRun } from "@/lib/studio/ceiling-cloth";

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
/** DrapePleats (item-symbol.tsx:1276, :1279): a pleat every 150 mm, amplitude 0.28 of the band —
 *  the band the canvas draws 220 mm thick (canvas-stage.tsx:2775 DRAPE_MM). */
const PLEAT_MM = 150;
const DRAPE_BAND_MM = 220;
const PLEAT_AMPLITUDE_MM = Math.round(DRAPE_BAND_MM * 0.28); // 62
const ROD_R_MM = 15;
const ROD_ABOVE_MM = 30;
/** A free-standing rod's post: a 5cm square section. */
const POST_MM = 50;
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

/** The blush the floral hoop's flowers are, when the row's tone is its metal. */
const FLORAL_BLOOM = "#f1c2cf";
/** A chandelier's candle at its REAL size, whatever the plan draws (the plan's bulbs are fat enough
 *  to find at 1:100 — in the room they read as snowballs; seen headless, 2026-11-08): a sleeve 2–3 cm
 *  across in its drip pan, a flame bulb on top. */
const CANDLE_SLEEVE = "#f4efe4";
/** A lamp at its real size: a bulb is a few centimetres across, never the plan's dot. */
const LAMP_MAX_R_MM = 22;
/** Cut glass (types.ts `crystal`): beads, drops, rods, a finial. */
const CRYSTAL = crystalMaterial();
/** A floating ring's GLOBE: amber glass lit from within, in a cut deep enough to stay amber lit. */
const GLOBE = "#d9a650";

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
  const frame = frameMaterial(ctx.tone);
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
function partSpan(p: Part): [number, number] {
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
const SAIL_GRID = 12;
const SWAG_PER_WAVE = 12;
const SWAG_ACROSS = 4;
/** ONE swag from point to point (2026-11-13) is a long curve seen whole and from below: a finer grid,
 *  a belly across its width as cloth hangs between its two edges, and soft folds along it. */
const SWAG_ONE_ALONG = 36;
const SWAG_ONE_ACROSS = 16;
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
const FAIRY_R_MM = 9;
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
  const cylinders = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder");
  const crystals = (b: ItemBuild) => b.parts.filter((p) => p.material?.kind === "crystal");
  const sleeves = (b: ItemBuild) => cylinders(b).filter((p) => p.material?.colour === CANDLE_SLEEVE);
  /** An arm's runs: the frame's leaned rods, as thin as an arm. */
  const armRods = (b: ItemBuild) => cylinders(b).filter((p) => p.tiltDeg !== undefined && p.material === b.material && p.rBottom <= 9);

  // A ⌀1200 chandelier, 600 high, eight arms: a turned column, eight arms curving out of its collar
  // to eight candles at 0.74 R — no ring at the arms (a real one has none) — each lit.
  const eight = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8 }));
  assert(!eight.parts.some((p) => p.shape === "torus" && near(p.r, 444)), "no ring where the arms end");
  assert(armRods(eight).length === 8 * 3, `eight arms, three runs each (${armRods(eight).length})`);
  assert(sleeves(eight).length === 8 && sleeves(eight).every((p) => near(Math.hypot(p.at.x, p.at.y), 444) && p.rBottom <= 14), "eight candles at 0.74 R, at their real size");
  assert(eight.emitters.length === 8 && eight.emitters.every((e) => e.strength === BULB && e.colour === ENVELOPE.bulb && e.at.z > 120 && near(Math.hypot(e.at.x, e.at.y), 444)), "eight flames glow over the arms' tier");
  assert(eight.parts.filter((p) => p.shape === "sphere" && p.material?.kind === "emissive").every((p) => p.shape === "sphere" && p.r <= LAMP_MAX_R_MM), "a flame is a flame's size, never the plan's dot");
  const column = eight.parts.find((p): p is Extract<Part, { shape: "lathe" }> => p.shape === "lathe" && p.material === eight.material && p.at.z === 0);
  assert(!!column && Math.max(...column.profile.map((q) => q.z)) === 540 && Math.max(...column.profile.map((q) => q.r)) < 1200 * 0.1, "a turned column from the finial up to the crown at 0.9 h, slender");
  const crownCup = eight.parts.find((p): p is Extract<Part, { shape: "lathe" }> => p.shape === "lathe" && near(p.at.z, 540));
  assert(!!crownCup && near(crownCup.at.z + Math.max(...crownCup.profile.map((q) => q.z)), 600), "the crown joins the column to the top — nothing floats");
  // The arms style's crystal is DROPS (lib/catalog/chandelier.ts): a bead and a pear under every
  // candle; a garland of beads round the arms' dip at 0.48 R; a crystal finial.
  assert(crystals(eight).length > 16 + 16 && crystals(eight).every((p) => partSpan(p)[0] >= -1e-9), `drops, a garland and a finial, all cut crystal, none under the underside (${crystals(eight).length})`);
  assert(crystals(eight).filter((p) => p.shape === "sphere" && near(Math.hypot(p.at.x, p.at.y), 288)).length >= 16, "…the garland at 0.48 R");
  assert(Math.max(...eight.parts.map(top)) <= 600 + 1e-6 && eight.parts.every((p) => partSpan(p)[0] >= -1e-9), "open sky: nothing above h and nothing under the underside");
  assert(eight.material.kind === "metal" && eight.material.colour === "#c9a24a", "a gold chandelier's frame is its metal");
  assert(overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, tone: "#f7f6fc" })).material.kind === "glass", "a crystal one's frame is faint glass");

  // The chain reaches the ceiling exactly; a long drop is three cables.
  const chained = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chainMm: 1500 }));
  const chains = chained.parts.filter((p) => p.shape === "cylinder" && p.at.z === 600);
  assert(chains.length === 1 && chains[0].shape === "cylinder" && chains[0].rBottom === CHAIN_R_MM && near(top(chains[0]), 2100), "one chain from h to h + chainMm");
  const cabled = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chainMm: 4000 }));
  const cables = cabled.parts.filter((p) => p.shape === "cylinder" && p.at.z === 600);
  assert(cables.length === 3 && cables.every((p) => p.shape === "cylinder" && p.rBottom === CABLE_R_MM && near(top(p), 4600)), "a 4 m drop is three cables, each to the ceiling");
  assert(sleeves(overheadKindBody("chandelier", ctxOf(800, 500, { count: 3 }))).length === 3, "three arms");
  assert(sleeves(overheadKindBody("chandelier", ctxOf(800, 500, { count: 1 }))).length === 3, "never fewer than three (item-symbol.tsx:925)");
  assert(sleeves(overheadKindBody("chandelier", ctxOf(800, 500, { count: 0 }))).length === 8, "no count: the plan's eight");
  assert(Math.max(...overheadKindBody("chandelier", ctxOf(800, 0, { count: 5 })).parts.map(top)) <= CHANDELIER_H_MM + 1e-6, "no height: 600");

  // The styles and the build (lib/catalog/chandelier.ts): a crystal piece is two tiers of strands,
  // a three-tier one three tiers of arms; a hoop no arms and cables to every ring; a sputnik rods;
  // pendants globes on cables; a linear piece a bar; a floral one foliage and blooms on a hoop.
  const tori = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "torus" }> => p.shape === "torus" && p.material?.kind !== "crystal" && p.material?.kind !== "emissive");
  const crystal = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, drawStyle: "crystal" }));
  assert(tori(crystal).length === 2 && near(tori(crystal)[0].r, 600 * 0.84 * 1.05) && tori(crystal)[0].at.z < tori(crystal)[1].at.z, "a crystal piece: two thin rings that carry its strands, the lower at 0.84 R");
  assert(crystal.emitters.length === 8 + 6, `…eight candles below, six above (${crystal.emitters.length})`);
  assert(crystals(crystal).length > 60 && crystals(crystal).every((p) => partSpan(p)[0] >= -1e-9), `…strands of cut crystal, none under the underside (${crystals(crystal).length})`);
  const threeTier = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 12, drawStyle: "arms", chandelier: { tiers: 3, crystals: "garlands" } }));
  assert(sleeves(threeTier).length === 12 + 10 + 8 && armRods(threeTier).length === 3 * 30, `three tiers: thirty arms, thirty candles (${sleeves(threeTier).length})`);
  assert(crystals(threeTier).filter((p) => p.shape === "sphere" && Math.abs(p.r - Math.max(5, 0.028 * 600)) < 1e-6).length >= 7 * 30, "…garlands of seven beads between every pair of arms");
  assert(crystals(overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chandelier: { crystals: "none" } }))).length === crystals(eight).length - 8 - 8 * 2, "no drops when asked for none — eight beads and eight two-part pears go; the garland and the finial stay");
  const hoop = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, drawStyle: "hoop" }));
  assert(armRods(hoop).length === 3 && tori(hoop).length === 1 && near(tori(hoop)[0].r, 540) && hoop.emitters.length === 8 && sleeves(hoop).length === 0, "a hoop: one ring at 0.9 R, eight lamps along its LED strip, no arms, three cables");
  assert(hoop.parts.some((p) => p.shape === "torus" && p.material?.kind === "emissive"), "…the strip lit inside it");
  // The photographs' three (2026-11-08): drum shades are lit drums, top-widest, with a tail; a cascade
  // of rods a faceted crystal bar per rod; a basket three rings and its hundreds of beads.
  const drums = overheadKindBody("chandelier", ctxOf(1000, 700, { count: 8, drawStyle: "drums" }));
  const drumBands = drums.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder" && p.material?.kind === "emissive");
  assert(drumBands.length === 3 && drumBands[2].rBottom > drumBands[0].rBottom && near(drumBands[2].rBottom, 500) && drumBands[0].at.z < drumBands[2].at.z, `drum shades: three lit drums, the top the full radius (${drumBands.map((p) => p.rBottom).join(",")})`);
  assert(tori(drums).length === 6 && drums.emitters.length === chandelierTiers(chandelierOf("drums", undefined), 8).reduce((n, t) => n + t.count, 0), "…a rim top and bottom of each, its lamps inside");
  assert(drums.parts.some((p) => p.shape === "cylinder" && near(p.at.z, 0) && p.material?.kind === "metal") && drumBands[0].material?.colour === darkerShade("#c9a24a", 0.45), "…the rod down to the tail; the cloth a darker cut of the tone, lit");
  const prisms = overheadKindBody("chandelier", ctxOf(1200, 1500, { count: 10, drawStyle: "prisms" }));
  const rodsOf = cylinders(prisms).filter((p) => p.material?.kind === "crystal" && p.segments === 6 && p.rTop === p.rBottom);
  const rodTiers = chandelierTiers(chandelierOf("prisms", undefined), 10);
  assert(rodsOf.length === rodTiers.reduce((n, t) => n + t.count * 6, 0) && rodsOf.every((p) => near(p.h, 1500 * (rodTiers[0].h ?? 0))), `a cascade of rods: a faceted crystal bar per rod, each a band tall (${rodsOf.length})`);
  assert(tori(prisms).length === 5 && prisms.emitters.length === rodTiers.reduce((n, t) => n + t.count, 0), "…a frame ring on every band, the lamps inside");
  assert(armRods(prisms).length === 5 * 4, "…every ring held by four spokes off the rod");
  assert(crystals(prisms).some((p) => p.at.z < 1500 * CASCADE.bottom && Math.hypot(p.at.x, p.at.y) < 1), "…a crystal tail under the lowest band, not a bare pole");
  const drumOfRods = overheadKindBody("chandelier", ctxOf(600, 300, { count: 8, drawStyle: "prisms", chandelier: { tiers: 1 } }));
  assert(cylinders(drumOfRods).every((p) => p.material?.kind === "crystal" || p.at.z >= 300 * (CASCADE.top - (CASCADE.top - CASCADE.bottom) * (1 - CASCADE.band)) - 1 || Math.hypot(p.at.x, p.at.y) > 1), "a single drum of crystal: no rod through the middle of it");
  const empireB = overheadKindBody("chandelier", ctxOf(1100, 1100, { count: 8, drawStyle: "empire" }));
  assert(tori(empireB).length === 3 && near(tori(empireB)[1].r, 550) && near(tori(empireB)[1].at.z, 1100 * EMPIRE.ringZ), "a basket: crown, wide ring at the full radius, small ring");
  assert(crystals(empireB).length > 400 && crystals(empireB).every((p) => partSpan(p)[0] >= -1e-9 && Math.hypot(p.at.x, p.at.y) <= 550 * 1.03 + 1e-6) && empireB.emitters.length === 8, `…hundreds of beads, none outside the ring or under the underside, eight lamps in the bag (${crystals(empireB).length})`);
  const empire3 = overheadKindBody("chandelier", ctxOf(1000, 1800, { count: 8, drawStyle: "empire", chandelier: { tiers: 3 } }));
  assert(tori(empire3).length === 5 && empire3.emitters.length > 8, "three baskets: crown, three rings, the small ring; lamps in every basket");
  const spiralB = overheadKindBody("chandelier", ctxOf(500, 1800, { count: 8, drawStyle: "spiral" }));
  const balls = crystals(spiralB).filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere" && p.r > 0.03 * 250);
  assert(balls.length === SPIRAL.strands && cylinders(spiralB).filter((p) => p.rBottom === 1.2).length === SPIRAL.strands, `a spiral: a ball at the end of each of ${SPIRAL.strands} threads (${balls.length})`);
  assert(spiralB.emitters.length >= 3 && spiralB.parts.some((p) => p.shape === "cylinder" && near(p.rBottom, 245) && near(p.at.z, 1800 * SPIRAL.plateZ)), "…hung from a plate the size of the piece, its downlights glowing");
  const ringsB = overheadKindBody("chandelier", ctxOf(1000, 1500, { count: 8, drawStyle: "rings", chandelier: { tiers: 7 } }));
  const leaned = ringsB.parts.filter((p): p is Extract<Part, { shape: "torus" }> => p.shape === "torus" && p.material === ringsB.material);
  assert(leaned.length === 7 && leaned.every((p) => Math.abs(p.tiltDeg ?? 0) > 5) && leaned[6].r > leaned[0].r, "floating rings: seven, each leaned, the widest on top");
  assert(ringsB.parts.filter((p) => p.shape === "sphere" && p.material?.colour === GLOBE).length === 7 && armRods(ringsB).length === 7 * 2, "…a lit amber globe in each, two cables to every ring");
  const sputnik = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, drawStyle: "sputnik" }));
  const rods = sputnik.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder" && p.tiltDeg !== undefined);
  assert(rods.length === 12 && sputnik.emitters.length === 12 && rods.every((p) => near(p.at.z, 300)), "a sputnik: twelve rods from the core at half height, a lamp on each");
  assert(rods.some((p) => p.tiltDeg! > 90) && rods.some((p) => p.tiltDeg! < 90) && rods.some((p) => near(p.tiltDeg!, 90)), "…some down, some up, some level");
  // Glass pendants (2026-11-08): every globe a glass lathe in its shade, a cap, an Edison bulb round a
  // lit filament, its own cord to the canopy; a single globe IS the underside; a mixed group's globes
  // take the row's shades in turn; under a ceiling every cord runs to it.
  type Lathe = Extract<Part, { shape: "lathe" }>;
  const globesOf = (b: ItemBuild) => b.parts.filter((p): p is Lathe => p.shape === "lathe" && Math.max(...p.profile.map((q) => q.r)) >= 40 && p.material?.colour !== "#f6ead2");
  const cords = (b: ItemBuild) => cylinders(b).filter((p) => p.rBottom === 2.5 && p.material?.kind !== "emissive");
  const pendants = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 6, drawStyle: "pendants" }));
  assert(globesOf(pendants).length === 6 && pendants.emitters.length === 6 && cylinders(pendants).filter((p) => p.material?.kind === "emissive").length === 6, "pendants: six glass globes, an Edison filament glowing in each");
  assert(cords(pendants).length === 6 && pendants.parts.every((p) => partSpan(p)[1] <= 600 + 1e-9) && Math.min(...globesOf(pendants).map((p) => p.at.z)) === 0, "…each on its own cord, nothing above the top, the lowest at the underside");
  const single = overheadKindBody("chandelier", ctxOf(250, 320, { count: 1, drawStyle: "pendants", tone: "#C8862A", chainMm: 2000 }));
  const globe = globesOf(single);
  assert(globe.length === 1 && globe[0].at.z === 0 && near(Math.max(...globe[0].profile.map((q) => q.r)), 125 * 0.98) && globe[0].material?.kind === "glass" && globe[0].material.colour === "#C8862A", "a single amber globe: the plan's circle, at the underside, in amber glass");
  assert(cords(single).length === 1 && near(top(cords(single)[0]), 320 + 2000 - 25) && !single.parts.some((p) => p.shape === "cylinder" && p.rBottom === CHAIN_R_MM), "…its cord up to the canopy at the ceiling — a cord, never a chandelier's chain");
  const group = overheadKindBody("chandelier", {
    ...ctxOf(1000, 900, { count: 5, drawStyle: "pendants" }),
    chandelier: { glassMix: true, equal: true, fitting: "brass", palette: [{ name: "ענבר", swatch: "#C8862A" }, { name: "עשן", swatch: "#6E6F73" }, { name: "שקוף", swatch: "#E8F0F5" }, { name: "כרום", swatch: "#C9CDD3" }] },
  });
  const gl = globesOf(group);
  assert(gl.length === 5 && new Set(gl.map((p) => Math.round(Math.max(...p.profile.map((q) => q.r))))).size === 1, "a group of five, all one size");
  assert(gl[0].material?.colour === "#C8862A" && gl[1].material?.colour === "#6E6F73" && gl[2].material?.opacity === 0.2 && gl[3].material?.kind === "metal" && gl[4].material?.colour === "#C8862A", "…amber, smoke, clear, chrome, amber again");
  assert(new Set(gl.map((p) => p.at.z)).size === 5 && cords(group).every((p) => p.material?.colour === FITTING_COLOUR.brass), "…every one at its own drop, on a brass cord");
  const bell = overheadKindBody("chandelier", { ...ctxOf(400, 400, { count: 1, drawStyle: "pendants" }), chandelier: { profile: PENDANT_GLASS.bell } });
  assert(globesOf(bell)[0].profile[0].r > 150, "a bell's glass is open underneath, its rim the plan's circle");
  const linear = overheadKindBody("chandelier", ctxOf(2400, 600, { count: 5, drawStyle: "linear" }));
  const bar = linear.parts.find((p): p is Extract<Part, { shape: "box" }> => p.shape === "box" && p.w > 2000);
  assert(!!bar && near(bar.at.z, 420) && !bar.rotDeg && linear.emitters.length === 5, "a linear piece: a bar along its length at 0.7 h, five lamps under it");
  assert(!!overheadKindBody("chandelier", ctxOf(600, 600, { count: 5, drawStyle: "linear" })).parts.find((p) => p.shape === "box" && p.rotDeg === 90) === false, "…a square one lies along x");
  const floral = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 5, drawStyle: "floral" }));
  assert(floral.parts.filter((p) => p.shape === "blob").length === 18 && floral.parts.filter((p) => p.shape === "bloom").length === 25 && floral.emitters.length === 5, "a floral hoop: eighteen clumps, twenty-five blooms, five lights");

  // THE SILHOUETTE: the base's body shapes the tiers — a cone of arms narrows upward, a spindle of
  // rods widens and narrows — and never stands in the room as a solid of its own.
  const cone = overheadKindBody("chandelier", ctxOf(1500, 1300, { count: 16, chandelier: { tiers: 4, profile: CHANDELIER_PROFILES.cone } }));
  const coneR = [...new Set(sleeves(cone).map((p) => Math.round(Math.hypot(p.at.x, p.at.y))))].sort((a, b) => b - a);
  assert(coneR.length === 4 && near(coneR[0], 750 * 0.74 * profileAt(CHANDELIER_PROFILES.cone, 0.12), 1), `a cone of arms: four tiers of candles, the lowest widest (${coneR.join(",")})`);
  assert(!cone.parts.some((p) => p.shape === "lathe" && Math.max(...p.profile.map((q) => q.r)) > 750 * 0.5), "…and no solid the size of the piece");

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
  // A head's centre: a ball and a bloom are both built about their own middle (flowers.ts headPart).
  const centreOf = (r: InstanceRequest) => r.at.at.z + r.parts[0].at.z;
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
  const looks = (r: InstanceRequest) => applyTransform({ ...r.at, at: vec3(0, 0, 0) }, vec3(0, 0, 1)).z;
  const hungBlooms = heads.filter((r) => r.parts[0].shape === "bloom");
  assert(hungBlooms.length > 5 && hungBlooms.every((r, i) => near(looks(r), -looks(upHeads.filter((u) => u.parts[0].shape === "bloom")[i]), 1e-9)), "a hung bloom turns over with its arrangement: it looks down as far as the upright one looks up");
  const disc = hung.parts.find((p) => p.shape === "cylinder" && near(p.rBottom, 300));
  assert(!!disc && near(disc.at.z, 370) && near(top(disc), 400) && disc.material?.kind === "foliage", "a foliage disc the footprint's width at the top");
  assert(hung.parts.every((p) => p.shape === "blob" || p.shape === "leaves" || partSpan(p)[0] >= 400 * 0.3 - 1e-9), "every part (the disc, any stem) is in the upper mass, not among the hanging heads — the filler and the leaves round it flip with it");
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
  // 2026-11-07: a style is its pleat, a drop stops the cloth short of the floor, a rod brings posts.
  const sheer = curtainBody([{ x: 0, y: 0 }, { x: 4000, y: 0 }], 4000, "#ffffff", { type: "item" }, { style: "sheer", dropMm: 2500 }).parts.find((p) => p.shape === "ribbon");
  assert(!!sheer && sheer.shape === "ribbon" && sheer.pleatMm === CURTAIN_PLEATS.sheer.pleatMm && sheer.h === 2500 && sheer.at.z === 1500, "a sheer curtain's long soft pleat, its cloth 2.5 m down from a 4 m rail");
  assert(curtainBody([{ x: 0, y: 0 }, { x: 4000, y: 0 }], 3000, "#ffffff", { type: "item" }, { dropMm: 9000 }).parts.find((p) => p.shape === "ribbon")?.h === 3000, "a drop longer than the height is to the floor");
  const onRod = curtainBody([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }], 2400, "#ffffff", { type: "item" }, { posts: [{ x: 0, y: 0 }, { x: 3000, y: 0 }] });
  const posts = onRod.parts.filter((p) => p.shape === "box");
  assert(posts.length === 2 && posts.every((p) => p.shape === "box" && p.at.z === 0 && p.h > 2400), "a rod's two posts stand from the floor past the rod, none under its arm");
  assert(posts.every((p) => p.shape === "box" && p.w === POST_MM) && onRod.parts.some((p) => p.shape === "cylinder" && p.rTop === ROD_R_MM), "…the 3 cm rod on 5 cm posts it always was, with no thickness typed");
  // A BARE ROD (2026-11-13 — the built-in מוט וילון placed by itself): the rod and its posts, no cloth,
  // at its typed thickness.
  const bareRod = curtainBody([{ x: 0, y: 0 }, { x: 3000, y: 0 }], 2400, "#ffffff", { type: "item" }, { posts: [{ x: 0, y: 0 }, { x: 3000, y: 0 }], bare: true, rodMm: 80, postMm: 100, rodColour: "#c9a24a" });
  assert(!bareRod.parts.some((p) => p.shape === "ribbon") && bareRod.parts.filter((p) => p.shape === "box").length === 2, "a bare rod has no cloth — two posts and a rod");
  assert(bareRod.parts.some((p) => p.shape === "cylinder" && p.rTop === 40) && bareRod.parts.every((p) => p.shape !== "box" || p.w === 100), "…an 8 cm rod on 10 cm posts when that is what was typed");
  assert(onRod.parts.filter((p) => p.shape === "cylinder").length === 2, "…and the rod bends round its corner, one length per stretch");

  assert(ceilingUndersideMm(4000, 600) === 2800, "under a 4 m ceiling a chandelier's underside is at 2.8 m");
  assert(ceilingUndersideMm(null, 600) === 3000, "under open sky it hangs at 3 m");
  assert(ceilingUndersideMm(800, 600) === 0, "…and never below the floor");

  // 2026-11-07: a SAIL — a 4 × 3 m quad tied at 3 m, 3.2 m, 2.6 m and 2.8 m, sagging 40 cm; one post.
  const quad = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
  const sail = sailBody({ polygon: quad, heights: [3000, 3200, 2600, 2800], sagMm: 400, posts: [quad[2]] }, "#f4f1ea");
  const sheet = sail.parts.find((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet")!;
  const g = sheet.rows;
  assert(!!sheet && g.length === SAIL_GRID + 1 && g.every((r) => r.length === SAIL_GRID + 1), "a sail is one sheet, a 12 × 12 grid");
  assert(near(g[0][0].z, 3000) && near(g[0][SAIL_GRID].z, 3200) && near(g[SAIL_GRID][SAIL_GRID].z, 2600) && near(g[SAIL_GRID][0].z, 2800), "…its corners at their tie heights");
  assert(near(g[6][6].z, 2900 - 400) && near(g[6][6].x, 2000) && near(g[6][6].y, 1500), "…its middle 40 cm under the ties' mean");
  assert(near(g[0][6].z, 3100), "…every edge taut between its ties");
  assert(sail.material.kind === "fabric" && sail.material.colour === "#f4f1ea", "…in its cloth");
  const pole = sail.parts.find((p) => p.shape === "cylinder");
  assert(!!pole && pole.at.x === 4000 && pole.at.z === 0 && pole.shape === "cylinder" && pole.h > 2600, "a pole from the ground to the tie on a post of its own");
  const tri = sailGrid([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 1500, y: 3000 }], [3000, 3000, 3600], 300, 6);
  const centroid = tri[2][3];
  assert(near(centroid.x, 1500) && near(centroid.y, 1000) && near(centroid.z, 3200 - 300), "a triangle sags at its centroid, under its ties' mean");
  assert(partSpan(sheet)[1] === 3200 && flipPart(sheet, 4000).shape === "sheet", "a sheet's span is its grid's");
  // A SWAG — a 6 m run at 3.5 m, four scallops, 30 cm of sag, 1.2 m wide.
  const run: ClothRun = { a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, heightMm: 3500, sagMm: 300, widthMm: 1200, waves: 4, lengthMm: 6000, lights: false };
  const swag = ceilingDrapeBody([run, { ...run, a: { x: 0, y: 1500 }, b: { x: 6000, y: 1500 } }], "#f3ede2");
  const strips = swag.parts.filter((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet");
  assert(strips.length === 2 && swag.emitters.length === 0 && swag.parts.length === 2, "a canopy's runs are a swag each, and nothing else without lights");
  // …with fairy lights woven in: a warm point and a faint emitter at every light, under the cloth.
  const lit = ceilingDrapeBody([{ ...run, lights: true }], "#f3ede2");
  const fairy = lit.parts.filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere");
  assert(fairy.length === 24 && lit.emitters.length === 24 && fairy.every((p) => p.material?.kind === "emissive" && p.at.z < 3500 && p.at.z > 3500 - 300 - 45 - FAIRY_R_MM * 2 - 1e-6), `a lit run: twenty-four fairy lights under its cloth (${fairy.length})`);
  assert(lit.emitters.every((e) => e.strength < 0.4), "…each too faint to be taken for a candle");
  // ONE SWAG hung from 4 m down to 2.6 m, 70 cm deep (2026-11-13): its line runs from one height to
  // the other, the cloth under it, and a light near the low end hangs under the LOW end's line.
  const slope: ClothRun = { ...run, heightMm: 4000, heightBMm: 2600, waves: 1, sagMm: 700, lights: true };
  const sloped = ceilingDrapeBody([slope], "#f3ede2");
  const slopeEdge = sloped.parts.find((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet")!.rows[0];
  assert(Math.abs(slopeEdge[0].z - 4000) < 1 && Math.abs(slopeEdge[slopeEdge.length - 1].z - 2600) < 1, "a swag hung end to end at two heights starts at one and ends at the other");
  const midCol = slopeEdge[Math.floor(slopeEdge.length / 2)];
  assert(Math.abs(midCol.z - (3300 - 700)) < 1, `…its middle its depth under the line between them (${Math.round(midCol.z)})`);
  const lastLight = sloped.parts.filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere").reduce((a, q) => (q.at.x > a.at.x ? q : a));
  assert(lastLight.at.z < 2700 && lastLight.at.z > 2400, `…and its lights ride it down (${Math.round(lastLight.at.z)})`);
  const spine = sloped.parts.find((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet")!.rows[SWAG_ONE_ACROSS / 2];
  assert(spine.length === SWAG_ONE_ALONG + 1 && spine[SWAG_ONE_ALONG / 2].z < midCol.z - 100 && Math.abs(spine[0].z - 4000) < 1, "…one swag bellies between its edges and is tied tight at its ends");
  const mid = strips[0].rows[SWAG_ACROSS / 2];
  const atS = (s: number) => mid[Math.round(s * (mid.length - 1))];
  assert(near(atS(0).z, 3500) && near(atS(1 / 4).z, 3500) && near(atS(1 / 8).z, 3500 - 300 - 45), "it hangs from its height where gathered and sags in every scallop");
  const edge = strips[0].rows[0];
  assert(near(Math.abs(edge[0].y), 600 * 0.7) && near(Math.abs(edge[Math.round((edge.length - 1) / 8)].y), 600), "…gathered to 70% of its width, full width mid-scallop");
  console.log("scene overhead ok");
}
