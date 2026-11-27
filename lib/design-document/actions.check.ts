// npm run check:actions — the self-check of ./actions.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, Placement, DesignTable } from "./types";
import { amend, apply, dispatch, groupOf, initHistory, redo, undo } from "./actions";

// ponytail: self-check for the reducer + history. Run: node --experimental-strip-types lib/design-document/actions.ts
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
let h = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
h = dispatch(h, { type: "addTable", table: { id: "t1", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 } });
h = dispatch(h, { type: "addTable", table: { id: "t2", type: "round", number: 2, position: { x: 5, y: 0 }, rotation: 0 } });
const applyV1 = {
  type: "applyToTables" as const,
  tableIds: ["t1", "t2"],
  placement: { variantId: "v1", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
};
h = dispatch(h, applyV1);
assert(h.present.placements.length === 2, "apply-to-list places on each named table");
h = dispatch(h, applyV1);
assert(h.present.placements.length === 2, "re-apply is idempotent, no duplicates");
h = undo(h);
assert(h.present.placements.length === 0, "undo reverts the smart-apply");
h = redo(h);
assert(h.present.placements.length === 2, "redo restores it");
h = dispatch(h, { type: "removeTable", id: "t1" });
assert(h.present.placements.length === 1, "removing a table drops its placements");
h = dispatch(h, { type: "renumberTable", id: "t2", number: 12 });
assert(h.present.tables.find((t) => t.id === "t2")?.number === 12, "renumber edits one table");
h = undo(h);
assert(h.present.tables.find((t) => t.id === "t2")?.number === 2, "renumber undoes");

// A group drag: one action, one history entry, both kinds of thing carried by the same delta.
{
  let g = initHistory({
    calibration: { mmPerUnit: 1 },
    tables: [{ id: "gt", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 }],
    placements: [{ id: "gp", variantId: "v", layer: "floor", quantity: 1, position: { x: 100, y: 0 }, rotation: 0, scale: 1 }],
  });
  const before = g.present;
  g = dispatch(g, {
    type: "moveMany",
    moves: [
      { kind: "table", id: "gt", position: { x: 500, y: 500 } },
      { kind: "placement", id: "gp", position: { x: 600, y: 500 } },
    ],
  });
  assert(g.present.tables[0].position.x === 500 && g.present.placements[0].position.y === 500, "moveMany moves both kinds");
  assert(g.past.length === 1, "…in one history entry");
  // Every later frame of the same drag amends that entry instead of opening another.
  g = amend(g, { type: "moveMany", moves: [{ kind: "table", id: "gt", position: { x: 900, y: 500 } }] });
  g = amend(g, { type: "moveMany", moves: [{ kind: "table", id: "gt", position: { x: 1200, y: 500 } }] });
  assert(g.past.length === 1 && g.present.tables[0].position.x === 1200, "amend folds later frames into the open entry");
  assert(undo(g).present === before, "one undo takes back the whole gesture");
  assert(apply(g.present, { type: "moveMany", moves: [] }) === g.present, "an empty move is not an edit");
}

h = dispatch(h, { type: "styleTable", id: "t2", style: { fill: "#c9a227", dash: "dashed" } });
assert(h.present.tables.find((t) => t.id === "t2")?.style?.fill === "#c9a227", "styleTable sets a table's free-form style");
h = dispatch(h, { type: "styleTable", id: "t2", style: undefined });
assert(h.present.tables.find((t) => t.id === "t2")?.style === undefined, "styleTable clears back to the renderer's default");

// F-5.3: an exception (manual removal) survives a later bulk re-apply.
const t2placement = h.present.placements.find((p) => p.tableId === "t2")!;
h = dispatch(h, { type: "removePlacement", id: t2placement.id });
assert(h.present.exceptions?.length === 1, "removal records an exception");
h = dispatch(h, applyV1);
assert(h.present.placements.filter((p) => p.tableId === "t2").length === 0, "re-apply skips the excepted table");
h = dispatch(h, { type: "addPlacement", placement: { ...t2placement, id: "p-back" } });
assert(h.present.exceptions?.length === 0, "manual re-add clears the exception");

// A shade swap keeps the item — same id, same place, same stretched size — and only recolours it.
h = dispatch(h, { type: "setPlacementVariant", id: "p-back", variantId: "v2" });
const recoloured = h.present.placements.find((p) => p.id === "p-back")!;
assert(recoloured.variantId === "v2" && recoloured.tableId === "t2", "setPlacementVariant recolours in place");

// A drape's run along its wall, and a carpet's drawn size.
h = dispatch(h, {
  type: "addPlacement",
  placement: { id: "drape", variantId: "curtain", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, span: { wallId: "w1", from: 0, to: 1 } },
});
h = dispatch(h, { type: "setPlacementSpan", id: "drape", span: { wallId: "w1", from: 0.25, to: 0.75 } });
assert(h.present.placements.find((p) => p.id === "drape")?.span?.from === 0.25, "setPlacementSpan shortens the run");
h = dispatch(h, { type: "setPlacementRail", id: "drape", rail: { type: "wall", wallId: "w1", from: 0.25, to: 0.5 }, dropMm: 2400 });
const railed = h.present.placements.find((p) => p.id === "drape");
assert(railed?.rail?.type === "wall" && railed.rail.to === 0.5 && !railed.span && railed.dropMm === 2400, "setPlacementRail writes the rail, lets the legacy span go, and sets the drop");
h = dispatch(h, { type: "setPlacementRail", id: "drape", rail: railed!.rail!, dropMm: null });
assert(h.present.placements.find((p) => p.id === "drape")?.dropMm === undefined, "…a null drop is to the floor again");
h = dispatch(h, { type: "resizePlacement", id: "drape", sizeMm: { widthMm: 3000, depthMm: 2000 } });
assert(h.present.placements.find((p) => p.id === "drape")?.sizeMm?.widthMm === 3000, "resizePlacement records the drawn size");

// A saved sketch loaded whole: it replaces the drawing, keeps the calibration, and is one undo.
{
  const tb = (id: string, number: number): DesignTable => ({ id, type: "עגול", number, position: { x: 0, y: 0 }, rotation: 0 });
  let h = initHistory({ calibration: { mmPerUnit: 2 }, tables: [tb("old", 1)], placements: [] });
  h = dispatch(h, { type: "loadDocument", content: { calibration: { mmPerUnit: 9 }, tables: [tb("a", 4), tb("b", 5)], placements: [], groups: [{ id: "g", number: 4 }] } });
  assert(h.present.tables.length === 2 && h.present.tables[0].id === "a", "loadDocument puts the sketch's tables in place of the old ones");
  assert(h.present.calibration.mmPerUnit === 2, "…and keeps the venue's own calibration");
  assert(h.present.groups?.length === 1, "…with the sketch's groups");
  assert(undo(h).present.tables[0].id === "old", "…and one undo brings the old drawing back");
}

// "על כל השולחנות" — every table, whatever its type.
let g = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
g = dispatch(g, { type: "addTable", table: { id: "r1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 } });
g = dispatch(g, { type: "addTable", table: { id: "k1", type: "אביר", number: 2, position: { x: 0, y: 0 }, rotation: 0 } });
const cloth = { variantId: "gold", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };
g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.filter((t) => t.type === "עגול").map((t) => t.id), placement: cloth });
assert(g.present.placements.length === 1, "applying to just the round tables' ids reaches only the round table");
g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.map((t) => t.id), placement: cloth });
assert(g.present.placements.length === 2, "applying to every table's id reaches the knight table too, without duplicating the round one");

