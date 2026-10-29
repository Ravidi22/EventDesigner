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
// Pure: no React, no three. `npx tsx lib/scene/items.ts` runs the self-check.
import type { Footprint } from "@/lib/studio/footprint";
import { footprintOutlines } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import type { Product } from "@/lib/catalog/types";
import type { Resolved } from "@/lib/studio/catalog-resolver";
import { type CandleStyle, type ChairStyle, type ChuppahStyle, type SymbolKind, isCandleStyle } from "@/lib/catalog/symbols";
import { type FlowerDrawSpec, darken, defaultFlowerForm, defaultMix, isPale, seedOf } from "@/lib/catalog/flower-draw";
import { DEFAULT_TONE, packCircles } from "@/components/item-symbol";
import type { PlacementClimb } from "@/lib/design-document/types";
import type { BenchLayout } from "@/lib/design-document/bench";
import { isMain } from "../self-check";
import { type InstanceRequest, type ItemBuild } from "./collect";
import { type ItemContext, fallbackBody } from "./item-context";
import { floorKindBody } from "./floor-kinds";
import { overheadKindBody } from "./overhead";

export { type ItemContext, fallbackBody } from "./item-context";
import { flowerBuild } from "./flowers";
import { applyTransform, compose, turn } from "./frame";
import { ENVELOPE, clothMaterial, glassMaterial, glossMaterial, metalMaterial } from "./materials";
import { type MaterialRef, type NodeTag, type Part, type Transform, type Vec3, transform, vec3 } from "./types";

// ── the constants the plan draws with ───────────────────────────────────────────────────────────

/** A pillar candle's wax (item-symbol.tsx:555), powdered wax (:531), the water in a floating
 *  candle's glass (:33), a burner's slot (:609), the plate under a centrepiece (:140). */
const WAX = "#fbf4e4";
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
const PLATE_MM = 20;
const RUNNER_MM = 8;
const FLAME_R_MM = 25;
const FLAME = 0.4;
const FIRE = 0.5;

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
const armMaterial = (tone: string): MaterialRef => (pale(tone) ? { colour: "#d6d2dd", kind: "glass", opacity: 0.5 } : metalMaterial(tone));

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
const frameOf = (tone: string): MaterialRef => (pale(tone) ? CRYSTAL : metalMaterial(tone));

/** A candle standing at (x, y) from `from` up to `top`: its holder cup in the metal, the wax, the
 *  flame emitter at its tip — and in a sleeve the glass round it 1.75× its radius (item-symbol.tsx:362
 *  candleAt: wax r, flame 0.5r, sleeve 1.75r). */
