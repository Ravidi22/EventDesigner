// npm run check:groups — the self-check of ./groups.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, DesignTable, Placement } from "./types";
import { type BenchLookup } from "./bench";
import { duplicateNumbers, expandToGroups, freeNumbers, groupSeated, groupSeats, nextTableNumber, numberedUnits, orderedNumbering, refitBlock, shownNumbers, soleGroupId, spreadSeated, spreadSeats, tableLabel, tableNumber, type NumberingAxis, type NumberingCorner, type NumberingOptions } from "./groups";

// ponytail: self-check. Run: node --experimental-strip-types lib/design-document/groups.ts
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
// A gift table taken out of the numbering keeps its old stored number underneath (1, lower than
// its sibling's 3): the plan and the print show 3, so the bar must say 3 too — never the hidden 1.
const withGift: DesignDocumentContent = {
  ...unnumbered,
  tables: unnumbered.tables.map((t) => (t.id === unnumbered.tables[0].id ? { ...t, number: 1, unnumbered: true as const } : t)),
};
assert(numberedUnits(withGift)[0].number === 7 && tableNumber(withGift, withGift.tables[1]) === 7, "a block's number skips an unnumbered sibling's hidden number (7, not the gift table's 1)");
assert(tableNumber(withGift, withGift.tables[0]) === 7, "…whichever member asks");

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

// ── numbers the plan shows, and the next one ─────────────────────────────────────────────────
{
  const at = (id: string, number: number, extra: Partial<DesignTable> = {}): DesignTable => ({
    id,
    type: "עגול 180",
    number,
    position: { x: 0, y: 0 },
    rotation: 0,
    diameterMm: 1800,
    ...extra,
  });
  // BUG (was): nextNumber read raw table numbers. A block shown as 2 whose members still carry 7
  // and 8 underneath sent the next table to 9 — a gap; and a block renumbered to 12 over members
  // 3 and 4 gave the next table 5, nowhere near the end.
  const hidden: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [at("a", 1), at("b", 7, { groupId: "g" }), at("c", 8, { groupId: "g" })],
    placements: [],
    groups: [{ id: "g", number: 2 }],
  };
  assert(nextTableNumber(hidden) === 3, "the next table follows the numbers the plan SHOWS, not hidden members'");
  const renumbered: DesignDocumentContent = { ...hidden, tables: [at("a", 1), at("b", 3, { groupId: "g" }), at("c", 4, { groupId: "g" })], groups: [{ id: "g", number: 12 }] };
  assert(nextTableNumber(renumbered) === 13, "…and a block's own number counts, so the next is never a second 12");
  assert(shownNumbers(renumbered).sort((x, y) => x - y).join() === "1,12", "a block shows one number");
  assert(duplicateNumbers({ ...hidden, tables: [...hidden.tables, at("d", 1)] }).has(1), "two table 1s are flagged");
  assert(duplicateNumbers({ ...hidden, tables: [at("h1", 0), at("h2", 0)] }).size === 0, "…two head tables are not");

  // ── a table out of the numbering ────────────────────────────────────────────────────────────
  const loose: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [at("n1", 1), at("gift", 9, { unnumbered: true }), at("n2", 2)],
    placements: [],
  };
  const lu = numberedUnits(loose);
  assert(lu.length === 3, "an unnumbered table is still a table unit");
  assert(lu[2].id === "gift" && lu[2].unnumbered === true, "…flagged, and sorted after the numbered ones");
  assert(nextTableNumber(loose) === 3, "…and it does not consume a number");
  assert(!shownNumbers(loose).includes(9), "…nor does it show one");
  assert(tableLabel(loose, loose.tables[1]) === "שולחן ללא מספר" && tableLabel(loose, loose.tables[0]) === "שולחן 1", "its label says it has no number");
  const spaced: DesignDocumentContent = {
    ...loose,
    tables: [at("r", 5, { position: { x: 6000, y: 0 } }), at("gift", 1, { unnumbered: true, position: { x: 3000, y: 0 } }), at("l", 7, { position: { x: 0, y: 0 } })],
  };
  const sp = orderedNumbering(spaced);
  assert(!sp.some((r) => r.id === "gift"), "renumbering skips an unnumbered table");
  assert(sp.find((r) => r.id === "r")?.number === 1 && sp.find((r) => r.id === "l")?.number === 2, "…and the sequence closes over it: 1, 2, no gap");
  const giftBlock: DesignDocumentContent = {
    ...loose,
    tables: [at("x", 4, { groupId: "G", unnumbered: true }), at("y", 5, { groupId: "G", unnumbered: true }), at("z", 6, { groupId: "H" }), at("w", 7, { groupId: "H", unnumbered: true })],
    groups: [{ id: "G" }, { id: "H" }],
  };
  const gb = numberedUnits(giftBlock);
  assert(gb.find((u) => u.id === "G")?.unnumbered === true, "a block every table of which is unnumbered is unnumbered");
  assert(gb.find((u) => u.id === "H")?.unnumbered === undefined && gb.find((u) => u.id === "H")?.number === 6, "a block with one numbered table is numbered by it");

  // ── back into the numbering without a collision ───────────────────────────────────────────
  const collide: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [at("a", 1), at("b", 2), at("c", 2), at("d", 3)],
    placements: [],
  };
  const freed = freeNumbers(collide, ["c"]);
  assert(freed.get("c") === 4, "a returning table whose number is taken takes the next one off the end");
  assert(freeNumbers(collide, ["d"]).size === 0, "…and one whose number is free keeps it");
  assert(freeNumbers({ ...collide, tables: [at("h", 0), at("a", 1)] }, ["h"]).size === 0, "the head table keeps its 0");
  const two = freeNumbers({ ...collide, tables: [at("a", 1), at("b", 1), at("c", 1)] }, ["b", "c"]);
  assert(two.get("b") === 2 && two.get("c") === 3, "two returning tables never land on the same number");
}

