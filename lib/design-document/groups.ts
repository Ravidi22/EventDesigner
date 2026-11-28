import type { DesignDocumentContent, DesignTable, Placement, Point } from "./types";
import { benchIsNumbered, standaloneBench, type BenchLookup } from "./bench";

// Reading a document that has groups in it.
//
// Grouping itself is three actions in ./actions.ts; this is every question the rest of the app asks
// about the result, in one place so that the canvas, the inspector, the placement map and the legend
// cannot each answer "what number is this table" differently. That question in particular has one
// answer and it is not `table.number`: a table inside a group carries the group's number, because
// the designer pushed four of them together and told us they are one larger table now.

export interface GroupRef {
  kind: "table" | "placement";
  id: string;
}

const memberOf = (doc: DesignDocumentContent, r: GroupRef): { groupId?: string } | undefined =>
  r.kind === "table" ? doc.tables.find((t) => t.id === r.id) : doc.placements.find((p) => p.id === r.id);

/** Pull whole groups into a selection: touching one member is touching all of them.
 *
 *  Every selection on the canvas runs through this — a click, a shift-click, a rubber-band — which
 *  is what makes a group behave like one thing without a single line of the drag, delete or copy
 *  code having to know groups exist. They were already written to work on a list. */
export function expandToGroups(doc: DesignDocumentContent, refs: GroupRef[]): GroupRef[] {
  const ids = new Set<string>();
  for (const r of refs) {
    const g = memberOf(doc, r)?.groupId;
    if (g) ids.add(g);
  }
  if (ids.size === 0) return refs;
  const out = [...refs];
  const missing = (kind: GroupRef["kind"], id: string) => !out.some((r) => r.kind === kind && r.id === id);
  for (const t of doc.tables) if (t.groupId && ids.has(t.groupId) && missing("table", t.id)) out.push({ kind: "table", id: t.id });
  for (const p of doc.placements) if (p.groupId && ids.has(p.groupId) && missing("placement", p.id)) out.push({ kind: "placement", id: p.id });
  return out;
}

/** The one group a selection is exactly — its whole membership and nothing else. What the inspector
 *  needs in order to know it is looking at a group rather than at a handful of things. */
export function soleGroupId(doc: DesignDocumentContent, refs: GroupRef[]): string | undefined {
  if (refs.length < 2) return undefined;
  const first = memberOf(doc, refs[0])?.groupId;
  if (!first) return undefined;
  if (!refs.every((r) => memberOf(doc, r)?.groupId === first)) return undefined;
  const size = [...doc.tables, ...doc.placements].filter((x) => x.groupId === first).length;
  return refs.length === size ? first : undefined;
}

export function membersOf(
  doc: DesignDocumentContent,
  groupId: string,
): { tables: DesignTable[]; placements: Placement[] } {
  return {
    tables: doc.tables.filter((t) => t.groupId === groupId),
    placements: doc.placements.filter((p) => p.groupId === groupId),
  };
}

/** How many chairs go round a group: what its tables seat between them. Four tables pushed into one
 *  block seat what the four of them seat — the seam between two of them is not a place to sit, but
 *  it is not a seat lost either, it just moves to the outside. */
export function groupSeats(doc: DesignDocumentContent, groupId: string): number {
  return membersOf(doc, groupId).tables.reduce((n, t) => n + (t.seats ?? 0), 0);
}

/** How many of a group's chairs are spoken for: what its tables hold between them. A block is one
 *  table with one number, so it reports one occupancy — nobody seated at "the second table of
 *  four" thinks of themselves that way. Which member the designer typed the number on does not
 *  matter and is not shown; the sum is the fact. */
export function groupSeated(doc: DesignDocumentContent, groupId: string): number {
  return membersOf(doc, groupId).tables.reduce((n, t) => n + (t.seated ?? 0), 0);
}

