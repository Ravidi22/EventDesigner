import Link from "next/link";
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { placementLegend } from "@/lib/outputs/aggregate";
import { productName } from "@/lib/outputs/lookup";
import { absoluteControlPoints, outlinePathD, pointAtDistance, wallLengthMm, wallSegmentD } from "@/lib/studio/geometry";
import type { EventPlan } from "@/lib/events/plan";
import { nodeMap, wallPoints } from "@/lib/venues/structure";
import { stairsGeometry } from "@/lib/venues/stairs";
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

export function PlacementMap({ doc, plan }: { doc: DesignDocumentContent; plan: EventPlan }) {
  const legend = placementLegend(doc, productName);
  const pad = 800;
  // Framed on the zones this event occupies. Walls, doors and features are all drawn from the venue
  // structure, and the frame is what keeps the rest of the property off the crew's page — an
  // adjacent room's wall crops at the edge instead of being special-cased out.
  const box = plan.bounds;
  const nodes = nodeMap(plan.structure);
  const vb = `${box.minX - pad} ${box.minY - pad} ${box.widthMm + pad * 2} ${box.heightMm + pad + 1400}`;

  return (
    <div className="space-y-8">
      <svg viewBox={vb} className="w-full rounded-lg border border-border bg-canvas" role="img" aria-label="מפת הצבה">
        {/* Zone floors — white ground for the rooms being set up */}
        {plan.zones
          .filter((r) => r.boundary.length >= 3)
          .map((r) => (
            <path key={r.zone.id} d={outlinePathD(r.boundary)} fill="#ffffff" stroke="none" />
          ))}
        {/* Walls. An "edge" (a terrace lip, a rim) prints lighter and dashed — never as something
            the crew would read as a wall they cannot carry a table through. */}
        {plan.structure.walls.map((w) => {
          const pts = wallPoints(plan.structure, w, nodes);
          if (!pts) return null;
          const isEdge = w.kind === "edge";
          const common = {
            fill: "none",
            stroke: isEdge ? "#7c7889" : "#1b1725",
            strokeWidth: isEdge ? 1 : 2,
            strokeDasharray: isEdge ? "220 160" : undefined,
            vectorEffect: "non-scaling-stroke" as const,
          };
          if (w.curve) {
            const { c1, c2 } = absoluteControlPoints(pts.a, pts.b, w.curve);
            return <path key={w.id} d={`M ${pts.a.x} ${pts.a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${pts.b.x} ${pts.b.y}`} {...common} />;
          }
          return <line key={w.id} x1={pts.a.x} y1={pts.a.y} x2={pts.b.x} y2={pts.b.y} {...common} />;
        })}
        {/* Doors — a gap struck through the wall, labelled */}
        {plan.structure.entrances.map((e) => {
          const wall = plan.structure.walls.find((w) => w.id === e.wallId);
          const pts = wall ? wallPoints(plan.structure, wall, nodes) : null;
          if (!pts) return null;
          const len = wallLengthMm(pts.a, pts.b) || 1;
          const centre = pointAtDistance(pts.a, pts.b, e.distanceMm);
          const half = e.widthMm / 2;
          return (
            <g key={e.id}>
              {/* Struck along the wall as drawn — on a bowed wall a straight chord would print the
                  gap beside the wall instead of through it. */}
              <path
                d={wallSegmentD(pts.a, pts.b, wall?.curve ?? null, Math.max(0, (e.distanceMm - half) / len), Math.min(1, (e.distanceMm + half) / len))}
                fill="none"
                stroke="#ffffff"
                strokeWidth={4}
                vectorEffect="non-scaling-stroke"
              />
              <text x={centre.x} y={centre.y + 950} textAnchor="middle" fontSize={520} fontFamily="Assistant, sans-serif" fill="#7c7889">
                כניסה
              </text>
            </g>
          );
        })}
        {/* Fixed features (pool, built stage, bar) — outline + label, B&W-safe */}
        {plan.structure.features.map((f) => {
          const resolved = resolveStyle(f.style, "monochrome", { fill: "#f0eef5", stroke: "#4a4658", strokeWidth: 1.25 });
          const common = {
            fill: resolved.fill,
            stroke: resolved.stroke,
            strokeWidth: resolved.strokeWidth,
            strokeDasharray: resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined,
            vectorEffect: "non-scaling-stroke" as const,
          };
          // Stairs are floor the crew cannot put a table on, so they print with the stage rather
          // than being screen-only chrome. World coordinates already, hence outside the rotation.
          const stairs = stairsGeometry(f);
          return (
            <g key={f.id}>
              {stairs && (
                <g>
                  <path d={outlinePathD(stairs.outline)} fill="#f7f6fa" stroke="#4a4658" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  {stairs.nosings.map(([p, q], i) => (
                    <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#4a4658" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              )}
              <g transform={`rotate(${f.rotationDeg} ${f.x} ${f.y})`}>
                {f.shape === "circle" ? (
                  <circle cx={f.x} cy={f.y} r={f.widthMm / 2} {...common} />
                ) : f.shape === "ellipse" ? (
                  <ellipse cx={f.x} cy={f.y} rx={f.widthMm / 2} ry={f.depthMm / 2} {...common} />
                ) : (
                  <rect x={f.x - f.widthMm / 2} y={f.y - f.depthMm / 2} width={f.widthMm} height={f.depthMm} {...common} />
                )}
                <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={520} fontFamily="Assistant, sans-serif" fill="#4a4658">
                  {f.label}
                </text>
              </g>
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
