import type { Hall } from "@/lib/studio/hall";
import type { DesignTable } from "@/lib/design-document/types";
import { outlinePathD, doorGeometry } from "@/lib/studio/geometry";

export type TableStatus = "approved" | "pending" | "rejected";

// Matches the viewBox padding below — exported so callers overlaying their own elements
// (the hall structure editor's draggable markers) can compute the same mm→px mapping.
export const PLAN_PAD_MM = 800;

// Schematic top-down plan: hall outline + columns + tables, drawn in millimetre coordinates.
// Shared by the hall-template preview and the import-review step. Colours carry status by stroke
// AND dash (never colour alone) so a rejected table still reads at a glance and in B&W.
// ponytail: schematic, not the source PDF — detection is mocked, so real pixels would just show
// canned tables floating off the real drawing. Swap for a pdf.js backdrop when detection is real.
export function PlanPreview({
  hall,
  tables,
  statusOf,
  showFixedElements = true,
  className = "",
}: {
  hall: Hall;
  tables: DesignTable[];
  statusOf?: (t: DesignTable) => TableStatus;
  showFixedElements?: boolean; // off in the hall structure editor, which renders its own draggable markers for entrances/stage/bars instead
  className?: string;
}) {
  const pad = PLAN_PAD_MM;
  const stroke = 55;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${hall.widthMm + pad * 2} ${hall.heightMm + pad * 2}`}
      className={`h-auto w-full ${className}`}
      role="img"
      aria-label="תרשים האולם"
    >
      {hall.outline && hall.outline.length >= 3 ? (
        <path d={outlinePathD(hall.outline, hall.edgeCurves)} fill="none" className="text-border" stroke="currentColor" strokeWidth={stroke} />
      ) : (
        <rect x={0} y={0} width={hall.widthMm} height={hall.heightMm} fill="none" className="text-border" stroke="currentColor" strokeWidth={stroke} />
      )}
      {/* ponytail: thumbnail scale — the door symbol overlays the wall line rather than cutting a
          true gap into it (see the interactive editor for the real gap+swing rendering). */}
      {showFixedElements && hall.outline && hall.outline.length >= 3 && hall.entrances.map((e) => {
        const a = hall.outline![e.wallIndex];
        const b = hall.outline![(e.wallIndex + 1) % hall.outline!.length];
        if (!a || !b) return null;
        const centroid = {
          x: hall.outline!.reduce((s, p) => s + p.x, 0) / hall.outline!.length,
          y: hall.outline!.reduce((s, p) => s + p.y, 0) / hall.outline!.length,
        };
        const door = doorGeometry(a, b, e.distanceMm, e.widthMm, e.swingInward, centroid, e.doubleDoor);
        return (
          <g key={e.id}>
            <line x1={door.gapStart.x} y1={door.gapStart.y} x2={door.gapEnd.x} y2={door.gapEnd.y} className="text-canvas" stroke="currentColor" strokeWidth={stroke * 1.4} vectorEffect="non-scaling-stroke" />
            {door.leaves.map((leaf, i) => (
              <g key={i}>
                <line x1={leaf.hinge.x} y1={leaf.hinge.y} x2={leaf.tip.x} y2={leaf.tip.y} className="text-accent" stroke="currentColor" strokeWidth={stroke} vectorEffect="non-scaling-stroke" />
                <path d={`M ${leaf.tip.x} ${leaf.tip.y} A ${leaf.lenMm} ${leaf.lenMm} 0 0 ${leaf.sweepFlag} ${leaf.arcTo.x} ${leaf.arcTo.y}`} fill="none" className="text-accent" stroke="currentColor" strokeWidth={stroke * 0.6} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </g>
        );
      })}
      {hall.columns.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.rMm} className="text-muted" fill="currentColor" fillOpacity={0.5} />
      ))}
      {showFixedElements && [hall.stage, ...hall.bars].filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => {
        const shape = f.shape ?? "rect";
        const shared = { className: "text-muted", stroke: "currentColor", strokeWidth: stroke, fill: "currentColor", fillOpacity: 0.12 };
        return (
          <g key={f.id}>
            {shape === "circle" ? (
              <circle cx={f.x} cy={f.y} r={f.widthMm / 2} {...shared} />
            ) : shape === "ellipse" ? (
              <ellipse cx={f.x} cy={f.y} rx={f.widthMm / 2} ry={f.depthMm / 2} {...shared} />
            ) : (
              <rect x={f.x - f.widthMm / 2} y={f.y - f.depthMm / 2} width={f.widthMm} height={f.depthMm} {...shared} />
            )}
            <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" className="text-ink-soft" fill="currentColor" style={{ fontSize: 560 }}>
              {f.label}
            </text>
          </g>
        );
      })}
      {tables.map((t) => {
        const status = statusOf?.(t) ?? "approved";
        const cls = status === "rejected" ? "text-muted" : status === "pending" ? "text-ink-soft" : "text-accent";
        const dash = status === "rejected" ? stroke * 2 : status === "pending" ? stroke * 1.5 : undefined;
        const opacity = status === "rejected" ? 0.4 : 1;
        const label = t.number > 0 ? String(t.number) : "ראש";
        const common = { className: cls, stroke: "currentColor", strokeWidth: stroke, fill: "currentColor", fillOpacity: 0.06, strokeDasharray: dash, opacity };
        return (
          <g key={t.id}>
            {t.diameterMm ? (
              <circle cx={t.position.x} cy={t.position.y} r={t.diameterMm / 2} {...common} />
            ) : (
              <rect x={t.position.x - (t.widthMm ?? 2000) / 2} y={t.position.y - (t.depthMm ?? 1000) / 2} width={t.widthMm ?? 2000} height={t.depthMm ?? 1000} {...common} />
            )}
            <text x={t.position.x} y={t.position.y} textAnchor="middle" dominantBaseline="central" className={cls} fill="currentColor" fillOpacity={opacity} style={{ fontSize: 620, fontWeight: 600 }}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
