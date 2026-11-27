// LED — a line of light on a RAIL, and a screen (the user, 2026-11-07: "option to add LED"; spec
// docs/superpowers/specs/2026-11-07-venue-heights-rails-and-covers-design.md §7). Both worlds: a
// studio hires a strip (a `led-strips` row placed on a rail, billed by the metre of its lines) or a
// screen (a `led-screens` row, a free floor item); a venue has its own (a feature of kind `led` or
// `screen`), drawn and built exactly as the hired ones are and never counted or quoted.
//
// A strip is the rail's third customer after the curtain and the ceiling drape (lib/studio/rail.ts):
// the line it glows along is RESOLVED, never stored — a strip on a wall follows the wall when the
// venue is redrawn, one on a stage's edge follows the stage. What is the strip's own:
//
//   • the HEIGHT on a wall (`WallRail.heightMm`): 0 = the floor line, the skirting a strip is most
//     often run along, and what a new strip starts at; absent = the wall's top (a curtain's rule);
//   • which SIDES it takes: any side of a thing with height — a 40cm stage's deck edge, a bar's
//     counter, a building's face. A curtain needs a thing a metre tall to hang from (rail.ts
//     SIDE_MIN_HEIGHT_MM); a strip glows along a deck's edge, so every height counts (ledSideCandidates);
//   • the colour: the shade's swatch on a hired strip, `FeatureLed.colour` on the venue's.
//
// The venue's strip is ANCHORED like the venue's curtain (./curtain.ts): its box is derived from the
// rail and written with it (ledBoxOf / ledRailPatch), a thin band where the light runs, and every
// edit of the walls or the features re-lays it (syncLeds) — the curtain's pattern on purpose.
//
// A strip lights the 3D room with its own emissive face, never with a point light: the viewer's
// light pool is fixed (CLAUDE.md, 2026-10-27 — a light count that changes recompiles every shader).
import type { Point } from "@/lib/studio/hall";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import {
  SIDE_HOST_CATEGORIES,
  SIDE_HOST_KINDS,
  featureHost,
  featureHosts,
  isRailed,
  nearestSideRail,
  placementHost,
  railBand,
  railClothLine,
  resolveRail,
  type Rail,
  type RailContext,
  type RailHost,
  type RailLine,
  type RailSide,
  type RunRail,
  type SideCandidate,
  type SideRail,
  type WallRail,
} from "@/lib/studio/rail";
import { fromLocalFrame, toLocalFrame, wallAngleDeg } from "@/lib/studio/geometry";
import { newFeature, type StructureFeature, type VenueStructure } from "./structure";
import { hasWall } from "./wall-split";
import { sideOfWall, type CurtainEnds, type CurtainPiece } from "./curtain";

/** The catalog category of a hired strip, and of a hired screen. */
export const LED_STRIP_CATEGORY = "led-strips";
export const LED_SCREEN_CATEGORY = "led-screens";

/** Is this catalog row an LED strip — a line of light on a rail, not a drape? */
export function isLedStrip(product: Pick<Product, "category"> | undefined | null): boolean {
  return product?.category === LED_STRIP_CATEGORY;
}

/** What `StructureFeature.led` stores: the rail the strip runs along and the colour it glows. */
export interface FeatureLed {
  rail: Rail;
  /** A CSS colour (#rrggbb). */
  colour: string;
}

/** A strip's colour when nothing says: warm white, what most halls run along a skirting. */
export const LED_COLOUR = "#ffe7b0";
/** The band a strip's box stands in on the plan — the thing that takes the pointer; the light itself
 *  is drawn thinner (components/led-glyph.tsx). */
export const LED_DEPTH_MM = 80;
/** A strip shorter than this is a slip of the mouse. */
const MIN_LED_MM = 200;
/** A run dropped on open ground with no wall or side near: this long, along x through the drop. */
export const LED_RUN_MM = 3000;

// ── Placing ──────────────────────────────────────────────────────────────────────────────────────

