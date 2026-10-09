import { useId, type ReactNode } from "react";
import { fitScale, scaleBarSteps, type Extent } from "@/lib/outputs/scale";
import type { PlanSheet } from "@/lib/outputs/sheets";
import { OVERHEAD_DASH } from "@/components/footprint-shape";

// THE DRAFTING FRAME. Every plan sheet — hall, ceiling, stage, chairs — is drawn inside this one
// component, so the border, the title block, the graphic scale bar and the north point are defined
// once and cannot drift between five sheets that each happen to remember them slightly differently.
//
// The mechanism is the one lib/outputs/scale.ts documents: this whole component is laid out in real
// millimetres. The outer <svg>'s width/height are set in mm (never a percentage — that is what turns
// a drawing into a picture of a drawing), its viewBox spans the same paper-mm numbers, and the
// `children` — the actual drawing, authored in WORLD millimetres with its own origin at (0,0) — sits
// inside a <g scale(1/denominator)>. One mm of paper is then exactly `denominator` mm of room, on
// screen and out of the printer.
//
// Black and white only: every stroke below is ink-black or a grey tint of it, and the three <pattern>
// defs this component owns (hatch-diagonal, hatch-cross, dot-ghost) are how a designer's element
// style reads on a photocopy — a hue does not survive one, a hatch does.

/** CSS px per printed millimetre. `vector-effect: non-scaling-stroke` computes the stroke in the
 *  VIEWPORT coordinate system, deliberately ignoring the viewBox transform — so a strokeWidth is
 *  px on paper whatever the viewBox says, and a number authored as millimetres has to be converted
 *  or it silently comes out 3.78x too thin. It did: every line on this sheet was a quarter of its
 *  stated weight, and the 0.18mm annotation landed under one dot at 600dpi. */
const MM = 96 / 25.4;

/** Line weights in PRINTED millimetres. Paired with vectorEffect="non-scaling-stroke", so they stay
 *  constant as the scale changes — a 0.6mm wall is 0.6mm at 1:20 and at 1:500, which is the whole
 *  point of a weight hierarchy. */
export const LINE_WEIGHTS = {
  wall: 0.6 * MM,
  feature: 0.35 * MM,
  furniture: 0.25 * MM,
  annotation: 0.18 * MM,
  overhead: 0.25 * MM,
} as const;

const INK = "#1b1725";
const INK_SOFT = "#4a4658";
const MUTED = "#7c7889";
const HAIRLINE = "#c7c4d1";

/** A4 portrait — the sensible default when a caller has not decided on a sheet yet. */
const DEFAULT_PAPER: Extent = { widthMm: 210, heightMm: 297 };
/** Matches `@page { margin: 16mm }` in globals.css — the printed border sits on the same line the
 *  printer itself leaves blank. */
const DEFAULT_MARGIN_MM = 16;

/** Height of the bottom strip: the ruled title-block cells plus the graphic-scale band above them. */
const TITLE_CELLS_MM = 20;
const SCALE_BAND_MM = 11;
const TITLE_BLOCK_MM = TITLE_CELLS_MM + SCALE_BAND_MM;
/** The north arrow sits over the drawing's top-end corner. There used to be a 46mm side column for
 *  it and the legend, reserved on every sheet that had either — a fifth of an A4's width spent on a
 *  box holding two swatches, while the plan beside it dropped a whole scale step to fit what was
 *  left. The legend now runs along the scale band (which was empty but for the bar), so the drawing
 *  gets the full width of the frame. */
const NORTH_BOX_MM = 18;
/** Legend layout along the scale band, in paper mm. */
const SWATCH_MM = 4;
const LEGEND_FONT_MM = 2.8;

/** The legend's "overhead" swatch is a few millimetres wide, not a whole plan — OVERHEAD_DASH's 120/90
 *  world-mm pair is reused at the same on:off ratio, scaled down to fit, rather than a second dash
 *  pattern invented just for this box. */
const OVERHEAD_SWATCH_DASH = OVERHEAD_DASH.split(" ")
  .map(Number)
  .map((n) => (n / 120) * 1.6)
  .join(" ");

export type LegendSwatch = "hatch-diagonal" | "hatch-cross" | "dot-ghost" | "solid" | "outline" | "overhead";

export interface LegendRow {
  label: string;
  swatch: LegendSwatch;
}

