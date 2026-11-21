// A candlestick's candles, its wind guards, the heights of its arms and its crystal (bug round
// 2026-11-21 §5.3; Ravid: "פמוטים must be more customisable — candle type thick/thin, height/width
// with defaults, a הידורית and not only wax, with a wind guard or not, how many arms"; his four
// photographs: acrylic rods at stepped heights in tall glass tubes, crystal five-arm pieces in
// straight hurricanes, a crystal seven-light in tulip glasses hung with drops).
//
// `MapAppearance.candles`, the ChandelierSpec pattern: ABSENT = the drawing it always was, to the
// digit (candleLook answers null and every recipe keeps its sizes); candlePatch stores only what
// differs from the answers below. The plan exaggerates a candle so it is seen; the room builds the
// real millimetres given here (the skill's decision 4).
import type { MapAppearance } from "./types";
import { isMain } from "../self-check";

export type CandleKind = "taper" | "pillar" | "hadorit" | "led" | "floating";
export type CandleGuard = "none" | "cylinder" | "tulip";
export type CandleHeights = "equal" | "centre" | "ends" | "stepped" | "typed";
export type CandleDrops = "none" | "some" | "full";
export type ArmShape = "straight" | "s";

export interface CandleSpec {
  kind?: CandleKind;
  /** The candle's own size, mm — absent = the kind's (CANDLE_SIZE). */
  diameterMm?: number;
  heightMm?: number;
  guard?: CandleGuard;
  guardDiameterMm?: number;
  guardHeightMm?: number;
  /** The heights of the ARMS or RODS the candles stand on (DECIDE 11) — the candles stay one size. */
  heights?: CandleHeights;
  /** One height per arm or rod, mm above the floor, in the layout's order — read when `typed`. */
  stepHeightsMm?: number[];
  drops?: CandleDrops;
  armShape?: ArmShape;
}

export const CANDLE_KINDS: CandleKind[] = ["taper", "pillar", "hadorit", "led", "floating"];
export const CANDLE_KIND_LABEL: Record<CandleKind, string> = { taper: "נר דק", pillar: "נר עבה", hadorit: "הידורית", led: "נר LED", floating: "נר צף" };
/** Each kind's real size, mm (⌀ × height). */
export const CANDLE_SIZE: Record<CandleKind, { d: number; h: number }> = {
  taper: { d: 22, h: 250 },
  pillar: { d: 70, h: 150 },
  hadorit: { d: 60, h: 90 },
  led: { d: 70, h: 120 },
  floating: { d: 60, h: 30 },
};

export const CANDLE_GUARDS: CandleGuard[] = ["none", "cylinder", "tulip"];
export const CANDLE_GUARD_LABEL: Record<CandleGuard, string> = { none: "בלי מגן רוח", cylinder: "גליל זכוכית", tulip: "טוליפ" };
export const GUARD_SIZE: Record<Exclude<CandleGuard, "none">, { d: number; h: number }> = { cylinder: { d: 90, h: 300 }, tulip: { d: 120, h: 250 } };

export const CANDLE_HEIGHTS: CandleHeights[] = ["equal", "centre", "ends", "stepped", "typed"];
export const CANDLE_HEIGHTS_LABEL: Record<CandleHeights, string> = { equal: "שווים", centre: "המרכז גבוה", ends: "הקצוות גבוהים", stepped: "מדורג", typed: "לכל קנה" };
export const CANDLE_DROPS_LABEL: Record<CandleDrops, string> = { none: "בלי", some: "מעט", full: "מלא" };
export const ARM_SHAPE_LABEL: Record<ArmShape, string> = { straight: "ישרה", s: "S" };

const isKind = (v: unknown): v is CandleKind => typeof v === "string" && (CANDLE_KINDS as string[]).includes(v);
const isGuard = (v: unknown): v is CandleGuard => typeof v === "string" && (CANDLE_GUARDS as string[]).includes(v);

/** The row's candle spec, or undefined when it has none (the old drawing). */
export function candleSpecOf(appearance: Pick<MapAppearance, "candles"> | undefined): CandleSpec | undefined {
  const c = appearance?.candles as CandleSpec | undefined;
  return c && typeof c === "object" && Object.keys(c).length ? c : undefined;
}

/** What one candle is in the room: its kind and real size, and its guard (none = no glass). */
export interface CandleLook {
  kind: CandleKind;
  dMm: number;
  hMm: number;
  guard: CandleGuard;
  guardDMm: number;
  guardHMm: number;
}

/** The look a spec asks for — null with no spec (each recipe keeps its own sizes). `sleeves`: the
 *  style is "שרוולי זכוכית", whose guard is a cylinder unless the spec says otherwise. */
export function candleLook(spec: CandleSpec | undefined, sleeves = false): CandleLook | null {
  if (!spec) return null;
  const kind = isKind(spec.kind) ? spec.kind : "taper";
  const guard = isGuard(spec.guard) ? spec.guard : sleeves ? "cylinder" : "none";
  const g = guard === "none" ? { d: 0, h: 0 } : GUARD_SIZE[guard];
  return {
    kind,
    dMm: spec.diameterMm && spec.diameterMm > 0 ? spec.diameterMm : CANDLE_SIZE[kind].d,
    hMm: spec.heightMm && spec.heightMm > 0 ? spec.heightMm : CANDLE_SIZE[kind].h,
    guard,
    guardDMm: guard !== "none" && spec.guardDiameterMm && spec.guardDiameterMm > 0 ? spec.guardDiameterMm : g.d,
    guardHMm: guard !== "none" && spec.guardHeightMm && spec.guardHeightMm > 0 ? spec.guardHeightMm : g.h,
  };
}

