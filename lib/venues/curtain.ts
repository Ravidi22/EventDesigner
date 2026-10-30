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
// drape in a sketch already follows. Straight walls only: a bowed wall's curtain would be a chord
// through the bow, and the pleats are drawn along a line.
import type { Point } from "@/lib/studio/hall";
import type { WallSpan } from "@/lib/design-document/types";
import { pointToT, resolveSpan, wallSegment } from "@/lib/studio/anchor";
import { wallAngleDeg } from "@/lib/studio/geometry";
import { doorsOf, newFeature, wallPoints, type StructureFeature, type VenueStructure } from "./structure";
import { isMain } from "../self-check";

/** Which side of its wall a curtain hangs on: +1 for the side the wall's left-hand normal points
 *  to (n = (−dy, dx) of a→b), −1 for the other — the same handedness the 3D curtain reads. */
export interface FeatureCurtain extends WallSpan {
  side: 1 | -1;
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

/** A curtain feature's span, with the fallbacks a half-saved row could need. */
export function curtainOf(f: Pick<StructureFeature, "curtain">): FeatureCurtain | null {
  const c = f.curtain;
  if (!c || !c.wallId) return null;
  const lo = Math.max(0, Math.min(1, Math.min(c.from ?? 0, c.to ?? 1)));
  const hi = Math.max(0, Math.min(1, Math.max(c.from ?? 0, c.to ?? 1)));
  return { wallId: c.wallId, from: lo, to: hi, side: c.side === -1 ? -1 : 1 };
}

/** The wall's left-hand normal and the span's ends, or null when the wall is gone. */
function spanFrame(s: VenueStructure, c: FeatureCurtain): { from: Point; to: Point; n: Point; lengthMm: number; angleDeg: number } | null {
  const span = resolveSpan(s, c);
  if (!span) return null;
  const dx = span.wall.b.x - span.wall.a.x;
  const dy = span.wall.b.y - span.wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { from: span.from, to: span.to, n: { x: -dy / len, y: dx / len }, lengthMm: span.lengthMm, angleDeg: wallAngleDeg(span.wall.a, span.wall.b) };
}

/** The box a curtain's span resolves to: as long as the stretch, CURTAIN_DEPTH_MM deep, turned
 *  with its wall, its centre half a band off the wall's line on its side. Null when the wall is
 *  gone (the feature keeps the box it had — the property is the authority, as with a drape). */
export function curtainBox(s: VenueStructure, c: FeatureCurtain): Pick<StructureFeature, "x" | "y" | "widthMm" | "depthMm" | "rotationDeg" | "shape"> | null {
  const fr = spanFrame(s, c);
  if (!fr) return null;
  const mid = { x: (fr.from.x + fr.to.x) / 2, y: (fr.from.y + fr.to.y) / 2 };
  const off = (CURTAIN_DEPTH_MM / 2) * c.side;
  return {
    x: Math.round(mid.x + fr.n.x * off),
    y: Math.round(mid.y + fr.n.y * off),
    widthMm: Math.max(MIN_CURTAIN_MM, Math.round(fr.lengthMm)),
    depthMm: CURTAIN_DEPTH_MM,
    rotationDeg: ((Math.round(fr.angleDeg) % 360) + 360) % 360,
    shape: "rect",
  };
}

/** Which side of the wall a point is on, in the handedness `FeatureCurtain.side` uses. */
export function sideOfWall(s: VenueStructure, wallId: string, p: Point): 1 | -1 {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  if (!pts) return 1;
  const dx = pts.b.x - pts.a.x;
  const dy = pts.b.y - pts.a.y;
  return -dy * (p.x - pts.a.x) + dx * (p.y - pts.a.y) >= 0 ? 1 : -1;
}

/** A new curtain along `wallId` — the whole wall unless a stretch is given — on the side of the
 *  wall `at` lies (the click that placed it), in the default black. Null for a wall that is gone or
 *  bowed. */
export function newCurtain(s: VenueStructure, wallId: string, at: Point, from = 0, to = 1): Omit<StructureFeature, "id"> | null {
  const wall = s.walls.find((w) => w.id === wallId);
  if (!wall || wall.curve) return null;
  const spec: FeatureCurtain = { wallId, from: Math.min(from, to), to: Math.max(from, to), side: sideOfWall(s, wallId, at) };
  const box = curtainBox(s, spec);
  if (!box) return null;
  return { ...newFeature("curtain", { x: box.x, y: box.y }), ...box, curtain: spec, style: { fill: CURTAIN_FILL } };
}

/** What changing a curtain's span writes: the span, and the box re-laid from it. */
export function curtainPatch(s: VenueStructure, f: StructureFeature, patch: Partial<FeatureCurtain>): Partial<Omit<StructureFeature, "id">> {
  const cur = curtainOf(f);
  if (!cur) return {};
  const next: FeatureCurtain = { ...cur, ...patch };
  if (next.from > next.to) [next.from, next.to] = [next.to, next.from];
  next.from = Math.max(0, Math.min(1, next.from));
  next.to = Math.max(0, Math.min(1, next.to));
  const box = curtainBox(s, next);
  return { curtain: next, ...(box ?? {}) };
}

/** One hung piece of a curtain, in the feature's OWN frame: `dx` along the wall from the span's
 *  middle (the feature's centre; +x is node a → node b), `widthMm` long. */
export interface CurtainPiece {
  dx: number;
  widthMm: number;
  /** The piece's stretch of the wall, as fractions. */
  t0: number;
  t1: number;
}

/** The pieces a curtain hangs in: its stretch of the wall less every door on it MARKED to be kept
 *  clear (StructureEntrance.curtainClear — the main entrance; its opening plus DOOR_CLEAR_MM either
 *  side stays bare), pieces under MIN_CURTAIN_MM dropped. A window, and a door not so marked, is
 *  curtained over. One whole piece on a wall with none. Derived on every read, so a door slid along
 *  its wall at /halls parts the curtain where it now is. */
export function curtainPieces(s: VenueStructure, f: StructureFeature): CurtainPiece[] {
  const c = curtainOf(f);
  const wall = c ? wallSegment(s, c.wallId) : null;
  if (!c || !wall || wall.lengthMm < 1) return [{ dx: 0, widthMm: f.widthMm, t0: 0, t1: 1 }];
  const L = wall.lengthMm;
  const mid = ((c.from + c.to) / 2) * L;
  const bare = doorsOf(s)
    .filter((e) => e.wallId === c.wallId && e.curtainClear)
    .map((e) => [e.distanceMm - e.widthMm / 2 - DOOR_CLEAR_MM, e.distanceMm + e.widthMm / 2 + DOOR_CLEAR_MM] as const)
    .sort((p, q) => p[0] - q[0]);
  const out: CurtainPiece[] = [];
  let cursor = c.from * L;
  const end = c.to * L;
  const push = (s0: number, s1: number) => {
    if (s1 - s0 < MIN_CURTAIN_MM) return;
    out.push({ dx: Math.round((s0 + s1) / 2 - mid), widthMm: Math.round(s1 - s0), t0: s0 / L, t1: s1 / L });
  };
  for (const [b0, b1] of bare) {
    if (b1 <= cursor) continue;
    if (b0 >= end) break;
    push(cursor, Math.min(b0, end));
    cursor = Math.max(cursor, b1);
  }
  push(cursor, end);
  return out;
}

/** Where along its wall a dragged END of a curtain lands, as a fraction — the grip at either end
 *  of the band slid along the wall, as a drape's ends are in the sketch. Null when the wall is gone. */
export function curtainEndT(s: VenueStructure, f: StructureFeature, p: Point): number | null {
  const c = curtainOf(f);
  const wall = c ? wallSegment(s, c.wallId) : null;
  return c && wall ? pointToT(wall, p) : null;
}

/** Every curtain re-laid on its wall as it stands now — run after any edit of the walls or corners,
 *  as face surfaces are (lib/venues/face-surfaces.ts syncFaceSurfaces). Returns `s` itself when
 *  nothing moved, so an edit that touched no curtain's wall costs nothing downstream. */
export function syncCurtains(s: VenueStructure): VenueStructure {
  if (!s.features.some((f) => f.kind === "curtain")) return s;
  let changed = false;
  const features = s.features.map((f) => {
    if (f.kind !== "curtain") return f;
    const c = curtainOf(f);
    const box = c && curtainBox(s, c);
    if (!box) return f;
    if (f.x === box.x && f.y === box.y && f.widthMm === box.widthMm && f.depthMm === box.depthMm && f.rotationDeg === box.rotationDeg && f.shape === "rect") return f;
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
  assert(!!made && made.kind === "curtain" && made.curtain?.side === 1 && made.style?.fill === CURTAIN_FILL, "a click on the +y side hangs a black curtain on that side");
  assert(made!.widthMm === 10000 && made!.depthMm === CURTAIN_DEPTH_MM && made!.x === 5000 && made!.y === CURTAIN_DEPTH_MM / 2 && made!.rotationDeg === 0, "…the whole wall long, a band deep, its centre half a band into the room");
  const other = newCurtain(s, "w", { x: 5000, y: -300 })!;
  assert(other.curtain?.side === -1 && other.y === -CURTAIN_DEPTH_MM / 2, "a click on the other side hangs it there");
  assert(newCurtain(s, "bow", { x: 10000, y: 3000 }) === null, "a bowed wall takes no curtain");
  assert(!made!.heightMm, "no height of its own: it hangs from the ceiling");

  const withOne: VenueStructure = { ...s, features: [{ ...made!, id: "c" }] };
  const half = curtainPatch(withOne, withOne.features[0], { from: 0.25, to: 0.75 });
  assert(half.widthMm === 5000 && half.x === 5000 && half.curtain?.from === 0.25, "a shorter stretch re-lays the box along it");
  const flipped = curtainPatch(withOne, withOne.features[0], { from: 0.9, to: 0.1 });
  assert(flipped.curtain?.from === 0.1 && flipped.curtain?.to === 0.9, "ends given backwards are put in order");

  // The wall is dragged: the curtain follows it, the same structure back when nothing moved.
  assert(syncCurtains(withOne) === withOne, "nothing moved — the same structure back");
  const moved = syncCurtains({ ...withOne, nodes: withOne.nodes.map((n) => (n.id === "n1" ? { ...n, x: 12000 } : n)) });
  assert(moved.features[0].widthMm === 12000 && moved.features[0].x === 6000, "a wall lengthened carries its curtain across the whole wall");
  const turned = syncCurtains({ ...withOne, nodes: withOne.nodes.map((n) => (n.id === "n1" ? { ...n, x: 0, y: 10000 } : n)) });
  assert(turned.features[0].rotationDeg === 90 && turned.features[0].x === -CURTAIN_DEPTH_MM / 2 && turned.features[0].y === 5000, "a wall turned turns its curtain with it, still on its side");
  const noWall: VenueStructure = { ...withOne, walls: [] };
  assert(syncCurtains(noWall) === noWall && noWall.features[0].widthMm === 10000, "a curtain whose wall is gone keeps the box it had");
  assert(curtainOf({ curtain: { wallId: "w", from: 0.8, to: 0.2, side: -1 } })?.from === 0.2 && curtainOf({})=== null, "curtainOf orders the ends and refuses a row with no span");

  // A door on the wall parts the curtain: a 2 m door at 4 m leaves a piece either side, each
  // stopping DOOR_CLEAR_MM short of the jamb; a wall with no door hangs one whole piece.
  const whole = curtainPieces(withOne, withOne.features[0]);
  assert(whole.length === 1 && whole[0].dx === 0 && whole[0].widthMm === 10000, "no door — one piece, the whole stretch");
  const covered: VenueStructure = { ...withOne, entrances: [{ id: "d", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: true, doubleDoor: true }] };
  assert(curtainPieces(covered, covered.features[0]).length === 1, "a door not marked clear is curtained over — a service door, a fire exit");
  const doored: VenueStructure = { ...withOne, entrances: [{ id: "d", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: true, doubleDoor: true, curtainClear: true }] };
  const parted = curtainPieces(doored, doored.features[0]);
  assert(parted.length === 2 && parted[0].widthMm === 3000 - DOOR_CLEAR_MM && parted[1].widthMm === 5000 - DOOR_CLEAR_MM, `a door parts the curtain into the stretches either side of it, each clear of the jamb (${parted.map((p) => p.widthMm).join(",")})`);
  assert(parted[0].dx === Math.round((3000 - DOOR_CLEAR_MM) / 2 - 5000) && parted[1].t0 > 0.5 && parted[1].t1 === 1, "…each placed along the wall from the span's middle");
  const windowed: VenueStructure = { ...withOne, entrances: [{ id: "v", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: false, doubleDoor: false, kind: "window" }] };
  assert(curtainPieces(windowed, windowed.features[0]).length === 1, "a window is curtained over — only a door parts it");
  const edgeDoor: VenueStructure = { ...withOne, entrances: [{ id: "e", wallId: "w", distanceMm: 500, widthMm: 1000, swingInward: true, doubleDoor: false, curtainClear: true }] };
  const fromDoor = curtainPieces(edgeDoor, edgeDoor.features[0]);
  assert(fromDoor.length === 1 && fromDoor[0].t0 > 0.1 && fromDoor[0].t1 === 1, "a door at the wall's corner leaves one piece, starting past it");
  assert(curtainEndT(withOne, withOne.features[0], { x: 2500, y: 900 }) === 0.25 && curtainEndT({ ...withOne, walls: [] }, withOne.features[0], { x: 0, y: 0 }) === null, "an end dragged to a point lands at that fraction of the wall; no wall, no fraction");
  console.log("venue curtains ok");
}
