"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MousePointer2, PenLine, Plus, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { CloseButton } from "@/components/close-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { StyleFields } from "@/components/style-fields";
import { TextField } from "@/components/text-field";
import { ADD_TOOL_ICON, addToolIconKey } from "@/components/venue-inspector";
import { ADD_TOOL_SECTIONS, ADD_TOOL_SECTION_LABEL, type AddTool } from "@/lib/venues/add-tools";
import { formatDimensions } from "@/lib/catalog/format";
import { ZONE_KIND_LABEL, detachedNote, type Zone, type ZoneKind } from "@/lib/venues/zone";
import { MAX_ZONE_MARGIN_MM } from "@/lib/venues/feature-zones";
import { SurfaceTiles } from "@/components/surface-tiles";

const KIND_OPTIONS = (Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => [k, ZONE_KIND_LABEL[k]] as const);

// A zone's own fields, behind the ✎ on its row in /halls' zone list.
//
// They used to open INLINE, under the row, whenever the row was the only thing selected — and a
// click on the row also flew the canvas onto the zone. Both together made the list a thing that
// jumped: one click reframed the plan and pushed every row below it down by a form's height. The
// row now only selects; editing is a deliberate second step, in a dialog of its own.
//
// Edits are LIVE, like every other field on this screen (they go through the venue's undo history
// as they are typed), so there is no ביטול that would have to put anything back — the footer's one
// filled button is סיום. Deleting asks first, through the shared ConfirmDialog, like every delete.
//
// Shape is not edited here: a freehand zone is reshaped by its corner handles on the plan and a
// walled one by its walls. The dialog says which, and offers the one-click tidy for a freehand trace.
// A zone made of FEATURES (lib/venues/feature-zones.ts) is the one shape with a field: its margin —
// with the way to light its features on the plan and the way to cut it loose into a freehand one.
export function ZoneDialog({
  zone,
  areaM2,
  detached,
  dotColor,
  addTools,
  onChange,
  onDelete,
  onTidy,
  members,
  onSelectMembers,
  onDetach,
  onAddElement,
  onClose,
}: {
  /** The zone being edited — the dialog is open exactly while this is set. Passed live from the
   *  screen's zone list, so the dialog closes on its own if an undo takes the zone away. */
  zone: Zone | null;
  areaM2: number;
  /** The walls round it no longer close it (see resolveZones). */
  detached: boolean;
  /** The kind's dot, the same one its row in the list wears. */
  dotColor: string;
  /** What may be added inside the zone — the same list the canvas's own flyout offers. */
  addTools: AddTool[];
  onChange: (patch: Partial<Zone>) => void;
  /** Called after the confirmation, not before it. */
  onDelete: () => void;
  /** Straightens a freehand outline. Absent on a walled zone. */
  onTidy?: () => void;
  /** A zone made of features: the ones still on the plan. Absent on every other zone. */
  members?: string[];
  /** Selects `members` on the plan (and closes the dialog). */
  onSelectMembers?: (ids: string[]) => void;
  /** Turns a features zone into a freehand one of the outline it has now. */
  onDetach?: () => void;
  /** Places one of `addTools` inside this zone. Absent = no add-element control (a detached zone
   *  has no "inside" to place at). */
  onAddElement?: (tool: AddTool) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const open = zone !== null;
  // A question left open belongs to the zone it was asked about.
  if (!open && confirming) setConfirming(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <dialog
        ref={ref}
        onClose={onClose}
        onCancel={onClose}
        aria-labelledby={titleId}
        // ⚠ NEVER PUT A `display` UTILITY ON THE <dialog> ITSELF — see components/event-dialog.tsx.
        //
        // overflow-visible from sm up: the dialog is short enough not to need a scroll, and a
        // scrolling box clips everything absolutely placed inside it — the line-style Select's
        // list and the add-element list both hang past the frame when they have to. Below sm the
        // two columns stack, so there the dialog caps and scrolls instead.
        className="modal m-auto max-h-[calc(100dvh-2rem)] w-[92vw] max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog sm:max-h-none sm:overflow-visible"
      >
        {/* Mounted only while open, so a closed dialog holds no stale copy of a zone. */}
        {zone && (
          <div className="flex flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                <h2 id={titleId} className="truncate text-base font-semibold text-ink">
                  עריכת אזור
                </h2>
              </div>
              <CloseButton onClick={onClose} />
            </header>

            <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
              {/* What the zone IS: its name, its kind, how many people it holds, how high it is. */}
              <div className="flex min-w-0 flex-col gap-4">
                <TextField
                  label="שם האזור"
                  value={zone.name}
                  onChange={(name) => onChange({ name })}
                  placeholder="למשל: אולם ראשי"
                />
                <Segmented
                  label="סוג האזור"
                  value={zone.kind}
                  options={KIND_OPTIONS}
                  onChange={(kind) => onChange({ kind })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label="מושבים"
                    decimals={0}
                    min={0}
                    step={10}
                    hideZero
                    value={zone.capacity?.seated ?? 0}
                    onChange={(seated) => onChange({ capacity: { ...zone.capacity, seated } })}
                  />
                  <NumberField
                    label="עמידה"
                    decimals={0}
                    min={0}
                    step={10}
                    hideZero
                    value={zone.capacity?.standing ?? 0}
                    onChange={(standing) => onChange({ capacity: { ...zone.capacity, standing } })}
                  />
                  {/* 0 is not a missing value here — it is the stored meaning of "open to the sky",
                      which is why a canopy or a lawn legitimately sits at zero rather than blank. */}
                  <NumberField
                    label="תקרה (מ׳)"
                    decimals={1}
                    min={0}
                    step={0.5}
                    value={zone.ceilingHeightMm / 1000}
                    onChange={(m) => onChange({ ceilingHeightMm: Math.round(m * 1000) })}
                  />
                </div>
                <SurfaceTiles value={zone.surface} onChange={(surface) => onChange({ surface })} none="ללא" />
              </div>

              {/* How it is drawn on the plan. */}
              <div className="min-w-0">
                <StyleFields
                  style={zone.style}
                  onChange={(style) => onChange({ style })}
                  strokeWidthDefault={0}
                  fillLabel="גוון"
                  strokeLabel="מסגרת"
                />
              </div>

              {/* Where its shape is edited — on the plan, and differently for each kind of zone,
                  which is exactly what a designer cannot tell from the tint alone. */}
              <div className="flex items-start justify-between gap-3 rounded-md bg-inset px-3.5 py-3 sm:col-span-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-soft">
                    צורה
                    {!detached && areaM2 > 0 && (
                      <>
                        {" · "}
                        <span className="nums">{Math.round(areaM2)}</span> מ״ר
                      </>
                    )}
                  </p>
                  <p className={`mt-1 text-xs leading-relaxed ${detached ? "text-alert" : "text-muted"}`}>
                    {detached
                      ? detachedNote(zone)
                      : zone.source.type === "region"
                        ? "על התוכנית: גררו פינה כדי להזיז אותה · גררו את הנקודה שבאמצע צלע כדי להוסיף פינה · לחיצה כפולה על פינה מוחקת אותה"
                        : zone.source.type === "features"
                          ? `האזור עוטף ${members?.length === 1 ? "אלמנט אחד" : `${members?.length ?? 0} אלמנטים`} במרווח שסביבם, וזז ומשתנה איתם. להוספה או הסרה: בחרו את האלמנטים, ובסרגל שלהם ״אזור״ ← עדכון.`
                          : "הצורה נקבעת לפי הקירות שסביב האזור — גררו קיר או פינה במצב בחירה כדי לשנות אותה"}
                  </p>
                  {zone.source.type === "features" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <NumberField
                        layout="inline"
                        label="מרווח סביב האלמנטים (מ׳)"
                        decimals={1}
                        min={0}
                        max={MAX_ZONE_MARGIN_MM / 1000}
                        step={0.5}
                        commitOnBlur
                        value={zone.source.marginMm / 1000}
                        onChange={(m) => zone.source.type === "features" && onChange({ source: { ...zone.source, marginMm: Math.round(m * 1000) } })}
                        className="w-20"
                      />
                    </div>
                  )}
                </div>
                {zone.source.type === "features" && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {onSelectMembers && !!members?.length && (
                      <Button variant="outline" size="sm" onClick={() => onSelectMembers(members)} title="מסמן על התוכנית את האלמנטים שהאזור מוגדר לפיהם">
                        <MousePointer2 className="h-4 w-4" strokeWidth={2} />
                        בחירת האלמנטים
                      </Button>
                    )}
                    {onDetach && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onDetach}
                        title="האזור נשאר בצורתו הנוכחית ולא זז עוד עם האלמנטים; את פינותיו גוררים על התוכנית"
                      >
                        <PenLine className="h-4 w-4" strokeWidth={2} />
                        ציור חופשי
                      </Button>
                    )}
                  </div>
                )}
                {onTidy && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onTidy}
                    title="מיישר צלעות שכמעט ישרות ומסיר פינות מיותרות"
                    className="shrink-0"
                  >
                    <Ruler className="h-4 w-4" strokeWidth={2} />
                    יישור צורה
                  </Button>
                )}
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                מחיקה
              </Button>
              <div className="flex items-center gap-2">
                {onAddElement && addTools.length > 0 && <AddElementMenu tools={addTools} onPick={onAddElement} />}
                <Button type="button" size="sm" onClick={onClose}>
                  סיום
                </Button>
              </div>
            </footer>
          </div>
        )}
      </dialog>

      {/* A sibling of the zone dialog, not a child: two modals stack in the top layer either way,
          and this keeps the confirmation's own close/cancel events off the dialog beneath it. */}
      <ConfirmDialog
        open={confirming}
        title={`למחוק את האזור ״${zone?.name.trim() || "ללא שם"}״?`}
        body="האזור יוסר מהרשימה ומהתוכנית. הקירות והאלמנטים שבתוכו נשארים במקומם."
        confirmLabel="מחיקת האזור"
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}

