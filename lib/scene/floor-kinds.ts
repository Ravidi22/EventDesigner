// The floor kinds as 3D bodies — sofas, banquettes, columns, fountains, arches, trees, bars,
// chuppahs, flights and ramps standing alone, a rug, and a block of chairs in rows — each lifting
// its 2D recipe into parts with a height. Spec §3.4, §3.7.
//
// The plan's picture IS the specification, as it is for the table kinds (./items.ts): `sofa()` in
// components/item-symbol.tsx already says how deep a sofa's back is and how many cushions a 2 m one
// has; `column()` says the shaft is 0.74 of the plinth and has sixteen flutes; `barDrawing` in
// lib/catalog/bar-draw.ts says which edge of a ח the guests stand at; `benchLayout` says where a
// banquette's chairs stand; `climbDrawing`'s rules say how many treads a 60 cm rise takes. Every
// number here is one of those — cited by the line it was lifted from — given a z. Where the plan
// has no height to give (it is a plan), the height is the spec's (§3.4) or the thing's real one.
//
// The frame is the symbol's: centred on (0,0) in the item's own millimetres, +y the FRONT (a sofa's
// back is at −y, a flight's head is at −y unless reversed, a chuppah's flowered poles are at +y), a
// long piece built along its longer side (`along`, the plan's `along()`) where the plan does so —
// the arch and the straight bar — and NOT where it does not (a sofa's back is always at −y).
//
// Materials: the item's tone, matte, unless the thing is glass, water, cloth or foliage. A bar is
// the one kind here drawn as its outline, so it alone carries the row's texture (swatchMaterial).
//
// What a kind returns is an ItemBuild (./collect.ts). Bottles and chairs are INSTANCED — every
// bottle of one radius in the room is one geometry, every banquette chair of one style and colour
// is one with the tables' chairs. A tree's lobes are not: a tree is one thing.
//
// Pure: no React, no three. `npx tsx lib/scene/floor-kinds.ts` runs the self-check.
import type { BuiltOutline, Footprint } from "@/lib/studio/footprint";
import { catalogBox, footprintOutlines, pieceOf, resolveFootprint } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import { rugFringe, rugInset, rugOutline } from "@/lib/studio/rug-shape";
import { rugBorderBands } from "@/lib/studio/rug-shape";
import { fringeOf, type Border } from "@/lib/catalog/border";
import { borderBands } from "@/lib/catalog/border";
import { evenInset } from "@/lib/studio/footprint";
import { hexOf } from "./materials";
import { flatRing, signedDistance } from "@/lib/studio/label-anchor";
import type { ChuppahFinish, Product, RevolvePoint } from "@/lib/catalog/types";
import type { SymbolKind } from "@/lib/catalog/symbols";
import { type FlowerDrawSpec, type FlowerForm, defaultMix, seedOf } from "@/lib/catalog/flower-draw";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { BOTTLE_PITCH_MM, type Strip, barDrawing, bottleRadiusMm, counterShelfMm, counterTopMm } from "@/lib/catalog/bar-draw";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { type BenchLayout, SOFA_BACK_MM, benchLayout } from "@/lib/design-document/bench";
import { FALLBACK_CHAIR, chairRowsLayout } from "@/lib/design-document/chair-rows";
import { type ClimbHost, climbRisers, climbTreads, riserHeightMm, treadDepthMm } from "@/lib/venues/climb";
import { isMain } from "../self-check";
import { pergolaFromStyle, pergolaGeometry, pergolaLines, pergolaPostOf } from "@/lib/venues/pergola";
import { CHUPPAH_FINISH_COLOUR, CHUPPAH_PROFILES, CLOUD_LENS, chuppahLayout, chuppahOf, cloudFlowers, cloudPieces } from "@/lib/catalog/chuppah";
import { profileAt, revolveProfileMm } from "@/lib/element/revolve";
import type { InstanceRequest, ItemBuild } from "./collect";
import { type ItemContext, fallbackBody } from "./item-context";
import { chairParts, chairRequest, darkened, pale } from "./items";
import { flowerBuild } from "./flowers";
import { treeEnvelopeParts, treeParts } from "./plants";
import { applyTransform, compose, turn } from "./frame";
import { ENVELOPE, clothMaterial, foliageMaterial, glossMaterial, metalMaterial, swatchMaterial, waterMaterial } from "./materials";
import { type MaterialRef, type NodeTag, type Part, type Transform, type Vec3, transform, vec3 } from "./types";

// ── the constants ───────────────────────────────────────────────────────────────────────────────

/** A sofa's plinth, its cushion, and the seat they make (spec §3.4: cushions at 450). */
/** Where a sofa's cushions top out (spec §3.4). */
const SOFA_SEAT_Z_MM = 450;
const SOFA_PLINTH_MM = 150;
const SOFA_CUSHION_MM = 120;
/** A banquette's slab and legs. */
const BENCH_SLAB_MM = 60;
const BENCH_LEG_MM = 60;
/** The banquette's chairs are the tables' quiet chair — item-symbol.tsx:217 seatTone. */
const BENCH_CHAIR_TONE = "#f4f2f9";
const BENCH_CHAIR = { widthMm: 420, depthMm: 340, heightMm: 900 };
/** A banquette sofa side's backrest rises this much above its seat. */
const SOFA_BACKREST_MM = 400;
/** A fountain's basin and the water in it (spec §3.4). */
const BASIN_MM = 350;
const BASIN_WATER_MM = 300;
const STONE = "#cfc9bd";
const SPOUT = "#d3e7f0";
/** An arch's span bar and how far up its feet carry it (spec §3.4: feet to 0.9 h). */
const ARCH_FEET_SHARE = 0.9;
const ARCH_SPAN_MM = 120;
/** A bar is 1100 high when its row says nothing (spec §3.4); the shelf at 0.85 of it; the
 *  counter top 40 thick and 50 proud of the guests' edge; a back bar a display counter. */
const BAR_MM = 1100;
const SHELF_SHARE = 0.85;
const COUNTER_MM = 40;
const COUNTER_PROUD_MM = 50;
const SHELF_MM = 30;
const BACK_BAR_MM = 1500;
const BOTTLE_MM = 300;
const BOTTLE_GLASS = "#7fa6b8";
/** A chuppah's canopy sags this much between its poles; its posies hang at 2/3 of its height. */
const CANOPY_SAG_MM = 60;
const CANOPY_INSET = 0.9;
const POSY_SHARE = 2 / 3;
/** A sheer is the cloth at this opacity; open slats stand this far apart. */
const SHEER_OPACITY = 0.45;
const SLAT_PITCH_MM = 350;
/** A hung chuppah's cables reach this far up under open sky; their colour. */
const HUNG_CABLE_MM = 1500;
const CABLE = "#8d8f94";
const ROTUNDA_PLINTH_MM = 100;
const ROTUNDA_CLOTH = "#fbf7f1";
const ROTUNDA_STONE = "#f3f0ea";
/** A ramp's slab and the kerb along each side. */
const RAMP_SLAB_MM = 60;
const RAMP_KERB_MM = 80;
const RAMP_KERB_W_MM = 40;
const RAMP_LANDING_MM = 200;
/** A rug's slab, its border band and the fringe off its short ends (item-symbol.tsx:1291). */
const RUG_MM = 12;
const RUG_BAND_MM = 2;
const RUG_FRINGE_MAX = 20;
const RUG_FRINGE_PITCH_MM = 45;
const RUG_FRINGE_W_MM = 3;

// ── part constructors (as ./items.ts has them; private there) ───────────────────────────────────

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number): Point => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });
const matte = (colour: string): MaterialRef => ({ colour, kind: "matte" });

const box = (w: number, d: number, h: number, at: Vec3, material?: MaterialRef, rotDeg?: number, tiltDeg?: number): Part => {
  const p: Part = { shape: "box", w, d, h, at };
  if (material) p.material = material;
  if (rotDeg) p.rotDeg = rotDeg;
  if (tiltDeg) p.tiltDeg = tiltDeg;
  return p;
};
const cyl = (r: number, h: number, at: Vec3, material?: MaterialRef, rTop = r, segments?: number): Part => {
  const p: Part = { shape: "cylinder", rTop, rBottom: r, h, at };
  if (material) p.material = material;
  if (segments) p.segments = segments;
  return p;
};
const lathe = (profile: { r: number; z: number }[], at: Vec3, material?: MaterialRef): Part => (material ? { shape: "lathe", profile, at, material } : { shape: "lathe", profile, at });
const torus = (r: number, tube: number, at: Vec3, material?: MaterialRef): Part => (material ? { shape: "torus", r, tube, at, material } : { shape: "torus", r, tube, at });
const extrude = (outline: BuiltOutline, h: number, at: Vec3, material?: MaterialRef, holes?: BuiltOutline[]): Part => {
  const p: Part = { shape: "extrude", outline, h, at };
  if (material) p.material = material;
  if (holes?.length) p.holes = holes;
  return p;
};
const plane = (outline: BuiltOutline, at: Vec3, material?: MaterialRef, side?: "up" | "down" | "both", holes?: BuiltOutline[]): Part => {
  const p: Part = { shape: "plane", outline, at };
  if (material) p.material = material;
  if (side) p.side = side;
  if (holes?.length) p.holes = holes;
  return p;
};

const make = (material: MaterialRef): ItemBuild => ({ parts: [], material, instanced: [], emitters: [] });

/** A round thing turned to `profile` (ItemContext.profile — fractions of its radius and height), an
 *  oval one stretched to its depth, in one material: a pouf, a column, a fountain's stone. */
function turnedPart(ctx: ItemContext, profile: readonly { r: number; z: number }[], material: MaterialRef, heightMm = ctx.heightMm): Part {
  const part: Part = { shape: "lathe", profile: revolveProfileMm(profile, ctx.widthMm / 2, Math.max(10, heightMm)), at: vec3(0, 0, 0), segments: 32, material };
  if (ctx.widthMm > 0 && Math.abs(ctx.depthMm - ctx.widthMm) > 1) part.scaleY = ctx.depthMm / ctx.widthMm;
  return part;
}

/** Several builds as one: the first one's material, everything else appended. */
function merge(first: ItemBuild, ...rest: ItemBuild[]): ItemBuild {
  return {
    material: first.material,
    parts: [first, ...rest].flatMap((b) => b.parts),
    instanced: [first, ...rest].flatMap((b) => b.instanced),
    emitters: [first, ...rest].flatMap((b) => b.emitters),
  };
}

/** A build carried `dx, dy, dz` in its own frame (a posy to its pole, a garland onto its span). */
function shifted(b: ItemBuild, dx: number, dy: number, dz: number): ItemBuild {
  if (!dx && !dy && !dz) return b;
  const mv = (v: Vec3): Vec3 => vec3(v.x + dx, v.y + dy, v.z + dz);
  return {
    material: b.material,
    parts: b.parts.map((p) => ({ ...p, at: mv(p.at) })),
    instanced: b.instanced.map((r) => ({ ...r, at: { ...r.at, at: mv(r.at.at) } })),
    emitters: b.emitters.map((e) => ({ ...e, at: mv(e.at) })),
  };
}

