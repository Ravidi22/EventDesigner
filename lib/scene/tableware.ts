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
import { isMain } from "../self-check";
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
const CORE = { c: { x: 0, y: 0 }, r: 205 };
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
function placed(q: Slot, s: number, bare = false) {
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
function hitsKeepout(d: Disc, k: Keepout): boolean {
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

// ponytail: self-check. Run: npx tsx lib/scene/tableware.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const rect = (w: number, d: number): Point[] => [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
  const disc = (r: number, n = 48): Point[] => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) }));
  const overlaps = (ps: (SettingPlace | null)[]) => {
    const live = ps.filter((p): p is SettingPlace => !!p);
    let worst = Infinity;
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) worst = Math.min(worst, Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y) - CORE.r * (live[i].scale + live[j].scale));
    return worst;
  };

  // A long table, chairs 60cm apart down both sides: full-size settings, one a hand in from each edge.
  const long = rect(2400, 1000);
  const sides: SettingSeat[] = [];
  for (let k = 0; k < 4; k++) {
    const x = -900 + k * 600;
    sides.push({ at: { x, y: -760 }, facing: { x: 0, y: 1 } }, { at: { x, y: 760 }, facing: { x: 0, y: -1 } });
  }
  const lay = laySettings(sides, [long], []);
  assert(lay.every((p) => !!p && p.scale === 1), "a long table seats every setting at full size");
  assert(Math.abs(lay[0]!.y - (-500 + EDGE_GAP_MM + CHARGER_R_MM)) < 1e-6, "…its charger a hand in from the edge the diner sits at");
  assert(Math.abs(lay[0]!.rotationDeg - 0) < 1e-6 && Math.abs(Math.abs(lay[1]!.rotationDeg) - 180) < 1e-6, "…turned to face its diner");
  assert(overlaps(lay) >= 0, "…and no two meet");

  // A round of 90 seating 14: the chairs crowd the rim, so the settings shrink — and never meet.
  const round = disc(450);
  const ring: SettingSeat[] = Array.from({ length: 14 }, (_, i) => {
    const a = (2 * Math.PI * i) / 14;
    return { at: { x: 700 * Math.cos(a), y: 700 * Math.sin(a) }, facing: { x: -Math.cos(a), y: -Math.sin(a) } };
  });
  const crowded = laySettings(ring, [round], []);
  assert(overlaps(crowded) >= -1e-6, `a crowded round's settings never meet (${overlaps(crowded).toFixed(1)})`);
  assert(crowded.some((p) => p && p.scale < 1), "…they are drawn smaller to fit");

  // A stadium table's round end: the end seats and the corner seats meet unless the fit parts them.
  const stadium: Point[] = [];
  for (let i = 0; i <= 12; i++) stadium.push({ x: 900 + 500 * Math.sin((Math.PI * i) / 12), y: -500 * Math.cos((Math.PI * i) / 12) });
  for (let i = 0; i <= 12; i++) stadium.push({ x: -900 - 500 * Math.sin((Math.PI * i) / 12), y: 500 * Math.cos((Math.PI * i) / 12) });
  const endSeats: SettingSeat[] = [
    { at: { x: 600, y: -760 }, facing: { x: 0, y: 1 } },
    { at: { x: 1150, y: -560 }, facing: { x: -0.6, y: 0.8 } },
    { at: { x: 1660, y: 0 }, facing: { x: -1, y: 0 } },
    { at: { x: 1150, y: 560 }, facing: { x: -0.6, y: -0.8 } },
    { at: { x: 600, y: 760 }, facing: { x: 0, y: -1 } },
  ];
  const ends = laySettings(endSeats, [stadium], []);
  assert(overlaps(ends) >= -1e-6, "a stadium's round end: no two settings meet");
  assert(ends.filter(Boolean).length >= 4, "…and the end still has its settings");

  // A centrepiece in the middle keeps the glasses off it: smaller settings on a 1m top…
  const narrow = rect(1800, 1000);
  const across: SettingSeat[] = [
    { at: { x: 160, y: -660 }, facing: { x: 0, y: 1 } },
    { at: { x: -160, y: 660 }, facing: { x: 0, y: -1 } },
  ];
  const vase: Keepout = { c: { x: 0, y: 0 }, hw: 170, hd: 170, rotationDeg: 0, round: true };
  const clear = laySettings(across, [narrow], [vase]);
  assert(clear.every((p) => !!p && !p.bare && p.scale < 1), `a vase in the middle: both settings, drawn smaller, glasses kept (${JSON.stringify(clear)})`);
  for (const p of clear) {
    const q = placed({ edge: { x: p!.x, y: Math.sign(p!.y) * 500 }, facing: { x: 0, y: -Math.sign(p!.y) }, rotationDeg: p!.rotationDeg, shift: 0 }, p!.scale);
    assert(!q.discs.some((d) => hitsKeepout(d, vase)), "…their glasses clear the vase");
  }
  // …and on a 75cm top with a wide bowl the glasses give way before the plates do.
  const bowl: Keepout = { c: { x: 0, y: 0 }, hw: 300, hd: 60, rotationDeg: 0 };
  const tight = laySettings([{ at: { x: 0, y: -535 }, facing: { x: 0, y: 1 } }], [rect(1800, 750)], [bowl]);
  assert(!!tight[0] && tight[0].bare, `a bowl too close for the glasses: the setting goes without them (${JSON.stringify(tight)})`);

  // Two chairs on one spot: never two settings stacked — parted along the edge, or one left out.
  const twice = laySettings([{ at: { x: 0, y: -760 }, facing: { x: 0, y: 1 } }, { at: { x: 10, y: -760 }, facing: { x: 0, y: 1 } }], [long], []);
  assert(twice.some(Boolean) && overlaps(twice) >= -1e-6, "two seats on one spot: never two settings on top of each other");
  // An 180×90 seating eight — three a side and one at each end: the end settings meet the side
  // ones at the corners, so the side ones step back along their edge and every one stays.
  const eight: SettingSeat[] = [];
  for (const x of [-600, 0, 600]) eight.push({ at: { x, y: -710 }, facing: { x: 0, y: 1 } }, { at: { x, y: 710 }, facing: { x: 0, y: -1 } });
  eight.push({ at: { x: 1160, y: 0 }, facing: { x: -1, y: 0 } }, { at: { x: -1160, y: 0 }, facing: { x: 1, y: 0 } });
  const corner = laySettings(eight, [rect(1800, 900)], []);
  assert(corner.every(Boolean) && overlaps(corner) >= -1e-6, `an 180×90 seating eight: every setting stays, none meet (${JSON.stringify(corner.map((p) => p && [Math.round(p.x), Math.round(p.y), +p.scale.toFixed(2), p.bare]))} ${overlaps(corner).toFixed(1)})`);
  assert(Math.abs(corner[4]!.x) < 600, `…the corner settings stepped back from the corner (${Math.round(corner[4]!.x)})`);

  // A chair facing away from the top gets nothing.
  assert(laySettings([{ at: { x: 0, y: -760 }, facing: { x: 0, y: -1 } }], [long], [])[0] === null, "a seat that faces no table gets no setting");
  console.log("tableware ok");
}
