// A free-standing flight of stairs or a ramp, drawn the way a plan draws one: its outline, a line
// for every step edge, and the walking line — a dot at the foot, an arrowhead at the head — that
// says which way is UP. A ramp has no step edges; its slope is written beside the arrow.
//
// ONE drawing for every surface (the hall editor and the sketch through components/venue-plan.tsx,
// the crew sheets and the client sketch through the printed placement map), told only its colours
// and weights — so the plan on screen and the plan on paper cannot disagree about where the steps
// go down. Drawn in the feature's own frame: the caller places and turns it, as for every feature.
import { memo } from "react";
import { FootprintShape } from "@/components/footprint-shape";
import { climbDrawing } from "@/lib/venues/climb";
import { featureFootprint, type StructureFeature } from "@/lib/venues/structure";

export type ClimbFeature = Pick<StructureFeature, "kind" | "shape" | "widthMm" | "depthMm" | "heightMm" | "arc" | "climb" | "outline" | "edgeCurves" | "ring">;

function ClimbGlyphView({
  f,
  fill,
  stroke,
  strokeWidth,
  lineWidth,
  ink,
  textSize,
  textFill,
  alertFill,
  turnDeg = 0,
  mirrored = false,
}: {
  f: ClimbFeature;
  fill: string;
  stroke: string;
  /** The outline's weight, in screen px (non-scaling). */
  strokeWidth: number;
  /** The step edges' and the walking line's weight. */
  lineWidth: number;
  /** The walking line, its dot and its arrowhead. */
  ink: string;
  /** The ramp's slope, in world mm. Absent = not written (a surface too far out to read it). */
  textSize?: number;
  textFill: string;
  /** The slope's ink when the ramp is steeper than 1:12. */
  alertFill: string;
  /** How far the caller turns the feature — so the slope, which runs along the walking line, is
   *  turned half round whenever the two turns together would print it upside down. */
  turnDeg?: number;
  /** …and whether it flips it across its width before turning it (a placed item's `mirrored`):
   *  the slope is flipped back about its own point, so it never prints as its mirror image. */
  mirrored?: boolean;
}) {
  const d = climbDrawing(f);
  const [tip, left, right] = d.arrow.head;
  // Seen through a mirror the line runs at −angle, and the words are turned to lie along that.
  const along = (mirrored ? -1 : 1) * (d.slope?.angleDeg ?? 0);
  // Upright, and a vertical one reads UP the line, as the sheet's dimension figures do.
  const onScreen = (((turnDeg + along) % 360) + 360) % 360;
  const textDeg = along + (onScreen >= 90 && onScreen < 270 ? 180 : 0);
  const at = d.slope?.at ?? { x: 0, y: 0 };
  const textTransform = mirrored
    ? `translate(${at.x} ${at.y}) scale(-1 1) rotate(${textDeg}) translate(${-at.x} ${-at.y})`
    : `rotate(${textDeg} ${at.x} ${at.y})`;
  return (
    <g>
      <FootprintShape footprint={featureFootprint(f)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      {d.treads.map((path, i) => (
        <path key={i} d={path} fill="none" stroke={stroke} strokeWidth={lineWidth} vectorEffect="non-scaling-stroke" />
      ))}
      <g className="pointer-events-none">
        <circle cx={d.arrow.from.x} cy={d.arrow.from.y} r={d.arrow.dotR} fill={ink} />
        <line x1={d.arrow.from.x} y1={d.arrow.from.y} x2={d.arrow.to.x} y2={d.arrow.to.y} stroke={ink} strokeWidth={lineWidth} vectorEffect="non-scaling-stroke" />
        <path d={`M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`} fill={ink} />
        {d.slope && textSize !== undefined && (
          // On the line, in a halo of the ramp's own fill, so the arrow breaks round the words.
          <text
            transform={textTransform}
            x={d.slope.at.x}
            y={d.slope.at.y}
            textAnchor="middle"
            stroke={fill}
            strokeWidth={textSize * 0.4}
            strokeLinejoin="round"
            paintOrder="stroke"
            dominantBaseline="central"
            direction="ltr"
            fontSize={textSize}
            fontWeight={600}
            fontFamily="Assistant, sans-serif"
            fill={d.slope.tooSteep ? alertFill : textFill}
          >
            {/* The ⚠ as well as the ink: on a black-and-white sheet the ink is the same black, and
                the printed figures flag a tight gap the same way. */}
            {d.slope.tooSteep ? `⚠ ${d.slope.text}` : d.slope.text}
          </text>
        )}
      </g>
    </g>
  );
}

export const ClimbGlyph = memo(ClimbGlyphView);