function turnPart(p: Part, t: Transform, deg: number): Part {
  const at = applyTransform(t, p.at);
  switch (p.shape) {
    case "box":
    case "extrude":
    case "plane":
    case "panel":
    case "cylinder":
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

/** Build a long piece along its LONGER side — the plan's `along()` (item-symbol.tsx:287). */
function along(w: number, d: number, draw: (L: number, D: number) => ItemBuild): ItemBuild {
  return w >= d ? draw(w, d) : turned(draw(d, w), 90);
}

const isRound = (f: Footprint): boolean => f.kind === "circle" || f.kind === "ellipse";

/** An outline scaled about its own origin — a basin's inner wall, a bar's well, a canopy's sag.
 *  Curve controls are offsets from their edge's ends (absoluteControlPoints), so they scale too. */
function scaleOutline(o: BuiltOutline, kx: number, ky: number): BuiltOutline {
  const out: BuiltOutline = { outline: o.outline.map((p) => ({ x: p.x * kx, y: p.y * ky })) };
  if (o.edgeCurves) out.edgeCurves = o.edgeCurves.map((c) => (c ? { c1: { x: c.c1.x * kx, y: c.c1.y * ky }, c2: { x: c.c2.x * kx, y: c.c2.y * ky } } : c));
  return out;
}

const ellipseOutline = (w: number, d: number): BuiltOutline => footprintOutlines({ kind: "ellipse", widthMm: w, depthMm: d })[0];

const tagOf = (ctx: ItemContext, type: NodeTag["type"]): NodeTag => ctx.tag ?? (ctx.product ? { type, label: ctx.product.name } : { type });

/** Flowers with no row behind them, or a row's spec forced into the form the picture needs —
 *  an arch's garland is always a runner, a chuppah's posy always a dome (item-symbol.tsx:300
 *  plainFlowers). Kept per key so the same object comes back and composeFlowers' memo holds. */
const specs = new Map<string, FlowerDrawSpec>();
const forced = new WeakMap<FlowerDrawSpec, Map<FlowerForm, FlowerDrawSpec>>();
function flowersFor(product: Product | undefined, w: number, h: number, form: FlowerForm, shade: string | undefined, seedKey: string): FlowerDrawSpec {
  if (product) {
    const s = flowerDrawSpecOf(product, { kind: "rect", widthMm: w, depthMm: h }, shade);
    if (s.form === form) return s;
    let byForm = forced.get(s);
    if (!byForm) {
      byForm = new Map();
      forced.set(s, byForm);
    }
    let f = byForm.get(form);
    if (!f) {
      f = { ...s, form };
      byForm.set(form, f);
    }
    return f;
  }
  const key = `${form}|${Math.round(w)}|${Math.round(h)}|${shade ?? ""}|${seedKey}`;
  let spec = specs.get(key);
  if (!spec) {
    if (specs.size > 400) specs.clear();
    spec = { form, w: Math.round(w), h: Math.round(h), lines: defaultMix(), shade, seed: seedOf(key) };
    specs.set(key, spec);
  }
  return spec;
}

// ── dispatch ────────────────────────────────────────────────────────────────────────────────────

export function floorKindBody(kind: SymbolKind, ctx: ItemContext): ItemBuild {
  switch (kind) {
    case "sofa":
      return sofaBody(ctx);
    case "bench":
      return benchBody(ctx);
    case "column":
      return columnBody(ctx);
    case "fountain":
      return fountainBody(ctx);
    case "arch":
      return archBody(ctx);
    case "gate":
      return gateBody(ctx);
    case "tree":
      return treeBody(ctx);
    case "bar":
      return barBody(ctx);
    case "chuppah":
      return ctx.drawStyle === "rotunda" ? rotundaBody(ctx) : chuppahBody(ctx);
    case "stairs":
      return stairsBody(ctx);
    case "ramp":
      return rampBody(ctx);
    case "pergola":
      return pergolaBody(ctx);
    default:
      return fallbackBody(ctx);
  }
}

// ── sofa (item-symbol.tsx:875 sofa, :911 pouf) ─────────────────────────────────────────────────

/** A sofa: the back min(0.28 d, 260) deep along −y up to h; an arm min(0.13 w, 230, 0.3 d) wide
 *  at each end to 0.65 h; between them round((w − 2·arm)/650) cushions with 25 mm gaps — the
 *  plan's numbers (item-symbol.tsx:876–883) — 120 thick with their tops at the seat (450, or half
 *  the height of a low piece), on a 150 plinth in the darker shade. A round footprint is a pouf
 *  (:911) — the stool chairParts already is. */
function sofaBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  // A round one with a profile of its own (ItemContext.profile) is a pouf turned to it, in its fabric.
  if (ctx.profile && isRound(ctx.footprint)) {
    const b = make(matte(tone));
    b.parts.push(turnedPart(ctx, ctx.profile, matte(tone)));
    return b;
  }
  if (isRound(ctx.footprint)) {
    const { parts, material } = chairParts("stool", w, d, h, tone);
    return { parts, material, instanced: [], emitters: [] };
  }
  const back = Math.min(d * 0.28, 260);
  const arm = Math.min(w * 0.13, 230, d * 0.3);
  const innerW = w - arm * 2;
  const n = Math.max(1, Math.round(innerW / 650));
  const gap = 25;
  const cw = (innerW - gap * (n + 1)) / n;
  const cy = -d / 2 + back + gap;
  const ch = d / 2 - cy - gap;
  const body = matte(tone);
  const frame = matte(darkened(tone));
  const b = make(body);
  // A sofa's cushions top at 450 (spec §3.4) — not a chair's "half its height" rule, which would
  // sink an 800 sofa's seat to 400; only a very low piece comes down to 0.6 of its height.
  const seatZ = Math.min(SOFA_SEAT_Z_MM, h * 0.6);
  const plinth = Math.min(SOFA_PLINTH_MM, seatZ * 0.33);
  const cushion = Math.min(SOFA_CUSHION_MM, seatZ - plinth);
  b.parts.push(box(w, d, plinth, vec3(0, 0, 0), frame));
  // The seat deck under the cushions, between the arms and in front of the back.
  b.parts.push(box(innerW, d - back, Math.max(1, seatZ - cushion - plinth), vec3(0, back / 2, plinth), body));
  b.parts.push(box(w, back, Math.max(1, h - plinth), vec3(0, -d / 2 + back / 2, plinth), body));
  for (const sx of [-1, 1]) b.parts.push(box(arm, d, Math.max(1, h * 0.65 - plinth), vec3(sx * (w / 2 - arm / 2), 0, plinth), body));
  if (cw > 40 && ch > 40) {
    for (let i = 0; i < n; i++) b.parts.push(box(cw, ch, cushion, vec3(-w / 2 + arm + gap + i * (cw + gap) + cw / 2, cy + ch / 2, seatZ - cushion), body));
  }
  return b;
}

// ── banquette (item-symbol.tsx:214 benchSymbol, lib/design-document/bench.ts) ──────────────────

/** A banquette standing on its own: the strip `benchLayout` laid (ctx.bench, standaloneBench),
 *  60 thick with its TOP at the layout's heightMm (750 — table height, bench.ts BENCH_TOP_MM) on
 *  four legs; a chairs side's chairs at `BenchLayout.chairs`, each facing the strip, the tables'
 *  quiet chair (item-symbol.tsx:217) — instanced with every other chair of that style; a sofa
 *  side's cushions as the plan's quads lifted to sofaHeightMm (460, SOFA_SEAT_MM) on a base, its
 *  backrest the band toward the strip's centre line (bench.ts SOFA_BACK_MM), rising 400 above the
 *  seat. Where a side is a sofa the strip gives that half to the cushions and keeps the band. */
function benchBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, tone } = ctx;
  const lay = ctx.bench ?? benchLayout(w, d);
  const body = matte(tone);
  const frame = matte(darkened(tone));
  const b = make(body);
  const half = d / 2;
  const band = Math.max(0, Math.min(SOFA_BACK_MM, half - 100));
  const y0 = lay.back.kind === "sofa" ? -band : -half;
  const y1 = lay.front.kind === "sofa" ? band : half;
  const top = lay.heightMm;
  if (lay.shaped) {
    // A banquette laid along its SHAPE (benchLayoutFor — a crescent, a ח): its top is the outline
    // extruded to table height, its chairs where the layout stood them round the band, and a
    // sofa's cushions as the quads the plan draws, raised to the seat. No straight-frame slab.
    for (const outline of footprintOutlines(ctx.footprint)) b.parts.push({ shape: "extrude", outline, h: Math.max(10, top), at: vec3(0, 0, 0) });
    const tagS = tagOf(ctx, "chair");
    const styleS = ctx.chairStyle ?? "dining";
    for (const s of lay.chairs) b.instanced.push(chairRequest(styleS, BENCH_CHAIR.widthMm, BENCH_CHAIR.depthMm, BENCH_CHAIR.heightMm, BENCH_CHAIR_TONE, transform(vec3(s.x, s.y, 0), s.facingDeg - 90), tagS));
    const sofaZS = lay.sofaHeightMm;
    const cushionS = Math.min(SOFA_CUSHION_MM, sofaZS * 0.4);
    for (const q of lay.cushions) b.parts.push({ shape: "extrude", outline: { outline: q }, h: cushionS, at: vec3(0, 0, Math.max(0, sofaZS - cushionS)) });
    return b;
  }
  if (y1 - y0 > 1) {
    b.parts.push(box(w, y1 - y0, BENCH_SLAB_MM, vec3(0, (y0 + y1) / 2, top - BENCH_SLAB_MM), body));
    const legY = y1 - y0 > BENCH_LEG_MM * 2 ? [y0 + BENCH_LEG_MM / 2, y1 - BENCH_LEG_MM / 2] : [(y0 + y1) / 2];
    for (const sx of [-1, 1]) for (const y of legY) b.parts.push(box(BENCH_LEG_MM, BENCH_LEG_MM, Math.max(1, top - BENCH_SLAB_MM), vec3(sx * (w / 2 - BENCH_LEG_MM), y, 0), frame));
  }
  const tag = tagOf(ctx, "chair");
  const style = ctx.chairStyle ?? "dining";
  for (const s of lay.chairs) {
    // A Seat faces the strip along facingDeg (0 = +x); a chair body's front is +y (frame.ts seatTransform).
    b.instanced.push(chairRequest(style, BENCH_CHAIR.widthMm, BENCH_CHAIR.depthMm, BENCH_CHAIR.heightMm, BENCH_CHAIR_TONE, transform(vec3(s.x, s.y, 0), s.facingDeg - 90), tag));
  }
  const sofaZ = lay.sofaHeightMm;
  const cushion = Math.min(SOFA_CUSHION_MM, sofaZ * 0.4);
  for (const [side, sign] of [[lay.back, -1], [lay.front, 1]] as const) {
    if (side.kind !== "sofa" || side.seats <= 0) continue;
    // The base the cushions rest on: the sofa's half of the strip, up to the cushions' underside.
    b.parts.push(box(w, Math.max(1, half - band), Math.max(1, sofaZ - cushion), vec3(0, sign * ((half + band) / 2), 0), frame));
    const bd = Math.min(60, Math.max(band, 20));
    b.parts.push(box(w, bd, SOFA_BACKREST_MM, vec3(0, sign * (band - bd / 2), sofaZ), body));
  }
  for (const q of lay.cushions) {
    const xs = q.map((p) => p.x);
    const ys = q.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), yA = Math.min(...ys), yB = Math.max(...ys);
    if (x1 - x0 < 20 || yB - yA < 20) continue;
    b.parts.push(box(x1 - x0 - 10, yB - yA, cushion, vec3((x0 + x1) / 2, (yA + yB) / 2, sofaZ - cushion), body));
  }
  return b;
}

// ── column (item-symbol.tsx:948) ────────────────────────────────────────────────────────────────

/** A column: its plinth the whole footprint, 0.12 h high; the shaft a cylinder 0.74 R up to
 *  0.88 h with sixteen flutes every 22.5° (item-symbol.tsx:950, :956) — each a reed standing just
 *  proud of the shaft, so the light picks them out as the plan's lines do; the capital flaring
 *  from the shaft back out to R over the top 0.12 h. Glossy stone in its tone. */
function columnBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const R = Math.min(w, d) / 2;
  const stone = glossMaterial(tone);
  // A column turned to its OWN profile (ItemContext.profile, the editor's ״צללית העמוד״): plinth, shaft
  // and capital as the one turned piece it was drawn as — in the column's own polished stone, which
  // the flat solid it used to become had lost.
  if (ctx.profile && isRound(ctx.footprint)) {
    const turnedColumn = make(stone);
    turnedColumn.parts.push(turnedPart(ctx, ctx.profile, stone));
    return turnedColumn;
  }
  const reed = glossMaterial(darkened(tone, 0.08));
  const b = make(stone);
  const plinth = h * 0.12;
  const capital = h * 0.88;
  for (const outline of footprintOutlines(ctx.footprint)) b.parts.push(extrude(outline, plinth, vec3(0, 0, 0), stone));
  b.parts.push(cyl(R * 0.74, capital - plinth, vec3(0, 0, plinth), stone));
  for (let i = 0; i < 16; i++) {
    const p = polar(R * 0.7, i * 22.5);
    b.parts.push(cyl(R * 0.08, capital - plinth, vec3(p.x, p.y, plinth), reed, R * 0.08, 6));
  }
  b.parts.push(lathe([{ r: R * 0.74, z: capital }, { r: R * 0.8, z: h * 0.94 }, { r: R, z: h * 0.985 }, { r: R, z: h }], vec3(0, 0, 0), stone));
  return b;
}

/** How much of a profiled fountain's height its stone takes — the jet has the rest. */
const FOUNTAIN_BODY = 0.82;

/** The BOWLS of a profile (fractions): its open TOP, and every rim below it where it has widened and
 *  turns back in — a basin's lip, a tier's edge — each wide enough to hold water (over a fifth of
 *  the widest). Where water lies, at the rim's height and reach. */
export function profileBowls(profile: readonly { r: number; z: number }[]): { r: number; z: number }[] {
  const out: { r: number; z: number }[] = [];
  const widest = Math.max(...profile.map((p) => p.r)) || 1;
  let rose = false;
  for (let i = 1; i < profile.length; i++) {
    const p = profile[i];
    const before = profile[i - 1];
    const after = profile[i + 1];
    if (p.r > before.r + 1e-6) rose = true;
    if (p.r < before.r - 1e-6) rose = false;
    const rim = !after || (rose && after.r < p.r - 1e-6);
    if (rim && p.z > 1e-6 && p.r >= widest * 0.2) out.push({ r: p.r, z: p.z });
    if (rim) rose = false;
  }
  return out;
}

// ── fountain (item-symbol.tsx:966) ──────────────────────────────────────────────────────────────

/** A fountain: the basin the whole footprint, 350 high, a stone wall round a well — its rim inset
 *  0.08 R (item-symbol.tsx:987) or 60 mm, whichever is more — the water a plane at 300 inside it
 *  (spec §3.4) in the pool's own water, tinted by the item's tone when it has one (:967); a stem
 *  0.1 R (:992) rising out of the water to 0.7 h with the bowl 0.42 R (:990) on it at 0.6 h, a jet
 *  on up to h, and the splash at its top glowing faintly at night. */
function fountainBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const R = Math.min(w, d) / 2;
  const H = Math.max(h, BASIN_MM + 100);
  const stone = matte(STONE);
  const water: MaterialRef = tone === DEFAULT_TONE.fountain.toLowerCase() ? waterMaterial() : { ...waterMaterial(), colour: tone };
  const b = make(stone);
  // A fountain turned to its OWN profile (ItemContext.profile, ״צללית המזרקה״): its basin and tiers as
  // drawn, in stone — and still a fountain: water lying in every bowl the profile makes (where it
  // turns back in under a rim), the jet rising from its top and the splash glowing at night. Before
  // 2026-11-13 the profile replaced all of it with one pale-blue solid.
  if (ctx.profile && isRound(ctx.footprint)) {
    const body = Math.max(10, h * FOUNTAIN_BODY);
    b.parts.push(turnedPart(ctx, ctx.profile, stone, body));
    for (const bowl of profileBowls(ctx.profile)) b.parts.push(cyl(Math.max(10, bowl.r * (w / 2) * 0.94), 6, vec3(0, 0, bowl.z * body - 6), water));
    b.parts.push(cyl(Math.max(8, R * 0.03), Math.max(10, h - body), vec3(0, 0, body), { colour: SPOUT, kind: "water", opacity: 0.7 }));
    b.emitters.push({ at: vec3(0, 0, h), radiusMm: R * 0.1, colour: SPOUT, strength: 0.6 });
    return b;
  }
  const inset = Math.max(60, R * 0.08);
  for (const outline of footprintOutlines(ctx.footprint)) {
    const inner = scaleOutline(outline, (w / 2 - inset) / (w / 2), (d / 2 - inset) / (d / 2));
    b.parts.push(extrude(outline, BASIN_MM, vec3(0, 0, 0), stone, [inner]));
    b.parts.push(extrude(inner, 20, vec3(0, 0, 0), stone));
    b.parts.push(plane(inner, vec3(0, 0, BASIN_WATER_MM), water));
  }
  const stemTop = H * 0.7;
  b.parts.push(cyl(R * 0.1, stemTop - BASIN_WATER_MM, vec3(0, 0, BASIN_WATER_MM), stone));
  b.parts.push(lathe([{ r: R * 0.12, z: H * 0.56 }, { r: R * 0.3, z: H * 0.585 }, { r: R * 0.42, z: H * 0.62 }, { r: R * 0.42, z: H * 0.635 }, { r: R * 0.38, z: H * 0.635 }, { r: R * 0.14, z: H * 0.6 }], vec3(0, 0, 0), stone));
  b.parts.push(cyl(R * 0.38, 6, vec3(0, 0, H * 0.63), water));
  b.parts.push(cyl(R * 0.03, Math.max(10, H - stemTop), vec3(0, 0, stemTop), { colour: SPOUT, kind: "water", opacity: 0.7 }));
  b.emitters.push({ at: vec3(0, 0, H), radiusMm: R * 0.1, colour: SPOUT, strength: 0.6 });
  return b;
}

