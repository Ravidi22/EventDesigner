// The venue's own curtain — "וילון" — hung along a wall (the user, 2026-10-30: "add in /halls a
// default וילון, like אמרה has default black וילון in both halls; can be removed or changed in the
// sketch").
//
// A curtain is a FEATURE (kind "curtain") so that everything a venue feature already gets comes for
// free: it is drawn on /halls, the sketch and both printed looks, it is in the way of a table like
// a bar, and a sketch may take it out of its own room (FeaturePlacement.removed — "bring it back"
// clears a flag) or swap it for a curtain from the catalog, which is then a drape placement on the
// same wall stretch, quoted and packed as any hired one. The venue's own is never counted.
//
// It is ANCHORED, not placed: `StructureFeature.curtain` is the sketch's own WallSpan — a wall id
// and two fractions along it — plus which SIDE of the wall it hangs on (a wall between two halls
// carries one for each). The feature's box (x, y, width, depth, turn) is DERIVED from the span and
// written with it (curtainBox / curtainPatch), as a seating block's is from its rows, so every
// reader of the footprint sees the band where it hangs — and every edit of the walls re-lays it
// (syncCurtains), so a wall corrected at /halls carries its curtain with it, which is the rule a
// drape in a sketch already follows.
//
// A BOWED wall takes one too (the user, same day: "why can't I put a curtain on a curved wall?"):
// everything here reads the wall through its WallTrack (lib/studio/anchor.ts), so the band follows
// the bow — on the plan a curved strip (the feature's footprint is then that strip as a `custom`
// outline in the box), its pleats along the curve, its ends slid along the curve, its length the
// arc's, and in 3D a pleated ribbon round it. On a straight wall it is the rectangle it always was.
//
// Since 2026-11-07 the stretch is a RAIL (lib/studio/rail.ts — spec §6.6): a wall rail as before, a
// SIDE of a building or a tall feature (re-laid when the feature moves), or a free-standing ROD.
// `curtainRail(f)` reads either the rail or the legacy wall fields; nothing new writes the legacy
// fields. Door parting is a WALL rail's alone (curtainPieces). The cloth's look (`style`) and its drop
// are the feature's too, drawing-only like a hired drape's.
import type { Point } from "@/lib/studio/hall";
import type { WallSpan } from "@/lib/design-document/types";
import type { CurtainStyle } from "@/lib/catalog/symbols";
import { spanBand, wallTrack, type WallTrack } from "@/lib/studio/anchor";
import { CANTILEVER_MAX_MM, featureHosts, hostSide, railBand, railClothLine, resolveRail, type Rail, type RailContext, type RailLine, type RodRail, type SideRail } from "@/lib/studio/rail";
import { fromLocalFrame, toLocalFrame, wallAngleDeg } from "@/lib/studio/geometry";
import { doorsOf, newFeature, type StructureFeature, type VenueStructure } from "./structure";
import { isMain } from "../self-check";

/** A curtain on a WALL, read: the stretch, ordered, and which side of its wall it hangs on: +1 for
 *  the side the wall's left-hand normal points to (n = (−dy, dx) of a→b, the normal where it hangs on
 *  a bowed wall), −1 for the other — the same handedness the 3D curtain reads. */
export interface WallCurtain extends WallSpan {
  side: 1 | -1;
}

/** What `StructureFeature.curtain` stores: the rail it hangs on, its look and its drop. The wall
 *  fields are the LEGACY form (every curtain hung before rails) — read by curtainRail, never written. */
export interface FeatureCurtain {
  rail?: Rail;
  /** How the cloth is gathered (SYMBOL_STYLES.curtain). Absent = waves, the pleats it always had. */
  style?: CurtainStyle;
  /** How far the cloth comes down, mm. Absent = to the floor. */
  dropMm?: number;
  wallId?: string;
  from?: number;
  to?: number;
  side?: 1 | -1;
}

/** The band's depth on the plan — the sketch's own drape (canvas-stage DRAPE_MM). */
export const CURTAIN_DEPTH_MM = 220;
/** A new curtain's cloth: the black most halls hang. */
export const CURTAIN_FILL = "#1f1d22";
/** A curtain shorter than this is a mistake, not a curtain. */
const MIN_CURTAIN_MM = 200;
/** A curtain stops this far short of a door's jamb on either side — room for the leaf to swing and
 *  for the people coming through (the user, 2026-10-30: "the main entrance should not be blocked by
 *  the curtain"). */
export const DOOR_CLEAR_MM = 150;

const legacyRails = new WeakMap<FeatureCurtain, Rail>();
/** The rail a curtain hangs on — its own, or the legacy wall stretch read as a wall rail (with the
 *  fallbacks a half-saved row could need). Null for a curtain that names nothing. Remembered per
 *  stored field, so the rail is one object while the row is. */
