// npm run check:auth-routes — which of Better Auth's endpoints a browser may reach through the public
// route (PR #4 review, then PR #5's re-review: an ALLOW-list). The app reaches Better Auth only
// in-process, through callAuth (lib/auth/auth-call.ts hands a Request straight to auth().handler) and
// the Google callback route, so app/api/auth/[...all]/route.ts serves the browser only what Better
// Auth mails or redirects it to — and refuses everything else, including any endpoint a future
// Better Auth adds, without touching the server actions.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { refusedPublicly } from "./public-routes";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

const at = (path: string) => `https://app.test${path}`;
const get = (path: string) => refusedPublicly(at(path), "GET");
const post = (path: string) => refusedPublicly(at(path), "POST");

// Sign-up skips the terms line (EVE-85) and the checks signUp() makes — an invited address, the
// password rules: it goes through the server action only.
assert(post("/api/auth/sign-up/email"), "/sign-up/email is refused");
assert(post("/api/auth/sign-up/email?x=1"), "…with a query string");
assert(post("/api/auth/Sign-Up/Email"), "…in any case");
assert(post("/api/auth/sign-up/email/"), "…with a trailing slash");
// Deleting an account without its password (PR #5 review): Better Auth skips the password on a
// session under a day old; deleteMyAccount insists on it, in-process.
assert(post("/api/auth/delete-user"), "/delete-user is refused");

// Every endpoint the app reaches through callAuth is the app's to call — its server action is where
// the app's own rules run (the audit row of a password change, the password rules, the closed
// business). None of them is served to a browser, by any method.
const called = new Set<string>();
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) for (const m of readFileSync(p, "utf8").matchAll(/callAuth(?:<[^>]*>)?\(\s*"(\/[a-z/-]+)"/g)) called.add(m[1]);
  }
};
for (const dir of ["lib", "app"]) walk(join(process.cwd(), dir));
assert(called.size >= 8, `callAuth's endpoints are found (${[...called].join(", ")})`);
for (const path of called) {
  assert(post(`/api/auth${path}`) && get(`/api/auth${path}`), `${path} (called through callAuth) is refused publicly`);
}

// Everything Better Auth serves that no browser of this app needs is refused too (PR #5 re-review) —
// a deny-list left these open, and would have opened whatever the next Better Auth version adds.
for (const path of [
  "/send-verification-email", // mails a verification link to any unverified address
  "/update-session",
  "/update-user",
  "/change-email",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/get-access-token",
  "/refresh-token",
  "/verify-password",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/delete-user/callback",
  "/a-future-endpoint",
]) {
  assert(post(`/api/auth${path}`) && get(`/api/auth${path}`), `${path} is refused`);
}
// The Google sign-in comes home through app/api/google/callback, which hands it to Better Auth
// IN-PROCESS; the public /callback is not its way back.
assert(get("/api/auth/callback/google?code=x&state=y"), "/callback/google is refused (the app answers it in-process)");
assert(get("/api/auth/get-session"), "/get-session is refused (nothing in a browser reads it)");
assert(get("/api/auth/ok") && get("/api/auth/api/reference"), "…and the extras (better-call's reference page is under the base too)");

// What a browser IS sent to stays open — by GET only, the way a link or a redirect arrives.
for (const open of [
  "/api/auth/verify-email?token=x&callbackURL=%2Fwelcome", // the confirmation email's link
  "/api/auth/reset-password/abc123?callbackURL=%2Freset", // the reset email's link
  "/api/auth/error?error=invalid_token", // where Better Auth sends a browser when a link fails
]) {
  assert(!get(open), `GET ${open} stays open`);
}
assert(post("/api/auth/verify-email?token=x"), "…but not by POST");
assert(post("/api/auth/reset-password/abc123"), "…nor the reset link");
assert(post("/api/auth/reset-password") && get("/api/auth/reset-password"), "the reset FORM's endpoint (no token) is refused");
assert(get("/api/auth/reset-password/a/b"), "a reset link has exactly one token segment");

// Not under the auth base path: not this module's to judge.
assert(!post("/sign-up/email"), "only under the auth base path");

console.log("auth routes self-check passed");
