// What app/api/auth/[...all]/route.ts lets a browser reach of Better Auth — an ALLOW-list (PR #4
// review, then PR #5's re-review).
//
// The route forwards /api/auth/* to Better Auth, and Better Auth serves every endpoint it has. The app
// itself reaches Better Auth only IN-PROCESS — callAuth (./auth-call.ts) hands its Request straight to
// auth().handler, and so does the Google callback (app/api/google/callback) — because the server
// action in front of each call is where the app's own rules run: signUp() refuses an invited address
// and records the terms (EVE-85), deleteMyAccount insists on the password (Better Auth deletes without
// one on a session under a day old), changePassword() writes the audit row (EVE-52).
//
// So a browser is served only what Better Auth MAILS or REDIRECTS it to, by GET: the confirmation
// link, the reset link, and the error page a failed link lands on. Everything else is not found —
// including whatever endpoint the next Better Auth version adds, which a deny-list would have opened
// without anyone deciding so (`update-session` arrived that way; `send-verification-email` would
// mail any unverified address). check:auth-routes holds the list, and that no callAuth path is on it.
//
// Better Auth's router matches a path exactly (no double slashes, no trailing slash, no decoding), so
// an exact comparison is enough; case and a trailing slash are normalised anyway.
import { AUTH_BASE_PATH } from "./auth";

/** The endpoints a browser is sent to, each by GET — the path after the base. */
const BROWSER_LINKS: readonly RegExp[] = [
  /^\/verify-email$/, // the confirmation email's link (lib/auth/auth.ts sendVerificationEmail)
  /^\/reset-password\/[^/]+$/, // the reset email's link; the form behind it posts through callAuth
  /^\/error$/, // where Better Auth sends a browser when a link fails (no errorURL is set)
];

/** True when a request to this URL must not reach Better Auth from outside. */
export function refusedPublicly(url: string, method: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
  const base = AUTH_BASE_PATH.toLowerCase();
  if (!pathname.startsWith(`${base}/`)) return false;
  if (method.toUpperCase() !== "GET") return true;
  const path = pathname.slice(base.length);
  return !BROWSER_LINKS.some((link) => link.test(path));
}
