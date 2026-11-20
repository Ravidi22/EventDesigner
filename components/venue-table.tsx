"use client";

import { memo, useMemo } from "react";
import { FootprintShape } from "@/components/footprint-shape";
import { SeatChairs } from "@/components/seat-sides-picker";
import { footprintBounds } from "@/lib/studio/footprint";
import { labelAnchor } from "@/lib/studio/label-anchor";
import { seatsAround } from "@/lib/studio/seating";
import { featureFootprint, type StructureFeature } from "@/lib/venues/structure";

/** A TABLE OF THE VENUE'S DEFAULT LAYOUT (lib/venues/venue-table.ts) as /halls draws it, in the
 *  feature's own frame (the caller's place-and-turn group): its outline, its chairs round it as the
 *  sketch lays them (lib/studio/seating.ts), and its number at the shape's visual centre, turned back
 *  upright. Takes no pointer — the caller's footprint is the hit area. */
export const VenueTableGlyph = memo(function VenueTableGlyph({ feature, selected }: { feature: StructureFeature; selected?: boolean }) {
  const footprint = useMemo(() => featureFootprint(feature), [feature]);
  const seats = useMemo(() => seatsAround(footprint, feature.table?.seats ?? 0), [footprint, feature.table?.seats]);
  const at = useMemo(() => labelAnchor(footprint), [footprint]);
  const b = footprintBounds(footprint);
  // True scale, no more than half the short side: a number about a table's size, as the sketch's.
  const size = Math.max(120, Math.min(450, Math.min(b.w, b.h) * 0.4));
  const n = feature.table?.number;
  return (
    <g className="pointer-events-none">
      <SeatChairs seats={seats} />
      <FootprintShape
        footprint={footprint}
        fill={feature.style?.fill ?? "var(--color-surface)"}
        stroke={selected ? "var(--color-accent)" : "var(--color-ink-soft)"}
        strokeWidth={selected ? 2 : 1.25}
        vectorEffect="non-scaling-stroke"
      />
      {n ? (
        <text
          x={at.x}
          y={at.y}
          transform={feature.rotationDeg ? `rotate(${-feature.rotationDeg} ${at.x} ${at.y})` : undefined}
          textAnchor="middle"
          dominantBaseline="central"
          direction="ltr"
          fill={selected ? "var(--color-accent-deep)" : "var(--color-ink-soft)"}
          fontWeight={600}
          style={{ fontSize: size }}
        >
          {n}
        </text>
      ) : null}
    </g>
  );
});
