import type { ReactNode } from "react";

/** An on/off switch.
 *
 *  Promoted here from the settings screen, which had the only one in the app; the product drawer
 *  wanted the same control and a second implementation of a switch is how two switches start
 *  looking subtly different.
 *
 *  RTL: the knob is placed with flexbox (`justify-end` / `justify-start`) rather than a transform,
 *  so "on" lands on the end side of the track in Hebrew exactly as it does in English, with no
 *  direction arithmetic and nothing to get backwards.
 *
 *  Geometry and colour come from the system: pill track, `bg-accent` when on against the neutral
 *  `bg-inset-border` when off, a white knob carrying the violet-cast `shadow-floating`.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Required — a bare switch says nothing about what it switches. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "flex h-5 w-9 shrink-0 items-center rounded-pill p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 " +
        (checked ? "justify-end bg-accent" : "justify-start bg-inset-border") +
        " " +
        className
      }
    >
      <span aria-hidden className="h-4 w-4 rounded-full bg-canvas shadow-floating" />
    </button>
  );
}

/** A switch with its label and explanation beside it, as a full-width row.
 *
 *  The whole row is the click target, because a 36×20 track is a small thing to ask someone to hit
 *  precisely — the visible switch is `aria-hidden` here and the row carries the semantics, so a
 *  screen reader hears one control rather than a control and a decoy.
 */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-md border border-border bg-canvas p-3 text-start transition-colors hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        aria-hidden
        className={
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-pill p-0.5 transition-colors " +
          (checked ? "justify-end bg-accent" : "justify-start bg-inset-border")
        }
      >
        <span className="h-4 w-4 rounded-full bg-canvas shadow-floating" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="mt-1 block text-xs leading-relaxed text-muted">{hint}</span>}
      </span>
    </button>
  );
}