// ── arch (item-symbol.tsx:996) ──────────────────────────────────────────────────────────────────

/** An arch, along its longer side: a foot min(D, 0.2 L) square at each end (item-symbol.tsx:997)
 *  rising to 0.9 h, the span bar D·0.38 deep (:998) across the top of them, 120 thick, and the
 *  garland — the runner form of the same drawing an arrangement is, (L − 1.2·foot) × 0.9 D (:1004)
 *  — standing on the span, half D high. Feet and span a dark shade of its tone. */
function archBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  return along(w, d, (L, D) => {
    const foot = Math.min(D, L * 0.2);
    const span = D * 0.38;
    const feetTop = h * ARCH_FEET_SHARE;
    const frame = matte(darkened(tone, 0.45));
    const b = make(frame);
    for (const sx of [-1, 1]) b.parts.push(box(foot, foot, feetTop, vec3(sx * (L / 2 - foot / 2), 0, 0), frame));
    b.parts.push(box(L - foot, span, ARCH_SPAN_MM, vec3(0, 0, feetTop), frame));
    const spec = flowersFor(ctx.product, L - foot * 1.2, D * 0.9, "runner", tone, "arch");
    return merge(b, shifted(flowerBuild(spec, Math.max(40, D * 0.5), tagOf(ctx, "flowers")), 0, 0, feetTop + ARCH_SPAN_MM));
  });
}

// ── gate (item-symbol.tsx gate) ─────────────────────────────────────────────────────────────────

/** Voussoirs in a gate's arch — enough that the curve reads as a curve from across the room. */
const GATE_VOUSSOIRS = 18;

/** A gate (`L` along it): a column at each end — plinth, shaft, capital — and what joins them at the
 *  top (GateStyle): a straight lintel over a square entrance, or a round arch springing from the
 *  capitals with its crown at h. The columns min(D, 0.2 L) square and the beam as deep as the plan's
 *  dashed one. Never under 2.1 m: a gate is walked through. */
function gateBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, tone } = ctx;
  const H = Math.max(ctx.heightMm, 2100);
  return along(w, d, (L, D) => {
    const P = Math.min(D, L * 0.2);
    const cx = L / 2 - P / 2;
    const beam = Math.min(D * 0.62, P * 0.8);
    const stone = glossMaterial(tone);
    const b = make(stone);
    const plinth = H * 0.06;
    const cap = Math.max(80, H * 0.04);
    const arched = ctx.drawStyle === "arched";
    const ring = P * 0.6;
    // Where the columns stop: under the lintel, or where the arch springs so its crown is at h.
    const spring = arched ? Math.max(H * 0.45, H - cx - ring / 2) : H - Math.max(150, H * 0.08);
    for (const sx of [-1, 1]) {
      b.parts.push(box(P, P, plinth, vec3(sx * cx, 0, 0), stone));
      b.parts.push(cyl(P * 0.36, spring - cap - plinth, vec3(sx * cx, 0, plinth), stone));
      b.parts.push(box(P * 0.86, P * 0.86, cap, vec3(sx * cx, 0, spring - cap), stone));
    }
    if (!arched) {
      b.parts.push(box(L, beam, H - spring, vec3(0, 0, spring), stone));
      return b;
    }
    // The arch on the circle through both column centres: each voussoir a box turned a quarter (its
    // width across the gate) and leaned along the curve. A part turned 90° leans toward plan −x
    // (scene-geometry's tilt rule), so the arch is laid from the +x column over to the −x one.
    const chord = 2 * cx * Math.sin(rad(90 / GATE_VOUSSOIRS));
    for (let i = 0; i < GATE_VOUSSOIRS; i++) {
      const p = polar(cx, (180 * i) / GATE_VOUSSOIRS);
      b.parts.push(box(beam, ring, chord * 1.02, vec3(p.x, 0, spring + p.y), stone, 90, (180 * (i + 0.5)) / GATE_VOUSSOIRS));
    }
    return b;
  });
}

// ── tree (item-symbol.tsx:689) ──────────────────────────────────────────────────────────────────

/** A catalog tree (a rented olive, a blossom tree): the venue's own tree (./plants.ts treeParts —
 *  a trunk with limbs, the plan's nine clumps as the crown's core, leaf cards over it) at the row's
 *  size, in its shade. Never less than 1.4 of its radius tall, or the crown would sit on the floor. */
function treeBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const rx = w / 2;
  const ry = d / 2;
  const H = Math.max(h, ((rx + ry) / 2) * 1.4);
  const b = make(foliageMaterial(tone));
  // A crown of its OWN shape (ItemContext.profile, the editor's ״צורת הצמרת״): leaves inside the
  // envelope, trunk where it is thin — a ball on a stem, a cypress, a two-ball topiary.
  b.parts.push(...(ctx.profile && isRound(ctx.footprint) ? treeEnvelopeParts(rx, ry, H, tone, ctx.profile) : treeParts(rx, ry, H, tone)));
  return b;
}

// ── bar (item-symbol.tsx:1110 roundBar, :1130 bar, :1157 shapedBar; lib/catalog/bar-draw.ts) ─

/** The bottle every bar shares: a glass cylinder of its radius, 300 high, instanced per radius. */
function bottle(x: number, y: number, z: number, r: number, tag: NodeTag): InstanceRequest {
  const glass: MaterialRef = { colour: BOTTLE_GLASS, kind: "glass", opacity: 0.6 };
  return {
    key: `bottle:${Math.round(r)}`,
    parts: [cyl(r, BOTTLE_MM * 0.72, vec3(0, 0, 0), glass, r, 10), cyl(r * 0.6, BOTTLE_MM * 0.28, vec3(0, 0, BOTTLE_MM * 0.72), glass, r * 0.35, 8)],
    material: glass,
    tag,
    at: transform(vec3(x, y, z)),
    castShadow: false,
  };
}

function barMaterials(ctx: ItemContext): { body: MaterialRef; counter: MaterialRef } {
  const body = swatchMaterial(ctx.resolved, ctx.product, ctx.tone, "matte", true);
  if (!body.texture && !body.image) body.colour = ctx.tone;
  const counter = glossMaterial(pale(ctx.tone) ? darkened(ctx.tone, 0.12) : darkened(ctx.tone, 0.2));
  return { body, counter };
}

/** A bar: a rectangle is the straight bar (item-symbol.tsx:1130), a round one the round bar
 *  (:1110), anything else — a ח, an oval ring, a horseshoe, an outline drawn by hand — is laid
 *  along its band by bar-draw.ts (:1157 shapedBar). */
function barBody(ctx: ItemContext): ItemBuild {
  const f = ctx.footprint;
  const h = ctx.heightMm > 0 ? ctx.heightMm : BAR_MM;
  if (f.kind === "custom" || f.kind === "multi") return shapedBar(ctx, h);
  if (isRound(f)) return roundBar(ctx, h);
  return along(ctx.widthMm, ctx.depthMm, (L, D) => straightBar(ctx, L, D, h));
}

/** The straight bar (item-symbol.tsx:1130): the counter along its front (+y) with the guests'
 *  top counterTopMm(D) deep (:1131) raised 40 and 50 proud; the back strip counterShelfMm(D)
 *  (:1132) stepped down to 0.85 h as the bottle shelf, floor((L − back)/260) bottles (:1133) down
 *  its middle at the plan's own x (:1145). */
function straightBar(ctx: ItemContext, L: number, D: number, h: number): ItemBuild {
  const { body, counter } = barMaterials(ctx);
  const top = counterTopMm(D);
  const back = counterShelfMm(D);
  const r = bottleRadiusMm(back);
  const n = Math.max(0, Math.floor((L - back) / BOTTLE_PITCH_MM));
  const shelfZ = h * SHELF_SHARE;
  const b = make(body);
  b.parts.push(box(L, D - back, h, vec3(0, back / 2, 0), body));
  b.parts.push(box(L, back, shelfZ, vec3(0, -D / 2 + back / 2, 0), body));
  b.parts.push(box(L, top + COUNTER_PROUD_MM, COUNTER_MM, vec3(0, D / 2 - top / 2 + COUNTER_PROUD_MM / 2, h), counter));
  const tag = tagOf(ctx, "item");
  for (let i = 0; i < n; i++) b.instanced.push(bottle(-L / 2 + back / 2 + ((i + 0.5) * (L - back)) / n, -D / 2 + back / 2, shelfZ, r, tag));
  return b;
}

/** The round bar (item-symbol.tsx:1110): the ring of counter guests stand at, min(0.4 R, 600)
 *  deep (:1112), extruded to h with its well open; the counter top on it; the back bar an island
 *  in the well carrying max(6, round(2π·0.3 R/220)) bottles (:1113) in a ring at 0.3 R (:1121),
 *  stretched with a wide oval as the plan stretches them (:1122). */
function roundBar(ctx: ItemContext, h: number): ItemBuild {
  const { widthMm: w, depthMm: d } = ctx;
  const { body, counter } = barMaterials(ctx);
  const R = Math.min(w, d) / 2;
  const top = Math.min(R * 0.4, 600);
  const outline = footprintOutlines(ctx.footprint)[0];
  const rx = w / 2;
  const ry = d / 2;
  const well = scaleOutline(outline, (rx - top) / rx, (ry - top) / ry);
  const b = make(body);
  b.parts.push(extrude(outline, h, vec3(0, 0, 0), body, [well]));
  b.parts.push(extrude(scaleOutline(outline, (rx + COUNTER_PROUD_MM) / rx, (ry + COUNTER_PROUD_MM) / ry), COUNTER_MM, vec3(0, 0, h), counter, [well]));
  const n = Math.max(6, Math.round((2 * Math.PI * R * 0.3) / 220));
  const r = Math.min(R * 0.05, 45);
  const k = w / d > 1 ? w / d : 1;
  const shelfZ = h * SHELF_SHARE;
  b.parts.push(extrude(ellipseOutline(2 * (R * 0.3 * k + r + 60), 2 * (R * 0.3 + r + 60)), shelfZ, vec3(0, 0, 0), body));
  const tag = tagOf(ctx, "item");
  for (let i = 0; i < n; i++) {
    const p = polar(R * 0.3, (i * 360) / n);
    b.instanced.push(bottle(p.x * k, p.y, shelfZ, r, tag));
  }
  return b;
}

/** A strip's two edges, vertex-paired: `base` on the bar's own edge and `inner` the same vertices
 *  moved into the band (bar-draw.ts offsetVertices, counter()) — a loop is its two rings, a run
 *  is one ring whose second half is the inner edge walked back. */
function stripEdges(s: Strip): { base: Point[]; inner: Point[]; loop: boolean } {
  if (s.length === 2) return { base: s[0], inner: s[1], loop: true };
  const ring = s[0];
  const k = Math.floor(ring.length / 2);
  return { base: ring.slice(0, k), inner: ring.slice(k).reverse(), loop: false };
}

const stripShape = (base: Point[], inner: Point[], loop: boolean): { outline: BuiltOutline; holes?: BuiltOutline[] } =>
  loop ? { outline: { outline: base }, holes: [{ outline: inner }] } : { outline: { outline: [...base, ...[...inner].reverse()] } };

/** The nearest point to `p` on a polyline (closed when `loop`). */
function nearestOn(p: Point, pts: Point[], loop: boolean): Point {
  let best = pts[0];
  let bestD = Infinity;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const dd = Math.hypot(p.x - q.x, p.y - q.y);
    if (dd < bestD) {
      bestD = dd;
      best = q;
    }
  }
  return best;
}

/** Where a counter-top vertex goes to stand COUNTER_PROUD_MM proud of the guests' edge. The strip's
 *  inner ring is the base offset along each edge's normal, so `p − q` is the vertex's mitre; a fixed
 *  push along it left a square corner only 50·cos 45° ≈ 35 proud of each edge. Scaling the mitre by
 *  the depth it makes across the adjacent edges puts the overhang at 50 perpendicular to both — the
 *  same arithmetic offsetVertices (bar-draw.ts) uses to make the strip. */
function proudVertex(base: Point[], inner: Point[], i: number, loop: boolean): Point {
  const p = base[i];
  const q = inner[i];
  if (!q) return p;
  const m = { x: p.x - q.x, y: p.y - q.y };
  const len = Math.hypot(m.x, m.y);
  if (len < 1e-6) return p;
  let perp = 0;
  const n = base.length;
  for (const j of [i - 1, i + 1]) {
    if (!loop && (j < 0 || j >= n)) continue;
    const r = base[(j + n) % n];
    const ex = r.x - p.x;
    const ey = r.y - p.y;
    const el = Math.hypot(ex, ey);
    if (el < 1e-6) continue;
    // The edge's normal, turned to the mitre's side: how deep the mitre reaches across this edge.
    perp = Math.max(perp, Math.abs((m.x * -ey + m.y * ex) / el));
  }
  if (perp < 1) perp = len;
  // A very sharp corner's mitre is held to three overhangs, as the strip's own is (bar-draw.ts reach).
  const k = Math.min(COUNTER_PROUD_MM / perp, (3 * COUNTER_PROUD_MM) / len);
  return { x: p.x + m.x * k, y: p.y + m.y * k };
}