/** Spread a block's occupancy back across the tables it is actually made of: fill each to its own
 *  seat count in order, and let any overflow land on the last one.
 *
 *  A group is one table with one number, so the designer types ONE occupancy for it — but it has to
 *  be stored somewhere, and `groupSeated` reads the sum back. Filling in order rather than dumping
 *  the lot on the first member is what keeps the numbers true if the block is ever broken up: two
 *  twelves seating 24 come apart as 12 and 12, not as 24 and 0. */
export function spreadSeated(
  doc: DesignDocumentContent,
  groupId: string,
  seated: number,
): { id: string; seated: number }[] {
  const tables = membersOf(doc, groupId).tables;
  let left = Math.max(0, Math.round(seated));
  return tables.map((t, i) => {
    const take = i === tables.length - 1 ? left : Math.min(left, t.seats ?? 0);
    left -= take;
    return { id: t.id, seated: take };
  });
}

/** Spread a block's CHAIR count back across its tables: as evenly as it divides, the remainder going
 *  to the first ones.
 *
 *  The chairs round a block are drawn from `groupSeats` — the sum — so the designer types one number
 *  for the lot and it has to land on the members. Even rather than "fill in order" (contrast
 *  spreadSeated): chairs are furniture, and a block of two that seats 20 comes apart as two tens,
 *  not as a twelve and an eight nobody asked for. */
export function spreadSeats(
  doc: DesignDocumentContent,
  groupId: string,
  seats: number,
): { id: string; seats: number }[] {
  const tables = membersOf(doc, groupId).tables;
  if (tables.length === 0) return [];
  const total = Math.max(0, Math.round(seats));
  const each = Math.floor(total / tables.length);
  const extra = total % tables.length;
  return tables.map((t, i) => ({ id: t.id, seats: each + (i < extra ? 1 : 0) }));
}

/** One numbered thing on the plan as the crew counts it. A `table` is a lone table (its id, its one
 *  tableId); a `group` is a block of tables with the one number they share (the group's id, every
 *  member); a `bench` is a standalone banquette somebody sits at (the placement's id, no tables at
 *  all — `tableIds` is empty, so a reader that walks tables simply finds none; one that must know
 *  says `kind`). */
export interface NumberedUnit {
  id: string;
  number: number;
  tableIds: string[];
  kind: "table" | "group" | "bench";
  /** The banquette, for a `bench` unit. */
  placementId?: string;
  /** Left out of the numbering on purpose (DesignTable.unnumbered) — a cocktail table, a gift table.
   *  It is still a table: counted, seated, dressed, packed. It just has no number to print, and
   *  `number` is then whatever it was stored with, which nothing may show. */
  unnumbered?: true;
}

/** Numbered units in number order, the unnumbered ones after them. */
export const byUnitOrder = (a: NumberedUnit, b: NumberedUnit) => (a.unnumbered ? 1 : 0) - (b.unnumbered ? 1 : 0) || a.number - b.number;

/** One entry per NUMBERED UNIT on the plan: a lone table, a whole group as the single larger table
 *  it now is, or — given a way to tell one (`benches`, lib/design-document/bench.ts) — a standalone
 *  banquette that seats somebody and carries a number. This is what the placement map labels and
 *  what the legend lists — both used to walk `doc.tables` directly, which with grouping would print
 *  the same number three times across one block and leave the crew reading a map with three table 4s
 *  on it.
 *
 *  A group nobody numbered falls back to the lowest number its numbered members brought with them,
 *  so a document can never produce an unnumbered unit out of a set of numbered tables. A unit the
 *  designer took out of the numbering (every one of its tables `unnumbered`) is still here — it is
 *  still a table — flagged, and sorted last.
 *
 *  Without `benches` no placement is a unit: the readers that have no catalog to hand (the legend of
 *  table dressing kits, the kits themselves, the quote's sections) list tables only, which for them
 *  is also the right answer — a banquette has no dressing kit and is quoted by the metre. */
