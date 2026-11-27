import type { DesignDocumentContent, DesignGroup, DesignTable, Placement } from "../design-document/types";
import { railMoved, type Rail } from "./rail";
import { sailIsFree } from "./ceiling-cloth";

/** A rail made of its own points — a rod, a run, a canopy — names nothing in the room. */
function ownsItsRail(p: Pick<Placement, "rail">): boolean {
  const t: Rail["type"] | undefined = p.rail?.type;
  // …and a sail standing on its own posts (lib/studio/ceiling-cloth.ts) — one tied to a wall or a
  // thing names it, and is not copied, as a curtain on a wall is not.
  if (p.rail?.type === "sail") return sailIsFree(p.rail);
  return t === "rod" || t === "run" || t === "canopy";
}

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
    // …but a curtain on a rod of its own (lib/studio/rail.ts) names no wall and no thing: it is
    // copied, and pasted a step along like any free item.
    if (anchoredToWall(p.variantId) && !ownsItsRail(p)) return false;
    // A stage's banquette dressing comes with the stage, as a table's dressing comes with the table —
    // and so does what hangs OVER the table (Placement.over).
    // …and the carpet laid over a stage (Placement.cover), as what lies on it.
    return (p.tableId !== undefined && tableIds.has(p.tableId)) || (p.over !== undefined && tableIds.has(p.over)) || (p.perch !== undefined && placementIds.has(p.perch.stageId)) || (p.cover?.stageId !== undefined && placementIds.has(p.cover.stageId)) || placementIds.has(p.id);
  });
  return wholeGroups({ tables, placements, groups: doc.groups ?? [] });
}

/** A clip's groups, only those it holds at least two members of — and the `groupId` let go on the
 *  rest. One half of a head table copied on its own (from its focus mode, where a click selects the
 *  half) used to paste carrying a group of one: no number of its own, no chairs (a grouped table
 *  leaves both to its block), and out of the numbering altogether. */
