import { NextResponse, type NextRequest } from "next/server";
// The NAME only, from a module that imports nothing — see lib/auth/cookie-name.ts. Reaching into
// the session module here would pull node:crypto and the Postgres driver into an edge bundle.
import { SESSION_COOKIE } from "@/lib/auth/cookie-name";

// Next 16 calls this Proxy; it is what earlier versions called Middleware, renamed, same hook.
//
// ⚠ THIS IS NOT THE AUTH CHECK. It runs before every matched request, on the edge, with no database
// — so all it can honestly ask is "does this browser carry a session cookie at all". A forged
// cookie gets past it. The real check is currentSession() reading the row that cookie names, and it
// happens where it matters: in the layout that renders the studio, and in currentOrg() at the top
// of every server action. Next's own documentation is explicit that this layer is for optimistic
// redirects and not for authorization, and the reason is exactly that gap.
//
// What it buys is the redirect being instant. Without it, a signed-out visitor to /catalog loads the
// shell, watches it fail to fetch, and then bounces — the guard turns that into a redirect that
// happens before anything renders.

/** Where you may go without a session: the two account screens, and the marketing home. */
const AUTH_PAGES = ["/login", "/signup"];
/**
 * …plus the invitation links. `/join/<token>` is public BY DEFINITION — the person opening it has
 * no account yet, which is the whole reason they were sent it. Guarding it sent them to a sign-in
 * form they cannot complete, holding the one credential that would have worked.
 *
 * It is not in AUTH_PAGES on purpose: that list is "pages a signed-in person should be bounced away
 * from", and someone already signed in may legitimately open an invitation — accepting it just
 * replaces their session with the invited account, which is what holding the link means.
 *
 * The token in the path is not a secret this layer can leak: it goes no further than the server
 * component that resolves it, and an invalid one renders a dead-link page rather than an error.
 */
const PUBLIC = [...AUTH_PAGES, "/join", "/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));

  if (!hasCookie && !isPublic) {
    const url = new URL("/login", request.url);
    // Where they were going, so signing in lands them there instead of on the dashboard. Only the
    // path and query — never an absolute URL from the request, which is how an open redirect gets
    // built (`?next=https://elsewhere`), and never something we would follow off this origin.
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Already signed in and looking at the sign-in screen: there is nothing there for you. The
  // marketing home is exempt — someone with an account is still allowed to read it.
  //
  // /dashboard for everyone, including clients, who belong on /client. Sending them there directly
  // would mean reading their account KIND, which means a database query, which is the one thing
  // this layer must not do. The (app) layout bounces them on arrival — one extra hop for a case
  // that only happens when someone signed in navigates back to the sign-in page.
  if (hasCookie && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets, the favicon, and files with an extension (images, fonts) —
  // those have nothing to protect and paying a redirect check per asset is pure latency.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
