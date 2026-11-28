import type { Point } from "./hall";
import { distributedCentres, type CentredBox } from "./proximity";

// יישור — line a selection up BY ONE OF ITS OWN MEMBERS.
//
// The "key" is the thing the designer is lining the others up with: it never moves, and every other
// unit is slid along ONE axis until its edge (or centre) meets the key's. That is the whole of what
// a designer means by "align these to that one" in every drawing tool, and it is the opposite of the
// common shortcut of aligning to the selection's outer box — which moves the very thing they were
// careful to put where it is.
//
// SCREEN WORDS, NOT LOGICAL ONES. ימין and שמאל here are the plan's right and left as it is drawn
// (+x is to the right on the canvas, whatever the page direction), so "יישור לימין" puts every right
// edge on the key's right edge. A plan is a picture of a room; reading its sides as "start/end" of a
// Hebrew line would put the bar on the wrong wall.
//
// BOXES, measured off the TURNED outline (the CentredBox every studio measurement uses), and one per
// UNIT — a group of tables pushed into one head table aligns as the one block it is, never member by
// member, which would undo the grouping. The caller forms the units; this file only moves boxes.
//
// Distribution is the existing equal-air rule (proximity.ts distributedCentres) with the axis named
// rather than guessed — the two end units stay, and the key plays no part (it has no "middle" to be).

export type AlignOp = "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom" | "distribute-x" | "distribute-y";

/** The menu's words for each, as the plan is seen on screen. */
export const ALIGN_LABEL: Record<AlignOp, string> = {
  right: "יישור לימין",
  hcenter: "יישור למרכז (אופקי)",
  left: "יישור לשמאל",
  top: "יישור למעלה",
  vmiddle: "יישור לאמצע (אנכי)",
  bottom: "יישור למטה",
  "distribute-x": "פיזור אחיד לרוחב",
  "distribute-y": "פיזור אחיד לאורך",
};

/** Distribution needs a middle to move: two units have none. */
export const needsThree = (op: AlignOp) => op === "distribute-x" || op === "distribute-y";

/**
 * Where each box's CENTRE goes, in the order given. `key` is the index of the box the others are
 * aligned to — it is returned exactly where it is. Each other box moves along one axis only: an
 * alignment of left edges never touches anything's y. Whole millimetres.
 */
export function alignedCentres(boxes: readonly CentredBox[], key: number, op: AlignOp): Point[] {
  if (op === "distribute-x") return distributedCentres(boxes, "x");
  if (op === "distribute-y") return distributedCentres(boxes, "y");
  const k = boxes[key] ?? boxes[0];
  if (!k) return [];
  const half = (b: CentredBox, axis: "x" | "y") => (axis === "x" ? b.widthMm : b.depthMm) / 2;
  return boxes.map((b, i) => {
    if (i === key) return { x: b.x, y: b.y };
    switch (op) {
      case "left":
        return { x: Math.round(k.x - half(k, "x") + half(b, "x")), y: b.y };
      case "right":
        return { x: Math.round(k.x + half(k, "x") - half(b, "x")), y: b.y };
      case "hcenter":
        return { x: Math.round(k.x), y: b.y };
      case "top":
        return { x: b.x, y: Math.round(k.y - half(k, "y") + half(b, "y")) };
      case "bottom":
        return { x: b.x, y: Math.round(k.y + half(k, "y") - half(b, "y")) };
      case "vmiddle":
        return { x: b.x, y: Math.round(k.y) };
    }
  });
}

/** The line an alignment goes by, to be drawn before the row is chosen: the key's edge or centre
 *  line, across the whole selection. `axis` is the axis the line is PERPENDICULAR to — an "x" guide
 *  is a vertical line at x = `at`, running from `from` to `to` in y. */
export interface AlignGuide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

/**
 * Where יישור will put things, as one line on the plan: the key's left/centre/right (or top/middle/
 * bottom) line, spanning the selection's extent on the other axis with a margin so the line reads
 * as a line and not as a side of the key. Null for a distribution, which goes by no single line.
 */
export function alignGuide(boxes: readonly CentredBox[], key: number, op: AlignOp, marginMm = 400): AlignGuide | null {
  if (needsThree(op)) return null;
  const k = boxes[key] ?? boxes[0];
  if (!k) return null;
  const all = unionOf(boxes);
  if (op === "left" || op === "hcenter" || op === "right") {
    const at = op === "left" ? k.x - k.widthMm / 2 : op === "right" ? k.x + k.widthMm / 2 : k.x;
    return { axis: "x", at, from: all.y - all.depthMm / 2 - marginMm, to: all.y + all.depthMm / 2 + marginMm };
  }
  const at = op === "top" ? k.y - k.depthMm / 2 : op === "bottom" ? k.y + k.depthMm / 2 : k.y;
  return { axis: "y", at, from: all.x - all.widthMm / 2 - marginMm, to: all.x + all.widthMm / 2 + marginMm };
}

/** The box round several boxes — a group's, as one unit. */
export function unionOf(boxes: readonly CentredBox[]): CentredBox {
  const minX = Math.min(...boxes.map((b) => b.x - b.widthMm / 2));
  const maxX = Math.max(...boxes.map((b) => b.x + b.widthMm / 2));
  const minY = Math.min(...boxes.map((b) => b.y - b.depthMm / 2));
  const maxY = Math.max(...boxes.map((b) => b.y + b.depthMm / 2));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, widthMm: maxX - minX, depthMm: maxY - minY };
}

/** The units a selection aligns as: each loose thing on its own, each group as one, in the order
 *  the selection names them (so "the first selected" is the first unit). */
export function alignUnits<T extends { box: CentredBox; groupId?: string; key: string }>(
  items: readonly T[],
): { key: string; members: T[]; box: CentredBox }[] {
  const units = new Map<string, T[]>();
  for (const it of items) {
    const k = it.groupId ? `group:${it.groupId}` : it.key;
    units.set(k, [...(units.get(k) ?? []), it]);
  }
  return [...units].map(([key, members]) => ({ key, members, box: unionOf(members.map((m) => m.box)) }));
}
