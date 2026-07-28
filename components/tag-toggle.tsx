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
        "rounded-pill border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-accent-line bg-accent-wash text-accent-hover"
          : "border-border text-ink-soft hover:border-accent-line hover:bg-accent-tint")
      }
    >
      {children}
    </button>
  );
}