// ── renumbering room by room ──────────────────────────────────────────────────────────────────
{
  const at = (id: string, x: number, y: number, number: number): DesignTable => ({ id, type: "עגול 180", number, position: { x, y }, rotation: 0, diameterMm: 1800 });
  // A hall on the left and a garden on the right, their tables on the same lines across.
  const hall = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }];
  const garden = hall.map((p) => ({ x: p.x + 12000, y: p.y }));
  const doc2: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [at("h1", 2000, 2000, 1), at("h2", 8000, 2000, 2), at("g1", 14000, 2000, 3), at("g2", 20000, 2000, 4), at("h3", 5000, 7000, 5), at("g3", 17000, 7000, 6)],
    placements: [],
  };
  const plan = new Map(orderedNumbering(doc2, {}, [hall, garden]).map((r) => [r.id, r.number]));
  const nOf = (id: string) => plan.get(id) ?? doc2.tables.find((t) => t.id === id)!.number;
  // BUG (was): one set of rows over both rooms read h2, h1… then g2, g1 interleaved — the hall's
  // own sheet of the placement set printed 2, 4… with the garden's numbers in its gaps.
  assert(["h1", "h2", "h3"].map(nOf).sort().join() === "1,2,3", "the hall is numbered first, 1..3");
  assert(["g1", "g2", "g3"].map(nOf).sort().join() === "4,5,6", "…then the garden carries on, 4..6");
  assert(nOf("h2") === 1 && nOf("h1") === 2, "inside a room it still reads right to left");
  const one = new Map(orderedNumbering(doc2).map((r) => [r.id, r.number]));
  assert((one.get("g2") ?? 4) === 1, "with no rooms given, the whole plan is one room, as before");
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

// One stage picked out of its group (the studio collapses a stage group to the member clicked):
// the selection is not "the group", so the inspector shows that stage's own bar — and expanding
// the lone member is how the group comes back (Esc, "חזרה לקבוצה").
{
  const deck = (id: string): Placement => ({ id, variantId: "stage", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, groupId: "g" });
  const stages: DesignDocumentContent = { calibration: { mmPerUnit: 9 }, tables: [], placements: [deck("s1"), deck("s2")], groups: [{ id: "g" }] };
  assert(soleGroupId(stages, [{ kind: "placement", id: "s1" }]) === undefined, "one member of a group is not the group");
  assert(soleGroupId(stages, [{ kind: "placement", id: "s1" }, { kind: "placement", id: "s2" }]) === "g", "…both of them are");
  assert(expandToGroups(stages, [{ kind: "placement", id: "s1" }]).length === 2, "…and the lone member expands back to the whole group");
}

