// The overall size of each room, drawn the way a plan says it: a line with witness lines at both
// ends and the figure reading along it. Not a caption -- a dimension is part of the drawing, and a
// crew measures off it.
//
// ONLY the overall width and depth are automatic. Aisle widths, setbacks and the distance between
// two chosen tables are dimensions a designer PLACES, which is a drawing tool and its own field on
// the document; see the spec's "deliberately not built".
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

export interface DimensionLine {
  from: Point;
  to: Point;
  /** Metres to two decimals — what a plan is figured in. */
  label: string;
  /** How far off the drawing the line sits, in world mm; sign says which side. */
  offsetMm: number;
}

const metres = (mm: number) => `${(mm / 1000).toFixed(2)}`;

/** The width along the bottom and the depth up one side, from a zone's bounding box. A boundary
 *  with no area gets nothing — there is no room to figure. */
export function overallDimensions(boundary: Point[], offsetMm = 900): DimensionLine[] {
  if (boundary.length < 3) return [];
  const xs = boundary.map((p) => p.x);
  const ys = boundary.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX - minX < 1 || maxY - minY < 1) return [];
  return [
    { from: { x: minX, y: maxY }, to: { x: maxX, y: maxY }, label: metres(maxX - minX), offsetMm },
    { from: { x: maxX, y: minY }, to: { x: maxX, y: maxY }, label: metres(maxY - minY), offsetMm },
  ];
}

// ponytail: self-check. Run: npm run check:dimensions
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const square: Point[] = [
    { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 8000 }, { x: 0, y: 8000 },
  ];
  const d = overallDimensions(square);
  assert(d.length === 2, "a room is figured on two sides");
  assert(d[0].label === "12.00" && d[1].label === "8.00", "a 12x8m hall is figured 12.00 and 8.00");
  assert(d[0].from.y === 8000 && d[0].to.y === 8000, "the width runs along one edge, not through the room");
  assert(overallDimensions([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length === 0, "two points are not a room");
  assert(overallDimensions([]).length === 0, "nothing is not a room either");

  // An L-shape is figured on its bounding box, which is what "overall" means.
  const ell: Point[] = [
    { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 }, { x: 4000, y: 4000 },
    { x: 4000, y: 9000 }, { x: 0, y: 9000 },
  ];
  const e = overallDimensions(ell);
  assert(e[0].label === "10.00" && e[1].label === "9.00", "an L-shaped hall is figured on its overall extent");
  console.log("dimensions self-check passed");
}
