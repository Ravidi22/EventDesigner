import type { LucideIcon } from "lucide-react";
import { SearchX } from "lucide-react";
import type { ReactNode } from "react";

// The two shapes an empty list can have, and the difference matters:
//
//   EmptyState — there is nothing here YET. A first run. It has to teach what the thing is for and
//   make creating the first one the obvious move, because an empty screen with no explanation is
//   where adoption stops. Framed icon, an h2, real body copy, one action.
//
//   NoResults  — there IS something here, the filter is just hiding it. Nothing to teach; the
//   person needs the way back out. Lighter: bare icon, smaller title, a "clear" affordance.
//
// Both were hand-copied into the catalog, the gallery folder and the gantt with slightly different
// paddings and icon sizes each time. One file, so a fourth screen inherits the shape instead of
// re-deriving it.

/** The same four elements at two scales. `page` owns a whole screen on the light plane; `card` is
 *  the compact, on-dark sibling that fits inside the dashboard's one brand-toned card, where
 *  `text-ink` on violet would be unreadable and `py-20` would burst the box. Named for the surface
 *  rather than the colour, because the scale and the palette follow from it together. */
const SHAPE = {
  page: {
    root: "mx-auto max-w-md px-6 py-20",
    frame: "mb-5 h-14 w-14 rounded-lg border border-border bg-canvas",
    glyph: "h-7 w-7 text-accent",
    title: "font-display text-h2 text-ink",
    body: "mt-2 text-sm leading-relaxed text-ink-soft",
    action: "mt-6",
  },
  card: {
    // flex-1 so it centres in a card that stretches to its grid row rather than to this content.
    root: "flex-1 px-4 py-8",
    // `glass` is what the tab pills on that card already use — same translucent white on violet.
    frame: "glass mb-4 h-11 w-11 rounded-md",
    glyph: "h-5 w-5 text-canvas",
    title: "text-base font-semibold text-canvas",
    body: "mt-1.5 text-[13px] leading-relaxed text-canvas/75",
    action: "mt-5",
  },
} as const;

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  variant = "page",
}: {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  /** The one thing to do from here. A node rather than a label + handler, so a screen can hand
   *  over a Link (the 404) or a Button (every in-app first run) without this component having to
   *  know which — and so each keeps its own variant and icon. */
  action?: ReactNode;
  variant?: keyof typeof SHAPE;
}) {
  const s = SHAPE[variant];
  return (
    <div className={`flex flex-col items-center justify-center text-center ${s.root}`}>
      <div className={`flex items-center justify-center ${s.frame}`}>
        <Icon className={s.glyph} strokeWidth={1.5} />
      </div>
      <h2 className={s.title}>{title}</h2>
      <p className={s.body}>{body}</p>
      {action && <div className={s.action}>{action}</div>}
    </div>
  );
}

export function NoResults({
  icon: Icon = SearchX,
  title,
  body,
  onClear,
  clearLabel = "נקה סינון",
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  /** Omitted when there is nothing to clear — an empty archive is empty, not filtered. */
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <Icon className="mb-4 h-8 w-8 text-muted" strokeWidth={1.5} />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{body}</p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-soft"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
