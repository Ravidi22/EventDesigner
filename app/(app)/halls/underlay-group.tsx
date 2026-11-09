"use client";

import { Images, Lock, Ruler, Trash2, Unlock, Upload, X } from "lucide-react";
import type { Point } from "@/lib/studio/hall";
import type { Venue } from "@/lib/venues/types";
import type { PlanUnderlay } from "@/lib/venues/types";
import { clampOpacity } from "@/lib/venues/underlay";

// THE TRACED PLAN — the venue's "תוכנית רקע" group in the end panel (2026-11-09, the "Studio +
// Halls" board: with nothing selected, the panel shows the zones and this). Upload or reuse a photo
// of the plan, calibrate it by one known length, dim it, turn it, free it to move or lock it, swap
// it for another photo, take it away. Moved here unchanged from the zone side panel; the state is
// the screen's (app/(app)/halls/halls-screen.tsx), so these are its own handlers under short names.

export interface UnderlayControls {
  underlay: PlanUnderlay | undefined;
  busy: boolean;
  note: string | null;
  setNote: (note: string | null) => void;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  /** Other venues of this business with a plan photo already — reusing one skips a re-upload. */
  reusable: Venue[];
  onReuse: (venue: Venue) => void | Promise<void>;
  /** A file chosen — it goes through the crop dialog first. */
  onFile: (file: File) => void;
  calib: { from: Point | null; to: Point | null } | null;
  setCalib: (calib: { from: Point | null; to: Point | null } | null) => void;
  calibAnswer: string;
  setCalibAnswer: (answer: string) => void;
  onCalibrate: (from: Point, to: Point, answer: string) => void;
  patch: (patch: Partial<PlanUnderlay>) => void;
  persist: (next: PlanUnderlay | undefined) => void | Promise<void>;
  unlocked: boolean;
  setUnlocked: (fn: (unlocked: boolean) => boolean) => void;
  onRemove: () => void | Promise<void>;
}

/** What the group's closed row reads: the file and how strongly it shows, or that there is none. */
export function underlaySummary(u: PlanUnderlay | undefined): string {
  return u?.url ? `${u.fileName} · ${Math.round(clampOpacity(u.opacity) * 100)}%` : "אין";
}

