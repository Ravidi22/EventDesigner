import Link from "next/link";
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { placementLegend } from "@/lib/outputs/aggregate";
import { numberedUnits, groupSeats } from "@/lib/design-document/groups";
import { productName } from "@/lib/outputs/lookup";
import {
  absoluteControlPoints,
  doorGeometry,
  fromLocalFrame,
  outlinePathD,
  wallAngleDeg,
  wallLengthMm,
  wallSegmentD,
} from "@/lib/studio/geometry";
import type { EventPlan } from "@/lib/events/plan";
import { featureFootprint, nodeMap, wallPoints } from "@/lib/venues/structure";
import { detectFaces, wallInteriorHint } from "@/lib/venues/faces";
import { stairsFlights } from "@/lib/venues/stairs";
import { resolveStyle } from "@/lib/element-style";
import { FootprintShape, dressingSpots, tableBlockedSides, tableFootprint, tableLabelPoint, placementFootprint, productStyle, OVERHEAD_DASH } from "@/components/footprint-shape";
import { DrapePleats, ItemSymbol, RugPattern, SeatChair } from "@/components/item-symbol";
import { chairStyleOf, symbolCount, symbolOf } from "@/lib/catalog/symbols";
import { arrangedStructure } from "@/lib/design-document/features";
import { deckOf, resolve, type Resolved } from "@/lib/studio/catalog-resolver";
import {
  benchInRoom,
  edgeGaps,
  edgeItemShape,
  layStage,
  stageAreaMm2,
  stageCorners,
  railingRuns,
  skirtMm,
  stageHeight,
  stageRect,
  type EdgeRun,
  type StagePlacement,
  type WallDistance,
} from "@/lib/design-document/stage";
import { uprightTransform } from "@/lib/design-document/mirror";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { resolveFootprint, footprintBounds, type Footprint } from "@/lib/studio/footprint";
import { nearestWall, resolveSpan } from "@/lib/studio/anchor";
import { seatsAround, CHAIR_D_MM, CHAIR_W_MM, type Seat } from "@/lib/studio/seating";
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

/** Where a table or item stands, which way it faces, and whether it is drawn flipped
 *  (Placement.mirrored) — the same translate · rotate · flip the studio canvas draws with, so a
 *  corner sofa turned over on screen is turned over on the crew's page too. */
