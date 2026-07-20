import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent px-4 py-2 font-medium text-canvas hover:bg-accent-hover",
  ghost: "px-3 py-2 text-ink-soft hover:bg-accent-tint hover:text-ink",
  danger: "px-3 py-2 text-muted hover:bg-warn-tint hover:text-warn",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`${base} ${variants[variant]} ${className}`} />;
}
