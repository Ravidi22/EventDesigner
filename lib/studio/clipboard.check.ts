// npm run check:clipboard — the self-check of ./clipboard.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, DesignTable, Placement } from "../design-document/types";
import { clipCount, copySelection, heldClip, holdClip, nextPasteStep, pasteInto } from "./clipboard";

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/clipboard.ts
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
const rodDoc: DesignDocumentContent = { ...doc, placements: [{ ...free("p-rod", "curtain", 0, 0), rail: { type: "rod", points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }], heightMm: 2400 } }] };
const rodClip = copySelection(rodDoc, [{ kind: "placement", id: "p-rod" }], isDrape);
const rodPasted = pasteInto(rodClip, { dx: 500, dy: 200, firstNumber: 1, newId: () => "n" });
const pastedRail = rodPasted.placements[0]?.rail;
assert(clipCount(rodClip) === 1 && pastedRail?.type === "rod" && pastedRail.points[1].x === 3500 && pastedRail.points[1].y === 200, "a curtain on its own rod is copied, and its rod pasted a step along");
// Cloth in the air (lib/studio/ceiling-cloth.ts): a run and a sail on posts of its own copy and move;
// a sail tied to a wall names that wall, and stays.
const posts = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 1500, y: 2000 }].map((p) => ({ p, heightMm: 3000, to: { kind: "post" as const } }));
const clothDoc: DesignDocumentContent = {
  ...doc,
  placements: [
    { ...free("p-run", "curtain", 0, 0), rail: { type: "run", a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, heightMm: 3500, widthMm: 900 } },
    { ...free("p-sail", "curtain", 0, 0), rail: { type: "sail", ties: posts } },
    { ...free("p-tied", "curtain", 0, 0), rail: { type: "sail", ties: [{ ...posts[0], to: { kind: "wall", wallId: "w", t: 0.5 } }, posts[1], posts[2]] } },
  ],
};
const clothClip = copySelection(clothDoc, ["p-run", "p-sail", "p-tied"].map((id) => ({ kind: "placement" as const, id })), isDrape);
const clothPasted = pasteInto(clothClip, { dx: 100, dy: 0, firstNumber: 1, newId: () => "n" }).placements.map((p) => p.rail);
assert(clipCount(clothClip) === 2 && clothPasted[0]?.type === "run" && clothPasted[0].a.x === 100 && clothPasted[0].widthMm === 900, "a run is copied and moved with its width");
assert(clothPasted[1]?.type === "sail" && clothPasted[1].ties[2].p.x === 1600, "a sail on its own posts is copied and moved; a tied one is not");

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
const kept = pasteInto(pair, { dx: 0, dy: 0, firstNumber: 3, newId, keepNumbers: true });
assert(kept.tables[0].number === pair.tables[0].number, "a sketch loaded whole keeps its numbers");
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

// BUG (was): every member of a pasted block spent a number. A block and a lone table pasted
// together came out as 6 and 8, with 7 nowhere on the plan.
{
  const withSolo = copySelection(
    { ...blockDoc, tables: [...blockDoc.tables, table("s1", 9, 5000, 0)] },
    [{ kind: "table", id: "b1" }, { kind: "table", id: "b2" }, { kind: "table", id: "s1" }],
    isDrape,
  );
  const out = pasteInto(withSolo, { dx: 0, dy: 0, firstNumber: 6, newId });
  assert(out.groups[0].number === 6, "a pasted block is one number…");
  assert(out.tables.find((t) => !t.groupId)?.number === 7, "…so the table pasted with it is the next one, with no gap");
}

// A table out of the numbering stays out of it, and uses no number up.
{
  const gift = { ...table("gift", 4), unnumbered: true };
  const out = pasteInto({ tables: [gift, table("t9", 9)], placements: [], groups: [] }, { dx: 0, dy: 0, firstNumber: 10, newId });
  assert(out.tables[0].unnumbered === true && out.tables[0].number === 4, "a pasted unnumbered table stays unnumbered");
  assert(out.tables[1].number === 10, "…and the numbered one beside it still takes the first free number");
}

