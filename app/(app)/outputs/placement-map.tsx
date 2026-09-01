import Link from "next/link";
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { placementLegend } from "@/lib/outputs/aggregate";
import { numberedUnits, groupSeats } from "@/lib/design-document/groups";
import { productName } from "@/lib/outputs/lookup";
import {
  absoluteControlPoints,
  fromLocalFrame,
  outlinePathD,
  pointAtDistance,
  wallAngleDeg,
  wallLengthMm,
  wallSegmentD,
} from "@/lib/studio/geometry";
import type { EventPlan } from "@/lib/events/plan";
import { featureFootprint, nodeMap, wallPoints } from "@/lib/venues/structure";
import { stairsGeometry } from "@/lib/venues/stairs";
import { resolveStyle } from "@/lib/element-style";
import { FootprintShape, tableFootprint, OVERHEAD_DASH } from "@/components/footprint-shape";
import { arrangedStructure } from "@/lib/design-document/features";
import { resolve, type Resolved } from "@/lib/studio/catalog-resolver";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { resolveFootprint, footprintBounds, type Footprint } from "@/lib/studio/footprint";
import { resolveHang, resolveSpan } from "@/lib/studio/anchor";
import { seatsAround, CHAIR_BACK_MM, CHAIR_D_MM, CHAIR_W_MM, type Seat } from "@/lib/studio/seating";
import { overallDimensions, type DimensionLine } from "@/lib/outputs/dimensions";
import type { Extent } from "@/lib/outputs/scale";
import { sheetById, type PlanSheet } from "@/lib/outputs/sheets";
import { SheetFrame, LINE_WEIGHTS, type SheetFrameProps, type LegendRow } from "./sheet-frame";

const num = (n: number) => (n === 0 ? "ראש" : String(n));

// The B&W print ink — matches SheetFrame's own tokens, so the drawing and the frame around it read
// as one document rather than two components that each remembered the palette separately.
const INK = "#1b1725";
const INK_SOFT = "#4a4658";
const MUTED = "#7c7889";

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

// How a block of pushed-together tables reads for the derived chair ring: one bounding box, through
// each member's own rotation, exactly the way the studio canvas boxes a group (canvas-stage.tsx).
// Duplicated rather than imported because that version lives inside a client component's useMemo
// chain, coupled to selection state this static print pass has no use for.
const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

