// A fire trough's look (bug round 2026-11-21 §5.4; Ravid: "on תעלת אש I want to change the look —
// it should also have white stones round it"): the candlestick style "fire" (שולחן אש). A LOW body
// (never the row's full height as one block), the burner a dark slot with its flames along it, and
// white pebbles — in the trough round the burner, as a frame round the trough on the table, or both.
//
// `MapAppearance.fire` = FireSpec; every field absent = the answer in FIRE_DEFAULTS. ONE layout for
// the plan and the room (fireLayout, in the trough's own frame: x along it, its middle at 0).
import type { MapAppearance } from "./types";

export type FireStones = "inside" | "frame" | "both" | "none";

export interface FireSpec {
  stones?: FireStones;
  stoneColour?: string;
  stoneSizeMm?: number;
  /** A glass wind screen round the burner. */
  guard?: boolean;
  bodyHeightMm?: number;
}

export const FIRE_DEFAULTS = { stones: "inside" as FireStones, stoneColour: "#F2F0EA", stoneSizeMm: 25, guard: false, bodyHeightMm: 120 };
export const FIRE_STONES: FireStones[] = ["inside", "frame", "both", "none"];
export const FIRE_STONES_LABEL: Record<FireStones, string> = { inside: "סביב המבער", frame: "מסגרת סביב התעלה", both: "בשניהם", none: "בלי אבנים" };

export function fireSpecOf(appearance: Pick<MapAppearance, "fire"> | undefined): FireSpec | undefined {
  const f = appearance?.fire as FireSpec | undefined;
  return f && typeof f === "object" && Object.keys(f).length ? f : undefined;
}

/** The spec with `patch` applied; a field equal to its default is not stored; nothing left = undefined. */
export function firePatch(cur: FireSpec | undefined, patch: { [K in keyof FireSpec]?: FireSpec[K] | null }): FireSpec | undefined {
  const next: FireSpec = { ...cur };
  for (const [k, v] of Object.entries(patch) as [keyof FireSpec, unknown][]) {
    if (v === null || v === undefined || v === (FIRE_DEFAULTS as Record<string, unknown>)[k]) delete next[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

/** One pebble, in the trough's frame: its middle and radius. */
export interface Pebble {
  x: number;
  y: number;
  r: number;
}

export interface FireLayout {
  bodyH: number;
  /** The burner slot: half its length and half its width (a round trough: its radius in `half`). */
  slot: { halfL: number; halfD: number };
  /** The frame band's width past the trough's edge (0 = no frame). */
  frameMm: number;
  stones: Pebble[];
  colour: string;
  guard: boolean;
}

/** A small, repeatable jitter: the same trough lays the same stones every time. */
const jitter = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v); // 0…1
};

/** The trough `L` long and `D` deep (a round one: `L` = `D` = its diameter) laid out: its body, the
 *  burner slot (the old drawing's: 0.4 D wide, L − 0.6 D long; a round one 0.36 of it), the pebbles
 *  packed on a jittered grid of their own size in the regions the spec asks for. */
export function fireLayout(L: number, D: number, round: boolean, spec: FireSpec | undefined): FireLayout {
  const stones = spec?.stones ?? FIRE_DEFAULTS.stones;
  const size = Math.max(8, spec?.stoneSizeMm ?? FIRE_DEFAULTS.stoneSizeMm);
  const slot = round ? { halfL: L * 0.36, halfD: L * 0.36 } : { halfL: Math.max(D * 0.2, (L - D * 0.6) / 2), halfD: D * 0.2 };
  const frameMm = stones === "frame" || stones === "both" ? Math.round(size * 3) : 0;
  const rim = Math.min(15, D * 0.05);
  const inTrough = (x: number, y: number) => (round ? Math.hypot(x, y) <= L / 2 - rim : Math.abs(x) <= L / 2 - rim && Math.abs(y) <= D / 2 - rim);
  const inSlot = (x: number, y: number) => (round ? Math.hypot(x, y) <= slot.halfL + size * 0.4 : Math.abs(x) <= slot.halfL + size * 0.4 && Math.abs(y) <= slot.halfD + size * 0.4);
  const onTrough = (x: number, y: number) => (round ? Math.hypot(x, y) <= L / 2 + size * 0.3 : Math.abs(x) <= L / 2 + size * 0.3 && Math.abs(y) <= D / 2 + size * 0.3);
  const inFrame = (x: number, y: number) => (round ? Math.hypot(x, y) <= L / 2 + frameMm : Math.abs(x) <= L / 2 + frameMm && Math.abs(y) <= D / 2 + frameMm);
  const out: Pebble[] = [];
  const pitch = size * 0.95;
  const reach = L / 2 + frameMm + size;
  const reachY = (round ? L : D) / 2 + frameMm + size;
  let i = 0;
  for (let gy = -reachY; gy <= reachY; gy += pitch * 0.87)
    for (let gx = -reach; gx <= reach; gx += pitch) {
      i++;
      const x = gx + (Math.round(gy / (pitch * 0.87)) % 2 ? pitch / 2 : 0) + (jitter(i, 1) - 0.5) * size * 0.35;
      const y = gy + (jitter(i, 2) - 0.5) * size * 0.35;
      const inside = (stones === "inside" || stones === "both") && inTrough(x, y) && !inSlot(x, y);
      const frame = frameMm > 0 && inFrame(x, y) && !onTrough(x, y);
      if (inside || frame) out.push({ x, y, r: (size / 2) * (0.78 + 0.4 * jitter(i, 3)) });
    }
  return {
    bodyH: Math.max(30, spec?.bodyHeightMm ?? FIRE_DEFAULTS.bodyHeightMm),
    slot,
    frameMm,
    stones: out,
    colour: spec?.stoneColour ?? FIRE_DEFAULTS.stoneColour,
    guard: spec?.guard ?? FIRE_DEFAULTS.guard,
  };
}
