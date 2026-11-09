"use client";

import type { ReactNode } from "react";
import { Copy, RotateCcw, RotateCw, Trash2, X, type LucideIcon } from "lucide-react";
import { InspectorDivider, InspectorHeader } from "@/components/plan-canvas";
import { NumberField } from "@/components/number-field";
import { Popover } from "@/components/popover";
import { Menu, type MenuItem } from "@/components/menu";
import { fieldLabelClassName } from "@/components/control";

// The floating selection bar the studio sketch puts under a selected thing — a title row, then a row
// of chips that each open a small panel (components/popover.tsx). Shared, so that the catalog's
// appearance editor asks about a selected shape in exactly the bar the studio asks about a selected
// table in, instead of a wall of labelled fields that wraps into whatever else sits on the canvas.

/** The card: a title row, then a row of subjects.
 *
 *  The top row is WHAT this is — its name and the facts nobody edits (a layer, a table type, what a
 *  block is made of) — plus the one button that dismisses the whole thing. The bottom row is what
 *  can be done to it. Neither row scrolls: they wrap, which is what keeps this from ever growing a
 *  sideways scrollbar on a narrow canvas.
 *
 *  `w-max` so the card is as wide as its wider row and no wider, `max-w-full` so it still gives way
 *  to a narrow plane instead of running off it. */
