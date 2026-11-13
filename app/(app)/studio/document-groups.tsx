"use client";

import { useId, useRef, useState } from "react";
import { Camera, ImageOff, Trash2 } from "lucide-react";
import type { NumberingCorner, NumberingOptions } from "@/lib/design-document/groups";
import type { SketchTemplateSummary } from "@/lib/studio/sketches";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BarButton, Note } from "@/components/inspector-bar";
import { SwitchRow } from "@/components/toggle";
import { fieldLabelClassName } from "@/components/control";

// The DOCUMENT's own fields — what is asked of the sketch as a whole, never of a selection: how the
// tables are numbered, the saved sketches, the venue features this event took out. They are the
// end panel's groups when nothing is selected (2026-11-09, the user's "Studio + Halls" board: no
// document ⋯ pointing at them — they are simply there, under the list, while nothing is picked).
//
// Bare: no Popover, no header, no `close` — the panel's group is their frame. (The studio's header
// toolbar wrapped them in Popovers until it was deleted, plan 2 task 3.)

/** The four questions behind renumbering — from which corner, along rows or down columns, starting
 *  at what number, whether alternate rows double back — and the button that does it. None of it is
 *  touched on most plans (the default is right for most rooms); the room where it matters is the one
 *  whose entrance is at the far end. */
export function NumberingFields({
  options,
  onChange,
  onRenumber,
  count,
  canRenumber,
}: {
  options: NumberingOptions;
  onChange: (n: NumberingOptions) => void;
  onRenumber: () => void;
  /** How many units the current settings would actually change. */
  count: number;
  /** False when the numbering is already 1, 2, 3… in reading order — the button says so by being
   *  disabled rather than by doing nothing when pressed. */
  canRenumber: boolean;
}) {
  const set = (patch: NumberingOptions) => onChange({ ...options, ...patch });
  // Its own id, so the field's label never collides with another instance on the page.
  const startId = useId();
  return (
    <>
      <p className="mb-3 text-caption leading-relaxed text-muted">
        הצוות מוצא שולחן לפי המספר שלו. כאן נקבע מאיפה הספירה מתחילה ולאיזה כיוון היא רצה.
      </p>

      {/* The corner, drawn AS a corner. Four radio buttons in a 2×2 grid is the same shape as the
          room they describe, so "start from the bottom-left" is pointed at rather than read. The
          grid is laid out in physical order (dir="ltr") on purpose: these are positions on a plan,
          not words in a sentence, and mirroring them under RTL would put "top-left" on the right. */}
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
        <label htmlFor={startId} className="min-w-0 flex-1 text-sm text-ink-soft">
          מתחיל במספר
        </label>
        <NumberField id={startId} decimals={0} min={1} value={options.start ?? 1} onChange={(v) => set({ start: v })} className="w-20" />
      </div>

      {/* Boustrophedon. Named for what it does to the walk, not for what it does to the maths —
          nobody laying place cards thinks "serpentine". */}
      <div className="mt-3">
        <SwitchRow
          checked={options.serpentine ?? false}
          onChange={(serpentine) => set({ serpentine })}
          label="שורה הלוך ושורה חזור"
          hint="כמו שמסתובבים באולם — בלי לחצות את הרצפה בתחילת כל שורה."
        />
      </div>

      <Button size="sm" className="mt-4 w-full" disabled={!canRenumber} onClick={onRenumber}>
        {canRenumber ? `מספור מחדש · ${count} שולחנות` : "המספור כבר לפי הסדר"}
      </Button>
    </>
  );
}

/** Save the drawing under a name; load a saved one, in place of this drawing or on top of it; give
 *  one a photo for its card in the meeting; let one go.
 *
 *  Loading IN PLACE asks first when there is something to lose, and says Ctrl+Z brings it back —
 *  which is true (loadDocument is one history entry) and is what makes the confirmation a courtesy
 *  rather than a gate. Adding never asks: it only ever puts more on the plan. */
export function SketchList({
  sketches,
  sketchEmpty,
  onSave,
  onLoad,
  onDelete,
  onPhoto,
}: {
  sketches: SketchTemplateSummary[];
  /** Nothing drawn yet — nothing to save, and loading needs no confirmation. */
  sketchEmpty: boolean;
  onSave: (name: string) => void;
  onLoad: (id: string, mode: "replace" | "add") => void;
  onDelete: (id: string) => void;
  /** A photo of the real event for a saved sketch's card in the meeting — or null to take it off. */
  onPhoto: (id: string, file: File | null) => void;
}) {
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "replace" | "delete"; id: string; name: string } | null>(null);
  // One hidden picker for every row; `photoFor` says whose photo it is picking.
  const picker = useRef<HTMLInputElement>(null);
  const photoFor = useRef<string | null>(null);

  // The confirmation is a native <dialog>: inside a popover the panel leaves Escape to it, and a
  // press inside it is a press inside the panel, so answering it never closes the list behind it.
  return (
    <>
      <p className="mb-3 text-caption leading-relaxed text-muted">
        סקיצה שמורה היא נקודת התחלה: פותחים ממנה אירוע חדש, או טוענים אותה לכל סקיצה — במקום מה שמצויר או
        בנוסף לו.
      </p>

      <div className="flex items-end gap-2">
        <TextField label="שמירת הסקיצה הנוכחית" value={name} onChange={setName} placeholder="חתונה 300 באולם הגדול" wrapperClassName="min-w-0 flex-1" />
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
                {sk.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
                  <img src={sk.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-sm object-cover" />
                )}
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
                {/* The card's cover in the meeting's סקיצת פתיחה; without one the card draws the plan. */}
                <BarButton
                  icon={Camera}
                  label={sk.photoUrl ? "החלפת תמונת האירוע" : "הוספת תמונה מהאירוע"}
                  onClick={() => {
                    photoFor.current = sk.id;
                    picker.current?.click();
                  }}
                />
                {sk.photoUrl && <BarButton icon={ImageOff} tone="danger" label="הסרת התמונה" onClick={() => onPhoto(sk.id, null)} />}
                <BarButton icon={Trash2} tone="danger" label={`מחיקת הסקיצה ״${sk.name}״`} onClick={() => setConfirm({ kind: "delete", id: sk.id, name: sk.name })} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && photoFor.current) onPhoto(photoFor.current, file);
        }}
      />

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
    </>
  );
}

/** The venue features this event took out of its room, each with its own way back, and all at
 *  once. Taken out from the canvas (Delete, or the feature's bar); the venue never lost them. */
export function RemovedFeaturesList({ features, onRestore }: { features: { id: string; label: string }[]; onRestore: (ids: string[]) => void }) {
  return (
    <>
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
    </>
  );
}

const CORNER_LABEL: Record<NumberingCorner, string> = {
  "top-right": "מלמעלה מימין",
  "top-left": "מלמעלה משמאל",
  "bottom-right": "מלמטה מימין",
  "bottom-left": "מלמטה משמאל",
};
