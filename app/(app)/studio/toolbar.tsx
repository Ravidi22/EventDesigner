"use client";

import { useState } from "react";
import { Undo2, Redo2, Copy, Scissors, ClipboardPaste, Check, Loader2, Eye, EyeOff, TriangleAlert, ScanEye, ListOrdered, LayoutTemplate, Trash2, ArchiveRestore, Box } from "lucide-react";
import type { NumberingCorner, NumberingOptions } from "@/lib/design-document/groups";
import { PLANES, type Plane } from "@/lib/studio/planes";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Popover } from "@/components/popover";
import { BarButton, Note } from "@/components/inspector-bar";
import { SwitchRow } from "@/components/toggle";
import { fieldLabelClassName } from "@/components/control";
import type { SketchTemplateSummary } from "@/lib/studio/sketches";

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
  canCopy,
  onCopy,
  onCut,
  canPaste,
  onPaste,
  layerVisible,
  onToggleLayer,
  activeLayer,
  onActivateLayer,
  zones,
  focusZoneId,
  onFocusZone,
  canRenumber,
  onRenumber,
  numbering,
  onNumbering,
  renumberCount,
  sketches,
  sketchEmpty,
  onSaveSketch,
  onLoadSketch,
  onDeleteSketch,
  saveState,
  onRetrySave,
  removedFeatures = [],
  onRestoreFeatures,
  sceneOn = false,
  onToggleScene,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Something is selected, so there is something to copy or cut. */
  canCopy: boolean;
  onCopy: () => void;
  onCut: () => void;
  /** The clip is not empty — a paste would put something down. */
  canPaste: boolean;
  onPaste: () => void;
  layerVisible: Record<Plane, boolean>;
  onToggleLayer: (l: Plane) => void;
  /** The plane being worked in, or null for "all of them". */
  activeLayer: Plane | null;
  onActivateLayer: (l: Plane) => void;
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
  /** The studio's saved sketches, and what can be done with them from here (studio-screen). */
  sketches: SketchTemplateSummary[];
  /** Nothing drawn yet — nothing to save, and loading needs no confirmation. */
  sketchEmpty: boolean;
  onSaveSketch: (name: string) => void;
  onLoadSketch: (id: string, mode: "replace" | "add") => void;
  onDeleteSketch: (id: string) => void;
  saveState: "saving" | "saved" | "error";
  onRetrySave: () => void;
  /** The venue's own features this event took out of its room (FeaturePlacement.removed), and how
   *  to bring them back. Empty = no control at all. */
  removedFeatures?: { id: string; label: string }[];
  onRestoreFeatures?: (featureIds: string[]) => void;
  /** The 3D pane beside the sketch (./scene-preview.tsx): whether it is up, and the toggle. No
   *  toggle = no button. */
  sceneOn?: boolean;
  onToggleScene?: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <div className="flex items-center gap-0.5">
        <IconButton label="בטל · Ctrl+Z" size="md" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" strokeWidth={2} />
        </IconButton>
        <IconButton label="בצע שוב · Ctrl+Shift+Z" size="md" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      {/* The clipboard, with a face. Ctrl+C/X/V worked from the first day and nothing on screen said
          so — and a paste in particular has NOWHERE else to live: it happens with nothing selected,
          so it cannot be a button in the inspector next to קיבוץ and הסרה. All three sit here beside
          undo/redo because they are the same kind of thing: what just happened to the document,
          rather than what is true of the selection. Disabled says why: nothing selected, empty clip. */}
      <div className="flex items-center gap-0.5">
        <IconButton label="העתקה · Ctrl+C" size="md" onClick={onCopy} disabled={!canCopy}>
          <Copy className="h-4 w-4" strokeWidth={2} />
        </IconButton>
        <IconButton label="גזירה · Ctrl+X" size="md" onClick={onCut} disabled={!canCopy}>
          <Scissors className="h-4 w-4" strokeWidth={2} />
        </IconButton>
        <IconButton label="הדבקה · Ctrl+V" size="md" onClick={onPaste} disabled={!canPaste}>
          <ClipboardPaste className="h-4 w-4" strokeWidth={2} />
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

      {/* Saved sketches: the whole drawing kept under a name, to start the next event from or to
          load into this one. Beside the numbering panel because it is the same kind of thing — a
          question about the document as a whole, not about what is selected in it. */}
      <SketchMenu sketches={sketches} sketchEmpty={sketchEmpty} onSave={onSaveSketch} onLoad={onLoadSketch} onDelete={onDeleteSketch} />

      {/* What this event wheeled out of the venue's room — only while there is something to bring
          back. Taken out from the canvas (Delete, or the feature's bar); the venue never lost it. */}
      {removedFeatures.length > 0 && onRestoreFeatures && <RemovedFeaturesMenu features={removedFeatures} onRestore={onRestoreFeatures} />}

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
        {PLANES.map((l) => {
          const on = layerVisible[l.id];
          const active = activeLayer === l.id;
          return (
            <div
              key={l.id}
              className={
                "inline-flex items-center gap-1 rounded-md border ps-1 pe-2 py-1 text-xs transition-colors " +
                (active
                  ? "border-accent bg-accent-tint text-accent"
                  : on
                    ? "border-border bg-canvas text-ink"
                    : "border-transparent text-muted")
              }
            >
              {/* The eye is visibility. It is deliberately NOT the same press as choosing a layer to
                  work in: hiding the ceiling and working on the ceiling are different questions, and
                  one control that did both would make each of them unreachable half the time. */}
              <button
                type="button"
                onClick={() => onToggleLayer(l.id)}
                aria-pressed={on}
                aria-label={on ? `הסתרת שכבת ${l.label}` : `הצגת שכבת ${l.label}`}
                title={on ? `הסתרת שכבת ${l.label}` : `הצגת שכבת ${l.label}`}
                className="rounded-sm p-0.5 transition-colors hover:bg-bg"
              >
                {on ? <Eye className="h-3.5 w-3.5" strokeWidth={2} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />}
              </button>
              <button
                type="button"
                onClick={() => onActivateLayer(l.id)}
                aria-pressed={active}
                title={active ? "חזרה לכל השכבות" : `עבודה בשכבת ${l.label} בלבד`}
                className="font-medium"
              >
                {l.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* The room in 3D beside the sketch — the תלת-ממד tab's picture, live, following what is
          selected (./scene-preview.tsx). A toggle, so it wears the pressed field while the pane is
          up, like the tape measure on the canvas's own strip. */}
      {onToggleScene && (
        <>
          <div className="mx-1 h-6 w-px bg-border" />
          <IconButton label={sceneOn ? "סגירת התלת-ממד שלצד הסקיצה" : "תלת-ממד לצד הסקיצה"} size="md" onClick={onToggleScene} pressed={sceneOn}>
            <Box className="h-4 w-4" strokeWidth={2} />
          </IconButton>
        </>
      )}

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

/** The venue features this event took out of its room, each with its own way back, and all at once. */
function RemovedFeaturesMenu({ features, onRestore }: { features: { id: string; label: string }[]; onRestore: (ids: string[]) => void }) {
  return (
    <Popover label={`פריטי מתחם שהוסרו (${features.length})`} icon={ArchiveRestore} trigger="icon" side="bottom" badge={features.length} panelClassName="w-72">
      <ul className="space-y-1">
        {features.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-ink">{f.label}</span>
            <Button size="sm" variant="outline" onClick={() => onRestore([f.id])}>
              החזרה
            </Button>
          </li>
        ))}
      </ul>
      {features.length > 1 && (
        <Button size="sm" className="mt-3 w-full" onClick={() => onRestore(features.map((f) => f.id))}>
          החזרת כולם
        </Button>
      )}
      <Note>הוסרו מהסקיצה של האירוע הזה בלבד — בתוכנית המתחם ובאירועים האחרים הם במקומם.</Note>
    </Popover>
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
  const set = (patch: NumberingOptions) => onChange({ ...options, ...patch });

  // The shared panel (components/popover.tsx) — its header, ✕, Escape and clamping — rather than the
  // hand-rolled box this used to be.
  return (
    <Popover label="מספור שולחנות" icon={ListOrdered} trigger="icon" side="bottom" panelClassName="w-72">
      {(close) => (
        <>
          <p className="mb-3 text-caption leading-relaxed text-muted">
            הצוות מוצא שולחן לפי המספר שלו. כאן נקבע מאיפה הספירה מתחילה ולאיזה כיוון היא רצה.
          </p>

          {/* The corner, drawn AS a corner. Four radio buttons in a 2×2 grid is the same shape as
              the room they describe, so "start from the bottom-left" is pointed at rather than
              read. The grid is laid out in physical order (dir="ltr") on purpose: these are
              positions on a plan, not words in a sentence, and mirroring them under RTL would put
              "top-left" on the right. */}
          <span className={fieldLabelClassName}>שולחן 1 מתחיל מ־</span>
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
                    (on ? "border-accent bg-accent-tint text-accent" : "border-border text-ink-soft hover:bg-accent-tint hover:text-accent")
                  }
                >
                  {glyph}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex min-h-10 items-center gap-3">
            <span className="min-w-0 flex-1 text-sm text-ink-soft">כיוון</span>
            <Select
              value={options.axis ?? "rows"}
              onChange={(v) => set({ axis: v as "rows" | "columns" })}
              aria-label="כיוון המספור"
              options={[
                { value: "rows", label: "לפי שורות" },
                { value: "columns", label: "לפי טורים" },
              ]}
              className="w-36 shrink-0"
            />
          </div>

          <div className="mt-2 flex min-h-10 items-center gap-3">
            <label htmlFor="numbering-start" className="min-w-0 flex-1 text-sm text-ink-soft">
              מתחיל במספר
            </label>
            <NumberField
              id="numbering-start"
              decimals={0}
              min={1}
              value={options.start ?? 1}
              onChange={(v) => set({ start: v })}
              className="w-20"
            />
          </div>

          {/* Boustrophedon. Named for what it does to the walk, not for what it does to the maths —
              nobody laying place cards thinks "serpentine". The app's own switch row, not a native
              checkbox. */}
          <div className="mt-3">
            <SwitchRow
              checked={options.serpentine ?? false}
              onChange={(serpentine) => set({ serpentine })}
              label="שורה הלוך ושורה חזור"
              hint="כמו שמסתובבים באולם — בלי לחצות את הרצפה בתחילת כל שורה."
            />
          </div>

          <Button
            size="sm"
            className="mt-4 w-full"
            disabled={!canRenumber}
            onClick={() => {
              onRenumber();
              close();
            }}
          >
            {canRenumber ? `מספור מחדש · ${count} שולחנות` : "המספור כבר לפי הסדר"}
          </Button>
        </>
      )}
    </Popover>
  );
}

/** Save the drawing under a name; load a saved one, in place of this drawing or on top of it; let
 *  one go. A panel off one button, like the numbering menu, and for the same reason: it is used at
 *  the start and the end of a sketch and never in between.
 *
 *  Loading IN PLACE asks first when there is something to lose, and says Ctrl+Z brings it back —
 *  which is true (loadDocument is one history entry) and is what makes the confirmation a
 *  courtesy rather than a gate. Adding never asks: it only ever puts more on the plan. */
function SketchMenu({
  sketches,
  sketchEmpty,
  onSave,
  onLoad,
  onDelete,
}: {
  sketches: SketchTemplateSummary[];
  sketchEmpty: boolean;
  onSave: (name: string) => void;
  onLoad: (id: string, mode: "replace" | "add") => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "replace" | "delete"; id: string; name: string } | null>(null);

  // The confirmation is a native <dialog> inside the panel: the panel leaves Escape to it, and a
  // press inside it is a press inside the panel, so answering it never closes the list behind it.
  return (
    <Popover label="סקיצות שמורות" icon={LayoutTemplate} trigger="icon" side="bottom" panelClassName="w-80">
      <p className="mb-3 text-caption leading-relaxed text-muted">
        סקיצה שמורה היא נקודת התחלה: פותחים ממנה אירוע חדש, או טוענים אותה לכל סקיצה — במקום מה
        שמצויר או בנוסף לו.
      </p>

      <div className="flex items-end gap-2">
        <TextField
          label="שמירת הסקיצה הנוכחית"
          value={name}
          onChange={setName}
          placeholder="חתונה 300 באולם הגדול"
          wrapperClassName="min-w-0 flex-1"
        />
        <Button
          size="sm"
          className="mb-0.5 shrink-0"
          disabled={!name.trim() || sketchEmpty}
          onClick={() => {
            onSave(name.trim());
            setName("");
          }}
        >
          שמירה
        </Button>
      </div>
      {sketchEmpty && <p className="mt-1.5 text-caption text-muted">הסקיצה ריקה — אין עדיין מה לשמור.</p>}

      <div className="mt-4 border-t border-border-soft pt-3">
        {sketches.length === 0 ? (
          <p className="text-caption text-muted">עדיין אין סקיצות שמורות.</p>
        ) : (
          <ul className="scroll-slim -mx-1 max-h-64 space-y-0.5 overflow-y-auto px-1">
            {sketches.map((sk) => (
              <li key={sk.id} className="flex items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-inset">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink" title={sk.name}>
                    {sk.name}
                  </div>
                  <div className="nums text-caption text-muted">{`${sk.tables} שולחנות · ${sk.items} פריטים`}</div>
                </div>
                <button
                  type="button"
                  title="במקום מה שמצויר עכשיו"
                  onClick={() => (sketchEmpty ? onLoad(sk.id, "replace") : setConfirm({ kind: "replace", id: sk.id, name: sk.name }))}
                  className="shrink-0 rounded-sm px-2 py-1.5 text-caption font-semibold text-accent transition-colors hover:bg-accent-tint hover:text-accent-hover"
                >
                  טעינה
                </button>
                <button
                  type="button"
                  title="בנוסף למה שמצויר עכשיו"
                  onClick={() => onLoad(sk.id, "add")}
                  className="shrink-0 rounded-sm px-2 py-1.5 text-caption font-semibold text-accent transition-colors hover:bg-accent-tint hover:text-accent-hover"
                >
                  הוספה
                </button>
                <BarButton
                  icon={Trash2}
                  tone="danger"
                  label={`מחיקת הסקיצה ״${sk.name}״`}
                  onClick={() => setConfirm({ kind: "delete", id: sk.id, name: sk.name })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "delete" ? `למחוק את הסקיצה ״${confirm.name}״?` : `להחליף את מה שמצויר ב״${confirm?.name ?? ""}״?`}
        body={confirm?.kind === "replace" ? "מה שמצויר עכשיו יוחלף בסקיצה השמורה. Ctrl+Z מחזיר אותו." : undefined}
        confirmLabel={confirm?.kind === "delete" ? "מחיקה" : "החלפה"}
        onConfirm={() => {
          if (confirm) {
            if (confirm.kind === "delete") onDelete(confirm.id);
            else onLoad(confirm.id, "replace");
          }
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </Popover>
  );
}

const CORNER_LABEL: Record<NumberingCorner, string> = {
  "top-right": "מלמעלה מימין",
  "top-left": "מלמעלה משמאל",
  "bottom-right": "מלמטה מימין",
  "bottom-left": "מלמטה משמאל",
};
