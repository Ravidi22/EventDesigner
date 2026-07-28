import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warn" | "alert";

// Fill + label pairs, straight from the design system's chip row.
const tones: Record<Tone, string> = {
  neutral: "bg-bg text-muted",
  accent: "bg-accent-wash text-accent-hover",
  success: "bg-success-tint text-success",
  warn: "bg-warn-tint text-warn-ink",
  alert: "bg-alert-tint text-alert",
};

/**
 * Status pill. `icon` is not decoration — a chip that carries meaning must pair the fill
 * with a glyph or a word so it survives black-and-white print (The Print Rule).
 */
export function StatusChip({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-[7px] text-[13px] leading-none font-semibold ${tones[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