export function numberedUnits(doc: DesignDocumentContent, benches?: BenchLookup): NumberedUnit[] {
  const units: NumberedUnit[] = [];
  for (const t of doc.tables) {
    if (!t.groupId) units.push({ id: t.id, number: t.number, tableIds: [t.id], kind: "table", ...(t.unnumbered ? { unnumbered: true as const } : {}) });
  }
  for (const g of doc.groups ?? []) {
    const tables = doc.tables.filter((t) => t.groupId === g.id);
    if (tables.length === 0) continue; // a group of stages is not a table and has no number
    const numbered = tables.filter((t) => !t.unnumbered);
    const number = g.number ?? Math.min(...(numbered.length ? numbered : tables).map((t) => t.number));
    units.push({ id: g.id, number, tableIds: tables.map((t) => t.id), kind: "group", ...(numbered.length === 0 ? { unnumbered: true as const } : {}) });
  }
  if (benches) {
    for (const p of doc.placements) {
      if (benchIsNumbered(p, standaloneBench(p, benches))) units.push({ id: p.id, number: p.bench!.number!, tableIds: [], kind: "bench", placementId: p.id });
    }
  }
  return units.sort(byUnitOrder);
}

/** The numbers the plan SHOWS — one per numbered unit, the head table's 0 included. Hidden numbers
 *  (a grouped table's own, underneath its group's) and unnumbered tables are not on it. A seated,
 *  numbered banquette's is, when `benches` can tell one. */
export function shownNumbers(doc: DesignDocumentContent, benches?: BenchLookup): number[] {
  return numberedUnits(doc, benches)
    .filter((u) => !u.unnumbered)
    .map((u) => u.number);
}

/** Every number a standalone banquette HOLDS (Placement.bench.number) — shown or not: a banquette
 *  nobody sits at keeps its number underneath and it comes back with the first seat, so no new
 *  table may take it meanwhile. Needs no catalog: the number is stored on the placement — but when
 *  `benches` can tell one, a number left on something that is no longer a banquette (its row
 *  re-filed) is held by nobody (QA BQ-8). */
function heldBenchNumbers(doc: DesignDocumentContent, benches?: BenchLookup): number[] {
  return doc.placements.flatMap((p) => (p.bench?.number !== undefined && (!benches || standaloneBench(p, benches)) ? [p.bench.number] : []));
}

/** The number a NEW table or banquette takes: one past the highest the plan shows — or that a
 *  banquette holds.
 *
 *  Off what is shown, not off `doc.tables`: a grouped table's own number is hidden under its
 *  group's, so reading the raw numbers both skipped (a block numbered 2 whose members still carry 7
 *  and 8 sent the next table to 9) and collided (a block renumbered to 12 over members 3 and 4 gave
 *  the next table 5… and the one after that, eventually, a second 12). */
export function nextTableNumber(doc: DesignDocumentContent, benches?: BenchLookup): number {
  return [...shownNumbers(doc, benches), ...heldBenchNumbers(doc, benches)].reduce((m, n) => Math.max(m, n), 0) + 1;
}

/** Numbers two units on the plan both show — two table 4s the crew cannot tell apart. The head
 *  table's 0 is a name, and two head tables are allowed. */
export function duplicateNumbers(doc: DesignDocumentContent, benches?: BenchLookup): Set<number> {
  const seen = new Set<number>();
  const twice = new Set<number>();
  for (const n of shownNumbers(doc, benches)) {
    if (n > 0 && seen.has(n)) twice.add(n);
    seen.add(n);
  }
  return twice;
}

/** Is this table out of the numbering — on its own, or as a block every table of which is? */
export function isUnnumbered(doc: DesignDocumentContent, table: DesignTable): boolean {
  if (!table.groupId) return !!table.unnumbered;
  return doc.tables.filter((t) => t.groupId === table.groupId).every((t) => t.unnumbered);
}

/** What a table is called on screen: its unit's number, the head table, or no number at all. */
export function tableLabel(doc: DesignDocumentContent, table: DesignTable): string {
  if (isUnnumbered(doc, table)) return "שולחן ללא מספר";
  const n = tableNumber(doc, table);
  return n > 0 ? `שולחן ${n}` : "שולחן ראש";
}

