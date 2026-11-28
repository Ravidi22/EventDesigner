// npm run check:auth-routes — which of Better Auth's endpoints the public route refuses (PR #4 review).
// The app reaches them only in-process, through callAuth (lib/auth/auth-call.ts hands a Request straight
// to auth().handler), so refusing them at app/api/auth/[...all]/route.ts closes a browser's way in
// without touching the server actions.
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
// Sign-up skips the terms line (EVE-85) and the checks signUp() makes — an invited address, the
// password rules: it goes through the server action only.
assert(refusedPublicly(at("/api/auth/sign-up/email")), "/sign-up/email is refused");
assert(refusedPublicly(at("/api/auth/sign-up/email?x=1")), "…with a query string");
assert(refusedPublicly(at("/api/auth/Sign-Up/Email")), "…in any case");
assert(refusedPublicly(at("/api/auth/sign-up/email/")), "…with a trailing slash");
// Deleting an account without its password (PR #5 review): Better Auth skips the password on a
// session under a day old; deleteMyAccount insists on it, in-process.
assert(refusedPublicly(at("/api/auth/delete-user")), "/delete-user is refused");
// Every endpoint the app reaches through callAuth (lib/auth/auth-call.ts) is the app's to call — its
// server action is where the app's own rules run (the audit row of a password change, the password
// rules, the closed business). A new callAuth path must be added to the list, or this fails.
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
for (const path of called) assert(refusedPublicly(at(`/api/auth${path}`)), `${path} (called through callAuth) is refused publicly`);
assert(!refusedPublicly(at("/api/auth/reset-password/abc123?callbackURL=%2Freset")), "the reset LINK (GET /reset-password/<token>) stays open");

// What browsers do reach stays open.
for (const open of [
  "/api/auth/get-session",
  "/api/auth/verify-email?token=x",
  "/api/auth/reset-password/abc",
  "/api/auth/callback/google",
  "/api/auth/error?error=x",
]) {
  assert(!refusedPublicly(at(open)), `${open} stays open`);
}
assert(!refusedPublicly(at("/sign-up/email")), "only under the auth base path");

console.log("auth routes self-check passed");
