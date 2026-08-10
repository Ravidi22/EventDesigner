"use server";
// Sign up, sign in, sign out.
//
// These are the only server actions in the app that do NOT begin with currentOrg() — they are how a
// caller acquires an organisation in the first place. Everything else refuses to run without one.
//
// They return `{ error }` rather than throwing. An unhandled throw in a server action reaches the
// browser as a generic "an error occurred", which is the right amount of detail for a bug and the
// wrong amount for "that password is incorrect" — a person needs to be told which field to fix.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, studioSettings, users } from "@/lib/db/schema";
import { SINGLE_ORG_ID } from "@/lib/db/org";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { createSession, currentSession, destroySession, pruneExpiredSessions, type Session } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthResult {
  /** A Hebrew message to show the person, or absent on success. */
  error?: string;
  /** Which field it belongs under, when it belongs under one. */
  field?: "email" | "password" | "studioName" | "name";
}

/** Emails are compared case-insensitively and stored lowercase: nobody thinks of Noa@studio.co.il
 *  and noa@studio.co.il as two accounts, and the unique index would happily hold both. */
const normalizeEmail = (v: string) => v.trim().toLowerCase();

/** Today, as the SERVER's calendar day. `toISOString().slice(0,10)` would be the UTC day, which is
 *  yesterday for anyone signing up after 9pm in Israel. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A real scrypt hash of a value nobody knows, so verifying against it costs the same as verifying
 *  a real one. Computed once, on first use — not at module load, which would make importing this
 *  file cost 100ms of key derivation on every cold start. */
let dummyHash: string | null = null;
async function noSuchUserHash(): Promise<string> {
  dummyHash ??= await hashPassword(`no-such-user:${Math.random()}${Date.now()}`);
  return dummyHash;
}

export async function signUp(input: {
  studioName: string;
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const studioName = String(input?.studioName ?? "").trim();
  const name = String(input?.name ?? "").trim();
  const email = normalizeEmail(String(input?.email ?? ""));
  const password = String(input?.password ?? "");

  if (!studioName) return { error: "יש להזין שם עסק", field: "studioName" };
  if (!name) return { error: "יש להזין שם מלא", field: "name" };
  if (!EMAIL_RE.test(email)) return { error: "כתובת אימייל לא תקינה", field: "email" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, field: "password" };

  const database = db();
  const [existing] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Sign-UP is the one place an "this email is taken" message is unavoidable — the person has to be
  // told to sign in instead. (Sign-IN never distinguishes; see below.)
  if (existing) return { error: "כבר קיים חשבון עם האימייל הזה", field: "email" };

  const passwordHash = await hashPassword(password);
  const organizationId = await claimOrganization(studioName);

  let userId: string;
  try {
    const [row] = await database
      .insert(users)
      .values({
        organizationId,
        email,
        name,
        // Whoever creates the studio owns it. Everyone after them is invited into it.
        role: "owner",
        state: "active",
        passwordHash,
        joinedAt: today(), // a calendar date, not an instant
      })
      .returning({ id: users.id });
    userId = row.id;
  } catch {
    // The unique index caught a second signup that raced the check above.
    return { error: "כבר קיים חשבון עם האימייל הזה", field: "email" };
  }

  await createSession(userId);
  return {};
}

/**
 * The organisation the new studio will own.
 *
 * Normally: a brand-new one, with its settings row.
 *
 * THE EXCEPTION, and it is a migration convenience with an expiry date: before sign-up existed,
 * every row in this database belonged to one placeholder organisation, because currentOrg() was a
 * constant. A designer who had already drawn a venue and built a catalog would watch all of it
 * vanish the moment accounts arrived, since their new studio is a different organisation. So the
 * FIRST account adopts that placeholder — the data that existed before there were accounts belongs
 * to the first account.
 *
 * Three conditions, all required, because "the first person to sign up gets whatever is lying
 * around" is otherwise a way to walk into someone else's studio:
 *   1. the organisation is the well-known placeholder id, not any organisation that happens to
 *      be empty;
 *   2. it has no users at all, so it has never been claimed;
 *   3. this is not production, where that row should never have been seeded in the first place.
 */
async function claimOrganization(studioName: string): Promise<string> {
  const database = db();

  if (process.env.NODE_ENV !== "production") {
    const [placeholder] = await database
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, SINGLE_ORG_ID))
      .limit(1);
    if (placeholder) {
      const [{ count }] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.organizationId, SINGLE_ORG_ID));
      if (count === 0) {
        await database
          .update(organizations)
          .set({ name: studioName })
          .where(eq(organizations.id, SINGLE_ORG_ID));
        await database
          .insert(studioSettings)
          .values({ organizationId: SINGLE_ORG_ID, businessName: studioName })
          .onConflictDoUpdate({
            target: studioSettings.organizationId,
            set: { businessName: studioName },
          });
        return SINGLE_ORG_ID;
      }
    }
  }

  const [org] = await database
    .insert(organizations)
    .values({ name: studioName })
    .returning({ id: organizations.id });
  await database.insert(studioSettings).values({
    organizationId: org.id,
    businessName: studioName,
  });
  return org.id;
}

export async function signIn(input: { email: string; password: string }): Promise<AuthResult> {
  const email = normalizeEmail(String(input?.email ?? ""));
  const password = String(input?.password ?? "");
  if (!email || !password) return { error: "יש להזין אימייל וסיסמה" };

  const [user] = await db()
    .select({ id: users.id, passwordHash: users.passwordHash, state: users.state })
    .from(users)
    .where(and(eq(users.email, email), eq(users.state, "active")))
    .limit(1);

  // ONE message for both halves, and the hash runs either way. Two different answers would tell a
  // stranger which of your emails are real accounts; skipping the hash when the user is missing
  // would tell them the same thing in milliseconds. So an unknown email is verified against a
  // throwaway hash and takes exactly as long as a wrong password.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await noSuchUserHash()));
  if (!user || !ok) return { error: "האימייל או הסיסמה שגויים", field: "password" };

  await pruneExpiredSessions();
  await createSession(user.id);
  return {};
}

export async function signOut(): Promise<void> {
  await destroySession();
}

/** The signed-in user, for the shell. Null rather than a throw — the shell has to be able to render
 *  the "signed out" state without treating it as a failure. */
export async function currentUser(): Promise<Session | null> {
  return currentSession();
}