/** A new strip on a wall: the whole wall, on the side `at` lies, at the floor line (heightMm 0 — the
 *  skirting). Null for a wall that is gone. */
export function ledWallRail(s: VenueStructure, wallId: string, at: Point, from = 0, to = 1): WallRail | null {
  if (!hasWall(s, wallId)) return null;
  return { type: "wall", wallId, from: Math.min(from, to), to: Math.max(from, to), side: sideOfWall(s, wallId, at), heightMm: 0 };
}

/** A free run between two points at a height — the end points of whatever was drawn (a strip in the
 *  air is straight; the drawing pane's bends are let go). Null when the two ends are one point. */
export function ledRunRail(points: readonly Point[], heightMm: number): RunRail | null {
  if (points.length < 2) return null;
  const a = points[0];
  const b = points[points.length - 1];
  if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_LED_MM) return null;
  return { type: "run", a: { x: Math.round(a.x), y: Math.round(a.y) }, b: { x: Math.round(b.x), y: Math.round(b.y) }, heightMm: Math.round(heightMm) };
}

/** A strip that has nothing to run along — a run LED_RUN_MM long through the point, at `heightMm`. */
export function ledRunAt(at: Point, heightMm: number): RunRail {
  const half = LED_RUN_MM / 2;
  return { type: "run", a: { x: Math.round(at.x - half), y: Math.round(at.y) }, b: { x: Math.round(at.x + half), y: Math.round(at.y) }, heightMm: Math.round(heightMm) };
}

/** Does this host have a side a strip can run along — any height at all (a 40cm deck's edge is the
 *  strip's commonest side), and an outline to run along. */
function hostsStrip(host: RailHost | null): host is RailHost {
  return !!host && host.heightMm > 0 && host.outline.length >= 3;
}

/** Every thing a strip may run along the side of (spec §7.1): the venue's features of a SIDE_HOST_KINDS
 *  kind — a stage, a bar, a building, a pergola — and, in a sketch, the document's floor items of a
 *  SIDE_HOST_CATEGORIES row (a hired stage, bar, backdrop). Unlike a curtain's (rail.ts
 *  sideCandidates), no minimum height: a strip along a 40cm deck is what a stage's LED is. */
export function ledSideCandidates(
  features: readonly StructureFeature[],
  doc?: Pick<DesignDocumentContent, "placements">,
  productOf?: (variantId: string) => Product | undefined,
): SideCandidate[] {
  const out: SideCandidate[] = [];
  for (const f of features) {
    if (!SIDE_HOST_KINDS.includes(f.kind)) continue;
    const host = featureHost(f);
    if (hostsStrip(host)) out.push({ id: f.id, host });
  }
  for (const p of doc?.placements ?? []) {
    if (p.layer !== "floor" || p.tableId || p.perch || isRailed(p)) continue;
    const product = productOf?.(p.variantId);
    if (!product || (!p.stage && !SIDE_HOST_CATEGORIES.includes(product.category))) continue;
    const host = placementHost(p, product);
    if (hostsStrip(host)) out.push({ id: p.id, host });
  }
  return out;
}

/** The rail a strip dropped at `p` takes: the nearest wall (`wall`, with its distance) or the nearest
 *  side of a thing with height, whichever is nearer — the whole of it, as a curtain's drop; with
 *  neither in the room, a run through the point at `runHeightMm`. `takes` is the row's category's
 *  rails (absent = every one). Null when the category takes none of what is there. */
export function ledDropRail(
  s: VenueStructure,
  at: Point,
  wall: { wallId: string; distanceMm: number } | null,
  candidates: readonly SideCandidate[],
  runHeightMm: number,
  takes: (t: Rail["type"]) => boolean = () => true,
): Rail | null {
  const near = takes("wall") ? wall : null;
  const side = takes("side") ? nearestSideRail(candidates, at) : null;
  if (side && (!near || side.distanceMm < near.distanceMm)) return side.rail;
  if (near) return ledWallRail(s, near.wallId, at);
  return takes("run") ? ledRunAt(at, runHeightMm) : null;
}