/** A bar of any other shape (item-symbol.tsx:1157 shapedBar, lib/catalog/bar-draw.ts): the
 *  bar's own pieces extruded to h in the row's texture; the `front` strips — the counter along
 *  the guests' edges — as the counter top, raised 40 and pushed 50 proud of the edge (each base
 *  vertex moved out along its pair); the `shelf` strips — the bartender's side — as a ledge at
 *  0.85 h: the plan draws the shelf INSIDE the band because it is under the counter's overhang,
 *  and a solid counter would bury it, so the strip is folded out across the inner edge and its
 *  bottles with it (what a bartender's underbar shelf is); the added parts (`backs`) as back
 *  bars, display counters 1500 high with their bottles on top; bottles in a well (a capsule's,
 *  bar-draw.ts "guests all round") on the counter top. Every bottle is barDrawing's. */
function shapedBar(ctx: ItemContext, h: number): ItemBuild {
  const { body, counter } = barMaterials(ctx);
  const b = make(body);
  const pieces = footprintOutlines(ctx.footprint);
  const d = barDrawing(ctx.footprint);
  for (let i = 0; i < pieces.length; i++) if (pieceOf(pieces[i], i) === 0) b.parts.push(extrude(pieces[i], h, vec3(0, 0, 0), body));
  const backRings = d.backs.map((o) => flatRing(o));
  // A back bar stands BACK_BAR_MM from the floor — unless the shape it is drawn from carries a height
  // of its own (ShapePart.zMm / heightMm, the element model): then it stands at its z, as tall as it
  // says — a shelf a metre up the back wall, a raised display — and its bottles stand on its top.
  // d.backs is the pieces that are not the base's, in order, so the j-th back is the j-th such piece.
  // …skipping a front panel's band (its `face`), which bar-draw leaves out of the backs.
  const backShapes = pieces.flatMap((p, i) => (pieceOf(p, i) !== 0 && !p.face ? [pieceOf(p, i)] : []));
  const backTops = d.backs.map((o, j) => {
    const spec = ctx.product?.appearance?.parts?.[backShapes[j] - 1];
    const own = !!spec && (spec.zMm !== undefined || spec.heightMm !== undefined);
    const z = own ? (spec.zMm ?? 0) : 0;
    const hh = own ? (spec.heightMm ?? h) : BACK_BAR_MM;
    b.parts.push(extrude(o, Math.max(10, hh), vec3(0, 0, z), body));
    return z + Math.max(10, hh);
  });

  for (const s of d.front) {
    const { base, inner, loop } = stripEdges(s);
    const proud = base.map((p, i) => proudVertex(base, inner, i, loop));
    const { outline, holes } = stripShape(proud, inner, loop);
    b.parts.push(extrude(outline, COUNTER_MM, vec3(0, 0, h), counter, holes));
  }

  const shelfZ = h * SHELF_SHARE;
  const shelves = d.shelf.map(stripEdges);
  for (const { base, inner, loop } of shelves) {
    const out = inner.map((q, i) => {
      const p = base[i] ?? q;
      return { x: 2 * p.x - q.x, y: 2 * p.y - q.y };
    });
    const { outline, holes } = stripShape(base, out, loop);
    b.parts.push(extrude(outline, SHELF_MM, vec3(0, 0, shelfZ), counter, holes));
  }

  const tag = tagOf(ctx, "item");
  for (const o of d.bottles) {
    const onBack = backRings.findIndex((ring) => signedDistance(o.x, o.y, ring) > 0);
    if (onBack >= 0) {
      b.instanced.push(bottle(o.x, o.y, backTops[onBack], o.r, tag));
      continue;
    }
    if (!shelves.length) {
      b.instanced.push(bottle(o.x, o.y, h, o.r, tag));
      continue;
    }
    let q: Point = o;
    let best = Infinity;
    for (const { base, loop } of shelves) {
      const n = nearestOn(o, base, loop);
      const dd = Math.hypot(n.x - o.x, n.y - o.y);
      if (dd < best) {
        best = dd;
        q = n;
      }
    }
    b.instanced.push(bottle(2 * q.x - o.x, 2 * q.y - o.y, shelfZ, o.r, tag));
  }
  return b;
}

// ── chuppah (item-symbol.tsx:1011 chuppah, :1065 rotunda) ──────────────────────────────────────

/** A chuppah (lib/catalog/chuppah.ts — ONE layout with the plan's, item-symbol.tsx chuppah): its
 *  posts at their REAL size in their finish (the plan's pole is m·0.045, a disc to be seen from
 *  above; built that thick it was a 27 cm column) up to the eave, a frame along their tops — what the
 *  cloth, the cloud and the drapes hang from, so nothing floats — and the roof: a cloth and the sag
 *  under it (as always), a sheer, a cloud of flowers, open slats, or nothing. A ROUND one's roof
 *  follows the base's body (a dome, an onion, a peak — PROFILE_IS_PICTURE) as a two-sided sheet, a
 *  flower envelope or ribs, never a solid. The flowers go where the layout puts them (the two front
 *  posts' posies at 2/3 h unless told otherwise), a meadow at the posts' feet, a sheer let fall at
 *  every post with a valance between them; hung (no posts) it rides on cables to the ceiling. */
function chuppahBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const m = Math.min(w, d);
  const c = chuppahOf(ctx.chuppah);
  const round = isRound(ctx.footprint);
  const drawn = !round && ctx.footprint.kind === "custom" ? ctx.footprint.outline : undefined;
  const L = chuppahLayout(w, d, round, c, drawn);
  const eaveZ = h * L.eave;
  const cloth = clothMaterial(tone);
  const sheer: MaterialRef = { ...clothMaterial(tone), opacity: SHEER_OPACITY };
  const post = chuppahPostMaterial(c.finish, tone);
  const tag = tagOf(ctx, "flowers");
  let b = make(cloth);
  for (const p of L.posts) b.parts.push(cyl(L.postR, eaveZ, vec3(p.x, p.y, 0), post));

  // The frame along the posts' tops (a hung one's along its rim): a ring on a round one.
  const foot = round && c.profile ? profileAt(c.profile, 0) : 1;
  const ringK = L.posts.length ? 0.82 : 0.96;
  const frame: Point[] = round
    ? Array.from({ length: 33 }, (_, i) => polarXY((w / 2) * foot * ringK, (d / 2) * foot * ringK, (360 * i) / 32))
    : L.posts.length >= 3
      ? closed([...L.posts].sort((p, q) => Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x)))
      : closed(drawn ? [...drawn] : [{ x: -w * 0.48, y: -d * 0.48 }, { x: w * 0.48, y: -d * 0.48 }, { x: w * 0.48, y: d * 0.48 }, { x: -w * 0.48, y: d * 0.48 }]);
  const beam = L.postR * 0.55;
  if (c.roof !== "none" || c.drapes) {
    for (let i = 1; i < frame.length; i++) b.parts.push(rodPart(vec3(frame[i - 1].x, frame[i - 1].y, eaveZ), vec3(frame[i].x, frame[i].y, eaveZ), beam, post));
  }

  // The roof.
  if (c.roof === "cloth" || c.roof === "sheer") {
    const mat = c.roof === "cloth" ? cloth : sheer;
    if (round && c.profile) b.parts.push(roofSheet(c.profile, w / 2, d / 2, L.eave, h, mat));
    else
      for (const outline of footprintOutlines(ctx.footprint)) {
        b.parts.push(plane(outline, vec3(0, 0, h), mat, "both"));
        b.parts.push(plane(scaleOutline(outline, CANOPY_INSET, CANOPY_INSET), vec3(0, 0, h - CANOPY_SAG_MM), mat, "both"));
      }
  } else if (c.roof === "flowers") {
    // A cloud of flowers (lib/catalog/chuppah.ts cloudFlowers — the plan's own): on a round one's
    // roof section when it has one, else a lens on the frame — one per square-ish stretch of a long
    // chuppah — dressed top, side and UNDER, which is what the couple under it see.
    const seedKey = ctx.product?.id ?? "chuppah";
    if (round && c.profile) {
      b = merge(b, shifted(flowerBuild(cloudFlowers(w, d, c.bloom, seedKey, roofSection(c.profile, L.eave)), Math.max(200, (1 - L.eave) * h), tag), 0, 0, eaveZ));
    } else {
      const th = Math.max(300, Math.min(700, m * 0.2));
      for (const piece of cloudPieces(w, d, round)) {
        b = merge(b, shifted(flowerBuild(cloudFlowers(piece.w, piece.d, c.bloom, seedKey, CLOUD_LENS), th, tag), piece.x, piece.y, eaveZ - th * 0.45));
      }
    }
  } else if (c.roof === "open") {
    if (round && c.profile) {
      // Ribs up the roof's section from the ring to its crown — a birdcage.
      const profile = c.profile;
      const ribs = Math.max(8, L.posts.length);
      for (let k = 0; k < ribs; k++) {
        const a = (360 * k) / ribs;
        let prev: Vec3 | null = null;
        for (let i = 0; i <= 10; i++) {
          const z = L.eave + (1 - L.eave) * (i / 10);
          const s = profileAt(profile, z) * ringK;
          const q = polarXY((w / 2) * s, (d / 2) * s, a);
          const v = vec3(q.x, q.y, z * h);
          if (prev) b.parts.push(rodPart(prev, v, beam * 0.7, post));
          prev = v;
        }
      }
    } else if (round || drawn) {
      // Spokes from the ring (every 45°) or from every post to the middle.
      const tips = round ? Array.from({ length: 8 }, (_, k) => polarXY((w / 2) * ringK, (d / 2) * ringK, 45 * k)) : L.posts;
      for (const t of tips) b.parts.push(rodPart(vec3(t.x, t.y, eaveZ), vec3(0, 0, eaveZ + m * 0.04), beam * 0.8, post));
    } else if (L.posts.length) {
      // Slats across the short span, every SLAT_PITCH_MM along the long one.
      const long = w >= d;
      const spanL = Math.max(...L.posts.map((p) => Math.abs(long ? p.x : p.y)));
      const spanS = Math.max(...L.posts.map((p) => Math.abs(long ? p.y : p.x)));
      const n = Math.max(2, Math.floor((2 * spanL) / SLAT_PITCH_MM));
      for (let i = 0; i <= n; i++) {
        const t = -spanL + (2 * spanL * i) / n;
        const a = long ? vec3(t, -spanS, eaveZ + beam) : vec3(-spanS, t, eaveZ + beam);
        const z = long ? vec3(t, spanS, eaveZ + beam) : vec3(spanS, t, eaveZ + beam);
        b.parts.push(rodPart(a, z, beam * 0.7, post));
      }
    }
  }

  // Sheer drapes: a panel gathered at every post, a valance swagged between them.
  if (c.drapes) {
    for (const p of L.posts) {
      const out = Math.atan2(p.y, p.x);
      const path = Array.from({ length: 7 }, (_, i) => {
        const a = out - 1.2 + (2.4 * i) / 6;
        return { x: p.x + (L.postR + 35) * Math.cos(a), y: p.y + (L.postR + 35) * Math.sin(a) };
      });
      b.parts.push({ shape: "ribbon", path, h: eaveZ, at: vec3(0, 0, 0), pleatMm: 70, amplitudeMm: 18, material: sheer });
    }
    const drop = Math.min(500, h * 0.18);
    b.parts.push({ shape: "ribbon", path: frame, h: drop, at: vec3(0, 0, eaveZ - drop), pleatMm: 160, amplitudeMm: 40, material: sheer });
  }

  // Hung: on cables from the frame up to the ceiling (a metre and a half, under open sky).
  if (!L.posts.length) {
    const up = ctx.chainMm ? h + ctx.chainMm : eaveZ + HUNG_CABLE_MM;
    const anchors = round ? [0, 8, 16, 24].map((i) => frame[i]) : frame.slice(0, -1);
    for (const q of anchors) b.parts.push(rodPart(vec3(q.x, q.y, eaveZ), vec3(q.x, q.y, up), 2, metalMaterial(CABLE)));
  }

  // The flowers, and the meadow at the posts' feet.
  for (const s of L.spots) {
    const tall = s.size * 0.5;
    const atTop = s.z >= L.eave - 1e-6;
    const spec = flowersFor(ctx.product, s.size, s.size, s.form, c.bloom, "chuppah");
    b = merge(b, shifted(flowerBuild(spec, tall, tag), s.x, s.y, s.z * h - (atTop ? tall * 0.35 : 0)));
  }
  for (const s of L.meadow) {
    const spec = flowersFor(ctx.product, s.size, s.size, "cushion", c.bloom, "chuppah-meadow");
    b = merge(b, shifted(flowerBuild(spec, Math.min(350, h * 0.13), tag), s.x, s.y, 0));
  }
  return b;
}

/** A post in its finish; metal in a darker cut of the row's tone, as a chuppah always was. */
function chuppahPostMaterial(f: ChuppahFinish, tone: string): MaterialRef {
  switch (f) {
    case "gold":
      return metalMaterial(CHUPPAH_FINISH_COLOUR.gold!);
    case "wood":
      return matte(CHUPPAH_FINISH_COLOUR.wood!);
    case "white":
      return glossMaterial(CHUPPAH_FINISH_COLOUR.white!);
    case "acrylic":
      return { colour: CHUPPAH_FINISH_COLOUR.acrylic!, kind: "glass", opacity: 0.4 };
    case "birch":
      return matte(CHUPPAH_FINISH_COLOUR.birch!);
    default:
      return metalMaterial(darkened(tone, 0.45));
  }
}

/** A point on an ellipse `rx` × `ry`, `deg` round from +x. */
const polarXY = (rx: number, ry: number, deg: number): Point => ({ x: rx * Math.cos(rad(deg)), y: ry * Math.sin(rad(deg)) });
const closed = (pts: Point[]): Point[] => (pts.length ? [...pts, pts[0]] : pts);

/** A cylinder from `a` to `c` — a beam, a slat, a rib, a cable. */
function rodPart(a: Vec3, c: Vec3, r: number, material: MaterialRef): Part {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const dz = c.z - a.z;
  const across = Math.hypot(dx, dy);
  const p: Part = { shape: "cylinder", rTop: r, rBottom: r, h: Math.max(1, Math.hypot(dx, dy, dz)), at: a, segments: 8, material };
  if (across > 1e-6) {
    p.rotDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    p.tiltDeg = (Math.atan2(across, dz) * 180) / Math.PI;
  } else if (dz < 0) p.tiltDeg = 180;
  return p;
}

