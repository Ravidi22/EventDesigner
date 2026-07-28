import { Search } from "lucide-react";
import { controlClassName } from "./control";

// Search field with a leading icon. `className` sizes the wrapper (e.g. "min-w-56 flex-1").
export function SearchInput({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        strokeWidth={2}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`${controlClassName} w-full ps-8 pe-3 placeholder:text-muted`}
      />
    </div>
  );
}
