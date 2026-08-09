"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dispatch, undo, redo, initHistory, type History } from "@/lib/design-document/actions";
import type { Layer as LayerId } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { activeEvent } from "@/lib/events/storage";
import { loadDoc, saveDoc } from "@/lib/studio/storage";
import { tableAt } from "@/lib/studio/geometry";
import { coverOn, defaultVariantId, resolve, shadesOf } from "@/lib/studio/catalog-resolver";
import { productById } from "@/lib/catalog/storage";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { CATEGORY_BY_ID, DESIGN_PASS_GROUPS, HALL_PASS_GROUPS, type CategoryGroupId } from "@/lib/catalog/categories";
import { nearestWall, WHOLE_WALL } from "@/lib/studio/anchor";
import { isTypingTarget } from "@/lib/keyboard";
import { Toolbar } from "./toolbar";
import { CatalogRail } from "./catalog-rail";
import { Inspector } from "./inspector";
// A plain import now that the canvas is the app's shared SVG one: it renders on the server like any
// other component, so there is nothing left to defer and no "loading the studio" flash to cover.
import { CanvasStage, type Selection } from "./canvas-stage";

const uid = () => crypto.randomUUID();

/** The meeting draws the same document in two passes, so the studio has two narrower faces:
 *
 *  - `hall`    — סקיצת אולם: the furniture. Table tools on, rail cut to seating / stages / bars.
 *  - `design`  — סקיצה עיצובית: the dressing. Table tools off, rail cut to the design departments.
 *  - `full`    — /studio, after the meeting: every tool, the whole catalog.
 *
 *  One document, one canvas, one autosave underneath all three — a pass is a narrower set of tools
 *  over the same drawing, never a separate drawing. */
export type StudioMode = "full" | "hall" | "design";

const RAIL: Record<StudioMode, { groups?: CategoryGroupId[]; hint?: string }> = {
  full: {},
  hall: { groups: HALL_PASS_GROUPS, hint: "גרור שולחן, כיסא, במה או בר אל התוכנית. העיצוב עצמו — בשלב הבא." },
  design: { groups: DESIGN_PASS_GROUPS, hint: "גרור פריט עיצוב. פריטי שולחן — על שולחן; רצפה ותקרה — לכל נקודה." },
};

