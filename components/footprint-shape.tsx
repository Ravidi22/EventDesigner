import type { DesignTable, Placement, Point } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import type { ElementStyle } from "@/lib/element-style";
import { resolve } from "@/lib/studio/catalog-resolver";
import { customShapeBounds, sizedFootprint, type Footprint } from "@/lib/studio/footprint";
import { outlinePathD } from "@/lib/studio/geometry";
import { labelAnchor } from "@/lib/studio/label-anchor";

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
  if (footprint.kind === "multi") {
    // One path per shape rather than one path of several subpaths: the parts are wound whichever
    // way their builders drew them, and under the nonzero rule two opposite windings overlapping
    // would cut a hole where the round end meets the counter.
    return (
      <g>
        {footprint.parts.map((p, i) => (
          <path key={i} d={outlinePathD(p.outline, p.edgeCurves)} {...props} />
        ))}
      </g>
    );
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
/** The sides of a table nobody sits at — the table's own override when it has one (a table pushed
 *  against a wall on THIS plan), the catalog row's otherwise (a head table is always one-sided).
 *  An empty override is an answer too: "this one is open all round", whatever the catalog says. */
export function tableBlockedSides(table: DesignTable): number[] {
  if (table.blockedSides) return table.blockedSides;
  const product = table.variantId ? resolve(table.variantId)?.product : undefined;
  return product?.appearance?.blockedSides ?? [];
}

export function tableFootprint(table: DesignTable): Footprint {
  const product = table.variantId ? resolve(table.variantId)?.product : undefined;
  // At the size it was stretched to, when its catalog row allows that (Product.resize) — the
  // chairs, the snap box and the printed map all read the table through here.
  if (product) return sizedFootprint(product, table.sizeMm);
  if (table.diameterMm) return { kind: "circle", diameterMm: table.diameterMm };
  return { kind: "rect", widthMm: table.widthMm ?? 0, depthMm: table.depthMm ?? 0 };
}

/** Where a table's number is written, in plan millimetres: the shape's own label point
 *  (lib/studio/label-anchor.ts — its centre on a rectangle or a round, the middle of the band on an
 *  arc) carried through the same flip and turn the table is drawn with, so the number on paper sits
 *  where it sits on screen, whichever way the arc is facing. The studio canvas does the same thing
 *  inside the table's own <g> (TableNode); this is for a surface that writes the number outside it. */
export function tableLabelPoint(table: DesignTable): Point {
  const a = labelAnchor(tableFootprint(table));
  const x = table.mirrored ? -a.x : a.x; // MIRROR_TRANSFORM is scale(-1 1), applied before the turn
  const rad = ((table.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: table.position.x + x * cos - a.y * sin, y: table.position.y + x * sin + a.y * cos };
}

/** The shape a placed item is drawn with — its catalog footprint, at the size it was stretched to
 *  when its row is resizable (Product.resize). Stretch items (a carpet) are drawn by their own node
 *  from `sizeMm` directly and never come through here. */
export function placementFootprint(placement: Placement): Footprint {
  // A stage is its own outline, whatever deck it was mostly built from (Placement.stage).
  if (placement.stage) return { kind: "custom", outline: placement.stage.outline };
  const product = resolve(placement.variantId)?.product;
  if (!product) return { kind: "rect", widthMm: 600, depthMm: 600 };
  return sizedFootprint(product, placement.sizeMm);
}

/** The look a catalog row gives its footprint on the plan — what the appearance editor's עיצוב panel
 *  set — under the override a placed table may carry of its own (DesignTable.style, from the studio's
 *  inspector). One merge, key by key, so every surface that draws the row reads the same thing. The
 *  studio canvas, the drag image that leaves the rail and the printed map all used to draw a row's
 *  SHAPE through this file and then ignore its colour, which left the catalog's own preview the only
 *  place a fill chosen there could ever be seen. Absent on both = the caller's own default look, so
 *  a row that was never styled draws exactly as it always did. */
export function productStyle(product: Product | undefined, override?: ElementStyle): ElementStyle | undefined {
  const merged: ElementStyle = { ...product?.appearance?.style, ...override };
  for (const k of Object.keys(merged) as (keyof ElementStyle)[]) if (merged[k] === undefined) delete merged[k];
  return Object.keys(merged).length ? merged : undefined;
}
