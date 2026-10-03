import type { DesignDocumentContent, DesignTable, Placement, Point } from "./types";
import { isMain } from "../self-check";

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

/** One entry per NUMBERED thing on the plan: a lone table, or a whole group as the single larger
 *  table it now is. This is what the placement map labels and what the legend lists — both used to
 *  walk `doc.tables` directly, which with grouping would print the same number three times across
 *  one block and leave the crew reading a map with three table 4s on it.
 *
 *  A group nobody numbered falls back to the lowest number its members brought with them, so a
 *  document can never produce an unnumbered unit out of a set of numbered tables. */
export function numberedUnits(
  doc: DesignDocumentContent,
): { id: string; number: number; tableIds: string[] }[] {
  const units: { id: string; number: number; tableIds: string[] }[] = [];
  for (const t of doc.tables) {
    if (!t.groupId) units.push({ id: t.id, number: t.number, tableIds: [t.id] });
  }
  for (const g of doc.groups ?? []) {
    const tables = doc.tables.filter((t) => t.groupId === g.id);
    if (tables.length === 0) continue; // a group of stages is not a table and has no number
    const number = g.number ?? Math.min(...tables.map((t) => t.number));
    units.push({ id: g.id, number, tableIds: tables.map((t) => t.id) });
  }
  return units.sort((a, b) => a.number - b.number);
}

/** One unit's new number. `kind` says which action carries it — a lone table renumbers itself, a
 *  group renumbers as a group. */
