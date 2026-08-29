"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Check, Loader2, Eye, EyeOff, TriangleAlert, ScanEye, ListOrdered } from "lucide-react";
import type { Layer as LayerId } from "@/lib/design-document/types";
import type { NumberingCorner, NumberingOptions } from "@/lib/design-document/groups";
import { LAYERS } from "@/lib/catalog/categories";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";

// Slim studio sub-toolbar — sits under the app-shell topbar (which carries the title + event
// context). Tools only: undo/redo, which zone to work in, layer visibility, and the honest save
// indicator.
//
// THERE ARE NO TABLE BUTTONS HERE ANY MORE. "עגול / מלבן / אביר" were three hard-coded sizes that
// belonged to nobody's catalog — a 1.80m round table placed by that button referenced no product,
// so it could not be priced, could not be ordered, and did not appear on the packing list the crew
// loads the lorry from. Tables come off the rail now, like every other thing in the room: the base
// library ships the seven every hall owns (lib/catalog/standard/items.ts), each studio owns its own
// copy at its own price, and dropping one still makes a numbered DesignTable that wears a cloth.
export function Toolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  layerVisible,
  onToggleLayer,
  zones,
  focusZoneId,
  onFocusZone,
  canRenumber,
  onRenumber,
  numbering,
  onNumbering,
  renumberCount,
  saveState,
  onRetrySave,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  layerVisible: Record<LayerId, boolean>;
  onToggleLayer: (l: LayerId) => void;
  /** The zones worth being taken to — the event's own, or the whole property's when it has none. */
  zones: { id: string; name: string }[];
  focusZoneId: string | null;
  onFocusZone: (id: string | null) => void;
  /** False when the numbering is already 1, 2, 3… in reading order — the button says so by being
   *  disabled rather than by doing nothing when pressed. */
  canRenumber: boolean;
  onRenumber: () => void;
  /** Where the sequence starts and which way it runs. Held by the screen, edited here. */
  numbering: NumberingOptions;
  onNumbering: (n: NumberingOptions) => void;
  /** How many units the current settings would actually change — so the panel can say what pressing
   *  the button will do before it is pressed, and say "nothing" without pretending otherwise. */
  renumberCount: number;
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

      {/* Numbering drifts across an evening of deleting, pasting and grouping; this puts it back in
          order. One history entry, so it is one Ctrl+Z.
          A PANEL rather than a bare button now: which corner the sequence starts from is a real
          question with four real answers, and the room where it matters is exactly the room where
          the default is wrong — the one whose entrance is at the far end. */}
      <NumberingMenu
        options={numbering}
        onChange={onNumbering}
        onRenumber={onRenumber}
        count={renumberCount}
        canRenumber={canRenumber}
      />

      {/* Which part of the property to work in. It FRAMES rather than filters: the rest of the plan
          stays drawn and stays reachable, held back so the חופה reads as the thing being designed
          while the hall it opens onto is still visible behind it. A property with one zone has
          nothing to choose between, so the control isn't drawn at all. */}
      {zones.length > 1 && (
        <>
          <div className="mx-1 h-6 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <ScanEye className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
            <Select
              value={focusZoneId ?? ""}
              onChange={(v) => onFocusZone(v || null)}
              aria-label="התמקדות באזור"
              options={[
                { value: "", label: "כל המתחם" },
                ...zones.map((z) => ({ value: z.id, label: z.name || "אזור ללא שם" })),
              ]}
              className="min-w-40"
            />
          </div>
        </>
      )}

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

/** The renumber button and the four questions behind it: from which corner, along rows or down
 *  columns, starting at what number, and whether alternate rows double back.
 *
 *  A panel rather than four toolbar controls, because none of it is touched on most plans — the
 *  default is right for most rooms — and a toolbar that permanently carries four numbering controls
 *  is a toolbar about numbering. It opens on the button that does the work, and the button is still
 *  the only thing that has to be pressed.
 */