/** Where along a side (lib/studio/rail.ts RailSide) a point falls, as a fraction of its length. */
function fractionAlong(side: RailSide, p: Point): number {
  let best = { d: Infinity, s: 0 };
  for (let k = 0; k < side.points.length - 1; k++) {
    const a = side.points[k];
    const b = side.points[k + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u));
    if (d < best.d) best = { d, s: side.cum[k] + u * Math.sqrt(l2) };
  }
  return side.L > 0 ? best.s / side.L : 0;
}

/** Where a dragged END grip of a strip puts its rail (`which` 0 = the start, 1 = the end): on a wall
 *  or a side that end slides along it, the other held; a run's end point goes to the pointer. Read
 *  against the line the rail resolved to (its wall's track, its side). Null when there is nothing to
 *  slide along. */
export function stripEndMoved(rail: Rail, line: RailLine, which: 0 | 1, p: Point): Rail | null {
  if ((rail.type === "wall" && line.wall) || (rail.type === "side" && line.side)) {
    const t = rail.type === "wall" ? line.wall!.track.nearestT(p) : fractionAlong(line.side!.side, p);
    const lo = Math.min(rail.from, rail.to);
    const hi = Math.max(rail.from, rail.to);
    return which === 0 ? { ...rail, from: t, to: hi } : { ...rail, from: lo, to: t };
  }
  if (rail.type === "run") {
    const q = { x: Math.round(p.x), y: Math.round(p.y) };
    return which === 0 ? { ...rail, a: q } : { ...rail, b: q };
  }
  return null;
}

// ── The venue's own strip (a feature of kind "led") ───────────────────────────────────────────────

const ctxCache = new WeakMap<VenueStructure, RailContext>();
function ledCtx(s: VenueStructure): RailContext {
  let c = ctxCache.get(s);
  if (!c) {
    c = { structure: s, outlineOf: featureHosts(s) };
    ctxCache.set(s, c);
  }
  return c;
}

/** A venue strip's rail — null for a feature with none. */
export function ledRail(f: Pick<StructureFeature, "led">): Rail | null {
  return f.led?.rail ?? null;
}

/** A venue strip's colour. */
export function ledColour(f: Pick<StructureFeature, "led">): string {
  return f.led?.colour || LED_COLOUR;
}

/** A venue strip's rail as lines, read against the venue — its own features are what a side rail runs
 *  along. Empty when its wall or thing is gone. */
export function ledLines(s: VenueStructure, f: Pick<StructureFeature, "led">): RailLine[] {
  const rail = ledRail(f);
  const r = rail ? resolveRail(rail, ledCtx(s)) : null;
  return r?.type === "lines" ? r.lines : [];
}

type LedBox = Pick<StructureFeature, "x" | "y" | "widthMm" | "depthMm" | "rotationDeg" | "shape" | "outline" | "edgeCurves">;