export interface Renumbering {
  kind: "table" | "group";
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
export function orderedNumbering(doc: DesignDocumentContent, options: NumberingOptions = {}): Renumbering[] {
  const { start, corner, axis, serpentine } = { ...DEFAULT_NUMBERING, ...options };
  const band = rowBandMm(doc);
  const placed = numberedUnits(doc)
    .map((u) => {
      const tables = doc.tables.filter((t) => u.tableIds.includes(t.id));
      return {
        ...u,
        kind: (doc.groups?.some((g) => g.id === u.id) ? "group" : "table") as "table" | "group",
        x: tables.reduce((n, t) => n + t.position.x, 0) / tables.length,
        y: tables.reduce((n, t) => n + t.position.y, 0) / tables.length,
      };
    })
    .filter((u) => u.number !== 0); // the head table is not in the sequence

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

  const rows: (typeof placed)[] = [];
  for (const u of [...placed].sort((a, b) => major(a) - major(b))) {
    const row = rows[rows.length - 1];
    // Measured against the row's FIRST table, not its last: otherwise a line of tables each a
    // little lower than the one before drifts a whole row's height without ever starting a new one.
    if (row && major(u) - major(row[0]) <= band) row.push(u);
    else rows.push([u]);
  }

  const out: Renumbering[] = [];
  let n = Math.round(start);
  for (const [i, row] of rows.entries()) {
    row.sort((a, b) => minor(a) - minor(b));
    if (serpentine && i % 2 === 1) row.reverse();
    for (const u of row) {
      if (u.number !== n) out.push({ kind: u.kind, id: u.id, number: n });
      n++;
    }
  }
  return out;
}

/** The number this table shows on the plan: the group's, when it is in one. */
export function tableNumber(doc: DesignDocumentContent, table: DesignTable): number {
  if (!table.groupId) return table.number;
  const g = doc.groups?.find((x) => x.id === table.groupId);
  if (g?.number !== undefined) return g.number;
  const siblings = doc.tables.filter((t) => t.groupId === table.groupId);
  return Math.min(...siblings.map((t) => t.number));
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

// ponytail: self-check. Run: node --experimental-strip-types lib/design-document/groups.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const t = (id: string, number: number, groupId?: string, seats = 12): DesignTable => ({
    id,
    type: "עגול 180",
    number,
    position: { x: 0, y: 0 },
    rotation: 0,
    diameterMm: 1800,
    seats,
    ...(groupId ? { groupId } : {}),
  });
  const p = (id: string, groupId?: string): Placement => ({
    id,
    variantId: "stage",
    layer: "floor",
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    ...(groupId ? { groupId } : {}),
  });
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [t("a", 3, "g1"), t("b", 7, "g1"), t("c", 9)],
    placements: [p("d1", "g2"), p("d2", "g2"), p("loose")],
    groups: [{ id: "g1", number: 3 }, { id: "g2" }],
  };

  // Touching one member is touching all of them.
  const one = expandToGroups(doc, [{ kind: "table", id: "a" }]);
  assert(one.length === 2 && one.some((r) => r.id === "b"), "selecting a member selects its group");
  assert(expandToGroups(doc, [{ kind: "table", id: "c" }]).length === 1, "an ungrouped table is left alone");
  const already = expandToGroups(doc, [{ kind: "table", id: "a" }, { kind: "table", id: "b" }]);
  assert(already.length === 2, "a group already whole is not doubled");
  const mixed = expandToGroups(doc, [{ kind: "table", id: "c" }, { kind: "placement", id: "d1" }]);
  assert(mixed.length === 3, "one loose thing plus a group of two");

  // What the inspector asks.
  assert(soleGroupId(doc, one) === "g1", "a selection that is exactly one group says so");
  assert(soleGroupId(doc, [{ kind: "table", id: "a" }]) === undefined, "…and half a group does not");
  assert(soleGroupId(doc, mixed) === undefined, "…nor does a group plus something else");
  assert(soleGroupId(doc, [{ kind: "table", id: "c" }]) === undefined, "…nor a lone ungrouped table");

  assert(groupSeats(doc, "g1") === 24, "a group seats what its tables seat between them");
  assert(groupSeats(doc, "g2") === 0, "a group of stages seats nobody");
  assert(groupSeated(doc, "g1") === 0, "an untouched block holds nobody yet");
  {
    // Two tables of twelve, taken as one block.
    const spread = (n: number) => spreadSeated(doc, "g1", n).map((x) => x.seated);
    assert(spread(24).join(",") === "12,12", "a full block comes apart as two full tables, not as one and an empty one");
    assert(spread(15).join(",") === "12,3", "…and a part-filled one fills in order");
    assert(spread(26).join(",") === "12,14", "over-seating lands on the last table rather than being lost");
    assert(spread(-5).join(",") === "0,0", "…and a negative occupancy seats nobody");
    assert(
      groupSeated({ ...doc, tables: doc.tables.map((t) => ({ ...t, seated: spreadSeated(doc, "g1", 15).find((x) => x.id === t.id)?.seated })) }, "g1") === 15,
      "what was spread across the block reads back as the number that was typed",
    );
  }
  {
    const seats = (n: number) => spreadSeats(doc, "g1", n).map((x) => x.seats);
    assert(seats(20).join(",") === "10,10", "a block's chairs divide evenly between its tables");
    assert(seats(21).join(",") === "11,10", "…the odd one going to the first");
    assert(seats(-4).join(",") === "0,0", "…and a negative count seats nobody");
    assert(spreadSeats(doc, "g2", 10).length === 0, "a group of stages has no tables to seat");
    assert(
      groupSeats({ ...doc, tables: doc.tables.map((t) => ({ ...t, seats: spreadSeats(doc, "g1", 21).find((x) => x.id === t.id)?.seats ?? t.seats })) }, "g1") === 21,
      "what was spread reads back as the number that was typed",
    );
  }
  assert(
    groupSeated({ ...doc, tables: doc.tables.map((t) => (t.groupId === "g1" ? { ...t, seated: 5 } : t)) }, "g1") === 10,
    "…and once filled it reports what its tables hold between them, not one table's share",
  );

  // Numbering: the group is ONE unit, the loose table is another, the stages are neither.
  const units = numberedUnits(doc);
  assert(units.length === 2, "a group of two tables and a loose one make two numbered units");
  assert(units[0].number === 3 && units[0].tableIds.length === 2, "the group is one unit carrying both tables");
  assert(units[1].number === 9, "…and the units come out in number order");
  assert(tableNumber(doc, doc.tables[1]) === 3, "a grouped table shows the group's number, not its own");
  assert(doc.tables[1].number === 7, "…while keeping its own underneath");
  assert(tableNumber(doc, doc.tables[2]) === 9, "an ungrouped table shows its own");

  // A group nobody numbered still has to produce a number.
  const unnumbered: DesignDocumentContent = { ...doc, groups: [{ id: "g1" }] };
  assert(numberedUnits(unnumbered)[0].number === 3, "an unnumbered group falls back to its lowest member");
  assert(tableNumber(unnumbered, unnumbered.tables[1]) === 3, "…and so does the table asking");

  // ── renumbering ───────────────────────────────────────────────────────────────────────────────
  {
    // Two rows of three, 3000 apart, numbered at random. Reading order is down the rows and right
    // to left inside each — so the top-right table is 1 and the bottom-left is 6.
    const at = (id: string, number: number, x: number, y: number): DesignTable => ({
      id,
      type: "עגול 180",
      number,
      position: { x, y },
      rotation: 0,
      diameterMm: 1800,
      seats: 12,
    });
    const room: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [
        at("tl", 9, 0, 0),
        at("tm", 2, 3000, 0),
        at("tr", 14, 6000, 0),
        at("bl", 5, 0, 3000),
        at("bm", 21, 3000, 3000),
        at("br", 1, 6000, 3000),
      ],
      placements: [],
    };
    const plan = new Map(orderedNumbering(room).map((r) => [r.id, r.number]));
    // Unchanged units are omitted, so read the answer through the existing numbers where absent.
    const numberOf = (id: string) => plan.get(id) ?? room.tables.find((t) => t.id === id)!.number;
    assert(numberOf("tr") === 1 && numberOf("tm") === 2 && numberOf("tl") === 3, "the top row numbers right to left");
    assert(numberOf("br") === 4 && numberOf("bm") === 5 && numberOf("bl") === 6, "…then the row below it, the same way");
    assert(orderedNumbering(room).every((r) => r.kind === "table"), "lone tables renumber as tables");

    // A row whose tables are not perfectly aligned is still one row.
    const ragged: DesignDocumentContent = {
      ...room,
      tables: [at("a", 3, 0, 0), at("b", 1, 3000, 400), at("c", 2, 6000, -300)],
    };
    const raggedPlan = new Map(orderedNumbering(ragged).map((r) => [r.id, r.number]));
    const raggedNumber = (id: string) => raggedPlan.get(id) ?? ragged.tables.find((t) => t.id === id)!.number;
    assert(raggedNumber("c") === 1 && raggedNumber("b") === 2 && raggedNumber("a") === 3, "a ragged row still reads as one row");

    // …but a genuine second row, a table-and-a-half below, is a second row.
    const twoRows: DesignDocumentContent = {
      ...room,
      tables: [at("up", 5, 0, 0), at("down", 6, 3000, 2600)],
    };
    const twoPlan = new Map(orderedNumbering(twoRows).map((r) => [r.id, r.number]));
    assert(twoPlan.get("up") === 1 && twoPlan.get("down") === 2, "a table well below the first is the next row, not the same one");

    // Already in order → nothing to do, which is what disables the button that calls this.
    const tidy: DesignDocumentContent = { ...room, tables: [at("r", 1, 3000, 0), at("l", 2, 0, 0)] };
    assert(orderedNumbering(tidy).length === 0, "a plan already in order produces no edit");

    // A group is ONE unit and takes one number; its members keep what they had underneath.
    const withBlock: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [
        { ...at("g1", 7, 0, 0), groupId: "blk" },
        { ...at("g2", 8, 1900, 0), groupId: "blk" },
        at("solo", 4, 6000, 0),
      ],
      placements: [],
      groups: [{ id: "blk", number: 7 }],
    };
    const blockPlan = orderedNumbering(withBlock);
    assert(blockPlan.length === 2, "a block of two tables plus a lone one is two units, both moving");
    assert(blockPlan.find((r) => r.id === "solo")?.number === 1, "the rightmost unit is 1");
    const blk = blockPlan.find((r) => r.id === "blk");
    assert(blk?.kind === "group" && blk.number === 2, "…and the block is 2, renumbered as a group");
    assert(!blockPlan.some((r) => r.id === "g1" || r.id === "g2"), "a group's members are not renumbered individually");

    // ── where the sequence starts, and which way it runs ──────────────────────────────────────
    // The same two rows of three, read from each of the four corners. `room` is laid out with x
    // growing to the right and y down the plan, so the top-right table is (6000, 0).
    {
      const numbers = (opts: NumberingOptions) => {
        const plan = new Map(orderedNumbering(room, opts).map((r) => [r.id, r.number]));
        return (id: string) => plan.get(id) ?? room.tables.find((t) => t.id === id)!.number;
      };

      const tr = numbers({ corner: "top-right" });
      assert(tr("tr") === 1 && tr("tl") === 3 && tr("bl") === 6, "the default corner is the top-right, read right to left");

      const tl = numbers({ corner: "top-left" });
      assert(tl("tl") === 1 && tl("tm") === 2 && tl("tr") === 3, "from the top-left, a row reads left to right");
      assert(tl("bl") === 4 && tl("br") === 6, "…and the row below it comes next");

      const br = numbers({ corner: "bottom-right" });
      assert(br("br") === 1 && br("bl") === 3 && br("tr") === 4, "from the bottom-right, the rooms's rows come up the plan");

      const bl = numbers({ corner: "bottom-left" });
      assert(bl("bl") === 1 && bl("br") === 3 && bl("tl") === 4, "…and from the bottom-left, up and to the right");

      // Columns: the room is banded by x instead, so the sequence runs DOWN a column and then to
      // the next one — the two tables of the rightmost column before anything in the middle.
      const cols = numbers({ axis: "columns" });
      assert(cols("tr") === 1 && cols("br") === 2, "in columns, the sequence runs down a column");
      assert(cols("tm") === 3 && cols("bm") === 4 && cols("tl") === 5, "…then moves to the next column along");

      // Serpentine: row 1 right-to-left, row 2 back the other way, so 3 and 4 are neighbours.
      const snake = numbers({ serpentine: true });
      assert(snake("tr") === 1 && snake("tl") === 3, "the first row of a serpentine reads as it always did");
      assert(snake("bl") === 4 && snake("br") === 6, "…and the second comes back the other way");
      assert(numbers({})("tr") === 1, "no options at all is the default");

      // A second room that continues the first, rather than starting again at 1.
      const from21 = numbers({ start: 21 });
      assert(from21("tr") === 21 && from21("bl") === 26, "a start number carries the whole sequence with it");

      // Every corner numbers every table exactly once — no gaps, no repeats, whichever way it runs.
      for (const corner of ["top-right", "top-left", "bottom-right", "bottom-left"] as NumberingCorner[]) {
        for (const axis of ["rows", "columns"] as NumberingAxis[]) {
          for (const serpentine of [false, true]) {
            const at = numbers({ corner, axis, serpentine });
            const got = room.tables.map((t) => at(t.id)).sort((a, b) => a - b);
            assert(got.join(",") === "1,2,3,4,5,6", `${corner}/${axis}${serpentine ? "/snake" : ""} numbers 1..6 exactly once`);
          }
        }
      }

      // A plan already in that order produces no edit — which is what disables the button, and has
      // to stay true for whichever corner the designer picked, not just the default one.
      const renumbered = {
        ...room,
        tables: room.tables.map((t) => ({ ...t, number: numbers({ corner: "bottom-left" })(t.id) })),
      };
      assert(orderedNumbering(renumbered, { corner: "bottom-left" }).length === 0, "a plan already numbered from that corner needs no edit");
      assert(orderedNumbering(renumbered, { corner: "top-right" }).length > 0, "…and numbering it from another one does");
    }

    // The head table keeps its name and takes no place in the sequence.
    const withHead: DesignDocumentContent = {
      ...room,
      tables: [at("head", 0, 3000, -3000), at("x", 6, 3000, 0), at("y", 9, 0, 0)],
    };
    const headPlan = new Map(orderedNumbering(withHead).map((r) => [r.id, r.number]));
    assert(!headPlan.has("head"), "the head table is never renumbered");
    assert(headPlan.get("x") === 1 && headPlan.get("y") === 2, "…and the sequence starts at 1 without it");
  }

  // A document drawn before grouping existed reads exactly as it always did.
  const old: DesignDocumentContent = { calibration: { mmPerUnit: 1 }, tables: [t("x", 1), t("y", 2)], placements: [] };
  assert(numberedUnits(old).length === 2 && expandToGroups(old, [{ kind: "table", id: "x" }]).length === 1, "no groups, no change");

  // A swapped block stays flush.
  {
    const run = (rotation: number, from = { w: 1800, h: 900 }, to = { w: 2400, h: 900 }) =>
      [-2700, -900, 900, 2700].map((x, i) => {
        const a = (rotation * Math.PI) / 180;
        return { id: `r${i}`, position: { x: x * Math.cos(a), y: x * Math.sin(a) }, rotation, from, to };
      });
    const long = refitBlock(run(0))!;
    assert(long.get("r0")!.x === -3600 && long.get("r1")!.x === -1200 && long.get("r3")!.x === 3600, "a run of 180s swapped for 240s stays end to end");
    assert(long.get("r2")!.y === 0, "…along its own line, about its own middle");
    const turned = refitBlock(run(90))!;
    assert(Math.abs(turned.get("r3")!.y - 3600) <= 1 && Math.abs(turned.get("r3")!.x) <= 1, "a run turned to the room stretches along the way it is turned");
    assert(refitBlock(run(180)) !== null, "a table turned a half turn is the same box");
    const rounds = refitBlock(run(0, { w: 1800, h: 1800 }, { w: 1500, h: 1500 }))!;
    assert(rounds.get("r3")!.x === 2250, "rounds swapped for smaller rounds close up");
    const mixed = run(0);
    mixed[1] = { ...mixed[1], from: { w: 1200, h: 900 } };
    assert(refitBlock(mixed) === null, "a block of mixed sizes keeps its centres");
    const askew = run(0);
    askew[1] = { ...askew[1], rotation: 45 };
    assert(refitBlock(askew) === null, "…and so does one of mixed facings");
    assert(refitBlock(run(0).slice(0, 1)) === null, "one table is not a block");
  }

  console.log("groups self-check passed");
}
