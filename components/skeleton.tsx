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
// `motion-safe:` because a pulse is decoration; someone who has asked their system for less motion
// gets the same bars, still.

/** One placeholder bar. `className` carries the size — these have no intrinsic dimensions. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`motion-safe:animate-pulse rounded-sm bg-inset ${className}`} aria-hidden />;
}

/**
 * A whole page's worth: the title, then `rows` cards at the page's normal gutter.
 *
 * One component for every route rather than a hand-drawn skeleton each, because the differences
 * between them are not worth maintaining a second copy of every screen's layout to express.
 */
export function PageSkeleton({ rows = 3, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="px-8 py-8" role="status" aria-label="טוען">
      {title && (
        <div className="mb-6 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-7 w-64" />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-md" />
        ))}
      </div>
      <span className="sr-only">טוען…</span>
    </div>
  );
}
