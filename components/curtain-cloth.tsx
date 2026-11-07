// A curtain's cloth on a plan, along whatever line it hangs on — a straight wall's or a bowed
// one's. The venue's own curtain (lib/venues/curtain.ts curtainPieces) and a sketch's hired drape
// (lib/studio/anchor.ts resolveSpan) both draw through here, so a drape swapped in for the venue's
// curtain on a curved wall follows the same curve. The pleats are DrapePleats' own wave
// (components/item-symbol.tsx), walked along the line instead of a straight x axis.
import { memo } from "react";
import type { Point } from "@/lib/studio/hall";
import type { CurtainPiece } from "@/lib/venues/curtain";
import type { CurtainStyle } from "@/lib/catalog/symbols";

const PLEAT_MM = 150;

/** How each curtain style is drawn along its line (spec 2026-11-07 §6.5): its pitch, how far the
 *  stroke swings off the line (a fraction of the band's depth), and the stroke's form — a wave
 *  either side (waves, ruffle, sheer), a zig-zag of sharp folds (pinch), or scallops all on one
 *  side (swag). `waves` is the one every drape always drew. */
const STYLE_DRAW: Record<CurtainStyle, { pitch: number; amp: number; form: "wave" | "zigzag" | "scallop" }> = {
  waves: { pitch: PLEAT_MM, amp: 0.28, form: "wave" },
  pinch: { pitch: 70, amp: 0.4, form: "zigzag" },
  sheer: { pitch: 600, amp: 0.06, form: "wave" },
  swag: { pitch: 700, amp: 0.3, form: "scallop" },
  ruffle: { pitch: 55, amp: 0.14, form: "wave" },
};

/** The pleats' path along a polyline: one quadratic wave per ~15cm, swinging ±0.56 of the band's
 *  depth either side of the line — on a straight line exactly DrapePleats' drawing. Another curtain
 *  style draws its own pitch and form (STYLE_DRAW); absent = waves. */
export function pleatsAlongD(line: Point[], depthMm: number, style?: CurtainStyle): string {
  if (style && style !== "waves") return styledPleatsD(line, depthMm, STYLE_DRAW[style] ?? STYLE_DRAW.waves);
  return wavesD(line, depthMm);
}

/** A walker along a polyline: the point `s` mm along it, and its unit tangent there. */
function walker(line: Point[]) {
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = cum[cum.length - 1];
  const at = (s: number) => {
    let i = 1;
    while (i < line.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
    const a = line[i - 1];
    const b = line[i];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: (b.x - a.x) / seg, ty: (b.y - a.y) / seg };
  };
  return { total, at };
}

function styledPleatsD(line: Point[], depthMm: number, draw: { pitch: number; amp: number; form: "wave" | "zigzag" | "scallop" }): string {
  if (line.length < 2) return "";
  const { total, at } = walker(line);
  if (total < 1) return "";
  const n = Math.max(2, Math.round(total / draw.pitch));
  const step = total / n;
  const amp = depthMm * draw.amp;
  let d = `M ${line[0].x} ${line[0].y}`;
  for (let i = 0; i < n; i++) {
    const m = at(i * step + step / 2);
    const e = at((i + 1) * step);
    if (draw.form === "zigzag") {
      // A sharp fold out and back to the line — a pinch pleat seen from above.
      const k = (i % 2 ? 1 : -1) * amp;
      d += ` L ${m.x - m.ty * k} ${m.y + m.tx * k} L ${e.x} ${e.y}`;
    } else {
      // A wave swings either side; a swag hangs every scallop the same way.
      const k = (draw.form === "scallop" ? 2 : i % 2 ? 2 : -2) * amp;
      d += ` Q ${m.x - m.ty * k} ${m.y + m.tx * k} ${e.x} ${e.y}`;
    }
  }
  return d;
}

function wavesD(line: Point[], depthMm: number): string {
  if (line.length < 2) return "";
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = cum[cum.length - 1];
  if (total < 1) return "";
  const at = (s: number) => {
    let i = 1;
    while (i < line.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
    const a = line[i - 1];
    const b = line[i];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: (b.x - a.x) / seg, ty: (b.y - a.y) / seg };
  };
  const n = Math.max(2, Math.round(total / PLEAT_MM));
  const step = total / n;
  const amp = depthMm * 0.28;
  let d = `M ${line[0].x} ${line[0].y}`;
  for (let i = 0; i < n; i++) {
    const m = at(i * step + step / 2);
    const e = at((i + 1) * step);
    const k = (i % 2 ? 2 : -2) * amp;
    d += ` Q ${m.x - m.ty * k} ${m.y + m.tx * k} ${e.x} ${e.y}`;
  }
  return d;
}

function DrapePleatsAlongView({ line, depthMm, ink = "var(--color-ink)", opacity = 0.35, style }: { line: Point[]; depthMm: number; ink?: string; opacity?: number; style?: CurtainStyle }) {
  return <path d={pleatsAlongD(line, depthMm, style)} fill="none" stroke={ink} strokeOpacity={opacity} strokeWidth={1} vectorEffect="non-scaling-stroke" className="pointer-events-none" />;
}
export const DrapePleatsAlong = memo(DrapePleatsAlongView);

export function polygonD(points: Point[]): string {
  return points.length ? `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")} Z` : "";
}

/** The venue curtain's pieces (in the feature's frame): each band in its cloth, pleated along its
 *  middle. */
function CurtainClothView({
  pieces,
  depthMm,
  fill,
  fillOpacity,
  ink,
  opacity,
  style,
}: {
  pieces: CurtainPiece[];
  depthMm: number;
  fill: string;
  fillOpacity?: number;
  ink: string;
  opacity: number;
  /** How the cloth is gathered (FeatureCurtain.style); absent = waves. */
  style?: CurtainStyle;
}) {
  return (
    <>
      {pieces.map((pc, i) => (
        <g key={i}>
          <path d={polygonD(pc.band)} fill={fill} fillOpacity={fillOpacity} />
          <DrapePleatsAlong line={pc.line} depthMm={depthMm} ink={ink} opacity={opacity} style={style} />
        </g>
      ))}
    </>
  );
}

/** A ROD's own marks (spec 2026-11-07 §6.2): the rod as a hairline along its path and a small filled
 *  square at each post — none under a cantilevered end, which is what tells a ר from an L. Sized in
 *  the caller's mm (the canvas passes a screen-steady size, print a printed one). */
function RodMarksView({ path, posts, postMm, ink = "var(--color-ink)" }: { path: Point[]; posts: Point[]; postMm: number; ink?: string }) {
  return (
    <g className="pointer-events-none">
      <polyline points={path.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke={ink} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {posts.map((q, i) => (
        <rect key={i} x={q.x - postMm / 2} y={q.y - postMm / 2} width={postMm} height={postMm} fill={ink} />
      ))}
    </g>
  );
}
export const RodMarks = memo(RodMarksView);
export const CurtainCloth = memo(CurtainClothView);