export function curtainRail(f: Pick<StructureFeature, "curtain">): Rail | null {
  const c = f.curtain;
  if (!c) return null;
  if (c.rail) return c.rail;
  if (!c.wallId) return null;
  const hit = legacyRails.get(c);
  if (hit) return hit;
  const lo = Math.max(0, Math.min(1, Math.min(c.from ?? 0, c.to ?? 1)));
  const hi = Math.max(0, Math.min(1, Math.max(c.from ?? 0, c.to ?? 1)));
  const rail: Rail = { type: "wall", wallId: c.wallId, from: lo, to: hi, side: c.side === -1 ? -1 : 1 };
  legacyRails.set(c, rail);
  return rail;
}

/** A curtain on a WALL, read: its stretch ordered and its side — null for a curtain on any other rail
 *  (or none). What the wall-only rules (door parting, the wall's own band) read. */
export function curtainOf(f: Pick<StructureFeature, "curtain">): WallCurtain | null {
  const r = curtainRail(f);
  if (!r || r.type !== "wall") return null;
  const lo = Math.max(0, Math.min(1, Math.min(r.from, r.to)));
  const hi = Math.max(0, Math.min(1, Math.max(r.from, r.to)));
  return { wallId: r.wallId, from: lo, to: hi, side: r.side === -1 ? -1 : 1 };
}

/** What a curtain's stored field becomes when its rail is written: the rail, its look kept, the
 *  legacy wall fields let go. */
function withCurtainRail(f: Pick<StructureFeature, "curtain">, rail: Rail): FeatureCurtain {
  return { rail, ...(f.curtain?.style ? { style: f.curtain.style } : {}), ...(f.curtain?.dropMm !== undefined ? { dropMm: f.curtain.dropMm } : {}) };
}

/** A curtain's rail as lines, read against the venue — its own features are what a side rail hangs
 *  from. */
export function curtainLines(s: VenueStructure, f: Pick<StructureFeature, "curtain">): RailLine[] {
  const rail = curtainRail(f);
  const r = rail ? resolveRail(rail, curtainCtx(s)) : null;
  return r?.type === "lines" ? r.lines : [];
}
const ctxCache = new WeakMap<VenueStructure, RailContext>();
function curtainCtx(s: VenueStructure): RailContext {
  let c = ctxCache.get(s);
  if (!c) {
    c = { structure: s, outlineOf: featureHosts(s) };
    ctxCache.set(s, c);
  }
  return c;
}

type CurtainBox = Pick<StructureFeature, "x" | "y" | "widthMm" | "depthMm" | "rotationDeg" | "shape" | "outline" | "edgeCurves">;

/** The box a curtain's span resolves to. On a straight wall: as long as the stretch, CURTAIN_DEPTH_MM
 *  deep, turned with its wall, its centre half a band off the wall's line on its side. On a bowed
 *  one: turned to the chord between the stretch's ends, the box the curved band stands in, with the
 *  band itself as the box's `custom` outline. Null when the wall is gone (the feature keeps the box
 *  it had — the property is the authority, as with a drape). */
export function curtainBox(s: VenueStructure, c: WallCurtain): CurtainBox | null {
  const tr = wallTrack(s, c.wallId);
  if (!tr) return null;
  const from = tr.at(c.from).p;
  const to = tr.at(c.to).p;
  if (!tr.curved) {
    const n = tr.at(0).n;
    const off = (CURTAIN_DEPTH_MM / 2) * c.side;
    return {
      x: Math.round((from.x + to.x) / 2 + n.x * off),
      y: Math.round((from.y + to.y) / 2 + n.y * off),
      widthMm: Math.max(MIN_CURTAIN_MM, Math.round(tr.mmAt(c.to) - tr.mmAt(c.from))),
      depthMm: CURTAIN_DEPTH_MM,
      rotationDeg: turnOf(wallAngleDeg(tr.a, tr.b)),
      shape: "rect",
      outline: undefined,
      edgeCurves: undefined,
    };
  }
  // The stretch's own chord sets the turn; a stretch too short to have one turns with the wall.
  const rotationDeg = turnOf(Math.hypot(to.x - from.x, to.y - from.y) > 1 ? wallAngleDeg(from, to) : wallAngleDeg(tr.a, tr.b));
  const band = spanBand(tr, c.from, c.to, 0, CURTAIN_DEPTH_MM * c.side).map((p) => toLocalFrame(p, from, rotationDeg));
  const xs = band.map((p) => p.x);
  const ys = band.map((p) => p.y);
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const centre = fromLocalFrame(mid, from, rotationDeg);
  return {
    x: Math.round(centre.x),
    y: Math.round(centre.y),
    widthMm: Math.max(MIN_CURTAIN_MM, Math.round(Math.max(...xs) - Math.min(...xs))),
    depthMm: Math.max(1, Math.round(Math.max(...ys) - Math.min(...ys))),
    rotationDeg,
    shape: "custom",
    outline: band.map((p) => ({ x: Math.round(p.x - mid.x), y: Math.round(p.y - mid.y) })),
    edgeCurves: undefined,
  };
}

