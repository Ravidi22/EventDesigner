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
import { isMain } from "../self-check";

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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
  const rect = (cx: number, cy: number, w: number, d: number): Poly => [
    { x: cx - w / 2, y: cy - d / 2 },
    { x: cx + w / 2, y: cy - d / 2 },
    { x: cx + w / 2, y: cy + d / 2 },
    { x: cx - w / 2, y: cy + d / 2 },
  ];
  // Two tables, 1m apart edge to edge; the second one can be moved by swapping the lookup.
  let tables: Record<string, Poly[]> = { "table:1": [rect(0, 0, 2000, 1000)], "table:2": [rect(3000, 0, 1000, 1000)] };
  const lookup: TapeLookup = (id) => tables[id];

  // Free to free: the points themselves, with an angle to read.
  const free = resolveTape({ a: anchorAt({ x: 0, y: 0 }), b: anchorAt({ x: 3000, y: 4000 }) }, lookup);
  assert(!!free && !free.between && near(free.lengthMm, 5000), "two free points measure between themselves");
  assert(tapeAngleDeg(free!) === 53, "…and read their bearing");
  const r = tapeReadout(free!);
  assert(r?.length === "5.00 מ׳" && r.detail === "53°", "a free measurement reads metres and an angle");
  assert(tapeReadout(resolveTape({ a: anchorAt({ x: 5, y: 5 }), b: anchorAt({ x: 5, y: 5 }) }, lookup)!) === null, "two points on top of each other read nothing");

  // Item to item: edge to edge, whatever points were pressed inside them.
  const both = resolveTape({ a: anchorAt({ x: 100, y: 100 }, "table:1"), b: anchorAt({ x: 3100, y: -100 }, "table:2") }, lookup);
  assert(!!both && both.between && near(both.lengthMm, 1500), "two items: the air between their edges");
  assert(near(both!.a.x, 1000) && near(both!.b.x, 2500), "…from the first's edge to the second's");
  assert(tapeReadout(both!)?.detail === "מקצה לקצה", "between items the detail is edge-to-edge, not an angle");

  // Item to point, point to item: from the nearest point of the outline.
  const toPoint = resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 0, y: 2500 }) }, lookup);
  assert(!!toPoint && toPoint.between && near(toPoint.lengthMm, 2000) && near(toPoint.a.y, 500), "item to point: off the item's edge");
  const fromPoint = resolveTape({ a: anchorAt({ x: 0, y: 2500 }), b: anchorAt({ x: 0, y: 0 }, "table:1") }, lookup);
  assert(!!fromPoint && near(fromPoint.lengthMm, 2000) && near(fromPoint.b.y, 500) && near(fromPoint.a.y, 2500), "point to item: the point stays, the other end is the edge");

  // Both ends in one item: the two points pressed, not the item against itself (which reads zero).
  const self = resolveTape({ a: anchorAt({ x: -900, y: 0 }, "table:1"), b: anchorAt({ x: 900, y: 0 }, "table:1") }, lookup);
  assert(!!self && !self.between && near(self.lengthMm, 1800), "one item on both ends measures between the two points pressed");
  assert(resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:9"), b: anchorAt({ x: 1, y: 0 }, "table:9") }, lookup) === null, "…but still nothing once that item is gone");

  // LIVE: the item moves, the measurement follows — nothing was copied.
  tables = { ...tables, "table:2": [rect(4000, 0, 1000, 1000)] };
  const moved = resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 3100, y: 0 }, "table:2") }, lookup);
  assert(!!moved && near(moved.lengthMm, 2500), "a moved item is measured where it is now");

  // Touching reads "צמודים".
  tables = { ...tables, "table:2": [rect(1500, 0, 1000, 1000)] };
  const touching = resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 1500, y: 0 }, "table:2") }, lookup);
  assert(!!touching && touching.lengthMm < 1 && tapeReadout(touching)?.length === "צמודים", "two things touching read צמודים");

  // The list: add, drop the ones whose item is gone, remove one, same array when nothing changes.
  let list: TapeMeasurement[] = [];
  list = addTape(list, { id: tapeId(), a: anchorAt({ x: 0, y: 0 }), b: anchorAt({ x: 1000, y: 0 }) });
  list = addTape(list, { id: tapeId(), a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 3100, y: 0 }, "table:2") });
  list = addTape(list, { id: tapeId(), a: anchorAt({ x: 0, y: 2500 }), b: anchorAt({ x: 0, y: 0 }, "table:1") });
  assert(list.length === 3 && new Set(list.map((m) => m.id)).size === 3, "three measurements, three ids");
  assert(pruneTape(list, lookup) === list, "nothing gone: the same list back");
  tables = { "table:1": tables["table:1"] }; // table 2 deleted
  const pruned = pruneTape(list, lookup);
  assert(pruned.length === 2 && pruned.every((m) => m.b.targetId !== "table:2"), "a measurement to a deleted item is dropped; the others stay");
  assert(resolveTape(list[1], lookup) === null, "…because it resolves to nothing");
  const less = removeTape(pruned, pruned[0].id);
  assert(less.length === 1 && less[0] === pruned[1], "removing one by id leaves the rest");
  assert(removeTape(less, "nope") === less, "removing an unknown id changes nothing");

  console.log("check:tape ok");
}