function NumberingMenu({
  options,
  onChange,
  onRenumber,
  count,
  canRenumber,
}: {
  options: NumberingOptions;
  onChange: (n: NumberingOptions) => void;
  onRenumber: () => void;
  count: number;
  canRenumber: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Closes on an outside click or Escape, like every other panel in the app.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const set = (patch: NumberingOptions) => onChange({ ...options, ...patch });

  return (
    <div className="relative" ref={box}>
      <IconButton
        label="מספור מחדש — ומאיפה להתחיל"
        size="md"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={open ? "text-accent" : undefined}
      >
        <ListOrdered className="h-4 w-4" strokeWidth={2} />
      </IconButton>

      {open && (
        <div
          role="dialog"
          aria-label="מספור שולחנות"
          className="absolute top-full z-40 mt-1.5 w-72 rounded-md border border-border bg-surface p-3 shadow-lifted"
          style={{ insetInlineStart: 0 }}
        >
          <p className="mb-2 text-xs leading-relaxed text-muted">
            הצוות מוצא שולחן לפי המספר שלו. כאן נקבע מאיפה הספירה מתחילה ולאיזה כיוון היא רצה.
          </p>

          {/* The corner, drawn AS a corner. Four radio buttons in a 2×2 grid is the same shape as
              the room they describe, so "start from the bottom-left" is pointed at rather than
              read. The grid is laid out in physical order (dir="ltr") on purpose: these are
              positions on a plan, not words in a sentence, and mirroring them under RTL would put
              "top-left" on the right. */}
          <span className="mb-1.5 block text-xs font-medium text-ink-soft">שולחן 1 מתחיל מ־</span>
          <div className="grid grid-cols-2 gap-1" dir="ltr">
            {(
              [
                ["top-left", "↖"],
                ["top-right", "↗"],
                ["bottom-left", "↙"],
                ["bottom-right", "↘"],
              ] as [NumberingCorner, string][]
            ).map(([corner, glyph]) => {
              const on = (options.corner ?? "top-right") === corner;
              return (
                <button
                  key={corner}
                  type="button"
                  onClick={() => set({ corner })}
                  aria-pressed={on}
                  aria-label={CORNER_LABEL[corner]}
                  title={CORNER_LABEL[corner]}
                  className={
                    "flex items-center justify-center rounded-sm border py-1.5 text-base transition-colors " +
                    (on ? "border-accent bg-accent-tint text-accent" : "border-border text-muted hover:bg-bg")
                  }
                >
                  {glyph}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-soft">כיוון</span>
            <Select
              value={options.axis ?? "rows"}
              onChange={(v) => set({ axis: v as "rows" | "columns" })}
              aria-label="כיוון המספור"
              options={[
                { value: "rows", label: "לפי שורות" },
                { value: "columns", label: "לפי טורים" },
              ]}
              className="min-w-32"
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <label htmlFor="numbering-start" className="text-xs font-medium text-ink-soft">
              מתחיל במספר
            </label>
            <NumberField
              id="numbering-start"
              decimals={0}
              min={1}
              value={options.start ?? 1}
              onChange={(v) => set({ start: v })}
              className="w-16"
            />
          </div>

          {/* Boustrophedon. Named for what it does to the walk, not for what it does to the maths —
              nobody laying place cards thinks "serpentine". */}
          <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
            <input
              type="checkbox"
              checked={options.serpentine ?? false}
              onChange={(e) => set({ serpentine: e.target.checked })}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span>
              שורה הלוך ושורה חזור
              <span className="block text-muted">כמו שמסתובבים באולם — בלי לחצות את הרצפה בתחילת כל שורה.</span>
            </span>
          </label>

          <Button
            variant="primary"
            className="mt-3 w-full"
            disabled={!canRenumber}
            onClick={() => {
              onRenumber();
              setOpen(false);
            }}
          >
            {canRenumber ? `מספור מחדש · ${count} שולחנות` : "המספור כבר לפי הסדר"}
          </Button>
        </div>
      )}
    </div>
  );
}

const CORNER_LABEL: Record<NumberingCorner, string> = {
  "top-right": "מלמעלה מימין",
  "top-left": "מלמעלה משמאל",
  "bottom-right": "מלמטה מימין",
  "bottom-left": "מלמטה משמאל",
};