export function StudioScreen({ mode = "full" }: { mode?: StudioMode }) {
  // Fetched once here, for the whole studio: it fills the rail below AND primes the synchronous
  // cache that the canvas's resolver and dropProduct() read during render and mid-drag.
  const { products: catalog } = useCatalog();
  // An EMPTY document, not a fabricated one. The studio used to open on a sample plan built out of
  // sample products — invented tables, invented placements — which the restore effect below then
  // replaced. With the catalog on Postgres that fiction is worse than useless: it would draw items
  // against variant ids the designer's real catalog may not contain, and for one frame it showed a
  // plan nobody drew. An event's real document is loaded below; a new one starts empty, which is
  // what beginEvent() already writes.
  const [history, setHistory] = useState<History>(() => initHistory(emptyDocument()));
  const [plan, setPlan] = useState<EventPlan>(EMPTY_PLAN);
  const [selection, setSelection] = useState<Selection>(null);
  const [layerVisible, setLayerVisible] = useState<Record<LayerId, boolean>>({ table: true, floor: true, ceiling: true });
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [addingTable, setAddingTable] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doc = history.present;

  // Restore the saved document once, on the client (keeps SSR deterministic), and resolve the
  // geometry it sits on from the active event's venue + zones — never from a stored copy.
  useEffect(() => {
    const saved = loadDoc();
    if (saved) setHistory(initHistory(saved));
    setPlan(eventPlan(activeEvent()));
  }, []);

  // Continuous autosave (F-3.5) — debounced, no save button. The indicator only
  // claims "saved" when the write actually landed; a failed write shows an error + retry.
  useEffect(() => {
    setSaveState("saving");
    const t = setTimeout(() => {
      setSaveState(saveDoc(doc) ? "saved" : "error");
    }, 500);
    return () => clearTimeout(t);
  }, [doc]);

  const retrySave = useCallback(() => {
    setSaveState(saveDoc(doc) ? "saved" : "error");
  }, [doc]);

  // Warn before leaving while a write is still pending or has failed — don't let a plan slip away unsaved.
  useEffect(() => {
    if (saveState === "saved") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  const act = useCallback((a: Parameters<typeof dispatch>[1]) => setHistory((h) => dispatch(h, a)), []);

  const showHint = (msg: string) => {
    setHint(msg);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  };

  // Where a dropped item lands depends on what it is (CategoryDef.anchor), not on where the pointer
  // happened to be: a drape goes onto the nearest wall, a cloth onto the table under it, everything
  // else stays exactly where it was let go.
  const dropProduct = (productId: string, x: number, y: number) => {
    const product = productById(productId);
    if (!product) return;
    const cat = CATEGORY_BY_ID[product.category];
    const id = uid();
    const variantId = defaultVariantId(product);
    const base = { id, variantId, layer: product.layer, quantity: 1, rotation: 0, scale: 1 };

    if (cat?.anchor === "wall") {
      const near = nearestWall(plan.structure, { x, y });
      if (!near) {
        showHint("אין קיר לתלות עליו — שרטטו את המתחם ב״אולמות״");
        return;
      }
      // Across the whole wall, which is the normal case and the one worth defaulting to; the two
      // end handles shorten it from there.
      act({
        type: "addPlacement",
        placement: { ...base, position: { x, y }, span: { wallId: near.wallId, ...WHOLE_WALL } },
      });
    } else if (product.layer === "table") {
      const t = tableAt(doc, x, y);
      if (!t) {
        showHint("שחרר פריט שולחן על גבי שולחן");
        return;
      }
      // A table wears ONE cloth: dropping a second onto a dressed table recolours the one that is
      // already there rather than stacking. Not a remove+add — that would record the removal as a
      // deliberate divergence and make the next "on all tables" skip this table (F-5.3).
      const worn = cat?.anchor === "table" ? coverOn(doc, t.id) : undefined;
      if (worn) {
        act({ type: "setPlacementVariant", id: worn.id, variantId });
        setSelection({ kind: "table", id: t.id });
        return;
      }
      act({ type: "addPlacement", placement: { ...base, tableId: t.id, position: { x: 0, y: 0 } } });
    } else {
      act({ type: "addPlacement", placement: { ...base, position: { x, y } } });
    }
    setSelection({ kind: "placement", id });
  };

  const changeQuantity = (id: string, delta: number) => {
    const p = doc.placements.find((x) => x.id === id);
    if (!p) return;
    act({ type: "setPlacementQuantity", id, quantity: Math.max(1, p.quantity + delta) });
  };

  const deleteSelection = useCallback(() => {
    setSelection((sel) => {
      if (sel?.kind === "placement") setHistory((h) => dispatch(h, { type: "removePlacement", id: sel.id }));
      else if (sel?.kind === "table") setHistory((h) => dispatch(h, { type: "removeTable", id: sel.id }));
      return null;
    });
  }, []);

  // F-3.3: fast manual table placement. Auto-running numbering, editable per table.
  const nextNumber = () => doc.tables.reduce((m, t) => Math.max(m, t.number), 0) + 1;

  const placeTable = (x: number, y: number) => {
    if (!addingTable) return;
    const dims =
      addingTable === "עגול"
        ? { diameterMm: 1800, seats: 12 }
        : addingTable === "מלבן"
          ? { widthMm: 3000, depthMm: 1000, seats: 6 }
          : { widthMm: 4800, depthMm: 1200, seats: 16 }; // אביר — long banquet table
    act({ type: "addTable", table: { id: uid(), type: addingTable, number: nextNumber(), position: { x, y }, rotation: 0, ...dims } });
  };

  const duplicateTable = (id: string) => {
    const t = doc.tables.find((x) => x.id === id);
    if (!t) return;
    const copyId = uid();
    act({
      type: "addTable",
      table: { ...t, id: copyId, number: nextNumber(), position: { x: t.position.x + 2200, y: t.position.y + 2200 } },
    });
    setSelection({ kind: "table", id: copyId });
  };

  const smartApply = () => {
    if (selection?.kind !== "placement") return;
    const p = doc.placements.find((x) => x.id === selection.id);
    const table = p?.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    if (!p || !table) return;
    act({
      type: "applyToTableType",
      tableType: table.type,
      placement: { variantId: p.variantId, layer: "table", quantity: p.quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    });
    showHint(`הוחל על כל שולחנות ${table.type}`);
  };

  // "על כל השולחנות" — the whole room in one cloth, whatever each table's type. `replaces` carries
  // the product's other shades, so tables already dressed in gold are recoloured rather than given
  // a second cloth: a table wears one.
  const spreadCloth = (placementId: string) => {
    const p = doc.placements.find((x) => x.id === placementId);
    if (!p) return;
    act({
      type: "applyToAllTables",
      placement: { variantId: p.variantId, layer: "table", quantity: p.quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      replaces: shadesOf(p.variantId).map((s) => s.id),
    });
    showHint(`${resolve(p.variantId)?.product.name ?? "המפה"} הוחלה על כל השולחנות`);
  };

  // Keyboard: undo/redo + delete (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setHistory((h) => redo(h));
      } else if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteSelection();
      } else if (!typing && e.key === "Escape") {
        setAddingTable(null);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => setHistory(undo)}
        onRedo={() => setHistory(redo)}
        layerVisible={layerVisible}
        onToggleLayer={(l) => setLayerVisible((v) => ({ ...v, [l]: !v[l] }))}
        addingTable={addingTable}
        onSetAddingTable={setAddingTable}
        showTableTools={mode !== "design"}
        saveState={saveState}
        onRetrySave={retrySave}
      />
      <div className="flex min-h-0 flex-1">
        <CatalogRail products={catalog} groups={RAIL[mode].groups} hint={RAIL[mode].hint} />
        <div className="relative min-w-0 flex-1">
          <CanvasStage
            doc={doc}
            plan={plan}
            selection={selection}
            layerVisible={layerVisible}
            addingTable={addingTable}
            onSelect={setSelection}
            onMoveTable={(id, pos) => act({ type: "moveTable", id, position: pos })}
            onMovePlacement={(id, pos) => act({ type: "movePlacement", id, position: pos })}
            onResizePlacement={(id, sizeMm, position) => {
              act({ type: "resizePlacement", id, sizeMm });
              act({ type: "movePlacement", id, position });
            }}
            onSpanPlacement={(id, span) => act({ type: "setPlacementSpan", id, span })}
            onDropProduct={dropProduct}
            onPlaceTable={placeTable}
          />
          <div className="pointer-events-none absolute inset-inline-end-4 bottom-4">
            <div className="pointer-events-auto">
              <Inspector
                selection={selection}
                doc={doc}
                structure={plan.structure}
                onClose={() => setSelection(null)}
                onQuantity={changeQuantity}
                onDelete={deleteSelection}
                onSmartApply={smartApply}
                onApplyToAllTables={spreadCloth}
                onVariant={(id, variantId) => act({ type: "setPlacementVariant", id, variantId })}
                onSpan={(id, span) => act({ type: "setPlacementSpan", id, span })}
                onResize={(id, sizeMm) => act({ type: "resizePlacement", id, sizeMm })}
                onRenumber={(id, number) => act({ type: "renumberTable", id, number })}
                onStyleTable={(id, style) => act({ type: "styleTable", id, style })}
                onDuplicateTable={duplicateTable}
                onRemovePlacement={(id) => act({ type: "removePlacement", id })}
              />
            </div>
          </div>
          {/* Stable live region so the drop hint / smart-apply confirmation is announced, not just shown. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center"
            aria-live="polite"
          >
            {hint && (
              <span className="rounded-md bg-ink px-3 py-1.5 text-sm text-canvas shadow-dialog">{hint}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
