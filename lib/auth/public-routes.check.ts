// npm run check:auth-routes — which of Better Auth's endpoints the public route refuses (PR #4 review).
// The app reaches them only in-process, through callAuth (lib/auth/auth-call.ts hands a Request straight
// to auth().handler), so refusing them at app/api/auth/[...all]/route.ts closes a browser's way in
// without touching the server actions.
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
// What browsers do reach stays open.
for (const open of [
  "/api/auth/get-session",
  "/api/auth/verify-email?token=x",
  "/api/auth/reset-password/abc",
  "/api/auth/callback/google",
  "/api/auth/sign-in/social",
  "/api/auth/sign-out",
]) {
  assert(!refusedPublicly(at(open)), `${open} stays open`);
}
assert(!refusedPublicly(at("/sign-up/email")), "only under the auth base path");

console.log("auth routes self-check passed");
