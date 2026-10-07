import type { ButtonHTMLAttributes } from "react";
import { X } from "lucide-react";

// The ✕ in the corner of every popup — dialogs, drawers, modals. One component so they cannot
// drift apart: a round puck on the lightest lavender (`accent-tint`) with an accent ✕, deepening to
// `accent-wash` on hover. Visible at rest on purpose, unlike a ghost IconButton — "how do I get out
// of this" is the one question a popup must answer without being hovered first.
export function CloseButton({
  label = "סגירה",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent transition-colors hover:bg-accent-wash hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <X className="h-4 w-4" strokeWidth={2.2} />
    </button>
  );
}
