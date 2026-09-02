import type { DesignTable } from "@/lib/design-document/types";
import { resolve } from "@/lib/studio/catalog-resolver";
import { customShapeBounds, resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import { outlinePathD } from "@/lib/studio/geometry";

// The one place a catalog footprint turns into SVG. Three surfaces draw the same shapes — the
// studio canvas, the drag image that leaves the rail, and the placement map the crew is handed on
// paper — and a half-round table that is an arc on screen and a rounded box in print is the plan
// disagreeing with itself in front of the people setting the room up.
//
// No "use client": it is a pure function of its props with no hooks and no handlers, so it renders
// wherever it is used.

type ShapeProps = Omit<React.SVGProps<SVGPathElement>, "d" | "ref">;

/** The dash pattern for anything overhead, in world millimetres — 12cm on, 9cm off, which reads as
 *  a dashed line from a whole-hall zoom down to one table. The architectural convention for
 *  something above the cut plane, and the reason a ceiling plan is legible when it is photocopied
 *  in black and white: an overhead item and a floor item cannot be told apart by fill alone. */
export const OVERHEAD_DASH = "120 90";

/** A footprint centred on (0,0) in its own local frame — the caller's <g> carries the position,
 *  rotation and scale. Custom outlines are translated so their bounding-box centre sits at (0,0),
 *  so all four kinds share that frame. */
export function FootprintShape({
  footprint,
  overhead,
  ...common
}: { footprint: Footprint; overhead?: boolean } & ShapeProps) {
  // Overhead items are drawn, never filled: the convention says the thing is above you, and a
  // filled shape reads as something you would walk around. This has to be enforced HERE, not left
  // to each caller, and it has to win over whatever fill/dash the caller passes — this is the one
  // seam all three surfaces (studio canvas, catalog drag image, printed placement map) share, and a
  // convention that a caller can opt out of by simply passing its usual `fill` is not a convention,
  // it is a suggestion. `od` therefore spreads AFTER `common` below, so it overrides rather than
  // being overridden. When `overhead` is false `od` is `undefined` and spreading it is a no-op, so
  // the ordinary path is unaffected — this only changes what happens when a caller opts in.
  const od = overhead
    ? { fill: "none", strokeDasharray: OVERHEAD_DASH, vectorEffect: "non-scaling-stroke" as const }
    : undefined;
  const props = { ...common, ...od };
  if (footprint.kind === "circle") {
    return <circle r={footprint.diameterMm / 2} {...(props as React.SVGProps<SVGCircleElement>)} />;
  }
  if (footprint.kind === "ellipse") {
    return <ellipse rx={footprint.widthMm / 2} ry={footprint.depthMm / 2} {...(props as React.SVGProps<SVGEllipseElement>)} />;
  }
  if (footprint.kind === "custom") {
    const b = customShapeBounds(footprint.outline);
    const centered = footprint.outline.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy }));
    return <path d={outlinePathD(centered, footprint.edgeCurves)} {...props} />;
  }
  const { widthMm: w, depthMm: d } = footprint;
  // Square corners. A rect footprint is a MEASUREMENT — a stage is a run of 100×200 modules, a
  // trestle table is a board — and the 6% radius this used to carry rounded 6cm off each corner of
  // a 2×1m deck on a true-scale plan for no reason but softness. The plan is the thing the crew
  // sets the room up from; the shapes on it are the shapes in the room.
  return <rect x={-w / 2} y={-d / 2} width={w} height={d} {...(props as React.SVGProps<SVGRectElement>)} />;
}

/** The shape a table is drawn as. A table dragged off the rail carries its catalog row, so it draws
 *  the item's REAL outline — a חצי עיגול is an arc over a chord, not the 120×60 box its dimensions
 *  describe. One placed before tables came out of the catalog has no row, and falls back to the
 *  circle-or-rectangle its own dimensions describe, exactly as it always drew. */
export function tableFootprint(table: DesignTable): Footprint {
  const product = table.variantId ? resolve(table.variantId)?.product : undefined;
  if (product) return resolveFootprint(product);
  if (table.diameterMm) return { kind: "circle", diameterMm: table.diameterMm };
  return { kind: "rect", widthMm: table.widthMm ?? 0, depthMm: table.depthMm ?? 0 };
}