function tableGroupBoxes(doc: DesignDocumentContent) {
  return (doc.groups ?? [])
    .map((g) => {
      const members = doc.tables.filter((t) => t.groupId === g.id);
      if (members.length === 0) return null; // a group of stages is not a table and has no chairs
      const xs: number[] = [];
      const ys: number[] = [];
      for (const t of members) {
        const b = footprintBounds(tableFootprint(t));
        for (const [sx, sy] of CORNERS) {
          const c = fromLocalFrame({ x: (sx * b.w) / 2, y: (sy * b.h) / 2 }, t.position, t.rotation || 0);
          xs.push(c.x);
          ys.push(c.y);
        }
      }
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      return {
        id: g.id,
        centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        widthMm: maxX - minX,
        depthMm: maxY - minY,
        seats: groupSeats(doc, g.id),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);
}

const DRAPE_MM = 220; // a curtain's drawn thickness, matching canvas-stage's own band

/** A carpet or drape with no catalog size of its own falls back to a plausible box — the same
 *  fallback the studio canvas uses (canvas-stage.tsx's fallbackSize), so a stretch item with nothing
 *  typed yet still draws something rather than a zero-size shape nobody can see. */
function fallbackSize(r?: Resolved): { widthMm: number; depthMm: number } {
  const b = r ? footprintBounds(resolveFootprint(r.product)) : null;
  return { widthMm: b?.w || 2000, depthMm: b?.h || 1400 };
}

export function PlacementMap({
  doc,
  plan,
  sheet = sheetById("hall")!,
  title = "",
  subtitle,
  studio,
  sheetNumber = 1,
  sheetCount = 1,
  version = 1,
  date = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }),
  north,
  legend: legendRows,
  paper,
  marginMm,
}: {
  doc: DesignDocumentContent;
  plan: EventPlan;
  sheet?: PlanSheet;
} & Partial<Omit<SheetFrameProps, "world" | "children" | "sheet">>) {
  // `sheet` and the rest of SheetFrame's own props are optional here, defaulting to the hall plan
  // at page one of one, so the component stays correct and self-contained for any caller that only
  // wants "the plan" without choosing a sheet.
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

  // SheetFrame draws children in WORLD millimetres with the drawing's own bounding box's top-left at
  // (0,0) — every wall, table and placement below is still authored in the venue's own absolute mm,
  // so the whole drawing is shifted once here rather than every coordinate being rebased by hand.
  const offsetX = pad - box.minX;
  const offsetY = pad - box.minY;

  /** The symbol key, built from what THIS sheet actually draws rather than from a fixed list — a
   *  key that names a pool on a sheet with no pool in it teaches the reader to stop trusting it.
   *  Only used when the caller has not supplied its own rows. */
  const symbolKey: LegendRow[] = [
    ...(structure.features.some((f) => f.kind === "stage") ? [{ label: "במה", swatch: "hatch-diagonal" as const }] : []),
    ...(structure.features.some((f) => f.kind === "pool") ? [{ label: "בריכה", swatch: "hatch-cross" as const }] : []),
    ...(sheet.tables === "ghost" ? [{ label: "שולחן (להתמצאות בלבד)", swatch: "dot-ghost" as const }] : []),
    ...(sheet.layers.includes("ceiling") || sheet.rigs ? [{ label: "מעל גובה החתך", swatch: "overhead" as const }] : []),
  ];
  const world: Extent = { widthMm: box.widthMm + pad * 2, heightMm: box.heightMm + pad * 2 };

  // Placements filtered on the SHEET, never on a hard-coded category: `layers` picks which of the
  // document's placements belong on this drawing at all, and `groups` (when the sheet sets one)
  // narrows that further to one catalog department — the stage sheet's floor-layer filter would
  // otherwise draw every table and bar standing on the same floor.
  const shown = doc.placements.filter((p) => {
    if (!sheet.layers.includes(p.layer)) return false;
    if (sheet.groups) {
      const cat = resolve(p.variantId)?.product.category;
      const group = cat ? CATEGORY_BY_ID[cat]?.group : undefined;
      if (!group || !sheet.groups.includes(group)) return false;
    }
    return true;
  });

  // Sorted by what they ARE, same split the studio canvas makes (canvas-stage.tsx): a cover is the
  // table's own surface and draws nothing separate, a drape hangs on a wall, a table-layer item
  // clusters on its table, a ceiling item hangs from a rod when it has one, and everything else is a
  // free object on the floor.
  const drapes: Placement[] = [];
  const ceilingItems: Placement[] = [];
  const floorItems: Placement[] = [];
  const chipsByTable = new Map<string, Placement[]>();
  const tableById = new Map(doc.tables.map((t) => [t.id, t]));
  for (const p of shown) {
    const r = resolve(p.variantId);
    if (r?.anchor === "table") continue; // the table's own cloth — drawn as the table's surface
    if (r?.anchor === "wall") {
      drapes.push(p);
    } else if (p.layer === "table" && p.tableId) {
      chipsByTable.set(p.tableId, [...(chipsByTable.get(p.tableId) ?? []), p]);
    } else if (p.layer === "ceiling") {
      ceilingItems.push(p);
    } else {
      floorItems.push(p);
    }
  }

  const tableGroups = sheet.chairs ? tableGroupBoxes(doc) : [];

  return (
    <div className="space-y-8">
      <SheetFrame
        world={world}
        sheet={sheet}
        title={title}
        subtitle={subtitle}
        studio={studio}
        sheetNumber={sheetNumber}
        sheetCount={sheetCount}
        version={version}
        date={date}
        north={north}
        legend={legendRows ?? symbolKey}
        paper={paper}
        marginMm={marginMm}
      >
        <g transform={`translate(${offsetX} ${offsetY})`}>
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
              stroke: isEdge ? MUTED : INK,
              strokeWidth: isEdge ? LINE_WEIGHTS.feature : LINE_WEIGHTS.wall,
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
                    gap beside the wall instead of through it. Wider than the wall's own weight so it
                    fully erases the line underneath at any scale. */}
                <path
                  d={wallSegmentD(pts.a, pts.b, wall?.curve ?? null, Math.max(0, (e.distanceMm - half) / len), Math.min(1, (e.distanceMm + half) / len))}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={LINE_WEIGHTS.wall * 2}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={centre.x} y={centre.y + 950} textAnchor="middle" fontSize={520} fontFamily="Assistant, sans-serif" fill={MUTED}>
                  כניסה
                </text>
              </g>
            );
          })}
          {/* Fixed features (pool, built stage, bar) — outline + label, B&W-safe */}
          {structure.features.map((f) => {
            // HATCHED BY KIND, because on paper a tint is not a distinction. Every feature used to
            // fill with the same #f0eef5, so a pool and a built stage printed as the same box with
            // different words in it — and photocopied, the tint goes to flat grey and even that
            // much is gone. Diagonal for a stage, cross for a pool; anything else keeps the plain
            // outline it had. The pattern is the fill, so it survives black and white and a fax.
            const hatch = f.kind === "stage" ? "url(#hatch-diagonal)" : f.kind === "pool" ? "url(#hatch-cross)" : "#ffffff";
            const resolved = resolveStyle(f.style, "monochrome", { fill: hatch, stroke: INK_SOFT, strokeWidth: LINE_WEIGHTS.feature });
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
                    <path d={outlinePathD(stairs.outline)} fill="#f7f6fa" stroke={INK_SOFT} strokeWidth={LINE_WEIGHTS.feature} vectorEffect="non-scaling-stroke" />
                    {stairs.nosings.map(([p, q], i) => (
                      <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={INK_SOFT} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
                    ))}
                  </g>
                )}
                <g transform={`rotate(${f.rotationDeg} ${f.x} ${f.y})`}>
                  {/* Same resolver the editor draws with (components/footprint-shape.tsx) — a ח bar
                      printed as a solid block is the crew told to fill the floor the staff stand in. */}
                  <g transform={`translate(${f.x} ${f.y})`}>
                    <FootprintShape footprint={featureFootprint(f)} {...common} />
                  </g>
                  <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={520} fontFamily="Assistant, sans-serif" fill={INK_SOFT}>
                    {f.label}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Tables. "full" is the studio's own shape and style; "ghost" flattens every table to the
              same faint dot pattern with no number — a rigger needs to know which table is under a
              chandelier, not read the room's seating plan. "none" skips them outright. */}
          {sheet.tables !== "none" &&
            [...doc.tables]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((t) => (sheet.tables === "ghost" ? <GhostTable key={t.id} t={t} /> : <TableGlyph key={t.id} t={t} />))}

          {/* Numbers are drawn per NUMBERED UNIT, not per table: a block of four pushed together
              carries one number, in the middle of the block, exactly as it does on the studio plan.
              Only on a sheet that actually shows the tables at full weight — a ghosted table carries
              no number, which is what "ghost" means. */}
          {sheet.tables === "full" &&
            sheet.numbers &&
            numberedUnits(doc).map((unit) => {
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
                  fill={INK}
                >
                  {unit.number > 0 ? unit.number : "ראש"}
                </text>
              );
            })}

          {/* Chairs. Derived from each table's own seat count, never placed — the same rule the
              studio canvas draws by (lib/studio/seating.ts). A group's ring goes round the outside
              of the whole block, not one ring per member, or the seam between two tables would draw
              chairs nobody could sit in. */}
          {sheet.chairs && (
            <>
              {doc.tables
                .filter((t) => !t.groupId && t.seats)
                .map((t) => (
                  <g
                    key={`seat-${t.id}`}
                    transform={`translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}`}
                  >
                    {seatsAround(tableFootprint(t), t.seats!).map((s, i) => (
                      <ChairGlyph key={i} seat={s} />
                    ))}
                  </g>
                ))}
              {tableGroups
                .filter((g) => g.seats > 0)
                .map((g) => (
                  <g key={`seat-g-${g.id}`} transform={`translate(${g.centre.x} ${g.centre.y})`}>
                    {seatsAround({ kind: "rect", widthMm: g.widthMm, depthMm: g.depthMm }, g.seats).map((s, i) => (
                      <ChairGlyph key={i} seat={s} />
                    ))}
                  </g>
                ))}
            </>
          )}

          {/* Table-layer items — clustered on their table, like the studio canvas draws them. */}
          {[...chipsByTable.entries()].flatMap(([tableId, chips]) => {
            const t = tableById.get(tableId);
            if (!t) return [];
            return chips.map((p, i) => (
              <PlacementGlyph key={p.id} placement={p} x={t.position.x} y={t.position.y + (i - (chips.length - 1) / 2) * 840} />
            ));
          })}

          {/* Free objects standing on the floor — a stage, a bar, a loose chair, a rug. */}
          {floorItems.map((p) => (
            <PlacementGlyph key={p.id} placement={p} x={p.position.x} y={p.position.y} />
          ))}

          {/* Drapes — a band along the wall they hang on. */}
          {drapes.map((p) => {
            if (!p.span) return null;
            // The property's own walls, not the arranged copy — nothing on this surface moves a
            // wall, so a drape always measures itself against the real one.
            const resolved = resolveSpan(plan.structure, p.span);
            if (!resolved) return null;
            const angle = wallAngleDeg(resolved.from, resolved.to);
            const mid = { x: (resolved.from.x + resolved.to.x) / 2, y: (resolved.from.y + resolved.to.y) / 2 };
            return (
              <g key={p.id} transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`}>
                <rect
                  x={-resolved.lengthMm / 2}
                  y={-DRAPE_MM / 2}
                  width={resolved.lengthMm}
                  height={DRAPE_MM}
                  fill="#ffffff"
                  stroke={INK}
                  strokeWidth={LINE_WEIGHTS.furniture}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* Rods — the property's own rigging, never a per-event arrangement (nothing here can
              move one). Dashed at the overhead weight, exactly like the ceiling items hanging off
              them, and labelled with the one number a rigger cannot see on the plan otherwise: how
              high it is. */}
          {sheet.rigs &&
            (plan.structure.rigs ?? []).map((r) => (
              <g key={r.id}>
                <line
                  x1={r.a.x}
                  y1={r.a.y}
                  x2={r.b.x}
                  y2={r.b.y}
                  stroke={INK}
                  strokeWidth={LINE_WEIGHTS.overhead}
                  strokeDasharray={OVERHEAD_DASH}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={(r.a.x + r.b.x) / 2} y={(r.a.y + r.b.y) / 2 - 240} textAnchor="middle" fontSize={420} fontFamily="Assistant, sans-serif" fill={INK_SOFT}>
                  {r.label} · {(r.heightMm / 1000).toFixed(2)}מ׳
                </text>
              </g>
            ))}

          {/* Ceiling items — overhead, so drawn (never filled) and dashed by FootprintShape's own
              `overhead` prop, the one convention every surface that draws this plan shares. A hung
              item draws where its rod puts it; a dangling rigId falls back to its last free point. */}
          {ceilingItems.map((p) => {
            const at = p.hang ? resolveHang(plan.structure, p.hang) : null;
            return <PlacementGlyph key={p.id} placement={p} x={at?.x ?? p.position.x} y={at?.y ?? p.position.y} overhead />;
          })}

          {/* Overall dimensions — one width and one depth per zone this event occupies, figured the
              way a plan states them: a line with witness lines at both ends and the metres reading
              along it. */}
          {plan.zones
            .filter((r) => r.boundary.length >= 3)
            .flatMap((r) => overallDimensions(r.boundary).map((d, i) => <DimensionGlyph key={`${r.zone.id}-${i}`} d={d} />))}
        </g>
      </SheetFrame>

      {/* The table SCHEDULE (שולחן ← ערכת עיצוב) — a different document from the frame's symbol
          key, and both belong on a drawing set. Meaningless on a sheet that draws no tables.
          It carries its own 16mm inset because the map view prints at `@page { margin: 0 }`: the
          drawing sheet owns its margin inside the SVG, and this section is the only thing on that
          page that would otherwise run to the paper's edge. */}
      {sheet.tables !== "none" && (
        <section className="break-before-page p-[16mm] print:p-[16mm]">
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
      )}
    </div>
  );
}

function TableGlyph({ t }: { t: DesignTable }) {
  const resolved = resolveStyle(t.style, "monochrome", { fill: "#ffffff", stroke: INK, strokeWidth: LINE_WEIGHTS.furniture });
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

/** A table drawn faint and unnumbered — a sheet that is not about the tables still has to show a
 *  rigger or a stage crew which one is under them. */
function GhostTable({ t }: { t: DesignTable }) {
  return (
    <g transform={`translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}`}>
      <FootprintShape
        footprint={tableFootprint(t)}
        fill="url(#dot-ghost)"
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.annotation}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** A banquet chair, drawn exactly as the studio canvas draws it (canvas-stage.tsx's own Chair) — the
 *  seat's own rotation already points +x at the table, so this needs no further geometry. */
function ChairGlyph({ seat }: { seat: Seat }) {
  const halfD = CHAIR_D_MM / 2;
  const halfW = CHAIR_W_MM / 2;
  return (
    <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facingDeg})`}>
      <rect
        x={-halfD}
        y={-halfW}
        width={CHAIR_D_MM}
        height={CHAIR_W_MM}
        rx={95}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.furniture}
        vectorEffect="non-scaling-stroke"
      />
      <rect x={-halfD} y={-halfW} width={CHAIR_BACK_MM} height={CHAIR_W_MM} rx={CHAIR_BACK_MM / 2} fill={INK} fillOpacity={0.35} />
    </g>
  );
}

