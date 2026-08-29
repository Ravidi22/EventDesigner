import type { DesignDocumentContent, DesignGroup, DesignTable, Placement } from "../design-document/types";
import { isMain } from "../self-check";

// The studio's clipboard: what Ctrl+C took, and what Ctrl+V has to do to it before it can be added
// to a document.
//
// The transforms are pure and self-checked; the held clip is a module variable underneath them,
// which is what a clipboard IS — one per session, outliving the screen that filled it. That last
// part is deliberate: the studio is unmounted constantly (the meeting steps it in and out, "יציאה"
// navigates away), and a clipboard that emptied itself every time would be no clipboard at all.
// Holding it here means a table arrangement copied in one event can be pasted into the next one,
// which is the same studio's catalog either way, so every variantId still resolves.
//
// It is NOT the system clipboard. Ctrl+C here does not put anything on the OS clipboard and Ctrl+V
// does not read it — so this cannot carry a plan between two browser tabs, and nothing a designer
// copies out of the studio can leak into whatever they paste next. A real cross-document clipboard
// means serialising a document fragment to text and asking for clipboard-read permission, which is
// a different feature and needs a format worth versioning.

/** A fragment of a design document, with its ORIGINAL ids — meaningless until pasted. */
export interface Clip {
  tables: DesignTable[];
  placements: Placement[];
  /** The groups the copied things belong to. Carried so that a copy of a block of tables pastes as
   *  ANOTHER block rather than as loose tables — or, worse, as members of the original group, which
   *  is what keeping their `groupId` and nothing else would silently do. */
  groups: DesignGroup[];
}

export interface ClipRef {
  kind: "table" | "placement";
  id: string;
}

export const EMPTY_CLIP: Clip = { tables: [], placements: [], groups: [] };

export function clipCount(c: Clip): number {
  return c.tables.length + c.placements.length;
}

/**
 * What a selection amounts to as a fragment of document.
 *
 * A COPIED TABLE BRINGS WHAT IT WEARS. Its cloth and everything standing on it have no existence
 * apart from it — a cloth's position is the table, not a point on the floor — so copying "the table"
 * and getting a bare disc would be copying half of what the designer pointed at. A table-layer item
 * selected on its own is copied too, and pastes back onto the SAME table, which is what "copy this
 * centrepiece, paste" means when the table itself was never part of the selection.
 *
 * A DRAPE IS LEFT BEHIND. It is a run of fabric measured along one named wall of one property; there
 * is no second wall for a copy of it to hang on, and two of them stacked on the same span are
 * invisible on the plan while quietly billing the client for twice the fabric. The designer who
 * wants more of it has the quantity field, which is the honest way to say so.
 *
 * `anchoredToWall` is injected rather than read here for the reason every aggregation in this
 * codebase injects its catalog lookup: what an item ANCHORS to is a fact about its category, and a
 * pure function that secretly reaches for the catalog cannot be run under node.
 */
export function copySelection(
  doc: DesignDocumentContent,
  refs: ClipRef[],
  anchoredToWall: (variantId: string) => boolean,
): Clip {
  const tableIds = new Set(refs.filter((r) => r.kind === "table").map((r) => r.id));
  const placementIds = new Set(refs.filter((r) => r.kind === "placement").map((r) => r.id));
  const tables = doc.tables.filter((t) => tableIds.has(t.id));
  const placements = doc.placements.filter((p) => {
    if (anchoredToWall(p.variantId)) return false;
    return (p.tableId !== undefined && tableIds.has(p.tableId)) || placementIds.has(p.id);
  });
  const grouped = new Set([...tables, ...placements].map((x) => x.groupId).filter((g): g is string => !!g));
  return { tables, placements, groups: (doc.groups ?? []).filter((g) => grouped.has(g.id)) };
}

/**
 * Re-id, renumber and offset a clip so it can be added to a document.
 *
 * The whole fragment moves as ONE rigid thing: every item carries the same delta, so a row of six
 * tables pastes as a row of six tables and not as six tables in a heap. Table numbers are reissued
 * from the document's next free one — a pasted table is a new table in the room, and two tables
 * numbered 4 is a placement map the crew cannot read. A HEAD table (number 0) stays a head table.
 *
 * The id remap is what keeps a copied table's dressing attached to the copy: a cloth whose table
 * came along is re-pointed at the new one, while a cloth whose table stayed behind keeps pointing
 * at the original, which is exactly the two cases copySelection can produce.
 */
