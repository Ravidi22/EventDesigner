import type { ButtonHTMLAttributes } from "react";

// Icon-only ghost button (close, back, etc.). `label` is required for a11y.
//
// `pressed` is for a button that is a MODE or a toggle — the tape measure, the fill tool, the
// safety halos: while it is on, the button wears the tinted field a selected nav item wears, not
// just a coloured glyph, so a glance at the strip says which tools are live. It is also the
// aria-pressed state, which is what a screen reader says about it.
export function IconButton({
  label,
  size = "sm",
  pressed,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md"; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...props}
      className={`rounded-pill ${size === "sm" ? "p-1.5" : "p-2"} transition-colors ${
        pressed ? "bg-accent-tint text-accent hover:bg-accent-wash hover:text-accent" : "text-muted hover:bg-accent-tint hover:text-accent-hover"
      } disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted ${className}`}
    />
  );
}
