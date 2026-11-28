// The overall size of each room, drawn the way a plan says it: a line with witness lines at both
// ends and the figure reading along it. Not a caption -- a dimension is part of the drawing, and a
// crew measures off it.
//
// ONLY the overall width and depth are automatic. Aisle widths, setbacks and the distance between
// two chosen tables are dimensions a designer PLACES, which is a drawing tool and its own field on
// the document; see the spec's "deliberately not built".
import type { Point } from "@/lib/studio/hall";

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
