// A RAIL — the line (or the sheet) something hangs along: a curtain, and from the next rounds a
// sail, a run of cloth across the ceiling, an LED strip (spec docs/superpowers/specs/2026-11-07-
// venue-heights-rails-and-covers-design.md §1).
//
// Until this round the only line was a WALL span (Placement.span, FeatureCurtain's wall stretch),
// and every reader — canvas, print, clearance, the quote, 3D — read it through one resolver
// (./anchor.ts resolveSpan) into a path at a height. The round generalises the SPAN, not the
// readers: a rail is stored as what the designer chose (a stretch of a wall, a stretch of one side
// of a thing with height, a rod's points, two points in the air, an area of parallel runs, the ties
// of a sheet), and `resolveRail` turns it into the same thing every reader already draws — LINES
// (`RailLine`: a path, its length along it, its top, the side the cloth hangs on) or, for a sail, a
// SHEET (`RailSheet`: a polygon and a height at each corner). Nothing is stored that can be derived:
// a rail on a wall follows the wall when the venue is redrawn, a rail on a side follows its thing
// when it moves, and a canopy's runs are re-cut on every read.
//
// Pure: the walls come from the structure, and a side rail's THING comes from a lookup the caller
// provides (`RailContext.outlineOf`) — a sketch item's outline is the document's and its catalog's,
// which this file never reaches for. A dangling id (a wall deleted at the venue, a stage removed
// from the sketch) resolves to null, and every caller survives that as it survived a deleted wall.
import type { Point } from "@/lib/studio/hall";
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import { featureFootprint, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { pointInPolygon } from "@/lib/venues/faces";
import { resolveSpan, spanBand, wallTrack, type WallTrack } from "./anchor";
import { flattenEdge, footprintOutlines, sizedFootprint, type Footprint } from "./footprint";
import { absoluteControlPoints, polygonAreaMm2 } from "./geometry";

// ── The rail itself ──────────────────────────────────────────────────────────────────────────────

/** A stretch of a WALL — the old WallSpan, plus the venue curtain's side. `side` is which side of the
 *  wall it hangs on (+1 = the wall's left-hand normal, (−dy, dx) of a → b; absent = on the wall's own
 *  line, as a sketch's drape has always been drawn). `heightMm` is for an LED strip only (0 = the
 *  floor line, absent = the wall's top); a curtain ignores it and hangs from the ceiling. */
export interface WallRail {
  type: "wall";
  wallId: string;
  from: number;
  to: number;
  side?: 1 | -1;
  heightMm?: number;
}

/** A stretch of one SIDE of a thing with height — a venue feature or a sketch item (a building's
 *  face, a pergola's beam, a stage's edge, a bar's counter, a hired backdrop). `featureId` names it
 *  (a sketch item's placement id is tried first, then the venue's features); `side` is the thing's
 *  outline edge the side starts at, as a stage's edge items index it (lib/design-document/stage.ts
 *  stageSide) — a run of edges joined smoothly (a round pergola's rim, a bowed side) is ONE side;
 *  `from`/`to` are fractions along that side, by length; `out` says which way the cloth hangs:
 *  +1 outside the thing, −1 inside it. The height is the thing's own. */
export interface SideRail {
  type: "side";
  featureId: string;
  side: number;
  from: number;
  to: number;
  out: 1 | -1;
}

/** A free-standing ROD: a polyline in plan at one height — two points straight, three an L or a ח
 *  round a corner — a post at every end and bend, except a `cantilever` end: the ר, the arm out from
 *  its last post with nothing under its far end (at most CANTILEVER_MAX_MM). */
export interface RodRail {
  type: "rod";
  points: Point[];
  heightMm: number;
  cantilever?: "start" | "end";
  /** The rod's own thickness across, mm (rodThickMm) — the bar the cloth hangs on, and with it its
   *  posts. Absent = ROD_THICK_MM, the rod every curtain has had. A drawing and a 3D fact: the quote
   *  bills a rod by its length. */
  thickMm?: number;
}

/** A straight line in the AIR — a swag of cloth across a ceiling, an LED line between two points. */
export interface RunRail {
  type: "run";
  a: Point;
  b: Point;
  heightMm: number;
  /** End B's height when it is not A's (./ceiling-cloth.ts, 2026-11-13 — a swag from a high point down
   *  to a lower one). Absent = level: `heightMm` at both ends. A ceiling drape's alone; an LED strip
   *  ignores it. */
  heightBMm?: number;
  sagMm?: number;
  /** A ceiling drape's cloth across the line, mm (./ceiling-cloth.ts — spec §6.4). Absent = the 1.2 m
   *  default; an LED strip ignores it. */
  widthMm?: number;
  /** How many scallops the cloth makes along the line. Absent = one per 1.5 m of it. */
  waves?: number;
  /** Fairy lights woven into the cloth (./ceiling-cloth.ts runLights — the user's photograph of
   *  אמרה's dance floor, 2026-11-08): points of light along the run, on the plan and in the room.
   *  A drawing fact, never counted or quoted; an LED strip ignores it. */
  lights?: true;
}

/** An AREA of parallel runs — a draped ceiling: the runs are cut across `outline` at `directionDeg`,
 *  `spacingMm` apart, on every read (canopyRuns), so moving the area moves every run. */
export interface CanopyRail {
  type: "canopy";
  outline: Point[];
  heightMm: number;
  directionDeg: number;
  spacingMm: number;
  sagMm?: number;
  /** Each run's cloth across its line, mm (./ceiling-cloth.ts). Absent = the 1.2 m default. */
  widthMm?: number;
  /** Scallops along EACH run. Absent = one per 1.5 m of that run. */
  waves?: number;
  /** Fairy lights woven into every run (RunRail.lights). */
  lights?: true;
}

/** A SHEET stretched between three or four ties, each at its own height — a sail (מפרש). */
export interface SailRail {
  type: "sail";
  ties: SailTie[];
  sagMm?: number;
}

/** One corner of a sail: where it is, how high, and what it is tied TO — a wall (slid along it, at
 *  fraction `t`), a corner of a thing (carried when it moves), or a post the sail brings with it
 *  (open ground). `p` is the point as placed: what the tie falls back to when it is tied to a post
 *  or to nothing, and never read when its wall or thing is there to say. */
export interface SailTie {
  p: Point;
  heightMm: number;
  to?: TieTarget;
}

export type TieTarget = { kind: "wall"; wallId: string; t: number } | { kind: "feature"; featureId: string; corner: number } | { kind: "post" };

export type Rail = WallRail | SideRail | RodRail | RunRail | CanopyRail | SailRail;
export type RailType = Rail["type"];
export const RAIL_TYPES: readonly RailType[] = ["wall", "side", "rod", "run", "canopy", "sail"];

/** What a thing must stand to offer a SIDE to hang from (spec §6.1): a curtain on a 40cm stage's edge
 *  is a skirt, not a curtain. */
export const SIDE_MIN_HEIGHT_MM = 1000;
/** A ר's arm: how far a rod may reach out past its last post with nothing under it. */
export const CANTILEVER_MAX_MM = 3000;
/** A rod's height when nothing above says otherwise — a curtain's usual rail under open sky. */
export const ROD_HEIGHT_MM = 2400;
/** Two edges of a thing's outline meeting within this many degrees are ONE side (the seating
 *  rule — lib/studio/seating.ts joins edges smoother than 3° the same way). */
export const SMOOTH_TURN_DEG = 3;
/** The narrowest canopy spacing honoured — a typo of "1" must not cut ten thousand runs. */
const MIN_SPACING_MM = 100;

/** The height a NEW rod or run starts at, at the point it starts from: what is overhead there (spec
 *  §5.3 — a zone's ceiling, a building, a pergola: lib/venues/roofs.ts `roofHeightAt`, which every
 *  caller hands in), else the open-sky default. */
export function defaultRailHeight(point: Point, roofAt?: (p: Point) => number | null): number {
  const roof = roofAt?.(point);
  return roof && roof > 0 ? roof : ROD_HEIGHT_MM;
}

// ── Reading the legacy span into a rail ─────────────────────────────────────────────────────────

const railOfCache = new WeakMap<object, Rail>();
/** A placement's rail: its own, or the legacy wall span read as a `wall` rail (the `stairs` →
 *  `edgeItems` pattern — nothing new writes `span`). Null for anything that hangs on no rail. The
 *  legacy read is remembered per placement, so the rail object is stable while the row is — the
 *  canvas's memoised drape compares it by identity. */
export function railOf(p: Pick<Placement, "rail" | "span">): Rail | null {
  if (p.rail) return p.rail;
  const s = p.span;
  if (!s || !s.wallId) return null;
  const hit = railOfCache.get(p);
  if (hit) return hit;
  const r: WallRail = { type: "wall", wallId: s.wallId, from: s.from, to: s.to };
  railOfCache.set(p, r);
  return r;
}

/** Does this placement hang on a rail — a drape, of any kind? */
export function isRailed(p: Pick<Placement, "rail" | "span">): boolean {
  return !!p.rail || !!p.span?.wallId;
}

/** The fields a placement should carry for `rail`: the rail, and the legacy span let go. */
export function withRail<T extends Pick<Placement, "rail" | "span">>(p: T, rail: Rail): T {
  const { span: _legacy, ...rest } = p;
  void _legacy;
  return { ...(rest as T), rail };
}

// ── A thing with sides ──────────────────────────────────────────────────────────────────────────

/** A thing a side rail hangs from (or a sail is tied to): its outline as drawn, in plan mm — closed,
 *  a bowed side cut into short chords — the vertices the line runs THROUGH rather than turns at, and
 *  its height. */
export interface RailHost {
  outline: Point[];
  /** Vertex i joins edge i−1 to edge i as one line (a curve's samples, a rim). Absent = every vertex
   *  is a corner. */
  smooth?: number[];
  heightMm: number;
}

/** One side of a host: edges joined through smooth vertices, as a stage's side is. */
export interface RailSide {
  /** Its first edge — what a side rail stores as `side`. */
  edge: number;
  edges: number[];
  /** Its corners in order, `edges.length + 1` of them (a closed side ends where it began). */
  points: Point[];
  /** How far along it each of `points` is, mm. */
  cum: number[];
  L: number;
  closed: boolean;
  curved: boolean;
}

function signedArea(pts: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** The side edge `edge` of the host belongs to — null for an index the outline does not have. */
export function hostSide(host: RailHost, edge: number): RailSide | null {
  const outline = host.outline;
  const n = outline.length;
  if (n < 3 || !Number.isInteger(edge) || edge < 0 || edge >= n) return null;
  const smooth = new Set(host.smooth ?? []);
  let start = edge;
  let back = 0;
  while (smooth.has(start) && back < n) {
    start = (start - 1 + n) % n;
    back++;
  }
  const closed = back >= n;
  if (closed) start = 0;
  const edges = [start];
  while (edges.length < n && smooth.has((edges[edges.length - 1] + 1) % n)) edges.push((edges[edges.length - 1] + 1) % n);
  const points = [...edges.map((k) => outline[k]), outline[(edges[edges.length - 1] + 1) % n]];
  const cum = [0];
  for (let k = 1; k < points.length; k++) cum.push(cum[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
  return { edge: start, edges, points, cum, L: cum[cum.length - 1], closed, curved: edges.length > 1 };
}

/** Every side of the host, each once. */
export function hostSides(host: RailHost): RailSide[] {
  const seen = new Set<number>();
  const out: RailSide[] = [];
  for (let i = 0; i < host.outline.length; i++) {
    if (seen.has(i)) continue;
    const s = hostSide(host, i);
    if (!s) continue;
    s.edges.forEach((k) => seen.add(k));
    out.push(s);
  }
  return out;
}

/** The host's real corners — where each side starts — what a sail's `corner` indexes. A round thing
 *  has one (where its rim was started). */
export function hostCorners(host: RailHost): Point[] {
  return hostSides(host).map((s) => s.points[0]);
}

/** The point `s` mm along a side (held to its ends), and the side's unit direction there. */
export function sideAt(side: RailSide, s: number): { p: Point; u: Point } {
  const x = Math.max(0, Math.min(side.L, s));
  let k = 0;
  while (k < side.points.length - 2 && side.cum[k + 1] < x) k++;
  const a = side.points[k];
  const b = side.points[k + 1];
  const seg = side.cum[k + 1] - side.cum[k] || 1;
  const f = (x - side.cum[k]) / seg;
  return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, u: { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg } };
}

/** The side from `s0` to `s1` mm (s0 ≤ s1) as a polyline, every corner between them kept. */
export function sidePath(side: RailSide, s0: number, s1: number): Point[] {
  const lo = Math.max(0, Math.min(side.L, s0));
  const hi = Math.max(lo, Math.min(side.L, s1));
  const out = [sideAt(side, lo).p];
  for (let k = 1; k < side.points.length - 1; k++) if (side.cum[k] > lo + 1e-6 && side.cum[k] < hi - 1e-6) out.push(side.points[k]);
  out.push(sideAt(side, hi).p);
  return out;
}

/** Where along which side of a host a point falls nearest: the side, the fraction along it, how far
 *  off it the point was, and which way out of the thing it lies (+1 outside, −1 inside). */
export function nearestHostSide(host: RailHost, p: Point): { side: RailSide; t: number; distanceMm: number; out: 1 | -1 } | null {
  let best: { side: RailSide; t: number; distanceMm: number } | null = null;
  for (const side of hostSides(host)) {
    for (let k = 0; k < side.points.length - 1; k++) {
      const a = side.points[k];
      const b = side.points[k + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const f = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      const q = { x: a.x + dx * f, y: a.y + dy * f };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!best || d < best.distanceMm) best = { side, t: side.L > 0 ? (side.cum[k] + f * Math.sqrt(l2)) / side.L : 0, distanceMm: d };
    }
  }
  if (!best) return null;
  return { ...best, out: pointInPolygon(p, host.outline) ? -1 : 1 };
}

/** A host from a footprint as it stands — placed at `at`, turned, mirrored and scaled the way
 *  footprintPolygons places it — with the samples of every curved edge marked smooth, and the joint
 *  between two edges smooth where their tangents meet within SMOOTH_TURN_DEG (the four quarter arcs
 *  of a circle are one rim). A composite stands in for its largest piece. */
export function footprintHost(f: Footprint, at: Point, rotationDeg: number, heightMm: number, mirrored = false, scale = 1): RailHost | null {
  const pieces = footprintOutlines(f);
  if (!pieces.length) return null;
  const piece = pieces.length === 1 ? pieces[0] : pieces.reduce((a, b) => (Math.abs(signedArea(b.outline)) > Math.abs(signedArea(a.outline)) ? b : a));
  const { outline, edgeCurves } = piece;
  const n = outline.length;
  if (n < 2) return null;
  const t = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const place = (p: Point): Point => {
    const x = (mirrored ? -p.x : p.x) * scale;
    const y = p.y * scale;
    return { x: at.x + x * cos - y * sin, y: at.y + x * sin + y * cos };
  };
  // Each edge's tangent where it leaves its start and where it arrives at its end — a curve's handle
  // directions, a straight edge's own — to tell a corner from a curve running on.
  const tangent = (i: number, end: boolean): Point => {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const c = edgeCurves?.[i];
    let v: Point;
    if (c) {
      const { c1, c2 } = absoluteControlPoints(a, b, c);
      v = end ? { x: b.x - c2.x, y: b.y - c2.y } : { x: c1.x - a.x, y: c1.y - a.y };
      if (Math.hypot(v.x, v.y) < 1e-9) v = { x: b.x - a.x, y: b.y - a.y };
    } else v = { x: b.x - a.x, y: b.y - a.y };
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  };
  const pts: Point[] = [];
  const smooth: number[] = [];
  for (let i = 0; i < n; i++) {
    const into = tangent((i - 1 + n) % n, true);
    const outOf = tangent(i, false);
    const turn = (Math.acos(Math.max(-1, Math.min(1, into.x * outOf.x + into.y * outOf.y))) * 180) / Math.PI;
    // Only where a CURVE runs on into a curve (a circle's quarters, an ellipse's): the point where a
    // straight run meets a rounded corner is a real corner, as on a stage (stage-draw's rule) — else a
    // rounded rectangle would be one closed side and a curtain on its front would wrap the building.
    const curvedBoth = !!edgeCurves?.[(i - 1 + n) % n] && !!edgeCurves?.[i];
    if (curvedBoth && turn < SMOOTH_TURN_DEG) smooth.push(pts.length);
    const edge = flattenEdge(outline[i], outline[(i + 1) % n], edgeCurves?.[i]);
    edge.slice(0, -1).forEach((q, k) => {
      if (k > 0) smooth.push(pts.length);
      pts.push(q);
    });
  }
  return { outline: pts.map(place), smooth: smooth.length ? smooth : undefined, heightMm };
}

const featureHostCache = new WeakMap<StructureFeature, RailHost | null>();
/** A venue feature as a host — its footprint as drawn, at its height. Remembered per feature. */
export function featureHost(f: StructureFeature): RailHost | null {
  if (featureHostCache.has(f)) return featureHostCache.get(f)!;
  const host = footprintHost(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0, f.heightMm || 0);
  featureHostCache.set(f, host);
  return host;
}

/** A sketch item as a host: a stage by its own outline (its rim one side, as its edge items read
 *  it), anything else by its catalog footprint at the size it was stretched to. Its height is the
 *  stage's, else the row's. Null with no row to say what it is. */
export function placementHost(p: Placement, product: Product | undefined): RailHost | null {
  const heightMm = p.stage?.heightMm ?? product?.dimensions.heightMm ?? 0;
  if (p.stage) {
    const t = ((p.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const outline = p.stage.outline.map((q) => {
      const x = p.mirrored ? -q.x : q.x;
      return { x: p.position.x + x * cos - q.y * sin, y: p.position.y + x * sin + q.y * cos };
    });
    return { outline, smooth: p.stage.smooth, heightMm };
  }
  if (!product) return null;
  return footprintHost(sizedFootprint(product, p.sizeMm), p.position, p.rotation || 0, heightMm, !!p.mirrored, p.scale || 1);
}

/** The feature kinds a curtain may hang on the side of (spec §6.1): a structure (a building), a
 *  stage, a bar, an "other" — never a column (a post, not a side) — and a pergola (lib/venues/
 *  pergola.ts), whose sides are its beams. */
export const SIDE_HOST_KINDS: readonly string[] = ["structure", "stage", "bar", "other", "pergola"];
/** …and the catalog categories a sketch item offers its side from. */
export const SIDE_HOST_CATEGORIES: readonly string[] = ["stages", "stage-backdrops", "bars", "other", "pergolas"];

/** Does this host stand tall enough to hang a curtain from its side? */
export function hostsSide(host: RailHost | null): host is RailHost {
  return !!host && host.heightMm >= SIDE_MIN_HEIGHT_MM && host.outline.length >= 3;
}

/** A thing a curtain may hang on the side of, by id. */
export interface SideCandidate {
  id: string;
  host: RailHost;
}

/** Every thing a curtain may hang on the side of (spec §6.1): the venue's features of a SIDE_HOST_KINDS
 *  kind (`features` — as a sketch arranged them, or the venue as drawn), and — in a sketch — the
 *  document's floor items of a SIDE_HOST_CATEGORIES row; each only when it stands SIDE_MIN_HEIGHT_MM
 *  tall. */
export function sideCandidates(
  features: readonly StructureFeature[],
  doc?: Pick<DesignDocumentContent, "placements">,
  productOf?: (variantId: string) => Product | undefined,
): SideCandidate[] {
  const out: SideCandidate[] = [];
  for (const f of features) {
    if (!SIDE_HOST_KINDS.includes(f.kind)) continue;
    const host = featureHost(f);
    if (hostsSide(host)) out.push({ id: f.id, host });
  }
  for (const p of doc?.placements ?? []) {
    if (p.layer !== "floor" || p.tableId || p.perch || isRailed(p)) continue;
    const product = productOf?.(p.variantId);
    if (!product || (!p.stage && !SIDE_HOST_CATEGORIES.includes(product.category))) continue;
    const host = placementHost(p, product);
    if (hostsSide(host)) out.push({ id: p.id, host });
  }
  return out;
}

/** The side rail a curtain dropped at `p` would hang on: the nearest side of the nearest candidate,
 *  the WHOLE side (the bar shortens it), on the side of it the point fell. Null with none. */
export function nearestSideRail(candidates: readonly SideCandidate[], p: Point): { rail: SideRail; distanceMm: number } | null {
  let best: { rail: SideRail; distanceMm: number } | null = null;
  for (const c of candidates) {
    const hit = nearestHostSide(c.host, p);
    if (!hit || (best && hit.distanceMm >= best.distanceMm)) continue;
    best = { rail: { type: "side", featureId: c.id, side: hit.side.edge, from: 0, to: 1, out: hit.out }, distanceMm: hit.distanceMm };
  }
  return best;
}

// ── The context, and what a rail resolves to ────────────────────────────────────────────────────

/** What a rail is read against: the venue's WALLS (the property as drawn — no arrangement on a sketch
 *  moves a wall), and the lookup a side rail or a sail tie finds its thing by. Absent lookup = the
 *  structure's own features. */
export interface RailContext {
  structure: VenueStructure;
  outlineOf?: (id: string) => RailHost | null;
}

const structureLookup = new WeakMap<VenueStructure, (id: string) => RailHost | null>();
/** The default lookup: the structure's own features, by id. */
export function featureHosts(s: VenueStructure): (id: string) => RailHost | null {
  let fn = structureLookup.get(s);
  if (!fn) {
    const byId = new Map(s.features.map((f) => [f.id, f]));
    fn = (id: string) => {
      const f = byId.get(id);
      return f ? featureHost(f) : null;
    };
    structureLookup.set(s, fn);
  }
  return fn;
}

const placementHosts = new WeakMap<Placement, { product: Product | undefined; host: RailHost | null }>();
const sketchLookup = new WeakMap<DesignDocumentContent["placements"], WeakMap<VenueStructure, (id: string) => RailHost | null>>();
/** The context a SKETCH reads its rails in: walls from the property, a side rail's thing from the
 *  document's own items first (a hired stage, bar, backdrop), then the venue's features where this
 *  event stood them (`arranged`). `productOf` is the caller's catalog — the browser's resolver, or
 *  the server's rows. */
export function sketchRailContext(
  doc: Pick<DesignDocumentContent, "placements">,
  property: VenueStructure,
  arranged: VenueStructure,
  productOf: (variantId: string) => Product | undefined,
): RailContext {
  let byStructure = sketchLookup.get(doc.placements);
  if (!byStructure) {
    byStructure = new WeakMap();
    sketchLookup.set(doc.placements, byStructure);
  }
  let fn = byStructure.get(arranged);
  if (!fn) {
    const placements = new Map(doc.placements.map((p) => [p.id, p]));
    const features = featureHosts(arranged);
    fn = (id: string) => {
      const p = placements.get(id);
      if (!p) return features(id);
      // Remembered per placement row (and its catalog row) across documents, so a drag of something
      // ELSE leaves this host — and every rail resolved against it — the same object.
      const product = productOf(p.variantId);
      const hit = placementHosts.get(p);
      if (hit && hit.product === product) return hit.host;
      const host = placementHost(p, product);
      placementHosts.set(p, { product, host });
      return host;
    };
    byStructure.set(arranged, fn);
  }
  return { structure: property, outlineOf: fn };
}

/** One line a rail resolves to, in plan mm. */
export interface RailLine {
  /** The line itself, in order — round a bowed wall, a curved side, a rod's bends. */
  path: Point[];
  /** Along the path — the arc on a bow. What the quote bills a line rail by. */
  lengthMm: number;
  /** Its height above the floor, mm. Absent = the host's to say: a WALL rail hangs from the room's
   *  ceiling as a curtain always has (the reader decides, as before). */
  topMm?: number;
  /** Which side of the path the cloth hangs on: +1 its left-hand normal ((−dy, dx) of the direction
   *  it runs), −1 the other, 0 centred on the line (a sketch's drape on a wall, a rod's cloth). */
  hang: 1 | -1 | 0;
  /** How low the middle of a line in the air hangs (a run, a canopy's runs). */
  sagMm?: number;
  /** A WALL rail's own reading: the wall's track and the ordered fractions — the door parting and
   *  the end grips read these. */
  wall?: { wallId: string; track: WallTrack; t0: number; t1: number };
  /** A SIDE rail's: the side and the stretch along it, mm — the end grips read these. */
  side?: { featureId: string; side: RailSide; s0: number; s1: number };
  /** A ROD's posts — every end and bend standing on the floor, but a cantilevered end. */
  posts?: Point[];
}

/** A sail resolved: its corners in order, each one's height, the sag, and the posts it brings. */
export interface RailSheet {
  polygon: Point[];
  heights: number[];
  sagMm: number;
  posts: Point[];
  areaMm2: number;
}

export type ResolvedRail = { type: "lines"; lines: RailLine[]; lengthMm: number } | { type: "sheet"; sheet: RailSheet };

const pathLength = (path: readonly Point[]) => path.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - path[i].x, q.y - path[i].y), 0);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const resolveCache = new WeakMap<Rail, { structure: VenueStructure; host: RailHost | null; out: ResolvedRail | null }>();

/** A rail as lines (or a sheet), or null when what it hangs on is gone. Remembered per rail object
 *  against the walls and the host it was read against, so a drape that did not move resolves to the
 *  same object frame after frame. */
export function resolveRail(rail: Rail, ctx: RailContext): ResolvedRail | null {
  const lookup = ctx.outlineOf ?? featureHosts(ctx.structure);
  const host = rail.type === "side" ? lookup(rail.featureId) : null;
  const hit = resolveCache.get(rail);
  // A sail may be tied to things that moved; it is cheap and rare, so it is never remembered.
  if (hit && rail.type !== "sail" && hit.structure === ctx.structure && hit.host === host) return hit.out;
  const out = resolveFresh(rail, ctx, lookup, host);
  if (rail.type !== "sail") resolveCache.set(rail, { structure: ctx.structure, host, out });
  return out;
}

function lines(ls: RailLine[]): ResolvedRail {
  return { type: "lines", lines: ls, lengthMm: ls.reduce((n, l) => n + l.lengthMm, 0) };
}

function resolveFresh(rail: Rail, ctx: RailContext, lookup: (id: string) => RailHost | null, host: RailHost | null): ResolvedRail | null {
  switch (rail.type) {
    case "wall": {
      const span = resolveSpan(ctx.structure, rail);
      if (!span) return null;
      return lines([
        {
          path: span.path,
          lengthMm: span.lengthMm,
          ...(rail.heightMm !== undefined ? { topMm: rail.heightMm } : {}),
          hang: rail.side ?? 0,
          wall: { wallId: rail.wallId, track: span.track, t0: span.t0, t1: span.t1 },
        },
      ]);
    }
    case "side": {
      if (!host) return null;
      const side = hostSide(host, rail.side);
      if (!side || side.L <= 0) return null;
      const s0 = clamp01(Math.min(rail.from, rail.to)) * side.L;
      const s1 = clamp01(Math.max(rail.from, rail.to)) * side.L;
      const path = sidePath(side, s0, s1);
      // Which of the path's normals points OUT of the thing: read at the stretch's middle, a hand off
      // the side, against the outline itself — no winding convention to get backwards.
      const mid = sideAt(side, (s0 + s1) / 2);
      const left = { x: -mid.u.y, y: mid.u.x };
      const leftIsOut = !pointInPolygon({ x: mid.p.x + left.x * 5, y: mid.p.y + left.y * 5 }, host.outline);
      const hang: 1 | -1 = (rail.out === 1) === leftIsOut ? 1 : -1;
      return lines([{ path, lengthMm: s1 - s0, topMm: host.heightMm, hang, side: { featureId: rail.featureId, side, s0, s1 } }]);
    }
    case "rod": {
      const path = rodPath(rail);
      if (path.length < 2) return null;
      const posts = path.filter((_, i) => !(rail.cantilever === "start" && i === 0) && !(rail.cantilever === "end" && i === path.length - 1));
      return lines([{ path, lengthMm: pathLength(path), topMm: rail.heightMm, hang: 0, posts }]);
    }
    case "run": {
      const path = [rail.a, rail.b];
      return lines([{ path, lengthMm: pathLength(path), topMm: rail.heightMm, hang: 0, ...(rail.sagMm !== undefined ? { sagMm: rail.sagMm } : {}) }]);
    }
    case "canopy": {
      const runs = canopyRuns(rail);
      if (!runs.length) return null;
      return lines(runs.map((r) => ({ path: [r.a, r.b], lengthMm: pathLength([r.a, r.b]), topMm: r.heightMm, hang: 0 as const, ...(r.sagMm !== undefined ? { sagMm: r.sagMm } : {}) })));
    }
    case "sail": {
      if (rail.ties.length < 3) return null;
      const polygon: Point[] = [];
      const posts: Point[] = [];
      for (const tie of rail.ties) {
        const to = tie.to;
        if (to?.kind === "wall") {
          const tr = wallTrack(ctx.structure, to.wallId);
          if (!tr) return null;
          polygon.push(tr.at(to.t).p);
        } else if (to?.kind === "feature") {
          const h = lookup(to.featureId);
          const corner = h ? hostCorners(h)[to.corner] : undefined;
          if (!corner) return null;
          polygon.push(corner);
        } else {
          polygon.push(tie.p);
          if (to?.kind === "post") posts.push(tie.p);
        }
      }
      let diag = 0;
      for (let i = 0; i < polygon.length; i++) for (let j = i + 1; j < polygon.length; j++) diag = Math.max(diag, Math.hypot(polygon[i].x - polygon[j].x, polygon[i].y - polygon[j].y));
      return {
        type: "sheet",
        sheet: { polygon, heights: rail.ties.map((t) => t.heightMm), sagMm: rail.sagMm ?? Math.round(diag * SAIL_SAG), posts, areaMm2: Math.abs(polygonAreaMm2(polygon)) },
      };
    }
  }
}

/** A sail's default sag: 8% of its longest diagonal (spec §6.3). */
const SAIL_SAG = 0.08;

/** The lines a rail resolves to — none for a sail or a rail whose wall/thing is gone. */
export function railLines(rail: Rail, ctx: RailContext): RailLine[] {
  const r = resolveRail(rail, ctx);
  return r?.type === "lines" ? r.lines : [];
}

/** How long a line rail is along itself — the sum of its lines, the arc on a bowed wall. Undefined
 *  for a sail (an area) or a rail whose wall/thing is gone. */
export function railLengthMm(rail: Rail, ctx: RailContext): number | undefined {
  const r = resolveRail(rail, ctx);
  return r?.type === "lines" ? r.lengthMm : undefined;
}

/** A rod's polyline as it stands: its points, with a cantilevered arm held to CANTILEVER_MAX_MM. */
export function rodPath(rail: RodRail): Point[] {
  const pts = rail.points.slice();
  if (pts.length < 2 || !rail.cantilever) return pts;
  const [tip, base] = rail.cantilever === "end" ? [pts.length - 1, pts.length - 2] : [0, 1];
  const a = pts[base];
  const b = pts[tip];
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l > CANTILEVER_MAX_MM) pts[tip] = { x: a.x + ((b.x - a.x) * CANTILEVER_MAX_MM) / l, y: a.y + ((b.y - a.y) * CANTILEVER_MAX_MM) / l };
  return pts;
}

/** A rod with its point `i` moved to `p` (whole millimetres) — a post dragged, or the tip of a ר's
 *  arm, held to CANTILEVER_MAX_MM from the post before it. */
export function rodPointMoved(rail: RodRail, i: number, p: Point): RodRail {
  const pts = rail.points.slice();
  if (i < 0 || i >= pts.length) return rail;
  let q = { x: Math.round(p.x), y: Math.round(p.y) };
  const tip = (i === 0 && rail.cantilever === "start") || (i === pts.length - 1 && rail.cantilever === "end");
  if (tip && pts.length >= 2) {
    const base = pts[i === 0 ? 1 : pts.length - 2];
    const l = Math.hypot(q.x - base.x, q.y - base.y);
    if (l > CANTILEVER_MAX_MM) q = { x: Math.round(base.x + ((q.x - base.x) * CANTILEVER_MAX_MM) / l), y: Math.round(base.y + ((q.y - base.y) * CANTILEVER_MAX_MM) / l) };
  }
  pts[i] = q;
  return { ...rail, points: pts };
}

// ── A rod's own measurements, and the rod as a thing placed by itself ───────────────────────────

/** A rod's thickness when its rail says none: the 3 cm bar every curtain's rod has been drawn as. */
export const ROD_THICK_MM = 30;
export const ROD_THICK_MIN_MM = 10;
export const ROD_THICK_MAX_MM = 300;
/** The shortest rod a typed length may leave (and the shortest last stretch of a bent one). */
export const ROD_MIN_MM = 300;

/** How thick a rod is across, mm — its own, held to what a rod can be, else the default. */
export function rodThickMm(rail: Pick<RodRail, "thickMm">): number {
  const t = rail.thickMm;
  return t && t > 0 ? Math.max(ROD_THICK_MIN_MM, Math.min(ROD_THICK_MAX_MM, Math.round(t))) : ROD_THICK_MM;
}

/** A rod's post, across: a 5 cm square section, or the rod's own thickness and a little when it is
 *  a heavier one — a post is never thinner than what it carries. */
export function rodPostMm(rail: Pick<RodRail, "thickMm">): number {
  return Math.max(50, rodThickMm(rail) + 20);
}

/** A rod with its thickness typed — the default is never stored (absent = the old drawing). */
export function rodWithThick(rail: RodRail, thickMm: number): RodRail {
  const { thickMm: _old, ...rest } = rail;
  void _old;
  if (!(thickMm > 0)) return rest;
  const t = Math.max(ROD_THICK_MIN_MM, Math.min(ROD_THICK_MAX_MM, Math.round(thickMm)));
  return t === ROD_THICK_MM ? rest : { ...rest, thickMm: t };
}

/** A rod's length along itself, mm — its polyline as it stands (a ר's arm held to its reach). */
export function rodRunMm(rail: RodRail): number {
  return pathLength(rodPath(rail));
}

/** A rod with its length TYPED: its first post stays where it is and its LAST stretch is made longer
 *  or shorter along its own direction, so the whole comes to `lengthMm` — a straight rod is simply
 *  that long; an L keeps its first arm and its corner. Never under ROD_MIN_MM for that last stretch
 *  (a typed total shorter than the arms before it leaves the shortest arm there is); a ר's arm is
 *  still held to its reach by rodPath. Whole millimetres. */
export function rodWithLength(rail: RodRail, lengthMm: number): RodRail {
  const pts = rail.points;
  if (pts.length < 2 || !(lengthMm > 0)) return rail;
  const before = pathLength(pts.slice(0, -1));
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l < 1e-6) return rail;
  const want = Math.max(ROD_MIN_MM, lengthMm - before);
  const end = { x: Math.round(a.x + ((b.x - a.x) * want) / l), y: Math.round(a.y + ((b.y - a.y) * want) / l) };
  return { ...rail, points: [...pts.slice(0, -1), end] };
}

/** The catalog category a ROD's own row is filed in (lib/catalog/categories.ts): the studio's built-in
 *  מוט וילון. A placement of such a row is a BARE ROD — a rod standing with nothing on it yet. */
export const ROD_CATEGORY = "curtain-rods";
export function isRodRow(product: Pick<Product, "category"> | undefined | null): boolean {
  return product?.category === ROD_CATEGORY;
}

/** How near a bare rod a curtain must be let go to be hung on it. */
export const ROD_ADOPT_MM = 800;
/** How far from a wall or a side a dropped curtain still goes to it. Past this it is in the open, and
 *  stands on a rod of its own where it was let go — a curtain dropped in the middle of a 30 m hall
 *  used to fly to a wall fifteen metres away. */
export const HANG_REACH_MM = 3000;
/** A curtain's own rod, dropped in the open: 3 m along the drop. */
export const ROD_DROP_MM = 3000;
/** The width the built-in rod row was first shipped with — a placeholder for a row that was "never
 *  placed", not a length anybody chose. */
const ROD_ROW_LEGACY_MM = 1000;
/** How long a rod dropped from its row is laid: the row's width, once the studio has typed one — a
 *  row still carrying the first kit's 1 m placeholder (or none) is laid at ROD_DROP_MM. */
export function rodDropLength(rowWidthMm: number | undefined): number {
  return rowWidthMm && rowWidthMm > 0 && rowWidthMm !== ROD_ROW_LEGACY_MM ? Math.max(ROD_MIN_MM, rowWidthMm) : ROD_DROP_MM;
}

function distanceToPath(p: Point, path: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const f = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * f), p.y - (a.y + dy * f)));
  }
  return best;
}

