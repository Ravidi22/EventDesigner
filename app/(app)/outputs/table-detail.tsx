import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import type { TableKit } from "@/lib/outputs/table-kits";
import type { ItemLookup } from "@/lib/outputs/aggregate";
import type { PlanSheet } from "@/lib/outputs/sheets";
import { fromLocalFrame } from "@/lib/studio/geometry";
import { footprintBounds } from "@/lib/studio/footprint";
import { seatsAround, CHAIR_D_MM } from "@/lib/studio/seating";
import { resolve } from "@/lib/studio/catalog-resolver";
import { dressingSpots, tableBlockedSides, tableFootprint } from "@/components/footprint-shape";
import { SheetFrame, LINE_WEIGHTS, type NoteRow, type SheetFrameProps } from "./sheet-frame";
import { ChairGlyph, PlacementGlyph, TableGlyph, formatTables, tableGroupBoxes } from "./placement-map";

// A TABLE DETAIL — one design kit drawn large enough to set a table from.
//
// The plan says WHERE a table goes and, by its letter, WHICH kit it carries; this sheet says what
// that kit looks like laid out: every piece in its place on the table, numbered, with the numbers
// listed beside the drawing (what each piece is, how many, and for an arrangement what it is made
// of). One sheet per kit, drawn on the kit's first table, and the sheet says every table it applies
// to — forty tables in three kits is three of these.
//
// It is a drawing at a stated scale inside the same drafting frame as every plan sheet, not a
// picture: the title block says 1:15 and a ruler on the page agrees with it.

const INK = "#1b1725";
const MUTED = "#7c7889";

type Pt = { x: number; y: number };

const placed = (at: Pt, rotation: number, mirrored?: boolean) =>
  `translate(${at.x} ${at.y})${rotation ? ` rotate(${rotation})` : ""}${mirrored ? " scale(-1 1)" : ""}`;

const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** How far out from the table the callout bubbles ride: past the chairs, with room for a leader. */
const CALLOUT_RING_MM = CHAIR_D_MM + 500;
const PAD_MM = 300;

function sizeOf(t: DesignTable): string {
  const cm = (mm: number) => Math.round(mm / 10);
  if (t.diameterMm) return `Ø${cm(t.diameterMm)}`;
  const b = footprintBounds(tableFootprint(t));
  return `${cm(b.w)}×${cm(b.h)}`;
}

