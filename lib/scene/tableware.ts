// A place setting at every seat of a table: charger, plate, a folded napkin, a water glass and a
// wine glass, a knife and a fork. Seen on plan A in a browser (2026-10-23): a dressed table with
// no settings reads as a table nobody is coming to; the eye looks for the plates before it looks
// at the flowers.
//
// ⚠ ILLUSTRATION, NOT INVENTORY. Nothing here is in the design document or the catalog: these are
// not counted, quoted, packed or ordered — a venue supplies its own dishes, and a designer who
// rents chargers places them as catalog items like any other. That is why the setting is generic
// (white plate, champagne charger, silver), why it is one switch on the event's camera work
// (SceneSettings.tableware — on unless switched off), and why it lives here and not in items.ts.
//
// WHERE a setting goes is measured, not assumed (Ravid, 2026-10-24: "make sure plates on table
// doesn't go over each other"). A fixed reach from the chair put two chargers on top of each other
// round a stadium table's end and across a corner, and glasses into the vase in the middle. So each
// setting is laid off the table's REAL edge along the diner's line of sight (`laySettings`): the
// charger a hand in from the edge, the whole setting kept on the top, clear of the centrepieces,
// clear of its neighbours — shrunk (to S_MIN at most) only as far as that takes, and left out
// where even the smallest one has no room. `npx tsx lib/scene/tableware.ts` holds the cases.
//
// One geometry for every seat in the room: a single instanced body however many guests.
import type { Point } from "@/lib/studio/hall";
import { pointInPolygon } from "@/lib/venues/faces";
import type { SceneCollector, InstanceRequest } from "./collect";
import { headingDeg, turn } from "./frame";
import { glassMaterial, glossMaterial, metalMaterial, clothMaterial } from "./materials";
import { type MaterialRef, type Part, transform, vec3 } from "./types";

/** The charger's radius, and how far its near rim stands in from the table's edge. */
export const CHARGER_R_MM = 158;
export const EDGE_GAP_MM = 35;
/** The smallest a setting is drawn to fit (a side plate's size); below it the seat gets none. */
export const S_MIN = 0.6;
/** Below this scale a setting that could stand larger without its glasses drops them. */
export const GLASSES_FROM = 0.8;

/** Champagne, matte: a glossy charger mirrored the dark floor and read grey (2026-10-23). */
const CHARGER: MaterialRef = { colour: "#d8c7a2", kind: "matte" };
const PLATE = glossMaterial("#fbfbfa");
const NAPKIN = clothMaterial("#f6f3ee");
const SILVER = metalMaterial("#cfcfd4");
const GLASS = glassMaterial("#eef4f7");

/** One setting in its own frame: the diner at −y, the table's middle at +y, the table top at z 0. */
export function settingParts(): Part[] {
  return [
    { shape: "cylinder", rTop: CHARGER_R_MM, rBottom: CHARGER_R_MM, h: 6, at: vec3(0, 0, 0), segments: 28, material: CHARGER },
    { shape: "lathe", profile: [{ r: 0, z: 0 }, { r: 95, z: 0 }, { r: 112, z: 6 }, { r: 128, z: 14 }, { r: 132, z: 16 }, { r: 120, z: 12 }, { r: 0, z: 9 }], at: vec3(0, 0, 6), segments: 28, material: PLATE },
    { shape: "box", w: 100, d: 150, h: 10, at: vec3(0, -10, 18), material: NAPKIN },
    { shape: "box", w: 16, d: 215, h: 3, at: vec3(185, 0, 0), material: SILVER },
    { shape: "box", w: 22, d: 200, h: 3, at: vec3(-185, 0, 0), material: SILVER },
    // A water glass and a wine glass, up and to the diner's right.
    { shape: "lathe", profile: [{ r: 0, z: 0 }, { r: 34, z: 0 }, { r: 34, z: 3 }, { r: 6, z: 8 }, { r: 5, z: 70 }, { r: 30, z: 88 }, { r: 40, z: 130 }, { r: 38, z: 185 }, { r: 35, z: 185 }, { r: 0, z: 182 }], at: vec3(120, 215, 0), segments: 12, material: GLASS },
    { shape: "lathe", profile: [{ r: 0, z: 0 }, { r: 30, z: 0 }, { r: 30, z: 3 }, { r: 5, z: 8 }, { r: 4, z: 85 }, { r: 26, z: 100 }, { r: 36, z: 135 }, { r: 30, z: 170 }, { r: 28, z: 170 }, { r: 0, z: 167 }], at: vec3(200, 160, 0), segments: 12, material: GLASS },
  ];
}