export function pasteInto(
  clip: Clip,
  opts: { dx: number; dy: number; firstNumber: number; newId: () => string },
): Clip {
  const remap = new Map<string, string>();
  for (const t of clip.tables) remap.set(t.id, opts.newId());
  // Groups are re-minted the same way ids are. A pasted block is a NEW block: it has to be
  // ungroupable on its own, and dragging it must not drag the tables it was copied from.
  const regroup = new Map<string, string>();
  for (const g of clip.groups ?? []) regroup.set(g.id, opts.newId());
  const rejoin = <T extends { groupId?: string }>(x: T): T =>
    x.groupId === undefined ? x : { ...x, groupId: regroup.get(x.groupId) };

  let n = opts.firstNumber;
  const tables = clip.tables.map((t) => ({
    ...rejoin(t),
    id: remap.get(t.id)!,
    number: t.number > 0 ? n++ : 0,
    position: { x: t.position.x + opts.dx, y: t.position.y + opts.dy },
    // A copy is another TABLE, not another sitting of the same people. It brings its size, its
    // cloth and its chairs; it starts empty. (`seated: undefined` rather than a deleted key, so
    // the object stays a plain DesignTable and nothing downstream has to test for the difference.)
    seated: undefined,
  }));

  const placements = clip.placements.map((p) => ({
    ...rejoin(p),
    id: opts.newId(),
    ...(p.tableId === undefined ? {} : { tableId: remap.get(p.tableId) ?? p.tableId }),
    // A table-layer item's `position` is an offset within its table, not a point on the plan, so it
    // must NOT take the paste delta — the renderer clusters those onto the table itself.
    position: p.tableId === undefined ? { x: p.position.x + opts.dx, y: p.position.y + opts.dy } : p.position,
  }));

  // The block's number is the lowest its own new tables were given, so the copy reads in the room's
  // order rather than announcing a number from the far end of the sequence.
  const groups = (clip.groups ?? []).map((g) => {
    const members = tables.filter((t) => t.groupId === regroup.get(g.id) && t.number > 0);
    return {
      id: regroup.get(g.id)!,
      ...(members.length ? { number: Math.min(...members.map((t) => t.number)) } : {}),
    };
  });

  return { tables, placements, groups };
}

// ── the held clip ───────────────────────────────────────────────────────────────────────────────

let held: Clip = EMPTY_CLIP;
let pastes = 0;

export function holdClip(c: Clip): void {
  held = c;
  pastes = 0;
}

export function heldClip(): Clip {
  return held;
}

/** How many times the held clip has been pasted, counting this one. Each paste steps one offset
 *  further than the last, so pressing Ctrl+V four times fans four copies out instead of stacking
 *  four copies in one place. A fresh copy starts the count again. */
