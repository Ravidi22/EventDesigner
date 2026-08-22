// Who is signed in, and on what browser.
//
// ⚠ SERVER ONLY. This decides what data a request may see; a session check that runs in the browser
// is a session check the browser can edit.
//
// THE SHAPE: the cookie carries a random 256-bit token and nothing else — no user id, no
// organisation, no claims. Everything about the caller is looked up from the row that token names.
// A self-contained token (a JWT with the org inside it) would save this query and cost the ability
// to revoke: it stays valid until it expires no matter what happens on this end, so "sign out
// everywhere", "remove this person from the studio" and "that laptop was stolen" all become
// aspirations. One indexed lookup on a request that is about to make several is the wrong thing to
// optimise away.
//
// The DATABASE stores only a hash of the token. The browser's cookie is the one copy of the secret,
// so a leaked dump cannot be replayed as a login.
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { SESSION_COOKIE as COOKIE } from "./cookie-name";

const TTL_DAYS = 30;

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

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Start a session for `userId` and set the cookie.
 *
 * ⚠ Only callable from a Server Action or Route Handler — a Server Component cannot set a cookie,
 * because by the time it renders the response headers are already on their way.
 */
export async function createSession(userId: string): Promise<void> {
  // 256 bits from the CSPRNG. base64url so it survives a cookie header without escaping.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  await db().insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });

  const store = await cookies();
  store.set(COOKIE, token, {
    // The browser must never hand this to JavaScript: httpOnly is what keeps one XSS bug from
    // becoming a stolen account.
    httpOnly: true,
    // Sent on top-level navigations back to us, never on a cross-site POST — CSRF cover for the
    // server actions, which are POST endpoints.
    sameSite: "lax",
    // HTTPS only in production. Not in development, where the dev server is plain http and a
    // `secure` cookie would simply never be stored.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * The signed-in user, or null.
 *
 * `cache()` memoises this for the LIFETIME OF ONE REQUEST — a page that renders the shell, checks
 * the route guard and then runs three server actions asks the database once, not five times. It is
 * per-request, so it can never serve one user's session to another.
 */
export const currentSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const [row] = await db()
    .select({
      userId: users.id,
      kind: users.kind,
      organizationId: users.organizationId,
      email: users.email,
      name: users.name,
      role: users.role,
      state: users.state,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;
  // A member who was invited but never accepted has a row and no usable account. Belt and braces —
  // they also have no password, so they cannot have got a token in the first place.
  if (row.state !== "active") return null;

  return {
    userId: row.userId,
    kind: row.kind,
    organizationId: row.organizationId,
    email: row.email,
    name: row.name,
    role: row.role,
  };
});

/** End this browser's session: delete the row, then the cookie. In that order — if the second half
 *  fails, the user is still signed out everywhere that matters, and a cookie naming a session that
 *  no longer exists is simply not a session. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  store.delete(COOKIE);
}

/** Sweep sessions that have already expired. Called on sign-in — the one moment a user is already
 *  waiting on a deliberately slow hash, so the work is free — rather than on a schedule this app
 *  has nowhere to run. Expired rows are already refused by currentSession(); this only stops the
 *  table growing forever. */
export async function pruneExpiredSessions(): Promise<void> {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/**
 * Sign this user out EVERYWHERE ELSE, keeping the browser that asked.
 *
 * What a password change is for, in practice: someone believes another person has their password.
 * Changing it while that person's session stays alive answers the fear without addressing it —
 * their cookie is a bearer token and keeps working until it expires.
 *
 * The current browser is spared by its token, not by trusting a caller-supplied id: this reads the
 * cookie itself, so there is no way for one user's request to name another user's session as the
 * one to keep. A caller with no cookie at all revokes every session, which is the safe direction to
 * fail in.
 *
 * @returns how many sessions ended, so the screen can say "you were signed out on 2 other devices".
 */
export async function revokeOtherSessions(userId: string): Promise<number> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  const mine = token ? hashToken(token) : null;

  const removed = await db()
    .delete(sessions)
    .where(mine ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, mine)) : eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return removed.length;
}

export { SESSION_COOKIE } from "./cookie-name";