/** The spec with `patch` applied — a field given as undefined/null is cleared, a size equal to its
 *  kind's or its guard's default is not stored; nothing left = undefined. */
export function candlePatch(cur: CandleSpec | undefined, patch: { [K in keyof CandleSpec]?: CandleSpec[K] | null }): CandleSpec | undefined {
  const next: CandleSpec = { ...cur };
  for (const [k, v] of Object.entries(patch) as [keyof CandleSpec, unknown][]) {
    if (v === null || v === undefined) delete next[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  const kind = isKind(next.kind) ? next.kind : "taper";
  if (next.diameterMm === CANDLE_SIZE[kind].d) delete next.diameterMm;
  if (next.heightMm === CANDLE_SIZE[kind].h) delete next.heightMm;
  if (isGuard(next.guard) && next.guard !== "none") {
    if (next.guardDiameterMm === GUARD_SIZE[next.guard].d) delete next.guardDiameterMm;
    if (next.guardHeightMm === GUARD_SIZE[next.guard].h) delete next.guardHeightMm;
  } else {
    delete next.guardDiameterMm;
    delete next.guardHeightMm;
  }
  if (next.heights !== "typed") delete next.stepHeightsMm;
  if (next.heights === "equal") delete next.heights;
  if (next.drops === "none") delete next.drops;
  if (next.armShape === "straight") delete next.armShape;
  return Object.keys(next).length ? next : undefined;
}

/** How high each of `n` arms or rods stands (mm above the floor), in the layout's order along it:
 *  `low` the default height, `rise` how much higher the highest goes. `equal` = all at `low`. */
export function armLevels(n: number, heights: CandleHeights | undefined, low: number, rise: number, typed?: readonly number[]): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // −1 … 1 along the piece
    switch (heights) {
      case "centre":
        return low + rise * (1 - Math.abs(t));
      case "ends":
        return low + rise * Math.abs(t);
      case "stepped":
        return low + rise * (n === 1 ? 1 : i / (n - 1));
      case "typed":
        return typed?.[i] && typed[i] > 0 ? typed[i] : low;
      default:
        return low;
    }
  });
}

// Self-check. Run: npm run check:candles
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  assert(candleSpecOf(undefined) === undefined && candleSpecOf({ candles: {} } as unknown as MapAppearance) === undefined, "no spec = undefined");
  assert(candleLook(undefined) === null, "no spec = no look: every recipe keeps its own candles, to the digit");
  const taper = candleLook({})!;
  assert(taper.kind === "taper" && taper.dMm === 22 && taper.hMm === 250 && taper.guard === "none", "an empty spec is a taper ⌀2.2 × 25 cm with no guard");
  assert(candleLook({}, true)!.guard === "cylinder" && candleLook({}, true)!.guardDMm === 90 && candleLook({}, true)!.guardHMm === 300, "…in the sleeves style its guard is a cylinder ⌀9 × 30");
  const h = candleLook({ kind: "hadorit", guard: "tulip" })!;
  assert(h.dMm === 60 && h.hMm === 90 && h.guardDMm === 120 && h.guardHMm === 250, "a הידורית ⌀6 × 9 in a tulip ⌀12 × 25");
  assert(candleLook({ kind: "pillar", diameterMm: 80 })!.dMm === 80 && candleLook({ kind: "pillar" })!.hMm === 150, "a typed size wins; the kind's height otherwise");
  assert(candlePatch(undefined, { kind: "pillar", diameterMm: 70 })?.diameterMm === undefined, "a size equal to the kind's is not stored");
  assert(candlePatch({ guard: "tulip", guardHeightMm: 300 }, { guard: "none" })?.guardHeightMm === undefined, "no guard drops its sizes");
  assert(candlePatch({ heights: "typed", stepHeightsMm: [1, 2] }, { heights: "equal" }) === undefined, "back to equal heights stores nothing");
  assert(candlePatch({ drops: "some" }, { drops: "none" }) === undefined && candlePatch({ armShape: "s" }, { armShape: "straight" }) === undefined, "the defaults are not stored");
  const step = armLevels(5, "stepped", 100, 400);
  assert(step[0] === 100 && step[4] === 500 && step[2] === 300, "stepped: from the low one to the high one, evenly");
  assert(armLevels(5, "centre", 100, 400)[2] === 500 && armLevels(5, "centre", 100, 400)[0] === 100, "centre highest");
  assert(armLevels(5, "ends", 100, 400)[0] === 500 && armLevels(5, "ends", 100, 400)[2] === 100, "ends highest");
  assert(armLevels(3, "typed", 100, 400, [200, 0, 600]).join() === "200,100,600", "typed: each its own, a blank one at the default");
  assert(armLevels(4, undefined, 100, 400).every((z) => z === 100), "equal: all at the default");
  console.log("candles self-check passed");
}
