"use server";
// Sign up, sign in, sign out.
//
// These are the only server actions in the app that do NOT begin with currentOrg() — they are how a
// caller acquires an organisation in the first place. Everything else refuses to run without one.
//
// They return `{ error }` rather than throwing. An unhandled throw in a server action reaches the
// browser as a generic "an error occurred", which is the right amount of detail for a bug and the
// wrong amount for "that password is incorrect" — a person needs to be told which field to fix.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, studioSettings, users } from "@/lib/db/schema";
import { SINGLE_ORG_ID } from "@/lib/db/org";
import { hashInviteToken } from "./invite-token";
import { HOME_FOR, isAccountKind, type AccountKind } from "./kinds";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { createSession, currentSession, destroySession, pruneExpiredSessions, type Session } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthResult {
  /** A Hebrew message to show the person, or absent on success. */
  error?: string;
  /** Which field it belongs under, when it belongs under one. */
  field?: "email" | "password" | "studioName" | "name";
  /** Where this account belongs, on success. The two kinds land in different halves of the app and
   *  the caller should not have to re-derive which. */
  home?: string;
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
  kind: AccountKind;
  /** Required for a studio; ignored for a client, who has no business to name. */
  studioName?: string;
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  // The kind arrives from a form the person controls, so it is checked against the two values that
  // exist rather than cast — an unrecognised kind must not fall through to a default that grants
  // more than was asked for.
  const kind: AccountKind = isAccountKind(input?.kind) ? input.kind : "client";
  const studioName = String(input?.studioName ?? "").trim();
  const name = String(input?.name ?? "").trim();
  const email = normalizeEmail(String(input?.email ?? ""));
  const password = String(input?.password ?? "");

  if (kind === "studio" && !studioName) return { error: "יש להזין שם עסק", field: "studioName" };
  if (!name) return { error: "יש להזין שם מלא", field: "name" };
  if (!EMAIL_RE.test(email)) return { error: "כתובת אימייל לא תקינה", field: "email" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, field: "password" };

  const database = db();
  const [existing] = await database
    .select({ id: users.id, state: users.state, inviteTokenHash: users.inviteTokenHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Sign-UP is the one place an "this email is taken" message is unavoidable — the person has to be
  // told to sign in instead. (Sign-IN never distinguishes; see below.)
  //
  // The invited case gets its own sentence, and it is not politeness: an invitation writes a real
  // row for an address whose owner has no password yet, so without this they would be refused here
  // AND at sign-in, with a message telling them to do the thing they were just refused. They are
  // not turned into an account holder here either — the link is what proves the invitation reached
  // the person it was addressed to, and claiming a seat by knowing an email address is not proof.
  if (existing) {
    return {
      error:
        existing.state === "pending" && existing.inviteTokenHash
          ? "הכתובת הזו הוזמנה לסטודיו — הצטרפו דרך קישור ההזמנה שקיבלתם"
          : "כבר קיים חשבון עם האימייל הזה",
      field: "email",
    };
  }

  const passwordHash = await hashPassword(password);
  // A client creates NO organisation. They own nothing here — an organisation for a client would be
  // an empty studio nobody works in, and a tenant boundary that means nothing is worse than none.
  const organizationId = kind === "studio" ? await claimOrganization(studioName) : null;

  let userId: string;
  try {
    const [row] = await database
      .insert(users)
      .values({
        organizationId,
        kind,
        email,
        name,
        // Whoever creates the studio owns it; everyone after them is invited into it. For a client
        // the column is meaningless — they are not on this ladder — so it keeps its default and
        // nothing reads it.
        role: "owner",
        state: "active",
        passwordHash,
        // The day they joined the STUDIO. A client joined no studio, so it stays null rather than
        // recording a date about a thing that did not happen.
        joinedAt: kind === "studio" ? today() : null,
      })
      .returning({ id: users.id });
    userId = row.id;
  } catch {
    // The unique index caught a second signup that raced the check above. One email, one account,
    // across both kinds — which is deliberate: a designer who is also somebody's client is one
    // person, and two rows would be two passwords to keep in step.
    return { error: "כבר קיים חשבון עם האימייל הזה", field: "email" };
  }

  await createSession(userId);
  return { home: HOME_FOR[kind] };
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
    .select({ id: users.id, kind: users.kind, passwordHash: users.passwordHash, state: users.state })
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
  // ONE sign-in form for both kinds, on purpose. Which half of the app you belong to is a fact
  // about your account, not a thing to make you declare at the door — and a chooser on the sign-in
  // screen would be a way to ask "does this email belong to a designer?" without a password.
  return { home: HOME_FOR[user.kind] };
}

/**
 * What the join screen shows before anyone types: which studio, and which address was invited.
 *
 * Returns null for a token that is wrong, expired or already used — the screen shows one "this link
 * is no longer valid" state for all three, because telling a stranger which of those it is turns
 * this into a way to test tokens.
 *
 * The email is returned and NOT editable on that screen: the invitation was addressed to it, and an
 * editable address would let whoever holds the link join under any address they like.
 */
export async function inviteInfo(
  token: string,
): Promise<{ email: string; name: string | null; studioName: string } | null> {
  const value = String(token ?? "");
  if (!value) return null;

  const [row] = await db()
    .select({ email: users.email, name: users.name, studioName: organizations.name })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(
      and(
        eq(users.inviteTokenHash, hashInviteToken(value)),
        eq(users.state, "pending"),
        gt(users.inviteExpiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Claim an invitation: set a password, become active, and land signed in.
 *
 * The whole thing is ONE conditional UPDATE. The conditions — this token, still pending, not yet
 * expired — are in the WHERE clause rather than in an `if` after a SELECT, so two people opening
 * the same link at the same moment cannot both succeed: the first update flips `state` and clears
 * the hash, and the second matches no rows.
 */
export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AuthResult> {
  const token = String(input?.token ?? "");
  const name = String(input?.name ?? "").trim();
  const password = String(input?.password ?? "");

  if (!token) return { error: "קישור ההזמנה אינו תקין" };
  if (!name) return { error: "יש להזין שם מלא", field: "name" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, field: "password" };

  const passwordHash = await hashPassword(password);
  const [row] = await db()
    .update(users)
    .set({
      name,
      passwordHash,
      state: "active",
      joinedAt: today(),
      // The link is spent. A used invitation must not still be a way into the account it created.
      inviteTokenHash: null,
      inviteExpiresAt: null,
    })
    .where(
      and(
        eq(users.inviteTokenHash, hashInviteToken(token)),
        eq(users.state, "pending"),
        gt(users.inviteExpiresAt, new Date()),
      ),
    )
    .returning({ id: users.id, kind: users.kind });

  if (!row) return { error: "קישור ההזמנה פג או כבר נוצל. בקשו מהסטודיו קישור חדש." };

  await createSession(row.id);
  return { home: HOME_FOR[row.kind] };
}

export async function signOut(): Promise<void> {
  await destroySession();
}

/** The signed-in user, for the shell. Null rather than a throw — the shell has to be able to render
 *  the "signed out" state without treating it as a failure. */
export async function currentUser(): Promise<Session | null> {
  return currentSession();
}
