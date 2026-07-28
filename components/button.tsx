import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "soft" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center rounded-pill font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100";

const variants: Record<Variant, string> = {
  // The one saturated control on a screen — the gradient CTA, used once per view.
  primary: "grad-cta text-canvas shadow-cta hover:brightness-110",
  // Secondary weight without competing: the tint gradient behind an indigo label.
  soft: "grad-soft border border-soft-line text-accent-hover hover:brightness-[0.98]",
  outline: "border-[1.5px] border-accent-line text-accent hover:bg-accent-tint",
  ghost: "text-ink-soft hover:bg-accent-tint hover:text-accent-hover",
  danger: "text-muted hover:bg-alert-tint hover:text-alert",
};

// The design system specifies the `lg` step exactly: 58/32r primary, 54/28r soft, 50/26r outline.
// `md` and `sm` scale that down for dense toolbar and inline use.
const heights: Record<Size, Partial<Record<Variant, string>> & { DEFAULT: string }> = {
  sm: { DEFAULT: "h-9 text-[13px] gap-2" },
  md: { DEFAULT: "h-11 text-sm gap-2.5" },
  lg: { DEFAULT: "h-[50px] text-sm gap-3", primary: "h-[58px] text-[15px] gap-3", soft: "h-[54px] text-sm gap-3" },
};

// Puck diameter and the padding on the puck side, per size.
const pucks: Record<Size, { size: string; inset: string }> = {
  sm: { size: "h-7 w-7", inset: "p-1" },
  md: { size: "h-9 w-9", inset: "p-1" },
  lg: { size: "h-[46px] w-[46px]", inset: "p-1.5" },
};

// Roomy padding on the side away from the puck (or both sides when there is no puck). These are
// written out in full rather than derived — Tailwind only emits classes it can see as literals.
const pads: Record<Size, string> = { sm: "px-4", md: "px-5", lg: "px-6" };
const padsPuckAtStart: Record<Size, string> = { sm: "pe-4", md: "pe-5", lg: "pe-[22px]" };
const padsPuckAtEnd: Record<Size, string> = { sm: "ps-4", md: "ps-5", lg: "ps-5" };

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Renders inside a white puck. Filled variants only — start edge on `primary`, end edge on `soft`. */
  icon?: ReactNode;
}) {
  const puck = icon && (variant === "primary" || variant === "soft");
  const puckAtEnd = variant === "soft";
  const h = heights[size][variant] ?? heights[size].DEFAULT;

  // A pucked button reverses the padding: tight against the puck, roomy at the far end.
  const pad = puck
    ? `${pucks[size].inset} ${puckAtEnd ? padsPuckAtEnd[size] : padsPuckAtStart[size]}`
    : pads[size];

  const disc = puck && (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${pucks[size].size} ${
        variant === "primary" ? "bg-white/95" : "bg-canvas shadow-puck"
      } text-accent`}
    >
      {icon}
    </span>
  );

  return (
    <button
      type="button"
      {...props}
      className={`${base} ${puck ? "justify-start" : "justify-center"} ${variants[variant]} ${h} ${pad} ${className}`}
    >
      {puck ? (
        <>
          {!puckAtEnd && disc}
          {/* With a puck the label absorbs the remaining width, so it sits flush against the disc. */}
          <span className="flex-1 text-start">{children}</span>
          {puckAtEnd && disc}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