/** Give each of these tables a number nobody else on the plan shows — run when tables come back
 *  into the numbering as loose tables (an ungroup, the "ללא מספור" switch turned off).
 *
 *  A table KEEPS its own number when it is still free: ungrouping touches nothing it does not have
 *  to, and a block of 3 and 7 comes apart as 3 and 7. Only a number another unit now shows — the
 *  room was renumbered round the block while its members kept their old numbers underneath — is
 *  replaced, by the next one off the end, which is where a new table would go. The head table's 0
 *  and unnumbered tables are left alone. */
export function freeNumbers(doc: DesignDocumentContent, tableIds: readonly string[]): Map<string, number> {
  const ids = new Set(tableIds);
  // …and a banquette's held number is taken too (it needs no catalog to read: see nextTableNumber).
  const taken = new Set([
    ...numberedUnits(doc)
      .filter((u) => !u.unnumbered && !u.tableIds.some((id) => ids.has(id)))
      .map((u) => u.number),
    ...heldBenchNumbers(doc),
  ]);
  let next = [...taken].reduce((m, n) => Math.max(m, n), 0) + 1;
  const out = new Map<string, number>();
  const tables = doc.tables.filter((t) => ids.has(t.id) && !t.unnumbered).sort((a, b) => a.number - b.number);
  for (const t of tables) {
    if (t.number === 0) continue;
    let n = t.number;
    if (!(Number.isInteger(n) && n > 0) || taken.has(n)) {
      while (taken.has(next)) next++;
      n = next;
    }
    taken.add(n);
    next = Math.max(next, n + 1);
    if (n !== t.number) out.set(t.id, n);
  }
  return out;
}

/** One unit's new number. `kind` says which action carries it — a lone table renumbers itself, a
 *  group renumbers as a group, a banquette through its placement's bench spec. */
export interface Renumbering {
  kind: "table" | "group" | "bench";
  id: string;
  number: number;
}

/** How far apart two tables' centres can be, across the room, and still be read as the same ROW.
 *  Derived from the tables themselves rather than fixed: a room of 2.44m rounds has looser rows than
 *  a room of 1.2m squares, and a number that does not scale with the furniture either splits one row
 *  in half or swallows two. */
