"use client";

// A page's own tabs or lanes — the recessed pill rail /suppliers and the dashboard calendar's
// שבוע | חודש already wear: the plane's `bg` well, the chosen one lifted onto a white card in bold
// accent. Not `Segmented` (components/segmented.tsx): that one is a FORM control, labelled, inside a
// dialog; a page's tabs sit in its toolbar with no label over them.
export function PageTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** For a screen reader — the rail has no visible label. */
  label: string;
  value: T;
  options: readonly { id: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 flex-wrap gap-1 rounded-pill bg-bg p-1">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={
              "inline-flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-sm transition-colors " +
              (active ? "bg-surface font-bold text-accent shadow-floating" : "font-semibold text-muted hover:text-accent-hover")
            }
          >
            {o.label}
            {o.count !== undefined && (
              <span className={"nums text-xs font-semibold " + (active ? "text-accent" : "text-quiet")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
