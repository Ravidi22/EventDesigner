import type { ButtonHTMLAttributes } from "react";

// Icon-only ghost button (close, back, etc.). `label` is required for a11y.
export function IconButton({
  label,
  size = "sm",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`rounded-pill ${size === "sm" ? "p-1.5" : "p-2"} text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted ${className}`}
    />
  );
}
