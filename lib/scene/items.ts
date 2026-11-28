// Every catalog item kind as a 3D body — one function per SymbolKind, each lifting the 2D recipe in
// lib/catalog/symbols.ts / components/item-symbol.tsx into parts with a height. Spec §3.3–§3.5.
//
// The plan's picture IS the specification. `candlestick()` in item-symbol.tsx already says how many
// candles a five-arm piece has, how far out its arms reach and how fat each candle is; `chair()` says
// how deep a Chiavari's back rail is and where its posts stand; `vase()` says the opening is 0.8 of
// the rim and the foot 0.32. Every number here is one of those — cited by the item-symbol.tsx line
// it was lifted from — given a z. Nothing is modelled by hand, so a change to a picture on the plan
// is a change to the body in the room, and the two never disagree about what a thing is.
//
// The frame is the symbol's: centred on (0,0) in the item's own millimetres, a directional piece's
// FRONT at +y (the edge you sit down from) and its BACK at −y, a long piece built along its longer
// side (`along`, exactly as the plan's `along()` turns a bar drawn 60×300). Heights are from the
// item's own floor — the table top it stands on is the caller's transform, never ours.
//
// What a kind returns is an ItemBuild (./collect.ts): its own parts in its frame, what it wants
// INSTANCED across the room (every chair of one style and colour, every rose head of one colour, is
// one geometry), and what glows at night (a flame on every candle, the bulb inside a lamp). Phase A
// builds the TABLE kinds — the dressed table is what the client sees first (spec §2) — and the
// chairs; the floor kinds are phase B and get the ADR-5 fallback meanwhile, marked per kind below.
//
// Pure: no React, no three. `npm run check:items` runs the self-check.
import type { Footprint } from "@/lib/studio/footprint";
import { footprintOutlines } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import type { Product } from "@/lib/catalog/types";
import type { Resolved } from "@/lib/studio/catalog-resolver";
import { type CandleStyle, type ChairStyle, type ChuppahStyle, type SymbolKind, isCandleStyle } from "@/lib/catalog/symbols";
import { type FlowerDrawSpec, darken, defaultFlowerForm, defaultMix, isPale, seedOf } from "@/lib/catalog/flower-draw";
import { packCircles } from "@/components/item-symbol";
import type { PlacementClimb } from "@/lib/design-document/types";
import type { BenchLayout } from "@/lib/design-document/bench";
import { type InstanceRequest, type ItemBuild } from "./collect";
import { type ItemContext, fallbackBody } from "./item-context";
import { hasOwnBody } from "@/lib/element/adapter";
import { revolveProfileMm } from "@/lib/element/revolve";
import { frameFootprint, pictureFrame } from "@/lib/catalog/picture-frame";
import { lampParts, lampShadeOf } from "@/lib/catalog/body-profiles";
import { cleanRevolve } from "@/lib/element/revolve";
import { hasFront } from "@/lib/element/front";
import { ownBodyParts } from "./element-body";
import { floorKindBody } from "./floor-kinds";
import { overheadKindBody } from "./overhead";
import { screenBody } from "./led";
import { danceFloorBody } from "./dance-floor";

export { type ItemContext, fallbackBody } from "./item-context";
import { FALL_DROP_MM, flowerBuild } from "./flowers";
import { shapedFlowersBody } from "./flower-cover";
import { applyTransform, compose, turn } from "./frame";
import { ENVELOPE, clothMaterial, glassMaterial, glossMaterial, materialRefOf, metalMaterial } from "./materials";
import type { Material } from "@/lib/catalog/material";
import { armLevels, candleLook, type CandleLook, type CandleSpec } from "@/lib/catalog/candles";
import { fireLayout } from "@/lib/catalog/fire";

/** What a candlestick's spec asks of every recipe (lib/catalog/candles.ts) — absent fields = the
 *  recipe's own, as before. */
interface CandleOpts {
  look: CandleLook | null;
  spec?: CandleSpec;
}
import { hexOf } from "./materials";
import { borderBands } from "@/lib/catalog/border";
import { type MaterialRef, type NodeTag, type Part, type Transform, type Vec3, transform, vec3 } from "./types";

// ── the constants the plan draws with ───────────────────────────────────────────────────────────

/** A pillar candle's wax (item-symbol.tsx:555), powdered wax (:531), the water in a floating
 *  candle's glass (:33), a burner's slot (:609), the plate under a centrepiece (:140). */
export const WAX = "#fbf4e4";
const POWDER = "#f3eadb";
const WATER = "#d3e7f0";
const BURNER = "#3b3431";
const PLATE = "#f4f1f8";
const LEAF = "#8fae84";

const SEAT_Z_MM = 450;
const SEAT_THICK_MM = 40;
const LEG_MM = 25;
const CHIAVARI_LEG_R_MM = 12;
const ARM_MM = 10;
/** A rod of the "rods" style (מוטות על בסיס): ⌀12 mm. */
export const ROD_MM = 6;
export const PLATE_MM = 20;
const RUNNER_MM = 8;
/** A runner's contour band (lib/catalog/border.ts), laid on its top. */
const RUNNER_BAND_MM = 1;
const FLAME_R_MM = 25;
const FLAME = 0.4;
export const FIRE = 0.5;

/** Where a chair's seat is: 450 above its floor, or half its height on a low piece (spec §3.2). */
export const seatHeight = (heightMm: number): number => Math.min(SEAT_Z_MM, heightMm * 0.5);

// ── colour helpers ───────────────────────────────────────────────────────────────────────────────

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A darker shade of a tone for legs, frames and feet (the plan's `shade` on a light piece); a
 *  tone that is not a colour is left as it is. */
export const darkened = (tone: string, t = 0.25): string => (HEX.test(tone.trim()) ? darken(tone.trim(), t) : tone);

/** Near-white — glass, white porcelain, crystal (item-symbol.tsx:352 paleTone). */
export const pale = (tone: string): boolean => HEX.test(tone.trim()) && isPale(tone.trim());

const matte = (colour: string): MaterialRef => ({ colour, kind: "matte" });
const WAX_M = matte(WAX);
const GLASS = glassMaterial();

/** A candelabrum's arms: the metal where it has a colour; faint and clear where it is crystal or
 *  white, or they would be the only thing you see of it (item-symbol.tsx:346 armLine). */
const armMaterial = (tone: string, material?: Material): MaterialRef => (material ? materialRefOf(material, tone) : pale(tone) ? { colour: "#d6d2dd", kind: "glass", opacity: 0.5 } : metalMaterial(tone));

// ── part constructors ───────────────────────────────────────────────────────────────────────────

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number): Point => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });

const box = (w: number, d: number, h: number, at: Vec3, material?: MaterialRef, rotDeg?: number): Part => {
  const p: Part = { shape: "box", w, d, h, at };
  if (material) p.material = material;
  if (rotDeg) p.rotDeg = rotDeg;
  return p;
};
const cyl = (r: number, h: number, at: Vec3, material?: MaterialRef, rTop = r, segments?: number): Part => {
  const p: Part = { shape: "cylinder", rTop, rBottom: r, h, at };
  if (material) p.material = material;
  if (segments) p.segments = segments;
  return p;
};
const sphere = (r: number, at: Vec3, material?: MaterialRef): Part => (material ? { shape: "sphere", r, at, material } : { shape: "sphere", r, at });
const lathe = (profile: { r: number; z: number }[], at: Vec3, material?: MaterialRef): Part => (material ? { shape: "lathe", profile, at, material } : { shape: "lathe", profile, at });
const extrude = (outline: Point[], h: number, at: Vec3, material?: MaterialRef, rotDeg?: number): Part => {
  const p: Part = { shape: "extrude", outline: { outline }, h, at };
  if (material) p.material = material;
  if (rotDeg) p.rotDeg = rotDeg;
  return p;
};

const make = (material: MaterialRef): ItemBuild => ({ parts: [], material, instanced: [], emitters: [] });

/** Several builds as one: the first one's material, everything else appended. */
function merge(first: ItemBuild, ...rest: ItemBuild[]): ItemBuild {
  return {
    material: first.material,
    parts: [first, ...rest].flatMap((b) => b.parts),
    instanced: [first, ...rest].flatMap((b) => b.instanced),
    emitters: [first, ...rest].flatMap((b) => b.emitters),
  };
}

/** A build lifted `dz` (flowers standing on their plate). */
function raise(b: ItemBuild, dz: number): ItemBuild {
  if (!dz) return b;
  return {
    material: b.material,
    parts: b.parts.map((p) => ({ ...p, at: vec3(p.at.x, p.at.y, p.at.z + dz) })),
    instanced: b.instanced.map((r) => ({ ...r, at: { ...r.at, at: vec3(r.at.at.x, r.at.at.y, r.at.at.z + dz) } })),
    emitters: b.emitters.map((e) => ({ ...e, at: vec3(e.at.x, e.at.y, e.at.z + dz) })),
  };
}

function turnPart(p: Part, t: Transform, deg: number): Part {
  const at = applyTransform(t, p.at);
  switch (p.shape) {
    case "box":
    case "extrude":
    case "plane":
    case "panel":
      return { ...p, at, rotDeg: (p.rotDeg ?? 0) + deg };
    case "ribbon":
      return { ...p, at, path: p.path.map((q) => turn(q, deg)) };
    default:
      return { ...p, at };
  }
}

/** A build turned `deg` clockwise about the item's origin. */
function turned(b: ItemBuild, deg: number): ItemBuild {
  const t = transform(vec3(0, 0, 0), deg);
  return {
    material: b.material,
    parts: b.parts.map((p) => turnPart(p, t, deg)),
    instanced: b.instanced.map((r) => ({ ...r, at: compose(t, r.at) })),
    emitters: b.emitters.map((e) => ({ ...e, at: applyTransform(t, e.at) })),
  };
}

/** Build a long piece along its LONGER side: `draw` is written for a run along x (`L` long, `D`
 *  across), and a piece whose depth is the long side is turned a quarter — the plan's `along()`
 *  (item-symbol.tsx:287), so a row of candles stored 120×800 runs down the table as it does on it. */
