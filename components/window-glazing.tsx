// The plan symbol for a WINDOW in a wall (StructureEntrance.kind === "window"): the glazing drawn
// across the opening the wall has already been cut for — the glass as a thin line down the middle
// of the wall's thickness, the frame as a line either side of it, and a jamb tick at each end. The
// classic architectural mark, and the opposite of a door's: nothing swings, so nothing sweeps into
// the room. Drawn on every surface that draws the property — the hall editor (inside EntranceDoor's
// handle), the sketch and both printed looks — from the same two points the door's gap is cut
// between, so the glass is always exactly in its opening, bow and all.
//
// Sized by the caller in ITS millimetres (`offsetMm`: screen px through `mm()` on a canvas, printed
// mm through the sheet's denominator on paper), never in room mm — a 6cm band is invisible at 1:500
// and a wall's width at 1:20.
import type { Point } from "@/lib/studio/hall";

export function WindowGlazing({
  a,
  b,
  offsetMm,
  stroke = "currentColor",
  strokeWidth = 1,
  glassWidth = strokeWidth,
  className,
}: {
  /** The jambs — where the opening starts and ends along the wall. */
  a: Point;
  b: Point;
  /** How far either side of the wall's line the frame lines sit. */
  offsetMm: number;
  stroke?: string;
  strokeWidth?: number;
  /** The glass line's own weight — a hair finer than the frame's in print. */
  glassWidth?: number;
  className?: string;
}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6 || offsetMm <= 0) return null;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const off = (p: Point, k: number) => ({ x: p.x + nx * offsetMm * k, y: p.y + ny * offsetMm * k });
  const line = (p: Point, q: Point, w: number, key: string, dash?: string) => (
    <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={w} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
  );
  return (
    <g className={className} fill="none">
      {line(off(a, 1), off(b, 1), strokeWidth, "f1")}
      {line(off(a, -1), off(b, -1), strokeWidth, "f2")}
      {line(a, b, glassWidth, "glass")}
      {line(off(a, 1.6), off(a, -1.6), strokeWidth, "ja")}
      {line(off(b, 1.6), off(b, -1.6), strokeWidth, "jb")}
    </g>
  );
}