/** The footer's "הוספת אלמנט": the same sectioned list the canvas's own flyout offers, opening
 *  UPWARD out of the footer (there is nothing below it but the edge of the dialog). */
function AddElementMenu({ tools, onPick }: { tools: AddTool[]; onPick: (tool: AddTool) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    // pointerdown, not click, matching Select and Menu.
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    // Captured and default-prevented: Escape closes this list and nothing else. Left alone it would
    // reach the dialog's close watcher too and take the whole editor down with it — the same reason
    // components/popover.tsx captures it.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        הוספת אלמנט
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="הוספת אלמנט לאזור"
          className="scroll-slim absolute bottom-[calc(100%+6px)] end-0 z-40 max-h-80 w-64 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lifted"
        >
          {/* Sectioned, because the bars and the stages are catalog ROWS and a flat list of
              "בריכה / מבנה / בר בצורת ח 360×180" reads as one vocabulary when it is two. A section
              with nothing in it prints nothing, not an empty heading. */}
          {ADD_TOOL_SECTIONS.map((section) => {
            const inSection = tools.filter((t) => t.section === section);
            if (inSection.length === 0) return null;
            return (
              <div key={section} role="group" aria-label={ADD_TOOL_SECTION_LABEL[section]}>
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-muted">{ADD_TOOL_SECTION_LABEL[section]}</p>
                {inSection.map((tool) => {
                  const Icon = ADD_TOOL_ICON[addToolIconKey(tool)];
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        onPick(tool);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-start text-sm text-ink-soft transition-colors hover:bg-accent-tint hover:text-ink"
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate">{tool.label}</span>
                      {tool.product && (
                        <span className="nums shrink-0 text-[10px] text-muted" dir="ltr">
                          {formatDimensions(tool.product.dimensions)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