function along(w: number, d: number, draw: (L: number, D: number) => ItemBuild): ItemBuild {
  return w >= d ? draw(w, d) : turned(draw(d, w), 90);
}

const isRound = (f: Footprint): boolean => f.kind === "circle" || f.kind === "ellipse";

/** Clear crystal: brighter than a drinking glass, the facets catching the light. */
const CRYSTAL: MaterialRef = { colour: "#e6eef2", kind: "glass", opacity: 0.7 };

/** What a candelabrum's foot, stem and bar are made of: crystal when its shade is clear (a
 *  near-white tone — "שקוף"), else metal in its tone. A clear piece in metal read as a grey lab
 *  rack (plan A's "פמוט צינורות קריסטל", 2026-10-24). */
const frameOf = (tone: string, material?: Material): MaterialRef => (material ? materialRefOf(material, tone) : pale(tone) ? CRYSTAL : metalMaterial(tone));

/** A candle standing at (x, y) from `from` up to `top`: its holder cup in the metal, the wax, the
 *  flame emitter at its tip — and in a sleeve the glass round it 1.75× its radius (item-symbol.tsx:362
 *  candleAt: wax r, flame 0.5r, sleeve 1.75r). */
function candle(b: ItemBuild, x: number, y: number, r: number, from: number, top: number, metal: MaterialRef, sleeve = false, flame = FLAME, look?: CandleLook | null) {
  if (look) return candleAs(b, x, y, from, metal, look, flame);
  const height = Math.max(10, top - from);
  // In a hurricane the GLASS reaches the top and the candle stands inside it, its flame under the rim.
  const wax = sleeve ? Math.max(10, height * 0.78) : height;
  const cup = Math.min(25, wax * 0.15);
  b.parts.push(cyl(r * 1.15, cup, vec3(x, y, from), metal));
  b.parts.push(cyl(r, wax - cup, vec3(x, y, from + cup), WAX_M));
  if (sleeve) b.parts.push(hurricane(r * 1.75, height, vec3(x, y, from)));
  b.emitters.push({ at: vec3(x, y, from + wax), radiusMm: FLAME_R_MM, colour: ENVELOPE.flame, strength: flame });
}

/** One candle as its spec says (lib/catalog/candles.ts CandleLook), at its REAL size, standing at
 *  `from`: a taper or a pillar on its cup, a הידורית (a glass cup with its wax low and its flame in
 *  it), an LED candle (its flame fainter), a floating candle in a shallow bowl of water — each in its
 *  guard when it has one (a straight glass or a tulip, open at the top). */
function candleAs(b: ItemBuild, x: number, y: number, from: number, metal: MaterialRef, look: CandleLook, flame = FLAME) {
  const r = look.dMm / 2;
  const h = look.hMm;
  let flameZ: number;
  let strength = flame;
  switch (look.kind) {
    case "hadorit": {
      const R = r * 1.08;
      b.parts.push(lathe([{ r: 0, z: 0 }, { r: R, z: 0 }, { r: R, z: h }, { r: R - 2, z: h }, { r: R - 2, z: 4 }, { r: 0, z: 4 }], vec3(x, y, from), GLASS));
      b.parts.push(cyl(r * 0.95, h * 0.4, vec3(x, y, from + 4), WAX_M));
      flameZ = from + 4 + h * 0.4;
      break;
    }
    case "led":
      b.parts.push(cyl(r, h, vec3(x, y, from), WAX_M));
      flameZ = from + h;
      strength = flame * 0.6;
      break;
    case "floating": {
      const R = r * 1.6;
      const bowl = h * 2.2;
      b.parts.push(lathe([{ r: 0, z: 0 }, { r: R * 0.7, z: 0 }, { r: R, z: bowl }, { r: R - 2, z: bowl }, { r: R * 0.7 - 2, z: 3 }, { r: 0, z: 3 }], vec3(x, y, from), GLASS));
      b.parts.push(cyl(R * 0.9, 6, vec3(x, y, from + bowl * 0.55), { colour: WATER, kind: "water", opacity: 0.75 }));
      b.parts.push(cyl(r, h * 0.5, vec3(x, y, from + bowl * 0.55)));
      b.parts[b.parts.length - 1].material = WAX_M;
      flameZ = from + bowl * 0.55 + h * 0.5;
      break;
    }
    default: {
      const cup = Math.min(25, h * 0.12);
      b.parts.push(cyl(r * 1.15, cup, vec3(x, y, from), metal));
      b.parts.push(cyl(r, h - cup, vec3(x, y, from + cup), WAX_M));
      flameZ = from + h;
    }
  }
  if (look.guard === "cylinder") b.parts.push(hurricane(look.guardDMm / 2, Math.max(look.guardHMm, flameZ - from + 30), vec3(x, y, from)));
  else if (look.guard === "tulip") b.parts.push(tulipGlass(look.guardDMm / 2, Math.max(look.guardHMm, flameZ - from + 30), vec3(x, y, from)));
  b.emitters.push({ at: vec3(x, y, flameZ), radiusMm: FLAME_R_MM, colour: ENVELOPE.flame, strength });
}

/** A tulip hurricane: a narrow foot swelling to a bulb a third of the way up and flaring at an open
 *  lip — the seven-light crystal piece's glasses (Ravid's photograph). A 3 mm wall. */
function tulipGlass(R: number, h: number, at: Vec3): Part {
  const t = Math.min(3, R * 0.12);
  const outer: [number, number][] = [[0, 0], [0.42, 0], [0.4, 0.05], [0.82, 0.3], [1, 0.55], [0.86, 0.82], [0.94, 1]];
  const pts = [...outer.map(([r, z]) => ({ r: R * r, z: h * z })), ...[...outer].reverse().filter(([, z]) => z > 0.02).map(([r, z]) => ({ r: Math.max(0, R * r - t), z: h * z }))];
  pts.push({ r: 0, z: t });
  return lathe(pts, at, GUARD_GLASS);
}

/** Crystal drops hanging from `at` (an arm's end or between arms): one pear, or — "full" — a short
 *  chain of three beads ending in a pear. */
function crystalDrop(b: ItemBuild, x: number, y: number, z: number, size: number, full: boolean) {
  const bead = Math.max(4, size * 0.45);
  let at = z;
  if (full)
    for (let k = 0; k < 3; k++) {
      at -= bead * 1.8;
      b.parts.push(sphere(bead, vec3(x, y, at), CRYSTAL));
    }
  b.parts.push(sphere(size, vec3(x, y, at - size * 1.4), CRYSTAL));
}

/** RODS ON A BASE (CandleStyle "rods" — Ravid's acrylic photograph): a low slab that is the
 *  footprint, `n` thin rods along its long side at stepped heights (CandleSpec.heights, default
 *  "stepped"), a candle on each rod's top in its guard (default a straight glass). In the row's
 *  material, acrylic or metal. */
function candleRods(ctx: ItemContext, n: number): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone, footprint } = ctx;
  const metal = frameOf(tone, ctx.material);
  const b = make(metal);
  const slab = Math.min(30, h * 0.06);
  for (const outline of footprintOutlines(footprint)) b.parts.push({ shape: "extrude", outline, h: slab, at: vec3(0, 0, 0) });
  const spec = ctx.candles;
  const look = candleLook({ guard: "cylinder", ...spec }, true)!;
  const along = w >= d;
  const L = (along ? w : d) * 0.8;
  const top = Math.max(slab + 50, h - Math.max(look.guardHMm, look.hMm));
  const levels = armLevels(n, spec?.heights ?? "stepped", Math.max(slab + 50, top * 0.45), top - Math.max(slab + 50, top * 0.45), spec?.stepHeightsMm);
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : -L / 2 + (i * L) / (n - 1);
    const x = along ? s : 0;
    const y = along ? 0 : s;
    b.parts.push(cyl(ROD_MM, levels[i] - slab, vec3(x, y, slab), metal));
    b.parts.push(cyl(Math.max(look.guardDMm, look.dMm) * 0.55, 6, vec3(x, y, levels[i]), metal));
    candleAs(b, x, y, levels[i] + 6, metal, look);
  }
  return b;
}

/** A hurricane glass round a candle: a tube OPEN at the top with a 3 mm wall and a floor, reaching a
 *  to the top of the piece, the flame inside it — a lathe, because a closed cylinder put a lid over the flame and the
 *  flame stood on it (QA CN-1). */
/** A wind guard's glass: clear, but enough of it to be seen (a hurricane at the window pane's 0.22
 *  was a ghost round the flame). */
const GUARD_GLASS: MaterialRef = { colour: "#eef5f9", kind: "glass", opacity: 0.34 };

function hurricane(R: number, h: number, at: Vec3): Part {
  const t = Math.min(3, R * 0.15);
  return lathe([
    { r: 0, z: 0 },
    { r: R, z: 0 },
    { r: R, z: h },
    { r: R - t, z: h },
    { r: R - t, z: t },
    { r: 0, z: t },
  ], at, GUARD_GLASS);
}

/** A candle at the size it really is. The plan draws a candelabrum's candles fat enough to see from
 *  above at 1:100 (item-symbol.tsx candleAt — up to a fifth of the piece across); in a room they
 *  are tapers, 2–3 cm across, or pillar candles in a glass sleeve. Seen on plan A in a browser
 *  (2026-10-23): a candelabrum of the plan's candles read as a bundle of drainpipes. */
export const TAPER_R_MM = 12;
export const PILLAR_R_MM = 40;
const real = (r: number, sleeve = false): number => Math.min(r, sleeve ? PILLAR_R_MM * 0.8 : TAPER_R_MM);

/** A turned foot under a stem: `R` wide at the floor, narrowing to the stem in 45 mm. */
function foot(b: ItemBuild, R: number, metal: MaterialRef) {
  b.parts.push(lathe([{ r: R, z: 0 }, { r: R, z: 8 }, { r: R * 0.6, z: 25 }, { r: R * 0.3, z: 45 }], vec3(0, 0, 0), metal));
}