/** The bare rod nearest a point: a placement of a rod's own row (`isRod` says which variants are),
 *  standing on a rod rail. Null with none on the plan. */
export function nearestBareRod(
  placements: readonly Pick<Placement, "id" | "variantId" | "rail">[],
  isRod: (variantId: string) => boolean,
  p: Point,
): { id: string; distanceMm: number } | null {
  let best: { id: string; distanceMm: number } | null = null;
  for (const pl of placements) {
    if (pl.rail?.type !== "rod" || !isRod(pl.variantId)) continue;
    const d = distanceToPath(p, rodPath(pl.rail));
    if (!best || d < best.distanceMm) best = { id: pl.id, distanceMm: d };
  }
  return best;
}

/** Where a curtain let go at `p` hangs. Of what is in reach — a bare ROD within ROD_ADOPT_MM (the
 *  curtain is hung on it: `adopt`), the nearest WALL and the nearest SIDE of a tall thing within
 *  HANG_REACH_MM — the nearest wins; with nothing in reach it stands on a rod of its own through the
 *  drop, `rodLengthMm` long, when its category takes one (`takes`). Null = nowhere to hang it. */
export type CurtainDrop = { kind: "adopt"; placementId: string } | { kind: "rail"; rail: Rail };
export function curtainDrop(o: {
  p: Point;
  wall: { wallId: string; distanceMm: number } | null;
  side: { rail: SideRail; distanceMm: number } | null;
  rod: { id: string; distanceMm: number } | null;
  takes: (t: RailType) => boolean;
  /** The height a rod of its own starts at here (defaultRailHeight). */
  rodHeightMm: number;
  rodLengthMm?: number;
}): CurtainDrop | null {
  const wallOk = o.wall && o.takes("wall") ? o.wall : null;
  const sideOk = o.side && o.takes("side") ? o.side : null;
  const wall = wallOk && wallOk.distanceMm <= HANG_REACH_MM ? wallOk : null;
  const side = sideOk && sideOk.distanceMm <= HANG_REACH_MM ? sideOk : null;
  const rod = o.rod && o.takes("rod") && o.rod.distanceMm <= ROD_ADOPT_MM ? o.rod : null;
  const nearest = Math.min(wall?.distanceMm ?? Infinity, side?.distanceMm ?? Infinity, rod?.distanceMm ?? Infinity);
  if (rod && rod.distanceMm === nearest) return { kind: "adopt", placementId: rod.id };
  if (side && side.distanceMm === nearest) return { kind: "rail", rail: side.rail };
  if (wall) return { kind: "rail", rail: { type: "wall", wallId: wall.wallId, from: 0, to: 1 } };
  if (o.takes("rod")) return { kind: "rail", rail: rodAt(o.p, o.rodLengthMm ?? ROD_DROP_MM, o.rodHeightMm) };
  // A category that takes no rod (none today) still goes to its wall or side, however far.
  if (sideOk && (!wallOk || sideOk.distanceMm < wallOk.distanceMm)) return { kind: "rail", rail: sideOk.rail };
  if (wallOk) return { kind: "rail", rail: { type: "wall", wallId: wallOk.wallId, from: 0, to: 1 } };
  return null;
}