/** A round roof's cloth: the base's body from the eave to the crown, a two-sided sheet. */
function roofSheet(profile: RevolvePoint[], rx: number, ry: number, eave: number, h: number, material: MaterialRef): Part {
  const rows: Vec3[][] = [];
  for (let k = 0; k <= 10; k++) {
    const z = eave + (1 - eave) * (k / 10);
    const s = profileAt(profile, z);
    rows.push(Array.from({ length: 37 }, (_, i) => vec3(rx * s * Math.cos((2 * Math.PI * i) / 36), ry * s * Math.sin((2 * Math.PI * i) / 36), z * h)));
  }
  return { shape: "sheet", rows, at: vec3(0, 0, 0), material };
}

/** The roof's part of a round chuppah's body, as a flower envelope of its own (fractions again). */
function roofSection(profile: RevolvePoint[], eave: number): RevolvePoint[] {
  return Array.from({ length: 13 }, (_, i) => {
    const z = eave + (1 - eave) * (i / 12);
    return { r: Math.max(0.02, profileAt(profile, z)), z: i / 12 };
  });
}


/** A rotunda chuppah (item-symbol.tsx:1065): eight columns at 90 + 45·(i + ½)° on 0.92 of the
 *  radii (:1075, :1093) — so the front is an opening — each m·0.075 thick (:1076) on a square
 *  plinth 2.5 times that (:1096), rising to the entablature: a ring at 0.99 and one at 0.84 of
 *  the radii (:1088–1089) as two tori at the top; the drapes between neighbouring back columns
 *  (sin of the pair's middle < −0.2, :1091) as pleated cloth let fall from under the entablature;
 *  the floor it stands on a low podium in its tone. */
function rotundaBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, heightMm: h, tone } = ctx;
  const rx = w / 2;
  const ry = d / 2;
  const m = Math.min(rx, ry);
  const N = 8;
  const at = (deg: number, k: number): Point => ({ x: rx * k * Math.cos(rad(deg)), y: ry * k * Math.sin(rad(deg)) });
  const angles = Array.from({ length: N }, (_, i) => 90 + (360 / N) * (i + 0.5));
  const col = m * 0.075;
  const stone = glossMaterial(ROTUNDA_STONE);
  const cloth = clothMaterial(ROTUNDA_CLOTH);
  const b = make(stone);
  for (const outline of footprintOutlines(ctx.footprint)) b.parts.push(extrude(outline, 40, vec3(0, 0, 0), matte(tone)));
  const colTop = h * 0.92;
  for (const a of angles) {
    const p = at(a, 0.92);
    b.parts.push(box(col * 2.5, col * 2.5, ROTUNDA_PLINTH_MM, vec3(p.x, p.y, 0), stone));
    b.parts.push(cyl(col, colTop - ROTUNDA_PLINTH_MM, vec3(p.x, p.y, ROTUNDA_PLINTH_MM), stone));
    b.parts.push(cyl(col, h * 0.95 - colTop, vec3(p.x, p.y, colTop), stone, col * 1.3));
  }
  b.parts.push(torus(m * 0.92, h * 0.03, vec3(0, 0, h * 0.95), stone));
  b.parts.push(torus(m * 0.84, h * 0.02, vec3(0, 0, h * 0.95), stone));
  const back = angles.map((a, i) => [a, angles[(i + 1) % N] + (i === N - 1 ? 360 : 0)] as const).filter(([a0, a1]) => Math.sin(rad((a0 + a1) / 2)) < -0.2);
  for (const [a0, a1] of back) {
    const steps = 6;
    const path = Array.from({ length: steps + 1 }, (_, i) => at(a0 + ((a1 - a0) * i) / steps, 0.92));
    b.parts.push({ shape: "ribbon", path, h: h * 0.9, at: vec3(0, 0, 0), pleatMm: 150, amplitudeMm: 40, material: cloth });
  }
  return b;
}

// ── flights and ramps standing alone (lib/venues/climb.ts, lib/studio/climb-item.ts) ───────────

/** What the venue's climb rules read off this item at the size it is drawn (climb-item.ts
 *  itemClimbHost): a straight flight, its rise the placement's (ctx.climb, climbRise). */
function climbHost(ctx: ItemContext, kind: "stairs" | "ramp"): ClimbHost {
  const rise = ctx.climb?.heightMm ?? ctx.heightMm;
  return { kind, shape: "rect", widthMm: ctx.widthMm, depthMm: ctx.depthMm, heightMm: Math.max(0, rise), climb: { reversed: ctx.climb?.reversed, risers: ctx.climb?.risers } };
}

/** A flight: one solid step per tread, the treads the depth over climbTreads (climb.ts
 *  treadDepthMm — risers of at most 18 cm, the last one landing on the upper floor), each box
 *  rising riserHeightMm more than the one before it from the foot, the HEAD at −y unless
 *  reversed (climbDrawing: `up`). The plan's tread lines are these boxes' edges. */
function stairsBody(ctx: ItemContext): ItemBuild {
  const host = climbHost(ctx, "stairs");
  const { widthMm: w, depthMm: d, tone } = ctx;
  const n = climbTreads(host);
  const tread = treadDepthMm(host);
  const riser = riserHeightMm(host);
  const up = host.climb?.reversed ? 1 : -1;
  const step = matte(tone);
  const b = make(step);
  for (let k = 0; k < n; k++) {
    // Tread k from the foot: its top one riser higher than the last, its run `tread` along the climb.
    b.parts.push(box(w, tread, Math.max(1, riser * (k + 1)), vec3(0, -up * (d / 2 - (k + 0.5) * tread), 0), step));
  }
  return b;
}

/** A ramp: a slab 60 thick leaning from the foot (z 0) up to the head (the rise) over the run
 *  (`tiltDeg` = atan(rise/run), tipping the −y end up — or the +y end when reversed), a landing
 *  200 deep at the head's height, a kerb 80 high along each side leaning with the slab. */
function rampBody(ctx: ItemContext): ItemBuild {
  const host = climbHost(ctx, "ramp");
  const { widthMm: w, depthMm: d, tone } = ctx;
  const rise = host.heightMm;
  const up = host.climb?.reversed ? 1 : -1;
  const slab = matte(tone);
  const kerb = matte(darkened(tone));
  const b = make(slab);
  const slant = Math.hypot(d, rise);
  const tilt = (Math.atan2(rise, d) * 180) / Math.PI * -up;
  b.parts.push(box(w, slant, RAMP_SLAB_MM, vec3(0, 0, rise / 2), slab, undefined, tilt));
  for (const sx of [-1, 1]) b.parts.push(box(RAMP_KERB_W_MM, slant, RAMP_SLAB_MM + RAMP_KERB_MM, vec3(sx * (w / 2 - RAMP_KERB_W_MM / 2), 0, rise / 2), kerb, undefined, tilt));
  if (rise > 0) b.parts.push(box(w, Math.min(RAMP_LANDING_MM, d), rise + RAMP_SLAB_MM, vec3(0, up * (d / 2 - Math.min(RAMP_LANDING_MM, d) / 2), 0), slab));
  return b;
}

// ── rug (item-symbol.tsx:1291 RugPattern) ───────────────────────────────────────────────────────

/** A rug: a 12 mm slab in its swatch (its texture or picture when the row has one), the woven
 *  border — the band between the plan's two border lines, min(0.07 m, 160) and min(0.12 m, 260)
 *  in from the edge (item-symbol.tsx:1293–1294) — as four thin strips a shade darker on top, and
 *  the fringe min(70, 0.05 m) (:1295) off the two SHORT ends (:1300) as small boxes, at most
 *  twenty an end so the part count stays modest. */
/** AN AISLE's runner (lib/catalog/aisle.ts): a strip of cloth down its walk, in the aisle's own frame
 *  — length along x, centred on (0, y) — a rug thick, with a hem a shade darker along each long edge. */
export function aisleRunnerBody(runner: { widthMm: number; lengthMm: number; y: number; colour: string }): ItemBuild {
  const cloth: MaterialRef = { colour: runner.colour, kind: "fabric" };
  const hemTone: MaterialRef = { colour: darkened(runner.colour, 0.12), kind: "fabric" };
  const b = make(cloth);
  b.parts.push(box(runner.lengthMm, runner.widthMm, RUG_MM, vec3(0, runner.y, 0), cloth));
  const hem = Math.min(60, runner.widthMm * 0.06);
  if (hem > 4) for (const s of [-1, 1]) b.parts.push(box(runner.lengthMm, hem, RUG_BAND_MM, vec3(0, runner.y + s * (runner.widthMm / 2 - hem * 1.5), RUG_MM), hemTone));
  return b;
}

export function rugBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, tone } = ctx;
  const fabric = swatchMaterial(ctx.resolved, ctx.product, tone, "fabric", true);
  const weave: MaterialRef = { colour: darkened(tone, 0.2), kind: "fabric" };
  const b = make(fabric);
  const m = Math.min(w, d);
  const b1 = Math.min(m * 0.07, 160);
  const b2 = Math.min(m * 0.12, 260);
  const band = b2 - b1;
  if (ctx.carpet) return outlineRugBody(ctx, b, weave, { m, b1, b2 });
  if (ctx.border) return borderedRugBody(ctx, b, fabric, ctx.border);
  if (ctx.rug) return curvedRugBody(ctx, b, weave, { m, b1, b2 });
  b.parts.push(box(w, d, RUG_MM, vec3(0, 0, 0), fabric));
  if (band > 2 && m > b2 * 3) {
    for (const sy of [-1, 1]) b.parts.push(box(w - b1 * 2, band, RUG_BAND_MM, vec3(0, sy * (d / 2 - b1 - band / 2), RUG_MM), weave));
    for (const sx of [-1, 1]) b.parts.push(box(band, d - b2 * 2, RUG_BAND_MM, vec3(sx * (w / 2 - b1 - band / 2), 0, RUG_MM), weave));
  }
  const fringe = Math.min(70, m * 0.05);
  const short = Math.min(w, d);
  const n = Math.min(RUG_FRINGE_MAX, Math.floor(short / RUG_FRINGE_PITCH_MM));
  for (let i = 0; i < n; i++) {
    const along = -short / 2 + ((i + 0.5) * short) / n;
    for (const s of [-1, 1]) {
      if (w >= d) b.parts.push(box(fringe, RUG_FRINGE_W_MM, RUG_FRINGE_W_MM, vec3(s * (w / 2 + fringe / 2), along, 0), weave));
      else b.parts.push(box(RUG_FRINGE_W_MM, fringe, RUG_FRINGE_W_MM, vec3(along, s * (d / 2 + fringe / 2), 0), weave));
    }
  }
  return b;
}

/** A rug with curved sides or rounded corners (lib/studio/rug-shape.ts): the slab is the shaped
 *  outline extruded, the border a ring between two insets of it (the same bows and concentric arcs
 *  on a smaller rectangle — the plan's two border lines), and each strand of fringe a small box
 *  leaving the short end's run along the curve's normal. Everything about the rectangle's centre,
 *  as the plan draws it. */
function curvedRugBody(ctx: ItemContext, b: ItemBuild, weave: MaterialRef, k: { m: number; b1: number; b2: number }): ItemBuild {
  const { widthMm: w, depthMm: d, rug } = ctx;
  if (!rug) return b;
  const slab = rugOutline(w, d, rug);
  b.parts.push({ shape: "extrude", outline: { outline: slab.outline, edgeCurves: slab.edgeCurves }, h: RUG_MM, at: vec3(0, 0, 0) });
  const inner = rugInset(w, d, rug, k.b1);
  const outer = k.m > k.b2 * 3 ? rugInset(w, d, rug, k.b2) : null;
  if (inner && outer && k.b2 - k.b1 > 2) {
    b.parts.push({
      shape: "extrude",
      outline: { outline: inner.outline, edgeCurves: inner.edgeCurves },
      holes: [{ outline: outer.outline, edgeCurves: outer.edgeCurves }],
      h: RUG_BAND_MM,
      at: vec3(0, 0, RUG_MM),
      material: weave,
    });
  }
  const fringe = Math.min(70, k.m * 0.05);
  for (const t of rugFringe(w, d, rug, RUG_FRINGE_PITCH_MM, RUG_FRINGE_MAX)) {
    const deg = (Math.atan2(t.ny, t.nx) * 180) / Math.PI;
    // A box turned about its own centre: put the centre half a strand out along the normal.
    b.parts.push(box(fringe, RUG_FRINGE_W_MM, RUG_FRINGE_W_MM, vec3(t.x + (t.nx * fringe) / 2, t.y + (t.ny * fringe) / 2, 0), weave, deg));
  }
  return b;
}

/** A carpet laid to an OUTLINE (Placement.outline — over a surface or a stage, lib/studio/cover.ts):
 *  the slab is that outline extruded with its holes cut out (a stage's trap, a column through it),
 *  and on top either the contour's bands in their colours (borderBands along the outline) or the
 *  weave's band — the ring between the plan's two border lines, the outline pulled in evenly. No
 *  fringe: an arbitrary outline has no short ends a rug is woven from, and the plan draws none. */
function outlineRugBody(ctx: ItemContext, b: ItemBuild, weave: MaterialRef, k: { m: number; b1: number; b2: number }): ItemBuild {
  const carpet = ctx.carpet;
  if (!carpet) return b;
  const base: BuiltOutline = { outline: carpet.outline, ...(carpet.edgeCurves ? { edgeCurves: carpet.edgeCurves } : {}) };
  b.parts.push({ shape: "extrude", outline: base, ...(carpet.holes.length ? { holes: carpet.holes.map((h) => ({ outline: h })) } : {}), h: RUG_MM, at: vec3(0, 0, 0) });
  if (ctx.border) {
    for (const band of borderBands(base, ctx.border)) {
      b.parts.push({
        shape: "extrude",
        outline: band.outer,
        ...(band.inner ? { holes: [band.inner] } : {}),
        h: RUG_BAND_MM,
        at: vec3(0, 0, RUG_MM),
        material: clothMaterial(hexOf(band.colour) ?? darkened(ctx.tone, 0.2)),
      });
    }
    return b;
  }
  const inner = evenInset(base, k.b1);
  const outer = k.m > k.b2 * 3 ? evenInset(base, k.b2) : null;
  if (inner && outer && k.b2 - k.b1 > 2) b.parts.push({ shape: "extrude", outline: inner, holes: [outer], h: RUG_BAND_MM, at: vec3(0, 0, RUG_MM), material: weave });
  return b;
}