function turnOf(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** The box a line's band stands in — a plain rectangle along a straight line, the strip as a `custom`
 *  outline in the box its chord turns when the line bends (round a bowed wall, a round thing's rim).
 *  The band is on the line's hang side (a wall strip on its room face, a side strip outside its thing),
 *  centred on it when it has none (a run). The curtain's box (./curtain.ts curtainBoxOf), thinner. */
export function lineBox(line: RailLine, depthMm = LED_DEPTH_MM): LedBox | null {
  if (line.path.length < 2) return null;
  const a = line.path[0];
  const b = line.path[line.path.length - 1];
  const band = railBand(line, depthMm);
  const straight = line.path.length === 2;
  const rotationDeg = turnOf(Math.hypot(b.x - a.x, b.y - a.y) > 1 ? wallAngleDeg(a, b) : wallAngleDeg(a, line.path[1]));
  const local = band.map((p) => toLocalFrame(p, a, rotationDeg));
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const centre = fromLocalFrame(mid, a, rotationDeg);
  return {
    x: Math.round(centre.x),
    y: Math.round(centre.y),
    widthMm: Math.max(MIN_LED_MM, Math.round(Math.max(...xs) - Math.min(...xs))),
    depthMm: Math.max(1, Math.round(Math.max(...ys) - Math.min(...ys))),
    rotationDeg,
    shape: straight ? "rect" : "custom",
    outline: straight ? undefined : local.map((p) => ({ x: Math.round(p.x - mid.x), y: Math.round(p.y - mid.y) })),
    edgeCurves: undefined,
  };
}

/** The box a venue strip stands in, read off its rail. Null when what it runs along is gone (the
 *  feature keeps the box it had — the property is the authority, as with a curtain). */
export function ledBoxOf(s: VenueStructure, f: Pick<StructureFeature, "led">): LedBox | null {
  const line = ledLines(s, f)[0];
  return line ? lineBox(line) : null;
}

/** A new venue strip on `rail`, in `colour`. Null when the rail resolves to nothing. */
export function newLedFeature(s: VenueStructure, rail: Rail, colour = LED_COLOUR): Omit<StructureFeature, "id"> | null {
  const led: FeatureLed = { rail, colour };
  const box = ledBoxOf(s, { led });
  if (!box) return null;
  return { ...newFeature("led", { x: box.x, y: box.y }), ...box, led };
}

/** What putting a strip on another rail writes: the rail, its colour kept, and the box re-laid. */
export function ledRailPatch(s: VenueStructure, f: Pick<StructureFeature, "led">, rail: Rail): Partial<Omit<StructureFeature, "id">> {
  const led: FeatureLed = { rail, colour: ledColour(f) };
  const box = ledBoxOf(s, { led });
  return { led, ...(box ?? {}) };
}

/** What a strip's bar writes: the stretch (`from`/`to`, fractions along its wall or side), the wall's
 *  other face or the thing's other side (`side`), the height on a wall or of a run (`heightMm`, mm; on
 *  a wall null = the wall's top). The box is re-laid with it. */
export function ledPatch(
  s: VenueStructure,
  f: StructureFeature,
  patch: { from?: number; to?: number; side?: 1 | -1; heightMm?: number | null },
): Partial<Omit<StructureFeature, "id">> {
  const rail = ledRail(f);
  if (!rail) return {};
  const order = (from: number, to: number) => ({ from: Math.max(0, Math.min(1, Math.min(from, to))), to: Math.max(0, Math.min(1, Math.max(from, to))) });
  if (rail.type === "wall") {
    const next: WallRail = { ...rail, ...order(patch.from ?? rail.from, patch.to ?? rail.to), ...(patch.side ? { side: patch.side } : {}) };
    if (patch.heightMm === null) delete next.heightMm;
    else if (patch.heightMm !== undefined) next.heightMm = Math.max(0, Math.round(patch.heightMm));
    return ledRailPatch(s, f, next);
  }
  if (rail.type === "side") {
    const next: SideRail = { ...rail, ...order(patch.from ?? rail.from, patch.to ?? rail.to), ...(patch.side ? { out: patch.side } : {}) };
    return ledRailPatch(s, f, next);
  }
  if (rail.type === "run" && patch.heightMm !== undefined && patch.heightMm !== null) return ledRailPatch(s, f, { ...rail, heightMm: Math.max(0, Math.round(patch.heightMm)) });
  return {};
}

/** The colour changed — nothing about where it runs. */
export function ledColourPatch(f: Pick<StructureFeature, "led">, colour: string): Partial<Omit<StructureFeature, "id">> {
  const rail = ledRail(f);
  return rail ? { led: { rail, colour } } : {};
}

/** The pieces a venue strip is drawn as — one per line, in the feature's OWN frame (translate to x, y,
 *  turn by rotationDeg), so every surface draws them inside the feature's group as it draws a
 *  curtain's. `line` is the light itself, on the band's middle; `band` the box's strip. */
export function ledPieces(s: VenueStructure, f: StructureFeature): CurtainPiece[] {
  const local = (p: Point) => toLocalFrame(p, { x: f.x, y: f.y }, f.rotationDeg);
  const lines = ledLines(s, f);
  if (!lines.length) {
    const w = f.widthMm / 2;
    const d = f.depthMm / 2;
    return [{ t0: 0, t1: 1, lengthMm: f.widthMm, band: [{ x: -w, y: -d }, { x: w, y: -d }, { x: w, y: d }, { x: -w, y: d }], line: [{ x: -w, y: 0 }, { x: w, y: 0 }] }];
  }
  return lines.map((line) => ({
    t0: line.wall?.t0 ?? 0,
    t1: line.wall?.t1 ?? 1,
    lengthMm: Math.round(line.lengthMm),
    band: railBand(line, LED_DEPTH_MM).map(local),
    line: railClothLine(line, LED_DEPTH_MM).map(local),
  }));
}

/** How long a venue strip is along itself — the arc on a bowed wall; its box's width when its wall or
 *  thing is gone. */
export function ledLengthMm(s: VenueStructure, f: StructureFeature): number {
  const lines = ledLines(s, f);
  return lines.length ? lines.reduce((n, l) => n + l.lengthMm, 0) : f.widthMm;
}

/** A strip's two ends on the plan — the middle of its band at each end — and the way on along it from
 *  each, for the grips that slide them. Null when what it runs along is gone. */
export function ledEnds(s: VenueStructure, f: StructureFeature): CurtainEnds | null {
  const line = ledLines(s, f)[0];
  if (!line || line.path.length < 2) return null;
  const mid = railClothLine(line, LED_DEPTH_MM);
  const n = mid.length;
  const dir = (a: Point, b: Point) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  return { from: { p: mid[0], out: dir(mid[1], mid[0]) }, to: { p: mid[n - 1], out: dir(mid[n - 2], mid[n - 1]) } };
}

/** What dragging one END of a strip to `p` writes — on a wall or a side that end slides along it
 *  (round a bow, round a rim); on a run the end point goes there. Empty when there is nothing to slide
 *  along. */
export function ledEndPatch(s: VenueStructure, f: StructureFeature, end: "from" | "to", p: Point): Partial<Omit<StructureFeature, "id">> {
  const rail = ledRail(f);
  const line = ledLines(s, f)[0];
  const next = rail && line ? stripEndMoved(rail, line, end === "from" ? 0 : 1, p) : null;
  // A wall's or a side's stretch is kept in order (ledPatch orders it); a run's ends are its own.
  if (!next) return {};
  return next.type === "wall" || next.type === "side" ? ledPatch(s, { ...f, led: { rail: next, colour: ledColour(f) } }, {}) : ledRailPatch(s, f, next);
}

/** Every venue strip re-laid on its rail as it stands now — run after any edit of the walls or the
 *  features, beside syncCurtains. Returns `s` itself when nothing moved. */
export function syncLeds(s: VenueStructure): VenueStructure {
  if (!s.features.some((f) => f.kind === "led")) return s;
  let changed = false;
  const features = s.features.map((f) => {
    if (f.kind !== "led") return f;
    const box = ledBoxOf(s, f);
    if (!box) return f;
    if (
      f.x === box.x &&
      f.y === box.y &&
      f.widthMm === box.widthMm &&
      f.depthMm === box.depthMm &&
      f.rotationDeg === box.rotationDeg &&
      f.shape === box.shape &&
      JSON.stringify(f.outline ?? null) === JSON.stringify(box.outline ?? null)
    )
      return f;
    changed = true;
    return { ...f, ...box };
  });
  return changed ? { ...s, features } : s;
}

/** Does any venue strip run along a thing that may move — what a features edit has to re-lay. */
export function ledsFollowFeatures(s: VenueStructure): boolean {
  return s.features.some((f) => f.kind === "led" && f.led?.rail.type === "side");
}
