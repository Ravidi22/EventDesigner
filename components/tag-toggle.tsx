import type { ReactNode } from "react";

// Toggleable style-tag chip. Shared by the catalog filters, the product drawer and the stage fill's
// deck picker — one pressed-pill chip for the whole form family.
export function TagToggle({
  active,
  onClick,
  disabled = false,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** A chip that cannot be turned on right now (a picker that is full). Pressed chips are never
   *  disabled — turning one off is always allowed. */
  disabled?: boolean;
  /** Why, when it is disabled; a plain tooltip otherwise. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={title}
      className={
        "rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-canvas " +
        (active
          ? "border-accent bg-accent text-canvas"
          : "border-border bg-canvas text-ink-soft hover:border-accent-line hover:bg-accent-tint")
      }
    >
      {children}
    </button>
  );
}