/** A rug with a CONTOUR (lib/catalog/border.ts): its slab as always (the plain box, or the shaped
 *  outline extruded), each band a flat ring RUG_BAND_MM thick on top — its outer edge and its inner
 *  one cut out, the plan's own bands (rugBorderBands: bows and rounded corners followed) — in the
 *  band's colour, and the fringe the contour's: on or off, in its colour. A band mesh, not a texture:
 *  a curved rug's band follows its outline exactly where a painted canvas would have to be stretched
 *  over it. One material per colour, so identical rugs still share theirs. */
function borderedRugBody(ctx: ItemContext, b: ItemBuild, fabric: MaterialRef, border: Border): ItemBuild {
  const { widthMm: w, depthMm: d, rug, tone } = ctx;
  if (rug) {
    const slab = rugOutline(w, d, rug);
    b.parts.push({ shape: "extrude", outline: { outline: slab.outline, edgeCurves: slab.edgeCurves }, h: RUG_MM, at: vec3(0, 0, 0) });
  } else b.parts.push(box(w, d, RUG_MM, vec3(0, 0, 0), fabric));
  for (const band of rugBorderBands(w, d, rug, border)) {
    b.parts.push({
      shape: "extrude",
      outline: band.outer,
      ...(band.inner ? { holes: [band.inner] } : {}),
      h: RUG_BAND_MM,
      at: vec3(0, 0, RUG_MM),
      material: clothMaterial(hexOf(band.colour) ?? darkened(tone, 0.2)),
    });
  }
  const fr = fringeOf(border, "rugs");
  if (fr.on) {
    const strand = clothMaterial(hexOf(fr.colour) ?? darkened(tone, 0.2));
    const fringe = Math.min(70, Math.min(w, d) * 0.05);
    for (const t of rugFringe(w, d, rug, RUG_FRINGE_PITCH_MM, RUG_FRINGE_MAX)) {
      const deg = (Math.atan2(t.ny, t.nx) * 180) / Math.PI;
      b.parts.push(box(fringe, RUG_FRINGE_W_MM, RUG_FRINGE_W_MM, vec3(t.x + (t.nx * fringe) / 2, t.y + (t.ny * fringe) / 2, 0), strand, deg));
    }
  }
  return b;
}

// ── pergola (components/pergola-glyph.tsx, lib/venues/pergola.ts) ───────────────────────────────

/** A slat's section and a lattice batten's, and the cloth's lift over the beams. */
const SLAT_W_MM = 45;
const SLAT_H_MM = 90;
const SOLID_ROOF_MM = 80;
const BATTEN_MM = 30;
const BATTEN_PITCH_MM = 150;
const LATTICE_FOOT_MM = 100;

/** A box laid along a segment, `w` wide and `h` high, its bottom at `z` — a beam, a slat, a rail. */
function alongSeg(a: Point, b: Point, w: number, h: number, z: number, material: MaterialRef, extend = 0): Part | null {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1) return null;
  return box(L + extend, w, h, vec3((a.x + b.x) / 2, (a.y + b.y) / 2, z), material, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}

/** A pergola — the venue's own (ctx.pergola, envelope.ts featureBodies) or a hired row (its post
 *  from categoryFields.postMm, its roof its drawing style) — from the geometry the plan draws: a
 *  square post at every post of pergolaGeometry, from the floor to the beams; a beam along every
 *  side on the beam line, a fifth wider than deep; and across the top, by its roof: slats as thin
 *  boxes at their spacing on top of the beams, one solid slab, a cloth plane in the row's shade a
 *  hair over them, or nothing. A closed side is a lattice — vertical battens every 15 cm along the
 *  beam line, on a bottom rail, up to the beam. Its top is the pergola's height whatever the roof. */
export function pergolaBody(ctx: ItemContext): ItemBuild {
  const spec = ctx.pergola ?? pergolaFromStyle(ctx.drawStyle, pergolaPostOf(ctx.product));
  const g = pergolaGeometry(ctx.footprint, spec);
  if (!g) return fallbackBody(ctx);
  const H = Math.max(ctx.heightMm, 1000);
  const wood = matte(ctx.tone);
  const b = make(wood);
  const P = g.postMm;
  const beamW = Math.max(40, P * 0.8);
  const beamH = Math.max(120, P * 1.2);
  const roofDepth = spec.roof === "slats" ? SLAT_H_MM : spec.roof === "solid" ? SOLID_ROOF_MM : 0;
  const beamTop = H - roofDepth;
  const beamBottom = beamTop - beamH;
  for (const post of g.posts) b.parts.push(box(P, P, beamTop, vec3(post.at.x, post.at.y, 0), wood, post.deg));
  const ring = g.ring;
  ring.forEach((a, i) => {
    const part = alongSeg(a, ring[(i + 1) % ring.length], beamW, beamH, beamBottom, wood, beamW * 0.5);
    if (part) b.parts.push(part);
  });
  if (spec.roof === "slats") {
    for (const [a, c] of pergolaLines(g, g.slatDeg, g.spacingMm)) {
      const part = alongSeg(a, c, SLAT_W_MM, SLAT_H_MM, beamTop, wood, beamW);
      if (part) b.parts.push(part);
    }
  } else if (spec.roof === "solid") {
    b.parts.push(extrude({ outline: g.outline }, SOLID_ROOF_MM, vec3(0, 0, beamTop), wood));
  } else if (spec.roof === "fabric") {
    b.parts.push(plane({ outline: ring }, vec3(0, 0, beamTop + 5), clothMaterial(ctx.tone), "both"));
  }
  // Lattice panels: battens up from a bottom rail to the beam, along the beam line.
  for (const i of spec.closedSides ?? []) {
    const side = g.sides[i];
    if (!side) continue;
    const path = side.inner;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1];
      const c = path[k];
      const L = Math.hypot(c.x - a.x, c.y - a.y);
      if (L < 1) continue;
      const rail = alongSeg(a, c, BATTEN_MM, BATTEN_MM, LATTICE_FOOT_MM, wood);
      if (rail) b.parts.push(rail);
      const deg = (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI;
      const count = Math.max(1, Math.floor(L / BATTEN_PITCH_MM));
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count;
        b.parts.push(box(BATTEN_MM, BATTEN_MM * 0.6, Math.max(10, beamBottom - LATTICE_FOOT_MM), vec3(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t, LATTICE_FOOT_MM), wood, deg));
      }
    }
  }
  return b;
}

// ── chairs in rows (lib/design-document/chair-rows.ts) ──────────────────────────────────────────

/** A block of chairs in rows (Placement.rows): one instance of the chair per `chairRowsLayout`
 *  chair, every one facing the block's front (+y, row 1 — a chair body's front is +y already).
 *  The context's footprint is the BLOCK's box (placementFootprint), so the chair's own size is the
 *  row's catalog box, as the layout reads it (catalog-resolver.ts chairBlockOf). */
export function chairRowsBody(ctx: ItemContext): ItemBuild {
  const chair = ctx.product ? catalogBox(ctx.product) : FALLBACK_CHAIR;
  const style = ctx.chairStyle ?? "dining";
  const h = ctx.heightMm > 0 ? ctx.heightMm : BENCH_CHAIR.heightMm;
  const tag = tagOf(ctx, "chair");
  const b = make(matte(ctx.tone));
  if (!ctx.rows) return b;
  const layout = chairRowsLayout(ctx.rows, chair);
  for (const c of layout.chairs) b.instanced.push(chairRequest(style, chair.widthMm, chair.depthMm, h, ctx.tone, transform(vec3(c.x, c.y, 0), 0), tag));
  return b;
}

