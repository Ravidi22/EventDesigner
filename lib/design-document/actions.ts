// ADR-4: the ONE actions layer. No renderer mutates the document directly — every
// change is an action applied here. That constraint is what makes undo/redo nearly free.
import type { DesignDocumentContent, Placement, DesignTable, WallSpan } from "./types";
import type { ElementStyle } from "../element-style";
import { isMain } from "../self-check";

export type Action =
  | { type: "addTable"; table: DesignTable }
  | { type: "moveTable"; id: string; position: DesignTable["position"] }
  | { type: "removeTable"; id: string }
  | { type: "renumberTable"; id: string; number: number }
  | { type: "styleTable"; id: string; style: ElementStyle | undefined }
  | { type: "addPlacement"; placement: Placement }
  | { type: "movePlacement"; id: string; position: Placement["position"] }
  | { type: "setPlacementQuantity"; id: string; quantity: number }
  // Switching a placed item to another shade of the same product (F-4.2). Not a remove+add: the
  // item keeps its id, its place on the plan and the size it was stretched to — only its colour
  // changes, which is exactly what the designer is doing when the client says "in cream instead".
  | { type: "setPlacementVariant"; id: string; variantId: string }
  // A drape's run along its wall, or a moved/relaid one.
  | { type: "setPlacementSpan"; id: string; span: WallSpan }
  // A stretch item resized on the plan (a carpet's corners).
  | { type: "resizePlacement"; id: string; sizeMm: { widthMm: number; depthMm: number } }
  | { type: "removePlacement"; id: string }
  // F-3.3 smart-apply: copy a placement onto every table of a given type, or onto every table on
  // the plan regardless of type ("על כל השולחנות" — a cloth the whole room shares).
  | { type: "applyToTableType"; tableType: string; placement: Omit<Placement, "id" | "tableId">; replaces?: string[] }
  | { type: "applyToAllTables"; placement: Omit<Placement, "id" | "tableId">; replaces?: string[] };

export function apply(doc: DesignDocumentContent, action: Action): DesignDocumentContent {
  switch (action.type) {
    case "addTable":
      return { ...doc, tables: [...doc.tables, action.table] };
    case "moveTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, position: action.position } : t)),
      };
    case "renumberTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, number: action.number } : t)),
      };
    case "styleTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, style: action.style } : t)),
      };
    case "removeTable":
      return {
        ...doc,
        tables: doc.tables.filter((t) => t.id !== action.id),
        placements: doc.placements.filter((p) => p.tableId !== action.id),
      };
    case "addPlacement": {
      // Manually placing a variant back on a table clears its smart-apply exception (F-5.3).
      const p = action.placement;
      const exceptions =
        p.tableId && doc.exceptions?.some((e) => e.tableId === p.tableId && e.variantId === p.variantId)
          ? doc.exceptions.filter((e) => !(e.tableId === p.tableId && e.variantId === p.variantId))
          : doc.exceptions;
      return { ...doc, placements: [...doc.placements, p], exceptions };
    }
    case "movePlacement":
      return {
        ...doc,
        placements: doc.placements.map((p) =>
          p.id === action.id ? { ...p, position: action.position } : p,
        ),
      };
    case "setPlacementQuantity":
      return {
        ...doc,
        placements: doc.placements.map((p) =>
          p.id === action.id ? { ...p, quantity: action.quantity } : p,
        ),
      };
    case "setPlacementVariant":
      return {
        ...doc,
        placements: doc.placements.map((p) =>
          p.id === action.id ? { ...p, variantId: action.variantId } : p,
        ),
      };
    case "setPlacementSpan":
      return {
        ...doc,
        placements: doc.placements.map((p) => (p.id === action.id ? { ...p, span: action.span } : p)),
      };
    case "resizePlacement":
      return {
        ...doc,
        placements: doc.placements.map((p) => (p.id === action.id ? { ...p, sizeMm: action.sizeMm } : p)),
      };
    case "removePlacement": {
      // Removing a table-layer placement records an exception, so a later bulk re-apply
      // of the same variant respects the designer's deliberate divergence (F-5.3).
      const removed = doc.placements.find((p) => p.id === action.id);
      const exceptions =
        removed?.tableId &&
        !doc.exceptions?.some((e) => e.tableId === removed.tableId && e.variantId === removed.variantId)
          ? [...(doc.exceptions ?? []), { tableId: removed.tableId, variantId: removed.variantId }]
          : doc.exceptions;
      return { ...doc, placements: doc.placements.filter((p) => p.id !== action.id), exceptions };
    }
    case "applyToTableType":
      return spreadOverTables(
        doc,
        doc.tables.filter((t) => t.type === action.tableType),
        action.placement,
        action.replaces,
      );
    case "applyToAllTables":
      return spreadOverTables(doc, doc.tables, action.placement, action.replaces);
  }
}