export function UnderlayGroupBody({
  underlay,
  busy,
  note,
  setNote,
  pickerOpen,
  setPickerOpen,
  reusable,
  onReuse,
  onFile,
  calib,
  setCalib,
  calibAnswer,
  setCalibAnswer,
  onCalibrate,
  patch,
  persist,
  unlocked,
  setUnlocked,
  onRemove,
}: UnderlayControls) {
  return (
    <>
  {!underlay?.url ? (
    <>
      <p className="mb-2.5 text-xs leading-relaxed text-ink-soft">
        העלו תצלום או סריקה של תוכנית המקום, כיילו אותה לפי מידה ידועה, וציירו את הקירות
        מעליה.
      </p>

      {pickerOpen ? (
        <div className="rounded-sm border border-border bg-canvas p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">בחירה מתוכנית קיימת</span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="סגירת הרשימה"
              className="rounded-full p-0.5 text-muted hover:bg-inset hover:text-ink"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {reusable.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onReuse(v)}
                  className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-start hover:bg-inset disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx */}
                  <img
                    src={v.plan.underlay!.url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-sm object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{v.name}</span>
                    <span className="block truncate text-xs text-muted">{v.plan.underlay!.fileName}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-canvas px-3 py-1.5 text-sm font-semibold text-ink hover:bg-inset">
            <Upload className="h-4 w-4" strokeWidth={1.4} />
            {busy ? "מעלה…" : "העלאת תוכנית"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Cleared so choosing the SAME file again still fires a change event — the
                // obvious thing to do after a failed upload (or a cancelled crop).
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
          </label>
          {reusable.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-2 rounded-sm border border-border bg-canvas px-3 py-1.5 text-sm font-semibold text-ink hover:bg-inset disabled:opacity-50"
            >
              <Images className="h-4 w-4" strokeWidth={1.4} />
              בחירה מתוכנית קיימת
            </button>
          )}
        </div>
      )}
    </>
  ) : (
    <div className="flex flex-col gap-2.5">
      <p className="truncate text-xs text-ink-soft" title={underlay.fileName}>
        {underlay.fileName}
      </p>

      {/* Calibration — the one control that makes traced walls mean anything. */}
      {calib ? (
        <div className="rounded-sm border border-accent-line bg-accent-tint p-2.5">
          {!calib.to ? (
            <p className="text-xs leading-relaxed text-accent-deep">
              {calib.from
                ? "סמנו את הקצה השני של אותו קטע."
                : "סמנו על התוכנית קצה אחד של קטע שאורכו ידוע לכם."}
            </p>
          ) : (
            <>
              <label className="mb-1.5 block text-xs font-semibold text-accent-deep">
                מה האורך האמיתי של הקטע? (מטרים)
              </label>
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  inputMode="decimal"
                  value={calibAnswer}
                  onChange={(e) => setCalibAnswer(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    calib.from &&
                    calib.to &&
                    onCalibrate(calib.from, calib.to, calibAnswer)
                  }
                  placeholder="12.5"
                  dir="ltr"
                  className="w-24 rounded-sm border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                />
                <button
                  onClick={() =>
                    calib.from && calib.to && onCalibrate(calib.from, calib.to, calibAnswer)
                  }
                  className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-deep"
                >
                  כיול
                </button>
              </div>
            </>
          )}
          <button
            onClick={() => {
              setCalib(null);
              setNote(null);
            }}
            className="mt-2 text-xs font-semibold text-muted hover:text-ink"
          >
            ביטול
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setCalib({ from: null, to: null });
            setCalibAnswer("");
            setNote(null);
          }}
          className="inline-flex items-center gap-2 rounded-sm border border-border bg-canvas px-3 py-1.5 text-sm font-semibold text-ink hover:bg-inset"
        >
          <Ruler className="h-4 w-4" strokeWidth={1.4} />
          כיול לפי מידה ידועה
        </button>
      )}

      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <span className="w-14 shrink-0">שקיפות</span>
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(clampOpacity(underlay.opacity) * 100)}
          onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })}
          onPointerUp={() => void persist(underlay)}
          className="flex-1 accent-[var(--color-accent)]"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <span className="w-14 shrink-0">סיבוב</span>
        <input
          type="number"
          step={0.5}
          value={underlay.rotationDeg}
          dir="ltr"
          onChange={(e) => patch({ rotationDeg: Number(e.target.value) || 0 })}
          onBlur={() => void persist(underlay)}
          className="w-20 rounded-sm border border-border bg-canvas px-2 py-1 text-sm text-ink focus-visible:border-accent focus-visible:outline-none"
        />
        <span className="text-muted">°</span>
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setUnlocked((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold ${
            unlocked
              ? "border-accent-line bg-accent-tint text-accent"
              : "border-border bg-canvas text-ink hover:bg-inset"
          }`}
        >
          {unlocked ? (
            <Unlock className="h-3.5 w-3.5" strokeWidth={1.6} />
          ) : (
            <Lock className="h-3.5 w-3.5" strokeWidth={1.6} />
          )}
          {unlocked ? "נעילת מיקום" : "שחרור להזזה"}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-inset">
          <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
          החלפה
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </label>
        <button
          onClick={() => void onRemove()}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-alert hover:bg-inset"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          הסרה
        </button>
      </div>

      {unlocked && (
        <p className="text-xs leading-relaxed text-alert">
          התוכנית פתוחה להזזה. הזזתה אחרי שציירתם קירות מעליה תסיט אותם ממנה.
        </p>
      )}
    </div>
  )}

  {note && <p className="mt-2 text-xs leading-relaxed text-accent-deep">{note}</p>}
    </>
  );
}
