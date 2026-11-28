// The tape measure's bookkeeping: what a measurement IS, how its ends are resolved against the plan
// as it stands now, and how the list of them is kept.
//
// A measurement is two anchors. An anchor is a point on the floor, or an ITEM — the thing under the
// pointer when the end was set down (`targetId`, a MeasureTarget id like `table:<id>`), with the
// point kept only as a fallback. Nothing about the item is copied: its outline is looked up again
// every time the measurement is drawn, so a tape taken to a table keeps reading to the table while
// the table is dragged, and a measurement whose item has since been deleted resolves to nothing and
// is dropped (`pruneTape`). Between two items the tape runs edge to edge — the clear air between
// them, which is what "how far is the stage from the first table" has always meant.
//
// Pure, no DOM, self-checked: `npm run check:tape`. The canvas (components/plan-canvas.tsx) owns the
// gesture and the drawing; the hosts own what an id resolves to.
import type { Point } from "@/lib/design-document/types";
import { pointToPolys, polysGap, type Poly } from "./proximity";

/** One end of a measurement: a free point, or an item (by MeasureTarget id) with the point it was
 *  set down at kept behind it. */
export interface TapeAnchor {
  point: Point;
  targetId?: string;
}

/** A finished measurement. Both ends may be items; both may be points. */
export interface TapeMeasurement {
  id: string;
  a: TapeAnchor;
  b: TapeAnchor;
}

/** Where a measurement is drawn now: its two ends on the floor, and whether it runs between the
 *  edges of two things (then there is no angle worth reading). */
export interface TapeSegment {
  a: Point;
  b: Point;
  between: boolean;
  lengthMm: number;
}

/** What an id is right now — its outline in world mm — or undefined once the item is gone. */
export type TapeLookup = (id: string) => readonly Poly[] | undefined;

export const anchorAt = (point: Point, targetId?: string): TapeAnchor => (targetId ? { point, targetId } : { point });

let seq = 0;
/** A fresh id for a measurement — unique within the session, which is as long as one lives. */
export const tapeId = (): string => `tape-${++seq}`;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Resolve a measurement against the plan as it stands. Null when an end is anchored to something
 * the lookup no longer knows — that measurement is about nothing now, and the caller drops it.
 *
 * Between two items the segment is the gap between their outlines (polysGap); from an item to a
 * point it runs from the nearest point of the item's outline; two free points are themselves. Both
 * ends inside the SAME item would measure a thing against itself and read zero, so they are taken
 * as the two points pressed instead — an Alt+drag across a table reads the table.
 */
export function resolveTape(m: { a: TapeAnchor; b: TapeAnchor }, lookup: TapeLookup): TapeSegment | null {
  const polysA = m.a.targetId ? lookup(m.a.targetId) : undefined;
  if (m.a.targetId && !polysA) return null;
  const polysB = m.b.targetId ? lookup(m.b.targetId) : undefined;
  if (m.b.targetId && !polysB) return null;
  const same = !!m.a.targetId && m.a.targetId === m.b.targetId;
  const A = same ? undefined : polysA;
  const B = same ? undefined : polysB;
  let a = m.a.point;
  let b = m.b.point;
  let between = false;
  if (A && B) {
    const g = polysGap(A, B);
    a = g.from;
    b = g.to;
    between = true;
  } else if (A) {
    a = pointToPolys(b, A).to;
    between = true;
  } else if (B) {
    b = pointToPolys(a, B).to;
    between = true;
  }
  return { a, b, between, lengthMm: dist(a, b) };
}

/** The list without the measurements whose items are gone. The SAME array back when nothing was
 *  dropped, so a state write can be skipped. */
export function pruneTape(list: readonly TapeMeasurement[], lookup: TapeLookup): TapeMeasurement[] {
  const kept = list.filter((m) => resolveTape(m, lookup) !== null);
  return kept.length === list.length ? (list as TapeMeasurement[]) : kept;
}

export function addTape(list: readonly TapeMeasurement[], m: TapeMeasurement): TapeMeasurement[] {
  return [...list, m];
}

export function removeTape(list: readonly TapeMeasurement[], id: string): TapeMeasurement[] {
  const kept = list.filter((m) => m.id !== id);
  return kept.length === list.length ? (list as TapeMeasurement[]) : kept;
}

/** The bearing of the segment, 0–360, as every wall label reads it (lib/studio/geometry's
 *  wallAngleDeg — repeated here so this module stays free of the canvas's geometry imports). */
export function tapeAngleDeg(s: { a: Point; b: Point }): number {
  const deg = (Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360) % 360;
}

/** The readout pill's two parts: the length ("1.23 מ׳", or "צמודים" for two things touching) and
 *  the detail ("מקצה לקצה" between items, else the angle). Null when there is nothing worth
 *  reading — two free points on top of each other. */
export function tapeReadout(s: TapeSegment): { length: string; detail: string } | null {
  if (s.lengthMm < 1 && !s.between) return null;
  return {
    length: s.lengthMm < 1 ? "צמודים" : `${(s.lengthMm / 1000).toFixed(2)} מ׳`,
    detail: s.between ? "מקצה לקצה" : `${tapeAngleDeg(s)}°`,
  };
}