export function Bar({
  icon,
  title,
  badge,
  facts,
  onClose,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** A short word in a filled pill after the title — the shape editor's "בסיס" on the first shape. */
  badge?: string;
  facts?: string;
  /** Left off the one bar that has nothing to dismiss — the empty-selection one, where closing would
   *  mean deselecting something that isn't selected. */
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex w-max max-w-full flex-col rounded-md border border-border bg-surface shadow-floating">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-2.5 py-1.5">
        <InspectorHeader icon={icon} label={title} />
        {badge && <span className="rounded-pill bg-accent-wash px-2 py-px text-[11px] font-semibold text-accent-hover">{badge}</span>}
        {facts && (
          // Truncated rather than wrapped, with the whole of it in the tooltip: this line is context,
          // and context that pushes the controls down a row is no longer context.
          <span className="min-w-0 max-w-64 shrink truncate text-xs text-muted" title={facts}>
            {facts}
          </span>
        )}
        {onClose && (
          <div className="ms-auto ps-2">
            <BarButton icon={X} label="סגירה · Esc" onClick={onClose} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">{children}</div>
    </div>
  );
}

/** Which way the thing is facing, in degrees.
 *
 *  Typed as well as dragged. The canvas handle is faster for "about like that"; this is the only way
 *  to say "exactly 90" or to match one item to another. On a mixed selection the chip and the number
 *  read blank rather than 0 — several items at several angles have no shared facing, and showing 0
 *  would claim they were all square. Typing one anyway squares them all to it deliberately, which is
 *  the point of the field being there.
 *
 *  The four quarter-turns are PRESETS rather than a pair of nudge buttons flanking the field: nine
 *  times in ten the wanted angle is one of them, and a row reading "0 90 180 270" says which one is
 *  set now. The two relative turns are still there, either side of the number, for the tenth time. */
export function Rotation({ value, onChange }: { value: number | null; onChange: (deg: number) => void }) {
  const turn = (by: number) => onChange(((((value ?? 0) + by) % 360) + 360) % 360);
  return (
    // Shown to the whole degree, like the field below it: a stored 89.99° from an angled wall is
    // "90°" to a person, and the field already rounds it that way.
    <Popover label="סיבוב" icon={RotateCw} value={value === null ? "—" : ltr(`${Math.round(value) % 360}°`)}>
      <div className="flex items-center justify-between gap-1.5">
        <BarButton icon={RotateCcw} label="רבע סיבוב שמאלה" onClick={() => turn(-90)} />
        <div className="flex items-center gap-1">
          <NumberField
            id="facing"
            decimals={0}
            value={value ?? 0}
            // Blank when they disagree, "0" when they genuinely all face front — hideZero is switched
            // on for exactly the first case, so the two are never confused for each other.
            hideZero={value === null}
            placeholder={value === null ? "—" : undefined}
            onChange={onChange}
            className="w-16"
            aria-label="זווית במעלות"
          />
          <span className="text-xs text-muted">°</span>
        </div>
        <BarButton icon={RotateCw} label="רבע סיבוב ימינה" onClick={() => turn(90)} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1" role="group" aria-label="זוויות מוכנות">
        {[0, 90, 180, 270].map((deg) => (
          <button
            key={deg}
            type="button"
            aria-pressed={value === deg}
            onClick={() => onChange(deg)}
            className={
              "nums rounded-sm py-1 text-xs font-semibold transition-colors " +
              (value === deg ? "bg-accent text-canvas" : "bg-inset text-ink-soft hover:bg-accent-tint hover:text-accent")
            }
          >
            {ltr(`${deg}°`)}
          </button>
        ))}
      </div>
    </Popover>
  );
}

/** The two verbs every selection has, held at the far end of the subjects row: another one of these,
 *  and remove these. A venue feature has neither — it belongs to the property, not to tonight — so
 *  its bar simply doesn't render this. The hairline is what keeps the destructive one from sitting
 *  flush against the last subject under a moving cursor. */
export function Actions({
  onDuplicate,
  duplicateLabel,
  onDelete,
  deleteLabel,
}: {
  onDuplicate: () => void;
  duplicateLabel: string;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <div className="ms-auto flex items-center gap-1">
      <InspectorDivider />
      <BarButton icon={Copy} label={`${duplicateLabel} · Ctrl+C · Ctrl+V`} onClick={onDuplicate} />
      <BarButton icon={Trash2} label={`${deleteLabel} · Delete`} onClick={onDelete} tone="danger" />
    </div>
  );
}

// ── The QUICK BAR's second row (2026-11-09, the user's "Studio + Halls" board) ────────────────────
// Every selection's bar reads in one order: at most three numbers typed in place → one mode verb
// (an outline pill) → copy · delete · ⋯, always last. Everything else about the selection is a
// group in the end panel (components/end-panel.tsx). Lifted out of the shape editor's quick bar,
// which was the board's reference.

/** A number typed in the bar itself — the board's 56×28 field (44 when `narrow`). Committed on
 *  blur: a size typed digit by digit would otherwise resize the thing at "1", then "12"… */
export function QuickNumber({
  label,
  value,
  onChange,
  decimals = 0,
  min,
  max,
  narrow,
  placeholder,
  hideZero,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  decimals?: number;
  min?: number;
  max?: number;
  narrow?: boolean;
  placeholder?: string;
  hideZero?: boolean;
  disabled?: boolean;
}) {
  return (
    <NumberField
      size="sm"
      aria-label={label}
      decimals={decimals}
      min={min}
      max={max}
      commitOnBlur
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      hideZero={hideZero}
      disabled={disabled}
      className={narrow ? "w-11" : "w-14"}
    />
  );
}

/** A unit or a sign between numbers — "×", "ס״מ", "°". */
export function QuickUnit({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted">{children}</span>;
}

/** The hairline between the bar's subjects. */
export function QuickSep() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />;
}

/** The muted icon in front of a number, saying what the number is (its tooltip says it in words). */
export function QuickLead({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span title={label} className="inline-flex shrink-0 text-muted">
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

/** Which way it faces, typed in the bar: a quarter turn either side of the angle. Blank on a mixed
 *  selection (several things at several angles have no one facing); typing one squares them all. */
export function QuickTurn({ value, onChange, label = "זווית במעלות" }: { value: number | null; onChange: (deg: number) => void; label?: string }) {
  const turn = (by: number) => onChange(((((value ?? 0) + by) % 360) + 360) % 360);
  return (
    <>
      <BarButton icon={RotateCcw} label="רבע סיבוב שמאלה" onClick={() => turn(-90)} />
      <QuickNumber
        label={label}
        narrow
        value={value === null ? 0 : Math.round(value) % 360}
        hideZero={value === null}
        placeholder={value === null ? "—" : undefined}
        onChange={(v) => onChange(((v % 360) + 360) % 360)}
      />
      <QuickUnit>°</QuickUnit>
      <BarButton icon={RotateCw} label="רבע סיבוב ימינה" onClick={() => turn(90)} />
    </>
  );
}

/** The selection's ONE mode verb — הלבשה, עריכת הקווים, עריכת האזור — as an outline pill, the
 *  product form's "עריכת המראה" look. `active` while the mode it enters is on. */
export function ModeVerb({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border-[1.5px] border-accent-line px-3 text-[13px] font-bold text-accent transition-colors hover:bg-accent-tint " +
        (active ? "bg-accent-wash" : "bg-surface")
      }
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

/** The bar's last word: copy · delete · ⋯, in that order and always last, behind a hairline. A
 *  wall has no copy; a venue feature in a sketch has no delete; the ⋯ holds the rare verbs (cut,
 *  select similar, stacking, lock, mirror, save as composite) in the sections the caller gives. */
export function QuickTail({
  onCopy,
  copyLabel = "שכפול · Ctrl+D",
  onDelete,
  deleteLabel = "מחיקה",
  deleteDisabled,
  more,
  moreLabel = "עוד פעולות",
}: {
  onCopy?: () => void;
  copyLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteDisabled?: boolean;
  more?: MenuItem[];
  moreLabel?: string;
}) {
  return (
    <div className="ms-auto flex items-center gap-1">
      <InspectorDivider />
      {onCopy && <BarButton icon={Copy} label={copyLabel} onClick={onCopy} />}
      {onDelete && <BarButton icon={Trash2} label={`${deleteLabel} · Delete`} onClick={onDelete} tone="danger" disabled={deleteDisabled} />}
      {more && more.length > 0 && <Menu label={moreLabel} side="top" items={more} />}
    </div>
  );
}

/** One icon-sized verb. Not IconButton: the danger tone has to change the same hover background
 *  IconButton already sets, and two utilities for one property are settled by their order in the
 *  generated stylesheet rather than by the order they are written in — so the variants are written
 *  out in full here instead of layered on top of each other. */
export function BarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "default",
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  /** A toggle that is on — a mode the button entered and will leave (the hall editor's outline
   *  editing). Absent = a plain action, with no pressed state to announce. */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "shrink-0 rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 " +
        (tone === "danger"
          ? "text-muted hover:bg-alert-tint hover:text-alert"
          : active
            ? "bg-accent-tint text-accent"
            : "text-muted hover:bg-accent-tint hover:text-accent-hover")
      }
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

/** One row inside a popover: a label at the start, its control at the end.
 *
 *  The label WRAPS rather than truncating — it was `truncate`, and beside a control that would not
 *  shrink it was cut to two letters, which is most of why the panels' labels could not be read. It
 *  is ink-soft at 14px, the same as every other field label beside its input.
 *
 *  `stack` puts the label above a control that wants the whole width — a Select, whose option names
 *  (a chair, a cloth) are longer than any number and would otherwise push the panel wider than its
 *  card. The label is left out where the panel's own heading already says what the single field in
 *  it is — repeating "סיבוב" under a panel titled "סיבוב" is noise. */
export function PanelRow({
  label,
  htmlFor,
  stack,
  children,
}: {
  label?: string;
  htmlFor?: string;
  stack?: boolean;
  children: ReactNode;
}) {
  if (stack) {
    return (
      <div className="py-1">
        {label &&
          (htmlFor ? (
            <label htmlFor={htmlFor} className={fieldLabelClassName}>
              {label}
            </label>
          ) : (
            <span className={fieldLabelClassName}>{label}</span>
          ))}
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-10 items-center gap-3 py-1">
      {label &&
        (htmlFor ? (
          <label htmlFor={htmlFor} className="min-w-0 flex-1 text-sm leading-snug text-ink-soft">
            {label}
          </label>
        ) : (
          <span className="min-w-0 flex-1 text-sm leading-snug text-ink-soft">{label}</span>
        ))}
      <div className={"flex items-center gap-1.5 " + (label ? "shrink-0 justify-end" : "min-w-0 flex-1 flex-wrap")}>{children}</div>
    </div>
  );
}

/** A run that has to read left-to-right inside a right-to-left bar — "#6", "0/8", "42%", "160×90".
 *  Hebrew is the paragraph direction here, and an unmarked "#6" is laid out with the hash to the
 *  right of the digit, which is not what a table number looks like. Only for tokens that are ALL
 *  digits and symbols: a mixed phrase like "2.40 מ׳" already reads correctly and would be reversed
 *  by this. */
export function ltr(text: string): ReactNode {
  return <span dir="ltr">{text}</span>;
}

/** A sentence of explanation, at the one size and ink they are all written in. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-caption leading-relaxed text-muted first:mt-0">{children}</p>;
}