/** A straight rod `lengthMm` long through `p`, along x, at `heightMm` — what a drop in the open lays. */
export function rodAt(p: Point, lengthMm: number, heightMm: number, thickMm?: number): RodRail {
  const half = Math.max(ROD_MIN_MM, lengthMm) / 2;
  const rail: RodRail = { type: "rod", points: [{ x: Math.round(p.x - half), y: Math.round(p.y) }, { x: Math.round(p.x + half), y: Math.round(p.y) }], heightMm };
  return thickMm ? rodWithThick(rail, thickMm) : rail;
}

/** A canopy's runs: parallel lines across its outline at `directionDeg`, cut where they cross it,
 *  spread evenly so the strips they stand for tile the area edge to edge (the spacing is honoured to
 *  the nearest whole number of strips). A concave outline cuts a line into several runs. */
export function canopyRuns(rail: CanopyRail): RunRail[] {
  const poly = rail.outline;
  if (poly.length < 3) return [];
  const th = (rail.directionDeg * Math.PI) / 180;
  const d = { x: Math.cos(th), y: Math.sin(th) };
  const n = { x: -d.y, y: d.x };
  const across = poly.map((p) => p.x * n.x + p.y * n.y);
  const lo = Math.min(...across);
  const hi = Math.max(...across);
  const span = hi - lo;
  if (span <= 0) return [];
  const count = Math.max(1, Math.round(span / Math.max(MIN_SPACING_MM, rail.spacingMm || MIN_SPACING_MM)));
  const step = span / count;
  const out: RunRail[] = [];
  for (let k = 0; k < count; k++) {
    const o = lo + step * (k + 0.5);
    // Where the line p·n = o crosses each edge, as a position along d.
    const hits: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ca = across[i] - o;
      const cb = across[(i + 1) % poly.length] - o;
      if ((ca < 0 && cb >= 0) || (cb < 0 && ca >= 0)) {
        const f = ca / (ca - cb);
        const q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        hits.push(q.x * d.x + q.y * d.y);
      }
    }
    hits.sort((x, y) => x - y);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      if (hits[i + 1] - hits[i] < 1) continue;
      const at = (s: number) => ({ x: d.x * s + n.x * o, y: d.y * s + n.y * o });
      out.push({ type: "run", a: at(hits[i]), b: at(hits[i + 1]), heightMm: rail.heightMm, ...(rail.sagMm !== undefined ? { sagMm: rail.sagMm } : {}) });
    }
  }
  return out;
}