function candle(b: ItemBuild, x: number, y: number, r: number, from: number, top: number, metal: MaterialRef, sleeve = false, flame = FLAME) {
  const height = Math.max(10, top - from);
  const cup = Math.min(25, height * 0.15);
  b.parts.push(cyl(r * 1.15, cup, vec3(x, y, from), metal));
  b.parts.push(cyl(r, height - cup, vec3(x, y, from + cup), WAX_M));
  if (sleeve) b.parts.push(cyl(r * 1.75, height, vec3(x, y, from), GLASS));
  b.emitters.push({ at: vec3(x, y, from + height), radiusMm: FLAME_R_MM, colour: ENVELOPE.flame, strength: flame });
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

/** An arm from the hub out to `p` at height `z`: a thin bar lying along its bearing. */
function arm(b: ItemBuild, p: Point, z: number, material: MaterialRef) {
  const len = Math.hypot(p.x, p.y);
  if (len < 1) return;
  const deg = (Math.atan2(p.y, p.x) * 180) / Math.PI;
  b.parts.push(box(len, ARM_MM, ARM_MM, vec3(p.x / 2, p.y / 2, z - ARM_MM / 2), material, deg));
}

// ── the fallback ────────────────────────────────────────────────────────────────────────────────


// ── dispatch ────────────────────────────────────────────────────────────────────────────────────

const tagOf = (ctx: ItemContext, type: NodeTag["type"]): NodeTag => ctx.tag ?? (ctx.product ? { type, label: ctx.product.name } : { type });

/** The body of one placed item of `kind` (null = no picture: the fallback). */
export function itemBody(kind: SymbolKind | null, ctx: ItemContext): ItemBuild {
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
      return floorKindBody(kind, ctx);
    case "chandelier":
      return overheadKindBody(kind, ctx);
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
  switch (style) {
    case "row":
      return candleRow(w, d, h, n, long, false, tone);
    case "sleeves":
      return long ? candleRow(w, d, h, n, long, true, tone) : candleRing(w, d, h, n, true, tone);
    case "tiered":
      return candleTiers(w, d, h, n, tone);
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
      return fireBurner(w, d, h, round, tone);
    default:
      return candleRing(w, d, h, n, false, tone);
  }
}

/** Candles round a central stem, joined to it by its arms, a centre candle on an odd count
 *  (item-symbol.tsx:392 candleRing): reach 0.68 R (0.62 in sleeves), candle r = min(0.21 R,
 *  0.55 of the ring's pitch), the hub 0.2 R. The arms stand at 0.55 h; the ring's candles reach
 *  0.95 h and the centre one crowns it at h. */
function candleRing(w: number, d: number, h: number, n: number, sleeves: boolean, tone: string): ItemBuild {
  const R = Math.min(w, d) / 2;
  const metal = frameOf(tone);
  const b = make(metal);
  if (n <= 1) {
    // item-symbol.tsx:395: a foot 0.92 R wide and one candle 0.5 R (0.32 R in its sleeve).
    b.parts.push(cyl(R * 0.92, 15, vec3(0, 0, 0), metal));
    candle(b, 0, 0, Math.min(R * (sleeves ? 0.32 : 0.5), PILLAR_R_MM), 15, h, metal, sleeves);
    return b;
  }
  const ring = n % 2 === 1 ? n - 1 : n;
  const reach = R * (sleeves ? 0.62 : 0.68);
  const r = Math.min(R * 0.21, ((Math.PI * reach) / ring) * 0.55) / (sleeves ? 1.6 : 1);
  const armZ = h * 0.55;
  foot(b, R * 0.4, metal);
  b.parts.push(cyl(Math.max(8, R * 0.07), armZ, vec3(0, 0, 0), metal));
  b.parts.push(cyl(R * 0.2, 30, vec3(0, 0, armZ - 15), metal));
  const arms = armMaterial(tone);
  for (let i = 0; i < ring; i++) {
    const p = polar(reach, -90 + (i * 360) / ring);
    arm(b, p, armZ, arms);
    candle(b, p.x, p.y, real(r, sleeves), armZ, h * 0.95, metal, sleeves);
  }
  if (n % 2 === 1) candle(b, 0, 0, real(r * 0.95, sleeves), armZ + 15, h, metal, sleeves);
  return b;
}

/** A tall crystal piece in tiers (item-symbol.tsx:421 candleTiers): an outer ring of ceil(0.6·rest)
 *  candles at 0.76 R, an inner ring at 0.4 R turned half a step, one crowning the middle, crystal
 *  drops at 0.9 R between the outer arms. Under seven candles it is a ring. Outer arms at 0.42 h,
 *  inner at 0.58 h, the crown to h. */
function candleTiers(w: number, d: number, h: number, n: number, tone: string): ItemBuild {
  if (n < 7) return candleRing(w, d, h, n, false, tone);
  const R = Math.min(w, d) / 2;
  const metal = frameOf(tone);
  const arms = armMaterial(tone);
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
    arm(b, p, zOuter, arms);
    candle(b, p.x, p.y, real(ro), zOuter, h * 0.74, metal);
    // A crystal drop hanging between the arms.
    const q = polar(R * 0.9, -90 + ((i + 0.5) * 360) / outer);
    b.parts.push(sphere(R * 0.035, vec3(q.x, q.y, zOuter - h * 0.08), GLASS));
  }
  for (let i = 0; i < inner; i++) {
    const p = polar(R * 0.4, -90 + ((i + 0.5) * 360) / inner);
    arm(b, p, zInner, arms);
    candle(b, p.x, p.y, real(ri), zInner, h * 0.9, metal);
  }
  candle(b, 0, 0, real(ro), zInner + 20, h, metal);
  return b;
}

/** Candles in a line on a bar (item-symbol.tsx:375 candleRow): r = min(0.34 D, L/(2.3 n)) — 0.2 D
 *  and L/(3.8 n) in sleeves — over 0.84 L (0.78), the bar 0.24 D deep on a long piece, else
 *  min(0.12 D, 0.05 L) on a round foot min(0.36 D, 0.16 L). The bar stands at 0.5 h. */
