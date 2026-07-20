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
        "rounded-sm border px-2 py-1 text-xs transition-colors " +
        (active
          ? "border-accent bg-accent-tint text-ink"
          : "border-border text-ink-soft hover:border-ink-soft")
      }
    >
      {children}
    </button>
  );
}
