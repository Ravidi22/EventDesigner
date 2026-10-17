// Who is signed in, on this request.
//
// ⚠ SERVER ONLY. This decides what data a request may see; a session check that runs in the browser
// is a session check the browser can edit.
//
// THE SEAM. Everything above this file — currentOrg(), the layout guards, the file route, the client
// portal — asks currentSession() and gets the same small Session shape it always did. What answers
// it is Better Auth (lib/auth/auth.ts): a signed session cookie naming a row in auth_sessions, joined
// to users. Sessions are still rows, so revoking one is still deleting it.
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";

/** Who the request is. Deliberately small: the fields every server action needs to answer "may you"
 *  and "which studio", and nothing that would go stale between sign-in and now. */
export interface Session {
  userId: string;
  /** studio = a designer or supplier; client = someone whose event is being designed. */
  kind: "studio" | "client";
  /** ⚠ NULL for a client — they belong to no studio. Anything scoping data by organisation must
   *  therefore treat this as a REQUIREMENT and not an optional field; see currentOrg(). */
  organizationId: string | null;
  email: string;
  name: string | null;
  role: "owner" | "designer" | "crew";
}

const ROLES = new Set(["owner", "designer", "crew"]);

/**
 * The signed-in user, or null.
 *
 * `cache()` memoises this for the LIFETIME OF ONE REQUEST — a page that renders the shell, checks
 * the route guard and then runs three server actions asks once, not five times. It is per-request,
 * so it can never serve one user's session to another.
 */
export const currentSession = cache(async (): Promise<Session | null> => {
  const found = await auth().api.getSession({ headers: await headers() });
  if (!found) return null;
  const user = found.user as typeof found.user & {
    kind?: string;
    organizationId?: string | null;
    role?: string;
    state?: string;
  };
  // A member who was invited but never accepted has a row and no usable account. Belt and braces:
  // lib/auth/auth.ts already refuses to create a session for one.
  if (user.state !== "active") return null;

  return {
    userId: user.id,
    // Anything but a literal "studio" is a client: the side of the app that grants less.
    kind: user.kind === "studio" ? "studio" : "client",
    organizationId: user.organizationId ?? null,
    email: user.email,
    name: user.name || null,
    role: ROLES.has(user.role ?? "") ? (user.role as Session["role"]) : "designer",
  };
});
