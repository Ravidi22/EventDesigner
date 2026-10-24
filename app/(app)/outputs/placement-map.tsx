import Link from "next/link";
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { placementLegend } from "@/lib/outputs/aggregate";
import { productName } from "@/lib/outputs/lookup";
import { outlinePathD, pointAtDistance, wallEndpoints, wallLengthMm } from "@/lib/studio/geometry";
import { shellBounds, shellOutline, type ZoneShell } from "@/lib/venues/zone";
import { resolveStyle } from "@/lib/element-style";

const num = (n: number) => (n === 0 ? "ראש" : String(n));

// Compress a sorted list of table numbers into ranges: [1,2,3,5] → "1–3, 5".
function formatTables(nums: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(i === j ? num(nums[i]) : `${num(nums[i])}–${num(nums[j])}`);
    i = j + 1;
  }
  return parts.join(", ");
}

export function PlacementMap({ doc, hall }: { doc: DesignDocumentContent; hall: ZoneShell }) {
  const legend = placementLegend(doc, productName);
  const pad = 800;
  // Was a bare width×height rectangle, which quietly printed an L-shaped room as a box. The plan
  // is the client-facing deliverable, so it draws the real outline; the extra bottom padding still
  // leaves room for the legend beneath.
  const outline = shellOutline(hall);
  const box = shellBounds(hall);
  const vb = `${box.minX - pad} ${box.minY - pad} ${box.widthMm + pad * 2} ${box.heightMm + pad + 1400}`;

  return (
    <div className="space-y-8">
      <svg viewBox={vb} className="w-full rounded-lg border border-border bg-canvas" role="img" aria-label="מפת הצבה">
        {/* Walls */}
        {outline.length >= 3 && (
          <path d={outlinePathD(outline, hall.edgeCurves)} fill="#ffffff" stroke="#1b1725" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
        {/* Entrances — position resolved from the wall it's cut into */}
        {outline.length >= 3 && hall.entrances.map((e) => {
          const { a, b } = wallEndpoints(outline, e.wallIndex);
          const len = wallLengthMm(a, b) || 1;
          const ux = (b.x - a.x) / len;
          const uy = (b.y - a.y) / len;
          const center = pointAtDistance(a, b, e.distanceMm);
          const half = e.widthMm / 2;
          return (
            <g key={e.id}>
              <line
                x1={center.x - ux * half}
                y1={center.y - uy * half}
                x2={center.x + ux * half}
                y2={center.y + uy * half}
                stroke="#ffffff"
                strokeWidth={4}
                vectorEffect="non-scaling-stroke"
              />
              <text x={center.x} y={center.y + 950} textAnchor="middle" fontSize={520} fontFamily="Assistant, sans-serif" fill="#7c7889">
                כניסה
              </text>
            </g>
          );
        })}
        {/* Columns */}
        {hall.columns.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.rMm} fill="#f0eef5" stroke="#4a4658" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        ))}
        {/* Near-fixed shell elements (stage, bars) — outline + label, B&W-safe */}
        {[hall.stage, ...hall.bars].filter((f): f is NonNullable<typeof f> => Boolean(f)).map((f) => {
          const resolved = resolveStyle(f.style, "monochrome", { fill: "#f0eef5", stroke: "#4a4658", strokeWidth: 1.25 });
          return (
            <g key={f.id}>
              <rect
                x={f.x - f.widthMm / 2}
                y={f.y - f.depthMm / 2}
                width={f.widthMm}
                height={f.depthMm}
                fill={resolved.fill}
                stroke={resolved.stroke}
                strokeWidth={resolved.strokeWidth}
                strokeDasharray={resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined}
                vectorEffect="non-scaling-stroke"
              />
              <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={520} fontFamily="Assistant, sans-serif" fill="#4a4658">
                {f.label}
              </text>
            </g>
          );
        })}
        {/* Tables */}
        {doc.tables.map((t) => (
          <TableGlyph key={t.id} t={t} />
        ))}
      </svg>

      {/* Legend: שולחן ← ערכת עיצוב */}
      <section>
        <h3 className="mb-2 border-b border-ink pb-1 text-base font-semibold text-ink">מקרא</h3>
        <dl className="divide-y divide-border">
          {legend.map((e, i) => (
            <div key={i} className="flex items-baseline gap-3 break-inside-avoid py-2 text-sm">
              <dt className="nums w-40 shrink-0 font-semibold text-ink">
                {e.tableNumbers.length === 1 ? `שולחן ${num(e.tableNumbers[0])}` : `שולחנות ${formatTables(e.tableNumbers)}`}
              </dt>
              <dd className="text-ink-soft">
                {e.items.length > 0 ? e.items.join(" · ") : <span className="text-muted">ללא עיצוב</span>}
              </dd>
            </div>
          ))}
        </dl>
        {legend.every((e) => e.items.length === 0) && (
          <p className="mt-4 text-sm text-muted">
            עדיין לא שובצו פריטים.{" "}
            <Link href="/studio" className="font-medium text-accent hover:text-accent-hover">
              חזרה לסטודיו →
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

function TableGlyph({ t }: { t: DesignTable }) {
  const ink = "#1b1725";
  const resolved = resolveStyle(t.style, "monochrome", { fill: "#ffffff", stroke: ink, strokeWidth: 1.5 });
  const dash = resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined;
  return (
    <g>
      {t.diameterMm ? (
        <circle cx={t.position.x} cy={t.position.y} r={t.diameterMm / 2} fill={resolved.fill} stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
      ) : (
        <rect
          x={t.position.x - (t.widthMm ?? 0) / 2}
          y={t.position.y - (t.depthMm ?? 0) / 2}
          width={t.widthMm ?? 0}
          height={t.depthMm ?? 0}
          rx={80}
          fill={resolved.fill}
          stroke={resolved.stroke}
          strokeWidth={resolved.strokeWidth}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <text
        x={t.position.x}
        y={t.position.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={620}
        fontWeight={600}
        fontFamily="Assistant, sans-serif"
        fill={ink}
      >
        {t.number > 0 ? t.number : "ראש"}
      </text>
    </g>
  );
}