// ── Drawing helpers every surface shares ────────────────────────────────────────────────────────

/** A polyline moved `off` mm along its left-hand normal ((−dy, dx) of its direction), each corner
 *  mitred (held to 4× the offset, so a hairpin does not spike). */
export function offsetPath(path: readonly Point[], off: number): Point[] {
  if (!off || path.length < 2) return path.slice();
  const norms = path.slice(1).map((q, i) => {
    const dx = q.x - path[i].x;
    const dy = q.y - path[i].y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  });
  return path.map((p, i) => {
    const a = norms[Math.max(0, i - 1)];
    const b = norms[Math.min(norms.length - 1, i)];
    let m = { x: a.x + b.x, y: a.y + b.y };
    const ml = Math.hypot(m.x, m.y);
    if (ml < 1e-9) return { x: p.x + b.x * off, y: p.y + b.y * off };
    m = { x: m.x / ml, y: m.y / ml };
    const cos = m.x * b.x + m.y * b.y;
    const k = Math.min(4, 1 / Math.max(0.25, cos));
    return { x: p.x + m.x * off * k, y: p.y + m.y * off * k };
  });
}

/** A line's cloth on the plan, as one closed outline: centred on the line (hang 0) or `depthMm` out on
 *  its hang side. On a wall the band is the wall's own (spanBand — round the bow exactly as before). */