const placed = (at: { x: number; y: number }, rotation: number, mirrored?: boolean) =>
  `translate(${at.x} ${at.y})${rotation ? ` rotate(${rotation})` : ""}${mirrored ? " scale(-1 1)" : ""}`;

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
  railingAboveMm = null,
}: {
  doc: DesignDocumentContent;
  plan: EventPlan;
  sheet?: PlanSheet;
  /** The studio's railing rule (settings → במות) — null when it is off. */
  railingAboveMm?: number | null;
} & Partial<Omit<SheetFrameProps, "world" | "children" | "sheet">>) {
  // `sheet` and the rest of SheetFrame's own props are optional here, defaulting to the hall plan
  // at page one of one, so the component stays correct and self-contained for any caller that only
  // wants "the plan" without choosing a sheet.
  const legend = placementLegend(doc, productName);
  // World mm around the frame: enough for the overall dimensions (900mm off the room, plus their
  // figures) to land inside the clip rather than be cut by it.
  const pad = 1600;
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
  // Which side of each wall is inside, so a door swings into the room it belongs to.
  const faces = detectFaces(structure);
  // A feature counts as on this sheet when it stands inside the frame — the sheet frames one zone
  // and clips the rest of the property, so a pool two courtyards away is not in its key.
  const inFrame = (pt: { x: number; y: number }) =>
    pt.x >= box.minX - pad && pt.x <= box.maxX + pad && pt.y >= box.minY - pad && pt.y <= box.maxY + pad;
  const framedFeatures = structure.features.filter((f) => inFrame(f));

  // SheetFrame draws children in WORLD millimetres with the drawing's own bounding box's top-left at
  // (0,0) — every wall, table and placement below is still authored in the venue's own absolute mm,
  // so the whole drawing is shifted once here rather than every coordinate being rebased by hand.
  const offsetX = pad - box.minX;
  const offsetY = pad - box.minY;

  /** The symbol key, built from what THIS sheet actually draws rather than from a fixed list — a
   *  key that names a pool on a sheet with no pool in it teaches the reader to stop trusting it.
   *  Only used when the caller has not supplied its own rows. */
  const symbolKey: LegendRow[] = [
    ...(framedFeatures.some((f) => f.kind === "stage") ? [{ label: "במה", swatch: "hatch-diagonal" as const }] : []),
    ...(framedFeatures.some((f) => f.kind === "pool") ? [{ label: "בריכה", swatch: "hatch-cross" as const }] : []),
    ...(sheet.tables === "ghost" ? [{ label: "שולחן (להתמצאות בלבד)", swatch: "dot-ghost" as const }] : []),
    ...(sheet.layers.includes("ceiling") ? [{ label: "מעל גובה החתך", swatch: "overhead" as const }] : []),
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
  // clusters on its table, a ceiling item is drawn overhead, and everything else is a free object on
  // the floor.
  const drapes: Placement[] = [];
  const ceilingItems: Placement[] = [];
  const floorItems: Placement[] = [];
  const chipsByTable = new Map<string, Placement[]>();
  const tableById = new Map(doc.tables.map((t) => [t.id, t]));
  const perched: Placement[] = [];
  for (const p of shown) {
    const r = resolve(p.variantId);
    if (p.perch) {
      perched.push(p); // on a stage's banquette — drawn there, below
      continue;
    }
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

  // STAGES. On every sheet they stand on, a stage is its outline, its raised levels (hatched, the
  // same ink the venue's own staging wears) and its flights of stairs. On the STAGE sheet it is also
  // the build: every deck, numbered front to back, and where a railing is needed — the drawing a
  // crew lays the decks from.
  const wallDistance: WallDistance = (pt) => nearestWall(plan.structure, pt)?.distanceMm ?? Infinity;
  const stages = floorItems.filter((p): p is StagePlacement => !!p.stage);
  // Design items on a banquette, spread along it as the studio draws them.
  const perchedSpots = (() => {
    const out: { p: Placement; at: { x: number; y: number } }[] = [];
    const groups = new Map<string, Placement[]>();
    for (const p of perched) groups.set(`${p.perch!.stageId}|${p.perch!.itemId}`, [...(groups.get(`${p.perch!.stageId}|${p.perch!.itemId}`) ?? []), p]);
    for (const [k, list] of groups) {
      const [stageId, itemId] = k.split("|");
      const st = doc.placements.find((x) => x.id === stageId);
      const bench = st?.stage ? benchInRoom(st as StagePlacement, itemId, deckOf) : null;
      if (!bench) continue;
      const u = { x: Math.cos((bench.angle * Math.PI) / 180), y: Math.sin((bench.angle * Math.PI) / 180) };
      list.forEach((p, i) => {
        const f = (i + 0.5) / list.length - 0.5;
        out.push({ p, at: { x: bench.centre.x + u.x * f * bench.lengthMm, y: bench.centre.y + u.y * f * bench.lengthMm } });
      });
    }
    return out;
  })();
  const buildSheet = sheet.id === "stage";

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
        {/* A function of the fitted scale, so every figure below is sized in PRINTED millimetres
            (`den * mm`) — the crew reads the page, and a number authored in room millimetres is a
            smudge at 1:500 and a headline at 1:50. */}
        {(den: number) => (
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
          {/* Doors — the gap struck through the wall, and the leaf with its swing, exactly as the
              studio and the hall editor draw them (doorGeometry). It used to be the gap and the
              word "כניסה" underneath — always underneath, whatever way the wall ran, so on a side
              wall it sat inside the room among the tables. The symbol says which way the door
              opens and how far into the room it sweeps, which is what a crew laying a row next to
              it needs; the word said neither. */}
          {structure.entrances.map((e) => {
            const wall = structure.walls.find((w) => w.id === e.wallId);
            const pts = wall ? wallPoints(structure, wall, nodes) : null;
            if (!wall || !pts) return null;
            const len = wallLengthMm(pts.a, pts.b) || 1;
            const half = e.widthMm / 2;
            const door = doorGeometry(pts.a, pts.b, e.distanceMm, e.widthMm, e.swingInward, wallInteriorHint(faces, pts.a, pts.b, wall.a, wall.b), e.doubleDoor, wall.curve ?? null);
            return (
              <g key={e.id}>
                {/* Struck along the wall as drawn — on a bowed wall a straight chord would print the
                    gap beside the wall instead of through it. Wider than the wall's own weight so it
                    fully erases the line underneath at any scale. */}
                <path
                  d={wallSegmentD(pts.a, pts.b, wall.curve ?? null, Math.max(0, (e.distanceMm - half) / len), Math.min(1, (e.distanceMm + half) / len))}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={LINE_WEIGHTS.wall * 2}
                  vectorEffect="non-scaling-stroke"
                />
                {door.leaves.map((leaf, i) => (
                  <g key={i}>
                    <line x1={leaf.hinge.x} y1={leaf.hinge.y} x2={leaf.tip.x} y2={leaf.tip.y} stroke={INK} strokeWidth={LINE_WEIGHTS.furniture} vectorEffect="non-scaling-stroke" />
                    <path
                      d={`M ${leaf.tip.x} ${leaf.tip.y} A ${leaf.lenMm} ${leaf.lenMm} 0 0 ${leaf.sweepFlag} ${leaf.arcTo.x} ${leaf.arcTo.y}`}
                      fill="none"
                      stroke={INK_SOFT}
                      strokeWidth={LINE_WEIGHTS.annotation}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ))}
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
            const flights = stairsFlights(f);
            return (
              <g key={f.id}>
                {flights.map((stairs, n) => (
                  <g key={n}>
                    <path d={outlinePathD(stairs.outline)} fill="#f7f6fa" stroke={INK_SOFT} strokeWidth={LINE_WEIGHTS.feature} vectorEffect="non-scaling-stroke" />
                    {stairs.nosings.map(([p, q], i) => (
                      <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={INK_SOFT} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
                    ))}
                  </g>
                ))}
                <g transform={`rotate(${f.rotationDeg} ${f.x} ${f.y})`}>
                  {/* Same resolver the editor draws with (components/footprint-shape.tsx) — a ח bar
                      printed as a solid block is the crew told to fill the floor the staff stand in. */}
                  <g transform={`translate(${f.x} ${f.y})`}>
                    <FootprintShape footprint={featureFootprint(f)} {...common} />
                  </g>
                  <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={2.6 * den} fontFamily="Assistant, sans-serif" fill={INK_SOFT}>
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
              // A lone table is numbered where the studio numbers it — the shape's own label point
              // (tableLabelPoint): the middle of the band on an arc, not the box centre out in the
              // air the ring curves round. A block keeps the middle of the block.
              const at =
                members.length === 1
                  ? tableLabelPoint(members[0])
                  : {
                      x: members.reduce((n, x) => n + x.position.x, 0) / members.length,
                      y: members.reduce((n, x) => n + x.position.y, 0) / members.length,
                    };
              // As big as the table allows, between 2.4mm (still legible held at arm's length) and
              // 4mm on paper (a numeral the crew can find across the room once the sheet is taped
              // to a wall). The table's own short side is the ceiling, so a number stays inside it.
              const short = Math.max(...members.map((x) => {
                const b = footprintBounds(tableFootprint(x));
                return Math.min(b.w, b.h);
              }));
              const size = Math.max(2.4 * den, Math.min(4 * den, short * 0.42));
              return (
                <text
                  key={unit.id}
                  x={at.x}
                  y={at.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={size}
                  fontWeight={700}
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
                    transform={placed(t.position, t.rotation, t.mirrored)}
                  >
                    {seatsAround(tableFootprint(t), t.seats!, undefined, tableBlockedSides(t)).map((s, i) => (
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
            return dressingSpots(t, chips).map(({ p, at, rotation, footprint }) => (
              <PlacementGlyph key={p.id} placement={{ ...p, rotation }} x={at.x} y={at.y} shape={footprint} />
            ));
          })}

          {/* Free objects standing on the floor — a stage, a bar, a loose chair, a rug. */}
          {floorItems.map((p) =>
            p.stage ? (
              <StageGlyph
                key={p.id}
                p={p as StagePlacement}
                build={buildSheet}
                railing={buildSheet ? railingRuns(p as StagePlacement, deckOf, railingAboveMm, wallDistance) : []}
                label={stages.length > 1 ? `במה ${stages.indexOf(p as StagePlacement) + 1}` : undefined}
                den={den}
              />
            ) : (
              <PlacementGlyph key={p.id} placement={p} x={p.position.x} y={p.position.y} />
            ),
          )}

          {perchedSpots.map(({ p, at }) => (
            <PlacementGlyph key={p.id} placement={p} x={at.x} y={at.y} />
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
                  fill="none"
                  stroke={INK}
                  strokeWidth={LINE_WEIGHTS.overhead}
                  strokeDasharray={OVERHEAD_DASH}
                  vectorEffect="non-scaling-stroke"
                />
                <DrapePleats lengthMm={resolved.lengthMm} depthMm={DRAPE_MM} ink={INK} opacity={0.6} />
              </g>
            );
          })}

          {/* Ceiling items — overhead, so drawn (never filled) and dashed by FootprintShape's own
              `overhead` prop, the one convention every surface that draws this plan shares. */}
          {ceilingItems.map((p) => (
            <PlacementGlyph key={p.id} placement={p} x={p.position.x} y={p.position.y} overhead />
          ))}

          {/* Overall dimensions — one width and one depth per zone this event occupies, figured the
              way a plan states them: a line with witness lines at both ends and the metres reading
              along it. */}
          {plan.zones
            .filter((r) => r.boundary.length >= 3)
            .flatMap((r) => overallDimensions(r.boundary).map((d, i) => <DimensionGlyph key={`${r.zone.id}-${i}`} d={d} den={den} />))}
        </g>
        )}
      </SheetFrame>

      {buildSheet && stages.length > 0 && (
        <StageSchedule stages={stages} railingAboveMm={railingAboveMm} wallDistance={wallDistance} doc={doc} />
      )}

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

/** Adjustable legs under one deck — the ordinary staging deck stands on four. */
const LEGS_PER_DECK = 4;

/** A stage on the drawing, in its own frame (the same one the studio lays its decks in). */
function StageGlyph({ p, build, railing, label, den }: { p: StagePlacement; build: boolean; railing: EdgeRun[]; label?: string; den: number }) {
  const stage = p.stage;
  const laid = build ? layStage(stage, deckOf) : null;
  const upright = uprightTransform(p.rotation, p.mirrored);
  const a = stage.outline[stage.front];
  const b = stage.outline[(stage.front + 1) % stage.outline.length];
  // "קהל" just outside the middle of the front, so the page says which way the stage faces.
  const mid = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) || 1 : 1;
  const out = a && b ? { x: (b.y - a.y) / len, y: -(b.x - a.x) / len } : { x: 0, y: -1 };
  // The outward side of the front: away from the stage's middle (its frame's origin).
  const flip = mid && mid.x * out.x + mid.y * out.y < 0 ? -1 : 1;
  const audience = mid ? { x: mid.x + out.x * flip * 700, y: mid.y + out.y * flip * 700 } : null;
  const text = (x: number, y: number, body: string, size: number, weight = 400, fill = INK) => (
    <g transform={`translate(${x} ${y})`}>
      <text transform={upright} textAnchor="middle" dominantBaseline="central" fontFamily="Assistant, sans-serif" fontSize={size} fontWeight={weight} fill={fill}>
        {body}
      </text>
    </g>
  );
  return (
    <g transform={placed(p.position, p.rotation, p.mirrored)}>
      <polygon
        points={stage.outline.map((q) => `${q.x},${q.y}`).join(" ")}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.furniture}
        vectorEffect="non-scaling-stroke"
      />
      {(stage.levels ?? []).map((l) => (
        <polygon
          key={l.id}
          points={l.outline.map((q) => `${q.x},${q.y}`).join(" ")}
          fill="url(#hatch-diagonal)"
          fillOpacity={0.35}
          stroke={INK}
          strokeWidth={LINE_WEIGHTS.furniture}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {laid?.decks.map((d, i) => (
        <g key={i}>
          <rect
            x={-d.widthMm / 2}
            y={-d.depthMm / 2}
            width={d.widthMm}
            height={d.depthMm}
            transform={`translate(${d.centre.x} ${d.centre.y}) rotate(${d.rotation})`}
            fill="none"
            stroke={INK_SOFT}
            strokeWidth={LINE_WEIGHTS.annotation}
            vectorEffect="non-scaling-stroke"
          />
          {text(d.centre.x, d.centre.y, String(i + 1), Math.min(320, Math.min(d.widthMm, d.depthMm) * 0.4), 600)}
        </g>
      ))}
      {(stage.stairs ?? []).map((st) => {
        const shape = edgeItemShape(stage, st, deckOf);
        if (!shape) return null;
        // A barrier is solid ink along the inside of its edge; a banquette a plain strip with a
        // centre line (a seat, in plan); a flight with a line across each tread.
        if (shape.kind === "barrier" || shape.kind === "backdrop") {
          // On the edge, in solid ink — a backdrop twice a barrier's weight, and hatched.
          return (
            <polygon
              key={st.id}
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill={shape.kind === "backdrop" ? "url(#hatch-diagonal)" : INK}
              stroke={INK}
              strokeWidth={LINE_WEIGHTS.furniture * (shape.kind === "backdrop" ? 2 : 1)}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const [a0, b0, c0, d0] = shape.polygon;
        return (
          <g key={st.id}>
            {shape.chairs.map((seat, k) => (
              <ChairGlyph key={`chair-${k}`} seat={seat} />
            ))}
            <polygon
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill="#ffffff"
              stroke={INK}
              strokeWidth={LINE_WEIGHTS.furniture}
              vectorEffect="non-scaling-stroke"
            />
            {shape.treads.map(([u, v], k) => (
              <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
            ))}
            {shape.kind === "bench" && (
              <line
                x1={(a0.x + d0.x) / 2}
                y1={(a0.y + d0.y) / 2}
                x2={(b0.x + c0.x) / 2}
                y2={(b0.y + c0.y) / 2}
                stroke={INK_SOFT}
                strokeWidth={LINE_WEIGHTS.annotation}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}
      {/* Corner pieces where two runs meet outside a corner. */}
      {stageCorners(stage, deckOf).map((c, i) => (
        <g key={`corner-${i}`}>
          <polygon points={c.polygon.map((q) => `${q.x},${q.y}`).join(" ")} fill="#ffffff" stroke={INK} strokeWidth={LINE_WEIGHTS.furniture} vectorEffect="non-scaling-stroke" />
          {c.treads.map(([u, v], k) => (
            <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
      {railing.map((r, i) => (
        <line
          key={`rail-${i}`}
          x1={r.a.x}
          y1={r.a.y}
          x2={r.b.x}
          y2={r.b.y}
          stroke={INK}
          strokeWidth={LINE_WEIGHTS.furniture * 2.5}
          strokeDasharray="1 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {build && audience && text(audience.x, audience.y, "קהל", 2.4 * den, 600, INK_SOFT)}
      {label && !build && text(0, 0, label, 2.8 * den, 600, INK_SOFT)}
    </g>
  );
}

/** The build of every stage on the sheet, as a table a crew can tick off: the size, the height of
 *  the base and of each level, the decks per level, the flights (with their steps), the skirt, and
 *  the railing when the studio's rule asks for one. Counts only — this is a printing surface, and a
 *  price never goes near it (npm run check:costs). */
function StageSchedule({
  stages,
  railingAboveMm,
  wallDistance,
  doc,
}: {
  stages: StagePlacement[];
  railingAboveMm: number | null;
  wallDistance: WallDistance;
  doc: DesignDocumentContent;
}) {
  const m = (mm: number) => (Math.round(mm / 10) / 100).toString();
  const cm = (mm: number) => Math.round(mm / 10);
  return (
    <section className="break-before-page p-[16mm] print:p-[16mm]">
      <h3 className="mb-2 border-b border-ink pb-1 text-base font-semibold text-ink">פירוט במות</h3>
      {stages.map((p, i) => {
        const stage = p.stage;
        const laid = layStage(stage, deckOf);
        const size = stageRect(stage);
        const baseH = stageHeight(stage, deckOf);
        const parts = [
          { id: undefined as string | undefined, label: "בסיס", heightMm: baseH },
          ...(stage.levels ?? []).map((l, k) => ({ id: l.id as string | undefined, label: `מפלס ${k + 1}`, heightMm: l.heightMm })),
        ];
        const rows = parts.map((part) => {
          const decks = laid.decks.filter((d) => d.level === part.id);
          const byType = new Map<string, number>();
          for (const d of decks) byType.set(d.typeId, (byType.get(d.typeId) ?? 0) + 1);
          const first = laid.decks.indexOf(decks[0]) + 1;
          return { ...part, byType, from: first, to: first + decks.length - 1, count: decks.length };
        });
        const shapes = (stage.stairs ?? []).map((st) => edgeItemShape(stage, st, deckOf)).filter((x) => !!x);
        const flights = shapes.filter((x) => x.kind === "stairs");
        const benchMm = shapes.filter((x) => x.kind === "bench").reduce((t, x) => t + x.widthMm, 0);
        const seats = shapes.filter((x) => x.kind === "bench").reduce((t, x) => t + x.seats, 0);
        const barrierMm = shapes.filter((x) => x.kind === "barrier").reduce((t, x) => t + x.widthMm, 0);
        const backdropMm = shapes.filter((x) => x.kind === "backdrop").reduce((t, x) => t + x.widthMm, 0);
        const ramps = shapes.filter((x) => x.kind === "ramp");
        const corners = stageCorners(stage, deckOf);
        const surface = stage.surfaceVariant ? productName(stage.surfaceVariant) : null;
        const bare = edgeGaps(p, deckOf, wallDistance).reduce((t, g) => t + g.lengthMm, 0);
        const dressing = doc.placements.filter((x) => x.perch?.stageId === p.id);
        const skirt = skirtMm(p, deckOf, wallDistance);
        const rail = railingRuns(p, deckOf, railingAboveMm, wallDistance).reduce((s, r) => s + r.lengthMm, 0);
        return (
          <div key={p.id} className="break-inside-avoid py-3">
            <p className="text-sm font-semibold text-ink">
              {stages.length > 1 ? `במה ${i + 1}` : "במה"}
              {size && <span className="nums ms-2 font-normal text-ink-soft">{`${m(size.widthMm)}×${m(size.depthMm)} מ׳`}</span>}
              <span className="nums ms-2 font-normal text-ink-soft">{laid.decks.length} פלטות</span>
            </p>
            <table className="mt-1.5 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted">
                  <th className="py-1 text-start font-medium">חלק</th>
                  <th className="py-1 text-start font-medium">גובה</th>
                  <th className="py-1 text-start font-medium">פלטות</th>
                  <th className="py-1 text-start font-medium">מספרים בשרטוט</th>
                  <th className="py-1 text-start font-medium">רגליים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td className="py-1.5 text-ink">{r.label}</td>
                    <td className="nums py-1.5 text-ink">{cm(r.heightMm)} ס״מ</td>
                    <td className="py-1.5 text-ink">
                      {[...r.byType.entries()].map(([id, n]) => `${productName(id) ?? "פלטה"} ×${n}`).join(" · ") || "—"}
                    </td>
                    <td className="nums py-1.5 text-ink-soft">{r.count > 0 ? (r.count === 1 ? r.from : `${r.from}–${r.to}`) : "—"}</td>
                    {/* Four adjustable legs to a deck, set to the part's height — what the crew
                        counts out and dials in before a deck goes down. */}
                    <td className="nums py-1.5 text-ink-soft">{r.count > 0 ? `${r.count * LEGS_PER_DECK} × ${cm(r.heightMm)} ס״מ` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-sm text-ink-soft">
              {flights.length > 0
                ? `מדרגות: ${flights.length} ${flights.length === 1 ? "גרם" : "גרמים"} — ${flights.map((f) => `${m(f.widthMm)} מ׳, ${f.risers} רומים של ${cm(f.riserMm)} ס״מ`).join("; ")}`
                : "מדרגות: אין"}
              {benchMm > 0 ? ` · בנקט: ${m(benchMm)} מ׳ (${seats} כיסאות)` : ""}
              {barrierMm > 0 ? ` · מחסום: ${m(barrierMm)} מ׳` : ""}
              {backdropMm > 0 ? ` · קיר רקע: ${m(backdropMm)} מ׳` : ""}
              {ramps.length > 0 ? ` · רמפה: ${ramps.map((r) => `${m(r.depthMm)} מ׳ אורך`).join(", ")}` : ""}
              {corners.length > 0 ? ` · פינות: ${corners.length}` : ""}
              {surface ? ` · משטח: ${surface} (${m(stageAreaMm2(stage) / 1000)} מ״ר)` : ""}
              {bare > 0 ? ` · ⚠ ${m(bare)} מ׳ שפה פתוחה` : ""}
              {" · "}
              {`חצאית: ${m(skirt)} מ׳`}
              {railingAboveMm ? ` · מעקה: ${rail > 0 ? `${m(rail)} מ׳ חסרים (קו מנוקד בשרטוט)` : "תקין"}` : ""}
            </p>
            {dressing.length > 0 && (
              <p className="mt-1 text-sm text-ink-soft">
                {`על הבנקט: ${dressing.map((x) => `${productName(x.variantId) ?? "פריט"}${x.quantity > 1 ? ` ×${x.quantity}` : ""}`).join(" · ")}`}
              </p>
            )}
          </div>
        );
      })}
      <p className="mt-2 text-xs text-muted">הפלטות ממוספרות מהחזית לאחור, בשורות. חזית הבמה היא הצד שמסומן ״קהל״.</p>
    </section>
  );
}

function TableGlyph({ t }: { t: DesignTable }) {
  // The catalog row's look under the table's own — the studio's merge (productStyle). Colour never
  // survives to print, but a dash or a weight chosen for the row has to: on paper they are what
  // carries the meaning the colour did on screen.
  const product = t.variantId ? resolve(t.variantId)?.product : undefined;
  const resolved = resolveStyle(productStyle(product, t.style), "monochrome", { fill: "#ffffff", stroke: INK, strokeWidth: LINE_WEIGHTS.furniture });
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
      <g transform={placed(t.position, t.rotation, t.mirrored)}>
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
    <g transform={placed(t.position, t.rotation, t.mirrored)}>
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
  return (
    <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facingDeg})`}>
      <SeatChair widthMm={CHAIR_W_MM} depthMm={CHAIR_D_MM} ink={INK} print />
    </g>
  );
}

/** One free-standing placement: a stage, a bar, a chandelier, a loose chair — whatever the catalog
 *  says its shape is, outlined at furniture weight. `overhead` forces it unfilled and dashed
 *  (components/footprint-shape.tsx), the one convention every surface that draws this plan shares. */
function PlacementGlyph({ placement, x, y, overhead, shape }: { placement: Placement; x: number; y: number; overhead?: boolean; shape?: Footprint }) {
  const r = resolve(placement.variantId);
  const footprint: Footprint = shape ?? (
    r?.sizing === "stretch"
      ? { kind: "rect", ...(placement.sizeMm ?? fallbackSize(r)) }
      : placementFootprint(placement)); // at the size it was stretched to, when its row allows that
  const scale = placement.scale || 1;
  // The row's own weight and dash, collapsed to ink-on-paper (TableGlyph's reason). A stage keeps the
  // sheet's furniture weight whatever deck it was built from, as it does on screen.
  const style = resolveStyle(placement.stage ? undefined : productStyle(r?.product), "monochrome", { fill: "#ffffff", stroke: INK, strokeWidth: LINE_WEIGHTS.furniture });
  // The category's picture, in ink — the same one the studio draws, so the crew sees a chair where
  // the designer put a chair (lib/catalog/symbols.ts).
  const symbol = placement.stage ? null : symbolOf(r?.product, footprint);
  return (
    <g transform={`${placed({ x, y }, placement.rotation, placement.mirrored)}${scale !== 1 ? ` scale(${scale})` : ""}`}>
      {symbol && r && <ItemSymbol kind={symbol} footprint={footprint} count={symbolCount(r.product, symbol)} ink={INK} print overhead={overhead} chairStyle={chairStyleOf(r.product)} />}
      {r?.product.category === "rugs" && footprint.kind === "rect" && <RugPattern w={footprint.widthMm} h={footprint.depthMm} ink={INK} opacity={0.8} />}
      <FootprintShape
        footprint={footprint}
        overhead={overhead}
        fill={symbol ? "none" : style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeDasharray={style.dashArray.length ? style.dashArray.join(" ") : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** One overall dimension: witness lines off the room's own corners, the figured line between them,
 *  and the metres reading along it — a line with a ruler function, not a caption. `overallDimensions`
 *  only ever returns a run along a horizontal or a vertical edge, so the offset is applied on
 *  whichever axis the segment does NOT run along. */
function DimensionGlyph({ d, den }: { d: DimensionLine; den: number }) {
  const horizontal = d.from.y === d.to.y;
  const off = horizontal ? { x: 0, y: d.offsetMm } : { x: d.offsetMm, y: 0 };
  const a = { x: d.from.x + off.x, y: d.from.y + off.y };
  const b = { x: d.to.x + off.x, y: d.to.y + off.y };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const tick = 1.4 * den; // 1.4 printed mm — a small architectural tick, not an arrowhead
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
        x={mid.x + (horizontal ? 0 : 2 * den)}
        y={mid.y + (horizontal ? -1.2 * den : 0)}
        textAnchor="middle"
        fontSize={2.4 * den}
        fontFamily="Assistant, sans-serif"
        fill={INK}
        className="nums"
      >
        {d.label} מ׳
      </text>
    </g>
  );
}