function turnOf(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** The box a curtain on ANY rail stands in: a wall curtain's as before; on a side or a rod, the
 *  band along its line — a plain rectangle on a straight one, the strip as a `custom` outline in the
 *  box its chord turns when the line bends (a round pergola's rim, an L of a rod). Null when what it
 *  hangs on is gone. */
export function curtainBoxOf(s: VenueStructure, f: Pick<StructureFeature, "curtain">): CurtainBox | null {
  const wall = curtainOf(f);
  if (wall) return curtainBox(s, wall);
  const line = curtainLines(s, f)[0];
  if (!line || line.path.length < 2) return null;
  const a = line.path[0];
  const b = line.path[line.path.length - 1];
  const band = railBand(line, CURTAIN_DEPTH_MM);
  if (line.path.length === 2) {
    const cx = band.reduce((n, q) => n + q.x, 0) / band.length;
    const cy = band.reduce((n, q) => n + q.y, 0) / band.length;
    return {
      x: Math.round(cx),
      y: Math.round(cy),
      widthMm: Math.max(MIN_CURTAIN_MM, Math.round(line.lengthMm)),
      depthMm: CURTAIN_DEPTH_MM,
      rotationDeg: turnOf(wallAngleDeg(a, b)),
      shape: "rect",
      outline: undefined,
      edgeCurves: undefined,
    };
  }
  // The chord between the ends turns the box; a closed rim (its ends meet) turns with its first run.
  const rotationDeg = turnOf(Math.hypot(b.x - a.x, b.y - a.y) > 1 ? wallAngleDeg(a, b) : wallAngleDeg(a, line.path[1]));
  const local = band.map((p) => toLocalFrame(p, a, rotationDeg));
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const centre = fromLocalFrame(mid, a, rotationDeg);
  return {
    x: Math.round(centre.x),
    y: Math.round(centre.y),
    widthMm: Math.max(MIN_CURTAIN_MM, Math.round(Math.max(...xs) - Math.min(...xs))),
    depthMm: Math.max(1, Math.round(Math.max(...ys) - Math.min(...ys))),
    rotationDeg,
    shape: "custom",
    outline: local.map((p) => ({ x: Math.round(p.x - mid.x), y: Math.round(p.y - mid.y) })),
    edgeCurves: undefined,
  };
}

/** Which side of the wall a point is on, in the handedness `FeatureCurtain.side` uses — read
 *  against the wall where it is NEAREST the point, so a click inside a bow lands on the bow's inside
 *  even where the chord would put it outside. */
export function sideOfWall(s: VenueStructure, wallId: string, p: Point): 1 | -1 {
  const tr = wallTrack(s, wallId);
  if (!tr) return 1;
  const { p: q, n } = tr.at(tr.nearestT(p));
  return n.x * (p.x - q.x) + n.y * (p.y - q.y) >= 0 ? 1 : -1;
}

/** A new curtain along `wallId` — the whole wall unless a stretch is given — on the side of the
 *  wall `at` lies (the click that placed it), in the default black. Null for a wall that is gone. */
export function newCurtain(s: VenueStructure, wallId: string, at: Point, from = 0, to = 1): Omit<StructureFeature, "id"> | null {
  if (!s.walls.some((w) => w.id === wallId)) return null;
  return newRailCurtain(s, { type: "wall", wallId, from: Math.min(from, to), to: Math.max(from, to), side: sideOfWall(s, wallId, at) });
}

/** A new curtain on any rail — a side of a feature (spec §6.1), a rod (§6.2) — in the default black.
 *  Null when the rail resolves to nothing (its wall or feature is gone). */
export function newRailCurtain(s: VenueStructure, rail: Rail): Omit<StructureFeature, "id"> | null {
  const curtain: FeatureCurtain = { rail };
  const box = curtainBoxOf(s, { curtain });
  if (!box) return null;
  return { ...newFeature("curtain", { x: box.x, y: box.y }), ...box, curtain, style: { fill: CURTAIN_FILL } };
}

/** What changing a curtain's stretch writes: the rail, and the box re-laid from it. `from`/`to` are
 *  fractions along its wall or its side; `side` flips a wall curtain to the wall's other side and a
 *  side curtain into or out of its thing. A rod has no stretch to type — its points are its own. */
export function curtainPatch(s: VenueStructure, f: StructureFeature, patch: Partial<WallCurtain>): Partial<Omit<StructureFeature, "id">> {
  const rail = curtainRail(f);
  if (!rail) return {};
  const order = (from: number, to: number) => ({
    from: Math.max(0, Math.min(1, Math.min(from, to))),
    to: Math.max(0, Math.min(1, Math.max(from, to))),
  });
  if (rail.type === "wall") {
    const cur = curtainOf(f)!;
    const next: WallCurtain = { ...cur, ...patch, ...order(patch.from ?? cur.from, patch.to ?? cur.to) };
    const box = curtainBox(s, next);
    return { curtain: withCurtainRail(f, { type: "wall", wallId: next.wallId, from: next.from, to: next.to, side: next.side }), ...(box ?? {}) };
  }
  if (rail.type === "side") {
    const next: SideRail = { ...rail, ...order(patch.from ?? rail.from, patch.to ?? rail.to), ...(patch.side ? { out: patch.side } : {}) };
    return curtainRailPatch(s, f, next);
  }
  return {};
}

/** What putting a curtain on another rail writes (a rod's points moved, a side rail retyped): the
 *  rail, and the box re-laid from it. */
export function curtainRailPatch(s: VenueStructure, f: Pick<StructureFeature, "curtain">, rail: Rail): Partial<Omit<StructureFeature, "id">> {
  const curtain = withCurtainRail(f, rail);
  const box = curtainBoxOf(s, { curtain });
  return { curtain, ...(box ?? {}) };
}

/** The curtain's look and drop changed — nothing about where it hangs. `null` clears one. */
export function curtainLookPatch(f: Pick<StructureFeature, "curtain">, patch: { style?: CurtainStyle | null; dropMm?: number | null }): Partial<Omit<StructureFeature, "id">> {
  const next: FeatureCurtain = { ...(f.curtain ?? {}) };
  if (patch.style !== undefined) {
    if (patch.style) next.style = patch.style;
    else delete next.style;
  }
  if (patch.dropMm !== undefined) {
    if (patch.dropMm && patch.dropMm > 0) next.dropMm = Math.round(patch.dropMm);
    else delete next.dropMm;
  }
  return { curtain: next };
}

/** One hung piece of a curtain. Its geometry is in the feature's OWN frame (translate to x, y and
 *  turn by rotationDeg), so every surface draws it inside the feature's group as it draws the rest. */
export interface CurtainPiece {
  /** The piece's stretch of the wall, as fractions. */
  t0: number;
  t1: number;
  /** Along the wall — the arc on a bowed one. */
  lengthMm: number;
  /** The cloth: a closed outline, a curved strip on a bowed wall. */
  band: Point[];
  /** The band's middle line, node a → node b — what the pleats are drawn along. */
  line: Point[];
}

/** The pieces a curtain hangs in: its stretch of the wall less every door on it MARKED to be kept
 *  clear (StructureEntrance.curtainClear — the main entrance; its opening plus DOOR_CLEAR_MM either
 *  side stays bare), pieces under MIN_CURTAIN_MM dropped. A window, and a door not so marked, is
 *  curtained over. One whole piece on a wall with none. Derived on every read, so a door slid along
 *  its wall at /halls parts the curtain where it now is. A door's place is read as doorGeometry reads
 *  it (distance ÷ chord as the wall's own fraction), so on a bowed wall the gap is where the door is. */
export function curtainPieces(s: VenueStructure, f: StructureFeature): CurtainPiece[] {
  const c = curtainOf(f);
  const tr = c ? wallTrack(s, c.wallId) : null;
  // On a side or a rod: one piece per line, nothing to part — a door is a wall's.
  const other = !c && curtainRail(f) ? curtainLines(s, f) : [];
  if (other.length) {
    const local = (p: Point) => toLocalFrame(p, { x: f.x, y: f.y }, f.rotationDeg);
    return other.map((line) => ({
      t0: 0,
      t1: 1,
      lengthMm: Math.round(line.lengthMm),
      band: railBand(line, CURTAIN_DEPTH_MM).map(local),
      line: railClothLine(line, CURTAIN_DEPTH_MM).map(local),
    }));
  }
  if (!c || !tr || tr.chordMm < 1) {
    const w = f.widthMm / 2;
    const d = f.depthMm / 2;
    return [{ t0: 0, t1: 1, lengthMm: f.widthMm, band: [{ x: -w, y: -d }, { x: w, y: -d }, { x: w, y: d }, { x: -w, y: d }], line: [{ x: -w, y: 0 }, { x: w, y: 0 }] }];
  }
  const L = tr.chordMm;
  const local = (p: Point) => toLocalFrame(p, { x: f.x, y: f.y }, f.rotationDeg);
  const bare = doorsOf(s)
    .filter((e) => e.wallId === c.wallId && e.curtainClear)
    .map((e) => [(e.distanceMm - e.widthMm / 2 - DOOR_CLEAR_MM) / L, (e.distanceMm + e.widthMm / 2 + DOOR_CLEAR_MM) / L] as const)
    .sort((p, q) => p[0] - q[0]);
  const out: CurtainPiece[] = [];
  let cursor = c.from;
  const push = (t0: number, t1: number) => {
    const lengthMm = tr.mmAt(t1) - tr.mmAt(t0);
    if (lengthMm < MIN_CURTAIN_MM) return;
    out.push({
      t0,
      t1,
      lengthMm: Math.round(lengthMm),
      band: spanBand(tr, t0, t1, 0, CURTAIN_DEPTH_MM * c.side).map(local),
      line: tr.path(t0, t1, (CURTAIN_DEPTH_MM / 2) * c.side).map(local),
    });
  };
  for (const [b0, b1] of bare) {
    if (b1 <= cursor) continue;
    if (b0 >= c.to) break;
    push(cursor, Math.min(b0, c.to));
    cursor = Math.max(cursor, b1);
  }
  push(cursor, c.to);
  return out;
}

/** How long a curtain is along its wall — the arc on a bowed one; its box's width when the wall is
 *  gone. */
export function curtainLengthMm(s: VenueStructure, f: StructureFeature): number {
  const c = curtainOf(f);
  const tr = c ? wallTrack(s, c.wallId) : null;
  if (!c && curtainRail(f)) {
    const lines = curtainLines(s, f);
    return lines.length ? lines.reduce((n, l) => n + l.lengthMm, 0) : f.widthMm;
  }
  return c && tr ? tr.mmAt(c.to) - tr.mmAt(c.from) : f.widthMm;
}

/** A curtain's two ends on the plan — the middle of the band at each end of its stretch — and the
 *  way out along the wall from each, for the grips that slide them. Null when the wall is gone. */
export type CurtainEnds = Record<"from" | "to", { p: Point; out: Point }>;

export function curtainEnds(s: VenueStructure, f: StructureFeature): CurtainEnds | null {
  const c = curtainOf(f);
  const tr = c ? wallTrack(s, c.wallId) : null;
  if (!c && curtainRail(f)) return lineEnds(curtainLines(s, f)[0]);
  if (!c || !tr) return null;
  const end = (t: number, sign: 1 | -1) => {
    const { p, n } = tr.at(t);
    const off = (CURTAIN_DEPTH_MM / 2) * c.side;
    // The tangent is the normal turned back a quarter: n = (−ty, tx) ⇒ t = (ny, −nx).
    return { p: { x: p.x + n.x * off, y: p.y + n.y * off }, out: { x: n.y * sign, y: -n.x * sign } };
  };
  return { from: end(c.from, -1), to: end(c.to, 1) };
}

/** Where along its wall a dragged END of a curtain lands, as a fraction — the grip at either end
 *  of the band slid along the wall (round the bow on a curved one), as a drape's ends are in the
 *  sketch. Null when the wall is gone. */
export function curtainEndT(s: VenueStructure, f: StructureFeature, p: Point): number | null {
  const c = curtainOf(f);
  const tr: WallTrack | null = c ? wallTrack(s, c.wallId) : null;
  return c && tr ? tr.nearestT(p) : null;
}

/** The ends of a line that is not a wall: the middle of its band at each end, pointing on along it. */
function lineEnds(line: RailLine | undefined): CurtainEnds | null {
  if (!line || line.path.length < 2) return null;
  const mid = railClothLine(line, CURTAIN_DEPTH_MM);
  const n = mid.length;
  const dir = (a: Point, b: Point) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  return { from: { p: mid[0], out: dir(mid[1], mid[0]) }, to: { p: mid[n - 1], out: dir(mid[n - 2], mid[n - 1]) } };
}

/** What dragging one END of a curtain to `p` writes — on a wall or a side, that end slides along it
 *  (round a bow, round a rim); on a rod, the end post moves to the point (a cantilevered arm held to
 *  its reach). Empty when there is nothing to slide along. */
export function curtainEndPatch(s: VenueStructure, f: StructureFeature, end: "from" | "to", p: Point): Partial<Omit<StructureFeature, "id">> {
  const rail = curtainRail(f);
  if (!rail) return {};
  if (rail.type === "wall") {
    const t = curtainEndT(s, f, p);
    return t === null ? {} : curtainPatch(s, f, { [end]: t });
  }
  if (rail.type === "side") {
    const t = sideFraction(s, rail, p);
    return t === null ? {} : curtainPatch(s, f, { [end]: t });
  }
  if (rail.type === "rod") return curtainRailPatch(s, f, rodEndMoved(rail, end, p));
  return {};
}

/** Where along a side rail's side a point falls, as a fraction of the side's length. */
export function sideFraction(s: VenueStructure, rail: SideRail, p: Point): number | null {
  const host = featureHosts(s)(rail.featureId);
  const side = host ? hostSide(host, rail.side) : null;
  if (!side || side.L <= 0) return null;
  let best = { d: Infinity, at: 0 };
  for (let k = 0; k < side.points.length - 1; k++) {
    const a = side.points[k];
    const b = side.points[k + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u));
    if (d < best.d) best = { d, at: side.cum[k] + u * Math.sqrt(l2) };
  }
  return best.at / side.L;
}

/** A rod with one END moved to `p`: the post goes there; a cantilevered end's arm is held to its
 *  reach from the post before it. */
export function rodEndMoved(rail: RodRail, end: "from" | "to", p: Point): RodRail {
  const pts = rail.points.slice();
  const i = end === "from" ? 0 : pts.length - 1;
  let q = { x: Math.round(p.x), y: Math.round(p.y) };
  const cantilevered = (end === "from" && rail.cantilever === "start") || (end === "to" && rail.cantilever === "end");
  if (cantilevered && pts.length >= 2) {
    const base = pts[end === "from" ? 1 : pts.length - 2];
    const l = Math.hypot(q.x - base.x, q.y - base.y);
    if (l > CANTILEVER_MAX_MM) q = { x: Math.round(base.x + ((q.x - base.x) * CANTILEVER_MAX_MM) / l), y: Math.round(base.y + ((q.y - base.y) * CANTILEVER_MAX_MM) / l) };
  }
  pts[i] = q;
  return { ...rail, points: pts };
}

/** Every curtain re-laid on its wall as it stands now — run after any edit of the walls or corners,
 *  as face surfaces are (lib/venues/face-surfaces.ts syncFaceSurfaces). Returns `s` itself when
 *  nothing moved, so an edit that touched no curtain's wall costs nothing downstream. Bending a wall
 *  re-lays its curtain round the new bow; straightening it gives the rectangle back. */
export function syncCurtains(s: VenueStructure): VenueStructure {
  if (!s.features.some((f) => f.kind === "curtain")) return s;
  let changed = false;
  const features = s.features.map((f) => {
    if (f.kind !== "curtain") return f;
    // On a wall as before; on a side, re-laid where its feature now stands (spec §6.6).
    const box = curtainBoxOf(s, f);
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

// ponytail: self-check. Run: npm run check:curtain
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  // A 10 m wall along x from n0 to n1 (its left-hand normal points +y), and a bowed one.
  const s: VenueStructure = {
    nodes: [
      { id: "n0", x: 0, y: 0 },
      { id: "n1", x: 10000, y: 0 },
      { id: "n2", x: 10000, y: 6000 },
    ],
    walls: [
      { id: "w", a: "n0", b: "n1", kind: "wall" },
      { id: "bow", a: "n1", b: "n2", kind: "wall", curve: { c1: { x: 800, y: 1000 }, c2: { x: 800, y: -1000 } } },
    ],
    entrances: [],
    features: [],
  };
  const made = newCurtain(s, "w", { x: 5000, y: 300 });
  assert(!!made && made.kind === "curtain" && curtainOf(made!)?.side === 1 && made.style?.fill === CURTAIN_FILL, "a click on the +y side hangs a black curtain on that side");
  assert(made!.widthMm === 10000 && made!.depthMm === CURTAIN_DEPTH_MM && made!.x === 5000 && made!.y === CURTAIN_DEPTH_MM / 2 && made!.rotationDeg === 0 && made!.shape === "rect", "…the whole wall long, a band deep, its centre half a band into the room");
  const other = newCurtain(s, "w", { x: 5000, y: -300 })!;
  assert(curtainOf(other)?.side === -1 && other.y === -CURTAIN_DEPTH_MM / 2, "a click on the other side hangs it there");
  assert(!made!.heightMm, "no height of its own: it hangs from the ceiling");

  const withOne: VenueStructure = { ...s, features: [{ ...made!, id: "c" }] };
  const half = curtainPatch(withOne, withOne.features[0], { from: 0.25, to: 0.75 });
  assert(half.widthMm === 5000 && half.x === 5000 && curtainOf({ curtain: half.curtain })?.from === 0.25, "a shorter stretch re-lays the box along it");
  const flipped = curtainPatch(withOne, withOne.features[0], { from: 0.9, to: 0.1 });
  assert(curtainOf({ curtain: flipped.curtain })?.from === 0.1 && curtainOf({ curtain: flipped.curtain })?.to === 0.9, "ends given backwards are put in order");

  // The wall is dragged: the curtain follows it, the same structure back when nothing moved.
  assert(syncCurtains(withOne) === withOne, "nothing moved — the same structure back");
  const moved = syncCurtains({ ...withOne, nodes: withOne.nodes.map((n) => (n.id === "n1" ? { ...n, x: 12000 } : n)) });
  assert(moved.features[0].widthMm === 12000 && moved.features[0].x === 6000, "a wall lengthened carries its curtain across the whole wall");
  const turned = syncCurtains({ ...withOne, nodes: withOne.nodes.map((n) => (n.id === "n1" ? { ...n, x: 0, y: 10000 } : n)) });
  assert(turned.features[0].rotationDeg === 90 && turned.features[0].x === -CURTAIN_DEPTH_MM / 2 && turned.features[0].y === 5000, "a wall turned turns its curtain with it, still on its side");
  const noWall: VenueStructure = { ...withOne, walls: [] };
  assert(syncCurtains(noWall) === noWall && noWall.features[0].widthMm === 10000, "a curtain whose wall is gone keeps the box it had");
  assert(curtainOf({ curtain: { wallId: "w", from: 0.8, to: 0.2, side: -1 } })?.from === 0.2 && curtainOf({}) === null, "curtainOf orders the ends and refuses a row with no span");

  // A door on the wall parts the curtain: a 2 m door at 4 m leaves a piece either side, each
  // stopping DOOR_CLEAR_MM short of the jamb; a wall with no door hangs one whole piece.
  const whole = curtainPieces(withOne, withOne.features[0]);
  assert(whole.length === 1 && whole[0].lengthMm === 10000 && whole[0].line[0].x === -5000 && Math.abs(whole[0].line[0].y) < 1e-6, "no door — one piece, the whole stretch, along the box's middle");
  const covered: VenueStructure = { ...withOne, entrances: [{ id: "d", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: true, doubleDoor: true }] };
  assert(curtainPieces(covered, covered.features[0]).length === 1, "a door not marked clear is curtained over — a service door, a fire exit");
  const doored: VenueStructure = { ...withOne, entrances: [{ id: "d", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: true, doubleDoor: true, curtainClear: true }] };
  const parted = curtainPieces(doored, doored.features[0]);
  assert(parted.length === 2 && parted[0].lengthMm === 3000 - DOOR_CLEAR_MM && parted[1].lengthMm === 5000 - DOOR_CLEAR_MM, `a door parts the curtain into the stretches either side of it, each clear of the jamb (${parted.map((p) => p.lengthMm).join(",")})`);
  assert(Math.abs(parted[0].band[0].x + 5000) < 1e-6 && parted[1].t0 > 0.5 && parted[1].t1 === 1, "…each placed along the wall in the box's frame");
  const windowed: VenueStructure = { ...withOne, entrances: [{ id: "v", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: false, doubleDoor: false, kind: "window" }] };
  assert(curtainPieces(windowed, windowed.features[0]).length === 1, "a window is curtained over — only a door parts it");
  const edgeDoor: VenueStructure = { ...withOne, entrances: [{ id: "e", wallId: "w", distanceMm: 500, widthMm: 1000, swingInward: true, doubleDoor: false, curtainClear: true }] };
  const fromDoor = curtainPieces(edgeDoor, edgeDoor.features[0]);
  assert(fromDoor.length === 1 && fromDoor[0].t0 > 0.1 && fromDoor[0].t1 === 1, "a door at the wall's corner leaves one piece, starting past it");
  assert(curtainEndT(withOne, withOne.features[0], { x: 2500, y: 900 }) === 0.25 && curtainEndT({ ...withOne, walls: [] }, withOne.features[0], { x: 0, y: 0 }) === null, "an end dragged to a point lands at that fraction of the wall; no wall, no fraction");
  const ends = curtainEnds(withOne, withOne.features[0])!;
  assert(ends.from.p.x === 0 && ends.from.out.x === -1 && ends.to.p.x === 10000 && ends.to.out.x === 1, "the ends are at the wall's corners, each grip pointing on along the wall");

  // A bowed wall takes a curtain: it follows the bow, longer than the chord, its outline a strip.
  // The bow bulges toward +x (both handles pull that way); the click inside it is the −x side.
  const bowTrack = wallTrack(s, "bow")!;
  const inside = newCurtain(s, "bow", { x: 9500, y: 3000 })!;
  const outside = newCurtain(s, "bow", { x: 10900, y: 3000 })!;
  assert(!!inside && inside.shape === "custom" && (inside.outline?.length ?? 0) > 8, "a bowed wall takes a curtain, its footprint a curved strip");
  assert(curtainOf(inside)!.side !== curtainOf(outside)!.side, "…on the side the click fell, read against the bow, not its chord");
  const onBow = { ...inside, id: "cb" } as StructureFeature;
  const bowed: VenueStructure = { ...s, features: [onBow] };
  assert(Math.abs(curtainLengthMm(bowed, onBow) - bowTrack.lengthMm) < 1 && bowTrack.lengthMm > 6000, "its length is the arc's, not the 6 m chord's");
  const bowPieces = curtainPieces(bowed, onBow);
  assert(bowPieces.length === 1 && bowPieces[0].line.length > 8, "its pleats run along the bow");
  // The band's middle line, carried back out to the plan, stays a half band off the wall itself.
  const mid = fromLocalFrame(bowPieces[0].line[Math.floor(bowPieces[0].line.length / 2)], { x: onBow.x, y: onBow.y }, onBow.rotationDeg);
  const foot = bowTrack.at(bowTrack.nearestT(mid)).p;
  assert(Math.abs(Math.hypot(mid.x - foot.x, mid.y - foot.y) - CURTAIN_DEPTH_MM / 2) < 15, "…a half band off the bow all the way round, not off its chord");
  const apexT = bowTrack.nearestT({ x: 11000, y: 3000 });
  assert(Math.abs(curtainEndT(bowed, onBow, { x: 11000, y: 3000 })! - apexT) < 1e-9 && apexT > 0.4 && apexT < 0.6, "an end dragged to the bow's crown lands on the crown");
  const bowDoor: VenueStructure = { ...bowed, entrances: [{ id: "bd", wallId: "bow", distanceMm: 3000, widthMm: 1200, swingInward: true, doubleDoor: false, curtainClear: true }] };
  assert(curtainPieces(bowDoor, onBow).length === 2, "a door on the bow parts it as on a straight wall");
  // Straightening the wall gives the rectangle back.
  const straightened = syncCurtains({ ...bowed, walls: bowed.walls.map((w) => (w.id === "bow" ? { ...w, curve: null } : w)) });
  assert(straightened.features[0].shape === "rect" && !straightened.features[0].outline && straightened.features[0].widthMm === 6000, "a wall straightened gives the plain band back");
  assert(syncCurtains(bowed) === bowed, "a curtain already on its bow is left as it is");

  // RAILS (2026-11-07). A curtain stored the old way reads as a wall rail; a new one is written as a
  // rail and never in the legacy fields; both read the same.
  const legacy = { curtain: { wallId: "w", from: 0.2, to: 0.6, side: -1 as const } };
  const rail = curtainRail(legacy);
  assert(rail?.type === "wall" && rail.from === 0.2 && rail.side === -1 && curtainRail(legacy) === rail, "a legacy curtain is a wall rail — the same object each read");
  assert(!!made!.curtain?.rail && made!.curtain.wallId === undefined && half.curtain?.wallId === undefined, "nothing new writes the legacy wall fields");
  const legacyFeature = { ...made!, id: "lc", curtain: { wallId: "w", from: 0, to: 1, side: 1 as const } };
  const railFeature = { ...made!, id: "rc" };
  assert(
    JSON.stringify(curtainPieces(s, legacyFeature)) === JSON.stringify(curtainPieces(s, railFeature)) && curtainLengthMm(s, legacyFeature) === curtainLengthMm(s, railFeature),
    "a legacy curtain and its rail twin draw and measure exactly alike",
  );

  // On the SIDE of a building (§6.1): 4 × 3 m, 3.5 m high, its top side hung outside.
  const building: StructureFeature = { id: "bld", kind: "structure", label: "מבנה", x: 3000, y: 3000, widthMm: 4000, depthMm: 3000, heightMm: 3500, shape: "rect", rotationDeg: 0 };
  const site: VenueStructure = { ...s, features: [building] };
  const onSide = newRailCurtain(site, { type: "side", featureId: "bld", side: 0, from: 0, to: 1, out: 1 })!;
  assert(!!onSide && onSide.widthMm === 4000 && onSide.depthMm === CURTAIN_DEPTH_MM && onSide.x === 3000 && onSide.y === 1500 - CURTAIN_DEPTH_MM / 2, "a side curtain hangs the whole side, outside the building");
  assert(curtainOf(onSide) === null && curtainLengthMm(site, { ...onSide, id: "sc" }) === 4000, "…it is no wall curtain, and is as long as the side");
  const hung: VenueStructure = { ...site, features: [building, { ...onSide, id: "sc" }] };
  assert(curtainPieces(hung, hung.features[1]).length === 1, "…in one piece — no door parts a side");
  const shorter = curtainPatch(hung, hung.features[1], { from: 0.25, to: 0.75 });
  assert(shorter.widthMm === 2000 && shorter.x === 3000, "the bar's stretch shortens it along the side");
  const turnedIn = curtainPatch(hung, hung.features[1], { side: -1 });
  assert(turnedIn.y === 1500 + CURTAIN_DEPTH_MM / 2, "…and its side flips it inside");
  const buildingMoved = syncCurtains({ ...hung, features: [{ ...building, x: 5000 }, hung.features[1]] });
  assert(buildingMoved.features[1].x === 5000, "a side curtain is re-laid when its feature moves");
  const sideEnd = curtainEndPatch(hung, hung.features[1], "to", { x: 4000, y: 1200 });
  assert(sideEnd.widthMm === 3000, "its end slides along the side");

  // On a free-standing ROD (§6.2): a ר — 3 m, then a 2 m arm with no post under it.
  const rod: RodRail = { type: "rod", points: [{ x: 0, y: 5000 }, { x: 3000, y: 5000 }, { x: 3000, y: 7000 }], heightMm: 2400, cantilever: "end" };
  const onRod = newRailCurtain(s, rod)!;
  assert(!!onRod && onRod.shape === "custom" && curtainLengthMm(s, { ...onRod, id: "r" }) === 5000, "a rod curtain runs the rod's whole polyline");
  const reached = curtainEndPatch(s, { ...onRod, id: "r" }, "to", { x: 3000, y: 12000 });
  const reachedRail = curtainRail({ curtain: reached.curtain }) as RodRail;
  assert(reachedRail.points[2].y === 8000, "a cantilevered arm dragged out is held to its 3 m reach");

  // The look and the drop.
  const looked = curtainLookPatch(made!, { style: "sheer", dropMm: 2200 });
  assert(looked.curtain?.style === "sheer" && looked.curtain.dropMm === 2200 && looked.curtain.rail === made!.curtain?.rail, "a style and a drop are the curtain's own, its rail untouched");
  assert(curtainLookPatch({ curtain: looked.curtain }, { style: null, dropMm: null }).curtain?.style === undefined, "…and cleared again");
  assert(curtainPatch(s, { ...made!, id: "x", curtain: looked.curtain }, { from: 0.5 }).curtain?.style === "sheer", "re-laying the stretch keeps the look");
  console.log("venue curtains ok");
}