/** An arm from the hub out to `p` at height `z`: a thin bar lying along its bearing — or, an S-arm
 *  (CandleSpec.armShape), a curve leaving the stem lower, dipping and rising into the candle's cup,
 *  a string of beads thick enough to read as one bar. */
function arm(b: ItemBuild, p: Point, z: number, material: MaterialRef, shape?: CandleSpec["armShape"]) {
  const len = Math.hypot(p.x, p.y);
  if (len < 1) return;
  if (shape === "s") {
    const N = Math.max(12, Math.min(48, Math.round(len / (ARM_MM * 0.5))));
    const z0 = z - len * 0.35;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const zs = z0 + (z - z0) * (s * s * (3 - 2 * s)) - len * 0.08 * Math.sin(2 * Math.PI * s);
      b.parts.push(sphere(ARM_MM * 0.75, vec3(p.x * s, p.y * s, zs), material));
    }
    return;
  }
  const deg = (Math.atan2(p.y, p.x) * 180) / Math.PI;
  b.parts.push(box(len, ARM_MM, ARM_MM, vec3(p.x / 2, p.y / 2, z - ARM_MM / 2), material, deg));
}

// ── the fallback ────────────────────────────────────────────────────────────────────────────────


// ── dispatch ────────────────────────────────────────────────────────────────────────────────────

const tagOf = (ctx: ItemContext, type: NodeTag["type"]): NodeTag => ctx.tag ?? (ctx.product ? { type, label: ctx.product.name } : { type });

/** The pictures that READ the base's body as their own shape rather than standing beside a solid of
 *  it (lib/catalog/body-profiles.ts says what it is for each): a chandelier's silhouette shapes its
 *  tiers and crystal, an arrangement's envelope carries its heads, a chuppah's is its roof's section
 *  — and, since 2026-11-13, a lamp's is its SHADE, a tree's its crown, a vase's the vessel in its own
 *  glass, a column's its shaft in its stone, a fountain's its basin with the water and the jet kept, a
 *  candlestick's its turned body under its candles, a round chair's or sofa's the pouf itself. Built
 *  as a solid as well, a profile was an opaque urn the size of the piece with the picture inside it
 *  (the user, 2026-11-08: "it doesn't look good in the 3D"); and for the four kinds that used to
 *  REPLACE their picture with that solid, a lamp was a matte cone with no light, a fountain a blue
 *  lump with no water (2026-11-13: "the צללית is not working well… like אהיל"). */
const PROFILE_IS_PICTURE: ReadonlySet<SymbolKind> = new Set<SymbolKind>(["chandelier", "flowers", "centerpiece", "chuppah", "lamp", "tree", "vase", "column", "fountain", "candlestick", "chair", "sofa"]);
/** The pictures laid along their own outline, whatever it is — never into a box (lib/catalog/
 *  picture-frame.ts): a bar and a banquette along their band, a pergola and a dance floor on theirs. */
const FOLLOWS_OUTLINE: ReadonlySet<SymbolKind> = new Set<SymbolKind>(["bar", "bench", "pergola", "dance-floor"]);
/** The pictures whose versions (SYMBOL_STYLES — a chesterfield sofa, a palm, a fluted column…) the
 *  ROOM does not build yet: each is one body in 3D whatever style the plan draws (a planned catalog
 *  round). The shape editor labels their tiles "plan only" rather than promising the 3D (SH-3, QA
 *  2026-11-20); the self-check below holds this list to the recipes, so a style built later says
 *  the label is stale. */
export const PLAN_ONLY_STYLES: ReadonlySet<SymbolKind> = new Set<SymbolKind>(["sofa", "tree", "column", "fountain", "arch"]);

/** A build moved by (dx, dy) in the item's frame — a picture standing in its first shape's box. */
function shifted(b: ItemBuild, dx: number, dy: number): ItemBuild {
  if (!dx && !dy) return b;
  const mv = (v: Vec3) => vec3(v.x + dx, v.y + dy, v.z);
  return {
    material: b.material,
    parts: b.parts.map((p) => ({ ...p, at: mv(p.at) })),
    instanced: b.instanced.map((r) => ({ ...r, at: { ...r.at, at: mv(r.at.at) } })),
    emitters: b.emitters.map((e) => ({ ...e, at: mv(e.at) })),
  };
}

/** A round thing turned to `profile` — fractions of its radius and height, an oval one stretched to
 *  its depth — in one material. */
function turnedPart(ctx: ItemContext, profile: readonly { r: number; z: number }[], material: MaterialRef, heightMm = ctx.heightMm): Part {
  const part: Part = { shape: "lathe", profile: revolveProfileMm(profile, ctx.widthMm / 2, Math.max(10, heightMm)), at: vec3(0, 0, 0), segments: 32, material };
  if (ctx.widthMm > 0 && Math.abs(ctx.depthMm - ctx.widthMm) > 1) part.scaleY = ctx.depthMm / ctx.widthMm;
  return part;
}

/** The material the shapes' own bodies are built in: the item's tone, flat. */
const ownMaterial = (ctx: ItemContext): MaterialRef => ({ colour: ctx.tone, kind: "matte" });

/** The body of one placed item of `kind` (null = no picture: the fallback). A row whose shapes carry
 *  their own bodies (lib/element hasOwnBody — a part at its own height, a round shape with a
 *  profile, an outline-only shape) COMBINES them with its category's picture: the recipe draws the
 *  picture on the footprint, and what the shapes said about themselves is built beside it by the
 *  element model (element-body.ts ownBodyParts — a shelf a metre up, a raised tier on a stand). For
 *  the kinds in PROFILE_IS_PICTURE the base's body is the picture's own outline, read by its recipe
 *  (ItemContext.profile), and nothing is added for it. The bar keeps its recipe, which honours a back
 *  piece's own height itself (floor-kinds shapedBar). */
export function itemBody(kind: SymbolKind | null, ctx: ItemContext): ItemBuild {
  // A bar keeps its recipe (it honours its back pieces' own heights); a FRONT panel added to it
  // (backdrops S2) is the element model's, beside it — bar-draw leaves the panel out of the backs.
  if (kind === "bar" && ctx.product && hasFront(ctx.product)) {
    const picture = pictureBody(kind, ctx);
    const own = ownBodyParts(ctx.product, ctx.footprint, ownMaterial(ctx), { only: (p) => p.part.op.kind === "panel" });
    if (own) picture.parts.push(...own.parts);
    return picture;
  }
  if (kind === null) return ctx.product && hasOwnBody(ctx.product) ? fallbackBody(ctx) : pictureBody(kind, ctx);
  // FLOWERS FOLLOW THEIR SHAPES (./flower-cover.ts): a ring, an arc, a spiral, lines, several shapes
  // at their own heights, a wall drawn on the front plane — every one covered, none built as a box.
  if ((kind === "flowers" || kind === "centerpiece") && ctx.flowers?.form === "shape") return shapedFlowersBody(ctx, tagOf(ctx, "flowers"));
  // THE PICTURE STANDS IN ITS FIRST SHAPE'S BOX (lib/catalog/picture-frame.ts — the plan's own rule):
  // on a hexagon, a half-round, a drawn outline, or with other shapes added beside the first, the
  // recipe is handed that box and built where it stands; every other shape is the element model's.
  const frame = FOLLOWS_OUTLINE.has(kind) || (kind === "chuppah" && ctx.footprint.kind === "custom") ? null : pictureFrame(ctx.footprint);
  const framed = frame && !frame.plain ? frame : null;
  if (!ctx.product || kind === "bar" || (!framed && !hasOwnBody(ctx.product))) return pictureBody(kind, ctx);
  const pctx: ItemContext = framed ? { ...ctx, footprint: frameFootprint(framed), widthMm: framed.w, depthMm: framed.h } : ctx;
  const picture = framed ? shifted(pictureBody(kind, pctx), framed.x, framed.y) : pictureBody(kind, pctx);
  // What the shapes said about their own bodies (a shelf a metre up, a raised tier), every shape added
  // beside the first — and the first shape's own profile, unless the picture reads it itself.
  const own = ownBodyParts(ctx.product, ctx.footprint, ownMaterial(ctx), { baseProfileIsPicture: PROFILE_IS_PICTURE.has(kind), others: !!framed && ctx.footprint.kind === "multi" });
  if (own) picture.parts.push(...own.parts);
  return picture;
}

/** The category's picture, as it was always built. */
function pictureBody(kind: SymbolKind | null, ctx: ItemContext): ItemBuild {
  switch (kind) {
    case "candlestick":
      return candlestickBody(ctx);
    case "lamp":
      return lampBody(ctx);
    case "vase":
      return vaseBody(ctx);
    case "runner":
      return runnerBody(ctx);
    case "flowers":
      return flowersBody(ctx, false);
    case "centerpiece":
      return flowersBody(ctx, true);
    case "chair":
      // A round seat with a profile of its own is a pouf turned to it, in its fabric.
      if (ctx.profile && isRound(ctx.footprint)) return { ...make(clothMaterial(ctx.tone)), parts: [turnedPart(ctx, ctx.profile, clothMaterial(ctx.tone))] };
      return chairBody(ctx);
    case "sofa":
    case "bench":
    case "column":
    case "fountain":
    case "arch":
    case "gate":
    case "tree":
    case "bar":
    case "chuppah":
    case "stairs":
    case "ramp":
    case "pergola":
    case "billiard":
      return floorKindBody(kind, ctx);
    case "chandelier":
      return overheadKindBody(kind, ctx);
    // An LED screen: its dark box and the face that glows (./led.ts).
    case "screen":
      return screenBody(ctx);
    // A dance floor: a gloss slab of panels (./dance-floor.ts) — laid by build.ts as a rug is.
    case "dance-floor":
      return danceFloorBody(ctx);
    default:
      return fallbackBody(ctx);
  }
}

