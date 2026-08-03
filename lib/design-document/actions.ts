// ADR-4: the ONE actions layer. No renderer mutates the document directly — every
// change is an action applied here. That constraint is what makes undo/redo nearly free.
import type { DesignDocumentContent, Placement, DesignTable } from "./types";
import type { ElementStyle } from "../element-style";

export type Action =
  | { type: "addTable"; table: DesignTable }
  | { type: "moveTable"; id: string; position: DesignTable["position"] }
  | { type: "removeTable"; id: string }
  | { type: "renumberTable"; id: string; number: number }
  | { type: "styleTable"; id: string; style: ElementStyle | undefined }
  | { type: "addPlacement"; placement: Placement }
  | { type: "movePlacement"; id: string; position: Placement["position"] }
  | { type: "setPlacementQuantity"; id: string; quantity: number }
  | { type: "removePlacement"; id: string }
  // F-3.3 smart-apply: copy a placement onto every table of a given type.
  | { type: "applyToTableType"; tableType: string; placement: Omit<Placement, "id" | "tableId"> };

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
    case "applyToTableType": {
      // Idempotent: only add to tables of this type that don't already carry this variant,
      // so re-applying (or applying from a table that already has it) never stacks duplicates.
      // Tables with a recorded exception for this variant are skipped (F-5.3).
      const added: Placement[] = [];
      for (const t of doc.tables) {
        if (t.type !== action.tableType) continue;
        const has = doc.placements.some(
          (p) => p.layer === "table" && p.tableId === t.id && p.variantId === action.placement.variantId,
        );
        const excepted = doc.exceptions?.some(
          (e) => e.tableId === t.id && e.variantId === action.placement.variantId,
        );
        if (!has && !excepted) added.push({ ...action.placement, id: crypto.randomUUID(), tableId: t.id });
      }
      return added.length ? { ...doc, placements: [...doc.placements, ...added] } : doc;
    }
  }
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
if ((import.meta as { main?: boolean }).main) {
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
  console.log("actions self-check passed");
}
