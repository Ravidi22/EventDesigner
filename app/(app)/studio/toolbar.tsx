"use client";

import { Undo2, Redo2, Copy, Scissors, ClipboardPaste, Check, Loader2, Eye, EyeOff, TriangleAlert, ScanEye, Layers, ListOrdered, LayoutTemplate, ArchiveRestore, Box } from "lucide-react";
import type { NumberingOptions } from "@/lib/design-document/groups";
import { PLANES, type Plane } from "@/lib/studio/planes";
import { IconButton } from "@/components/icon-button";
import { Select } from "@/components/select";
import { Popover } from "@/components/popover";
import type { SketchTemplateSummary } from "@/lib/studio/sketches";
import { NumberingFields, RemovedFeaturesList, SketchList } from "./document-groups";

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
  onSketchPhoto,
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
  /** A photo of the real event for a saved sketch's card in the meeting — or null to take it off. */
  onSketchPhoto: (id: string, file: File | null) => void;
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
      <SketchMenu sketches={sketches} sketchEmpty={sketchEmpty} onSave={onSaveSketch} onLoad={onLoadSketch} onDelete={onDeleteSketch} onPhoto={onSketchPhoto} />

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

      <PlaneRail layerVisible={layerVisible} onToggleLayer={onToggleLayer} activeLayer={activeLayer} onActivateLayer={onActivateLayer} />

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

/** The four planes as ONE control — a section through the room, read in a row: the tables, what is
 *  laid on them, the floor around them, what hangs above (lib/studio/planes.ts).
 *
 *  It is a framed row of segments, `Segmented`'s geometry (components/segmented.tsx), because the
 *  row is one question — which part of the room am I looking at — and that frame is what the app
 *  draws round one question with several answers. It used to be four loose pills, each with its
 *  own border that changed meaning (accent for "being worked in", grey for "shown", none at all for
 *  "hidden"): four chips a designer decoded one at a time (2026-10-31, the user: "redesign the
 *  layer visibility").
 *
 *  Two presses per plane, kept apart on purpose. The LABEL is "work in this plane only": while it is
 *  on, the segment wears the toolbar's own pressed field — the tinted field the 3D button and the
 *  canvas strip's tape wear while they are live — and the other planes go muted here as they dim on
 *  the canvas; pressed again it lets go of every plane. The EYE LEADING the label is shown/hidden
 *  (it trailed for a moment; the user asked for it first, same day), a glyph that is also the
 *  toggle, so a hidden plane says so exactly where it was hidden (EyeOff, the whole segment faint)
 *  and comes back from the same spot. One press that did both would make
 *  each unreachable half the time: hiding the ceiling and working on the ceiling are different
 *  questions. No hover reveal — the eye is drawn at rest, at quiet weight, like every card's "…".
 *  The Layers glyph before the frame names the group, as the ScanEye names the zone select. */
function PlaneRail({
  layerVisible,
  onToggleLayer,
  activeLayer,
  onActivateLayer,
}: {
  layerVisible: Record<Plane, boolean>;
  onToggleLayer: (l: Plane) => void;
  activeLayer: Plane | null;
  onActivateLayer: (l: Plane) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Layers className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
      <div role="group" aria-label="שכבות" className="flex items-center gap-0.5 rounded-md border border-border bg-canvas p-0.5">
        {PLANES.map((l) => {
          const on = layerVisible[l.id];
          const active = activeLayer === l.id;
          const heldBack = activeLayer !== null && !active;
          return (
            <div key={l.id} className={"flex items-center rounded-sm ps-0.5 transition-colors " + (active ? "bg-accent-tint" : "")}>
              <button
                type="button"
                onClick={() => onToggleLayer(l.id)}
                aria-pressed={on}
                aria-label={on ? `הסתרת שכבת ${l.label}` : `הצגת שכבת ${l.label}`}
                title={on ? `הסתרת שכבת ${l.label}` : `הצגת שכבת ${l.label}`}
                className={
                  "rounded-pill p-1 transition-colors " +
                  (active
                    ? "text-accent hover:bg-accent-wash"
                    : on
                      ? "text-quiet hover:bg-accent-tint hover:text-accent"
                      : "text-faint hover:bg-accent-tint hover:text-accent")
                }
              >
                {on ? <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => onActivateLayer(l.id)}
                aria-pressed={active}
                title={active ? "חזרה לכל השכבות" : `עבודה בשכבת ${l.label} בלבד`}
                className={
                  "min-h-7 whitespace-nowrap rounded-sm ps-1 pe-2.5 text-xs leading-none transition-colors " +
                  (active
                    ? "font-semibold text-accent"
                    : !on
                      ? "font-medium text-faint hover:text-accent"
                      : heldBack
                        ? "font-medium text-muted hover:text-accent"
                        : "font-medium text-ink-soft hover:text-accent")
                }
              >
                {l.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The venue features this event took out of its room — the end panel's group, in a popover until
 *  this toolbar goes (./document-groups.tsx holds the body). */
function RemovedFeaturesMenu({ features, onRestore }: { features: { id: string; label: string }[]; onRestore: (ids: string[]) => void }) {
  return (
    <Popover label={`פריטי מתחם שהוסרו (${features.length})`} icon={ArchiveRestore} trigger="icon" side="bottom" badge={features.length} panelClassName="w-72">
      <RemovedFeaturesList features={features} onRestore={onRestore} />
    </Popover>
  );
}

/** The renumber button and the four questions behind it (./document-groups.tsx), off one toolbar
 *  icon; the panel closes once the plan is renumbered. */
function NumberingMenu(props: Parameters<typeof NumberingFields>[0]) {
  return (
    <Popover label="מספור שולחנות" icon={ListOrdered} trigger="icon" side="bottom" panelClassName="w-72">
      {(close) => (
        <NumberingFields
          {...props}
          onRenumber={() => {
            props.onRenumber();
            close();
          }}
        />
      )}
    </Popover>
  );
}

/** Saved sketches (./document-groups.tsx), off one toolbar icon: used at the start and the end of a
 *  sketch and never in between. */
function SketchMenu(props: Parameters<typeof SketchList>[0]) {
  return (
    <Popover label="סקיצות שמורות" icon={LayoutTemplate} trigger="icon" side="bottom" panelClassName="w-80">
      <SketchList {...props} />
    </Popover>
  );
}