// A cover is one per table: spreading cream over a room wearing gold swaps, never stacks.
g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.map((t) => t.id), placement: { ...cloth, variantId: "cream" }, replaces: ["gold", "cream"] });
assert(g.present.placements.length === 2, "recolouring every table adds no second cloth");
assert(g.present.placements.every((p) => p.variantId === "cream"), "…and every table now wears cream");
assert((g.present.exceptions?.length ?? 0) === 0, "a swap is not a removal, so it records no exception");
// …and the cloth's contour goes with it: on the tables already in cream as on the recoloured ones.
const hem = { widthMm: 40, colour: "#c9a24a" };
g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.map((t) => t.id), placement: { ...cloth, variantId: "cream", border: hem }, replaces: ["gold", "cream"] });
assert(g.present.placements.length === 2 && g.present.placements.every((p) => p.border?.colour === "#c9a24a"), "applying a hemmed cloth hems every table's cloth, adding none");
g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.map((t) => t.id), placement: { ...cloth, variantId: "gold" }, replaces: ["gold", "cream"] });
assert(g.present.placements.every((p) => p.variantId === "gold" && !("border" in p)), "…and a plain one takes the hem away again, back to the row's");

// Applying to an explicit list of tables — the general case the two old actions were both
// special cases of.
{
  let g = initHistory({
    calibration: { mmPerUnit: 1 },
    tables: [
      { id: "t1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 },
      { id: "t2", type: "עגול", number: 2, position: { x: 0, y: 0 }, rotation: 0 },
      { id: "t3", type: "אביר", number: 3, position: { x: 0, y: 0 }, rotation: 0 },
    ],
    placements: [],
  });
  const cloth = { variantId: "gold", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };

  g = dispatch(g, { type: "applyToTables", tableIds: ["t1", "t3"], placement: cloth });
  assert(g.present.placements.length === 2, "only the two tables named are dressed");
  assert(!g.present.placements.some((p) => p.tableId === "t2"), "…and the one that was not is left bare");

  const before = g.present;
  g = dispatch(g, { type: "applyToTables", tableIds: ["t1"], placement: cloth });
  assert(g.present === before, "re-applying to a table that already wears it is not an edit");

  g = dispatch(g, { type: "applyToTables", tableIds: ["gone"], placement: cloth });
  assert(g.present === before, "a table id that is not there is ignored, not a crash");

  g = dispatch(g, { type: "applyToTables", tableIds: [], placement: cloth });
  assert(g.present === before, "applying to nothing is not an edit");
}

// Copying one table's whole dressing onto others.
{
  const dressed = (id: string, tableId: string, variantId: string) => ({
    id, variantId, layer: "table" as const, tableId, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1,
  });
  const table = (id: string, type: string): DesignTable => ({ id, type, number: 1, position: { x: 0, y: 0 }, rotation: 0 });
  const g = initHistory({
    calibration: { mmPerUnit: 1 },
    tables: [table("t1", "עגול"), table("t2", "עגול"), table("t3", "עגול")],
    placements: [
      dressed("a", "t1", "gold-cloth"),
      dressed("b", "t1", "centrepiece"),
      dressed("c", "t2", "cream-cloth"),
    ],
  });

  // add: the target gains what it lacks — but a table wears ONE cloth, so its cream one is
  // RECOLOURED to the source's gold rather than joined by it. Without `replaces` the reducer has
  // no way to know cream and gold are the same garment, which is why the caller passes the shade
  // list; an earlier version of this assertion expected 3 items here, and that second invisible
  // cloth was billed to the client by the quote.
  const shades = ["gold-cloth", "cream-cloth"];
  const add = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add", replaces: shades });
  const onT2 = add.present.placements.filter((p) => p.tableId === "t2");
  assert(onT2.length === 2, "the target ends up with one cloth and the centrepiece, not two cloths");
  assert(onT2.some((p) => p.variantId === "gold-cloth"), "…and the cloth it wears is the source's");
  assert(!onT2.some((p) => p.variantId === "cream-cloth"), "…its own having been recoloured, not doubled");
  assert(add.present.placements.filter((p) => p.tableId === "t1" && p.variantId === "gold-cloth").length === 1, "the source still wears exactly one");

  // Told nothing about shades, it cannot know two cloths are one garment — the old behaviour,
  // kept deliberately so a caller that omits `replaces` is never silently lossy.
  const naive = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add" });
  assert(naive.present.placements.filter((p) => p.tableId === "t2").length === 3, "without a shade list it adds rather than recolours");

  // Recolouring is itself the edit: nothing added, but the document moved.
  const already = dispatch(add, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add", replaces: shades });
  assert(already.present === add.present, "…and re-running it once the shades already match is not an edit");

  // replace: the target ends up identical to the source.
  const rep = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2", "t3"], mode: "replace" });
  for (const t of ["t2", "t3"]) {
    const on = rep.present.placements.filter((p) => p.tableId === t).map((p) => p.variantId).sort();
    assert(on.join(",") === "centrepiece,gold-cloth", `${t} is now dressed exactly like the source`);
  }
  assert(rep.present.placements.filter((p) => p.tableId === "t1").length === 2, "the source is untouched");

  // Every copy is its own row.
  const ids = new Set(rep.present.placements.map((p) => p.id));
  assert(ids.size === rep.present.placements.length, "each copy gets its own id");

  // Nothing to copy, and copying onto itself, are both no-ops rather than edits.
  assert(dispatch(g, { type: "copyDressing", fromTableId: "t3", toTableIds: ["t2"], mode: "add" }).present === g.present, "an undressed source copies nothing");
  assert(dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t1"], mode: "add" }).present === g.present, "a table cannot be dressed from itself");
  assert(dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: [], mode: "add" }).present === g.present, "copying onto nothing is not an edit");

  // replace clears the target's exceptions: "make it identical" overrides an older divergence.
  const ex = initHistory({
    calibration: { mmPerUnit: 1 },
    tables: [table("t1", "עגול"), table("t2", "עגול")],
    placements: [dressed("a", "t1", "gold-cloth")],
    exceptions: [{ tableId: "t2", variantId: "gold-cloth" }],
  });
  const kept = dispatch(ex, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add" });
  assert(kept.present.placements.filter((p) => p.tableId === "t2").length === 0, "add honours a recorded exception");
  const forced = dispatch(ex, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
  assert(forced.present.placements.some((p) => p.tableId === "t2"), "replace overrides it");
  assert((forced.present.exceptions ?? []).length === 0, "…and clears it, so it cannot come back");
}

// ── where things stand on a table ─────────────────────────────────────────────────────────────
{
  const t = (id: string): DesignTable => ({ id, type: "מלבן", number: 1, position: { x: 0, y: 0 }, rotation: 0, widthMm: 2400, depthMm: 1000 });
  const item = (id: string, tableId: string, variantId: string): Placement => ({ id, variantId, layer: "table", tableId, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
  const base: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [t("t1"), t("t2")],
    placements: [item("a", "t1", "candle"), item("b", "t1", "flowers")],
  };
  const arranged = apply(base, { type: "arrangeDressing", tableId: "t1", positions: [{ id: "a", position: { x: -700, y: 0 } }, { id: "b", position: { x: 0.4, y: 0 } }] });
  assert(arranged.tables[0].arranged === true, "arranging a table marks it arranged");
  assert(arranged.placements[0].position.x === -700 && arranged.placements[1].position.x === 0, "…and stores where each item stands, to the millimetre");
  assert(apply(base, { type: "arrangeDressing", tableId: "gone", positions: [] }) === base, "arranging a missing table is not an edit");
  assert(apply(base, { type: "arrangeDressing", tableId: "t2", positions: [{ id: "a", position: { x: 9, y: 9 } }] }).placements[0].position.x === 0, "an item on another table is not moved");

  // A table set worn by tables (the studio's wearSet: one wearItems per table it lands on).
  const items: Omit<Placement, "id" | "tableId">[] = [{ variantId: "candle", layer: "table", quantity: 2, position: { x: 600, y: 0 }, rotation: 0, scale: 1 }];
  const worn = ["t1", "t2", "gone"].reduce((d, tableId) => apply(d, { type: "wearItems", tableId, items, arranged: true, mode: "replace" }), base);
  assert(worn.placements.filter((p) => p.variantId === "candle").length === 2 && !worn.placements.some((p) => p.variantId === "flowers"), "a table set worn in place replaces what each table wore");
  assert(worn.tables.every((t) => t.arranged) && worn.placements.every((p) => p.position.x === 600 && p.quantity === 2), "…standing where it was saved, as many as it was");
  const added = apply(base, { type: "wearItems", tableId: "t1", items, arranged: true, mode: "add" });
  assert(added === base, "add gives a table only what it lacks — t1 already has its candle");

  const vased = apply(base, { type: "setPlacementVessel", ids: ["a"], vessel: "jug" });
  assert(vased.placements[0].vessel === "jug", "an arrangement is set in the vase it is given");
  assert(apply(vased, { type: "setPlacementVessel", ids: ["a"], vessel: null }).placements[0].vessel === null, "…taken out of every vase with null");
  assert(!("vessel" in apply(vased, { type: "setPlacementVessel", ids: ["a"], vessel: undefined }).placements[0]), "…and back to its row's own with undefined");
  assert(apply(vased, { type: "setPlacementVessel", ids: ["a"], vessel: "jug" }) === vased, "the same vase again changes nothing");
  // A contour on this plan (Placement.border): its own, none here (null), or back to the row's.
  const gold = { widthMm: 80, colour: "#c9a24a" };
  const hemmed = apply(base, { type: "setPlacementBorder", ids: ["a"], border: { ...gold, widthMm: 80.4 } });
  assert(hemmed.placements[0].border?.widthMm === 80 && hemmed.placements[0].border?.colour === "#c9a24a", "a contour is kept, cleaned to whole millimetres");
  assert(apply(hemmed, { type: "setPlacementBorder", ids: ["a"], border: { ...gold } }) === hemmed, "the same contour again changes nothing");
  assert(apply(hemmed, { type: "setPlacementBorder", ids: ["a"], border: null }).placements[0].border === null, "…none on this plan with null");
  assert(!("border" in apply(hemmed, { type: "setPlacementBorder", ids: ["a"], border: undefined }).placements[0]), "…and back to its row's own with undefined");
  assert(apply(base, { type: "setPlacementBorder", ids: ["a"], border: { widthMm: 50 } as unknown as typeof gold }) === base, "a contour with no colour is refused");
  // An aisle's own answers: laid over what it carries, cleaned, null = back to the row's.
  const walk = apply(base, { type: "setPlacementAisle", ids: ["a"], patch: { pitchMm: 1234.6, piece: "rose-box", sides: "both" } });
  assert(JSON.stringify(walk.placements[0].aisle) === '{"pitchMm":1235,"sides":"both","piece":"rose-box"}', "an aisle's step, sides and piece are stored on the placement");
  assert(apply(walk, { type: "setPlacementAisle", ids: ["a"], patch: { pitchMm: 1235 } }) === walk, "…the same again changes nothing");
  assert(!("aisle" in apply(walk, { type: "setPlacementAisle", ids: ["a"], patch: { pitchMm: null, piece: null, sides: null } }).placements[0]), "…and null hands each back to the row");
  const big = apply(base, { type: "setPlacementScale", id: "a", scale: 1.256 });
  assert(big.placements[0].scale === 1.26 && apply(base, { type: "setPlacementScale", id: "a", scale: 9 }).placements[0].scale === 3, "a drawing size is rounded and held to 30%–300%");
  const hung = apply(base, { type: "setPlacementHang", id: "a", heightMm: 3204 });
  assert(hung.placements[0].hangHeightMm === 3200, "a hang height is kept in whole centimetres");
  assert(!("hangHeightMm" in apply(hung, { type: "setPlacementHang", id: "a", heightMm: null }).placements[0]), "null hands it back to the catalog's height");
  const climbed = apply(base, { type: "setPlacementClimb", id: "a", climb: { heightMm: 290 }, sizeMm: { widthMm: 1200, depthMm: 3480 }, position: { x: 5, y: 1860 } });
  assert(climbed.placements[0].climb?.heightMm === 290 && climbed.placements[0].sizeMm?.depthMm === 3480 && climbed.placements[0].position.y === 1860, "a climb's rise, run and place land as one edit");
  assert(!("climb" in apply(climbed, { type: "setPlacementClimb", id: "a", climb: {} }).placements[0]), "an empty climb leaves no field behind");
  const block = apply(base, { type: "setChairRows", id: "a", rows: { rows: 5, perRow: 5 }, position: { x: 0, y: 900 } });
  assert(block.placements[0].rows?.perRow === 5 && block.placements[0].quantity === 25 && block.placements[0].position.y === 900, "a block of 5×5 is 25 chairs on the quote, its front row kept in place");
  const single = apply(block, { type: "setChairRows", id: "a", rows: null });
  assert(!("rows" in single.placements[0]) && single.placements[0].quantity === 1, "…and put back, one chair again");
  // A sofa that is not seating (U6, QA BQ-3): the flag is written, and taken off leaves no field.
  const lounge = apply(base, { type: "setPlacementSeating", ids: ["a"], counted: false });
  assert(lounge.placements[0].notSeating === true, "a sofa marked not seating carries the flag");
  assert(apply(lounge, { type: "setPlacementSeating", ids: ["a"], counted: false }) === lounge, "…the same again changes nothing");
  assert(!("notSeating" in apply(lounge, { type: "setPlacementSeating", ids: ["a"], counted: true }).placements[0]), "…and counted again, no field is left behind");

  const reset = apply(arranged, { type: "resetDressing", tableId: "t1" });
  assert(!("arranged" in reset.tables[0]) && reset.placements.every((p) => p.position.x === 0), "reset hands the table back to the automatic layout");
  assert(apply(base, { type: "resetDressing", tableId: "t1" }) === base, "resetting an unarranged table is not an edit");

  const copied = apply(arranged, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
  assert(copied.tables[1].arranged === true, "replace carries the arrangement");
  assert(copied.placements.find((p) => p.tableId === "t2" && p.variantId === "candle")?.position.x === -700, "…and each item's place on it");
  const auto = apply(copied, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
  assert(auto.tables[1].arranged === true, "re-copying an arranged table keeps the target arranged");
  const fromAuto = apply({ ...copied, tables: [t("t1"), copied.tables[1]] }, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
  assert(!("arranged" in fromAuto.tables[1]), "copying from an automatic table makes the target automatic too");
}

// ── grouping ──────────────────────────────────────────────────────────────────────────────────
{
  const tbl = (id: string, number: number): DesignTable => ({ id, type: "עגול 180", number, position: { x: 0, y: 0 }, rotation: 0, diameterMm: 1800, seats: 12 });
  let g = initHistory({
    calibration: { mmPerUnit: 1 },
    tables: [tbl("a", 3), tbl("b", 7), tbl("c", 9)],
    placements: [{ id: "deck", variantId: "stage", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 }],
  });
  const before = g.present;

  assert(apply(before, { type: "group", groupId: "g1", refs: [{ kind: "table", id: "a" }] }) === before, "one thing is not a group");

  g = dispatch(g, { type: "group", groupId: "g1", refs: [{ kind: "table", id: "a" }, { kind: "table", id: "b" }], number: 3 });
  assert(g.present.groups?.length === 1 && g.present.groups[0].number === 3, "a group carries the one number");
  assert(g.present.tables.filter((t) => t.groupId === "g1").length === 2, "…and its members point at it");
  assert(g.present.tables.find((t) => t.id === "b")?.number === 7, "a grouped table keeps its own number underneath");

  g = dispatch(g, { type: "renumberGroup", groupId: "g1", number: 12 });
  assert(g.present.groups?.[0].number === 12, "the group renumbers as one");
  assert(g.present.tables.find((t) => t.id === "a")?.number === 3, "…without touching any member's own number");

  // Pulling a member into a new group empties the old one, which then has to go.
  let h2 = dispatch(g, { type: "group", groupId: "g2", refs: [{ kind: "table", id: "b" }, { kind: "table", id: "c" }] });
  assert(h2.present.groups?.length === 1 && h2.present.groups[0].id === "g2", "a group emptied by a re-group is dropped");
  assert(h2.present.tables.find((t) => t.id === "a")?.groupId === undefined, "…and its last member stops claiming it");

  // Deleting one of a pair does the same.
  h2 = dispatch(g, { type: "removeTable", id: "a" });
  assert(h2.present.groups?.length === 0, "a group of one is not a group");
  assert(h2.present.tables.find((t) => t.id === "b")?.groupId === undefined, "…and the survivor is loose again");

  // Ungrouping puts everything back exactly as it was.
  const ungrouped = apply(g.present, { type: "ungroup", groupId: "g1" });
  assert(ungrouped.groups?.length === 0, "ungroup drops the group");
  assert(ungrouped.tables.every((t) => t.groupId === undefined), "…and releases every member");
  assert(ungrouped.tables.map((t) => t.number).join(",") === "3,7,9", "…leaving the numbers they always had");

  // BUG (was): a block of 1 and 2, renumbered to 1 with a table beside it renumbered to 2, came
  // apart as two table 2s — the member's hidden 2 was handed back as though nothing had changed.
  {
    const pair = apply(
      { calibration: { mmPerUnit: 1 }, tables: [tbl("p", 1), tbl("q", 2), tbl("r", 3)], placements: [] },
      { type: "group", groupId: "b", refs: [{ kind: "table", id: "p" }, { kind: "table", id: "q" }], number: 1 },
    );
    const room = apply(pair, { type: "renumberTable", id: "r", number: 2 });
    const apart = apply(room, { type: "ungroup", groupId: "b" });
    const nums = apart.tables.map((t) => t.number);
    assert(new Set(nums).size === 3, `an ungrouped block never duplicates a number the room now shows (${nums.join(",")})`);
    assert(apart.tables.find((t) => t.id === "p")?.number === 1, "…a member whose own number is still free keeps it");
    assert(apart.tables.find((t) => t.id === "q")?.number === 3, "…and one whose number was taken goes to the end");
  }

  // BUG (was): the number field parses decimals and minus signs; the reducer stored them.
  assert(apply(before, { type: "renumberTable", id: "a", number: 2.6 }).tables[0].number === 3, "a table number is whole");
  assert(apply(before, { type: "renumberTable", id: "a", number: -4 }).tables[0].number === 0, "…and never negative");
  assert(apply(before, { type: "renumberTable", id: "a", number: NaN }) === before, "…and nothing usable is no edit");
  assert(apply(g.present, { type: "renumberGroup", groupId: "g1", number: 4.4 }).groups?.[0].number === 4, "a block's number is whole too");

  // Out of the numbering, and back.
  {
    const off = apply(before, { type: "setTablesNumbered", tableIds: ["b"], numbered: false });
    assert(off.tables.find((t) => t.id === "b")?.unnumbered === true, "a table can be taken out of the numbering");
    assert(off.tables.find((t) => t.id === "b")?.number === 7, "…keeping its number underneath");
    assert(apply(off, { type: "setTablesNumbered", tableIds: ["b"], numbered: false }) === off, "…and doing it again is no edit");
    const taken = apply(off, { type: "renumberTable", id: "c", number: 7 });
    const back = apply(taken, { type: "setTablesNumbered", tableIds: ["b"], numbered: true });
    const b = back.tables.find((t) => t.id === "b")!;
    assert(!("unnumbered" in b), "back in, the flag goes rather than reading false");
    assert(b.number === 8, "…and a number another table took meanwhile is not handed back: it goes to the end");
    const free = apply(off, { type: "setTablesNumbered", tableIds: ["b"], numbered: true });
    assert(free.tables.find((t) => t.id === "b")?.number === 7, "…while one still free is kept");
    const block = apply(g.present, { type: "setTablesNumbered", tableIds: ["a", "b"], numbered: false });
    const blockTaken = apply(block, { type: "renumberTable", id: "c", number: 12 });
    const blockBack = apply(blockTaken, { type: "setTablesNumbered", tableIds: ["a", "b"], numbered: true });
    assert(blockBack.groups?.[0].number === 13, "a block coming back into the numbering takes a number nobody shows");
  }

  // Tables and placements group together — a stage deck and the tables beside it are one thing if
  // the designer says so.
  const mixed = apply(before, { type: "group", groupId: "g3", refs: [{ kind: "table", id: "a" }, { kind: "placement", id: "deck" }] });
  assert(mixed.placements[0].groupId === "g3" && mixed.tables[0].groupId === "g3", "a group can hold both kinds");
  assert(groupOf(mixed, "g3")?.number === undefined, "a group nobody numbered carries no number");
  assert(groupOf(mixed, undefined) === undefined, "an ungrouped thing has no group");

  // Ctrl+G over a group of stages (studio-screen groupStages): the ones that touched were merged
  // — the folded-in member removed — and what was left re-grouped under a new id, in one entry.
  // The old group goes with its member; the survivors belong to the new one and to nothing else.
  const deckAt = (id: string, x: number): Placement => ({ id, variantId: "stage", layer: "floor", quantity: 1, position: { x, y: 0 }, rotation: 0, scale: 1 });
  let regrouped: DesignDocumentContent = { calibration: { mmPerUnit: 9 }, tables: [], placements: [deckAt("p", 0), deckAt("q", 2000), deckAt("r", 9000)] };
  regrouped = apply(regrouped, { type: "group", groupId: "old", refs: ["p", "q", "r"].map((id) => ({ kind: "placement" as const, id })) });
  regrouped = apply(regrouped, { type: "removePlacement", id: "q" });
  regrouped = apply(regrouped, { type: "group", groupId: "new", refs: [{ kind: "placement", id: "p" }, { kind: "placement", id: "r" }] });
  assert(regrouped.groups?.length === 1 && regrouped.groups[0].id === "new", "a stage group whose touching members merged is re-grouped under a new id, the old one gone");
  assert(regrouped.placements.length === 2 && regrouped.placements.every((p) => p.groupId === "new"), "…and every survivor belongs to it alone");
  // All of them merged into one: a group of one is no group, so the lone stage stands free.
  const allOne = apply(apply(regrouped, { type: "removePlacement", id: "r" }), { type: "setPlacementStage", id: "p", stage: { outline: [{ x: -1000, y: -500 }, { x: 1000, y: -500 }, { x: 1000, y: 500 }, { x: -1000, y: 500 }], front: 0, decks: ["stage"] } });
  assert(!allOne.groups?.length && allOne.placements[0].groupId === undefined && !!allOne.placements[0].stage, "…and when every member merged into one, that stage is in no group");

  // Occupancy: never negative, and never silently trimmed to the seat count either.
  const chaired = apply(before, { type: "setTableChair", ids: ["a"], variantId: "napoleon" });
  assert(chaired.tables[0].chairVariantId === "napoleon", "a table takes the chair it was given");
  assert(!("chairVariantId" in apply(chaired, { type: "setTableChair", ids: ["a"], variantId: null }).tables[0]), "null puts it back on the studio's default");
  const filled = apply(before, { type: "setTableSeated", id: "a", seated: 9 });
  assert(filled.tables[0].seated === 9, "a table remembers how many of its chairs are taken");
  assert(apply(before, { type: "setTableSeated", id: "a", seated: -2 }).tables[0].seated === 0, "…never a negative number of people");
  const crowded = apply(apply(before, { type: "setTableSeats", id: "a", seats: 8 }), { type: "setTableSeated", id: "a", seated: 9 });
  const walled = apply(before, { type: "setTableBlockedSides", id: "a", sides: [2, 0, 2, -1] });
  assert(JSON.stringify(walled.tables[0].blockedSides) === "[0,2]", "a table's blocked sides are stored once each, in order");
  assert(!("blockedSides" in apply(walled, { type: "setTableBlockedSides", id: "a", sides: null }).tables[0]), "…and null hands them back to the catalog");
  assert(crowded.tables[0].seated === 9, "…and over-seating is recorded, not refused — the plan says 9/8 rather than losing the number");

  const reseated = apply(before, { type: "setTableSeats", id: "a", seats: 8 });
  assert(reseated.tables[0].seats === 8, "a table can be seated differently from its catalog row");
  assert(apply(before, { type: "setTableSeats", id: "a", seats: -4 }).tables[0].seats === 0, "…but never by a negative number of people");
}

// ── rotation ────────────────────────────────────────────────────────────────────────────────────
{
  const base: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [
      { id: "a", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 },
      { id: "b", type: "round", number: 2, position: { x: 1000, y: 0 }, rotation: 0 },
    ],
    placements: [{ id: "p", variantId: "v", layer: "floor", quantity: 1, position: { x: 0, y: 1000 }, rotation: 0, scale: 1 }],
  };
  assert(apply(base, { type: "rotateTable", id: "a", rotation: 90 }).tables[0].rotation === 90, "a table can be turned");
  assert(apply(base, { type: "rotateTable", id: "a", rotation: 450 }).tables[0].rotation === 90, "…and the angle wraps into [0,360)");
  assert(apply(base, { type: "rotateTable", id: "a", rotation: -90 }).tables[0].rotation === 270, "…including backwards");
  assert(apply(base, { type: "rotatePlacement", id: "p", rotation: 30 }).placements[0].rotation === 30, "so can a placed item");

  // A group spun about a pivot: both the centres and the facings come from the handle, absolute.
  const spun = apply(base, {
    type: "rotateMany",
    turns: [
      { kind: "table", id: "a", position: { x: 500, y: -500 }, rotation: 90 },
      { kind: "table", id: "b", position: { x: 500, y: 500 }, rotation: 90 },
      { kind: "placement", id: "p", position: { x: -500, y: 0 }, rotation: 90 },
    ],
  });
  assert(spun.tables[0].position.y === -500 && spun.tables[1].position.y === 500, "a group rotate moves every member's centre");
  assert(spun.tables.every((t) => t.rotation === 90) && spun.placements[0].rotation === 90, "…and turns each of them too");
  assert(apply(base, { type: "rotateMany", turns: [] }) === base, "an empty rotation is not an edit");

  // One entry per gesture, however many frames it took — the same amend() the drag already uses.
  let r = initHistory(base);
  r = dispatch(r, { type: "rotateTable", id: "a", rotation: 10 });
  r = amend(r, { type: "rotateTable", id: "a", rotation: 45 });
  assert(r.present.tables[0].rotation === 45 && r.past.length === 1, "a rotate drag is one history entry");
  assert(undo(r).present.tables[0].rotation === 0, "…and one undo puts the table back square");
}

// ── stacking ────────────────────────────────────────────────────────────────────────────────────
// What "front" MEANS is in ./stacking.ts and self-checked there. This is only that the reducer
// writes what it is handed, to both kinds of thing, and touches nothing else.
{
  const item = (id: string): Placement => ({
    id,
    variantId: "v",
    layer: "floor",
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
  });
  const base: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [{ id: "t", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 }],
    placements: [item("x"), item("y")],
  };
  const done = apply(base, {
    type: "restack",
    assign: [
      { kind: "placement", id: "x", order: 7 },
      { kind: "table", id: "t", order: -3 },
    ],
  });
  assert(done.placements.find((p) => p.id === "x")!.order === 7, "an assignment lands on a placement");
  assert(done.tables[0].order === -3, "…and on a table, in the same action");
  assert(done.placements.find((p) => p.id === "y")!.order === undefined, "…and leaves everything unnamed alone");
  assert(apply(base, { type: "restack", assign: [] }) === base, "restacking nothing is not an edit");
  assert(base.tables[0].order === undefined, "…and the document it was applied to is not mutated");
}

// ── the venue's own movable features, arranged for THIS event ───────────────────────────────────
{
  const base: DesignDocumentContent = { calibration: { mmPerUnit: 1 }, tables: [], placements: [] };
  const arranged = apply(base, { type: "arrangeFeature", featureId: "bar", dx: 500, dy: -250 });
  assert(arranged.features?.length === 1 && arranged.features[0].dx === 500, "an event can push the venue's bar across the room");
  assert(arranged.features![0].rotationDeg === undefined, "…without claiming to have turned it");

  // Dragging a turned feature keeps its facing: a move is not a straighten.
  const turned = apply(arranged, { type: "arrangeFeature", featureId: "bar", dx: 0, dy: 0, rotationDeg: 90 });
  const dragged = apply(turned, { type: "arrangeFeature", featureId: "bar", dx: 800, dy: 800 });
  assert(dragged.features![0].rotationDeg === 90, "dragging a turned feature does not straighten it");
  assert(dragged.features![0].dx === 800, "…and it still moves");
  assert(dragged.features!.length === 1, "…on the one row it already had, not a second");

  // Put it back: the row goes, and the last one takes the field with it.
  const reset = apply(dragged, { type: "resetFeature", featureId: "bar" });
  assert(reset.features === undefined, "putting the last feature back leaves no trace that one moved");
  assert(apply(base, { type: "resetFeature", featureId: "bar" }) === base, "…and resetting one nobody moved is not an edit");
  const two = apply(dragged, { type: "arrangeFeature", featureId: "pool", dx: 10, dy: 10 });
  assert(apply(two, { type: "resetFeature", featureId: "bar" }).features?.length === 1, "putting one back leaves the other arranged");
  // Taken out for this event, and brought back — where it last stood.
  const gone = apply(dragged, { type: "removeFeatures", featureIds: ["bar"] });
  assert(gone.features?.find((f) => f.featureId === "bar")?.removed === true, "taking a feature out flags its row");
  assert(gone.features?.find((f) => f.featureId === "bar")?.dx === dragged.features?.find((f) => f.featureId === "bar")?.dx, "…and keeps where this event had it");
  const back = apply(gone, { type: "restoreFeatures", featureIds: ["bar"] });
  assert(!back.features?.find((f) => f.featureId === "bar")?.removed, "bringing it back clears the flag");
  assert(back.features?.find((f) => f.featureId === "bar")?.dx === dragged.features?.find((f) => f.featureId === "bar")?.dx, "…at the same offset");
  const fresh = apply(base, { type: "removeFeatures", featureIds: ["pool"] });
  assert(fresh.features?.length === 1 && fresh.features[0].removed === true && fresh.features[0].dx === 0, "an unmoved feature gets a row that only says 'taken out'");
  assert(!("features" in apply(fresh, { type: "restoreFeatures", featureIds: ["pool"] })), "…which leaves no trace once it is back");

  // A feature travels in a group drag with the tables beside it, in the one action.
  const withTable: DesignDocumentContent = {
    ...base,
    tables: [{ id: "t", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 }],
  };
  const moved = apply(withTable, {
    type: "moveMany",
    moves: [
      { kind: "table", id: "t", position: { x: 100, y: 100 } },
      { kind: "feature", id: "bar", position: { x: 100, y: 100 } },
    ],
  });
  assert(moved.tables[0].position.x === 100 && moved.features?.[0].dx === 100, "one delta carries a table and a venue feature together");
}

// ── mirroring and resizing ──────────────────────────────────────────────────────────────────────
{
  const base: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [{ id: "t", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 30 }],
    placements: [{ id: "p", variantId: "sofa", layer: "floor", quantity: 1, position: { x: 1000, y: 0 }, rotation: 0, scale: 1 }],
  };
  const once = apply(base, {
    type: "mirrorMany",
    flips: [
      { kind: "table", id: "t", position: { x: 1000, y: 0 }, rotation: -30, mirrored: true },
      { kind: "placement", id: "p", position: { x: 0, y: 0 }, rotation: 0, mirrored: true },
    ],
  });
  assert(once.tables[0].mirrored === true && once.tables[0].rotation === 330, "a mirror writes the flip and the reflected facing");
  assert(once.placements[0].position.x === 0 && once.placements[0].mirrored === true, "…and moves a member across the axis");
  const back = apply(once, { type: "mirrorMany", flips: [{ kind: "placement", id: "p", position: { x: 1000, y: 0 }, rotation: 0, mirrored: false }] });
  assert(!("mirrored" in back.placements[0]), "unflipping removes the field rather than storing false");
  assert(apply(base, { type: "mirrorMany", flips: [] }) === base, "mirroring nothing is not an edit");

  const wide = apply(base, { type: "resizeTable", id: "t", sizeMm: { widthMm: 4800, depthMm: 1200 } });
  assert(wide.tables[0].sizeMm?.widthMm === 4800, "a table can be stretched");
  assert(!("sizeMm" in apply(wide, { type: "resizeTable", id: "t", sizeMm: null }).tables[0]), "…and null hands it back to the catalog's size");
  const sized = apply(base, { type: "resizePlacement", id: "p", sizeMm: { widthMm: 2400, depthMm: 900 } });
  assert(!("sizeMm" in apply(sized, { type: "resizePlacement", id: "p", sizeMm: null }).placements[0]), "a placement's size resets the same way");
  const curved = apply(sized, { type: "setPlacementBows", id: "p", bows: [0.2, 0, 0, -0.1] });
  assert(curved.placements[0].bows?.[0] === 0.2 && curved.placements[0].sizeMm?.widthMm === 2400, "a rug's sides bow and keep their size");
  assert(apply(curved, { type: "resizePlacement", id: "p", sizeMm: { widthMm: 3000, depthMm: 900 } }).placements[0].bows?.[3] === -0.1, "stretching keeps the curves (they are fractions)");
  assert(!("bows" in apply(curved, { type: "setPlacementBows", id: "p", bows: [0, 0, 0, 0] }).placements[0]), "all sides straight takes the field away");
  assert(!("bows" in apply(curved, { type: "setPlacementBows", id: "p", bows: null }).placements[0]), "null straightens it too");
  const rounded = apply(sized, { type: "setPlacementCorners", id: "p", corners: [300, 300, 0, 0] });
  assert(rounded.placements[0].corners?.[0] === 300 && rounded.placements[0].corners?.[2] === 0, "a rug's corners round");
  assert(apply(rounded, { type: "resizePlacement", id: "p", sizeMm: { widthMm: 3000, depthMm: 900 } }).placements[0].corners?.[1] === 300, "stretching keeps the radius (it is a measurement)");
  assert(!("corners" in apply(rounded, { type: "setPlacementCorners", id: "p", corners: null }).placements[0]), "null squares them again");

  // A swap keeps the table and replaces only what described its old catalog row.
  const dressed: DesignDocumentContent = {
    ...wide,
    tables: [{ ...wide.tables[0], number: 7, seats: 10, seated: 8, blockedSides: [0], groupId: "g", style: { fill: "#fff" }, footprint: { kind: "ellipse", widthMm: 2400, depthMm: 1200 } }],
  };
  const round = apply(dressed, {
    type: "retypeTable",
    id: "t",
    table: { type: "עגול 150", variantId: "round-150", diameterMm: 1500, seats: 12 },
  }).tables[0];
  assert(round.type === "עגול 150" && round.variantId === "round-150" && round.diameterMm === 1500, "a swap takes the new row's type and size");
  assert(round.seats === 12 && !("widthMm" in round) && !("sizeMm" in round) && !("blockedSides" in round), "…drops the old row's size, stretch and blocked sides");
  assert(!("footprint" in round), "…and a row-less table's own shape (a venue table no row matched): its row draws it now");
  assert(round.number === 7 && round.seated === 8 && round.groupId === "g" && round.style?.fill === "#fff", "…and keeps its number, occupancy, group and look");
  const seatless = apply(dressed, { type: "retypeTable", id: "t", table: { type: "בר", variantId: "bar", widthMm: 600, depthMm: 600 } });
  assert(!("seats" in seatless.tables[0]), "a row with no seats leaves no stale chair count behind");
  const replaced = apply(dressed, { type: "retypeTable", id: "t", table: { type: "x", variantId: "x" }, position: { x: 5, y: 6 } });
  assert(replaced.tables[0].position.x === 5 && replaced.placements === dressed.placements, "a swap may re-place the table, and leaves its dressing alone");
}

// HUNG OVER A TABLE. A chandelier linked to a table goes where the table goes — moved, turned —
// and is left hanging free where it was when the table is removed; one in the same drag as its
// table is placed by the drag, not carried twice.
{
  let g = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
  g = dispatch(g, { type: "addTable", table: { id: "t7", type: "מלבן", number: 7, position: { x: 5000, y: 3000 }, rotation: 0 } });
  const chand: Placement = { id: "ch", variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 5600, y: 3000 }, rotation: 0, scale: 1, over: "t7" };
  const freeOne: Placement = { id: "fr", variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 9000, y: 9000 }, rotation: 0, scale: 1 };
  g = dispatch(g, { type: "addPlacement", placement: chand });
  g = dispatch(g, { type: "addPlacement", placement: freeOne });
  g = dispatch(g, { type: "moveTable", id: "t7", position: { x: 8000, y: 3000 } });
  const at = (id: string) => g.present.placements.find((p) => p.id === id)!;
  assert(at("ch").position.x === 8600 && at("ch").position.y === 3000, "a moved table carries the chandelier hung over it");
  assert(at("fr").position.x === 9000, "…and leaves a free one alone");
  g = dispatch(g, { type: "rotateMany", turns: [{ kind: "table", id: "t7", position: { x: 8000, y: 3000 }, rotation: 90 }] });
  assert(at("ch").position.x === 8000 && at("ch").position.y === 3600 && at("ch").rotation === 90, "a turned table turns what hangs over it round with it");
  g = dispatch(g, { type: "moveMany", moves: [{ kind: "table", id: "t7", position: { x: 1000, y: 1000 } }, { kind: "placement", id: "ch", position: { x: 1234, y: 1234 } }] });
  assert(at("ch").position.x === 1234 && at("ch").position.y === 1234, "an item dragged together with its table is placed by the drag, not carried twice");
  g = dispatch(g, { type: "setPlacementOver", id: "ch", over: null });
  assert(at("ch").over === undefined, "unlinked");
  g = dispatch(g, { type: "setPlacementOver", id: "ch", over: "t7" });
  assert(at("ch").over === "t7", "…and linked again");
  assert(apply(g.present, { type: "setPlacementOver", id: "ch", over: "t7" }) === g.present, "the same link is no edit");
  // Over other tables: a copy per target, already placed by the caller; replace takes the old down.
  g = dispatch(g, { type: "addTable", table: { id: "t8", type: "מלבן", number: 8, position: { x: 6000, y: 6000 }, rotation: 0 } });
  g = dispatch(g, { type: "hangOverTables", hangs: [{ tableId: "t8", items: [{ variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 6600, y: 6000 }, rotation: 0, scale: 1 }] }], mode: "add" });
  const over8 = () => g.present.placements.filter((p) => p.over === "t8");
  assert(over8().length === 1 && over8()[0].position.x === 6600, "a copy hangs over the target where the caller placed it");
  g = dispatch(g, { type: "hangOverTables", hangs: [{ tableId: "t8", items: [{ variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 6000, y: 6000 }, rotation: 0, scale: 1 }] }], mode: "add" });
  assert(over8().length === 1, "add does not hang a variant twice over one table");
  g = dispatch(g, { type: "hangOverTables", hangs: [{ tableId: "t8", items: [{ variantId: "pend", layer: "ceiling", quantity: 1, position: { x: 5500, y: 6000 }, rotation: 0, scale: 1 }, { variantId: "pend", layer: "ceiling", quantity: 1, position: { x: 6500, y: 6000 }, rotation: 0, scale: 1 }] }], mode: "replace" });
  assert(over8().length === 2 && over8().every((p) => p.variantId === "pend"), "replace takes down what hung there and hangs the run of two");
  assert(apply(g.present, { type: "hangOverTables", hangs: [{ tableId: "nope", items: [] }], mode: "add" }) === g.present, "no target, no edit");
  g = dispatch(g, { type: "removeTable", id: "t7" });
  assert(at("ch").over === undefined && at("ch").position.x === 1234, "a removed table leaves its chandelier hanging free where it was");
}

