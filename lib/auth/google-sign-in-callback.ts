// The sign-in half of app/api/google/callback: Google has sent back a browser that pressed
// "המשך עם Google" on the sign-in screen.
//
// ⚠ SERVER ONLY, and only callable from a Route Handler — it sets the session cookie.
//
// A plain module the route delegates to, like lib/google/sync.ts is for the calendar half: the
// route decides WHICH flow came home (isSignInState), and each flow's rules live with its own code.
//
// EVERY FAILURE IS A REDIRECT BACK TO /login with `?google=` naming what happened — never a JSON
// body or an error page in front of someone who just pressed a button on Google's screen.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { googleConfig } from "@/lib/google/config";
import { exchangeCode } from "@/lib/google/oauth";
import {
  SIGN_IN_NONCE_COOKIE,
  fetchVerifiedGoogleEmail,
  nonceMatches,
  readSignInState,
  signInCookiePath,
} from "./google-sign-in";
import { HOME_FOR } from "./kinds";
import { createSession, pruneExpiredSessions } from "./session";

function back(request: Request, outcome: string): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("google", outcome);
  return NextResponse.redirect(url);
}

export async function completeGoogleSignIn(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const config = googleConfig();
  if (!config) return back(request, "failed");

  // The nonce is single-use whatever happens next: read it, then drop it.
  const store = await cookies();
  const nonce = store.get(SIGN_IN_NONCE_COOKIE)?.value;
  store.delete({ name: SIGN_IN_NONCE_COOKIE, path: signInCookiePath(config) });

  // "ביטול" on Google's screen. Not an error — just a no.
  const denied = params.get("error");
  if (denied) return back(request, denied === "access_denied" ? "cancelled" : "failed");

  const code = params.get("code");
  if (!code) return back(request, "failed");

  // ⚠ BOTH HALVES. The signature says we minted this state; the cookie says THIS browser asked for
  // it. Without the second, someone else's finished consent could be loaded here and sign this
  // browser into their account — see signSignInState().
  const state = readSignInState(params.get("state") ?? "", config);
  if (!state || !nonceMatches(state, nonce)) return back(request, "expired");

  let email: string | null;
  try {
    const tokens = await exchangeCode(code, config);
    email = await fetchVerifiedGoogleEmail(tokens.accessToken);
  } catch {
    return back(request, "failed");
  }
  if (!email) return back(request, "unverified");

  const [user] = await db()
    .select({ id: users.id, kind: users.kind, state: users.state })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Saying so is not the leak it would be on the password form: the person has just PROVED the
  // address is theirs, so they are being told about their own account and nobody else's.
  if (!user) return back(request, "no-account");
  // Invited, never joined. The invitation link is what proves the invite reached them and is where
  // they name themselves — the same line signUp() draws.
  if (user.state !== "active") return back(request, "invited");

  await pruneExpiredSessions();
  await createSession(user.id, { remember: state.remember });
  return NextResponse.redirect(new URL(state.next ?? HOME_FOR[user.kind], request.url));
}
