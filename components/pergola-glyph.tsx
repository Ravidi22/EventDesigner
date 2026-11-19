import { memo } from "react";
import type { Point } from "@/lib/studio/hall";
import type { Footprint } from "@/lib/studio/footprint";
import { latticeTicks, pergolaGeometry, pergolaRoofLines, postSquare, type Pergola } from "@/lib/venues/pergola";
import { sameFootprint } from "./footprint-shape";

/** A PERGOLA from above (lib/venues/pergola.ts), in its footprint's own frame and millimetres: the
 *  outline in a light line, a filled square at every post, the roof across them — slats as thin
 *  lines at their spacing, a solid deck as a faint hatch, a stretched cloth as dashed diagonals
 *  over a wash of its colour, nothing for beams only — and a closed side as a hatched band, a
 *  post deep, along it. The one drawing /halls, the sketch (the venue's and a hired one alike), the
 *  catalog's item drawing, the add card and both printed looks use. It writes no name: the posts
 *  and the slats say what it is.
 *
 *  The geometry is in mm, read off the footprint as drawn — a 6 × 4 keeps its 15cm posts and 30cm
 *  slats — and every line is non-scaling, so its weight is the caller's: screen px on a canvas, the
 *  sheet's on paper (`strokeWidth`), and dashes in the same units, as a feature's outline is dashed.
 *
 *  It takes no pointer, except through its posts when `hitPosts` is set: tables stand under a
 *  pergola, and a press anywhere inside it belongs to them. The caller adds the band along the
 *  outline that picks it up (venue-plan's FeatureNode, canvas-stage's PlacementNode). */
export const PergolaGlyph = memo(function PergolaGlyph({
  footprint,
  pergola,
  stroke,
  strokeWidth = 1,
  strokeOpacity = 1,
  postFill,
  fabric,
  hitPosts = false,
}: PergolaGlyphProps) {
  const g = pergolaGeometry(footprint, pergola);
  if (!g) return null;
  const line = { stroke, strokeOpacity, strokeWidth, fill: "none", vectorEffect: "non-scaling-stroke" as const };
  const poly = (pts: readonly Point[]) => `M ${pts.map((p) => `${r(p.x)} ${r(p.y)}`).join(" L ")} Z`;
  const segs = (ls: readonly [Point, Point][]) => ls.map(([a, b]) => `M ${r(a.x)} ${r(a.y)} L ${r(b.x)} ${r(b.y)}`).join(" ");
  const roof = segs(pergolaRoofLines(g));
  const lattice = segs((g.spec.closedSides ?? []).flatMap((i) => (g.sides[i] ? latticeTicks(g.sides[i]) : [])));
  const kind = g.spec.roof;
  return (
    <g>
      <g className="pointer-events-none">
        {kind === "fabric" && <path d={poly(g.ring)} fill={fabric ?? postFill} fillOpacity={0.16} stroke="none" />}
        {roof && (
          <path
            d={roof}
            {...line}
            strokeOpacity={strokeOpacity * (kind === "solid" ? 0.22 : kind === "fabric" ? 0.5 : 0.42)}
            strokeWidth={strokeWidth * 0.75}
            strokeDasharray={kind === "fabric" ? "6 4" : undefined}
          />
        )}
        {lattice && <path d={lattice} {...line} strokeOpacity={strokeOpacity * 0.55} strokeWidth={strokeWidth * 0.75} />}
        <path d={poly(g.outline)} {...line} strokeOpacity={strokeOpacity * 0.55} />
      </g>
      <g className={hitPosts ? undefined : "pointer-events-none"}>
        {g.posts.map((p, i) => (
          <path key={i} d={poly(postSquare(p, g.postMm))} fill={postFill} stroke={stroke} strokeOpacity={strokeOpacity} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </g>
  );
}, samePergolaProps);

export interface PergolaGlyphProps {
  footprint: Footprint;
  pergola: Pergola;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  /** The posts' fill: the drawing's darkest thing, so they read as solid. */
  postFill: string;
  /** A cloth roof's colour (washed under its diagonals). Absent = the post fill. */
  fabric?: string;
  /** Whether the posts take the pointer (an unselected pergola is picked up by them and its band). */
  hitPosts?: boolean;
}

/** Two decimals is a hundredth of a millimetre — more than any plan shows, and a shorter `d`. */
const r = (v: number) => Math.round(v * 100) / 100;

/** The memo's comparison: the footprint and the spec by value (both are rebuilt on every read). */
function samePergolaProps(a: PergolaGlyphProps, b: PergolaGlyphProps): boolean {
  return (
    sameFootprint(a.footprint, b.footprint) &&
    samePergola(a.pergola, b.pergola) &&
    a.stroke === b.stroke &&
    a.strokeWidth === b.strokeWidth &&
    a.strokeOpacity === b.strokeOpacity &&
    a.postFill === b.postFill &&
    a.fabric === b.fabric &&
    a.hitPosts === b.hitPosts
  );
}

function samePergola(a: Pergola, b: Pergola): boolean {
  if (a === b) return true;
  const ca = a.closedSides ?? [];
  const cb = b.closedSides ?? [];
  const pa = a.posts ?? [];
  const pb = b.posts ?? [];
  return (
    a.postMm === b.postMm &&
    (a.legs ?? "auto") === (b.legs ?? "auto") &&
    pa.length === pb.length &&
    pa.every((q, i) => q.side === pb[i].side && q.t === pb[i].t) &&
    a.roof === b.roof &&
    a.slatDirectionDeg === b.slatDirectionDeg &&
    a.slatSpacingMm === b.slatSpacingMm &&
    ca.length === cb.length &&
    ca.every((v, i) => v === cb[i])
  );
}
