"use client";

import { RIBBON_WEEKS, weekCellLabel, type WeekCell } from "./view-utils";

// Thirteen weeks of load, across the content width. Click a week, the list scrolls to it.
//
// ── IT IS A SCROLLBAR, NOT A CHART ─────────────────────────────────────────────────────────────
//
// PRODUCT.md names "chart-everything layouts" as an anti-reference, and it is right to: a bar chart
// of bookings per week is a thing a designer with eight events a month can already recite. This
// earns its place by being NAVIGATION — the one control on the screen that answers "take me to
// October" without scrolling past September — and it pays for that place by being almost silent.
//
// So there is no bar, no axis, no gridline and no hue ramp. Each cell carries the count as a
// NUMBER, which is the same information a bar would encode and is also legible in black and white,
// at a glance, without a legend (The Print Rule). A week with nothing in it prints a hairline
// instead of a "0" — a column of zeroes is the noisiest way to say nothing is happening.
//
// It also carries no alert marking, on purpose. The filter bar's "דורשים טיפול" already counts what
// is wrong, and a red pip up here would be the second place the same fact is said — on a screen
// whose single most important instruction is to stay silent when nothing is wrong.
//
// NO HORIZONTAL SCROLL, EVER. Thirteen `flex-1 min-w-0` cells divide whatever width there is; the
// labels inside are 11px and truncate. That is the whole layout — this row cannot overflow, which
// is the property the old board could not manage with five 288px columns.
export function LoadRibbon({
  cells,
  outside,
  onPick,
}: {
  cells: WeekCell[];
  /** Visible dated rows the window does not reach. Stated rather than hidden — see rowsOutsideRibbon. */
  outside: number;
  onPick: (weekStart: string) => void;
}) {
  const total = cells.reduce((sum, c) => sum + c.count, 0);

  return (
    <nav aria-label={`עומס ב-${RIBBON_WEEKS} השבועות שברשימה`} className="mb-3 shrink-0">
      <div className="flex items-stretch gap-1 rounded-md border border-border bg-surface p-1.5">
        {cells.map((cell) => (
          <WeekButton key={cell.start} cell={cell} onPick={onPick} />
        ))}
      </div>

      {/* One quiet line under the ribbon, and only when it has something to admit. `total` is the
          count the ribbon is actually showing, so saying it here is what makes the omission
          legible rather than making the ribbon look complete when it isn't. */}
      {outside > 0 && (
        <p className="nums mt-1.5 text-[11px] text-quiet">
          {total} אירועים בטווח הרצועה · עוד {outside} מחוצה לו, ברשימה למטה
        </p>
      )}
    </nav>
  );
}

function WeekButton({ cell, onPick }: { cell: WeekCell; onPick: (weekStart: string) => void }) {
  const label = weekCellLabel(cell.start);
  const empty = cell.count === 0;

  // The current week is marked by fill AND by `aria-current`, never by colour alone — and the fill
  // is `accent-tint`, the same near-white lavender the active nav item uses, so "this is where you
  // are" says exactly what it says everywhere else in the app.
  const tone = cell.current
    ? "bg-accent-tint text-accent"
    : empty
      ? "text-quiet"
      : "bg-inset text-ink hover:bg-accent-tint hover:text-accent-hover";

  return (
    <button
      type="button"
      // A week with nothing in it has nowhere to scroll to. Disabled rather than inert-looking:
      // a control that is focusable and then does nothing is worse than one that says it is off.
      disabled={empty}
      onClick={() => onPick(cell.start)}
      aria-current={cell.current ? "date" : undefined}
      aria-label={
        empty
          ? `שבוע ${label} — אין אירועים`
          : `שבוע ${label} — ${cell.count} אירועים. מעבר ברשימה`
      }
      title={empty ? undefined : `מעבר לשבוע ${label}`}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-sm px-1 py-1.5 transition-colors disabled:cursor-default ${tone}`}
    >
      {/* The count is the ribbon's whole payload, so it is the only thing here set in ink. An empty
          week gets a hairline in its place: the eye skips it, and it still occupies its column so
          the thirteen stay evenly spaced. */}
      {empty ? (
        <span className="mt-[7px] mb-[7px] block h-px w-3 bg-border" aria-hidden />
      ) : (
        <span className="nums text-[15px] leading-none font-bold">{cell.count}</span>
      )}
      <span className="nums w-full truncate text-center text-[10px] leading-none font-medium text-quiet">
        {label}
      </span>
    </button>
  );
}