// A numbered standalone banquette is numbered like a table on paste: the next number after the
// pasted tables', and empty; an unnumbered one stays unnumbered; a loaded sketch keeps its own.
{
  const benchClip = {
    tables: [table("t9", 9)],
    placements: [
      { ...free("b1", "bench", 0, 0), bench: { number: 5, seated: 3, front: { kind: "sofa" as const } } },
      { ...free("b2", "bench", 0, 3000), bench: { back: { kind: "none" as const } } },
    ],
    groups: [],
  };
  const out = pasteInto(benchClip, { dx: 0, dy: 0, firstNumber: 20, newId });
  assert(out.tables[0].number === 20 && out.placements[0].bench?.number === 21, "a pasted banquette takes the number after the pasted tables'");
  assert(out.placements[0].bench?.seated === undefined && out.placements[0].bench?.front?.kind === "sofa", "…starts empty, and keeps its sides");
  assert(out.placements[1].bench?.number === undefined, "an unnumbered banquette stays unnumbered");
  assert(pasteInto(benchClip, { dx: 0, dy: 0, firstNumber: 20, newId, keepNumbers: true }).placements[0].bench?.number === 5, "a loaded sketch keeps its banquette numbers");
}

// A group whose other member was refused (a drape) is a group of one, and is let go HERE: pasted,
// the reducer's `group` refuses a group of one, and the table was left carrying a groupId that
// named nothing — no number, no chairs, out of the numbering.
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
assert(halfGroup.groups.length === 0 && halfGroup.tables[0].groupId === undefined, "…and a group of one is let go, the table loose");
// One half of a block copied alone (from its focus mode) pastes as a table of its own.
const half = copySelection(
  { ...blockDoc, tables: [{ ...table("a", 3), groupId: "b" }, { ...table("b2", 4), groupId: "b" }], placements: [], groups: [{ id: "b", number: 3 }] },
  [{ kind: "table", id: "a" }],
  isDrape,
);
const halfPasted = pasteInto(half, { dx: 0, dy: 0, firstNumber: 9, newId });
assert(halfPasted.groups.length === 0 && halfPasted.tables[0].groupId === undefined && halfPasted.tables[0].number === 9, "one half of a block pastes as a loose, numbered table");
// …and a clip saved with a group of one (an old composite) is put right on the way in.
const stale = pasteInto({ tables: [{ ...table("s", 2), groupId: "g1" }], placements: [], groups: [{ id: "g1" }] }, { dx: 0, dy: 0, firstNumber: 5, newId });
assert(stale.groups.length === 0 && stale.tables[0].groupId === undefined, "a stale group of one is dropped on paste");

// The held clip survives, and each paste steps one further than the last.
assert(clipCount(heldClip()) === 0, "nothing is held until something is copied");
holdClip(one);
assert(clipCount(heldClip()) === 3, "a copy is held whole");
assert(nextPasteStep() === 1 && nextPasteStep() === 2, "repeated pastes step further out");
holdClip(one);
assert(nextPasteStep() === 1, "a fresh copy starts the count again");

// A carpet laid over a stage comes with the stage and lies over the copy; one laid over a venue
// surface, or over a stage left behind, pastes detached — its shape kept (lib/studio/cover.ts).
{
  const ring = [{ x: -500, y: -500 }, { x: 500, y: -500 }, { x: 500, y: 500 }, { x: -500, y: 500 }];
  const covers: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [
      { ...free("st", "deck", 0, 0), stage: { outline: ring, front: 0, decks: [] } },
      { ...free("on-stage", "rug", 0, 0), cover: { stageId: "st" }, outline: ring },
      { ...free("on-lawn", "rug", 5000, 0), cover: { featureId: "lawn" }, outline: ring },
    ],
  };
  let k = 0;
  const withStage = pasteInto(copySelection(covers, [{ kind: "placement", id: "st" }], isDrape), { dx: 100, dy: 0, firstNumber: 1, newId: () => `n${k++}` });
  const copiedStage = withStage.placements.find((p) => p.stage)!;
  const copiedRug = withStage.placements.find((p) => !p.stage);
  assert(!!copiedRug && copiedRug.cover?.stageId === copiedStage.id, "a stage copied brings its carpet, laid over the copy");
  const alone = pasteInto(copySelection(covers, [{ kind: "placement", id: "on-lawn" }, { kind: "placement", id: "on-stage" }], isDrape), { dx: 100, dy: 0, firstNumber: 1, newId: () => `m${k++}` });
  assert(alone.placements.every((p) => !p.cover && p.outline === ring), "a carpet copied without what it covers pastes detached, its shape kept");
}

console.log("clipboard self-check passed");