export interface SheetFrameProps {
  /** The drawing's own extent, in world millimetres — feeds `fitScale`. */
  world: Extent;
  /** Paper trim, in millimetres. Defaults to A4 portrait. */
  paper?: Extent;
  marginMm?: number;
  sheet: PlanSheet;
  /** Venue and event — the title block's widest cell. */
  title: string;
  /** Client name, appended to `title` in the same cell. */
  subtitle?: string;
  studio?: string;
  sheetNumber: number;
  sheetCount: number;
  version: number;
  date: string;
  /** Degrees clockwise from "up the page" that true north points. Omitted (the ordinary case, until
   *  a venue plan states one) draws no arrow at all — a guessed north is worse than none. */
  north?: number;
  legend?: LegendRow[];
  /** The drawing itself, authored in world millimetres with its bounding box's top-left at (0,0).
   *  A function receives the fitted denominator, so text inside the drawing can be sized in PRINTED
   *  millimetres: a table number authored in room millimetres is 6mm tall at 1:100 and a 1mm smudge
   *  at 1:500, and the crew reads the page, not the room. */
  children: ReactNode | ((denominator: number) => ReactNode);
}

const trim = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return String(r);
};

export function SheetFrame({
  world,
  paper = DEFAULT_PAPER,
  marginMm = DEFAULT_MARGIN_MM,
  sheet,
  title,
  subtitle,
  studio,
  sheetNumber,
  sheetCount,
  version,
  date,
  north,
  legend,
  children,
}: SheetFrameProps) {
  const rows = legend ?? [];
  const clipId = `sheet-clip-${useId().replace(/:/g, "")}`;

  // The usable frame: paper, minus the printed margin on every edge, minus the bottom strip.
  const frame: Extent = {
    widthMm: Math.max(0, paper.widthMm - marginMm * 2),
    heightMm: Math.max(0, paper.heightMm - marginMm * 2 - TITLE_BLOCK_MM),
  };
  const { denominator, paperMm } = fitScale(world, frame);
  const scale = 1 / denominator;
  // Centred in whichever axis the fitted drawing doesn't fill.
  const drawX = marginMm + Math.max(0, (frame.widthMm - paperMm.widthMm) / 2);
  const drawY = marginMm + Math.max(0, (frame.heightMm - paperMm.heightMm) / 2);

  const titleTop = paper.heightMm - marginMm - TITLE_CELLS_MM;
  const barTop = titleTop - SCALE_BAND_MM;
  const left = marginMm;
  const right = paper.widthMm - marginMm;

  // The graphic scale bar: bottom-start (the sheet's start edge — the right, in this RTL app), and
  // reading "0" at that end, nearest the edge a Hebrew reader starts from. Budgeted independently of
  // the drawing's own width — a small room's drawing should not get a scale bar sized to match it.
  // Inset off the border so the "0" over its last tick does not sit on the frame line.
  const { metres, steps } = scaleBarSteps(denominator, Math.min(60, frame.widthMm || 60));
  const barTotalMm = (metres * 1000) / denominator;
  const barRight = right - 3;
  const barLeft = barRight - barTotalMm;
  const stepMm = barTotalMm / steps;

  // The legend, laid start to end (right to left) along the band after the bar: a swatch, then its
  // label on the swatch's end side. Widths are estimated — SVG has no text measurement before paint
  // — at a generous Hebrew glyph average, so items never collide; one that would run off the frame
  // is dropped rather than drawn over the border.
  const laidLegend: (LegendRow & { swatchX: number; textX: number; fits: boolean })[] = [];
  for (let i = 0, cursor = barLeft - 10; i < rows.length; i++) {
    const swatchX = cursor - SWATCH_MM;
    const textX = swatchX - 1.6;
    cursor = textX - rows[i].label.length * LEGEND_FONT_MM * 0.55 - 6;
    laidLegend.push({ ...rows[i], swatchX, textX, fits: cursor > left });
  }

  // Seven ruled cells, laid out start (right) to end (left) in the order they are read.
  const cells: { weight: number; label: string; value: string }[] = [
    { weight: 1.6, label: "מקום ולקוח", value: subtitle ? `${title} · ${subtitle}` : title },
    { weight: 1, label: "שם הגיליון", value: sheet.label },
    { weight: 0.7, label: "גיליון", value: `${sheetNumber} / ${sheetCount}` },
    { weight: 0.7, label: "קנה מידה", value: `1:${denominator}` },
    { weight: 0.9, label: "תאריך", value: date },
    { weight: 0.7, label: "גרסה", value: `גרסה ${version}` },
    { weight: 1, label: "סטודיו", value: studio ?? "" },
  ];
  const cellUnit = (right - left) / cells.reduce((s, c) => s + c.weight, 0);
  let cursor = right;
  const laidCells = cells.map((c) => {
    const w = c.weight * cellUnit;
    const x = cursor - w;
    cursor -= w;
    return { ...c, x, w };
  });

  const northX = left + 3;
  const northY = marginMm + 3;

  return (
    <svg
      width={`${paper.widthMm}mm`}
      height={`${paper.heightMm}mm`}
      viewBox={`0 0 ${paper.widthMm} ${paper.heightMm}`}
      role="img"
      aria-label={`${sheet.label} — 1:${denominator}`}
    >
      <defs>
        {/* The drawing stops at the frame. The whole property travels with every plan (the event's
            zone is FRAMED, not cut out), and unclipped its far walls ran past the border, through
            the margin and across the title block. The clip is the whole frame rather than just the
            fitted drawing, so the leftover space on the slack axis shows the property around the
            room rather than a white band. */}
        <clipPath id={clipId}>
          <rect x={left} y={marginMm} width={frame.widthMm} height={frame.heightMm} />
        </clipPath>
        {/* Each pattern is emitted TWICE, at two tile sizes. `userSpaceOnUse` tiles in whatever
            space the filled shape lives in: the drawing is inside a `<g>` scaled to world
            millimetres, where a 300mm tile is the right hatch spacing for a room — but a legend
            swatch is 5 PAPER millimetres, and a 300mm tile inside it renders as one blank corner
            of a tile, i.e. a plain white box. The `-sw` set is the same pattern at 1/60th, which
            is what makes the key legible. */}
        {hatchDefs("", 1)}
        {hatchDefs("-sw", 1 / 60)}
      </defs>

      {/* The border — the drafting frame's printed edge, one line inside the paper margin. */}
      <rect
        x={left}
        y={marginMm}
        width={right - left}
        height={paper.heightMm - marginMm * 2}
        fill="none"
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.feature}
        vectorEffect="non-scaling-stroke"
      />

      {/* The drawing itself — world millimetres, scaled to the sheet's fitted denominator. Callers
          draw walls, tables, hatched features and dashed overhead items in here, all authored at
          real-world size; this is the one place that size becomes a stated, printed scale. */}
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${drawX} ${drawY}) scale(${scale})`}>{typeof children === "function" ? children(denominator) : children}</g>
      </g>

      {/* North arrow — top-end, and only when the venue plan actually states an orientation. */}
      {north !== undefined && (
        <g transform={`translate(${northX + NORTH_BOX_MM / 2} ${northY + NORTH_BOX_MM / 2}) rotate(${north})`}>
          <line x1={0} y1={NORTH_BOX_MM / 2 - 1} x2={0} y2={-(NORTH_BOX_MM / 2 - 1)} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
          <path
            d={`M 0 ${-(NORTH_BOX_MM / 2 - 1)} L 2.6 ${-(NORTH_BOX_MM / 2 - 5)} L 0 ${-(NORTH_BOX_MM / 2 - 7)} L -2.6 ${-(NORTH_BOX_MM / 2 - 5)} Z`}
            fill={INK}
          />
          <text x={0} y={NORTH_BOX_MM / 2 + 3.6} textAnchor="middle" fontSize={3} fontFamily="Assistant, sans-serif" fill={MUTED}>
            צפון
          </text>
        </g>
      )}

      {/* The legend — along the scale band, start to end after the bar. Text is right-anchored
          explicitly (direction="rtl", anchor "start"): the side-column version inherited RTL from
          the page and drew every label leftwards out of its own box, over its swatch. */}
      {laidLegend.length > 0 && (
        <g>
          {laidLegend.map((r, i) =>
            r.fits ? (
              <g key={i}>
                <LegendSwatchGlyph swatch={r.swatch} x={r.swatchX} y={barTop + 1.6} size={SWATCH_MM} />
                <text
                  x={r.textX}
                  y={barTop + 1.6 + SWATCH_MM / 2}
                  direction="rtl"
                  textAnchor="start"
                  dominantBaseline="central"
                  fontSize={LEGEND_FONT_MM}
                  fontFamily="Assistant, sans-serif"
                  fill={INK_SOFT}
                >
                  {r.label}
                </text>
              </g>
            ) : null,
          )}
        </g>
      )}

      {/* The graphic scale bar — drawn as well as stated, so a photocopy at the wrong percentage is
          still readable with a ruler even though the "1:denominator" cell below it is now lying. */}
      <g>
        {Array.from({ length: steps }).map((_, i) => (
          <rect
            key={i}
            x={barRight - (i + 1) * stepMm}
            y={barTop + 2}
            width={stepMm}
            height={2.4}
            fill={i % 2 === 0 ? INK : "#ffffff"}
            stroke={INK}
            strokeWidth={LINE_WEIGHTS.annotation}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {Array.from({ length: steps + 1 }).map((_, i) => {
          const x = barRight - i * stepMm;
          const figure = trim((i * metres) / steps);
          return (
            <g key={i}>
              <line x1={x} y1={barTop} x2={x} y2={barTop + 2} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
              <text x={x} y={barTop - 0.8} textAnchor="middle" fontSize={2.4} fontFamily="Assistant, sans-serif" fill={MUTED} className="nums">
                {i === steps ? `${figure} מ׳` : figure}
              </text>
            </g>
          );
        })}
      </g>

      {/* The title block — hairline-ruled cells along the bottom edge. */}
      <g>
        <line x1={left} y1={titleTop} x2={right} y2={titleTop} stroke={INK} strokeWidth={LINE_WEIGHTS.feature} vectorEffect="non-scaling-stroke" />
        {laidCells.map((c, i) => (
          <g key={i}>
            {i > 0 && (
              <line x1={c.x + c.w} y1={titleTop} x2={c.x + c.w} y2={titleTop + TITLE_CELLS_MM} stroke={HAIRLINE} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
            )}
            <text x={c.x + c.w / 2} y={titleTop + 4.4} textAnchor="middle" fontSize={2.3} fontFamily="Assistant, sans-serif" fill={MUTED}>
              {c.label}
            </text>
            <text x={c.x + c.w / 2} y={titleTop + 10.5} textAnchor="middle" fontSize={3.4} fontWeight={600} fontFamily="Assistant, sans-serif" fill={INK} className="nums">
              {c.value}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** The three fill patterns, at a given tile scale. See the note at the `<defs>` that calls this. */
function hatchDefs(suffix: string, k: number) {
  return (
    <>
      {/* A stage: 45° diagonal ink on white. */}
      <pattern id={`hatch-diagonal${suffix}`} patternUnits="userSpaceOnUse" width={300 * k} height={300 * k} patternTransform="rotate(45)">
        <rect width={300 * k} height={300 * k} fill="#ffffff" />
        <line x1={150 * k} y1={-50 * k} x2={150 * k} y2={350 * k} stroke={INK} strokeWidth={22 * k} />
      </pattern>
      {/* A pool: ink cross-hatched on white. */}
      <pattern id={`hatch-cross${suffix}`} patternUnits="userSpaceOnUse" width={280 * k} height={280 * k}>
        <rect width={280 * k} height={280 * k} fill="#ffffff" />
        <line x1={0} y1={140 * k} x2={280 * k} y2={140 * k} stroke={INK} strokeWidth={18 * k} />
        <line x1={140 * k} y1={0} x2={140 * k} y2={280 * k} stroke={INK} strokeWidth={18 * k} />
      </pattern>
      {/* A ghosted table: a sparse grey half-tone, not a hue, so a photocopy still shows it as
          de-emphasised rather than as a different colour that turns flat grey anyway. */}
      <pattern id={`dot-ghost${suffix}`} patternUnits="userSpaceOnUse" width={260 * k} height={260 * k}>
        <rect width={260 * k} height={260 * k} fill="#ffffff" />
        <circle cx={130 * k} cy={130 * k} r={20 * k} fill={HAIRLINE} />
      </pattern>
    </>
  );
}

function LegendSwatchGlyph({ swatch, x, y, size = 5 }: { swatch: LegendSwatch; x: number; y: number; size?: number }) {
  if (swatch === "overhead") {
    return <line x1={x} y1={y + size / 2} x2={x + size} y2={y + size / 2} stroke={INK} strokeWidth={LINE_WEIGHTS.overhead} strokeDasharray={OVERHEAD_SWATCH_DASH} vectorEffect="non-scaling-stroke" />;
  }
  const fill =
    swatch === "solid" ? INK : swatch === "outline" ? "#ffffff" : `url(#${swatch}-sw)`;
  return (
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      fill={fill}
      stroke={INK}
      strokeWidth={LINE_WEIGHTS.annotation}
      vectorEffect="non-scaling-stroke"
    />
  );
}