// The setting as the fit reads it, in its own frame at full size: two discs it must keep to itself
// (the charger with the cutlery beside it; the two glasses) and the points that must stay on the top.
export const CORE = { c: { x: 0, y: 0 }, r: 205 };
const GLASSES = { c: { x: 160, y: 190 }, r: 88 };
const RIM: Point[] = [
  { x: 0, y: -CHARGER_R_MM },
  { x: -112, y: -112 },
  { x: 112, y: -112 },
  { x: -196, y: -100 },
  { x: 193, y: -107 },
  { x: -196, y: 100 },
  { x: 193, y: 107 },
  { x: 120, y: 255 },
  { x: 236, y: 160 },
];

/** A seat as the fit needs it: the chair's place in the room and the unit direction it faces. */
export interface SettingSeat {
  at: Point;
  facing: Point;
}

/** What stands on the top and must keep its floor — a vase's foot, a candlestick's base: a box
 *  `hw` × `hd` half-sizes about `c`, turned `rotationDeg`, or a disc of radius `hw` when `round`. */
export interface Keepout {
  c: Point;
  hw: number;
  hd: number;
  rotationDeg: number;
  round?: boolean;
}

interface Disc {
  c: Point;
  r: number;
}

/** Where one setting goes: its middle in the room, its turn (its +y along the diner's facing) and
 *  its planar scale. */
export interface SettingPlace {
  x: number;
  y: number;
  rotationDeg: number;
  scale: number;
  /** Drawn without its glasses: only the glasses had no room (a narrow top's centrepiece). */
  bare: boolean;
}

/** The nearest crossing of the ray from `o` along `u` with any edge of `polys`, as a distance. */
function rayHit(o: Point, u: Point, polys: readonly Point[][]): number | null {
  let best: number | null = null;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = u.x * ey - u.y * ex;
      if (Math.abs(den) < 1e-9) continue;
      const wx = a.x - o.x;
      const wy = a.y - o.y;
      const t = (wx * ey - wy * ex) / den;
      const s = (wx * u.y - wy * u.x) / den;
      if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t < best)) best = t;
    }
  }
  return best;
}

interface Slot {
  edge: Point;
  facing: Point;
  rotationDeg: number;
  /** How far the setting has slid along the edge, away from a neighbour it met (to the diner's
   *  left is +, along the facing turned a quarter clockwise). */
  shift: number;
}

/** A setting may slide this far along its edge, a step at a time, before it is shrunk instead. */
const MAX_SLIDE_MM = 120;
const SLIDE_STEP_MM = 20;

/** The setting at scale `s` in slot `q` — with its glasses, or `bare` without — its middle, the
 *  discs it keeps to itself and the room point of a frame point. */
export function placed(q: Slot, s: number, bare = false) {
  const inset = CHARGER_R_MM * s + EDGE_GAP_MM;
  const centre = { x: q.edge.x - q.facing.y * q.shift + q.facing.x * inset, y: q.edge.y + q.facing.x * q.shift + q.facing.y * inset };
  const room = (p: Point): Point => {
    const t = turn({ x: p.x * s, y: p.y * s }, q.rotationDeg);
    return { x: centre.x + t.x, y: centre.y + t.y };
  };
  const discs: Disc[] = [{ c: room(CORE.c), r: CORE.r * s }];
  if (!bare) discs.push({ c: room(GLASSES.c), r: GLASSES.r * s });
  return { centre, discs, room };
}

const discsMeet = (a: Disc, b: Disc) => Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y) < a.r + b.r;