// ── blocks: one half removed, stray group ids, items worn and moved across a block ──────────────
{
  const T = (id: string, number: number, x: number, groupId?: string): DesignTable => ({ id, type: "rect", number, position: { x, y: 0 }, rotation: 0, widthMm: 1800, depthMm: 900, ...(groupId ? { groupId } : {}) });
  const item = (id: string, tableId: string, variantId: string): Placement => ({ id, variantId, layer: "table", quantity: 1, tableId, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
  // A block shown as 1 over members carrying 3 and 4; another table has since been renumbered 4.
  const base: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [T("a", 3, 0, "blk"), T("b", 4, 1800, "blk"), T("c", 4, 6000)],
    placements: [item("i1", "a", "candle"), item("i2", "b", "candle")],
    groups: [{ id: "blk", number: 1 }],
  };
  const one = apply(base, { type: "removeTable", id: "a" });
  const b = one.tables.find((t) => t.id === "b")!;
  assert(!b.groupId && !one.groups?.length, "half a block of two removed: the other half is a lone table");
  assert(b.number === 1, `…showing the number the block showed, not the hidden 4 table c also shows (${b.number})`);

  // A table pointing at a group that is not there loses the pointer on the next prune.
  const stray = apply({ ...base, groups: [], tables: [T("x", 7, 0, "ghost"), T("y", 8, 3000)] }, { type: "removeTable", id: "y" });
  assert(stray.tables[0].groupId === undefined, "a groupId naming no group is let go");

  // wearItems: placed as given; "replace" with nothing to wear leaves the table bare and automatic.
  const worn = apply(base, { type: "wearItems", tableId: "c", items: [{ variantId: "vase", layer: "table", quantity: 1, position: { x: 300, y: 0 }, rotation: 0, scale: 1 }], arranged: true, mode: "replace" });
  const onC = worn.placements.filter((p) => p.tableId === "c");
  assert(onC.length === 1 && onC[0].position.x === 300 && worn.tables.find((t) => t.id === "c")?.arranged === true, "worn items stand where the caller put them, the table arranged");
  const bare = apply({ ...base, tables: base.tables.map((t) => (t.id === "b" ? { ...t, arranged: true } : t)) }, { type: "wearItems", tableId: "b", items: [], mode: "replace" });
  assert(!bare.placements.some((p) => p.tableId === "b") && !bare.tables.find((t) => t.id === "b")?.arranged, "replace with nothing to wear strips the table");
  assert(apply(base, { type: "wearItems", tableId: "b", items: [], mode: "add" }) === base, "…and add with nothing is no edit");

  // arrangeOnTables: an item slid across the seam belongs to the half it is on now.
  const slid = apply(base, { type: "arrangeOnTables", positions: [{ id: "i1", tableId: "b", position: { x: -400, y: 0 } }, { id: "i2", tableId: "b", position: { x: 400, y: 0 } }] });
  assert(slid.placements.find((p) => p.id === "i1")?.tableId === "b" && slid.placements.find((p) => p.id === "i1")?.position.x === -400, "an item moves to the table it was put on");
  assert(slid.tables.find((t) => t.id === "b")?.arranged === true, "…which is arranged from then on");
  assert(apply(base, { type: "arrangeOnTables", positions: [{ id: "i1", tableId: "nope", position: { x: 0, y: 0 } }] }) === base, "no such table, no edit");
}

// A CARPET OVER A STAGE (lib/studio/cover.ts): laid when added, carried when the stage is dragged —
// in the drag's own entry — and let go with its shape kept.
{
  const stage: Placement = {
    id: "st",
    variantId: "deck",
    layer: "floor",
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    stage: { outline: [{ x: -2000, y: -1000 }, { x: 2000, y: -1000 }, { x: 2000, y: 1000 }, { x: -2000, y: 1000 }], front: 0, decks: [] },
  };
  let h = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [stage] });
  h = dispatch(h, { type: "addPlacement", placement: { id: "rug", variantId: "rug", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, cover: { stageId: "st", insetMm: 100 } } });
  const laid = h.present.placements.find((p) => p.id === "rug")!;
  assert(laid.sizeMm?.widthMm === 3800 && laid.outline?.length === 4, "a carpet laid over a 4×2 stage, 10cm in, is 3.8 wide");
  const depth = h.past.length;
  h = dispatch(h, { type: "moveMany", moves: [{ kind: "placement", id: "st", position: { x: 5000, y: 3000 } }] });
  const carried = h.present.placements.find((p) => p.id === "rug")!;
  assert(carried.position.x === 5000 && carried.position.y === 3000 && h.past.length === depth + 1, "the stage dragged carries its carpet, in the same entry");
  const still = dispatch(h, { type: "movePlacement", id: "rug", position: { x: 0, y: 0 } });
  assert(still === h, "a covered carpet does not move on its own, and the try is no history entry");
  h = dispatch(h, { type: "setPlacementCover", id: "rug", cover: null });
  const loose = h.present.placements.find((p) => p.id === "rug")!;
  assert(!loose.cover && loose.outline === carried.outline && loose.position === carried.position, "let go, it keeps the shape it was laid in");
}

console.log("actions self-check passed");