function rowBandMm(doc: DesignDocumentContent): number {
  const extents = doc.tables
    .map((t) => t.diameterMm ?? t.depthMm ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const median = extents.length ? extents[Math.floor(extents.length / 2)] : 1800;
  return Math.max(600, median * 0.6);
}

/** Which corner of the plan table 1 sits in. Named for where the sequence BEGINS, which is the
 *  question the designer is actually answering — "start from the stage" is a corner, not an axis.
 *
 *  The default is the top-right, because that is where a Hebrew reader's eye starts and because it
 *  is where the head table usually is. It is a default and not a law: a room whose entrance is at
 *  the bottom-left gets numbered from the bottom-left, and the crew walks in at table 1. */
export type NumberingCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

/** Whether the sequence runs along rows or down columns. A long banqueting room is read in rows; a
 *  room of tables ranked either side of an aisle is read in columns, and numbering that one in rows
 *  gives the crew a sequence that crosses the aisle and back on every single step. */
export type NumberingAxis = "rows" | "columns";

export interface NumberingOptions {
  /** What the first table is called. 1, unless the designer is numbering a second room that
   *  continues from the first — two halls of one event, 1..20 and 21..40. */
  start?: number;
  corner?: NumberingCorner;
  axis?: NumberingAxis;
  /** Whether each row reverses the one before (boustrophedon) rather than every row running the
   *  same way. This is how a person actually walks a room — up one line of tables and back down the
   *  next — so a crew laying place cards never crosses the whole floor to start a row. Off by
   *  default, because a plan whose rows all read the same way is easier to scan on paper: table 7
   *  is in the same column as table 14, and the eye finds it without working out which way row 2
   *  happened to run. */
  serpentine?: boolean;
}

export const DEFAULT_NUMBERING: Required<NumberingOptions> = {
  start: 1,
  corner: "top-right",
  axis: "rows",
  serpentine: false,
};

/**
 * Renumber every table on the plan in the order a person reads the room — by default 1, 2, 3… down
 * the plan in rows and RIGHT TO LEFT within each row, which is the direction this app's whole
 * interface reads, and configurable from there (see NumberingOptions).
 *
 * Numbering drifts. Tables get deleted, pasted, grouped and duplicated all through an evening's
 * work, and what the crew is finally handed is 1, 2, 5, 9, 14 scattered across the floor in no
 * order at all — every one of which somebody then has to find. This puts it back.
 *
 * Three things it will not do:
 *
 *   • A GROUP is one unit and takes one number, because that is what a group is. Its member tables
 *     keep the numbers they had underneath, unseen — those are what they go back to if the group is
 *     ever broken up, and rewriting them would be renumbering tables nobody is looking at.
 *   • A HEAD TABLE (number 0) stays 0. Zero is not a position in the sequence, it is a name.
 *   • Anything already correct is left alone: only units whose number actually changes come back, so
 *     a plan that is already in order produces no edit at all and the button that calls this can say
 *     so by being disabled.
 */
export function orderedNumbering(doc: DesignDocumentContent, options: NumberingOptions = {}, regions: Point[][] = [], benches?: BenchLookup): Renumbering[] {
  const { start, corner, axis, serpentine } = { ...DEFAULT_NUMBERING, ...options };
  const band = rowBandMm(doc);
  const placed = numberedUnits(doc, benches)
    .map((u) => {
      // A banquette stands where its placement stands; a table or a block where its tables do.
      if (u.kind === "bench") {
        const p = doc.placements.find((x) => x.id === u.id);
        return { ...u, x: p?.position.x ?? 0, y: p?.position.y ?? 0 };
      }
      const tables = doc.tables.filter((t) => u.tableIds.includes(t.id));
      return {
        ...u,
        x: tables.reduce((n, t) => n + t.position.x, 0) / tables.length,
        y: tables.reduce((n, t) => n + t.position.y, 0) / tables.length,
      };
    })
    // The head table is not in the sequence, and a table taken out of the numbering is in nothing.
    .filter((u) => u.number !== 0 && !u.unnumbered);

  // ONE ROOM AT A TIME. An event in the hall and the garden is numbered through the hall and then
  // through the garden — banding the two into shared rows interleaved them (hall 1, garden 2, hall
  // 3…), and the hall's own sheet of the placement set read 1, 3, 5. `regions` are the event's zone
  // outlines in its own order; a unit outside them all goes with the nearest. None or one: one room.
  const regionOf = (p: Point): number => {
    if (regions.length < 2) return 0;
    let best = 0;
    let bestD = Infinity;
    regions.forEach((r, i) => {
      const d = distanceToRegion(p, r);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const rooms = new Map<number, typeof placed>();
  for (const u of placed) {
    const k = regionOf(u);
    rooms.set(k, [...(rooms.get(k) ?? []), u]);
  }

  // The corner becomes two directions, and the axis picks which coordinate bands the room into
  // rows. Everything below then works in ONE direction only — increasing `major`, then increasing
  // `minor` — so there is a single traversal here rather than eight, and a new corner is
  // arithmetic rather than another branch. Each is +1 when the sequence runs the way the coordinate
  // grows (y down the plan, x to the right) and -1 when it runs against it.
  const down = corner.startsWith("top") ? 1 : -1;
  const across = corner.endsWith("right") ? -1 : 1; // starting on the right means x DEcreasing — RTL
  const inRows = axis === "rows";
  const major = (u: { x: number; y: number }) => (inRows ? u.y * down : u.x * across);
  const minor = (u: { x: number; y: number }) => (inRows ? u.x * across : u.y * down);

  const out: Renumbering[] = [];
  let n = Math.max(1, Math.round(start));
  for (const k of [...rooms.keys()].sort((a, b) => a - b)) {
    const rows: (typeof placed)[] = [];
    for (const u of [...rooms.get(k)!].sort((a, b) => major(a) - major(b))) {
      const row = rows[rows.length - 1];
      // Measured against the row's FIRST table, not its last: otherwise a line of tables each a
      // little lower than the one before drifts a whole row's height without ever starting a new one.
      if (row && major(u) - major(row[0]) <= band) row.push(u);
      else rows.push([u]);
    }
    for (const [i, row] of rows.entries()) {
      row.sort((a, b) => minor(a) - minor(b));
      if (serpentine && i % 2 === 1) row.reverse();
      for (const u of row) {
        if (u.number !== n) out.push({ kind: u.kind, id: u.id, number: n });
        n++;
      }
    }
  }
  return out;
}

/** 0 inside the outline, else the distance to its nearest edge. */
function distanceToRegion(p: Point, poly: Point[]): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return inside ? 0 : best;
}

/** The number this table shows on the plan: the group's, when it is in one. */
export function tableNumber(doc: DesignDocumentContent, table: DesignTable): number {
  if (!table.groupId) return table.number;
  const g = doc.groups?.find((x) => x.id === table.groupId);
  if (g?.number !== undefined) return g.number;
  const siblings = doc.tables.filter((t) => t.groupId === table.groupId);
  // The lowest number among the siblings that HAVE one: an unnumbered gift table grouped in still
  // carries its old stored number, and the plan, the print and numberedUnits all ignore it — the bar
  // and the labels must say the same number they do.
  const numbered = siblings.filter((t) => !t.unnumbered);
  return Math.min(...(numbered.length ? numbered : siblings).map((t) => t.number));
}

/** One table of a block that is being swapped for another size: where it stands, which way it faces,
 *  and the box it is now and the box it will be. */
export interface RefitMember {
  id: string;
  position: Point;
  rotation: number;
  from: { w: number; h: number };
  to: { w: number; h: number };
}

/** Where the tables of a block go when every one of them is swapped for a table of another size.
 *
 *  Four 180×90s pushed end to end and changed to 240×90s are still meant to be one long table — left
 *  on their old centres they would overlap by 60cm each, and changed to 120×90s they would stand
 *  apart with gaps nobody asked for. So each table's offset from the middle of the block is scaled,
 *  along the block's own axes, by how much the table grew along each — which keeps every seam closed
 *  and the block's middle where it was.
 *
 *  That only means something when the block is made of one size facing one way (or turned a half
 *  turn — the same box), which is how a run of tables is built. A block of mixed sizes or facings has
 *  no single scale; null, and the tables keep their centres. */
export function refitBlock(members: readonly RefitMember[]): Map<string, Point> | null {
  if (members.length < 2) return null;
  const [first] = members;
  const same = (a: { w: number; h: number }, b: { w: number; h: number }) => Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1;
  if (!members.every((m) => same(m.from, first.from) && same(m.to, first.to))) return null;
  if (!first.from.w || !first.from.h) return null;
  const sx = first.to.w / first.from.w;
  const sy = first.to.h / first.from.h;
  // Grown the same along both axes (a round for a round), the facing does not matter.
  const uniform = Math.abs(sx - sy) < 1e-9;
  const halfTurn = (deg: number) => (((deg - first.rotation) % 180) + 180) % 180;
  if (!uniform && !members.every((m) => Math.min(halfTurn(m.rotation), 180 - halfTurn(m.rotation)) < 0.5)) return null;

  const c = {
    x: members.reduce((s, m) => s + m.position.x, 0) / members.length,
    y: members.reduce((s, m) => s + m.position.y, 0) / members.length,
  };
  const a = (first.rotation * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) }; // the block's width axis, as its tables are turned
  const v = { x: -Math.sin(a), y: Math.cos(a) }; // …and its depth axis
  const out = new Map<string, Point>();
  for (const m of members) {
    const d = { x: m.position.x - c.x, y: m.position.y - c.y };
    const du = (d.x * u.x + d.y * u.y) * sx;
    const dv = (d.x * v.x + d.y * v.y) * sy;
    out.set(m.id, { x: Math.round(c.x + u.x * du + v.x * dv), y: Math.round(c.y + u.y * du + v.y * dv) });
  }
  return out;
}
