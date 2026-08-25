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

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

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