function wholeGroups(clip: Clip): Clip {
  const count = new Map<string, number>();
  for (const x of [...clip.tables, ...clip.placements]) if (x.groupId) count.set(x.groupId, (count.get(x.groupId) ?? 0) + 1);
  const whole = new Set([...count].filter(([, n]) => n >= 2).map(([g]) => g));
  const loose = <T extends { groupId?: string }>(x: T): T => {
    if (!x.groupId || whole.has(x.groupId)) return x;
    const { groupId: _g, ...rest } = x;
    void _g;
    return rest as T;
  };
  return { tables: clip.tables.map(loose), placements: clip.placements.map(loose), groups: (clip.groups ?? []).filter((g) => whole.has(g.id)) };
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
  opts: { dx: number; dy: number; firstNumber: number; newId: () => string; keepNumbers?: boolean },
): Clip {
  // A clip saved before copySelection let go of a group of one (a composite, a sketch) is put right
  // on the way in.
  clip = wholeGroups(clip);
  const remap = new Map<string, string>();
  for (const t of clip.tables) remap.set(t.id, opts.newId());
  // Placement ids are minted up front too, so an item on a copied stage's banquette can be re-pointed
  // at the copy — its edge-item ids travel inside the stage unchanged, so only the stage id moves.
  const remapP = new Map<string, string>();
  for (const p of clip.placements) remapP.set(p.id, opts.newId());
  // Groups are re-minted the same way ids are. A pasted block is a NEW block: it has to be
  // ungroupable on its own, and dragging it must not drag the tables it was copied from.
  const regroup = new Map<string, string>();
  for (const g of clip.groups ?? []) regroup.set(g.id, opts.newId());
  const rejoin = <T extends { groupId?: string }>(x: T): T =>
    x.groupId === undefined ? x : { ...x, groupId: regroup.get(x.groupId) };

  let n = opts.firstNumber;
  // A pasted BLOCK takes ONE number, as the one table it is. Handing each member its own used to
  // spend a number per member: a block of two and a lone table pasted as 6 and 8, with 7 hidden
  // under the block and the room's sequence broken at the paste. Its members all carry the block's
  // number underneath; an ungroup gives the second one a fresh number then (freeNumbers).
  const blockNumber = new Map<string, number>();
  const numberOf = (t: DesignTable): number => {
    // A loaded sketch keeps the numbers it was saved with — it IS the room; a paste is a copy into
    // a room that already has numbers, and takes the next free ones. A table out of the numbering
    // stays out of it and uses none up.
    if (opts.keepNumbers || t.unnumbered) return t.number;
    if (t.number <= 0) return 0;
    const g = t.groupId ? regroup.get(t.groupId) : undefined;
    if (!g) return n++;
    if (!blockNumber.has(g)) blockNumber.set(g, n++);
    return blockNumber.get(g)!;
  };
  const tables = clip.tables.map((t) => ({
    ...rejoin(t),
    id: remap.get(t.id)!,
    number: numberOf(t),
    position: { x: t.position.x + opts.dx, y: t.position.y + opts.dy },
    // A copy is another TABLE, not another sitting of the same people. It brings its size, its
    // cloth and its chairs; it starts empty. (`seated: undefined` rather than a deleted key, so
    // the object stays a plain DesignTable and nothing downstream has to test for the difference.)
    seated: undefined,
    // A copy is never born locked — the lock pins THAT table where it stands; the copy is about to
    // be put somewhere else (the same rule as /halls' copiedFeature).
    locked: undefined,
  }));

  const placements = clip.placements.map((p) => ({
    ...rejoin(p),
    id: remapP.get(p.id)!,
    ...(p.tableId === undefined ? {} : { tableId: remap.get(p.tableId) ?? p.tableId }),
    // A ceiling item hung over a copied table hangs over the copy; one whose table stayed behind
    // stays over it, like a cloth whose table stayed behind. Its position is a room point and takes
    // the paste delta below like any other.
    ...(p.over === undefined ? {} : { over: remap.get(p.over) ?? p.over }),
    ...(p.perch === undefined ? {} : { perch: { ...p.perch, stageId: remapP.get(p.perch.stageId) ?? p.perch.stageId } }),
    // A numbered standalone banquette is numbered like a table: the next free number after the
    // tables', and empty — the same two rules a copied table follows (numberOf above).
    ...(p.bench === undefined
      ? {}
      : { bench: { ...p.bench, seated: undefined, ...(p.bench.number !== undefined && p.bench.number > 0 && !opts.keepNumbers ? { number: n++ } : {}) } }),
    // A table-layer item's `position` is an offset within its table, not a point on the plan, so it
    // must NOT take the paste delta — the renderer clusters those onto the table itself.
    position: p.tableId === undefined ? { x: p.position.x + opts.dx, y: p.position.y + opts.dy } : p.position,
    // A rail of its own points (a rod) moves with the paste; one on a wall or a thing stays on it.
    ...(p.rail ? { rail: railMoved(p.rail, opts.dx, opts.dy) } : {}),
    // A carpet laid over a stage that came along lies over the copy; over anything else (a venue
    // surface, a stage left behind) it pastes DETACHED — the shape it was laid in, a step along — or
    // the reducer's settle would put it straight back on its surface (lib/studio/cover.ts).
    ...(p.cover === undefined ? {} : { cover: p.cover.stageId && remapP.has(p.cover.stageId) ? { ...p.cover, stageId: remapP.get(p.cover.stageId)! } : undefined }),
    // Never born locked (see the tables above).
    locked: undefined,
  }));

  // The block's number is the lowest its own new tables were given, so the copy reads in the room's
  // order rather than announcing a number from the far end of the sequence.
  const groups = (clip.groups ?? []).map((g) => {
    const members = tables.filter((t) => t.groupId === regroup.get(g.id) && t.number > 0 && !t.unnumbered);
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
