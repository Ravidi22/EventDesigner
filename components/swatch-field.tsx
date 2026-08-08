"use client";

// The colour of a shade, in the two forms the app needs it: a dot that shows one (`Swatch`) and a
// control that sets one (`SwatchField`).
//
// A swatch is always drawn with a hairline border and, when it carries no colour yet, a visible
// "empty" hatch rather than a white square — on a white card those look identical, and "no colour
// chosen" is a different fact from "white". Nothing here depends on colour alone to be understood:
// every swatch in the app sits next to the shade's name.

const EMPTY_HATCH =
  "repeating-linear-gradient(45deg, var(--color-inset) 0 4px, var(--color-inset-border) 4px 8px)";

export function Swatch({
  color,
  size = 20,
  className = "",
}: {
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-sm border border-inset-border ${className}`}
      style={{ width: size, height: size, background: color || EMPTY_HATCH }}
    />
  );
}

/** Sets one shade's colour. The native colour input is the picker — it is the one control every
 *  platform already gives people, eyedropper included — kept invisible behind the swatch so the
 *  swatch itself is the button. Clearing is its own affordance: a colour input can't express
 *  "none", and a shade that is a size rather than a colour should be able to say so. */
export function SwatchField({
  value,
  onChange,
  label,
}: {
  value?: string;
  onChange: (color: string | undefined) => void;
  label: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <label
        className="relative cursor-pointer rounded-md border border-border p-1 transition-colors hover:border-accent-line focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint"
        title={label}
      >
        <Swatch color={value} size={20} />
        <input
          type="color"
          value={value ?? "#c9a227"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={`ניקוי הצבע — ${label}`}
          title="ללא צבע"
          className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface text-[10px] leading-none text-muted transition-colors hover:text-alert"
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Pick one of the shades a product actually comes in — the studio's counterpart to the catalog's
 *  SwatchField. Shades with no colour set still appear: they are named versions, and hiding them
 *  would make part of the catalog unreachable from the plan. */
export function SwatchPicker({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: string; name: string; swatch?: string }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.name}
            title={o.name}
            onClick={() => onChange(o.id)}
            className={
              "rounded-md border p-1 transition-colors " +
              (active ? "border-accent ring-2 ring-accent-tint" : "border-border hover:border-accent-line")
            }
          >
            <Swatch color={o.swatch} size={18} />
          </button>
        );
      })}
    </div>
  );
}