export function nextPasteStep(): number {
  return ++pastes;
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/clipboard.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  let seq = 0;
  const newId = () => `n${++seq}`;
  const table = (id: string, number: number, x = 0, y = 0): DesignTable => ({
    id,
    type: "עגול 180",
    number,
    position: { x, y },
    rotation: 0,
    diameterMm: 1800,
  });
  const on = (id: string, tableId: string, variantId: string): Placement => ({
    id,
    variantId,
    layer: "table",
    quantity: 1,
    tableId,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
  });
  const free = (id: string, variantId: string, x: number, y: number): Placement => ({
    id,
    variantId,
    layer: "floor",
    quantity: 1,
    position: { x, y },
    rotation: 0,
    scale: 1,
  });

  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [table("t1", 1, 1000, 1000), table("t2", 2, 4000, 1000)],
    placements: [
      on("p-cloth", "t1", "cloth"),
      on("p-vase", "t1", "vase"),
      on("p-other", "t2", "cloth"),
      free("p-arch", "arch", 8000, 2000),
      { ...free("p-drape", "curtain", 0, 0), span: { wallId: "w1", from: 0, to: 1 } },
    ],
  };
  const isDrape = (v: string) => v === "curtain";

  // A copied table brings what it wears, and nothing off any other table.
  const one = copySelection(doc, [{ kind: "table", id: "t1" }], isDrape);
  assert(one.tables.length === 1 && one.placements.length === 2, "a table is copied with its dressing");
  assert(one.placements.every((p) => p.tableId === "t1"), "…and only its own");

  // A drape is never copied, even when it is what was selected.
  const drape = copySelection(doc, [{ kind: "placement", id: "p-drape" }], isDrape);
  assert(clipCount(drape) === 0, "a wall-anchored drape has no second wall and is not copied");

  // Selecting a table AND one of its items copies that item once, not twice.
  const both = copySelection(doc, [{ kind: "table", id: "t1" }, { kind: "placement", id: "p-vase" }], isDrape);
  assert(both.placements.filter((p) => p.id === "p-vase").length === 1, "an item selected with its table is copied once");

  // Pasting the table: new ids throughout, a fresh number, the dressing re-pointed at the copy.
  const pasted = pasteInto(one, { dx: 500, dy: 0, firstNumber: 3, newId });
  assert(pasted.tables[0].id !== "t1" && pasted.tables[0].number === 3, "a pasted table is new and renumbered");
  assert(pasted.tables[0].position.x === 1500, "…and offset by the paste delta");
  assert(
    pasteInto({ ...one, tables: one.tables.map((t) => ({ ...t, seated: 10 })) }, { dx: 0, dy: 0, firstNumber: 3, newId })
      .tables[0].seated === undefined,
    "a copied table brings its chairs but not the people in them",
  );
  assert(pasted.placements.every((p) => p.tableId === pasted.tables[0].id), "its dressing follows the copy, not the original");
  assert(new Set(pasted.placements.map((p) => p.id)).size === 2, "…with ids of its own");
  assert(pasted.placements.every((p) => p.position.x === 0), "a table-layer offset is not a plan point and takes no delta");

  // An item copied WITHOUT its table pastes back onto the table it came from.
  const lone = copySelection(doc, [{ kind: "placement", id: "p-vase" }], isDrape);
  const loneOut = pasteInto(lone, { dx: 500, dy: 500, firstNumber: 9, newId });
  assert(loneOut.tables.length === 0 && loneOut.placements[0].tableId === "t1", "an item whose table stayed behind pastes onto it");

  // A free placement takes the delta; the fragment moves as one rigid thing.
  const pair = copySelection(doc, [{ kind: "table", id: "t1" }, { kind: "placement", id: "p-arch" }], isDrape);
  const rigid = pasteInto(pair, { dx: 1000, dy: 2000, firstNumber: 3, newId });
  const arch = rigid.placements.find((p) => p.variantId === "arch")!;
  assert(arch.position.x === 9000 && arch.position.y === 4000, "a free placement carries the same delta");
  assert(rigid.tables[0].position.x === 2000 && rigid.tables[0].position.y === 3000, "…as the table beside it");

  // A head table stays a head table.
  const head = pasteInto({ tables: [table("t0", 0)], placements: [], groups: [] }, { dx: 0, dy: 0, firstNumber: 7, newId });
  assert(head.tables[0].number === 0, "a pasted head table is still the head table");

  // Two tables in one clip get consecutive numbers, from the document's next free one.
  const two = pasteInto(copySelection(doc, [{ kind: "table", id: "t1" }, { kind: "table", id: "t2" }], isDrape), {
    dx: 0,
    dy: 0,
    firstNumber: 3,
    newId,
  });
  assert(two.tables.map((t) => t.number).join(",") === "3,4", "a multi-table paste numbers consecutively");
  assert(two.placements.length === 3, "…and brings every table's dressing");

  // A copied BLOCK pastes as another block — a new group of its own, not a limb of the original.
  const blockDoc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [{ ...table("b1", 4, 0, 0), groupId: "g" }, { ...table("b2", 5, 2000, 0), groupId: "g" }],
    placements: [{ ...on("b-cloth", "b1", "cloth"), groupId: undefined }],
    groups: [{ id: "g", number: 4 }],
  };
  const block = copySelection(blockDoc, [{ kind: "table", id: "b1" }, { kind: "table", id: "b2" }], isDrape);
  assert(block.groups.length === 1, "a copied block carries its group");
  const blockOut = pasteInto(block, { dx: 100, dy: 0, firstNumber: 6, newId });
  assert(blockOut.groups.length === 1 && blockOut.groups[0].id !== "g", "…and pastes as a group of its own");
  assert(blockOut.tables.every((t) => t.groupId === blockOut.groups[0].id), "…which is the one its tables joined");
  assert(blockOut.tables.every((t) => t.groupId !== "g"), "…never the original, which would drag both blocks at once");
  assert(blockOut.groups[0].number === 6, "the pasted block takes the lowest of its own new numbers");

  // A group whose other member was refused (a drape) comes through as a group of one, which the
  // reducer's own pruning then drops — nothing here has to special-case it.
  const halfGroup = copySelection(
    {
      ...blockDoc,
      tables: [{ ...table("h1", 4), groupId: "h" }],
      placements: [{ ...free("h-drape", "curtain", 0, 0), groupId: "h", span: { wallId: "w", from: 0, to: 1 } }],
      groups: [{ id: "h", number: 4 }],
    },
    [{ kind: "table", id: "h1" }, { kind: "placement", id: "h-drape" }],
    isDrape,
  );
  assert(halfGroup.tables.length === 1 && halfGroup.placements.length === 0, "the drape is still refused");
  assert(halfGroup.groups.length === 1, "…and the group comes along for the reducer to prune");

  // The held clip survives, and each paste steps one further than the last.
  assert(clipCount(heldClip()) === 0, "nothing is held until something is copied");
  holdClip(one);
  assert(clipCount(heldClip()) === 3, "a copy is held whole");
  assert(nextPasteStep() === 1 && nextPasteStep() === 2, "repeated pastes step further out");
  holdClip(one);
  assert(nextPasteStep() === 1, "a fresh copy starts the count again");

  console.log("clipboard self-check passed");
}