/** A disc against a keep-out box (or disc): the nearest point of the box to the disc's middle. */
export function hitsKeepout(d: Disc, k: Keepout): boolean {
  if (k.round) return Math.hypot(d.c.x - k.c.x, d.c.y - k.c.y) < d.r + k.hw;
  const local = turn({ x: d.c.x - k.c.x, y: d.c.y - k.c.y }, -k.rotationDeg);
  const nx = Math.max(-k.hw, Math.min(k.hw, local.x));
  const ny = Math.max(-k.hd, Math.min(k.hd, local.y));
  return Math.hypot(local.x - nx, local.y - ny) < d.r;
}

/** The glasses' own rim points, which a bare setting does not have. */
const GLASS_RIM = RIM.slice(-2);
const BARE_RIM = RIM.slice(0, -2);

/** The setting fits on its own at scale `s`: every rim point on the top, no disc in a keep-out. */
function fitsAlone(q: Slot, s: number, tops: readonly Point[][], keepouts: readonly Keepout[], bare: boolean): boolean {
  const { discs, room } = placed(q, s, bare);
  const rim = bare ? BARE_RIM : RIM;
  if (!rim.every((p) => tops.some((poly) => pointInPolygon(room(p), poly as Point[])))) return false;
  return !discs.some((d) => keepouts.some((k) => hitsKeepout(d, k)));
}

/**
 * One place per seat (null where none fits), for the seats of ONE ring round the top `tops` (the
 * table's or the block's outlines, in the room). Each seat's setting stands off the edge its diner
 * faces; it takes the largest scale (1 down to S_MIN) at which it is wholly on the top and clear of
 * `keepouts`; then neighbours that still meet — a round end, a corner — shrink together, and a
 * setting that meets a kept one even at S_MIN is left out.
 */
