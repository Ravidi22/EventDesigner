// Better Auth endpoints that app/api/auth/[...all]/route.ts refuses to the outside world (PR #4 review).
//
// The route forwards every /api/auth/* request to Better Auth, and Better Auth serves every endpoint it
// has. Some of them the app only ever calls IN-PROCESS — callAuth (./auth-call.ts) hands its Request
// straight to auth().handler, never through this route — because the server action in front of them
// is where the app's own rules run. Reached directly from a browser, they skip those rules:
//   · /sign-up/email — signUp() refuses an invited address, applies the password rules and records
//     the terms acceptance (EVE-85); Better Auth's endpoint does none of that.
// Better Auth's router matches a path exactly (no double slashes, no trailing slash, no decoding), so
// an exact comparison is enough; case and a trailing slash are normalised anyway.
import { AUTH_BASE_PATH } from "./auth";

const SERVER_ONLY = new Set(["/sign-up/email"]);

/** True when a request to this URL must not reach Better Auth from outside. */
export function refusedPublicly(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
  const base = AUTH_BASE_PATH.toLowerCase();
  if (!pathname.startsWith(`${base}/`)) return false;
  return SERVER_ONLY.has(pathname.slice(base.length));
}
