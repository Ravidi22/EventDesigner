// Where Google sends the browser back after consent.
//
// WHY THIS IS A ROUTE HANDLER AND NOT A SERVER ACTION: Google redirects a BROWSER here with the
// code in the query string — a plain GET navigation. A server action is a POST that only React can
// dispatch, so there is nothing for Google to redirect to. This is the only route handler the
// feature adds, and it does the least it can: validate, delegate to lib/google/sync.ts, redirect.
//
// EVERY EXIT IS A REDIRECT BACK TO SETTINGS, never a JSON body or an error page. The person at the
// other end of this URL is a designer who just clicked "אישור" on a Google screen; what they need is
// to land back where they started with a line telling them what happened. `?google=` carries that.
import { NextResponse } from "next/server";
import { AUTH_BASE_PATH, auth, authOrigin } from "@/lib/auth/auth";
import { currentSession } from "@/lib/auth/session";
import { googleConfig } from "@/lib/google/config";
import { readState } from "@/lib/google/oauth";
import { completeConnect, pushAllAppointments } from "@/lib/google/sync";
import { revalidateAppointments, revalidateSettings } from "@/lib/db/revalidate";

/** Back to the settings screen, on the calendar section, with an outcome to render. */
function back(request: Request, outcome: string): NextResponse {
  const url = new URL("/settings", request.url);
  url.searchParams.set("google", outcome);
  url.hash = "calendar";
  return NextResponse.redirect(url);
}

/** Better Auth's Google callback, answered in place: same query, same cookies, its redirect back. */
function handToSignIn(request: Request): Promise<Response> {
  const search = new URL(request.url).search;
  return auth().handler(
    new Request(`${authOrigin()}${AUTH_BASE_PATH}/callback/google${search}`, { method: "GET", headers: request.headers }),
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  // TWO flows come home through this one URL, because it is the one redirect URI the Cloud project
  // has registered: a calendar being connected by someone signed in, and "המשך עם Google" from the
  // sign-in screen, by someone who is not. They are told apart by the shape of the state: the
  // calendar signs its own (lib/google/oauth.ts, `<payload>.<signature>`), while Better Auth's is a
  // random string with no dot. The sign-in is handed to Better Auth's own callback, which checks the
  // state against the cookie it set and the row it stored. Everything below is the calendar's.
  if (!(params.get("state") ?? "").includes(".")) return handToSignIn(request);

  // The designer pressed "ביטול" on Google's consent screen. Not an error — just a no.
  const denied = params.get("error");
  if (denied) return back(request, denied === "access_denied" ? "cancelled" : "failed");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back(request, "failed");

  const config = googleConfig();
  if (!config) return back(request, "unconfigured");

  // ⚠ BOTH CHECKS, AND BOTH MATTER. The session says who is asking; the state says who STARTED the
  // flow. Comparing them is what stops the attack this parameter exists for — an attacker who
  // completes consent with their own Google account and then gets a designer to load the resulting
  // callback URL, after which the studio's diary, client names and phone numbers included, would be
  // pushed into a stranger's calendar. See signState() in lib/google/oauth.ts.
  const session = await currentSession();
  if (!session || session.kind !== "studio" || !session.organizationId) return back(request, "signed-out");

  const startedBy = readState(state, config);
  if (!startedBy || startedBy !== session.userId) return back(request, "mismatch");

  const result = await completeConnect(session.userId, session.organizationId, code);
  if (!result.ok) return back(request, "failed");

  revalidateSettings();
  revalidateAppointments();

  // Fill the new calendar before the designer goes looking at it. AWAITED rather than deferred to
  // `after()`: this is a redirect, so there is no rendered screen waiting on it, and a designer who
  // opens Google Calendar the moment this lands should find their meetings already there rather
  // than an empty calendar that fills in a few seconds later.
  await pushAllAppointments(session.organizationId).catch(() => {
    // A failed first push is recorded on the connection (lastError) and retried by the next write.
    // It must not turn a successful connection into a "failed" message.
  });

  return back(request, "connected");
}
