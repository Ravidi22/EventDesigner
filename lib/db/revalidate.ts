// Which screens a write invalidates.
//
// ⚠ SERVER ONLY, and NOT a "use server" module: these are plain helpers called from inside actions,
// not endpoints of their own. Exporting them from a "use server" file would publish "invalidate the
// studio's caches" as something any caller could POST.
//
// WHY THIS EXISTS NOW AND DID NOT BEFORE. Two things changed together. Reads moved into the server
// components (app/(app)/*/page.tsx), so what a screen shows is now decided when its RSC payload is
// built rather than by a fetch on mount. And `staleTimes.dynamic` in next.config.ts lets the router
// reuse a segment it already has for 30 seconds. Between them, a meeting booked on the dashboard and
// then looked for on the production runway could be answered out of a payload built before the
// booking.
//
// So every write says what it invalidated. The screen the write happened on was already correct —
// the actions return the fresh list and the client adopts it — this is for the OTHER screens.
//
// WHAT IS DELIBERATELY NOT HERE: the studio's document autosave and the venue plan editor's. Both
// fire on a debounce while someone is drawing (every 500ms, F-3.5), and invalidating a route on
// every mouse-up would throw away the router cache continuously to refresh screens nobody is
// looking at. They already return what they wrote to the one screen that cares.
import { revalidatePath } from "next/cache";

/**
 * revalidatePath, for a caller that might not be inside a request.
 *
 * ⚠ THIS GUARD IS NOT DEFENSIVE PROGRAMMING — without it `npm run db:verify` cannot run at all.
 * That script calls the real server actions from a plain Node process (see lib/db/org.ts,
 * actAsOrgForScript), and `revalidatePath` outside a request throws
 *
 *     Invariant: static generation store missing in revalidatePath /dashboard
 *
 * which would turn every write action into something only callable from a browser. The same applies
 * to `npm run db:seed`.
 *
 * Swallowing it is correct rather than merely convenient: revalidation invalidates a router cache,
 * and in a command-line script there is no router and no cache — there is nothing the call could
 * have accomplished. Anything thrown for another reason would be a Next internal failing during a
 * real request, where the write has already committed and the screen the user is looking at is
 * refreshed by the action's own return value regardless.
 */
function revalidate(path: string, type?: "layout" | "page"): void {
  try {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  } catch {
    // No request context — a script. See above.
  }
}

/** The two screens that list events: the dashboard's calendar and the production runway.
 *
 *  ⚠ /production is the more sensitive of the two, in a way the Gantt's stage board never was.
 *  The runway's rows are DERIVED — a zone chosen, a quote issued, a client's confirmation — so a
 *  write landing anywhere in the app can turn one of its checkpoints from late to done. A stale
 *  payload there does not show an old label; it shows an alert about work that is already finished,
 *  which is exactly how a screen of alerts stops being read. */
export function revalidateEvents(): void {
  revalidate("/dashboard");
  revalidate("/production");
}

/** The diary lives on the dashboard alone. */
export function revalidateAppointments(): void {
  revalidate("/dashboard");
}

/** The catalog screen, and the studio — whose rail and canvas resolver read the same list. */
export function revalidateCatalog(): void {
  revalidate("/catalog");
  revalidate("/studio");
}

/** The gallery screen. */
export function revalidateGallery(): void {
  revalidate("/gallery");
}

/** The settings screen. */
export function revalidateSettings(): void {
  revalidate("/settings");
}

/**
 * The production runway alone — for a write that changes how it is COMPUTED rather than what is on
 * it.
 *
 * The checkpoint schedule is the only such write today (lib/settings/actions.ts): every event keeps
 * exactly the facts it had, and every due date underneath them moves. Nothing about the events
 * changed, so revalidateEvents() would be the wrong verb and would drag the dashboard along for a
 * screen it does not render.
 */
export function revalidateProduction(): void {
  revalidate("/production");
}

/**
 * Everything, because the (app) LAYOUT itself is out of date.
 *
 * The layout reads two things per navigation — the venue list for the sidebar's switcher, and the
 * meeting flow that five components measure progress against — so a write to either is not a
 * one-screen invalidation. "layout" is what reaches the layout segment rather than only the page
 * underneath it.
 */
export function revalidateShell(): void {
  revalidate("/", "layout");
}
