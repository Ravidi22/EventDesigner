import type { ReactNode } from "react";

// Toggleable style-tag chip. Shared by the catalog filters and the product drawer.
export function TagToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "border-accent bg-accent text-canvas"
          : "border-border bg-canvas text-ink-soft hover:border-accent-line hover:bg-accent-tint")
      }
    >
      {children}
    </button>
  );
}
