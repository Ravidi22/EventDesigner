import { PAGE_GUTTER } from "@/components/page-gutter";

// The shape of a screen before its data lands.
//
// WHAT THESE ARE FOR, WHICH IS NOT "A SPINNER". Every route under (app) now reads its data in the
// server component (see app/(app)/dashboard/page.tsx), which means the RSC payload for a navigation
// does not exist until those queries return. Without a loading boundary the router holds the OLD
// screen on screen for that whole time and the app looks frozen — the click appears to have done
// nothing. `loading.tsx` gives Next a shell it can show the instant the link is clicked, and it is
// also what lets <Link> prefetch the layout-to-boundary part of a dynamic route at all.
//
// They are deliberately dull: bars in the page's own inset colour, at roughly the size of the thing
// that is coming. A designer should read "it is arriving" and nothing else — a skeleton that
// pretends to be content is how you get a screen that flickers between two lies.
//
// FIVE SHAPES, NOT ONE, AND NOT NINE. One shape for every route was wrong in a way that repeated on
// every screen: it drew stacked full-width rows over screens that are auto-fill grids, a padded
// 112px bar over screens that are an edge-to-edge canvas, and — worst — a grey title under the
// shell's real `<h1>`, which is already on screen and already correct during the transition
// (components/app-shell.tsx). That last one is this file's own rule broken by this file: bars that
// promise a title only two of nine screens go on to draw.
//
// The answer is not a hand-drawn skeleton per route — that is a second copy of nine layouts, free
// to drift from the first, which is what the gutter had already done (components/page-gutter.ts).
// It is to name the handful of layout families the app actually has and let each route pick one:
//
//   rows    a control bar over a stack of full-width cards      production, suppliers, bookings
//   grid    a control bar over auto-fill cards                  catalog, gallery, menus
//   split   two half-width tiles over the calendar card         dashboard (designer's and hall's)
//   aside   a fixed nav column beside a panel                   settings
//   canvas  a full-bleed plane, optionally under a toolbar      studio, halls, outputs
//
// A sixth shape means a sixth genuine layout — add it here, where all of them stay visible next to
// each other, rather than in a route folder where it is alone and unaccountable.
//
// `motion-safe:` because a pulse is decoration; someone who has asked their system for less motion
// gets the same bars, still.

/** One placeholder bar. `className` carries the size — these have no intrinsic dimensions. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`motion-safe:animate-pulse rounded-sm bg-inset ${className}`} aria-hidden />;
}

/** The layout families above. See the comment for which route uses which. */
export type SkeletonShape = "rows" | "grid" | "split" | "aside" | "canvas";

export interface PageSkeletonProps {
  shape?: SkeletonShape;
  /** How many cards to draw. Ignored by `split`, `aside` and `canvas`, which have a fixed count. */
  count?: number;
  /**
   * An in-content title — only for the one screen that draws one: a title with an action at the far
   * end (the gallery's "תצוגות" + "תצוגה חדשה"). Every other screen's title lives in the top bar,
   * where it is already real, so drawing one here would be inventing content. (The dashboard's
   * greeting + "האירועים שלך" was the other, a `stack` — both went 2026-10-30, and so did the shape.)
   */
  header?: "row";
  /** A filter/search/tab strip above the content. */
  toolbar?: boolean;
  /** `grid` only: the min column width, matching the screen's own auto-fill template. */
  cell?: number;
}

export function PageSkeleton({ shape = "rows", count = 3, header, toolbar, cell = 200 }: PageSkeletonProps) {
  return (
    <div className={shape === "canvas" ? "h-full" : PAGE_GUTTER} role="status" aria-label="טוען">
      {header === "row" && (
        <div className="mb-7 flex items-center gap-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="ms-auto h-9 w-32 rounded-pill" />
        </div>
      )}

      {toolbar && shape !== "canvas" && (
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-9 w-52 rounded-pill" />
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="ms-auto h-9 w-24 rounded-pill" />
        </div>
      )}

      {shape === "rows" && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: count }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-md" />
          ))}
        </div>
      )}

      {shape === "grid" && (
        // The same auto-fill template the screen itself uses, so the cards land in the cells the
        // bars occupied rather than in a different number of columns.
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cell}px, 1fr))` }}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[4/3] w-full rounded-md" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {shape === "split" && (
        <>
          {/* `lg:` for the same reason the dashboard uses it: the sidebar takes 258px out of the
              content width before this grid sees any of it. */}
          {/* Today's events and today's meetings (app/(app)/dashboard/today-focus.tsx), at the height
              an empty day draws them, then the calendar card — its own radius and roughly its own
              height, so the month lands where the bar stood rather than half a screen lower. */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-[19rem] rounded-lg" />
            <Skeleton className="h-[19rem] rounded-lg" />
          </div>
          <Skeleton className="h-[56rem] w-full rounded-lg" />
        </>
      )}

      {shape === "aside" && (
        <div className="flex items-start gap-3">
          <Skeleton className="h-[340px] w-[228px] shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-56 w-full rounded-md" />
          </div>
        </div>
      )}

      {shape === "canvas" && (
        // h-full, no page gutter: these screens run to the edges of <main>, and a padded bar in the
        // middle of one reads as a card that never arrives.
        <div className="flex h-full flex-col gap-3 p-4">
          {toolbar && <Skeleton className="h-11 w-full shrink-0 rounded-md" />}
          <Skeleton className="min-h-0 w-full flex-1 rounded-md" />
        </div>
      )}

      <span className="sr-only">טוען…</span>
    </div>
  );
}