// ponytail: self-check. Run: npx tsx lib/scene/floor-kinds.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
  const ctxOf = (footprint: Footprint, heightMm: number, tone: string, extra: Partial<ItemContext> = {}): ItemContext => {
    const w = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.widthMm : 0;
    const d = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.depthMm : 0;
    return { product: undefined, resolved: undefined, footprint, widthMm: w, depthMm: d, heightMm, tone: tone.toLowerCase(), count: 1, author: false, ...extra };
  };
  const top = (p: Part) => (p.shape === "box" || p.shape === "cylinder" || p.shape === "extrude" || p.shape === "ribbon" ? p.at.z + p.h : p.shape === "sphere" ? p.at.z + p.r : p.shape === "lathe" ? Math.max(...p.profile.map((q) => q.z)) + p.at.z : p.at.z);
  const boxes = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "box" }> => p.shape === "box");
  const cyls = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder");

  // A sofa 2000×900×800: the back reaches 800 along −y, two arms to 0.65 h, and — by the plan's
  // own count, round((2000 − 2·230)/650) — two cushions with their tops at 450.
  const sofa = floorKindBody("sofa", ctxOf({ kind: "rect", widthMm: 2000, depthMm: 900 }, 800, DEFAULT_TONE.sofa));
  assert(boxes(sofa).some((p) => p.at.y < 0 && near(top(p), 800) && p.w === 2000), "sofa: the back reaches 800 along −y");
  const arms = boxes(sofa).filter((p) => near(top(p), 520) && Math.abs(p.at.x) > 800);
  assert(arms.length === 2 && near(arms[0].w, 230), `sofa: two arms min(0.13 w, 230, 0.3 d) wide to 0.65 h (${arms.length})`);
  const cushions = boxes(sofa).filter((p) => near(top(p), 450));
  assert(cushions.length === Math.max(1, Math.round((2000 - 460) / 650)) && cushions.length === 2, `sofa: round((w − 2·arm)/650) cushions at 450 (${cushions.length})`);
  assert(boxes(floorKindBody("sofa", ctxOf({ kind: "rect", widthMm: 2400, depthMm: 900 }, 800, DEFAULT_TONE.sofa))).filter((p) => near(top(p), 450)).length === 3, "sofa: a 2.4 m one has three");
  assert(floorKindBody("sofa", ctxOf({ kind: "circle", diameterMm: 600 }, 450, DEFAULT_TONE.sofa)).parts.some((p) => p.shape === "cylinder" && p.rBottom === 300), "a round sofa is a pouf");

  // A banquette 3000×450, nobody's spec: the strip's top at 750, five chairs behind it (−y) facing it.
  const bench = floorKindBody("bench", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 450 }, 750, DEFAULT_TONE.bench, { bench: benchLayout(3000, 450) }));
  assert(boxes(bench).some((p) => p.w === 3000 && near(top(p), 750)), "bench: the strip's top at 750");
  assert(bench.instanced.length === 5 && bench.instanced.every((r) => r.at.at.y < 0 && near(r.at.rotationDeg, 0) && r.key.startsWith("chair:dining:")), "bench: five dining chairs behind it, unturned (their front is +y, at the strip)");
  const sofaBench = floorKindBody("bench", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 750, DEFAULT_TONE.bench, { bench: benchLayout(3000, 600, { front: { kind: "sofa" } }) }));
  assert(boxes(sofaBench).filter((p) => near(top(p), 460) && p.at.y > 0).length === 5, "bench: a sofa front is five cushions at 460 on the +y half");
  assert(bench.parts.every((p) => top(p) <= 750 + 1e-9), "bench: nothing above its top but the chairs");

  // A column ⌀500 × 3000: the shaft 0.74 R, sixteen flutes, the capital reaching 3000.
  const column = floorKindBody("column", ctxOf({ kind: "circle", diameterMm: 500 }, 3000, DEFAULT_TONE.column));
  assert(cyls(column).some((p) => near(p.rBottom, 185) && near(p.at.z, 360) && near(top(p), 2640)), "column: the shaft 0.74 R from the plinth to 0.88 h");
  assert(cyls(column).filter((p) => near(p.rBottom, 20)).length === 16, "column: sixteen flutes");
  assert(column.parts.some((p) => p.shape === "lathe" && near(top(p), 3000) && p.profile[p.profile.length - 1].r === 250), "column: the capital flares to R at h");
  assert(column.parts[0].shape === "extrude" && near(column.parts[0].h, 360), "column: the plinth is the footprint 0.12 h high");

  // A fountain ⌀2000: water at 300 inside a basin 350 high, one splash.
  const fountain = floorKindBody("fountain", ctxOf({ kind: "circle", diameterMm: 2000 }, 1500, DEFAULT_TONE.fountain));
  assert(fountain.parts.some((p) => p.shape === "plane" && near(p.at.z, 300) && p.material?.kind === "water"), "fountain: a water plane at 300");
  assert(fountain.parts.some((p) => p.shape === "extrude" && p.h === 350 && (p.holes?.length ?? 0) === 1), "fountain: the basin is a wall round a well");
  assert(fountain.emitters.length === 1 && fountain.emitters[0].strength === 0.6 && near(fountain.emitters[0].radiusMm, 100), "fountain: one spout, 0.1 R");
  assert(fountain.parts.some((p) => p.shape === "lathe" && p.profile.some((q) => near(q.r, 420))), "fountain: a bowl 0.42 R");

  // An arch 3000×600×2500: two feet to 2250, the span across them, the garland in flowers.
  const arch = floorKindBody("arch", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 2500, DEFAULT_TONE.arch));
  const feet = boxes(arch).filter((p) => p.w === 600 && p.d === 600 && near(top(p), 2250));
  assert(feet.length === 2 && feet.every((p) => near(Math.abs(p.at.x), 1200)), `arch: two feet min(D, 0.2 L) square to 0.9 h (${feet.length})`);
  assert(boxes(arch).some((p) => near(p.at.z, 2250) && near(p.d, 228) && p.w === 2400), "arch: the span D·0.38 deep across the feet");
  assert(arch.instanced.some((r) => r.key.startsWith("flower:")) && arch.instanced.every((r) => r.at.at.z >= 2250 + 120 - 1e-9), "arch: a garland of flowers on the span");
  const tallArch = floorKindBody("arch", ctxOf({ kind: "rect", widthMm: 600, depthMm: 3000 }, 2500, DEFAULT_TONE.arch));
  assert(boxes(tallArch).filter((p) => near(top(p), 2250)).every((p) => near(Math.abs(p.at.y), 1200) && near(p.at.x, 0)), "an arch stored deep runs along y");

  // A gate 3000×500×2800: two columns 500 square at ±1250, joined by a lintel to h — or, arched, by
  // voussoirs laid from the +x column over to the −x one, each ending where the next begins, the
  // crown's centre line half the ring (0.6 P) under h.
  const gateSq = floorKindBody("gate", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 500 }, 2800, DEFAULT_TONE.gate));
  assert(boxes(gateSq).filter((p) => p.w === 500 && p.d === 500).every((p) => near(Math.abs(p.at.x), 1250)) && cyls(gateSq).length === 2, "gate: two columns min(D, 0.2 L) square at ±(L − P)/2");
  assert(boxes(gateSq).some((p) => p.w === 3000 && near(top(p), 2800)), "gate: a square entrance is a lintel across both columns to h");
  const gateArch = floorKindBody("gate", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 500 }, 2800, DEFAULT_TONE.gate, { drawStyle: "arched" }));
  const vous = boxes(gateArch).filter((p) => p.rotDeg === 90 && p.tiltDeg !== undefined);
  const endOf = (p: Extract<Part, { shape: "box" }>) => ({ x: p.at.x - p.h * Math.sin(rad(p.tiltDeg!)), z: p.at.z + p.h * Math.cos(rad(p.tiltDeg!)) });
  assert(vous.length === GATE_VOUSSOIRS && !boxes(gateArch).some((p) => p.w === 3000), `gate: an arched entrance is ${GATE_VOUSSOIRS} voussoirs and no lintel (${vous.length})`);
  assert(near(vous[0].at.x, 1250) && vous.every((p, i) => i === vous.length - 1 || Math.hypot(endOf(p).x - vous[i + 1].at.x, endOf(p).z - vous[i + 1].at.z) < 0.03 * p.h), "gate: the voussoirs join, from the +x column over");
  assert(near(endOf(vous[vous.length - 1]).x, -1250, 0.03 * vous[0].h) && near(endOf(vous[vous.length - 1]).z, vous[0].at.z, 0.03 * vous[0].h), "gate: …landing on the −x column at the springing");
  assert(near(Math.max(...vous.map((p) => p.at.z)), 2800 - 150), "gate: the crown's centre line half the ring under h");
  assert(near(top(boxes(floorKindBody("gate", ctxOf({ kind: "rect", widthMm: 500, depthMm: 3000 }, 2800, DEFAULT_TONE.gate))).find((p) => p.d === 3000 || p.w === 3000)!), 2800), "a gate stored deep runs along y");

  // A tree ⌀3500 × 4000: the venue's own tree (./plants.ts) in the row's shade.
  const tree = floorKindBody("tree", ctxOf({ kind: "circle", diameterMm: 3500 }, 4000, DEFAULT_TONE.tree));
  assert(JSON.stringify(tree.parts) === JSON.stringify(treeParts(1750, 1750, 4000, DEFAULT_TONE.tree.toLowerCase())), "tree: the venue's tree, at its size and in its shade");
  assert(tree.parts.some((p) => p.shape === "leaves") && cyls(tree).some((p) => p.material?.colour === ENVELOPE.trunk), "tree: leaf cards over a crown, on a trunk");

  // A straight bar 3000×600×1100: the body to 1100, the counter top on it, bottles on the shelf.
  const bar = floorKindBody("bar", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 1100, DEFAULT_TONE.bar));
  assert(boxes(bar).some((p) => near(top(p), 1100) && p.w === 3000 && p.at.y > 0), "straight bar: the counter to 1100");
  assert(boxes(bar).some((p) => near(p.at.z, 1100) && p.h === 40 && near(p.d, 240 + 50) && p.at.y > 0), "straight bar: a counter top counterTopMm(D) deep, 50 proud, on the front");
  assert(bar.instanced.length >= 10 && bar.instanced.every((r) => r.key.startsWith("bottle:") && near(r.at.at.z, 935) && r.at.at.y < 0), `straight bar: bottles every 26 cm on the back shelf at 0.85 h (${bar.instanced.length})`);
  assert(bar.instanced.length === Math.floor((3000 - 120) / BOTTLE_PITCH_MM), "…as many as the plan draws");
  const tallBar = floorKindBody("bar", ctxOf({ kind: "rect", widthMm: 600, depthMm: 3000 }, 1100, DEFAULT_TONE.bar));
  assert(tallBar.instanced.every((r) => Math.abs(r.at.at.y) > 1000 || Math.abs(r.at.at.x) > 0) && boxes(tallBar).every((p) => p.rotDeg === 90), "a bar stored deep runs along y");
  const round = floorKindBody("bar", ctxOf({ kind: "circle", diameterMm: 3000 }, 1100, DEFAULT_TONE.bar));
  assert(round.parts.some((p) => p.shape === "extrude" && p.h === 1100 && (p.holes?.length ?? 0) === 1), "round bar: a ring with its well open");
  assert(round.instanced.length === Math.max(6, Math.round((2 * Math.PI * 1500 * 0.3) / 220)) && round.instanced.every((r) => near(Math.hypot(r.at.at.x, r.at.at.y), 450)), "round bar: the plan's ring of bottles at 0.3 R");

  // A ח bar 4800×1800 (the counter a third of the short side): the counter top only along the hull
  // edges, the shelf and its bottles along the inside, nothing added.
  const uBar = resolveFootprint({
    id: "u", name: "בר", category: "bars", layer: "floor",
    dimensions: { heightMm: 1100, widthMm: 4800, depthMm: 1800 }, categoryFields: {}, styleTags: [], variants: [],
    appearance: { content: "none", shape: "u-shape" } as never,
  });
  const u = floorKindBody("bar", ctxOf(uBar, 1100, DEFAULT_TONE.bar, { widthMm: 4800, depthMm: 1800 }));
  const counters = u.parts.filter((p) => p.shape === "extrude" && near(p.at.z, 1100) && p.h === 40);
  const shelves = u.parts.filter((p) => p.shape === "extrude" && near(p.at.z, 935) && p.h === 30);
  assert(counters.length === barDrawing(uBar).front.length && counters.length > 0, `ח bar: a counter top per front strip (${counters.length})`);
  assert(shelves.length === barDrawing(uBar).shelf.length && shelves.length === 1, `ח bar: one shelf, the inside of the ח (${shelves.length})`);
  assert(u.parts.some((p) => p.shape === "extrude" && p.h === 1100), "ח bar: the body to 1100");
  assert(u.instanced.length === barDrawing(uBar).bottles.length && u.instanced.length >= 8 && u.instanced.every((r) => near(r.at.at.z, 935)), `ח bar: the plan's bottles on the shelf (${u.instanced.length})`);
  // The shelf is folded out across the inner edge: its bottles stand inside the ח's crook.
  const uRing = flatRing(footprintOutlines(uBar)[0]);
  assert(u.instanced.every((r) => signedDistance(r.at.at.x, r.at.at.y, uRing) < 0), "ח bar: the bottles stand in the crook, off the counter");
  // The counter top overhangs the guests' edge by 50.
  const hull = (p: Point) => Math.max(Math.abs(p.x) - 2400, Math.abs(p.y) - 900);
  assert(counters.some((p) => p.shape === "extrude" && p.outline.outline.some((q) => hull(q) > 45)), "ח bar: the counter top stands 50 proud of the edge");

  // A chuppah 3000×3000×2600: four posts to 2600 at their REAL size (a 6 cm tube, not the plan's
  // m·0.045), where the plan stands them; a frame along their tops; the canopy at 2600; posies on
  // the +y posts only.
  const chuppah = floorKindBody("chuppah", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 3000 }, 2600, DEFAULT_TONE.chuppah));
  const poles = cyls(chuppah).filter((p) => near(p.rBottom, 30) && near(top(p), 2600) && !p.tiltDeg);
  assert(poles.length === 4 && poles.every((p) => near(Math.abs(p.at.x), 1500 - 216) && near(Math.abs(p.at.y), 1500 - 216)), `chuppah: four posts 6 cm thick, the plan's pole·1.6 in from the corners (${poles.length})`);
  assert(cyls(chuppah).filter((p) => near(p.tiltDeg ?? 0, 90) && near(p.at.z, 2600)).length === 4, "…a beam along the top of every side, so the cloth hangs from something");
  assert(chuppah.parts.filter((p) => p.shape === "plane").length === 2 && chuppah.parts.some((p) => p.shape === "plane" && near(p.at.z, 2600) && p.material?.kind === "fabric"), "chuppah: a cloth canopy at h, and its sag under it");
  assert(chuppah.instanced.some((r) => r.key.startsWith("flower:")) && chuppah.instanced.every((r) => r.at.at.y > 0), "chuppah: posies (heads and their leaves) on the front (+y) poles only");
  assert(chuppah.instanced.every((r) => r.at.at.z >= 2600 * POSY_SHARE - 1e-6), "…hung at 2/3 h");
  const roundChuppah = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 3000 }, 2600, DEFAULT_TONE.chuppah));
  const roundPosts = cyls(roundChuppah).filter((p) => near(p.rBottom, 30) && !p.tiltDeg);
  assert(roundPosts.length === 4 && roundPosts.every((p) => near(Math.hypot(p.at.x, p.at.y), 1500 * 0.82)), "a round chuppah's posts stand at 0.82 of the radius");

  // The spec (lib/catalog/chuppah.ts): a domed sheer on gold posts, a floral cloud on clear ones, a
  // hung one, a hexagon, never a solid.
  const domed = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 3000 }, 2800, DEFAULT_TONE.chuppah, { chuppah: { roof: "sheer", finish: "gold", profile: CHUPPAH_PROFILES.dome } }));
  const sheet = domed.parts.find((p) => p.shape === "sheet");
  assert(!!sheet && sheet.shape === "sheet" && sheet.material?.opacity === SHEER_OPACITY && !domed.parts.some((p) => p.shape === "lathe"), "a dome: the roof a two-sided sheer sheet up the base's body, never a lathe");
  assert(sheet!.shape === "sheet" && near(Math.max(...sheet!.rows.flat().map((v) => v.z)), 2800) && cyls(domed).filter((p) => !p.tiltDeg && near(p.rBottom, 30)).every((p) => p.h < 2800 * 0.8 && p.material?.colour === "#c9a24a"), "…its crown at h, the gold posts rising only to the eave");
  const cloud = floorKindBody("chuppah", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 3000 }, 2700, DEFAULT_TONE.chuppah, { chuppah: { roof: "flowers", finish: "acrylic", flowers: "none", bloom: "#f6f3ec" } }));
  const cloudHeads = cloud.instanced.filter((r) => r.key.startsWith("flower:"));
  assert(cloudHeads.length > 150 && cloudHeads.every((r) => r.at.at.z > 2000) && !cloud.parts.some((p) => p.shape === "plane"), `a floral cloud: hundreds of heads over the top, no cloth (${cloudHeads.length})`);
  assert(cyls(cloud).filter((p) => !p.tiltDeg && near(p.rBottom, 50)).every((p) => p.material?.kind === "glass"), "…on 10 cm clear acrylic posts");
  const hung = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 3000 }, 2600, DEFAULT_TONE.chuppah, { chainMm: 1400, chuppah: { posts: 0, roof: "flowers" } }));
  assert(cyls(hung).filter((p) => near(p.rBottom, 2)).length === 4 && cyls(hung).filter((p) => near(p.rBottom, 2)).every((p) => near(p.at.z + p.h, 2600 + 1400)) && !cyls(hung).some((p) => near(p.rBottom, 30)), "hung: no posts, four cables up to the ceiling");
  const hexOutline = Array.from({ length: 6 }, (_, i) => ({ x: 1500 * Math.cos((i * Math.PI) / 3), y: 1300 * Math.sin((i * Math.PI) / 3) }));
  const hex = floorKindBody("chuppah", ctxOf({ kind: "custom", outline: hexOutline }, 2600, DEFAULT_TONE.chuppah, { widthMm: 3000, depthMm: 2600, chuppah: { finish: "wood", roof: "open" } }));
  assert(cyls(hex).filter((p) => !p.tiltDeg && near(p.rBottom, 45)).length === 6, "a hexagon of timber: a post at every corner");

  // A rotunda ⌀4000 × 3000: eight columns, two rings, drapes at the back.
  const rotunda = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 4000 }, 3000, DEFAULT_TONE.chuppah, { drawStyle: "rotunda" }));
  const columns = cyls(rotunda).filter((p) => near(p.rBottom, 150) && near(p.rTop, 150));
  assert(columns.length === 8 && columns.every((p) => near(Math.hypot(p.at.x, p.at.y), 2000 * 0.92)), `rotunda: eight columns m·0.075 thick on 0.92 of the radius (${columns.length})`);
  assert(columns.every((p) => Math.abs(p.at.y - 2000 * 0.92) > 1), "rotunda: the front is an opening, not a column");
  assert(rotunda.parts.filter((p) => p.shape === "torus").length === 2 && rotunda.parts.some((p) => p.shape === "torus" && near(p.r, 1840) && near(p.at.z, 2850)), "rotunda: two rings at the top, the outer at 0.92 R");
  const drapes = rotunda.parts.filter((p): p is Extract<Part, { shape: "ribbon" }> => p.shape === "ribbon");
  assert(drapes.length === 3 && drapes.every((p) => p.path.every((q) => q.y < 0)), `rotunda: drapes between the back columns only (${drapes.length})`);

  // Stairs 1000×840 rising 600: four risers (≤ 18 cm), so three treads, 150 apart, the highest at −y.
  const stairs = floorKindBody("stairs", ctxOf({ kind: "rect", widthMm: 1000, depthMm: 840 }, 0, DEFAULT_TONE.stairs, { climb: { heightMm: 600 } }));
  const treads = boxes(stairs).sort((a, b) => top(a) - top(b));
  assert(treads.length === 3 && near(top(treads[0]), 150) && near(top(treads[1]), 300) && near(top(treads[2]), 450), `stairs: three treads at 150/300/450 (${treads.map((p) => Math.round(top(p))).join("/")})`);
  assert(treads[2].at.y < treads[0].at.y && near(treads[2].at.y, -280) && near(treads[0].at.y, 280) && near(treads[0].d, 280), "stairs: the head at −y, 28 cm treads");
  const reversed = floorKindBody("stairs", ctxOf({ kind: "rect", widthMm: 1000, depthMm: 840 }, 0, DEFAULT_TONE.stairs, { climb: { heightMm: 600, reversed: true } }));
  assert(boxes(reversed).sort((a, b) => top(a) - top(b))[2].at.y > 0, "…reversed, the head at +y");
  assert(boxes(floorKindBody("stairs", ctxOf({ kind: "rect", widthMm: 1000, depthMm: 840 }, 0, DEFAULT_TONE.stairs, { climb: { heightMm: 600, risers: 3 } }))).length === 2, "typed risers: 3 risers stand on 2 treads");

  // A ramp 1200×7200 rising 600: a slab tilted atan(600/7200), its −y end up, a landing at the head.
  const ramp = floorKindBody("ramp", ctxOf({ kind: "rect", widthMm: 1200, depthMm: 7200 }, 0, DEFAULT_TONE.ramp, { climb: { heightMm: 600 } }));
  const slab = boxes(ramp).find((p) => p.w === 1200 && p.tiltDeg !== undefined);
  assert(!!slab && near(slab.tiltDeg!, (Math.atan2(600, 7200) * 180) / Math.PI) && near(slab.tiltDeg!, 4.76, 0.01), `ramp: the slab tilted atan(rise/run) ≈ 4.76° (${slab?.tiltDeg})`);
  assert(slab!.tiltDeg! > 0 && near(slab!.at.z, 300), "ramp: tilted so its −y end rises, about its middle at half the rise");
  assert(boxes(ramp).some((p) => near(top(p), 660) && p.at.y < 0 && p.d === 200), "ramp: a landing 200 deep at the head's height");
  assert(boxes(ramp).filter((p) => p.w === 40).length === 2, "ramp: a kerb each side");
  assert(boxes(floorKindBody("ramp", ctxOf({ kind: "rect", widthMm: 1200, depthMm: 7200 }, 0, DEFAULT_TONE.ramp, { climb: { heightMm: 600, reversed: true } }))).find((p) => p.w === 1200 && p.tiltDeg !== undefined)!.tiltDeg! < 0, "…reversed, the +y end rises");

  // A rug 3000×2000: a slab, its border band, fringe on the short ends — under sixty parts.
  const rug = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#c9b8a8"));
  assert(rug.parts.length <= 60 && rug.parts[0].shape === "box" && rug.parts[0].h === 12 && rug.material.kind === "fabric", `rug: a 12 mm slab and at most sixty parts (${rug.parts.length})`);
  assert(boxes(rug).filter((p) => p.h === 2).length === 4, "rug: four border strips");
  const fringes = boxes(rug).filter((p) => p.h === 3);
  assert(fringes.length === 40 && fringes.every((p) => Math.abs(p.at.x) > 1500), "rug: twenty fringes off each short end");

  // The same rug with its right end bowed out 20%: an extruded slab, a ring border with a hole, and
  // fringe that follows the curve — the bulge reaches past the straight end, and every strand points out.
  const curved = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#c9b8a8", { rug: { bows: [0, 0.2, 0, 0] } }));
  const curvedSlab = curved.parts[0];
  assert(curvedSlab.shape === "extrude" && curvedSlab.h === 12 && curvedSlab.outline.edgeCurves?.[1] != null, "curved rug: the slab is the bowed outline, extruded");
  const ring = curved.parts.find((p) => p.shape === "extrude" && p.h === 2);
  assert(ring?.shape === "extrude" && ring.holes?.length === 1, "curved rug: the border is a ring");
  const strands = boxes(curved).filter((p) => p.h === 3);
  assert(strands.length === 40, `curved rug: twenty strands an end (${strands.length})`);
  assert(strands.some((p) => p.at.x > 1500 + 350), "curved rug: the fringe rides the bulge");

  // A rug with a CONTOUR (lib/catalog/border.ts): the woven band gives way to its bands — flat rings
  // on the slab in their colours — and the fringe is the contour's, in its colour or none at all.
  const gold = { widthMm: 120, colour: "#c9a24a", inner: { widthMm: 40, gapMm: 60, colour: "#ffffff" } };
  const bordered = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#4b3a6e", { border: gold }));
  const bands = bordered.parts.filter((p): p is Extract<Part, { shape: "extrude" }> => p.shape === "extrude" && p.at.z === 12);
  assert(bordered.parts[0].shape === "box" && bands.length === 2 && bands.every((p) => p.holes?.length === 1), "bordered rug: the slab, then two rings on it");
  assert(bands[0].material?.colour === "#c9a24a" && bands[1].material?.colour === "#ffffff", "bordered rug: each band in its colour");
  assert(!boxes(bordered).some((p) => p.h === 2), "bordered rug: no woven strips under the contour");
  const goldStrands = boxes(bordered).filter((p) => p.h === 3);
  assert(goldStrands.length === 40 && goldStrands.every((p) => p.material?.colour === "#c9a24a"), "bordered rug: the fringe in the contour's colour");
  assert(boxes(rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#4b3a6e", { border: { ...gold, fringe: false } }))).filter((p) => p.h === 3).length === 0, "bordered rug: no fringe when it says so");
  const bentBordered = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#4b3a6e", { rug: { bows: [0, 0.2, 0, 0], corners: [300, 300, 0, 0] }, border: gold }));
  assert(bentBordered.parts[0].shape === "extrude" && bentBordered.parts.filter((p) => p.shape === "extrude" && p.at.z === 12).length === 2, "bordered curved rug: its bands follow the bowed, rounded slab");
  // A carpet laid to an OUTLINE (lib/studio/cover.ts): an L over a stage with a trap cut in it.
  const lOutline = [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 2000 }, { x: -3000, y: 2000 }];
  const trap = [{ x: -2000, y: -1000 }, { x: -1000, y: -1000 }, { x: -1000, y: -500 }, { x: -2000, y: -500 }];
  const laidRug = rugBody(ctxOf({ kind: "rect", widthMm: 6000, depthMm: 4000 }, 12, "#4b3a6e", { carpet: { outline: lOutline, holes: [trap], widthMm: 6000, depthMm: 4000 } }));
  const lSlab = laidRug.parts[0];
  assert(lSlab.shape === "extrude" && lSlab.outline.outline.length === 6 && lSlab.holes?.length === 1, "outline carpet: the slab is the L, its trap cut out");
  assert(laidRug.parts.filter((p) => p.shape === "extrude" && p.at.z === 12).length === 1 && !boxes(laidRug).length, "…one weave ring on top along it, and no fringe");
  const laidBordered = rugBody(ctxOf({ kind: "rect", widthMm: 6000, depthMm: 4000 }, 12, "#4b3a6e", { carpet: { outline: lOutline, holes: [], widthMm: 6000, depthMm: 4000 }, border: gold }));
  assert(laidBordered.parts.filter((p) => p.shape === "extrude" && p.at.z === 12).length === 2 && !boxes(laidBordered).length, "…with a contour: its two bands along the L, still no fringe");

  // Chairs in rows 3×4: twelve instances, all facing +y.
  const rows = chairRowsBody(ctxOf({ kind: "rect", widthMm: 1950, depthMm: 2400 }, 900, DEFAULT_TONE.chair, { rows: { rows: 3, perRow: 4 } }));
  assert(rows.instanced.length === 12 && rows.instanced.every((r) => near(r.at.rotationDeg, 0) && r.key.startsWith("chair:dining:")), `chair rows: twelve chairs facing +y (${rows.instanced.length})`);
  const layout = chairRowsLayout({ rows: 3, perRow: 4 }, FALLBACK_CHAIR);
  assert(rows.instanced.every((r, i) => near(r.at.at.x, layout.chairs[i].x) && near(r.at.at.y, layout.chairs[i].y)), "…where chairRowsLayout stands them");

  // A pergola 4 × 4 × 2.6 (lib/venues/pergola.ts): four posts in its corners up to the beams, a beam
  // along every side, slats across the top ending at its height; the same row laid 6 × 4 keeps its
  // posts; a cloth roof is one plane; a closed side carries battens.
  const pergola = floorKindBody("pergola", ctxOf({ kind: "rect", widthMm: 4000, depthMm: 4000 }, 2600, DEFAULT_TONE.pergola));
  const posts = boxes(pergola).filter((p) => p.w === 150 && p.d === 150);
  assert(posts.length === 4 && posts.every((p) => near(Math.abs(p.at.x), 1925) && near(Math.abs(p.at.y), 1925) && near(top(p), 2600 - SLAT_H_MM)), `pergola: four posts in its corners up to the beams (${posts.length})`);
  const slats = boxes(pergola).filter((p) => p.h === SLAT_H_MM);
  assert(slats.length >= 10 && slats.every((p) => near(top(p), 2600)), `pergola: slats across the top, ending at its height (${slats.length})`);
  assert(boxes(pergola).filter((p) => near(top(p), 2600 - SLAT_H_MM) && p.h !== 2600 - SLAT_H_MM).length === 4, "pergola: a beam along every side, under the slats");
  const widePergola = floorKindBody("pergola", ctxOf({ kind: "rect", widthMm: 6000, depthMm: 4000 }, 2600, DEFAULT_TONE.pergola));
  assert(boxes(widePergola).filter((p) => p.w === 150 && p.d === 150).length === 4 && boxes(widePergola).filter((p) => p.h === SLAT_H_MM).length > slats.length, "pergola: laid 6 × 4 it keeps its 15cm posts and gains slats");
  const cloth = floorKindBody("pergola", ctxOf({ kind: "rect", widthMm: 4000, depthMm: 4000 }, 2600, "#f3ede2", { pergola: { postMm: 120, roof: "fabric", closedSides: [0] } }));
  assert(cloth.parts.filter((p) => p.shape === "plane").length === 1 && boxes(cloth).filter((p) => p.h === SLAT_H_MM).length === 0, "pergola: a cloth roof is one plane, no slats");
  assert(boxes(cloth).filter((p) => p.w === BATTEN_MM).length > 20, "pergola: a closed side is a lattice of battens");
  const roundPergola = floorKindBody("pergola", ctxOf({ kind: "circle", diameterMm: 6000 }, 2800, DEFAULT_TONE.pergola, { pergola: { postMm: 150, roof: "none" } }));
  assert(boxes(roundPergola).filter((p) => p.w === 150 && p.d === 150).length === 6 && boxes(roundPergola).every((p) => top(p) <= 2800 + 1e-6), "pergola: a round one on six posts, beams only, no higher than its height");

  // Everything stands on its own floor and builds the same twice.
  for (const [kind, b] of [["sofa", sofa], ["column", column], ["fountain", fountain], ["arch", arch], ["tree", tree], ["bar", bar], ["chuppah", chuppah], ["stairs", stairs], ["pergola", pergola]] as const) {
    assert(b.parts.every((p) => (p.shape === "sphere" ? p.at.z - p.r : p.at.z) >= -1e-6), `${kind} stands on the floor`);
  }
  assert(JSON.stringify(arch) === JSON.stringify(floorKindBody("arch", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 2500, DEFAULT_TONE.arch))), "the same arch builds the same twice");
  // ── The profile is READ by the recipe (2026-11-13, lib/catalog/body-profiles.ts) ──
  const baluster = [{ r: 0.8, z: 0 }, { r: 0.5, z: 0.1 }, { r: 0.6, z: 0.9 }, { r: 1, z: 1 }];
  const turnedColumn = floorKindBody("column", ctxOf({ kind: "circle", diameterMm: 500 }, 3000, DEFAULT_TONE.column, { profile: baluster }));
  assert(turnedColumn.parts.length === 1 && turnedColumn.parts[0].shape === "lathe" && turnedColumn.material.kind === column.material.kind, "a column with a profile is that shaft turned, in the column's own stone");
  // A two-tier fountain: a basin's rim at 0.3 h of the stone and a bowl's at its top.
  const tiers = [{ r: 0.9, z: 0 }, { r: 1, z: 0.3 }, { r: 0.15, z: 0.34 }, { r: 0.12, z: 0.8 }, { r: 0.5, z: 1 }];
  assert(JSON.stringify(profileBowls(tiers)) === JSON.stringify([{ r: 1, z: 0.3 }, { r: 0.5, z: 1 }]), "a profile's bowls are its rims — the basin's lip and the top tier's");
  assert(profileBowls([{ r: 0.9, z: 0 }, { r: 1, z: 0.25 }, { r: 1, z: 1 }]).length === 1 && profileBowls([{ r: 1, z: 0 }, { r: 0.05, z: 1 }]).length === 0, "a straight-walled basin holds water at its top; a cone holds none");
  const turnedFountain = floorKindBody("fountain", ctxOf({ kind: "circle", diameterMm: 2000 }, 1500, DEFAULT_TONE.fountain, { profile: tiers }));
  assert(turnedFountain.parts.filter((p) => p.shape === "lathe").length === 1 && turnedFountain.parts.filter((p) => p.material?.kind === "water").length === 3 && turnedFountain.emitters.length === 1, "a fountain with a profile is its stone turned — with water in both bowls, its jet and its glow kept");
  const crown = [{ r: 0.07, z: 0 }, { r: 0.07, z: 0.46 }, { r: 0.62, z: 0.52 }, { r: 1, z: 0.74 }, { r: 0.62, z: 0.95 }, { r: 0.04, z: 1 }];
  const ballTree = floorKindBody("tree", ctxOf({ kind: "circle", diameterMm: 2000 }, 3000, DEFAULT_TONE.tree, { profile: crown }));
  const ballBlobs = ballTree.parts.filter((p) => p.shape === "blob");
  assert(ballBlobs.length >= 2 && ballBlobs.every((p) => p.at.z > 3000 * 0.45) && ballTree.parts.some((p) => p.shape === "cylinder" && p.at.z === 0 && p.h > 1200) && ballTree.parts.some((p) => p.shape === "leaves"), "a tree with a crown profile: leaves inside the envelope, a bare trunk under it");
  assert(JSON.stringify(floorKindBody("tree", ctxOf({ kind: "circle", diameterMm: 3500 }, 4000, DEFAULT_TONE.tree))) === JSON.stringify(tree), "…and a tree with none is the tree it always was");
  const pouf = floorKindBody("sofa", ctxOf({ kind: "circle", diameterMm: 900 }, 420, DEFAULT_TONE.sofa, { profile: baluster }));
  assert(pouf.parts.length === 1 && pouf.parts[0].shape === "lathe", "a round sofa with a profile is a pouf turned to it");
  console.log("scene floor kinds ok");
}
