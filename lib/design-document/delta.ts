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

/** The block a table change is about (its table's group, before or after), or null for a lone
 *  table and a block number. A block's member changes travel TOGETHER: ticked, forced and refused as
 *  one — half a head table moved, or removed, leaves a group whose chairs ring a gap. */
export function blockOfChange(c: DocChange): string | null {
  return c.kind === "table" ? ((c.before ?? c.after)?.groupId ?? null) : null;
}

/** The changes as the designer decides them: one row per block (its members' changes), one per
 *  anything else — in the diff's order, each row keyed by its first change. */
export function changeRows(changes: readonly DocChange[]): { key: string; keys: string[]; change: DocChange }[] {
  const rows: { key: string; keys: string[]; change: DocChange }[] = [];
  const byBlock = new Map<string, { key: string; keys: string[]; change: DocChange }>();
  for (const c of changes) {
    const g = blockOfChange(c);
    const row = g ? byBlock.get(`${c.kind}:${(c as TableChange).op}:${g}`) : undefined;
    if (row) {
      row.keys.push(c.key);
      continue;
    }
    const fresh = { key: c.key, keys: [c.key], change: c };
    rows.push(fresh);
    if (g) byBlock.set(`${c.kind}:${(c as TableChange).op}:${g}`, fresh);
  }
  return rows;
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
  // A block is decided whole: a tick or a force on any member's change is one on every member's.
  const all = diffDocuments(base, proposed);
  const wholeBlocks = (keys: Iterable<string>) => {
    const set = new Set(keys);
    const blocks = new Set(all.filter((c) => set.has(c.key)).map(blockOfChange).filter((g): g is string => !!g));
    for (const c of all) {
      const g = blockOfChange(c);
      if (g && blocks.has(g)) set.add(c.key);
    }
    return set;
  };
  const accept = options.accept ? wholeBlocks(options.accept) : null;
  const force = wholeBlocks(options.force ?? []);
  const first = mergeOnce(current, base, proposed, all, accept, force);
  // …and refused whole: a block one member of which conflicts is held back entirely, every member
  // reported, rather than merged in half.
  const split = new Set(
    all
      .filter((c) => first.conflicts.some((x) => x.key === c.key))
      .map(blockOfChange)
      .filter((g): g is string => !!g),
  );
  if (split.size === 0) return first;
  const held = all.filter((c) => split.has(blockOfChange(c) ?? ""));
  const heldKeys = new Set(held.map((c) => c.key));
  const rest = mergeOnce(current, base, proposed, all, new Set([...(accept ?? all.map((c) => c.key))].filter((k) => !heldKeys.has(k))), force);
  const reason = (k: string) => first.conflicts.find((x) => x.key === k);
  const blockReason = (g: string) => first.conflicts.find((x) => held.some((c) => c.key === x.key && blockOfChange(c) === g))!;
  return {
    ...rest,
    conflicts: [
      ...rest.conflicts,
      ...held
        .filter((c) => !accept || accept.has(c.key))
        .map((c) => {
          const own = reason(c.key);
          return own ?? { key: c.key, reason: blockReason(blockOfChange(c)!).reason };
        }),
    ],
  };
}

function mergeOnce(
  current: DesignDocumentContent,
  base: DesignDocumentContent,
  proposed: DesignDocumentContent,
  all: DocChange[],
  accept: Set<string> | null,
  force: Set<string>,
): MergeResult {
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