// ── chairs (item-symbol.tsx:729 chair, :911 pouf) ───────────────────────────────────────────────
//
// Every chair in the same frame: `w` across, `d` deep, its BACK along −y and the edge you sit down
// from along +y; the seat's top at seatHeight(h), the back up to h. The styles differ in what makes
// them recognisable — a Chiavari's posts and ladder rails, a cross-back's X, a ghost chair's clear
// shell, an armchair's arms — and agree on everything else, so a room laid in several reads as one
// set of chairs. Parts are kept few: a chair is instanced six hundred times.

/** One chair as parts in its own frame: back at −y, front (the table) at +y, seat at 450. */
export function chairParts(style: ChairStyle, widthMm: number, depthMm: number, heightMm: number, tone: string): { parts: Part[]; material: MaterialRef } {
  const w = Math.max(100, widthMm);
  const d = Math.max(100, depthMm);
  const h = Math.max(200, heightMm);
  if (style === "stool") return poufParts(w, d, h, tone);
  const m = Math.min(w, d);
  const seatZ = seatHeight(h);
  const seatBottom = seatZ - SEAT_THICK_MM;
  const body = matte(tone);
  const frame = matte(darkened(tone));
  const parts: Part[] = [];

  /** The seat: wider at the front (+y) than the back by `taper`, from `top` (its back edge) to
   *  `bottom` (its front edge) — the plan's seatPath (item-symbol.tsx:723), extruded. */
  const seat = (sw: number, top: number, bottom: number, taper: number, mat = body) => {
    const bw = (sw * (1 - taper)) / 2;
    const fw = sw / 2;
    parts.push(extrude([{ x: -bw, y: top }, { x: bw, y: top }, { x: fw, y: bottom }, { x: -fw, y: bottom }], SEAT_THICK_MM, vec3(0, 0, seatBottom), mat));
  };
  /** Four legs under the seat, `inset` in from the corners. */
  const legs = (inset: number, mat = frame, size = LEG_MM, to = seatBottom) => {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(box(size, size, to, vec3(sx * (w / 2 - inset), sy * (d / 2 - inset), 0), mat));
  };
  /** The back: a band `band` deep along the back edge, from the seat up to `top`. */
  const back = (bw: number, band: number, from: number, top: number, mat = body) => {
    parts.push(box(bw, band, top - from, vec3(0, -d / 2 + band / 2, from), mat));
  };

  switch (style) {
    case "chiavari": {
      // item-symbol.tsx:735: rail h·0.12 deep, posts r m·0.07 at ±0.42 w, the seat 0.96 w tapering 0.14.
      const rail = d * 0.12;
      const post = m * 0.07;
      seat(w * 0.96, -d / 2 + rail * 0.6, d / 2, 0.14);
      const py = -d / 2 + rail / 2;
      for (const sx of [-1, 1]) {
        parts.push(cyl(CHIAVARI_LEG_R_MM, seatBottom, vec3(sx * (w / 2 - 30), d / 2 - 30, 0), frame));
        // The back legs run on up as the posts, a ball at the top of each.
        parts.push(cyl(CHIAVARI_LEG_R_MM, h - post, vec3(sx * w * 0.42, py, 0), frame));
        parts.push(sphere(post, vec3(sx * w * 0.42, py, h - post), frame));
      }
      // The ladder: a top rail and two below it, between the posts.
      parts.push(box(w * 0.84, rail * 0.6, 22, vec3(0, py, h - post - 22), frame));
      for (const f of [1 / 3, 2 / 3]) parts.push(box(w * 0.84, rail * 0.4, 14, vec3(0, py, seatZ + (h - post - 22 - seatZ) * f), frame));
      break;
    }
    case "crossback": {
      // item-symbol.tsx:754: back h·0.16, the seat tapering 0.06, the X between ±0.36 w.
      const band = d * 0.16;
      seat(w, -d / 2 + band * 0.7, d / 2, 0.06);
      const py = -d / 2 + band / 2;
      for (const sx of [-1, 1]) {
        parts.push(box(LEG_MM, LEG_MM, seatBottom, vec3(sx * (w / 2 - 30), d / 2 - 30, 0), frame));
        parts.push(box(28, 28, h, vec3(sx * (w / 2 - 14), py, 0), frame));
      }
      const z0 = seatZ + 64;
      const z1 = h - 30;
      parts.push(box(w, band * 0.5, 30, vec3(0, py, z1), frame));
      parts.push(box(w, band * 0.5, 24, vec3(0, py, seatZ + 40), frame));
      // The X: a part has no tilt, so each diagonal is a short run of stepped bars.
      const steps = 5;
      const dx = (w * 0.72) / steps;
      const dz = (z1 - z0) / steps;
      for (let i = 0; i < steps; i++) {
        for (const sx of [-1, 1]) parts.push(box(dx + 6, band * 0.35, dz + 6, vec3(sx * (-w * 0.36 + dx * (i + 0.5)), py, z0 + dz * i), frame));
      }
      break;
    }
    case "ghost": {
      // item-symbol.tsx:772: clear polycarbonate — the shell a tint you see the floor through; back h·0.18.
      const clear: MaterialRef = { colour: tone, kind: "glass", opacity: 0.35 };
      const band = d * 0.18;
      seat(w, -d / 2 + band * 0.6, d / 2, 0.08, clear);
      back(w * 0.92, band, seatZ, h, clear);
      legs(30, clear);
      return { parts, material: clear };
    }
    case "folding": {
      // item-symbol.tsx:786: a slatted seat, a back h·0.12 standing clear of it by h·0.06.
      const band = d * 0.12;
      const top = -d / 2 + band + d * 0.06;
      const run = d / 2 - top;
      const n = 4;
      for (let i = 0; i < n; i++) parts.push(box(w, run / n - 6, 24, vec3(0, top + (run * (i + 0.5)) / n, seatZ - 24), body));
      const py = -d / 2 + band / 2;
      for (const sx of [-1, 1]) {
        parts.push(box(20, 20, seatZ - 24, vec3(sx * (w / 2 - 10), d / 2 - 20, 0), frame));
        parts.push(box(20, 20, h, vec3(sx * (w / 2 - 10), py, 0), frame));
      }
      const panel = (h - seatZ) * 0.42;
      parts.push(box(w, band, panel, vec3(0, py, h - panel), body));
      break;
    }
    case "armchair": {
      // item-symbol.tsx:805: a deep back h·0.24, an arm w·0.15 each side to 0.65 h, the cushion between.
      const band = d * 0.24;
      const armW = w * 0.15;
      const feet = 60;
      legs(40, frame, LEG_MM, feet);
      parts.push(box(w, d, seatZ - feet, vec3(0, 0, feet), body));
      back(w, band, seatZ, h);
      const armLen = d - band * 0.5;
      for (const sx of [-1, 1]) parts.push(box(armW, armLen, h * 0.65 - seatZ, vec3(sx * (w / 2 - armW / 2), band / 4, seatZ), body));
      const cw = w - armW * 2 - w * 0.04;
      const cd = d - band - d * 0.06;
      parts.push(box(cw, cd, 40, vec3(0, -d / 2 + band + d * 0.02 + cd / 2, seatZ), body));
      break;
    }
    case "bench": {
      // item-symbol.tsx:840: a long seat, no back, planks along its length — one per 120 mm of depth.
      const n = Math.max(2, Math.round(d / 120));
      for (let i = 0; i < n; i++) parts.push(box(w, d / n - 8, SEAT_THICK_MM, vec3(0, -d / 2 + (d * (i + 0.5)) / n, seatBottom), body));
      legs(40);
      break;
    }
    default: {
      // item-symbol.tsx:826: a dining chair — the seat tapering 0.08, a curved back h·0.17 deep.
      const band = d * 0.17;
      seat(w, -d / 2 + band * 0.55, d / 2, 0.08);
      back(w, band, seatZ, h);
      legs(30);
    }
  }
  return { parts, material: body };
}

/** A round seat — a stool, a pouf: the cushion with its rim and button (item-symbol.tsx:911). */
function poufParts(w: number, d: number, h: number, tone: string): { parts: Part[]; material: MaterialRef } {
  const r = Math.min(w, d) / 2;
  const seatZ = seatHeight(h);
  const body = matte(tone);
  return {
    material: body,
    parts: [
      cyl(r, seatZ - 20, vec3(0, 0, 0), body),
      // The cushion's rim, a little proud of the body.
      cyl(r * 1.03, 20, vec3(0, 0, seatZ - 20), body, r * 0.95),
      sphere(Math.min(w, d) * 0.05, vec3(0, 0, seatZ), matte(darkened(tone))),
    ],
  };
}

/** A chair to be instanced: same style, size and colour → one geometry for the whole room. */
export function chairRequest(style: ChairStyle, widthMm: number, depthMm: number, heightMm: number, tone: string, at: Transform, tag: NodeTag): InstanceRequest {
  const { parts, material } = chairParts(style, widthMm, depthMm, heightMm, tone);
  return { key: `chair:${style}:${tone}:${Math.round(widthMm)}x${Math.round(depthMm)}x${Math.round(heightMm)}`, parts, material, tag, at, castShadow: false };
}

/** A chair standing on its own: one instance of its style at the item's origin, facing +y like
 *  every chair; a round footprint is a pouf (item-symbol.tsx:148). */
function chairBody(ctx: ItemContext): ItemBuild {
  const style: ChairStyle = isRound(ctx.footprint) ? "stool" : (ctx.chairStyle ?? "dining");
  // TODO(B3): a block of chairs in rows (Placement.rows) — its footprint is the block's, far wider
  // than any chair; until chairRowsLayout lays it, it is the honest box.
  if (style !== "bench" && (ctx.widthMm > 1200 || ctx.depthMm > 1200)) return fallbackBody(ctx);
  const req = chairRequest(style, ctx.widthMm, ctx.depthMm, ctx.heightMm, ctx.tone, transform(vec3(0, 0, 0)), tagOf(ctx, "chair"));
  return { parts: [], material: req.material, instanced: [req], emitters: [] };
}

// ── candlesticks (item-symbol.tsx:318 candlestick) ──────────────────────────────────────────────

/** A candle piece in its style, or by its footprint: a long piece is a row of candles on a bar,
 *  anything else its candles round a stem (item-symbol.tsx:318–343). `count` is the row's arms. */
function candlestickBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const n = Math.max(1, Math.round(ctx.count));
  const round = isRound(ctx.footprint);
  const long = !round && Math.max(w, d) / Math.min(w, d) >= 1.8;
  const style = isCandleStyle(ctx.drawStyle) ? ctx.drawStyle : long ? "row" : "ring";
  // A turned body of its own (ItemContext.profile): the candlestick itself in its metal or crystal,
  // its candles standing on it — never a solid beside the recipe's stem and foot.
  // The spec's candles, guards, heights and crystal (lib/catalog/candles.ts); none = the old candles.
  const o: CandleOpts = { look: candleLook(ctx.candles, style === "sleeves"), spec: ctx.candles };
  if (ctx.profile && round && (style === "ring" || style === "sleeves" || style === "tiered")) return turnedCandlestick(ctx, n, style === "sleeves", o);
  switch (style) {
    case "row":
      return candleRow(w, d, h, n, long, false, tone, ctx.material, o);
    case "sleeves":
      return long ? candleRow(w, d, h, n, long, true, tone, ctx.material, o) : candleRing(w, d, h, n, true, tone, ctx.material, o);
    case "tiered":
      return candleTiers(w, d, h, n, tone, ctx.material, o);
    case "rods":
      return candleRods(ctx, n);
    case "cluster":
      return glassCluster(w, d, h, n, "pillar", tone);
    case "floating":
      return glassCluster(w, d, h, n, "float", tone);
    case "powder":
      return glassCluster(w, d, h, n, "powder", tone);
    case "pillars":
      return pillarTray(ctx, n, long);
    case "lantern":
      return lanterns(w, d, h, n, long, tone);
    case "fire":
      return fireBurner(ctx);
    default:
      return candleRing(w, d, h, n, false, tone, ctx.material, o);
  }
}

/** A candlestick TURNED to its own profile (lib/catalog/body-profiles.ts): the body a lathe over the
 *  lower 0.78 of its height, in the piece's metal or crystal; one candle standing on its top — or,
 *  for a candelabrum, its candles on a ring of arms springing from the top of the body, a centre one
 *  on an odd count. */
function turnedCandlestick(ctx: ItemContext, n: number, sleeves: boolean, o?: CandleOpts): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const R = Math.min(w, d) / 2;
  const metal = frameOf(tone, ctx.material);
  const b = make(metal);
  const bodyH = h * 0.78;
  b.parts.push(turnedPart(ctx, ctx.profile!, metal, bodyH));
  if (n <= 1) {
    candle(b, 0, 0, Math.min(R * (sleeves ? 0.32 : 0.5), PILLAR_R_MM), bodyH, h, metal, sleeves, FLAME, o?.look);
    return b;
  }
  const ring = n % 2 === 1 ? n - 1 : n;
  const reach = R * (sleeves ? 0.62 : 0.68);
  const r = Math.min(R * 0.21, ((Math.PI * reach) / ring) * 0.55) / (sleeves ? 1.6 : 1);
  const armZ = bodyH * 0.92;
  const arms = armMaterial(tone, ctx.material);
  for (let i = 0; i < ring; i++) {
    const p = polar(reach, -90 + (i * 360) / ring);
    arm(b, p, armZ, arms, o?.spec?.armShape);
    candle(b, p.x, p.y, real(r, sleeves), armZ, h * 0.95, metal, sleeves, FLAME, o?.look);
  }
  if (n % 2 === 1) candle(b, 0, 0, real(r * 0.95, sleeves), bodyH, h, metal, sleeves, FLAME, o?.look);
  return b;
}

/** Candles round a central stem, joined to it by its arms, a centre candle on an odd count
 *  (item-symbol.tsx:392 candleRing): reach 0.68 R (0.62 in sleeves), candle r = min(0.21 R,
 *  0.55 of the ring's pitch), the hub 0.2 R. The arms stand at 0.55 h; the ring's candles reach
 *  0.95 h and the centre one crowns it at h. */
function candleRing(w: number, d: number, h: number, n: number, sleeves: boolean, tone: string, material?: Material, o?: CandleOpts): ItemBuild {
  const R = Math.min(w, d) / 2;
  const metal = frameOf(tone, material);
  const b = make(metal);
  if (n <= 1) {
    // item-symbol.tsx:395: a foot 0.92 R wide and one candle 0.5 R (0.32 R in its sleeve).
    b.parts.push(cyl(R * 0.92, 15, vec3(0, 0, 0), metal));
    candle(b, 0, 0, Math.min(R * (sleeves ? 0.32 : 0.5), PILLAR_R_MM), 15, h, metal, sleeves, FLAME, o?.look);
    return b;
  }
  const ring = n % 2 === 1 ? n - 1 : n;
  const reach = R * (sleeves ? 0.62 : 0.68);
  const r = Math.min(R * 0.21, ((Math.PI * reach) / ring) * 0.55) / (sleeves ? 1.6 : 1);
  const armZ = h * 0.55;
  foot(b, R * 0.4, metal);
  b.parts.push(cyl(Math.max(8, R * 0.07), armZ, vec3(0, 0, 0), metal));
  b.parts.push(cyl(R * 0.2, 30, vec3(0, 0, armZ - 15), metal));
  const arms = armMaterial(tone, material);
  for (let i = 0; i < ring; i++) {
    const p = polar(reach, -90 + (i * 360) / ring);
    arm(b, p, armZ, arms, o?.spec?.armShape);
    candle(b, p.x, p.y, real(r, sleeves), armZ, h * 0.95, metal, sleeves, FLAME, o?.look);
    // Crystal drops (CandleSpec.drops): between the arms, and — full — on a chain under each arm too.
    if (o?.spec?.drops && o.spec.drops !== "none") {
      const q = polar(reach * 0.85, -90 + ((i + 0.5) * 360) / ring);
      crystalDrop(b, q.x, q.y, armZ - 10, Math.max(8, R * 0.04), o.spec.drops === "full");
      if (o.spec.drops === "full") crystalDrop(b, p.x * 0.7, p.y * 0.7, armZ - 10, Math.max(8, R * 0.04), true);
    }
  }
  if (n % 2 === 1) candle(b, 0, 0, real(r * 0.95, sleeves), armZ + 15, h, metal, sleeves, FLAME, o?.look);
  return b;
}

/** A tall crystal piece in tiers (item-symbol.tsx:421 candleTiers): an outer ring of ceil(0.6·rest)
 *  candles at 0.76 R, an inner ring at 0.4 R turned half a step, one crowning the middle, crystal
 *  drops at 0.9 R between the outer arms. Under seven candles it is a ring. Outer arms at 0.42 h,
 *  inner at 0.58 h, the crown to h. */
function candleTiers(w: number, d: number, h: number, n: number, tone: string, material?: Material, o?: CandleOpts): ItemBuild {
  if (n < 7) return candleRing(w, d, h, n, false, tone, material, o);
  const R = Math.min(w, d) / 2;
  const metal = frameOf(tone, material);
  const arms = armMaterial(tone, material);
  const b = make(metal);
  const rest = n - 1;
  const outer = Math.ceil(rest * 0.6);
  const inner = rest - outer;
  const ro = Math.min(R * 0.13, ((Math.PI * R * 0.76) / outer) * 0.42);
  const ri = Math.min(R * 0.11, ((Math.PI * R * 0.4) / Math.max(1, inner)) * 0.42);
  const zOuter = h * 0.42;
  const zInner = h * 0.58;
  foot(b, R * 0.4, metal);
  b.parts.push(cyl(Math.max(8, R * 0.06), zInner + 20, vec3(0, 0, 0), metal));
  b.parts.push(cyl(R * 0.16, 30, vec3(0, 0, zInner - 15), metal));
  for (let i = 0; i < outer; i++) {
    const p = polar(R * 0.76, -90 + (i * 360) / outer);
    arm(b, p, zOuter, arms, o?.spec?.armShape);
    candle(b, p.x, p.y, real(ro), zOuter, h * 0.74, metal, false, FLAME, o?.look);
    // A crystal drop hanging between the arms — none, or full chains, when the spec says so.
    const q = polar(R * 0.9, -90 + ((i + 0.5) * 360) / outer);
    const drops = o?.spec?.drops ?? "some";
    if (drops === "some") b.parts.push(sphere(R * 0.035, vec3(q.x, q.y, zOuter - h * 0.08), GLASS));
    else if (drops === "full") {
      crystalDrop(b, q.x, q.y, zOuter - 10, Math.max(8, R * 0.035), true);
      crystalDrop(b, p.x, p.y, zOuter - 10, Math.max(8, R * 0.03), true);
    }
  }
  for (let i = 0; i < inner; i++) {
    const p = polar(R * 0.4, -90 + ((i + 0.5) * 360) / inner);
    arm(b, p, zInner, arms, o?.spec?.armShape);
    candle(b, p.x, p.y, real(ri), zInner, h * 0.9, metal, false, FLAME, o?.look);
  }
  candle(b, 0, 0, real(ro), zInner + 20, h, metal, false, FLAME, o?.look);
  return b;
}

/** Candles in a line on a bar (item-symbol.tsx:375 candleRow): r = min(0.34 D, L/(2.3 n)) — 0.2 D
 *  and L/(3.8 n) in sleeves — over 0.84 L (0.78), the bar 0.24 D deep on a long piece, else
 *  min(0.12 D, 0.05 L) on a round foot min(0.36 D, 0.16 L). The bar stands at 0.5 h. */