// ── Standalone banquettes are numbered units — when something tells them apart, and someone sits.
{
  const bench = (id: string, x: number, y: number, spec?: Placement["bench"]): Placement => ({
    id,
    variantId: "bench",
    layer: "floor",
    quantity: 1,
    position: { x, y },
    rotation: 0,
    scale: 1,
    ...(spec ? { bench: spec } : {}),
  });
  const stageP = (id: string): Placement => ({ id, variantId: "stage", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
  const benches: BenchLookup = (q) => (q.variantId === "bench" ? (q.sizeMm ?? { widthMm: 3000, depthMm: 450 }) : null);
  const at = (id: string, number: number, x: number, y: number): DesignTable => ({ id, type: "עגול 180", number, position: { x, y }, rotation: 0, diameterMm: 1800, seats: 12 });
  const room: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [at("a", 2, 6000, 0), at("b", 3, 3000, 0)],
    placements: [bench("head", 0, -3000, { number: 1 }), bench("quiet", 6000, 3000, { number: 9, back: { kind: "none" } }), bench("unnumbered", 0, 3000), stageP("stage")],
  };
  const units = numberedUnits(room, benches);
  assert(units.length === 3 && units[0].kind === "bench" && units[0].id === "head" && units[0].number === 1, "a seated, numbered banquette is a unit of its own kind, first in number order");
  assert(units[0].tableIds.length === 0 && units[0].placementId === "head", "…with no tables under it, and its placement named");
  assert(!units.some((u) => u.id === "quiet"), "a banquette nobody sits at takes no number, whatever it holds");
  assert(!units.some((u) => u.id === "unnumbered"), "…nor does one the designer left unnumbered");
  assert(numberedUnits(room).length === 2 && numberedUnits(room).every((u) => u.kind === "table"), "without a way to tell a banquette, the units are the tables alone");
  assert(shownNumbers(room, benches).join(",") === "1,2,3" && shownNumbers(room).join(",") === "2,3", "the plan shows the banquette's number only when it can see the banquette");
  assert(nextTableNumber(room) === 10 && nextTableNumber(room, benches) === 10, "the next number is past every number the plan holds — the seatless banquette's 9 included, seen or not");
  assert(duplicateNumbers({ ...room, tables: [...room.tables, at("c", 1, 0, 6000)] }, benches).has(1), "a table numbered like a seated banquette is a duplicate…");
  assert(!duplicateNumbers({ ...room, tables: [...room.tables, at("c", 9, 0, 6000)] }, benches).has(9), "…while the number a seatless one holds is not shown, so not doubled");
  assert(freeNumbers({ ...room, tables: [...room.tables, { ...at("c", 9, 0, 6000), groupId: "g" }], groups: [{ id: "g", number: 5 }] }, ["c"]).get("c") === 10, "an ungrouped table never takes a number a banquette holds");
  // QA BQ-8: a number left on something that is no longer a banquette (its row re-filed as a sofa)
  // is held by nobody — when the plan can tell a banquette, the next table does not skip it.
  const stale = { ...room, placements: [bench("head", 0, -3000, { number: 1 }), { ...stageP("sofa"), variantId: "sofa", bench: { number: 7 } }] };
  assert(nextTableNumber(stale, benches) === 4 && nextTableNumber(stale) === 8, "a number on a placement that is not a banquette is not held — seen through the catalog");

  // Renumbered with the tables, in reading order: the banquette across the top is 1, the two
  // tables below it 2 and 3 right to left — already so.
  assert(orderedNumbering(room, {}, [], benches).length === 0, "a plan already in reading order, banquette first, needs no edit");
  const shuffled = { ...room, placements: room.placements.map((x) => (x.id === "head" ? { ...x, bench: { number: 7 } } : x)) };
  const fixed = orderedNumbering(shuffled, {}, [], benches);
  assert(fixed.length === 1 && fixed[0].kind === "bench" && fixed[0].id === "head" && fixed[0].number === 1, "a banquette out of order is renumbered as a bench, by its placement id");
  assert(orderedNumbering(shuffled).every((r) => r.kind !== "bench"), "…and left alone by a caller that cannot see it");
}

console.log("groups self-check passed");
