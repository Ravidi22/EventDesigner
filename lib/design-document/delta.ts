// What changed between two drawings of one event, and how to carry a chosen part of it onto a third.
//
// The client side of the product rests on this file (docs/superpowers/specs/2026-10-16-client-side-
// design.md). A client never edits the designer's drawing: they edit a COPY (a sketch proposal), and
// the designer approves the difference. Three jobs, one pair of functions:
//
//   • the PERMISSION FILTER — every client save is re-derived on the server as
//     merge(base, base, proposed, allowed): what the client may not change cannot reach the row,
//     whatever the browser sent, because the merge copies only the fields of the aspects it applies;
//   • the DELTA the designer sees — diffDocuments(base, proposed), drawn as ghosts and arrows;
//   • the APPROVAL — merge(current, base, proposed, ticked): the client's changes carried onto the
//     designer's CURRENT drawing, which may have moved on since the client forked it.
//
// It is a THREE-WAY merge and never a "take the client's document": the designer may have dressed
// three more tables since, and an approval that replaced the drawing would undo that silently.
// Each change is applied aspect by aspect (moved, turned, retyped, seats…), and an aspect the
// designer ALSO changed since the fork is a conflict — reported, and applied only when forced.
//
// Every write goes through the document reducer (./actions.ts apply), so the invariants live in one
// place: a removed table takes its dressing with it and frees what hung over it, a moved table
// carries its hung chandelier (settleHung), an emptied group is pruned.
//
// Pure, shared by the server (the filter) and the browser (the review), self-checked:
// `npm run check:delta`.
import type { DesignDocumentContent, DesignGroup, DesignTable, Placement } from "./types";
import { apply } from "./actions";
import { duplicateNumbers, nextTableNumber, numberedUnits } from "./groups";
import { isMain } from "../self-check";

/** One thing about a table that a change can be about. Applied in this order — a retype first, so
 *  a size or a seat count chosen after it lands on the new table rather than being reset by it. */
export const TABLE_ASPECTS = ["type", "size", "position", "rotation", "seats", "seated", "number", "numbered"] as const;
export type TableAspect = (typeof TABLE_ASPECTS)[number];

/** The fields an aspect COPIES when it is applied. Absent in the proposal = absent in the result,
 *  so "back to the catalog's size" travels as well as a new size does. Anything not listed here —
 *  style, chairs, blocked sides, stacking, dressing positions — is never copied from a proposal,
 *  which is the whole of the permission filter's guarantee. */
const ASPECT_FIELDS: Record<TableAspect, (keyof DesignTable)[]> = {
  // A retype is the studio's swap (retypeTable): the shape and the seats come from the new row and
  // the old row's blocked sides and stretch go — so they are copied too, gone or not.
  type: ["type", "variantId", "diameterMm", "widthMm", "depthMm", "blockedSides", "sizeMm", "seats"],
  size: ["sizeMm"],
  position: ["position"],
  rotation: ["rotation", "mirrored"],
  seats: ["seats"],
  seated: ["seated"],
  number: ["number"],
  numbered: ["unnumbered"],
};

/** Under these a move or a turn is a hand resting on the mouse, not a decision. */
const MOVE_MM = 10;
const TURN_DEG = 0.5;

export interface TableChange {
  /** `table:<id>` — stable across re-diffs, so a review's ticks survive the preview re-rendering. */
  key: string;
  kind: "table";
  op: "add" | "remove" | "edit";
  id: string;
  /** For an edit: which aspects changed, in TABLE_ASPECTS order. Empty for an add or a remove. */
  aspects: TableAspect[];
  /** The table in the base drawing (edit, remove). */
  before?: DesignTable;
  /** The table in the proposal (add, edit). */
  after?: DesignTable;
}

/** A block's shared number (DesignGroup.number) — the one thing about a group a client may change. */
export interface GroupChange {
  key: string;
  kind: "group";
  op: "edit";
  id: string;
  aspects: ["number"];
  before: DesignGroup;
  after: DesignGroup;
}

export type DocChange = TableChange | GroupChange;

export type ConflictReason =
  /** The designer has removed the table this change is about. */
  | "removed"
  /** The designer has changed this same aspect since the client forked the drawing. */
  | "changed"
  /** A remove of a table the designer has edited since — removing it would discard their work. */
  | "edited-since"
  /** The number is shown by another table on the merged plan. */
  | "number-taken";