export function railBand(line: RailLine, depthMm: number): Point[] {
  const [near, far] = line.hang === 0 ? [-depthMm / 2, depthMm / 2] : [0, depthMm * line.hang];
  if (line.wall) return spanBand(line.wall.track, line.wall.t0, line.wall.t1, near, far);
  return [...offsetPath(line.path, near), ...offsetPath(line.path, far).reverse()];
}

/** The middle of a line's cloth — what its pleats are drawn along. */
export function railClothLine(line: RailLine, depthMm: number): Point[] {
  const off = line.hang === 0 ? 0 : (depthMm / 2) * line.hang;
  if (!off) return line.path;
  if (line.wall) return line.wall.track.path(line.wall.t0, line.wall.t1, off);
  return offsetPath(line.path, off);
}

/** The middle of a line along itself — where a rail is "at" for a zone or a label. On a wall, out on
 *  the bow at the stretch's middle fraction, as the zone sheets have always read a drape. */
export function railMidpoint(line: RailLine): Point {
  if (line.wall) return line.wall.track.at((line.wall.t0 + line.wall.t1) / 2).p;
  const half = line.lengthMm / 2;
  let run = 0;
  for (let i = 1; i < line.path.length; i++) {
    const a = line.path[i - 1];
    const b = line.path[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (run + l >= half) {
      const f = l > 0 ? (half - run) / l : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    run += l;
  }
  return line.path[line.path.length - 1] ?? { x: 0, y: 0 };
}

/** The ids a rail names in the VENUE — its wall, or the venue feature its side or a sail's tie is on
 *  (an id the document does not hold). What leaving a sketch's room behind has to drop
 *  (lib/studio/sketches.ts adoptSketch). */
export function railNamesVenue(rail: Rail, documentIds: ReadonlySet<string>): boolean {
  switch (rail.type) {
    case "wall":
      return true;
    case "side":
      return !documentIds.has(rail.featureId);
    case "sail":
      return rail.ties.some((t) => t.to?.kind === "wall" || (t.to?.kind === "feature" && !documentIds.has(t.to.featureId)));
    default:
      return false;
  }
}

/** A rail moved by (dx, dy) — what a pasted or carried rail of its own points does. A rail on a wall
 *  or a thing stays where its wall or thing is; a sail's tied corners stay tied. */
export function railMoved(rail: Rail, dx: number, dy: number): Rail {
  const mv = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  switch (rail.type) {
    case "rod":
      return { ...rail, points: rail.points.map(mv) };
    case "run":
      return { ...rail, a: mv(rail.a), b: mv(rail.b) };
    case "canopy":
      return { ...rail, outline: rail.outline.map(mv) };
    case "sail":
      return { ...rail, ties: rail.ties.map((t) => (t.to && t.to.kind !== "post" ? t : { ...t, p: mv(t.p) })) };
    default:
      return rail;
  }
}