export function laySettings(seats: readonly SettingSeat[], tops: readonly Point[][], keepouts: readonly Keepout[]): (SettingPlace | null)[] {
  const slots: (Slot | null)[] = seats.map((seat) => {
    const L = Math.hypot(seat.facing.x, seat.facing.y) || 1;
    const facing = { x: seat.facing.x / L, y: seat.facing.y / L };
    const t = rayHit(seat.at, facing, tops);
    if (t === null) return null;
    const edge = { x: seat.at.x + facing.x * t, y: seat.at.y + facing.y * t };
    return { edge, facing, rotationDeg: headingDeg({ x: 0, y: 0 }, facing) - 90, shift: 0 };
  });
  // The largest scale that fits on its own. The glasses go first: a setting keeps them while it
  // stays at GLASSES_FROM or larger, and otherwise drops them if it is then drawn bigger — a plate
  // shrunk to two thirds to keep two glasses reads worse than the plate without them.
  const bare = slots.map(() => false);
  const largest = (q: Slot, without: boolean): number | null => {
    for (let s = 1; s >= S_MIN - 1e-9; s -= 0.04) if (fitsAlone(q, s, tops, keepouts, without)) return s;
    return null;
  };
  const scale = slots.map((q, i) => {
    if (!q) return 0;
    const full = largest(q, false);
    if (full !== null && full >= GLASSES_FROM) return full;
    const plain = largest(q, true);
    if (plain !== null && (full === null || plain > full)) {
      bare[i] = true;
      return plain;
    }
    return full ?? S_MIN;
  });
  // Neighbours that meet shrink together, a little each round, until they clear or bottom out.
  const meets = (i: number, j: number) => {
    const a = placed(slots[i]!, scale[i], bare[i]).discs;
    const b = placed(slots[j]!, scale[j], bare[j]).discs;
    return a.some((x) => b.some((y) => discsMeet(x, y)));
  };
  // How deep a setting at `q` (scale and bareness of slot `a`) stands in every other setting.
  const depthIn = (a: number, q: Slot): number => {
    const mine = placed(q, scale[a], bare[a]).discs;
    let sum = 0;
    for (let k = 0; k < slots.length; k++) {
      if (k === a || !slots[k]) continue;
      for (const x of mine) for (const y of placed(slots[k]!, scale[k], bare[k]).discs) sum += Math.max(0, x.r + y.r - Math.hypot(x.c.x - y.c.x, x.c.y - y.c.y));
    }
    return sum;
  };
  // A setting that meets a neighbour first slides along its own edge away from it (a corner's two
  // settings each step back from the corner) — only while it still fits there on its own and the
  // slide leaves it standing less deep in the others altogether: a setting caught between two
  // (round a crowded rim, at the end of a table between both sides) gains nothing by sliding, and
  // the ring shrinks instead.
  const slide = (a: number, b: number): boolean => {
    const q = slots[a]!;
    const ca = placed(q, scale[a], bare[a]).centre;
    const cb = placed(slots[b]!, scale[b], bare[b]).centre;
    const along = (ca.x - cb.x) * -q.facing.y + (ca.y - cb.y) * q.facing.x;
    const next = q.shift + (along >= 0 ? SLIDE_STEP_MM : -SLIDE_STEP_MM);
    if (Math.abs(next) > MAX_SLIDE_MM) return false;
    const trial = { ...q, shift: next };
    if (!fitsAlone(trial, scale[a], tops, keepouts, bare[a])) return false;
    if (depthIn(a, trial) > depthIn(a, q) - 1) return false;
    slots[a] = trial;
    return true;
  };
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) continue;
      for (let j = i + 1; j < slots.length; j++) {
        if (!slots[j] || !meets(i, j)) continue;
        const slid = slide(j, i);
        if (slide(i, j) || slid) {
          moved = true;
          continue;
        }
        if (scale[i] > S_MIN || scale[j] > S_MIN) {
          scale[i] = Math.max(S_MIN, scale[i] * 0.95);
          scale[j] = Math.max(S_MIN, scale[j] * 0.95);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  const kept: boolean[] = slots.map((q) => !!q);
  for (let j = 0; j < slots.length; j++) {
    if (!kept[j]) continue;
    for (let i = 0; i < j; i++) {
      if (kept[i] && meets(i, j)) {
        kept[j] = false;
        break;
      }
    }
  }
  return slots.map((q, i) => {
    if (!q || !kept[i]) return null;
    const { centre } = placed(q, scale[i], bare[i]);
    return { x: centre.x, y: centre.y, rotationDeg: q.rotationDeg, scale: scale[i], bare: bare[i] };
  });
}

const REQUEST: Omit<InstanceRequest, "at"> = {
  key: "tableware:setting",
  parts: settingParts(),
  material: PLATE,
  tag: { type: "tableware", label: "כלי שולחן להמחשה" },
  castShadow: false,
};
/** The same setting without its two glasses (the last two parts). */
const BARE_REQUEST: Omit<InstanceRequest, "at"> = { ...REQUEST, key: "tableware:setting:bare", parts: settingParts().slice(0, -2) };

/** The room is cut into squares this wide, the settings of each one body that hides past
 *  SETTINGS_LOD_MM from the camera: from across a hall a plate is a pixel, and six hundred of them
 *  were a quarter of plan A's triangles (2026-10-24). A few more draw calls, none drawn far off. */
export const SETTINGS_CELL_MM = 12000;
export const SETTINGS_LOD_MM = 22000;

/** The settings of one ring, laid by `laySettings`, on a top `topZ` above the venue floor. */
export function placeSettings(seats: readonly SettingSeat[], tops: readonly Point[][], keepouts: readonly Keepout[], topZ: number, out: SceneCollector): number {
  let n = 0;
  for (const place of laySettings(seats, tops, keepouts)) {
    if (!place) continue;
    const base = place.bare ? BARE_REQUEST : REQUEST;
    const cell = `${Math.floor(place.x / SETTINGS_CELL_MM)}_${Math.floor(place.y / SETTINGS_CELL_MM)}`;
    out.instance({ ...base, key: `${base.key}:${cell}`, lod: { tier: "near", beyondMm: SETTINGS_LOD_MM }, at: transform(vec3(place.x, place.y, topZ), place.rotationDeg, false, place.scale) });
    n++;
  }
  return n;
}
