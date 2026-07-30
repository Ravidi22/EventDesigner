"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { dispatch, undo, redo, initHistory, type History } from "@/lib/design-document/actions";
import type { Layer as LayerId } from "@/lib/design-document/types";
import { sampleDoc } from "@/lib/studio/sample-doc";
import { SAMPLE_HALL, type Hall } from "@/lib/studio/hall";
import { loadDoc, saveDoc, loadHall } from "@/lib/studio/storage";
import { tableAt } from "@/lib/studio/geometry";
import { defaultVariantId } from "@/lib/studio/catalog-resolver";
import { productById } from "@/lib/catalog/storage";
import { isTypingTarget } from "@/lib/keyboard";
import { Toolbar } from "./toolbar";
import { CatalogRail } from "./catalog-rail";
import { Inspector } from "./inspector";
import type { Selection } from "./canvas-stage";

const CanvasStage = dynamic(() => import("./canvas-stage").then((m) => m.CanvasStage), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">טוען את הסטודיו…</div>,
});

const uid = () => crypto.randomUUID();

export function StudioScreen() {
  const [history, setHistory] = useState<History>(() => initHistory(sampleDoc()));
  const [hall, setHall] = useState<Hall>(SAMPLE_HALL);
  const [selection, setSelection] = useState<Selection>(null);
  const [layerVisible, setLayerVisible] = useState<Record<LayerId, boolean>>({ table: true, floor: true, ceiling: true });
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [addingTable, setAddingTable] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doc = history.present;

  // Restore the saved document + hall once, on the client (keeps SSR deterministic). The hall
  // is written by the setup flow (F-1.6) when an event is opened.
  useEffect(() => {
    const saved = loadDoc();
    if (saved) setHistory(initHistory(saved));
    const savedHall = loadHall();
    if (savedHall) setHall(savedHall);
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

  const dropProduct = (productId: string, x: number, y: number) => {
    const product = productById(productId);
    if (!product) return;
    const id = uid();
    const base = { id, variantId: defaultVariantId(product), layer: product.layer, quantity: 1, rotation: 0, scale: 1 };
    if (product.layer === "table") {
      const t = tableAt(doc, x, y);
      if (!t) {
        showHint("שחרר פריט שולחן על גבי שולחן");
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
        saveState={saveState}
        onRetrySave={retrySave}
      />
      <div className="flex min-h-0 flex-1">
        <CatalogRail />
        <div className="relative min-w-0 flex-1">
          <CanvasStage
            doc={doc}
            hall={hall}
            selection={selection}
            layerVisible={layerVisible}
            addingTable={addingTable}
            onSelect={setSelection}
            onMoveTable={(id, pos) => act({ type: "moveTable", id, position: pos })}
            onMovePlacement={(id, pos) => act({ type: "movePlacement", id, position: pos })}
            onDropProduct={dropProduct}
            onPlaceTable={placeTable}
          />
          <div className="pointer-events-none absolute inset-inline-end-4 bottom-4">
            <div className="pointer-events-auto">
              <Inspector
                selection={selection}
                doc={doc}
                onClose={() => setSelection(null)}
                onQuantity={changeQuantity}
                onDelete={deleteSelection}
                onSmartApply={smartApply}
                onRenumber={(id, number) => act({ type: "renumberTable", id, number })}
                onStyleTable={(id, style) => act({ type: "styleTable", id, style })}
                onDuplicateTable={duplicateTable}
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