function candleRow(w: number, d: number, h: number, n: number, long: boolean, sleeves: boolean, tone: string): ItemBuild {
  return along(w, d, (L, D) => {
    const metal = frameOf(tone);
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
    for (let i = 0; i < n; i++) candle(b, n === 1 ? 0 : -span / 2 + (i * span) / (n - 1), 0, real(r, sleeves), barZ, h, metal, sleeves);
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
function fireBurner(w: number, d: number, h: number, round: boolean, tone: string): ItemBuild {
  const dark = matte(BURNER);
  if (round) {
    const R = Math.min(w, d) / 2;
    const b = make(matte(tone));
    b.parts.push(lathe([{ r: R * 0.4, z: 0 }, { r: R * 0.95, z: h * 0.55 }, { r: R, z: h * 0.9 }, { r: R, z: h }, { r: R * 0.9, z: h }, { r: R * 0.76, z: h * 0.86 }], vec3(0, 0, 0)));
    b.parts.push(cyl(R * 0.72, 12, vec3(0, 0, h * 0.86), dark));
    const k = Math.max(6, Math.round((2 * Math.PI * R * 0.46) / 90));
    const tongue = Math.min(R * 0.12, ((Math.PI * R * 0.46) / k) * 0.6);
    for (let i = 0; i < k; i++) {
      const p = polar(R * 0.46, (i * 360) / k);
      b.emitters.push({ at: vec3(p.x * (w / 2 / R), p.y * (d / 2 / R), h), radiusMm: Math.max(FLAME_R_MM, tongue), colour: ENVELOPE.flame, strength: FIRE });
    }
    return b;
  }
  return along(w, d, (L, D) => {
    const b = make(matte(tone));
    const slotL = L - D * 0.6;
    const k = Math.max(3, Math.floor(slotL / 130));
    const step = slotL / k;
    b.parts.push(box(L, D, h, vec3(0, 0, 0)));
    b.parts.push(box(slotL, D * 0.4, 10, vec3(0, 0, h - 8), dark));
    for (let i = 0; i < k; i++) {
      b.emitters.push({
        at: vec3(-slotL / 2 + step * (i + 0.5), (i % 2 ? 1 : -1) * D * 0.03, h),
        radiusMm: Math.max(FLAME_R_MM, step * (i % 3 === 1 ? 0.48 : 0.4)),
        colour: ENVELOPE.flame,
        strength: FIRE,
      });
    }
    return b;
  });
}

// ── lamp, vase, runner (item-symbol.tsx:647, :670, :1244) ───────────────────────────────────────

/** A table lamp: the shade a lathe from its bottom rim (the whole footprint) to the top rim at 0.64
 *  of it over the top 45 % of h, a stem 0.05 of the box, a turned foot, the finial 0.07 R — and the
 *  bulb inside, which is what it is for (item-symbol.tsx:647 lamp). A square shade is lathed round. */
function lampBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const R = Math.min(w, d) / 2;
  const shade = clothMaterial(tone);
  const metal = metalMaterial(darkened(tone));
  const b = make(shade);
  const shadeZ = h * 0.55;
  b.parts.push(lathe([{ r: R, z: shadeZ }, { r: R * 0.64, z: h }], vec3(0, 0, 0), shade));
  b.parts.push(lathe([{ r: R * 0.3, z: 0 }, { r: R * 0.3, z: 12 }, { r: R * 0.14, z: 30 }, { r: R * 0.07, z: 50 }], vec3(0, 0, 0), metal));
  b.parts.push(cyl(Math.max(6, Math.min(w, d) * 0.05), shadeZ - 50, vec3(0, 0, 50), metal));
  b.parts.push(sphere(R * 0.07, vec3(0, 0, h), metal));
  b.emitters.push({ at: vec3(0, 0, shadeZ + (h - shadeZ) * 0.4), radiusMm: R * 0.3, colour: ENVELOPE.bulb, strength: 1 });
  return b;
}

/** What shape a vessel is. A vase row carries no style, so its NAME is read where it says (the
 *  way lib/catalog/flower-kinds.ts reads a flower and isRunner a runner): "מרטיני" is a martini on a
 *  stem, "צילינדר" a straight cylinder, "קערה" a bowl — on a foot when it says "רגל". Otherwise
 *  the proportions: very slender is a cylinder, squat is a bowl, anything else the plan's urn. */
export type VesselForm = "trumpet" | "cylinder" | "bowl" | "pedestal" | "urn";
const VESSEL_WORDS: [VesselForm, RegExp][] = [
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
  return "urn";
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
  urn: {
    outer: [[0.32, 0], [0.32, 0.04], [0.6, 0.3], [0.86, 0.7], [1, 1]],
    inner: [[0.8, 1], [0.68, 0.6], [0.28, 0.2], [0, 0.2]],
  },
};

/** A vessel: its form's profile (vesselForm) lathed on its width — an oval one stretched to its
 *  depth — outside and in. Glass when its tone is near-white, metal when its shade is a metal,
 *  glazed otherwise. */
function vaseBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const R = w / 2;
  const form = vesselForm(ctx.product?.name, w, d, h);
  const shade = ctx.resolved?.variant?.name ?? "";
  const material = pale(tone) && !METAL_SHADE.test(shade) ? glassMaterial(tone) : METAL_SHADE.test(shade) ? metalMaterial(tone) : glossMaterial(tone);
  const b = make(material);
  const { outer, inner } = VESSEL_PROFILES[form];
  const scaleY = w > 0 && Math.abs(d - w) > 1 ? d / w : undefined;
  const at = vec3(0, 0, 0);
  const shaped = (pts: [number, number][]): Part => ({ shape: "lathe", profile: pts.map(([r, z]) => ({ r: R * r, z: h * z })), at, segments: 32, ...(scaleY ? { scaleY } : {}) });
  b.parts.push(shaped(outer), shaped(inner));
  return b;
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
    const tassel = Math.max(10, D * 0.05);
    for (const sx of [-1, 1]) b.parts.push(sphere(tassel, vec3(sx * (L / 2 + 14), 0, tassel)));
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
  if (!plated) return flowerBuild(spec, h, tag);
  const plate = make(glossMaterial(PLATE));
  if (isRound(ctx.footprint) && Math.abs(w - d) <= 1) plate.parts.push(cyl(w / 2, PLATE_MM, vec3(0, 0, 0)));
  else for (const outline of footprintOutlines(ctx.footprint)) plate.parts.push({ shape: "extrude", outline, h: PLATE_MM, at: vec3(0, 0, 0) });
  return merge(plate, raise(flowerBuild(spec, Math.max(40, h - PLATE_MM), tag), PLATE_MM));
}

// ponytail: self-check. Run: npx tsx lib/scene/items.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const ctxOf = (footprint: Footprint, heightMm: number, extra: Partial<ItemContext> = {}): ItemContext => {
    const w = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.widthMm : 0;
    const d = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.depthMm : 0;
    return { product: undefined, resolved: undefined, footprint, widthMm: w, depthMm: d, heightMm, tone: DEFAULT_TONE.candlestick, count: 1, author: false, ...extra };
  };
  const waxCandles = (b: ItemBuild) => b.parts.filter((p) => p.shape === "cylinder" && p.material?.colour === WAX);
  const top = (p: Part) => (p.shape === "box" || p.shape === "cylinder" || p.shape === "extrude" || p.shape === "ribbon" ? p.at.z + p.h : p.shape === "sphere" ? p.at.z + p.r : p.shape === "lathe" ? Math.max(...p.profile.map((q) => q.z)) + p.at.z : p.at.z);

  // A five-arm ring: five candles, five flames at the top.
  const ring = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 600, { count: 5, drawStyle: "ring" }));
  assert(waxCandles(ring).length === 5, `a 5-arm ring has 5 candles (${waxCandles(ring).length})`);
  assert(ring.emitters.length === 5 && ring.emitters.every((e) => e.at.z >= 540 && e.at.z <= 600), "…and five flames at the candles' tops, within a tenth of 600");
  assert(ring.emitters.some((e) => e.at.z === 600 && e.at.x === 0 && e.at.y === 0), "the odd count's centre candle crowns it at h");
  assert(ring.parts.every((p) => top(p) <= 600 + 1e-9), "nothing stands above the row's height");

  // A row: three candles along x on a bar at half height.
  const row = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 800, depthMm: 120 }, 300, { count: 3 }));
  const rowCandles = waxCandles(row);
  assert(rowCandles.length === 3, "a long piece with no style is a row of 3");
  const xs = rowCandles.map((p) => p.at.x).sort((a, b) => a - b);
  assert(xs[0] < -300 && xs[2] > 300 && Math.abs(xs[1]) < 1e-6 && rowCandles.every((p) => Math.abs(p.at.y) < 1e-6), `…spread along x over 0.84 L (${xs.map((x) => Math.round(x)).join(", ")})`);
  const tall = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 120, depthMm: 800 }, 300, { count: 3 }));
  assert(waxCandles(tall).every((p) => Math.abs(p.at.x) < 1e-6) && waxCandles(tall).some((p) => p.at.y > 300), "a row stored deep runs along y");

  // Every style builds, lights as many flames as it has candles, and keeps under its height.
  const thirteen = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 500 }, 900, { count: 13, drawStyle: "tiered" }));
  assert(thirteen.emitters.length === 13 && waxCandles(thirteen).length === 13, "a 13-arm tiered piece lights 13");
  for (const style of ["sleeves", "cluster", "floating", "powder", "pillars"] as const) {
    const b = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { count: 5, drawStyle: style }));
    assert(b.emitters.length === 5, `${style}: 5 flames (${b.emitters.length})`);
    assert(b.parts.every((p) => top(p) <= 400 + 1e-9) && b.emitters.every((e) => e.at.z <= 400), `${style}: under its height`);
  }
  const lantern = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 200, depthMm: 200 }, 350, { count: 5, drawStyle: "lantern" }));
  assert(lantern.emitters.length === 1 && lantern.parts.every((p) => top(p) <= 350 + 1e-9), "a square lantern is one lantern whatever its count, under its height");
  const sleeves = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { count: 5, drawStyle: "sleeves" }));
  assert(sleeves.parts.filter((p) => p.material?.kind === "glass").length === 5, "sleeves: a glass round every candle");
  const lanternRow = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 900, depthMm: 200 }, 350, { count: 3, drawStyle: "lantern" }));
  assert(lanternRow.emitters.length === 3, "three lanterns in a row");
  const trough = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 1200, depthMm: 300 }, 250, { count: 1, drawStyle: "fire" }));
  assert(trough.emitters.length === Math.floor((1200 - 180) / 130) && trough.emitters.every((e) => e.strength === FIRE), "a fire trough's flames follow its length, not its count");
  const bowl = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 600 }, 300, { count: 1, drawStyle: "fire" }));
  assert(bowl.emitters.length >= 6, "a fire bowl has a ring of flames");
  const crystal = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 600, { count: 4, drawStyle: "ring", tone: "#f7f6fc" }));
  assert(crystal.parts.some((p) => p.shape === "box" && p.material?.kind === "glass"), "a crystal piece's arms are faint glass, not white metal");

  // Chairs.
  const chiavari = chairParts("chiavari", 420, 340, 900, "#f7f6fc");
  assert(chiavari.parts.some((p) => p.shape === "extrude" && p.at.z === 410 && p.h === 40), "chiavari: a seat slab 40 thick under 450");
  assert(Math.abs(Math.max(...chiavari.parts.map(top)) - 900) < 1e-6, "…and its posts reach 900");
  assert(chiavari.parts.filter((p) => p.shape === "cylinder").length === 4, "…on four round legs");
  for (const style of ["dining", "crossback", "ghost", "folding", "armchair", "bench"] as const) {
    const c = chairParts(style, 450, 450, 900, "#e4dfd6");
    assert(c.parts.length > 0 && Math.max(...c.parts.map(top)) <= 900 + 1e-9, `${style} builds under 900`);
    assert(Math.min(...c.parts.map((p) => p.at.z)) === 0, `${style} stands on the floor`);
  }
  assert(chairParts("ghost", 450, 450, 900, "#f7f6fc").material.opacity === 0.35, "a ghost chair is see-through");
  assert(Math.max(...chairParts("bench", 1500, 400, 900, "#e4dfd6").parts.map(top)) === 450, "a bench has no back: nothing above its seat");
  const pouf = chairParts("stool", 400, 400, 450, "#ece7f5");
  assert(pouf.parts.some((p) => p.shape === "cylinder" && p.rBottom === 200), "a stool is a pouf: a cylinder of the footprint's radius");
  assert(chairRequest("chiavari", 420.4, 340, 900, "#f7f6fc", transform(vec3(0, 0, 0)), { type: "chair" }).key === "chair:chiavari:#f7f6fc:420x340x900", "a chair's instance key");
  const roundChair = itemBody("chair", ctxOf({ kind: "circle", diameterMm: 400 }, 450, { tone: "#ece7f5" }));
  assert(roundChair.instanced.length === 1 && roundChair.instanced[0].key.startsWith("chair:stool:"), "a round chair footprint is a pouf, instanced");

  // A lamp glows once; a vase is two lathes; a runner is a strip with two points.
  const lamp = itemBody("lamp", ctxOf({ kind: "circle", diameterMm: 300 }, 500, { tone: DEFAULT_TONE.lamp }));
  assert(lamp.emitters.length === 1 && lamp.emitters[0].colour === ENVELOPE.bulb && lamp.emitters[0].strength === 1, "a lamp has one bulb");
  assert(lamp.parts.some((p) => p.shape === "lathe" && p.profile[0].r === 150 && p.profile[1].r === 96 && p.profile[1].z === 500), "its shade runs from the full rim to 0.64 of it at the top");
  const vase = itemBody("vase", ctxOf({ kind: "circle", diameterMm: 200 }, 300, { tone: DEFAULT_TONE.vase }));
  assert(vase.parts.length === 2 && vase.parts.every((p) => p.shape === "lathe") && vase.material.kind === "glass", "a pale vase is two lathes of glass");
  assert(itemBody("vase", ctxOf({ kind: "circle", diameterMm: 200 }, 300, { tone: "#c9a24a" })).material.kind === "gloss", "a gold one is glazed");
  const runner = itemBody("runner", ctxOf({ kind: "rect", widthMm: 400, depthMm: 2400 }, 8, { tone: DEFAULT_TONE.runner }));
  assert(runner.parts.filter((p) => p.shape === "extrude").length === 2 && runner.parts.some((p) => p.shape === "box" && p.rotDeg === 90 && p.w === 2400 - 240), "a runner stored deep runs along y with a point at each end");

  // A centrepiece stands its flowers on a plate; an arrangement has none.
  const centre = itemBody("centerpiece", ctxOf({ kind: "circle", diameterMm: 400 }, 350, { tone: DEFAULT_TONE.centerpiece }));
  assert(centre.parts[0].shape === "cylinder" && centre.parts[0].h === PLATE_MM && centre.instanced.length > 0, "a centrepiece: a plate and instanced heads");
  assert(centre.instanced.every((r) => r.at.at.z >= PLATE_MM - 1e-9), "…standing on the plate");
  const flowers = itemBody("flowers", ctxOf({ kind: "circle", diameterMm: 400 }, 350, { tone: DEFAULT_TONE.flowers }));
  assert(flowers.instanced.some((r) => r.key.startsWith("flower:")) && !flowers.parts.some((p) => p.shape === "cylinder" && p.h === PLATE_MM), "an arrangement with no row still blooms, without a plate");
  assert(JSON.stringify(flowers) === JSON.stringify(itemBody("flowers", ctxOf({ kind: "circle", diameterMm: 400 }, 350, { tone: DEFAULT_TONE.flowers }))), "the same arrangement builds the same twice");

  // The floor kinds are ./floor-kinds.ts's now, and an unknown picture is the fallback.
  const sofa = itemBody("sofa", ctxOf({ kind: "rect", widthMm: 1800, depthMm: 900 }, 800, { tone: DEFAULT_TONE.sofa }));
  assert(sofa.parts.length > 1 && !sofa.parts.some((q) => q.shape === "extrude" && q.h === 800), "a sofa is built by the floor kinds (back, arms, cushions), not the fallback box");
  assert(itemBody(null, ctxOf({ kind: "rect", widthMm: 300, depthMm: 300 }, 0)).parts[0].shape === "extrude", "no picture: the fallback");
  // Vessels by what their name says, else by their proportions.
  assert(vesselForm("אגרטל מרטיני זהב 80", 200, 200, 800) === "trumpet", "a martini vase stands on a stem");
  assert(vesselForm("צילינדר זכוכית מפוספס 50", 60, 60, 500) === "cylinder", "a cylinder is straight");
  assert(vesselForm("קערה אובלית על רגל 60", 600, 300, 200) === "pedestal" && vesselForm("קערה שטוחה", 400, 400, 120) === "bowl", "a bowl on a foot has a pedestal; a bowl does not");
  assert(vesselForm(undefined, 200, 200, 300) === "urn" && vesselForm(undefined, 60, 60, 500) === "cylinder" && vesselForm(undefined, 400, 400, 150) === "bowl", "…and nameless ones go by their proportions");
  console.log("scene items ok");
}
