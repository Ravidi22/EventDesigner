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
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import type { OrgKind } from "./kinds";
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
  /** What the organisation IS — a designer's studio or a supplier (lib/auth/kinds.ts). Null for a
   *  client, who belongs to none, and for a studio account that has not named its business yet
   *  (/welcome). Decides which screens exist, never what data a query may see. */
  organizationKind: OrgKind | null;
  email: string;
  name: string | null;
  role: "owner" | "designer" | "crew";
}

const ROLES = new Set(["owner", "designer", "crew"]);

/** A command-line script signed in as one person — the twin of actAsOrgForScript (lib/db/org.ts),
 *  for the actions that ask WHO rather than which studio: the client side has no organisation to
 *  act as (lib/client-portal/verify.ts walks a client's whole round trip through it). Refused in
 *  production; null signs the script out again. */
let scriptUser: string | null = null;
export function actAsUserForScript(userId: string | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("actAsUserForScript is not available in production");
  scriptUser = userId;
}

/** The person a script acts as, read straight from the row — there is no cookie outside a request. */
async function scriptSession(userId: string) {
  const [row] = await db()
    .select({
      id: users.id,
      kind: users.kind,
      organizationId: users.organizationId,
      email: users.email,
      name: users.name,
      role: users.role,
      state: users.state,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** What the organisation is. A row written before organisations had a kind is a studio. */
async function organizationKindOf(organizationId: string): Promise<OrgKind> {
  const [org] = await db()
    .select({ kind: organizations.kind })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org?.kind ?? "studio";
}

/**
 * The signed-in user, or null.
 *
 * `cache()` memoises this for the LIFETIME OF ONE REQUEST — a page that renders the shell, checks
 * the route guard and then runs three server actions asks once, not five times. It is per-request,
 * so it can never serve one user's session to another.
 */
export const currentSession = cache(async (): Promise<Session | null> => {
  // Checked BEFORE headers(): outside a request there is nothing to ask.
  const asUser = scriptUser;
  let user: {
    id: string;
    email: string;
    name: string | null;
    kind?: string;
    organizationId?: string | null;
    role?: string;
    state?: string;
  } | null;
  if (asUser) {
    user = await scriptSession(asUser);
  } else {
    const found = await auth().api.getSession({ headers: await headers() });
    user = found ? (found.user as NonNullable<typeof user>) : null;
  }
  if (!user) return null;
  // A member who was invited but never accepted has a row and no usable account. Belt and braces:
  // lib/auth/auth.ts already refuses to create a session for one.
  if (user.state !== "active") return null;

  const organizationId = user.organizationId ?? null;
  return {
    userId: user.id,
    // Anything but a literal "studio" is a client: the side of the app that grants less.
    kind: user.kind === "studio" ? "studio" : "client",
    organizationId,
    organizationKind: organizationId ? await organizationKindOf(organizationId) : null,
    email: user.email,
    name: user.name || null,
    role: ROLES.has(user.role ?? "") ? (user.role as Session["role"]) : "designer",
  };
});
