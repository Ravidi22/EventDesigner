// Better Auth endpoints that app/api/auth/[...all]/route.ts refuses to the outside world (PR #4 and
// PR #5 reviews).
//
// The route forwards every /api/auth/* request to Better Auth, and Better Auth serves every endpoint it
// has. The app itself reaches Better Auth only IN-PROCESS — callAuth (./auth-call.ts) hands its
// Request straight to auth().handler, and so does the Google callback (app/api/google/callback) —
// because the server action in front of each call is where the app's own rules run. A browser needs
// only the links Better Auth mails and redirects to (/verify-email, /reset-password/<token>, /error).
// Reached directly, a server-only endpoint skips those rules:
//   · /sign-up/email — signUp() refuses an invited address, applies the password rules and records the
//     terms acceptance (EVE-85);
//   · /delete-user — Better Auth deletes WITHOUT the password on a session under a day old (freshAge);
//     deleteMyAccount insists on it (EVE-22). Note `freshAge: 0` would not help: it skips the check;
//   · /change-password — changePassword() writes the audit row (EVE-52);
//   · the rest of what callAuth calls, and the account changes the app makes through its own actions
//     (/update-user, /change-email), for the same reason.
// check:auth-routes fails when a new callAuth path is not listed here.
//
// Better Auth's router matches a path exactly (no double slashes, no trailing slash, no decoding), so
// an exact comparison is enough; case and a trailing slash are normalised anyway.
import { AUTH_BASE_PATH } from "./auth";

const SERVER_ONLY = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/social",
  "/sign-out",
  "/delete-user",
  "/change-password",
  "/request-password-reset",
  // The form's POST. The emailed link is GET /reset-password/<token> — another path, and it stays open.
  "/reset-password",
  "/update-user",
  "/change-email",
]);

/** True when a request to this URL must not reach Better Auth from outside. */
export function refusedPublicly(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
  const base = AUTH_BASE_PATH.toLowerCase();
  if (!pathname.startsWith(`${base}/`)) return false;
  return SERVER_ONLY.has(pathname.slice(base.length));
}