/** One free-standing placement: a stage, a bar, a chandelier, a loose chair — whatever the catalog
 *  says its shape is, outlined at furniture weight. `overhead` forces it unfilled and dashed
 *  (components/footprint-shape.tsx), the one convention every surface that draws this plan shares. */
function PlacementGlyph({ placement, x, y, overhead }: { placement: Placement; x: number; y: number; overhead?: boolean }) {
  const r = resolve(placement.variantId);
  const footprint: Footprint =
    r?.sizing === "stretch"
      ? { kind: "rect", ...(placement.sizeMm ?? fallbackSize(r)) }
      : r
        ? resolveFootprint(r.product)
        : { kind: "rect", widthMm: 600, depthMm: 600 };
  const scale = placement.scale || 1;
  return (
    <g transform={`translate(${x} ${y})${placement.rotation ? ` rotate(${placement.rotation})` : ""}${scale !== 1 ? ` scale(${scale})` : ""}`}>
      <FootprintShape
        footprint={footprint}
        overhead={overhead}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.furniture}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** One overall dimension: witness lines off the room's own corners, the figured line between them,
 *  and the metres reading along it — a line with a ruler function, not a caption. `overallDimensions`
 *  only ever returns a run along a horizontal or a vertical edge, so the offset is applied on
 *  whichever axis the segment does NOT run along. */
function DimensionGlyph({ d }: { d: DimensionLine }) {
  const horizontal = d.from.y === d.to.y;
  const off = horizontal ? { x: 0, y: d.offsetMm } : { x: d.offsetMm, y: 0 };
  const a = { x: d.from.x + off.x, y: d.from.y + off.y };
  const b = { x: d.to.x + off.x, y: d.to.y + off.y };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const tick = 150; // world mm — a small architectural tick, not an arrowhead
  const tickOff = horizontal ? { x: 0, y: tick } : { x: tick, y: 0 };
  const common = { stroke: INK, strokeWidth: LINE_WEIGHTS.annotation, vectorEffect: "non-scaling-stroke" as const };
  return (
    <g>
      <line x1={d.from.x} y1={d.from.y} x2={a.x} y2={a.y} {...common} stroke={MUTED} />
      <line x1={d.to.x} y1={d.to.y} x2={b.x} y2={b.y} {...common} stroke={MUTED} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} />
      <line x1={a.x - tickOff.x / 2} y1={a.y - tickOff.y / 2} x2={a.x + tickOff.x / 2} y2={a.y + tickOff.y / 2} {...common} />
      <line x1={b.x - tickOff.x / 2} y1={b.y - tickOff.y / 2} x2={b.x + tickOff.x / 2} y2={b.y + tickOff.y / 2} {...common} />
      <text
        x={mid.x + (horizontal ? 0 : 220)}
        y={mid.y + (horizontal ? -220 : 0)}
        textAnchor="middle"
        fontSize={380}
        fontFamily="Assistant, sans-serif"
        fill={INK}
        className="nums"
      >
        {d.label} מ׳
      </text>
    </g>
  );
}
