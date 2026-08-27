// The server-side gates the routes sit behind.
//
// ⚠ SERVER ONLY.
//
// There are two worlds in this app and they do not overlap. The studio side — the shell, the
// meeting flow, /present — belongs to designers and suppliers. The client side belongs to the
// couple whose event it is. Sending the wrong person to either is not a cosmetic mistake: the
// studio side shows a whole business's clients and prices.
//
// Being outside the (app) route group is a RENDERING decision (no sidebar on a screen the client
// watches), never a permission one — which is why /meeting and /present call requireStudio()
// themselves rather than relying on where they sit in the tree.
import { redirect } from "next/navigation";
import { currentSession, type Session } from "./session";

// ⚠ A LAYOUT'S GUARD DOES NOT GATE ITS PAGES. Layouts and pages render in PARALLEL — the router
// does not wait for (app)/layout.tsx to resolve before it starts (app)/dashboard/page.tsx. So a
// page that reads on the server begins its queries while the layout is still deciding whether this
// person may see anything at all, and for a signed-out visitor currentOrg() throws "not signed in"
// out of a page whose response is already a redirect to /login. The redirect still wins; what is
// left is an unhandled error in the log for what is simply a signed-out visit, and a page whose
// correctness depends on which of two racing promises settles first.
//
// The cure is one line at the top of every page that fetches: await the guard before the reads.
// It costs NOTHING — currentSession() is React-cache()d for the request, so the page's await
// resolves off the very promise the layout already has in flight, and the same redirect happens
// from the page instead of an exception.

/** Signed in, as anyone. */
export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}

/** A designer or supplier. A signed-in CLIENT is sent to their own side rather than to /login —
 *  they are not unauthenticated, they are simply somewhere that was never theirs, and bouncing them
 *  to a sign-in form they have already completed is how a redirect loop starts. */
export async function requireStudio(): Promise<Session> {
  const session = await requireSession();
  if (session.kind !== "studio") redirect("/client");
  return session;
}

/** A client. The mirror image: a designer who lands here goes back to their dashboard. */
export async function requireClient(): Promise<Session> {
  const session = await requireSession();
  if (session.kind !== "client") redirect("/dashboard");
  return session;
}
