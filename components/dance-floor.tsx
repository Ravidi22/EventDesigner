// A DANCE FLOOR on a plan (רחבת ריקודים — the built-in kit, spec 2026-11-07 §2): its panels at their
// real size (lib/catalog/dance-floor.ts — 61cm, so the grid is true at every zoom), every other one a
// shade off the floor's own colour, a fine seam between each, and a thin aluminium trim round its
// edge. Laid as a rug is — so it follows a rug's bowed sides and rounded corners (`shape`), or the
// outline it was laid to over a surface or a stage (`footprint` + `holes`, lib/studio/cover.ts).
//
// Drawn over the floor's own fill by the callers that lay it (the canvas's CarpetNode, the printed
// map), and with its fill (`base`) by ItemSymbol for the card and the drag image. Memoised by value
// (sameDrawProps): the canvas re-renders every node on each settled zoom.
import { memo } from "react";
import type { Point } from "@/lib/studio/hall";
import { evenInset, footprintOutlines, type Footprint } from "@/lib/studio/footprint";
import { outlinePathD } from "@/lib/studio/geometry";
import { rugInset, rugOutline, type RugShape } from "@/lib/studio/rug-shape";
import { danceFloorGrid, danceFloorRings, DANCE_TRIM_MM } from "@/lib/catalog/dance-floor";
import { isDark } from "@/lib/element-style";
import { sameDrawProps } from "./footprint-shape";

/** The trim's brushed aluminium. */
const TRIM = "#C9CBD1";

function ringD(r: readonly Point[]): string {
  return r.length < 3 ? "" : `M ${r.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
}

function DanceFloorView({
  w,
  h,
  shape,
  footprint,
  holes,
  tone,
  ink = "var(--color-ink)",
  print,
  base,
}: {
  /** The rectangle it is laid as (its stretched size), about its centre. */
  w: number;
  h: number;
  /** Bowed sides and rounded corners (Placement.bows / corners). */
  shape?: RugShape;
  /** Laid to an outline (carpetFootprint) — in place of the rectangle; `holes` cut through it. */
  footprint?: Footprint;
  holes?: readonly (readonly Point[])[];
  /** The floor's colour (its shade, its row's fill; in print the sheet's flat grey). */
  tone?: string;
  ink?: string;
  /** Ink on paper: the trim white, the seams the sheet's ink. */
  print?: boolean;
  /** Fill the floor itself too — for a caller that has not (a card, a drag image). */
  base?: boolean;
}) {
  if (!(w > 0 && h > 0) && !footprint) return null;
  const rings = danceFloorRings(w, h, { shape, footprint, holes });
  const grid = danceFloorGrid(rings);
  // The outline as drawn — curves kept — and the trim's inner edge, the same outline pulled in.
  const outlines = footprint ? footprintOutlines(footprint).filter((o) => !o.open) : shape ? [rugOutline(w, h, shape)] : null;
  const outer = outlines ? outlines.map((o) => outlinePathD(o.outline, o.edgeCurves)).join(" ") : `M ${-w / 2} ${-h / 2} H ${w / 2} V ${h / 2} H ${-w / 2} Z`;
  const trimMm = Math.min(DANCE_TRIM_MM, Math.min(w, h) / 20);
  const inner = footprint
    ? footprintOutlines(footprint)
        .filter((o) => !o.open)
        .map((o) => evenInset(o, trimMm))
        .map((o) => (o ? outlinePathD(o.outline, o.edgeCurves) : ""))
        .join(" ")
    : shape
      ? (() => {
          const o = rugInset(w, h, shape, trimMm);
          return o ? outlinePathD(o.outline, o.edgeCurves) : "";
        })()
      : `M ${-w / 2 + trimMm} ${-h / 2 + trimMm} H ${w / 2 - trimMm} V ${h / 2 - trimMm} H ${-w / 2 + trimMm} Z`;
  const holesD = (holes ?? []).map(ringD).join(" ");
  const dark = !!tone && isDark(tone);
  // The other panel: lighter on a dark floor, darker on a light one — the gloss catching it.
  const altFill = dark ? "#ffffff" : "#000000";
  const altOpacity = print ? 0.1 : dark ? 0.1 : 0.07;
  const seamInk = dark && !print ? "#ffffff" : ink;
  const line = { fill: "none", vectorEffect: "non-scaling-stroke" as const };
  return (
    <g className="pointer-events-none">
      {base && <path d={`${outer} ${holesD}`} fill={tone ?? "#F5F3F8"} fillRule="evenodd" stroke={ink} strokeOpacity={print ? 1 : 0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      {grid.alt.length > 0 && <path d={grid.alt.map(ringD).join(" ")} fill={altFill} fillOpacity={altOpacity} fillRule="evenodd" />}
      {grid.seams.length > 0 && (
        <path d={grid.seams.map(([a, b]) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`).join(" ")} {...line} stroke={seamInk} strokeOpacity={print ? 0.45 : 0.22} strokeWidth={0.6} />
      )}
      {/* The trim: a band between the edge and the edge pulled in, its inner line a hair of ink. */}
      {inner && <path d={`${outer} ${inner}`} fill={print ? "#ffffff" : TRIM} fillOpacity={print ? 1 : 0.9} fillRule="evenodd" />}
      {inner && <path d={inner} {...line} stroke={ink} strokeOpacity={print ? 0.6 : 0.3} strokeWidth={0.6} />}
    </g>
  );
}

export const DanceFloorPattern = memo(DanceFloorView, sameDrawProps);
