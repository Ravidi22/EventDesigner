// A TABLE AS THE DESIGNER SEES IT: one table standing alone, or a BLOCK of tables pushed together and
// grouped (Ctrl+G) — a head table of two halves, an imperial table of six. A block is one table to the
// people sitting at it and to the designer dressing it, and every "make these look like that one" on
// the sketch has to read it that way. Before this, each member was a table of its own to the pattern
// picker and the apply actions: a zig-zag lit one half of a head table and not the other, "all
// tables" dressed the other half of the source as a separate table, a block got a centrepiece per
// member, and a block could not be the SOURCE of anything at all — its bar had no design actions.
//
// A unit has a FRAME — a lone table's own, a block's (lib/design-document/block.ts: its first
// member's facing, centred on the box round every member) — and a design is carried from one unit to
// another by RELATIVE SPOT (lib/studio/hang-over.ts relativeSpot): an item a third of the way along a
// head table lands a third of the way along the next one, on whichever member is under that spot, in
// that member's own frame. A cloth is not placed by a spot: every member of a block wears one — the
// cloth of the source member standing at the same relative place.
//
// Not pure (it reads the catalog through the footprints), so it lives beside the screen like
// hang-targets.ts does.
import type { DesignDocumentContent, DesignTable, Placement, Point } from "@/lib/design-document/types";
import { tableNumber } from "@/lib/design-document/groups";
import { clampToTable, toTableFrame } from "@/lib/design-document/dressing";
import { relativeSpot, type OverFrame } from "@/lib/studio/hang-over";
import { resolve } from "@/lib/studio/catalog-resolver";
import { dressBlockOf, dressingSpots, pointOnTable, tableBlock, tableBox } from "@/components/footprint-shape";
import type { PatternTable } from "@/lib/studio/table-patterns";

export interface DressUnit {
  /** `g:<groupId>` for a block, the table's own id for a lone table. */
  key: string;
  /** Its tables, in document order. */
  ids: string[];
  /** Where it stands, which way it faces and how big it is. */
  frame: OverFrame;
  /** The number it shows (a block's one number); MAX for one out of the numbering. */
  number: number;
  /** What kind of table it is, for "אותו סוג" — a block by the kinds it is made of. */
  type: string;
}

const tableKind = (t: DesignTable) => (t.variantId ? resolve(t.variantId)?.product.id : undefined) ?? `type:${t.type}`;

/** A lone table's frame. */
export function tableFrame(t: DesignTable): OverFrame {
  const b = tableBox(t);
  return { position: t.position, rotation: t.rotation ?? 0, mirrored: t.mirrored, widthMm: b.widthMm, depthMm: b.depthMm };
}

