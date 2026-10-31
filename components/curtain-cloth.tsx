// A curtain's cloth on a plan, along whatever line it hangs on — a straight wall's or a bowed
// one's. The venue's own curtain (lib/venues/curtain.ts curtainPieces) and a sketch's hired drape
// (lib/studio/anchor.ts resolveSpan) both draw through here, so a drape swapped in for the venue's
// curtain on a curved wall follows the same curve. The pleats are DrapePleats' own wave
// (components/item-symbol.tsx), walked along the line instead of a straight x axis.
import { memo } from "react";
import type { Point } from "@/lib/studio/hall";
import type { CurtainPiece } from "@/lib/venues/curtain";

const PLEAT_MM = 150;

/** The pleats' path along a polyline: one quadratic wave per ~15cm, swinging ±0.56 of the band's
 *  depth either side of the line — on a straight line exactly DrapePleats' drawing. */
export function pleatsAlongD(line: Point[], depthMm: number): string {
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

function DrapePleatsAlongView({ line, depthMm, ink = "var(--color-ink)", opacity = 0.35 }: { line: Point[]; depthMm: number; ink?: string; opacity?: number }) {
  return <path d={pleatsAlongD(line, depthMm)} fill="none" stroke={ink} strokeOpacity={opacity} strokeWidth={1} vectorEffect="non-scaling-stroke" className="pointer-events-none" />;
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
}: {
  pieces: CurtainPiece[];
  depthMm: number;
  fill: string;
  fillOpacity?: number;
  ink: string;
  opacity: number;
}) {
  return (
    <>
      {pieces.map((pc, i) => (
        <g key={i}>
          <path d={polygonD(pc.band)} fill={fill} fillOpacity={fillOpacity} />
          <DrapePleatsAlong line={pc.line} depthMm={depthMm} ink={ink} opacity={opacity} />
        </g>
      ))}
    </>
  );
}
export const CurtainCloth = memo(CurtainClothView);