function candleRow(w: number, d: number, h: number, n: number, long: boolean, sleeves: boolean, tone: string, material?: Material, o?: CandleOpts): ItemBuild {
  return along(w, d, (L, D) => {
    const metal = frameOf(tone, material);
    const b = make(metal);
    const r = Math.min(D * (sleeves ? 0.2 : 0.34), L / (n * (sleeves ? 3.8 : 2.3)));
    const span = L * (sleeves ? 0.78 : 0.84);
    const bar = long ? D * 0.24 : Math.min(D * 0.12, L * 0.05);
    const barZ = h * 0.5;
    const barT = Math.max(10, bar * 0.5);
    if (long) {
      for (const sx of [-1, 1]) b.parts.push(cyl(Math.max(8, bar * 0.45), barZ, vec3(sx * L * 0.32, 0, 0), metal));
    } else {
      foot(b, Math.min(D * 0.36, L * 0.16), metal);
      b.parts.push(cyl(Math.max(8, bar * 0.4), barZ, vec3(0, 0, 0), metal));
    }
    b.parts.push(box(L * 0.92, bar, barT, vec3(0, 0, barZ - barT / 2), metal));
    // The arms' heights (CandleSpec.heights): each candle on a post of its own up from the bar.
    const levels = armLevels(n, o?.spec?.heights, barZ, h * 0.3, o?.spec?.stepHeightsMm);
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -span / 2 + (i * span) / (n - 1);
      if (levels[i] > barZ + 1) b.parts.push(cyl(Math.max(6, bar * 0.25), levels[i] - barZ, vec3(x, 0, barZ), metal));
      candle(b, x, 0, real(r, sleeves), levels[i], h, metal, sleeves, FLAME, o?.look);
    }
    return b;
  });
}

/** Glass cylinders packed in a cluster, each holding its candle (item-symbol.tsx:502 glassCluster,
 *  :455 packCircles): a pillar candle 0.56 r inside, a floating candle on water filling 0.86 r,
 *  or powdered wax round a wick. The biggest glass is the tallest. */
function glassCluster(w: number, d: number, h: number, n: number, fill: "pillar" | "float" | "powder", tone: string): ItemBuild {
  const m = Math.min(w, d) / 2;
  const glass = glassMaterial(tone);
  const metal = metalMaterial(tone);
  const b = make(glass);
  const pack = packCircles(n);
  const maxR = Math.max(...pack.map((g) => g.r));
  for (const g of pack) {
    const x = (g.x * w) / 2;
    const y = (g.y * d) / 2;
    const r = g.r * m;
    const gh = h * (0.55 + 0.45 * (g.r / maxR));
    b.parts.push(cyl(r, gh, vec3(x, y, 0), glass));
    if (fill === "pillar") {
      candle(b, x, y, r * 0.56, 12, gh * 0.9, metal);
    } else if (fill === "float") {
      const water = gh * 0.62;
      b.parts.push(cyl(r * 0.86, 8, vec3(x, y, water - 8), { colour: WATER, kind: "water", opacity: 0.75 }));
      b.parts.push(cyl(r * 0.4, 18, vec3(x, y, water), WAX_M));
      b.emitters.push({ at: vec3(x, y, water + 18), radiusMm: FLAME_R_MM, colour: ENVELOPE.flame, strength: FLAME });
    } else {
      b.parts.push(cyl(r * 0.86, gh * 0.55 - 10, vec3(x, y, 10), matte(POWDER)));
      b.emitters.push({ at: vec3(x, y, gh * 0.55), radiusMm: FLAME_R_MM, colour: ENVELOPE.flame, strength: FLAME });
    }
  }
  return b;
}

/** Pillar candles standing on a tray that is the whole footprint, 20 high with a lip at 0.88 of it
 *  (item-symbol.tsx:547 pillarTray): in a row r = min(0.3 D, 0.8 L/(2.3 n)) over 0.8 L; packed,
 *  packCircles at 0.74 of the box. */
function pillarTray(ctx: ItemContext, n: number, long: boolean): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone, footprint } = ctx;
  const tray = glossMaterial(tone);
  const b = make(tray);
  for (const outline of footprintOutlines(footprint)) b.parts.push({ shape: "extrude", outline, h: PLATE_MM, at: vec3(0, 0, 0) });
  const R = Math.min(w, d) / 2;
  if (footprint.kind === "circle") {
    b.parts.push(lathe([{ r: R * 0.88, z: PLATE_MM }, { r: R, z: PLATE_MM }, { r: R, z: PLATE_MM + 12 }, { r: R * 0.88, z: PLATE_MM + 12 }], vec3(0, 0, 0), tray));
  } else if (footprint.kind === "rect") {
    const lip = Math.min(w, d) * 0.06;
    for (const sx of [-1, 1]) b.parts.push(box(lip, d, 12, vec3(sx * (w / 2 - lip / 2), 0, PLATE_MM), tray));
    for (const sy of [-1, 1]) b.parts.push(box(w, lip, 12, vec3(0, sy * (d / 2 - lip / 2), PLATE_MM), tray));
  }
  const metal = metalMaterial(tone);
  const pillar = (into: ItemBuild, x: number, y: number, r: number, top: number) => {
    into.parts.push(cyl(r, top - PLATE_MM, vec3(x, y, PLATE_MM), WAX_M));
    into.emitters.push({ at: vec3(x, y, top), radiusMm: FLAME_R_MM, colour: ENVELOPE.flame, strength: FLAME });
  };
  if (long) {
    return merge(
      b,
      along(w, d, (L, D) => {
        const row = make(metal);
        const r = Math.min(D * 0.3, (L * 0.8) / (n * 2.3));
        const span = L * 0.8 - r * 2;
        for (let i = 0; i < n; i++) pillar(row, n === 1 ? 0 : -span / 2 + (i * span) / (n - 1), 0, r, h);
        return row;
      }),
    );
  }
  const pack = packCircles(n);
  const maxR = Math.max(...pack.map((g) => g.r));
  for (const g of pack) pillar(b, ((g.x * w) / 2) * 0.74, ((g.y * d) / 2) * 0.74, g.r * R * 0.74, h * (0.7 + 0.3 * (g.r / maxR)));
  return b;
}

/** A lantern: a square base, a post 0.12 s at each corner, the glass inside, a roof and its peak,
 *  the candle 0.16 s it holds (item-symbol.tsx:588 lanterns); s = 0.94 of the box, or in a row
 *  min(0.94 D, 0.86 L/n). */
function lanterns(w: number, d: number, h: number, n: number, long: boolean, tone: string): ItemBuild {
  const metal = metalMaterial(tone);
  const one = (b: ItemBuild, x: number, s: number) => {
    const base = Math.max(10, h * 0.06);
    const roofZ = h * 0.85;
    b.parts.push(box(s, s, base, vec3(x, 0, 0), metal));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.parts.push(box(s * 0.12, s * 0.12, roofZ - base, vec3(x + sx * s * 0.39, sy * s * 0.39, base), metal));
    b.parts.push(box(s * 0.78, s * 0.78, roofZ - base, vec3(x, 0, base), GLASS));
    b.parts.push(box(s, s, base, vec3(x, 0, roofZ), metal));
    // The peak: a four-sided cone.
    b.parts.push(cyl(s * 0.62, Math.max(10, h - roofZ - base), vec3(x, 0, roofZ + base), metal, 0, 4));
    candle(b, x, 0, s * 0.16, base, base + (roofZ - base) * 0.5, metal);
  };
  if (!long) {
    const b = make(metal);
    one(b, 0, Math.min(w, d) * 0.94);
    return b;
  }
  return along(w, d, (L, D) => {
    const b = make(metal);
    const k = Math.max(1, n);
    const s = Math.min(D * 0.94, (L / k) * 0.86);
    const span = L - s;
    for (let i = 0; i < k; i++) one(b, k <= 1 ? 0 : -span / 2 + (i * span) / (k - 1), s);
    return b;
  });
}

/** A fire feature (item-symbol.tsx:608 fireBurner): a bowl with its burner 0.72 R across and a ring
 *  of flames at 0.46 R — one per ~90 mm of that ring, six at least; or a trough down a long piece
 *  with a slot 0.4 D wide and a tongue of flame every 130 mm along it. Its count is not candles. */
function fireBurner(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, tone } = ctx;
  const round = isRound(ctx.footprint);
  const spec = ctx.fire;
  const dark = matte(BURNER);
  // A LOW body (lib/catalog/fire.ts, §5.4 — the row's height is the flames', never one block that
  // tall), in its material — concrete unless the row says, its own colour when it has one.
  const own = hexOf(ctx.resolved?.swatch) ?? hexOf(ctx.product?.appearance?.style?.fill);
  const body = ctx.material ? materialRefOf(ctx.material, tone) : materialRefOf("concrete", own);
  const tag = tagOf(ctx, "item");
  const build = (L: number, D: number): ItemBuild => {
    const lay = fireLayout(L, D, round, spec);
    const H = lay.bodyH;
    const b = make(body);
    if (round) {
      const R = L / 2;
      b.parts.push(cyl(R, H, vec3(0, 0, 0), body));
      b.parts.push(cyl(lay.slot.halfL, 8, vec3(0, 0, H - 4), dark));
      const k = Math.max(6, Math.round((2 * Math.PI * lay.slot.halfL * 0.8) / 90));
      for (let i = 0; i < k; i++) {
        const q = polar(lay.slot.halfL * 0.8, (i * 360) / k);
        b.emitters.push({ at: vec3(q.x, q.y, H + 10), radiusMm: FLAME_R_MM * 1.4, colour: ENVELOPE.flame, strength: FIRE });
      }
      if (lay.guard) b.parts.push(hurricane(lay.slot.halfL + 40, 260, vec3(0, 0, H)));
    } else {
      b.parts.push(box(L, D, H, vec3(0, 0, 0), body));
      b.parts.push(box(lay.slot.halfL * 2, lay.slot.halfD * 2, 8, vec3(0, 0, H - 4), dark));
      const slotL = lay.slot.halfL * 2;
      const k = Math.max(3, Math.floor(slotL / 130));
      const step = slotL / k;
      for (let i = 0; i < k; i++)
        b.emitters.push({ at: vec3(-slotL / 2 + step * (i + 0.5), (i % 2 ? 1 : -1) * D * 0.03, H + 10), radiusMm: Math.max(FLAME_R_MM, step * (i % 3 === 1 ? 0.48 : 0.4)), colour: ENVELOPE.flame, strength: FIRE });
      if (lay.guard) {
        // A glass wind screen round the burner: four panes standing on the trough's top.
        const gx = lay.slot.halfL + 40;
        const gy = lay.slot.halfD + 40;
        for (const sy of [-1, 1]) b.parts.push(box(gx * 2, 6, 260, vec3(0, sy * gy, H), GUARD_GLASS));
        for (const sx of [-1, 1]) b.parts.push(box(6, gy * 2, 260, vec3(sx * gx, 0, H), GUARD_GLASS));
      }
    }
    // The pebbles — one shared pebble, instanced, each at its own size: half sunk in the trough's
    // bed, or lying on the table round it.
    const base = Math.max(4, (spec?.stoneSizeMm ?? 25) / 2);
    const colour = lay.colour.toLowerCase();
    const pebble: Part[] = [lathe([{ r: 0, z: 0 }, { r: base * 0.82, z: base * 0.12 }, { r: base, z: base * 0.38 }, { r: base * 0.78, z: base * 0.7 }, { r: 0, z: base * 0.8 }], vec3(0, 0, 0))];
    const onTrough = (x: number, y: number) => (round ? Math.hypot(x, y) <= L / 2 : Math.abs(x) <= L / 2 && Math.abs(y) <= D / 2);
    lay.stones.forEach((st, i) => {
      const z = onTrough(st.x, st.y) ? H - st.r * 0.25 : 0;
      b.instanced.push({ key: `pebble:${colour}:${Math.round(base)}`, parts: pebble, material: glossMaterial(colour), tag, castShadow: false, at: { at: vec3(st.x, st.y, z), rotationDeg: (i * 47) % 360, scale: st.r / base } });
    });
    return b;
  };
  return round ? build(Math.min(w, d), Math.min(w, d)) : along(w, d, build);
}