/** Every unit on the plan, in the order of the tables. */
export function unitsOf(doc: DesignDocumentContent): DressUnit[] {
  const blocks = new Map<string, DesignTable[]>();
  for (const t of doc.tables) if (t.groupId) blocks.set(t.groupId, [...(blocks.get(t.groupId) ?? []), t]);
  const out: DressUnit[] = [];
  const seen = new Set<string>();
  for (const t of doc.tables) {
    const members = t.groupId ? (blocks.get(t.groupId) ?? [t]) : [t];
    // A "group" of one (a table grouped with a decoration only) is a lone table.
    if (members.length < 2) {
      out.push({ key: t.id, ids: [t.id], frame: tableFrame(t), number: t.unnumbered ? Number.MAX_SAFE_INTEGER : tableNumber(doc, t), type: tableKind(t) });
      continue;
    }
    const key = `g:${t.groupId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const blk = tableBlock(members);
    out.push({
      key,
      ids: members.map((m) => m.id),
      frame: blk ? { position: blk.centre, rotation: blk.rotation, widthMm: blk.widthMm, depthMm: blk.depthMm } : tableFrame(t),
      number: members.every((m) => m.unnumbered) ? Number.MAX_SAFE_INTEGER : tableNumber(doc, members[0]),
      type: `block:${members.map(tableKind).sort().join("+")}`,
    });
  }
  return out;
}

/** The unit a table belongs to. */
export function unitOf(units: readonly DressUnit[], tableId: string): DressUnit | undefined {
  return units.find((u) => u.ids.includes(tableId));
}

/** The units as the pattern picker reads them (lib/studio/table-patterns.ts) — one "table" each. */
export function patternUnits(units: readonly DressUnit[]): PatternTable[] {
  return units.map((u) => ({ id: u.key, position: u.frame.position, number: u.number, type: u.type, sizeMm: Math.max(u.frame.widthMm, u.frame.depthMm) }));
}

/** Is this a block (more than one table)? */
export const isBlock = (u: DressUnit) => u.ids.length > 1;

/** The member of a unit under a room point — or, off every member's top, the one whose middle is
 *  nearest (a spot carried onto a block can fall in the seam, or past a round end). */
export function memberAt(doc: DesignDocumentContent, u: DressUnit, room: Point): DesignTable | undefined {
  const members = u.ids.map((id) => doc.tables.find((t) => t.id === id)).filter((t): t is DesignTable => !!t);
  return members.find((t) => pointOnTable(t, room)) ?? [...members].sort((a, b) => Math.hypot(a.position.x - room.x, a.position.y - room.y) - Math.hypot(b.position.x - room.x, b.position.y - room.y))[0];
}

/** Where a room point over the frame `from` lands on `to`: the member and the point in its own
 *  frame, kept on its top for an item of this size. */
export function landOn(doc: DesignDocumentContent, from: OverFrame, to: DressUnit, room: Point, size: { widthMm: number; depthMm: number }): { table: DesignTable; local: Point } | null {
  const at = relativeSpot(from, to.frame, room);
  const table = memberAt(doc, to, at);
  if (!table) return null;
  return { table, local: clampToTable(tableBox(table), size, toTableFrame(table, at)) };
}

type Worn = Omit<Placement, "id" | "tableId">;
const strip = (p: Placement): Worn => {
  const { id: _i, tableId: _t, groupId: _g, ...rest } = p;
  void _i; void _t; void _g;
  return rest;
};

/** The cover a table wears (its cloth), if any — never a runner, which is an item on top. */
export function coverOf(doc: DesignDocumentContent, tableId: string): Placement | undefined {
  return doc.placements.find((p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor === "table");
}

/** A whole unit's dressing, carried onto another unit: for each of the target's tables, the items it
 *  should wear (their `position` in that table's frame) and whether they stand where they are put
 *  (`arranged` — a source table arranged by hand) or are laid out on it automatically. Every target
 *  table is in the map, an empty list included: "replace" must strip a member nothing lands on. */
export function carriedDressing(doc: DesignDocumentContent, from: DressUnit, to: DressUnit): Map<string, { items: Worn[]; arranged: boolean }> {
  const out = new Map<string, { items: Worn[]; arranged: boolean }>(to.ids.map((id) => [id, { items: [], arranged: false }]));
  const tables = new Map(doc.tables.map((t) => [t.id, t]));
  // The cloth: each target table wears the cover of the source table at the same relative place.
  for (const id of to.ids) {
    const t = tables.get(id);
    if (!t) continue;
    const back = memberAt(doc, from, relativeSpot(to.frame, from.frame, t.position));
    const cover = back ? coverOf(doc, back.id) : undefined;
    if (cover) out.get(id)!.items.push({ ...strip(cover), position: { x: 0, y: 0 } });
  }
  // Everything set out on the source's tables, each to the same relative spot on the target.
  for (const id of from.ids) {
    const src = tables.get(id);
    if (!src) continue;
    const chipsOf = (tableId: string) => doc.placements.filter((p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor !== "table");
    // Where they stand as DRAWN — a block laid out automatically is laid out as one (dressBlockOf).
    for (const sp of dressingSpots(src, chipsOf(id), dressBlockOf(doc.tables, src, chipsOf))) {
      const landed = landOn(doc, from.frame, to, sp.at, sp.box);
      if (!landed) continue;
      const entry = out.get(landed.table.id);
      if (!entry) continue;
      entry.items.push({ ...strip(sp.p), position: landed.local });
      if (src.arranged) entry.arranged = true;
    }
  }
  return out;
}
