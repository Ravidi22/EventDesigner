import type { ReactNode } from "react";
import { BILLIARD_POCKET, BILLIARD_WOOD, billiardLayout } from "@/lib/catalog/game-tables";

/** A BILLIARD TABLE from above (lib/catalog/game-tables.ts), `w` × `h` about its centre: the wooden
 *  rails, the cloth in its shade, six pockets, the sights on the rails, the head string dashed
 *  across the cloth and the foot spot. On paper the rails are white, the cloth the sheet's tone and
 *  every line ink. Takes no pointer. */
export function billiardSymbol(w: number, h: number, opts: { cloth: string; print?: boolean; ink: string; inkOpacity?: number }): ReactNode {
  if (w <= 0 || h <= 0) return null;
  const { cloth, print = false, ink, inkOpacity = 0.6 } = opts;
  const t = billiardLayout(w, h);
  const line = { stroke: ink, strokeOpacity: print ? 1 : inkOpacity, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  const wood = print ? "#ffffff" : BILLIARD_WOOD;
  const pocket = print ? ink : BILLIARD_POCKET;
  const fine = Math.min(w, h) * 0.012;
  return (
    <g className="pointer-events-none">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={t.railMm * 0.35} fill={wood} {...line} />
      <rect x={-t.cloth.w / 2} y={-t.cloth.h / 2} width={t.cloth.w} height={t.cloth.h} fill={cloth} {...line} strokeOpacity={line.strokeOpacity * 0.7} />
      {t.sights.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={fine * 1.4} fill={print ? ink : "#efe6d2"} />
      ))}
      <line x1={t.headString[0].x} y1={t.headString[0].y} x2={t.headString[1].x} y2={t.headString[1].y} stroke={print ? ink : "#ffffff"} strokeOpacity={print ? 0.6 : 0.45} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <circle cx={t.footSpot.x} cy={t.footSpot.y} r={fine * 1.6} fill={print ? ink : "#ffffff"} fillOpacity={print ? 1 : 0.7} />
      {t.pockets.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={t.pocketMm} fill={pocket} />
      ))}
    </g>
  );
}