/** Where a ray from the box's centre through `p` leaves the box — the callout's spot on the ring. */
function rayToBox(c: Pt, p: Pt, halfW: number, halfH: number, fallbackAngle: number): Pt {
  let dx = p.x - c.x;
  let dy = p.y - c.y;
  if (Math.hypot(dx, dy) < 1) {
    dx = Math.cos(fallbackAngle);
    dy = Math.sin(fallbackAngle);
  }
  const t = Math.min(dx ? halfW / Math.abs(dx) : Infinity, dy ? halfH / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The box's perimeter as one parameter, clockwise from the top-left corner — so callouts can be
 *  spread along it without two landing on one spot. */
function perimeter(c: Pt, halfW: number, halfH: number) {
  const w = halfW * 2, h = halfH * 2, total = 2 * (w + h);
  const toT = (p: Pt): number => {
    const x = p.x - (c.x - halfW), y = p.y - (c.y - halfH);
    if (Math.abs(y) < 1e-6) return x;
    if (Math.abs(x - w) < 1e-6) return w + y;
    if (Math.abs(y - h) < 1e-6) return w + h + (w - x);
    return 2 * w + h + (h - y);
  };
  const toPt = (t0: number): Pt => {
    const t = ((t0 % total) + total) % total;
    const x0 = c.x - halfW, y0 = c.y - halfH;
    if (t < w) return { x: x0 + t, y: y0 };
    if (t < w + h) return { x: x0 + w, y: y0 + (t - w) };
    if (t < 2 * w + h) return { x: x0 + w - (t - w - h), y: y0 + h };
    return { x: x0, y: y0 + h - (t - 2 * w - h) };
  };
  return { total, toT, toPt };
}

/** The unit's box in the room, through each member's rotation, and the drawing round it: the table,
 *  its chairs and the ring the callouts ride on. */
function detailFrame(members: DesignTable[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of members) {
    const b = footprintBounds(tableFootprint(t));
    for (const [sx, sy] of CORNERS) {
      const q = fromLocalFrame({ x: (sx * b.w) / 2, y: (sy * b.h) / 2 }, t.position, t.rotation || 0);
      xs.push(q.x);
      ys.push(q.y);
    }
  }
  const box = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const ringW = (box.maxX - box.minX) / 2 + CALLOUT_RING_MM;
  const ringH = (box.maxY - box.minY) / 2 + CALLOUT_RING_MM;
  const world = { widthMm: ringW * 2 + PAD_MM * 2, heightMm: ringH * 2 + PAD_MM * 2 };
  const offset = { x: PAD_MM + ringW - centre.x, y: PAD_MM + ringH - centre.y };
  return { box, centre, ringW, ringH, world, offset };
}

/** What a kit's detail sheet draws, for choosing its paper before it renders. */
export function detailWorld(kit: TableKit, doc: DesignDocumentContent) {
  const unit = kit.units[0];
  return detailFrame(doc.tables.filter((t) => unit.tableIds.includes(t.id))).world;
}

export function TableDetail({
  kit,
  doc,
  lookup,
  ...frame
}: {
  kit: TableKit;
  doc: DesignDocumentContent;
  lookup: ItemLookup;
} & Omit<SheetFrameProps, "world" | "children" | "sheet" | "notes" | "legend">) {
  const unit = kit.units[0];
  const members = doc.tables.filter((t) => unit.tableIds.includes(t.id));
  const block = members.length > 1;
  const group = block ? tableGroupBoxes(doc).find((g) => g.id === unit.id) : undefined;

  // Its dressing, split the way the plan splits it: a cloth is the table's own surface and has no
  // spot of its own; everything else is laid by dressingSpots, exactly where the studio lays it.
  const onUnit = doc.placements.filter((p) => p.layer === "table" && p.tableId && unit.tableIds.includes(p.tableId));
  const cloths = onUnit.filter((p) => resolve(p.variantId)?.anchor === "table");
  const spots = members.flatMap((t) =>
    dressingSpots(
      t,
      onUnit.filter((p) => p.tableId === t.id && !cloths.includes(p)),
    ),
  );

  const { centre, ringW, ringH, world, offset } = detailFrame(members);

  // One mark per distinct item, in the kit's own order — the notes list the same marks.
  const markOf = new Map(kit.items.map((i, n) => [i.variantId, String(n + 1)]));
  const rows: NoteRow[] = kit.items.map((i) => {
    const info = lookup(i.variantId);
    const parts = info?.components?.map((c) => `${c.label} ×${c.count * i.quantity}`).join(" · ");
    const cloth = cloths.some((p) => p.variantId === i.variantId);
    return {
      mark: markOf.get(i.variantId),
      text: `${info?.variantLabel ?? "פריט"}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
      detail: [cloth ? "על השולחן כולו" : "", parts ?? ""].filter(Boolean).join(" · ") || undefined,
    };
  });

  const seats = block ? (group?.seats ?? 0) : (members[0]?.seats ?? 0);
  const numbers = kit.units.map((u) => u.number);
  const appliesTo = numbers.length === 1 ? `שולחן ${numbers[0] || "ראש"}` : `שולחנות ${formatTables(numbers)}`;
  // A kit that sits on tables of different shapes is drawn on the first; say so, rather than let the
  // crew assume the round drawn here is the shape of every table in the list.
  const shapes = new Set(
    kit.units.map((u) =>
      doc.tables
        .filter((t) => u.tableIds.includes(t.id))
        .map((t) => `${t.type}:${sizeOf(t)}`)
        .join("+"),
    ),
  );
  const sub = [
    appliesTo,
    block ? `בלוק של ${members.length} שולחנות` : members[0] ? sizeOf(members[0]) : "",
    seats ? `${seats} כיסאות` : "",
    shapes.size > 1 ? `הפריסה מוצגת על שולחן ${numbers[0] || "ראש"}` : "",
  ]
    .filter(Boolean)
    // RLM either side of each separator: between "Ø180" and "10" a bare "·" takes the numbers'
    // direction and the parts print in the wrong order.
    .join("‏ · ‏");

  const sheet: PlanSheet = { id: "detail", label: `פרט שולחן — ערכה ${kit.letter}`, layers: ["table"], tables: "full", chairs: true, numbers: false };

  return (
    <SheetFrame {...frame} world={world} sheet={sheet} notes={{ heading: `ערכה ${kit.letter}`, sub, rows }}>
      {(den: number) => {
        // Callouts: each piece's ray out to the ring, then spread along it so no two bubbles touch.
        const r = 2.6 * den;
        const per = perimeter(centre, ringW - PAD_MM * 0.2, ringH - PAD_MM * 0.2);
        const laid = spots
          .map((s, i) => {
            const fallback = (i / Math.max(1, spots.length)) * Math.PI * 2 - Math.PI / 2;
            const t0 = per.toT(rayToBox(centre, s.at, ringW - PAD_MM * 0.2, ringH - PAD_MM * 0.2, fallback));
            return { s, t0, t: t0 };
          })
          .sort((a, b) => a.t0 - b.t0);
        const gap = Math.min(r * 2.6, per.total / Math.max(1, laid.length));
        // Push each forward to clear the one before, then shift the whole run back by its mean drift
        // so the spreading does not walk every bubble round the table, and clear once more.
        const spread = () => {
          for (let i = 1; i < laid.length; i++) if (laid[i].t < laid[i - 1].t + gap) laid[i].t = laid[i - 1].t + gap;
        };
        spread();
        const drift = laid.reduce((n, l) => n + (l.t - l.t0), 0) / Math.max(1, laid.length);
        for (const l of laid) l.t -= drift;
        spread();
        return (
          <g transform={`translate(${offset.x} ${offset.y})`}>
            {/* Chairs as the plan draws them, and first: round a lone table by its own seat count,
                round the outside of a block by the block's. */}
            {!block &&
              members
                .filter((t) => t.seats)
                .map((t) => (
                  <g key={`seat-${t.id}`} transform={placed(t.position, t.rotation, t.mirrored)}>
                    {seatsAround(tableFootprint(t), t.seats!, undefined, tableBlockedSides(t)).map((s, i) => (
                      <ChairGlyph key={i} seat={s} />
                    ))}
                  </g>
                ))}
            {group && group.seats > 0 && (
              <g transform={`translate(${group.centre.x} ${group.centre.y})`}>
                {seatsAround({ kind: "rect", widthMm: group.widthMm, depthMm: group.depthMm }, group.seats).map((s, i) => (
                  <ChairGlyph key={i} seat={s} />
                ))}
              </g>
            )}
            {/* The table over its chairs — a chair's front is tucked under the table top. */}
            {members.map((t) => (
              <TableGlyph key={t.id} t={t} />
            ))}
            {spots.map(({ p, at, rotation, footprint }) => (
              <PlacementGlyph key={p.id} placement={{ ...p, rotation } as Placement} x={at.x} y={at.y} shape={footprint} />
            ))}
            {laid.map(({ s, t }) => {
              const b = per.toPt(t);
              const dx = s.at.x - b.x, dy = s.at.y - b.y;
              const d = Math.hypot(dx, dy) || 1;
              return (
                <g key={`c-${s.p.id}`}>
                  <line x1={b.x + (dx / d) * r} y1={b.y + (dy / d) * r} x2={s.at.x} y2={s.at.y} stroke={MUTED} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
                  <circle cx={s.at.x} cy={s.at.y} r={0.5 * den} fill={INK} />
                  <circle cx={b.x} cy={b.y} r={r} fill="#ffffff" stroke={INK} strokeWidth={LINE_WEIGHTS.furniture} vectorEffect="non-scaling-stroke" />
                  <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central" fontSize={2.8 * den} fontWeight={700} fontFamily="Assistant, sans-serif" fill={INK} className="nums">
                    {markOf.get(s.p.variantId) ?? "?"}
                  </text>
                </g>
              );
            })}
          </g>
        );
      }}
    </SheetFrame>
  );
}
