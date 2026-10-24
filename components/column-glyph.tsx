import { memo } from "react";
import { featureFootprint, type StructureFeature } from "@/lib/venues/structure";
import { columnOf } from "@/lib/venues/column";
import { FootprintShape } from "@/components/footprint-shape";

/** A COLUMN from above (lib/venues/column.ts), in the feature's own frame: its plinth (the
 *  footprint), the base ring round the shaft's foot, and the shaft — the three outlines a venue
 *  used to draw as three features stacked on one centre, now one element. Square pieces turn with
 *  the plinth (the caller's rotated group). The one drawing /halls, the sketch, the add-element
 *  card and both printed looks use.
 *
 *  Takes the pointer through the plinth, like any feature outline: a column is small and solid, so
 *  the whole footprint is the hit area. */
export const ColumnGlyph = memo(function ColumnGlyph({
  f,
  fill,
  stroke,
  strokeWidth,
  dash,
  baseFill = "#ffffff",
  shaftFill = "#ece7dc",
  fillOpacity,
}: {
  f: Pick<StructureFeature, "column" | "shape" | "widthMm" | "depthMm" | "outline" | "edgeCurves" | "arc" | "ring">;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  baseFill?: string;
  shaftFill?: string;
  fillOpacity?: number;
}) {
  const parts = columnOf(f);
  const line = { stroke, strokeWidth, vectorEffect: "non-scaling-stroke" as const };
  const piece = (across: number, paint: string) =>
    parts.square ? (
      <rect x={-across / 2} y={-across / 2} width={across} height={across} fill={paint} {...line} />
    ) : (
      <circle r={across / 2} fill={paint} {...line} />
    );
  return (
    <>
      {parts.plinth ? (
        <FootprintShape footprint={featureFootprint(f)} fill={fill} fillOpacity={fillOpacity} strokeDasharray={dash} {...line} />
      ) : null}
      {parts.baseMm ? piece(parts.baseMm, baseFill) : null}
      {piece(parts.shaftMm, parts.plinth ? shaftFill : fill)}
    </>
  );
});
