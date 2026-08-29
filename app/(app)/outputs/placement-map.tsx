import Link from "next/link";
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { placementLegend } from "@/lib/outputs/aggregate";
import { numberedUnits } from "@/lib/design-document/groups";
import { productName } from "@/lib/outputs/lookup";
import { absoluteControlPoints, outlinePathD, pointAtDistance, wallLengthMm, wallSegmentD } from "@/lib/studio/geometry";
import type { EventPlan } from "@/lib/events/plan";
import { featureFootprint, nodeMap, wallPoints } from "@/lib/venues/structure";
import { stairsGeometry } from "@/lib/venues/stairs";
import { resolveStyle } from "@/lib/element-style";
import { FootprintShape, tableFootprint } from "@/components/footprint-shape";
import { arrangedStructure } from "@/lib/design-document/features";

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
  // The property AS THIS EVENT ARRANGED IT. The crew is handed this page to set a room up from, so a
  // bar the designer pushed across the floor has to be drawn where they pushed it — a map showing
  // the bar where the venue keeps it is a map of a room nobody is building. Walls, doors and zones
  // are the property's and are unchanged; only the features move (lib/design-document/features.ts).
  const structure = arrangedStructure(plan.structure, doc);
  const nodes = nodeMap(structure);
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
        {structure.walls.map((w) => {
          const pts = wallPoints(structure, w, nodes);
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
        {structure.entrances.map((e) => {
          const wall = structure.walls.find((w) => w.id === e.wallId);
          const pts = wall ? wallPoints(structure, wall, nodes) : null;
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
        {structure.features.map((f) => {
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
                {/* Same resolver the editor draws with (components/footprint-shape.tsx) — a ח bar
                    printed as a solid block is the crew told to fill the floor the staff stand in. */}
                <g transform={`translate(${f.x} ${f.y})`}>
                  <FootprintShape footprint={featureFootprint(f)} {...common} />
                </g>
                <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={520} fontFamily="Assistant, sans-serif" fill="#4a4658">
                  {f.label}
                </text>
              </g>
            </g>
          );
        })}
        {/* Tables, in the order the designer stacked them. Only tables are drawn on this page, so
            the whole floor stack is not needed — but two overlapping tables have to print the way
            they were arranged, or the crew lays the room from a picture of a different one.
            `order` is absent on everything nobody restacked, so this is document order as before. */}
        {[...doc.tables]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((t) => (
            <TableGlyph key={t.id} t={t} />
          ))}

        {/* Numbers are drawn per NUMBERED UNIT, not per table: a block of four pushed together
            carries one number, in the middle of the block, exactly as it does on the studio plan.
            A lone table is a unit of one, so its number lands where it always did. */}
        {numberedUnits(doc).map((unit) => {
          const members = doc.tables.filter((x) => unit.tableIds.includes(x.id));
          if (members.length === 0) return null;
          const cx = members.reduce((n, x) => n + x.position.x, 0) / members.length;
          const cy = members.reduce((n, x) => n + x.position.y, 0) / members.length;
          return (
            <text
              key={unit.id}
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={620}
              fontWeight={600}
              fontFamily="Assistant, sans-serif"
              fill="#1b1725"
            >
              {unit.number > 0 ? unit.number : "ראש"}
            </text>
          );
        })}
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
      {/* The same outline the studio drew, through the same component — a table that carries a
          catalog row draws that row's real shape, so the חצי עיגול capping the head table is an arc
          on the crew's page too and not the 120×60 box its dimensions describe. */}
      {/* Through the table's own rotation as well as its position. Turning a table is new — nothing
          could set DesignTable.rotation until there was a handle for it — and a printed map that
          drew every table square while the studio showed them angled would send the crew to lay a
          room that is not the room on screen. */}
      <g transform={`translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}`}>
        <FootprintShape
          footprint={tableFootprint(t)}
          fill={resolved.fill}
          stroke={resolved.stroke}
          strokeWidth={resolved.strokeWidth}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>
  );
}
