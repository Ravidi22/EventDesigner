"use client";

import { Undo2, Redo2, Check, Loader2, Eye, EyeOff, TriangleAlert, Circle, RectangleHorizontal, Rows3 } from "lucide-react";
import type { Layer as LayerId } from "@/lib/design-document/types";
import { LAYERS } from "@/lib/catalog/categories";
import { IconButton } from "@/components/icon-button";

// F-3.3 click-to-place table types. The Hebrew type strings are the document vocabulary
// (drives smart-apply grouping and the placement-map legend).
export const TABLE_TYPES = [
  { type: "עגול", label: "שולחן עגול", icon: Circle },
  { type: "מלבן", label: "שולחן מלבן", icon: RectangleHorizontal },
  { type: "אביר", label: "שולחן אביר", icon: Rows3 },
] as const;

// Slim studio sub-toolbar — sits under the app-shell topbar (which carries the title + event
// context). Tools only: undo/redo, table placement, layer visibility, and the honest save indicator.
export function Toolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  layerVisible,
  onToggleLayer,
  addingTable,
  onSetAddingTable,
  saveState,
  onRetrySave,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  layerVisible: Record<LayerId, boolean>;
  onToggleLayer: (l: LayerId) => void;
  addingTable: string | null;
  onSetAddingTable: (t: string | null) => void;
  saveState: "saving" | "saved" | "error";
  onRetrySave: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <div className="flex items-center gap-0.5">
        <IconButton label="בטל" size="md" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" strokeWidth={2} />
        </IconButton>
        <IconButton label="בצע שוב" size="md" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      {/* F-3.3: pick a type, then click the canvas to place. Esc or re-click exits. */}
      <div className="flex items-center gap-1">
        {TABLE_TYPES.map((t) => {
          const on = addingTable === t.type;
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => onSetAddingTable(on ? null : t.type)}
              aria-pressed={on}
              title={`הנחת ${t.label} בקליק`}
              className={
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors " +
                (on ? "border-accent bg-accent-tint text-ink" : "border-transparent text-muted hover:bg-canvas hover:text-ink")
              }
            >
              <t.icon className="h-3.5 w-3.5" strokeWidth={2} />
              {t.type}
            </button>
          );
        })}
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        {LAYERS.map((l) => {
          const on = layerVisible[l.id];
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onToggleLayer(l.id)}
              aria-pressed={on}
              className={
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors " +
                (on ? "border-border bg-canvas text-ink" : "border-transparent text-muted hover:bg-canvas")
              }
            >
              {on ? <Eye className="h-3.5 w-3.5" strokeWidth={2} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />}
              {l.label}
            </button>
          );
        })}
      </div>

      <div className="ms-auto flex items-center gap-1.5 text-xs" aria-live="polite">
        {saveState === "saving" ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            שומר…
          </span>
        ) : saveState === "error" ? (
          <button
            type="button"
            onClick={onRetrySave}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-warn-ink transition-colors hover:bg-warn-tint"
          >
            <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
            לא נשמר · נסה שוב
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
            נשמר
          </span>
        )}
      </div>
    </header>
  );
}