export interface Conflict {
  key: string;
  aspect?: TableAspect | "number";
  reason: ConflictReason;
}

export interface MergeResult {
  doc: DesignDocumentContent;
  /** What was NOT carried over, and why. A forced key never appears here for "changed"/"edited-since". */
  conflicts: Conflict[];
  /** The keys that changed something in the result. A change already true of the current drawing
   *  (both sides made it) is applied and listed: there is nothing left for anybody to decide. */
  applied: string[];
  /** Added tables whose number was taken by the time they were merged, and the number they got. */
  renumbered: { key: string; from: number; to: number }[];
}

const tableKey = (id: string) => `table:${id}`;
const groupKey = (id: string) => `group:${id}`;

function angleGap(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Does this aspect read the same on both tables? Positions and turns within their tolerance. */
function sameAspect(aspect: TableAspect, a: DesignTable, b: DesignTable): boolean {
  switch (aspect) {
    case "position":
      return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < MOVE_MM;
    case "rotation":
      return angleGap(a.rotation, b.rotation) < TURN_DEG && !!a.mirrored === !!b.mirrored;
    case "type":
      // Detected on WHICH table it is, not on its dimensions — those follow the type.
      return a.type === b.type && (a.variantId ?? null) === (b.variantId ?? null);
    case "numbered":
      return !!a.unnumbered === !!b.unnumbered;
    default:
      return ASPECT_FIELDS[aspect].every((f) => sameValue(a[f], b[f]));
  }
}

function changedAspects(a: DesignTable, b: DesignTable): TableAspect[] {
  return TABLE_ASPECTS.filter((x) => !sameAspect(x, a, b));
}

/** `to` with this aspect's fields taken from `from` — present or absent, exactly as `from` has them. */
function withAspect(to: DesignTable, from: DesignTable, aspect: TableAspect): DesignTable {
  const next: Record<string, unknown> = { ...to };
  for (const f of ASPECT_FIELDS[aspect]) {
    if (from[f] === undefined) delete next[f];
    else next[f] = from[f];
  }
  return next as unknown as DesignTable;
}

/**
 * Every change from `base` to `proposed`, keyed by what it is about. Tables first in the proposal's
 * order (adds and edits), then removals in the base's order, then block numbers.
 */
export function diffDocuments(base: DesignDocumentContent, proposed: DesignDocumentContent): DocChange[] {
  const out: DocChange[] = [];
  const was = new Map(base.tables.map((t) => [t.id, t]));
  const now = new Map(proposed.tables.map((t) => [t.id, t]));
  for (const t of proposed.tables) {
    const b = was.get(t.id);
    if (!b) {
      out.push({ key: tableKey(t.id), kind: "table", op: "add", id: t.id, aspects: [], after: t });
      continue;
    }
    const aspects = changedAspects(b, t);
    if (aspects.length) out.push({ key: tableKey(t.id), kind: "table", op: "edit", id: t.id, aspects, before: b, after: t });
  }
  for (const t of base.tables) {
    if (!now.has(t.id)) out.push({ key: tableKey(t.id), kind: "table", op: "remove", id: t.id, aspects: [], before: t });
  }
  const groupsNow = new Map((proposed.groups ?? []).map((g) => [g.id, g]));
  for (const g of base.groups ?? []) {
    const p = groupsNow.get(g.id);
    if (p && (p.number ?? null) !== (g.number ?? null)) {
      out.push({ key: groupKey(g.id), kind: "group", op: "edit", id: g.id, aspects: ["number"], before: g, after: p });
    }
  }
  return out;
}

/** What an added table brings with it: its dressing, and anything hung over it, as the proposal has
 *  them — "one more like this one" is a dressed table, not a bare top. */
function broughtWith(proposed: DesignDocumentContent, tableId: string): Placement[] {
  return proposed.placements.filter((p) => p.tableId === tableId || p.over === tableId);
}

/** What stands on a table, in a stable order — compared between two drawings. */
function dressingOf(doc: DesignDocumentContent, tableId: string): Placement[] {
  return doc.placements.filter((p) => p.tableId === tableId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Put `table` in place of the one with its id, through the reducer — so whatever hangs over it is
 *  carried by the move (settleHung runs after every action). */
function putTable(doc: DesignDocumentContent, table: DesignTable): DesignDocumentContent {
  return apply(doc, { type: "loadDocument", content: { ...doc, tables: doc.tables.map((t) => (t.id === table.id ? table : t)) } });
}

export interface MergeOptions {
  /** The changes to carry over, by key. Absent = every change in the diff. */
  accept?: Iterable<string>;
  /** Changes to carry over even where the designer changed the same thing since. */
  force?: Iterable<string>;
}

/**
 * Carry the accepted changes from `base → proposed` onto `current`.
 *
 * `current` may be `base` itself — that is the permission filter, and with the same object on both
 * sides no aspect can conflict.
 */
export function mergeChanges(
  current: DesignDocumentContent,
  base: DesignDocumentContent,
  proposed: DesignDocumentContent,
  options: MergeOptions = {},
): MergeResult {
  const all = diffDocuments(base, proposed);
  const accept = options.accept ? new Set(options.accept) : null;
  const force = new Set(options.force ?? []);
  const changes = accept ? all.filter((c) => accept.has(c.key)) : all;

  let doc = current;
  const conflicts: Conflict[] = [];
  const applied: string[] = [];
  const renumbered: MergeResult["renumbered"] = [];
  /** Tables whose number this merge wrote, and what the current drawing had — for the clash pass. */
  const numberedHere = new Map<string, { key: string; previous: number | null }>();
  const currentGroups = new Set((current.groups ?? []).map((g) => g.id));

  const tableIn = (d: DesignDocumentContent, id: string) => d.tables.find((t) => t.id === id);

  for (const c of changes) {
    if (c.kind === "group") {
      const g = doc.groups?.find((x) => x.id === c.id);
      if (!g) {
        conflicts.push({ key: c.key, aspect: "number", reason: "removed" });
        continue;
      }
      if ((g.number ?? null) === (c.after.number ?? null)) {
        applied.push(c.key);
        continue;
      }
      if ((g.number ?? null) !== (c.before.number ?? null) && !force.has(c.key)) {
        conflicts.push({ key: c.key, aspect: "number", reason: "changed" });
        continue;
      }
      if (c.after.number === undefined) continue;
      doc = apply(doc, { type: "renumberGroup", groupId: c.id, number: c.after.number });
      applied.push(c.key);
      continue;
    }

    if (c.op === "add") {
      if (tableIn(doc, c.id)) {
        applied.push(c.key); // merged before: nothing to add twice
        continue;
      }
      // A client cannot make a block, so a table that names a group the drawing does not have is
      // a loose table. One that names an existing group joins it (a duplicate of a block member).
      const after = c.after!;
      let table: DesignTable = after.groupId && !currentGroups.has(after.groupId) ? (({ groupId: _g, ...rest }) => (void _g, rest))(after) : after;
      if (!table.groupId && !table.unnumbered && table.number > 0 && shownBy(doc, table.number)) {
        const to = nextTableNumber(doc);
        renumbered.push({ key: c.key, from: table.number, to });
        table = { ...table, number: to };
      }
      doc = apply(doc, { type: "addTable", table });
      const have = new Set(doc.placements.map((p) => p.id));
      for (const p of broughtWith(proposed, c.id)) {
        if (!have.has(p.id)) doc = apply(doc, { type: "addPlacement", placement: p });
      }
      if (!table.groupId) numberedHere.set(c.id, { key: c.key, previous: null });
      applied.push(c.key);
      continue;
    }

    if (c.op === "remove") {
      const cur = tableIn(doc, c.id);
      if (!cur) {
        applied.push(c.key); // the designer removed it too
        continue;
      }
      // Edited since = any aspect of the table, OR what stands on it: a table the designer dressed
      // after the client forked carries their work, and removing it would throw that away unseen.
      const redressed = !sameValue(dressingOf(base, c.id), dressingOf(doc, c.id));
      if ((changedAspects(c.before!, cur).length > 0 || redressed) && !force.has(c.key)) {
        conflicts.push({ key: c.key, reason: "edited-since" });
        continue;
      }
      doc = apply(doc, { type: "removeTable", id: c.id });
      applied.push(c.key);
      continue;
    }

    // An edit, aspect by aspect.
    const cur = tableIn(doc, c.id);
    if (!cur) {
      conflicts.push({ key: c.key, reason: "removed" });
      continue;
    }
    let next = cur;
    let touched = false;
    for (const aspect of c.aspects) {
      if (sameAspect(aspect, next, c.after!)) {
        touched = true; // both sides made it
        continue;
      }
      if (!sameAspect(aspect, c.before!, cur) && !force.has(c.key)) {
        conflicts.push({ key: c.key, aspect, reason: "changed" });
        continue;
      }
      if (aspect === "number" && !next.groupId) numberedHere.set(c.id, { key: c.key, previous: cur.number });
      next = withAspect(next, c.after!, aspect);
      touched = true;
    }
    if (next !== cur) doc = putTable(doc, next);
    if (touched) applied.push(c.key);
  }

  // Never two table 4s. A number this merge wrote that another unit also shows goes back to what
  // the current drawing had (or, for an added table, to the next free one) — repeated, because
  // putting one back can uncover another. Bounded: each pass settles at least one table for good.
  for (let pass = 0; pass <= numberedHere.size; pass++) {
    const twice = duplicateNumbers(doc);
    if (twice.size === 0) break;
    let fixed = false;
    for (const [id, { key, previous }] of numberedHere) {
      const t = tableIn(doc, id);
      if (!t || t.unnumbered || !twice.has(t.number)) continue;
      const to = previous ?? nextTableNumber({ ...doc, tables: doc.tables.filter((x) => x.id !== id) });
      if (previous !== null) conflicts.push({ key, aspect: "number", reason: "number-taken" });
      else renumbered.push({ key, from: t.number, to });
      doc = putTable(doc, { ...t, number: to });
      numberedHere.delete(id);
      fixed = true;
      break;
    }
    if (!fixed) break;
  }

  return { doc, conflicts, applied: applied.filter((k) => !conflicts.some((x) => x.key === k && x.aspect === undefined)), renumbered };
}

/** Does a unit on this plan already show `n`? */
function shownBy(doc: DesignDocumentContent, n: number): boolean {
  return numberedUnits(doc).some((u) => !u.unnumbered && u.number === n);
}

/**
 * A draft forked from `oldBase`, carried onto the designer's newer `newBase` (the client opened the
 * editor after the designer had moved on). What still applies is kept; what the designer has since
 * changed underneath is dropped and returned, so the editor can say which.
 */
export function rebaseDraft(
  oldBase: DesignDocumentContent,
  draft: DesignDocumentContent,
  newBase: DesignDocumentContent,
): { content: DesignDocumentContent; dropped: Conflict[] } {
  const { doc, conflicts } = mergeChanges(newBase, oldBase, draft);
  return { content: doc, dropped: conflicts };
}

if (isMain(import.meta.url)) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log("  ok   " + what);
  };
  const T = (id: string, number: number, x: number, extra: Partial<DesignTable> = {}): DesignTable => ({
    id,
    type: "עגול 180",
    variantId: "v-round",
    number,
    position: { x, y: 0 },
    rotation: 0,
    diameterMm: 1800,
    seats: 12,
    ...extra,
  });
  const cloth = (id: string, tableId: string): Placement => ({ id, variantId: "v-cloth", layer: "table", quantity: 1, tableId, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
  const doc = (tables: DesignTable[], placements: Placement[] = [], groups?: DesignGroup[]): DesignDocumentContent => ({
    calibration: { mmPerUnit: 1 },
    tables,
    placements,
    ...(groups ? { groups } : {}),
  });

  const base = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b")]);

  // ── the diff ──
  {
    const proposed = doc(
      [T("a", 1, 500), T("b", 2, 3000, { rotation: 90, seats: 10 }), T("n", 4, 9000)],
      [cloth("ca", "a"), cloth("cb", "b"), cloth("cn", "n")],
    );
    const d = diffDocuments(base, proposed);
    const by = new Map(d.map((c) => [c.key, c]));
    assert(by.get("table:a")?.op === "edit" && (by.get("table:a") as TableChange).aspects.join() === "position", "a move is one aspect");
    assert((by.get("table:b") as TableChange).aspects.join() === "rotation,seats", "a turn and a seat count, in aspect order");
    assert(by.get("table:n")?.op === "add", "a new table is an add");
    assert(by.get("table:c")?.op === "remove", "a missing table is a remove");
    const jiggle = doc([T("a", 1, 4), T("b", 2, 3000, { rotation: 0.2 }), T("c", 3, 6000)]);
    assert(diffDocuments(base, jiggle).length === 0, "4mm and 0.2° are not changes");
    const styled = doc([T("a", 1, 0, { style: { fill: "#000" } }), T("b", 2, 3000), T("c", 3, 6000)]);
    assert(diffDocuments(base, styled).length === 0, "a field no aspect owns is not a change a client can make");
  }

  // ── the permission filter: merge onto the base itself ──
  {
    const proposed = doc(
      [T("a", 1, 500, { style: { fill: "#f00" }, chairVariantId: "gold" }), T("b", 2, 3000), T("c", 3, 6000)],
      [cloth("ca", "a"), cloth("cb", "b"), { ...cloth("x", "a"), variantId: "v-centrepiece" }],
    );
    const { doc: safe, conflicts } = mergeChanges(base, base, proposed);
    const a = safe.tables.find((t) => t.id === "a")!;
    assert(conflicts.length === 0, "the base can never conflict with itself");
    assert(a.position.x === 500, "the move is kept");
    assert(a.style === undefined && a.chairVariantId === undefined, "style and chairs never travel from a proposal");
    assert(!safe.placements.some((p) => p.id === "x"), "a centrepiece added to an existing table does not travel");
  }

  // ── the approval: three-way ──
  {
    // The designer moved on: dressed c, turned a, renumbered b to 7.
    const current = doc([T("a", 1, 0, { rotation: 45 }), T("b", 7, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b"), cloth("cc", "c")]);
    const proposed = doc(
      [T("a", 1, 500, { rotation: 90 }), T("b", 5, 3000, { seats: 10 }), T("n", 4, 9000)],
      [cloth("ca", "a"), cloth("cb", "b"), cloth("cn", "n")],
    );
    const r = mergeChanges(current, base, proposed);
    const t = (id: string) => r.doc.tables.find((x) => x.id === id);
    assert(t("a")!.position.x === 500 && t("a")!.rotation === 45, "a's move lands, its turn (which the designer also changed) does not");
    assert(r.conflicts.some((c) => c.key === "table:a" && c.aspect === "rotation" && c.reason === "changed"), "…and the turn is reported");
    assert(t("b")!.seats === 10 && t("b")!.number === 7, "b's seats land, the number the designer changed stands");
    assert(r.conflicts.some((c) => c.key === "table:c" && c.reason === "edited-since") && t("c") && r.doc.placements.some((p) => p.id === "cc"), "removing a table the designer has dressed since waits");
    assert(t("n") && r.doc.placements.some((p) => p.id === "cn"), "an added table brings its cloth");
    const forced = mergeChanges(current, base, proposed, { force: ["table:a", "table:c"] });
    assert(forced.doc.tables.find((x) => x.id === "a")!.rotation === 90, "a forced change takes the client's turn");
    assert(!forced.doc.tables.some((x) => x.id === "c") && !forced.doc.placements.some((p) => p.tableId === "c"), "a forced remove takes the table and its dressing");
    const untouched = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b")]);
    const r4 = mergeChanges(untouched, base, doc([T("a", 1, 0), T("b", 2, 3000)], [cloth("ca", "a"), cloth("cb", "b")]));
    assert(!r4.doc.tables.some((x) => x.id === "c") && r4.conflicts.length === 0, "a table nobody touched since is simply removed");
  }
  {
    // Removing a table the designer has since moved is a conflict, not a silent loss.
    const current = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 3, 7000)]);
    const proposed = doc([T("a", 1, 0), T("b", 2, 3000)]);
    const r = mergeChanges(current, base, proposed);
    assert(r.conflicts.some((c) => c.key === "table:c" && c.reason === "edited-since") && r.doc.tables.some((x) => x.id === "c"), "removing an edited table waits");
    const removedByDesigner = doc([T("a", 1, 0), T("c", 3, 6000)]);
    const edit = doc([T("a", 1, 0), T("b", 2, 3000, { seats: 8 }), T("c", 3, 6000)]);
    const r2 = mergeChanges(removedByDesigner, base, edit);
    assert(r2.conflicts.some((c) => c.key === "table:b" && c.reason === "removed"), "an edit to a table the designer removed is reported");
  }

  // ── numbers ──
  {
    // The client swapped 1 and 2: never two 1s, at any point that is returned.
    const proposed = doc([T("a", 2, 0), T("b", 1, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b")]);
    const r = mergeChanges(base, base, proposed);
    assert(r.doc.tables.find((x) => x.id === "a")!.number === 2 && r.doc.tables.find((x) => x.id === "b")!.number === 1, "a swap of two numbers lands whole");
    assert(duplicateNumbers(r.doc).size === 0, "…with no duplicate");
    // The designer added a table 4 meanwhile, and the client's new table is also 4.
    const current = doc([...base.tables, T("d", 4, 12000)], base.placements);
    const added = doc([...base.tables, T("n", 4, 9000)], base.placements);
    const r2 = mergeChanges(current, base, added);
    assert(r2.doc.tables.find((x) => x.id === "n")!.number === 5 && r2.renumbered[0]?.to === 5, "an added table whose number is taken gets the next one");
    // The client renumbered c to 4, which the designer's new table now shows.
    const renum = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 4, 6000)], base.placements);
    const r3 = mergeChanges(current, base, renum);
    assert(r3.doc.tables.find((x) => x.id === "c")!.number === 3 && r3.conflicts.some((c) => c.key === "table:c" && c.reason === "number-taken"), "a renumber onto a taken number is put back and reported");
  }

  // ── a retype resets what the studio's swap resets ──
  {
    const blocked = doc([T("a", 1, 0, { blockedSides: [0] }), T("b", 2, 3000), T("c", 3, 6000)]);
    const proposed = doc([
      { id: "a", type: "מלבן 240", variantId: "v-rect", number: 1, position: { x: 0, y: 0 }, rotation: 0, widthMm: 2400, depthMm: 1200, seats: 10 },
      T("b", 2, 3000),
      T("c", 3, 6000),
    ]);
    const a = mergeChanges(blocked, blocked, proposed).doc.tables.find((x) => x.id === "a")!;
    assert(a.variantId === "v-rect" && a.widthMm === 2400 && a.diameterMm === undefined && a.blockedSides === undefined && a.seats === 10, "a retype is the studio's swap");
  }

  // ── blocks ──
  {
    const grouped = doc([T("a", 1, 0, { groupId: "g" }), T("b", 2, 1800, { groupId: "g" }), T("c", 3, 6000)], [], [{ id: "g", number: 1 }]);
    const proposed = { ...grouped, groups: [{ id: "g", number: 9 }] };
    const r = mergeChanges(grouped, grouped, proposed);
    assert(r.doc.groups?.[0].number === 9 && r.applied.includes("group:g"), "a block's number is a change of its own");
    const loose = doc([...grouped.tables, T("n", 4, 9000, { groupId: "zz" })], [], grouped.groups);
    const r2 = mergeChanges(grouped, grouped, loose);
    assert(r2.doc.tables.find((x) => x.id === "n")!.groupId === undefined, "a new table naming a block that does not exist is loose");
  }

  // ── selection and rebase ──
  {
    const proposed = doc([T("a", 1, 500), T("b", 2, 3000, { seats: 8 }), T("c", 3, 6000)], base.placements);
    const r = mergeChanges(base, base, proposed, { accept: ["table:b"] });
    assert(r.doc.tables.find((x) => x.id === "a")!.position.x === 0 && r.doc.tables.find((x) => x.id === "b")!.seats === 8, "only the ticked change is carried");
    const newBase = doc([T("a", 1, 0, { position: { x: 0, y: 2000 } }), T("b", 2, 3000), T("c", 3, 6000)], base.placements);
    const re = rebaseDraft(base, proposed, newBase);
    assert(re.content.tables.find((x) => x.id === "b")!.seats === 8 && re.dropped.some((c) => c.key === "table:a"), "a rebase keeps what still applies and names what it dropped");
    assert(mergeChanges(base, base, base).applied.length === 0, "no changes, nothing applied");
  }

  console.log("delta: all checks passed");
}