// ── lamp, vase, runner (item-symbol.tsx:647, :670, :1244) ───────────────────────────────────────

/** A table lamp: a SHADE turned in its cloth (a globe in its glass), lit from inside, on a base.
 *
 *  With no profile of its own, the shade is its STYLE's (lib/catalog/body-profiles.ts lampShadeOf —
 *  the plan's four, built here since 2026-11-13: the room used to build the first whatever was
 *  picked), the one it always was when none is picked: from its bottom rim (the whole footprint) at
 *  0.55 h to a top rim 0.64 of it — on a turned foot and a stem 0.05 of the box.
 *
 *  With a profile (ItemContext.profile, the editor's ״צורת האהיל״) the profile is the WHOLE lamp from
 *  the side (lampParts): below its neck the base, turned in metal as it was drawn; above it the shade.
 *  A profile with no neck — a cone, a lantern — is a shade standing on the table. Before that round a
 *  lamp with a profile was one matte solid with no light in it.
 *
 *  An oval shade is stretched to its depth; a square one is lathed round. A finial 0.07 R on an open
 *  top; and the bulb inside, which is what it is for. */
function lampBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const round = isRound(ctx.footprint);
  const R = round ? w / 2 : Math.min(w, d) / 2;
  const own = ctx.profile ? lampParts(cleanRevolve(ctx.profile)) : null;
  const glass = !own && ctx.drawStyle === "globe";
  const shade = glass ? glassMaterial(tone) : clothMaterial(tone);
  const metal = metalMaterial(darkened(tone));
  const b = make(shade);
  const scaleY = round && w > 0 && Math.abs(d - w) > 1 ? d / w : undefined;
  const turnedIn = (pts: readonly { r: number; z: number }[], material: MaterialRef): Part => ({ shape: "lathe", profile: pts.map((p) => ({ r: p.r * R, z: p.z * h })), at: vec3(0, 0, 0), material, ...(scaleY ? { scaleY } : {}) });
  const shadePts = own ? own.shade : lampShadeOf(ctx.drawStyle);
  b.parts.push(turnedIn(shadePts, shade));
  const shadeZ = Math.min(...shadePts.map((p) => p.z)) * h;
  const top = shadePts[shadePts.length - 1];
  if (own) {
    // Its own base, as drawn — nothing under a shade that stands on the table.
    if (own.base.length >= 2) b.parts.push(turnedIn(own.base, metal));
  } else {
    b.parts.push(lathe([{ r: R * 0.3, z: 0 }, { r: R * 0.3, z: 12 }, { r: R * 0.14, z: 30 }, { r: R * 0.07, z: 50 }], vec3(0, 0, 0), metal));
    b.parts.push(cyl(Math.max(6, Math.min(w, d) * 0.05), shadeZ - 50, vec3(0, 0, 50), metal));
  }
  if (top.r > 0.05) b.parts.push(sphere(R * 0.07, vec3(0, 0, h), metal));
  b.emitters.push({ at: vec3(0, 0, shadeZ + (h - shadeZ) * 0.4), radiusMm: R * 0.3, colour: ENVELOPE.bulb, strength: 1 });
  return b;
}

/** What shape a vessel is. A vase row carries no style, so its NAME is read where it says (the
 *  way lib/catalog/flower-kinds.ts reads a flower and isRunner a runner): "מרטיני" is a martini on a
 *  stem, "צילינדר" a straight cylinder, "קערה" a bowl — on a foot when it says "רגל". Otherwise
 *  the proportions: very slender is a cylinder, squat is a bowl, anything else the plan's urn. */
export type VesselForm = "trumpet" | "cylinder" | "bowl" | "pedestal" | "vase" | "urn" | "plinth";

/** The vase styles the plan draws (SYMBOL_STYLES.vase) — each its own body in the room too (bug
 *  round 2026-11-21 §5.2, QA VS-2: every style built the same cone). */
const VASE_STYLE_FORMS: readonly VesselForm[] = ["vase", "cylinder", "trumpet", "urn", "pedestal", "bowl"];
const VESSEL_WORDS: [VesselForm, RegExp][] = [
  // A PLINTH — a stand the flowers are set ON, not a vessel they stand in (2026-11-13, the user's
  // aisle photograph: a mound of roses on every white box): a solid block of its own footprint.
  ["plinth", /פודיום|מעמד|קובי+ה|סטנד|plinth|podium/i],
  ["trumpet", /מרטיני|חצוצר|martini|trumpet/i],
  ["cylinder", /צילינד|גליל|cylinder/i],
  ["pedestal", /(קער|bowl).*(רגל|foot|pedestal)|(רגל|foot|pedestal).*(קער|bowl)/i],
  ["bowl", /קער|bowl/i],
];
export function vesselForm(name: string | undefined, w: number, d: number, h: number): VesselForm {
  for (const [form, words] of VESSEL_WORDS) if (name && words.test(name)) return form;
  const wide = Math.max(w, d);
  if (h >= 5 * wide) return "cylinder";
  if (h <= 0.6 * wide) return "bowl";
  // The plain tapered vase every nameless one was (called "urn" before the styles were built).
  return "vase";
}

/** A vessel's form: the STYLE picked in the editor (the plan's tiles), else the guess by its name and
 *  proportions — so a row with no style builds exactly what it always did. */
export function vesselFormOf(style: string | undefined, name: string | undefined, w: number, d: number, h: number): VesselForm {
  return style && (VASE_STYLE_FORMS as readonly string[]).includes(style) ? (style as VesselForm) : vesselForm(name, w, d, h);
}

/** A metal shade by its name — gold, silver, nickel, copper, brass (the catalog's variants say so). */
const METAL_SHADE = /זהב|כסף|ניקל|נחושת|פליז|רוז גולד|gold|silver|nickel|copper|brass|chrome/i;

/** Each form's outer profile, then the inside from the opening down (so it reads hollow), as
 *  shares of the radius R and the height h. */
const VESSEL_PROFILES: Record<VesselForm, { outer: [number, number][]; inner: [number, number][] }> = {
  // A martini: a round foot, a slim stem with a knot, a cone flaring to the rim.
  trumpet: {
    outer: [[0, 0], [0.62, 0], [0.62, 0.015], [0.2, 0.04], [0.09, 0.07], [0.07, 0.4], [0.12, 0.43], [0.08, 0.47], [0.3, 0.6], [0.62, 0.8], [1, 1]],
    inner: [[0.94, 1], [0.58, 0.8], [0.25, 0.6], [0.08, 0.5], [0, 0.5]],
  },
  cylinder: {
    outer: [[0, 0], [1, 0], [1, 1]],
    inner: [[0.9, 1], [0.9, 0.03], [0, 0.03]],
  },
  // A bowl on a pedestal: a foot, a short stem, a shallow bowl.
  pedestal: {
    outer: [[0, 0], [0.5, 0], [0.5, 0.05], [0.16, 0.16], [0.11, 0.34], [0.22, 0.42], [0.72, 0.62], [0.96, 0.88], [1, 1]],
    inner: [[0.93, 1], [0.66, 0.66], [0.2, 0.5], [0, 0.5]],
  },
  bowl: {
    outer: [[0, 0], [0.45, 0], [0.78, 0.35], [0.96, 0.8], [1, 1]],
    inner: [[0.92, 1], [0.7, 0.4], [0, 0.15]],
  },
  // The plan's urn (item-symbol.tsx:670 vase): rim 1.0, opening 0.8, foot 0.32.
  vase: {
    outer: [[0.32, 0], [0.32, 0.04], [0.6, 0.3], [0.86, 0.7], [1, 1]],
    inner: [[0.8, 1], [0.68, 0.6], [0.28, 0.2], [0, 0.2]],
  },
  // A bellied jar on a foot, a narrow neck and a turned-out lip — the plan's "כד עם ידיות"; its two
  // handles are added by vaseBody (urnHandles).
  urn: {
    outer: [[0, 0], [0.42, 0], [0.42, 0.04], [0.36, 0.08], [0.72, 0.26], [0.98, 0.46], [0.9, 0.64], [0.58, 0.8], [0.5, 0.87], [0.62, 0.96], [0.68, 1]],
    inner: [[0.6, 1], [0.44, 0.88], [0.5, 0.8], [0.84, 0.64], [0.9, 0.46], [0.66, 0.28], [0, 0.18]],
  },
  // A round plinth: a closed drum (a square one is a box — vaseBody).
  plinth: {
    outer: [[0, 0], [1, 0], [1, 1], [0, 1]],
    inner: [],
  },
};

