import type { DesignTable } from "@/lib/design-document/types";
import { outlinePathD, pointAtDistance } from "@/lib/studio/geometry";
import { shellBounds, shellOutline, type ZoneShell } from "@/lib/venues/zone";
import { resolveStyle } from "@/lib/element-style";

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
  hall: ZoneShell;
  tables: DesignTable[];
  statusOf?: (t: DesignTable) => TableStatus;
  showFixedElements?: boolean; // off in the hall structure editor, which renders its own draggable markers for entrances/stage/bars instead
  className?: string;
}) {
  const pad = PLAN_PAD_MM;
  const stroke = 55;
  // Framed off the resolved outline rather than a stored width×height, so a zone drawn out on a
  // venue plane is centred by its own minX/minY instead of being hung off the origin.
  const outline = shellOutline(hall);
  const box = shellBounds(hall);
  return (
    <svg
      viewBox={`${box.minX - pad} ${box.minY - pad} ${box.widthMm + pad * 2} ${box.heightMm + pad * 2}`}
      className={`h-auto w-full ${className}`}
      role="img"
      aria-label="תרשים האולם"
    >
      {outline.length >= 3 && (
        <path d={outlinePathD(outline, hall.edgeCurves)} fill="none" className="text-border" stroke="currentColor" strokeWidth={stroke} />
      )}
      {/* Doors are plain openings: overpaint the wall stretch in the background colour so it reads
          as a hole. ponytail: thumbnail scale — the erase line is the straight chord, close enough
          across a gentle bow. */}
      {showFixedElements && outline.length >= 3 && hall.entrances.map((e) => {
        const a = outline[e.wallIndex];
        const b = outline[(e.wallIndex + 1) % outline.length];
        if (!a || !b) return null;
        const half = e.widthMm / 2;
        const gapStart = pointAtDistance(a, b, e.distanceMm - half);
        const gapEnd = pointAtDistance(a, b, e.distanceMm + half);
        return (
          <line key={e.id} x1={gapStart.x} y1={gapStart.y} x2={gapEnd.x} y2={gapEnd.y} className="text-canvas" stroke="currentColor" strokeWidth={stroke * 1.4} vectorEffect="non-scaling-stroke" />
        );
      })}
      {hall.columns.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.rMm} className="text-muted" fill="currentColor" fillOpacity={0.5} />
      ))}
      {showFixedElements && [hall.stage, ...hall.bars].filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => {
        const shape = f.shape ?? "rect";
        // "currentColor" is the pass-through default: with no style set, resolveStyle hands it
        // straight back and the wrapping className still drives it exactly as before. This markup
        // draws in raw hall-mm (no vector-effect, so it scales with the thumbnail) — a custom
        // style switches to non-scaling-stroke so its pixel width/dash mean the same thing however
        // large the thumbnail renders.
        const resolved = resolveStyle(f.style, "screen", { fill: "currentColor", fillOpacity: 0.12, stroke: "currentColor", strokeWidth: stroke });
        const shared = {
          className: "text-muted",
          stroke: resolved.stroke,
          strokeWidth: resolved.strokeWidth,
          fill: resolved.fill,
          fillOpacity: resolved.fillOpacity,
          strokeDasharray: resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined,
          vectorEffect: f.style ? ("non-scaling-stroke" as const) : undefined,
        };
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
        const label = t.number > 0 ? String(t.number) : "ראש";
        // Approval status is a temporary review signal and always wins over the table's own
        // style — pending/rejected must stay visually unmistakable during import review. Once
        // approved (or with no review in progress, the common case), the designer's own colour
        // shows through the same "currentColor" pass-through as the fixtures above.
        const resolved = resolveStyle(t.style, "screen", { fill: "currentColor", fillOpacity: 0.06, stroke: "currentColor", strokeWidth: stroke });
        const common =
          status === "approved"
            ? {
                className: "text-accent",
                stroke: resolved.stroke,
                strokeWidth: resolved.strokeWidth,
                fill: resolved.fill,
                fillOpacity: resolved.fillOpacity,
                strokeDasharray: resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined,
                vectorEffect: t.style ? ("non-scaling-stroke" as const) : undefined,
                opacity: 1,
              }
            : {
                className: status === "rejected" ? "text-muted" : "text-ink-soft",
                stroke: "currentColor",
                strokeWidth: stroke,
                fill: "currentColor",
                fillOpacity: 0.06,
                strokeDasharray: status === "rejected" ? stroke * 2 : stroke * 1.5,
                vectorEffect: undefined,
                opacity: status === "rejected" ? 0.4 : 1,
              };
        return (
          <g key={t.id}>
            {t.diameterMm ? (
              <circle cx={t.position.x} cy={t.position.y} r={t.diameterMm / 2} {...common} />
            ) : (
              <rect x={t.position.x - (t.widthMm ?? 2000) / 2} y={t.position.y - (t.depthMm ?? 1000) / 2} width={t.widthMm ?? 2000} height={t.depthMm ?? 1000} {...common} />
            )}
            <text x={t.position.x} y={t.position.y} textAnchor="middle" dominantBaseline="central" className={common.className} fill="currentColor" fillOpacity={common.opacity} style={{ fontSize: 620, fontWeight: 600 }}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
