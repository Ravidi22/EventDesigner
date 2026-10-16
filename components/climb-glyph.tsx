// A free-standing flight of stairs or a ramp, drawn the way a plan draws one: its outline, a line
// for every step edge, and the walking line — a dot at the foot, an arrowhead at the head — that
// says which way is UP. A ramp has no step edges; its slope is written beside the arrow.
//
// ONE drawing for every surface (the hall editor and the sketch through components/venue-plan.tsx,
// the crew sheets and the client sketch through the printed placement map), told only its colours
// and weights — so the plan on screen and the plan on paper cannot disagree about where the steps
// go down. Drawn in the feature's own frame: the caller places and turns it, as for every feature.
//
// The walking line is its own component (WalkingLine), because a STAGE's flights and ramps wear the
// same one: the stage lays its own steps (lib/design-document/stage.ts edgeItemShape) and hands the
// line it worked out to this picture, so a flight built onto a stage and a rented flight standing
// beside it read alike — the user asked for exactly that, having seen the catalog's drawing.
import { memo } from "react";
import { FootprintShape } from "@/components/footprint-shape";
import { climbDrawing, type ClimbArrow, type ClimbSlope } from "@/lib/venues/climb";
import { featureFootprint, type StructureFeature } from "@/lib/venues/structure";

export type ClimbFeature = Pick<StructureFeature, "kind" | "shape" | "widthMm" | "depthMm" | "heightMm" | "arc" | "climb" | "outline" | "edgeCurves" | "ring">;

export interface WalkingLineProps {
  arrow: ClimbArrow;
  /** A ramp's slope, written on the line. Absent on stairs. */
  slope?: ClimbSlope;
  /** The walking line, its dot and its arrowhead. */
  ink: string;
  /** The line's weight, in screen px (non-scaling). */
  lineWidth: number;
  /** The fill the line lies on — the slope's halo, so the arrow breaks round the words. */
  fill: string;
  /** The slope's size, in world mm. Absent = not written (a surface too far out to read it). */
  textSize?: number;
  textFill: string;
  /** The slope's ink when the ramp is steeper than 1:12. */
  alertFill: string;
  /** How far the caller turns the drawing — so the slope, which runs along the walking line, is
   *  turned half round whenever the two turns together would print it upside down. */
  turnDeg?: number;
  /** …and whether it flips it across its width before turning it (a placed item's `mirrored`):
   *  the slope is flipped back about its own point, so it never prints as its mirror image. */
  mirrored?: boolean;
}

/** The walking line of a climb — a dot at the foot, the line, a filled arrowhead at the head — and
 *  a ramp's slope on it, upright. In whatever frame the arrow was worked out in. */
function WalkingLineView({ arrow, slope, ink, lineWidth, fill, textSize, textFill, alertFill, turnDeg = 0, mirrored = false }: WalkingLineProps) {
  const [tip, left, right] = arrow.head;
  // Seen through a mirror the line runs at −angle, and the words are turned to lie along that.
  const along = (mirrored ? -1 : 1) * (slope?.angleDeg ?? 0);
  // Upright, and a vertical one reads UP the line, as the sheet's dimension figures do.
  const onScreen = (((turnDeg + along) % 360) + 360) % 360;
  const textDeg = along + (onScreen >= 90 && onScreen < 270 ? 180 : 0);
  const at = slope?.at ?? { x: 0, y: 0 };
  const textTransform = mirrored
    ? `translate(${at.x} ${at.y}) scale(-1 1) rotate(${textDeg}) translate(${-at.x} ${-at.y})`
    : `rotate(${textDeg} ${at.x} ${at.y})`;
  return (
    <g className="pointer-events-none">
      <circle cx={arrow.from.x} cy={arrow.from.y} r={arrow.dotR} fill={ink} />
      <line x1={arrow.from.x} y1={arrow.from.y} x2={arrow.to.x} y2={arrow.to.y} stroke={ink} strokeWidth={lineWidth} vectorEffect="non-scaling-stroke" />
      <path d={`M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`} fill={ink} />
      {slope && textSize !== undefined && (
        // On the line, in a halo of the ramp's own fill, so the arrow breaks round the words.
        <text
          transform={textTransform}
          x={slope.at.x}
          y={slope.at.y}
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
          fill={slope.tooSteep ? alertFill : textFill}
        >
          {/* The ⚠ as well as the ink: on a black-and-white sheet the ink is the same black, and
              the printed figures flag a tight gap the same way. */}
          {slope.tooSteep ? `⚠ ${slope.text}` : slope.text}
        </text>
      )}
    </g>
  );
}

export const WalkingLine = memo(WalkingLineView);

/** The size a ramp's slope is written at when the surface sets none: what fits the ramp itself,
 *  across it and along it, in the drawing's mm. */
export const slopeTextSize = (widthMm: number, depthMm: number): number => Math.min(widthMm * 0.24, depthMm * 0.3);

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
  return (
    <g>
      <FootprintShape footprint={featureFootprint(f)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      {d.treads.map((path, i) => (
        <path key={i} d={path} fill="none" stroke={stroke} strokeWidth={lineWidth} vectorEffect="non-scaling-stroke" />
      ))}
      <WalkingLine arrow={d.arrow} slope={d.slope} ink={ink} lineWidth={lineWidth} fill={fill} textSize={textSize} textFill={textFill} alertFill={alertFill} turnDeg={turnDeg} mirrored={mirrored} />
    </g>
  );
}

export const ClimbGlyph = memo(ClimbGlyphView);