/** The body of both smart-applies (F-3.3): put this item on each of these tables.
 *
 *  Idempotent — a table that already carries this variant is left alone, so re-applying (or
 *  applying from a table that already has it) never stacks duplicates. Tables with a recorded
 *  exception for this variant are skipped (F-5.3).
 *
 *  `replaces` is for the covers: a table has ONE cloth, so spreading cream over a room where three
 *  tables wear gold must swap those three, not give them two cloths each. The caller passes the
 *  product's other variant ids — it is the one holding the catalog; this layer stays pure. The swap
 *  is a straight substitution rather than remove+add, so it never records the removal as a
 *  deliberate divergence the next apply would then have to honour. */
function spreadOverTables(
  doc: DesignDocumentContent,
  tables: DesignTable[],
  placement: Omit<Placement, "id" | "tableId">,
  replaces?: string[],
): DesignDocumentContent {
  const swap = new Set(replaces ?? []);
  const targets = new Set(tables.map((t) => t.id));
  const added: Placement[] = [];
  const covered = new Set<string>(); // tables whose existing item was recoloured in place

  const placements = doc.placements.map((p) => {
    if (!p.tableId || !targets.has(p.tableId) || p.layer !== "table") return p;
    if (!swap.has(p.variantId) || p.variantId === placement.variantId) return p;
    covered.add(p.tableId);
    return { ...p, variantId: placement.variantId };
  });

  for (const t of tables) {
    if (covered.has(t.id)) continue;
    const has = placements.some(
      (p) => p.layer === "table" && p.tableId === t.id && p.variantId === placement.variantId,
    );
    const excepted = doc.exceptions?.some((e) => e.tableId === t.id && e.variantId === placement.variantId);
    if (!has && !excepted) added.push({ ...placement, id: crypto.randomUUID(), tableId: t.id });
  }

  if (added.length === 0 && covered.size === 0) return doc;
  return { ...doc, placements: [...placements, ...added] };
}

// Undo/redo history — the payoff of routing every edit through apply().
export interface History {
  present: DesignDocumentContent;
  past: DesignDocumentContent[];
  future: DesignDocumentContent[];
}

export function initHistory(doc: DesignDocumentContent): History {
  return { present: doc, past: [], future: [] };
}

export function dispatch(h: History, action: Action): History {
  const next = apply(h.present, action);
  if (next === h.present) return h;
  return { present: next, past: [...h.past, h.present], future: [] };
}

export function undo(h: History): History {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { present: previous, past: h.past.slice(0, -1), future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { present: next, past: [...h.past, h.present], future: rest };
}

// ponytail: self-check for the reducer + history. Run: node --experimental-strip-types lib/design-document/actions.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  let h = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
  h = dispatch(h, { type: "addTable", table: { id: "t1", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 } });
  h = dispatch(h, { type: "addTable", table: { id: "t2", type: "round", number: 2, position: { x: 5, y: 0 }, rotation: 0 } });
  const applyV1 = {
    type: "applyToTableType" as const,
    tableType: "round",
    placement: { variantId: "v1", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
  };
  h = dispatch(h, applyV1);
  assert(h.present.placements.length === 2, "apply-to-type places on each round table");
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
  h = dispatch(h, { type: "resizePlacement", id: "drape", sizeMm: { widthMm: 3000, depthMm: 2000 } });
  assert(h.present.placements.find((p) => p.id === "drape")?.sizeMm?.widthMm === 3000, "resizePlacement records the drawn size");

  // "על כל השולחנות" — every table, whatever its type.
  let g = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
  g = dispatch(g, { type: "addTable", table: { id: "r1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 } });
  g = dispatch(g, { type: "addTable", table: { id: "k1", type: "אביר", number: 2, position: { x: 0, y: 0 }, rotation: 0 } });
  const cloth = { variantId: "gold", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };
  g = dispatch(g, { type: "applyToTableType", tableType: "עגול", placement: cloth });
  assert(g.present.placements.length === 1, "per-type apply reaches only the round table");
  g = dispatch(g, { type: "applyToAllTables", placement: cloth });
  assert(g.present.placements.length === 2, "apply-to-all reaches the knight table too, without duplicating the round one");

  // A cover is one per table: spreading cream over a room wearing gold swaps, never stacks.
  g = dispatch(g, { type: "applyToAllTables", placement: { ...cloth, variantId: "cream" }, replaces: ["gold", "cream"] });
  assert(g.present.placements.length === 2, "recolouring every table adds no second cloth");
  assert(g.present.placements.every((p) => p.variantId === "cream"), "…and every table now wears cream");
  assert((g.present.exceptions?.length ?? 0) === 0, "a swap is not a removal, so it records no exception");

  console.log("actions self-check passed");
}