/** How far up a vessel the flowers set in it start, as a share of its height: just under the rim of
 *  a vase, and the very TOP of a plinth — they stand on it. The one number the table's dressing
 *  (./tables.ts) and a floor arrangement (./build.ts) both raise the flowers by. */
export function vesselRimShare(vessel: Pick<Product, "name" | "dimensions"> | undefined): number {
  if (!vessel) return 0;
  const d = vessel.dimensions;
  const w = d.diameterMm ?? d.widthMm ?? 0;
  return vesselForm(vessel.name, w, d.diameterMm ?? d.depthMm ?? w, d.heightMm ?? 0) === "plinth" ? 1 : 0.9;
}

/** A vessel: its form's profile (vesselForm) lathed on its width — an oval one stretched to its
 *  depth — outside and in. Glass when its tone is near-white, metal when its shade is a metal,
 *  glazed otherwise. */
function vaseBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const R = w / 2;
  const form = vesselFormOf(ctx.drawStyle, ctx.product?.name, w, d, h);
  const shade = ctx.resolved?.variant?.name ?? "";
  // A material the row (or its shade) says it is made of wins over the guess (bug round 2026-11-21 §4;
  // QA MT-1: a white vase was always CLEAR glass).
  const material = ctx.material ? materialRefOf(ctx.material, tone) : pale(tone) && !METAL_SHADE.test(shade) ? glassMaterial(tone) : METAL_SHADE.test(shade) ? metalMaterial(tone) : glossMaterial(tone);
  const b = make(material);
  const scaleY = w > 0 && Math.abs(d - w) > 1 ? d / w : undefined;
  const at = vec3(0, 0, 0);
  const shaped = (pts: [number, number][]): Part => ({ shape: "lathe", profile: pts.map(([r, z]) => ({ r: R * r, z: h * z })), at, segments: 32, ...(scaleY ? { scaleY } : {}) });
  // A vessel turned to its OWN profile (ItemContext.profile, the editor's ״צורת הכלי״): that outline
  // in the vessel's own glass, metal or glaze — and hollow, its inside a wall's thickness in from it.
  if (ctx.profile) {
    const outer = revolveProfileMm(ctx.profile, 1, 1).map((p): [number, number] => [p.r, p.z]);
    const inside = vesselInside(outer);
    b.parts.push(shaped(outer));
    if (inside.length) b.parts.push(shaped(inside));
    return b;
  }
  // A plinth is a solid block in its own colour — a box on a square footprint, a drum on a round one
  // — never glass: a white stand is white, not clear.
  if (form === "plinth") {
    const solid = make(ctx.material ? materialRefOf(ctx.material, tone) : METAL_SHADE.test(shade) ? metalMaterial(tone) : matte(tone));
    if (ctx.footprint.kind === "rect") solid.parts.push(box(w, d, h, at));
    else solid.parts.push(shaped(VESSEL_PROFILES.plinth.outer));
    return solid;
  }
  const { outer, inner } = VESSEL_PROFILES[form];
  b.parts.push(shaped(outer), shaped(inner));
  if (form === "urn") b.parts.push(...urnHandles(R, scaleY ?? 1, h));
  return b;
}

/** A jar's two handles, one each side: a loop out from the shoulder and back in under the lip, a
 *  string of overlapping beads thick enough to read as one bar — in the jar's own material. */
function urnHandles(R: number, scaleY: number, h: number): Part[] {
  const t = Math.max(5, R * 0.07);
  const from = { r: R * 0.94, z: h * 0.5 };
  const to = { r: R * 0.56, z: h * 0.84 };
  const reach = R * 0.3;
  const out: Part[] = [];
  const N = 32;
  for (const side of [1, -1])
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      // Out along a half loop: the radius swells by `reach` at the middle of the run up.
      const r = from.r + (to.r - from.r) * s + reach * Math.sin(Math.PI * s);
      const z = from.z + (to.z - from.z) * s;
      out.push(sphere(t, vec3(side * r, 0, z)));
    }
  return scaleY !== 1 ? out.map((p) => (p.shape === "sphere" ? { ...p, at: vec3(p.at.x, p.at.y * scaleY, p.at.z) } : p)) : out;
}

/** The inside of a vessel turned to `outer` (shares of R and h, bottom to top): from its opening down,
 *  a wall's thickness in from the outside, to a floor a little above its foot. A top that closes (a
 *  ball, a lid) has no opening, and no inside. */
export function vesselInside(outer: [number, number][]): [number, number][] {
  const WALL = 0.07;
  const top = outer[outer.length - 1];
  if (!top || top[0] <= WALL * 1.5) return [];
  const zLow = outer[0][1];
  const zTop = top[1];
  const floor = zLow + Math.max(0.04, (zTop - zLow) * 0.12);
  const inner: [number, number][] = [];
  for (let i = outer.length - 1; i >= 0; i--) {
    const [r, z] = outer[i];
    if (z <= floor) break;
    inner.push([Math.max(0.02, r - WALL), z]);
  }
  inner.push([Math.max(0.02, (inner[inner.length - 1]?.[0] ?? top[0]) * 0.6), floor], [0, floor]);
  return inner;
}

/** A table runner (item-symbol.tsx:1244 runner): a strip of fabric D wide along the long side,
 *  8 thick, coming to a point min(0.45 D, 120) at each end, a tassel past each point. */
function runnerBody(ctx: ItemContext): ItemBuild {
  const fabric = clothMaterial(ctx.tone);
  return along(ctx.widthMm, ctx.depthMm, (L, D) => {
    const b = make(fabric);
    const tip = Math.min(D * 0.45, 120);
    b.parts.push(box(Math.max(10, L - tip * 2), D, RUNNER_MM, vec3(0, 0, 0)));
    const point: Point[] = [{ x: -tip / 2, y: -D / 2 }, { x: tip / 2, y: 0 }, { x: -tip / 2, y: D / 2 }];
    b.parts.push(extrude(point, RUNNER_MM, vec3(L / 2 - tip / 2, 0, 0)));
    b.parts.push(extrude(point, RUNNER_MM, vec3(-L / 2 + tip / 2, 0, 0), undefined, 180));
    // Its contour (lib/catalog/border.ts), as the plan draws it: each band a flat ring on top of the
    // strip and its points, in its colour; the tassels kept unless it says no fringe, in the fringe's.
    const border = ctx.border;
    if (border) {
      const strip: Point[] = [{ x: -L / 2 + tip, y: -D / 2 }, { x: L / 2 - tip, y: -D / 2 }, { x: L / 2, y: 0 }, { x: L / 2 - tip, y: D / 2 }, { x: -L / 2 + tip, y: D / 2 }, { x: -L / 2, y: 0 }];
      for (const band of borderBands({ outline: strip }, border)) {
        b.parts.push({ shape: "extrude", outline: band.outer, ...(band.inner ? { holes: [band.inner] } : {}), h: RUNNER_BAND_MM, at: vec3(0, 0, RUNNER_MM), material: clothMaterial(hexOf(band.colour) ?? ctx.tone) });
      }
    }
    const tassel = Math.max(10, D * 0.05);
    const knot = border ? clothMaterial(hexOf(border.fringeColour ?? border.colour) ?? ctx.tone) : undefined;
    if (border?.fringe ?? true) for (const sx of [-1, 1]) b.parts.push(sphere(tassel, vec3(sx * (L / 2 + 14), 0, tassel), knot));
    return b;
  });
}

// ── flowers and centrepieces (item-symbol.tsx:133–146) ──────────────────────────────────────────

/** The spec of an arrangement that has no row behind it — the default mix in the item's tone at
 *  its size, as the plan's plainFlowers (item-symbol.tsx:300): kept per (form, size, tone) so the
 *  same object comes back and composeFlowers' memo holds. */
const plain = new Map<string, FlowerDrawSpec>();
function plainSpec(w: number, d: number, h: number, tone: string): FlowerDrawSpec {
  const form = defaultFlowerForm(h, w, d);
  const key = `${form}|${Math.round(w)}|${Math.round(d)}|${tone}`;
  let spec = plain.get(key);
  if (!spec) {
    if (plain.size > 400) plain.clear();
    spec = { form, w: Math.round(w), h: Math.round(d), lines: defaultMix(), shade: tone, seed: seedOf(key) };
    plain.set(key, spec);
  }
  return spec;
}

/** An arrangement's heads lifted into height (./flowers.ts); a centrepiece first stands them on
 *  its plate — a disc the footprint wide, 20 high (item-symbol.tsx:136–143). */
function flowersBody(ctx: ItemContext, plated: boolean): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const spec = ctx.flowers ?? plainSpec(w, d, h, tone);
  const tag = tagOf(ctx, "flowers");
  // A runner that FALLS off its table's end hangs to the floor: on a table that is the table's
  // height (ctx.standMm, ./tables.ts); set down anywhere else — the catalog's own 3D pane, the floor —
  // it is shown at a table's height, so the fall is seen and not buried.
  const afloat = spec.fall && spec.form === "runner" && ctx.standMm === undefined ? FALL_DROP_MM : 0;
  if (!plated) return afloat ? raise(flowerBuild(spec, h, tag, { dropMm: afloat }), afloat) : flowerBuild(spec, h, tag, { dropMm: ctx.standMm });
  const plate = make(glossMaterial(PLATE));
  if (isRound(ctx.footprint) && Math.abs(w - d) <= 1) plate.parts.push(cyl(w / 2, PLATE_MM, vec3(0, 0, 0)));
  else for (const outline of footprintOutlines(ctx.footprint)) plate.parts.push({ shape: "extrude", outline, h: PLATE_MM, at: vec3(0, 0, 0) });
  return merge(plate, raise(flowerBuild(spec, Math.max(40, h - PLATE_MM), tag, { dropMm: ctx.standMm === undefined ? undefined : ctx.standMm + PLATE_MM }), PLATE_MM));
}
