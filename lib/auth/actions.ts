"use server";
// Sign up, sign in, sign out, reset — the account screens' actions.
//
// These are the only server actions in the app that do NOT begin with currentOrg() — they are how a
// caller acquires an organisation in the first place. Everything else refuses to run without one.
//
// THE CREDENTIAL WORK IS BETTER AUTH'S (lib/auth/auth.ts): hashing, sessions, verification and reset
// tokens, the rate limit. What stays here is what is ours: the Hebrew messages, which field an error
// belongs under, the studio a sign-up creates, the invitation a member accepts. Every credential
// call goes through callAuth (lib/auth/auth-call.ts) — the router, so the rate limit applies.
//
// They return `{ error }` rather than throwing. An unhandled throw in a server action reaches the
// browser as a generic "an error occurred", which is the right amount of detail for a bug and the
// wrong amount for "that password is incorrect" — a person needs to be told which field to fix.
import { and, eq, gt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkRedirectUri, googleConfig } from "@/lib/google/config";
import { redirectUriBlocks } from "@/lib/google/types";
import { emailEnabled } from "@/lib/email/config";
import { installStandardCatalog } from "@/lib/catalog/standard/install";
import { revalidateSettings } from "@/lib/db/revalidate";
import { authAccounts, eventClients, events, organizations, studioSettings, users } from "@/lib/db/schema";
import { SINGLE_ORG_ID } from "@/lib/db/org";
import { notify, studioRecipients } from "@/lib/notifications/write";
import { callAuth } from "./auth-call";
import { hashInviteToken } from "./invite-token";
import { HOME_FOR, ORG_HOME, isOrgKind, type AccountKind, type OrgKind } from "./kinds";
import { hashPassword, passwordProblem } from "./password";
import { currentSession, type Session } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthResult {
  /** A Hebrew message to show the person, or absent on success. */
  error?: string;
  /** Which field it belongs under, when it belongs under one. */
  field?: "email" | "password" | "studioName" | "name" | "phone";
  /** Where this account belongs, on success. The two kinds land in different halves of the app and
   *  the caller should not have to re-derive which. */
  home?: string;
  /** The account exists but the address is not confirmed yet: a verification mail is on its way,
   *  and there is no session until it is clicked. */
  verifyEmail?: boolean;
}

const TOO_MANY = "יותר מדי ניסיונות. נסו שוב בעוד דקה.";

/** Emails are compared case-insensitively and stored lowercase: nobody thinks of Noa@studio.co.il
 *  and noa@studio.co.il as two accounts, and the unique index would happily hold both. */
const normalizeEmail = (v: string) => v.trim().toLowerCase();

/** A path on this site to go to after signing in, or null. Never another origin: `//evil.com` and
 *  `/\evil.com` are both read by browsers as a different host. */
function safeNext(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : null;
}

/** Today, as the SERVER's calendar day. `toISOString().slice(0,10)` would be the UTC day, which is
 *  yesterday for anyone signing up after 9pm in Israel. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type AuthUser = { id: string; kind?: string };

/** Where a new studio account goes until it has named its business (app/welcome). */
const WELCOME = "/welcome";

/** Where this account lands after signing in: the client side, a designer's dashboard, or a
 *  supplier's order inbox. Read from the rows rather than guessed from the account kind alone. */
async function homeOf(userId: string): Promise<string> {
  const [row] = await db()
    .select({ kind: users.kind, orgKind: organizations.kind })
    .from(users)
    .leftJoin(organizations, eq(organizations.id, users.organizationId))
    .where(eq(users.id, userId))
    .limit(1);
  return row?.kind === "studio" ? ORG_HOME[row.orgKind ?? "studio"] : HOME_FOR.client;
}

/**
 * Open a studio account: a person, and nothing else yet.
 *
 * SIGN-UP IS FOR STUDIOS ONLY. An event owner comes in through their designer's invitation, which
 * is what attaches them to their event; an open client sign-up would land on an empty portal. And
 * the business itself (its name, phone, the organisation, the base catalog) is created on
 * /welcome, after the account exists — so this form is three fields, and the person who abandons
 * it halfway has created nothing.
 */
export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  /** "זכור אותי", as on the sign-in form. Anything but a literal true is a no. */
  remember?: boolean;
}): Promise<AuthResult> {
  const name = String(input?.name ?? "").trim();
  const email = normalizeEmail(String(input?.email ?? ""));
  const password = String(input?.password ?? "");

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
  // Sign-UP is the one place an "this email is taken" message is allowed — the person has to be
  // told to sign in instead. (Sign-IN never distinguishes.)
  //
  // The invited case gets its own sentence: an invitation writes a real row for an address whose
  // owner has no password yet, so without this they would be refused here AND at sign-in. They are
  // not turned into an account holder here either — the link is what proves the invitation reached
  // the person it was addressed to, and claiming a seat by knowing an email address is not proof.
  if (existing) {
    return {
      error:
        existing.state === "pending" && existing.inviteTokenHash
          ? "הכתובת הזו קיבלה הזמנה. הצטרפו דרך קישור ההזמנה שקיבלתם"
          : "כבר קיים חשבון עם האימייל הזה",
      field: "email",
    };
  }

  const created = await callAuth<{ token: string | null; user: AuthUser }>("/sign-up/email", {
    name,
    email,
    password,
    rememberMe: input?.remember === true,
    // Where the verification link lands, when mail requires one.
    callbackURL: WELCOME,
  });
  if (!created.ok) {
    if (created.status === 429) return { error: TOO_MANY };
    if (created.code?.startsWith("USER_ALREADY_EXISTS")) return { error: "כבר קיים חשבון עם האימייל הזה", field: "email" };
    return { error: "ההרשמה נכשלה. נסו שוב." };
  }
  const userId = created.data.user.id;

  // Better Auth wrote the person; what they ARE is ours to write. A studio account with no
  // organisation yet: the (app) layout sends it to /welcome until it has one.
  await database.update(users).set({ kind: "studio", role: "owner", state: "active" }).where(eq(users.id, userId));

  // With mail configured, the address must be confirmed before there is a session.
  if (!created.data.token) return { verifyEmail: true };
  return { home: WELCOME };
}

/**
 * /welcome: name the business, and the studio comes into being — its organisation, its settings
 * row, its owner, and a catalog that already knows what an עגול 180 is (lib/catalog/standard).
 *
 * The business is a designer's studio or a supplier (lib/auth/kinds.ts, `orgKind`) — asked here,
 * not on the sign-up form, because it is a fact about the business and the sign-up opens a person.
 *
 * Only for a signed-in studio account that has no organisation yet; anyone else is refused, so this
 * cannot be used to move an existing member into a new studio of their own.
 */
export async function completeOnboarding(input: {
  studioName: string;
  phone?: string;
  /** A designer's studio (the default) or a supplier. Checked, never cast — it arrives from a form. */
  orgKind?: OrgKind;
}): Promise<AuthResult> {
  const session = await currentSession();
  if (!session) return { error: "יש להתחבר מחדש" };
  if (session.kind !== "studio") throw new Error("only a studio account opens a studio");
  if (session.organizationId) return { home: ORG_HOME[session.organizationKind ?? "studio"] };

  const orgKind: OrgKind = isOrgKind(input?.orgKind) ? input.orgKind : "studio";
  const studioName = String(input?.studioName ?? "").trim();
  const phone = String(input?.phone ?? "").trim();
  if (!studioName) return { error: "יש להזין שם עסק", field: "studioName" };
  if (studioName.length > 120) return { error: "השם ארוך מדי", field: "studioName" };
  if (phone.length > 40) return { error: "מספר טלפון לא תקין", field: "phone" };

  const organizationId = await claimOrganization(studioName, orgKind);
  const database = db();
  // Conditional on "still has no organisation", so two tabs pressing המשך cannot attach one person
  // to two studios: the second update matches nothing.
  const [claimed] = await database
    .update(users)
    .set({ organizationId, role: "owner", joinedAt: today() })
    .where(and(eq(users.id, session.userId), sql`${users.organizationId} is null`))
    .returning({ id: users.id });
  if (!claimed) return { home: await homeOf(session.userId) };

  await database
    .update(studioSettings)
    .set({ ownerName: session.name ?? "", phone })
    .where(eq(studioSettings.organizationId, organizationId));

  // BEST-EFFORT: the studio is real, and refusing someone their studio over a shelf of furniture
  // is the wrong trade. `npm run catalog:standard` is the retry, and it is idempotent.
  // A supplier gets none of it: the base tables are a DESIGNER's shelf (every hall's 1.80 round),
  // and a supplier's catalog is what they sell, published row by row.
  if (orgKind === "studio") {
    try {
      await installStandardCatalog(organizationId);
    } catch (error) {
      console.error("standard catalog install failed for", organizationId, error);
    }
  }
  revalidateSettings();
  return { home: ORG_HOME[orgKind] };
}

/**
 * The organisation the new studio will own.
 *
 * Normally: a brand-new one, with its settings row.
 *
 * THE EXCEPTION, and it is a migration convenience with an expiry date: before sign-up existed,
 * every row in this database belonged to one placeholder organisation. So the FIRST account adopts
 * that placeholder — the data that existed before there were accounts belongs to the first account.
 * Three conditions, all required: the well-known placeholder id, no users in it yet, and not
 * production, where that row should never have been seeded.
 */
async function claimOrganization(studioName: string, kind: OrgKind): Promise<string> {
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
        await database.update(organizations).set({ name: studioName, kind }).where(eq(organizations.id, SINGLE_ORG_ID));
        await database
          .insert(studioSettings)
          .values({ organizationId: SINGLE_ORG_ID, businessName: studioName })
          .onConflictDoUpdate({ target: studioSettings.organizationId, set: { businessName: studioName } });
        return SINGLE_ORG_ID;
      }
    }
  }

  const [org] = await database.insert(organizations).values({ name: studioName, kind }).returning({ id: organizations.id });
  await database.insert(studioSettings).values({ organizationId: org.id, businessName: studioName });
  return org.id;
}

export async function signIn(input: {
  email: string;
  password: string;
  /** "זכור אותי". Anything but a literal true is a no — this arrives from a form. */
  remember?: boolean;
}): Promise<AuthResult> {
  const email = normalizeEmail(String(input?.email ?? ""));
  const password = String(input?.password ?? "");
  if (!email || !password) return { error: "יש להזין אימייל וסיסמה" };

  // ONE message for an unknown address and a wrong password, and Better Auth hashes the password
  // either way, so the two take equally long. Telling them apart would tell a stranger which emails
  // are accounts here.
  const result = await callAuth<{ user: AuthUser }>("/sign-in/email", {
    email,
    password,
    rememberMe: input?.remember === true,
  });
  if (!result.ok) {
    if (result.status === 429) return { error: TOO_MANY };
    // Only reachable with the RIGHT password, so it says nothing to someone guessing.
    if (result.code === "EMAIL_NOT_VERIFIED") {
      return { error: "צריך לאשר את כתובת האימייל. שלחנו אליה קישור אימות.", field: "email" };
    }
    return { error: "האימייל או הסיסמה שגויים", field: "password" };
  }

  // ONE sign-in form for both kinds, on purpose. Which half of the app you belong to is a fact
  // about your account, not a thing to make you declare at the door.
  return { home: await homeOf(result.data.user.id) };
}

/**
 * The same sign-in, for the form posting ITSELF — the path taken when the page's script never ran.
 * It answers with a redirect either way: onward, or back to the form with `?error=` to explain.
 */
export async function signInFromForm(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  const result = await signIn({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    remember: formData.get("remember") === "on",
  });
  if (result.error) {
    const query = new URLSearchParams({ error: "credentials" });
    if (next) query.set("next", next);
    redirect(`/login?${query}`);
  }
  redirect(next ?? result.home ?? "/dashboard");
}

/**
 * Begin "המשך עם Google": Better Auth mints the state (and its cookie) and hands back Google's URL.
 *
 * It signs in only an account that already exists for that verified address (disableImplicitSignUp
 * in lib/auth/auth.ts). Refused before the browser leaves when the callback cannot be reached from
 * here — Google would take the person through consent and then strand them.
 */
export async function startGoogleSignIn(input: {
  remember?: boolean;
  next?: string | null;
}): Promise<{ url: string } | { error: string }> {
  const config = googleConfig();
  if (!config || redirectUriBlocks(checkRedirectUri(config))) {
    return { error: "כניסה עם Google אינה זמינה כאן. התחברו עם אימייל וסיסמה." };
  }
  const result = await callAuth<{ url?: string }>("/sign-in/social", {
    provider: "google",
    // A client lands on /dashboard and the layout sends them on to /client — one hop, the same
    // one the old flow took, because the kind is not known until Google says who this is.
    callbackURL: safeNext(input?.next) ?? "/dashboard",
    errorCallbackURL: "/login",
    disableRedirect: true,
  });
  if (!result.ok || !result.data.url) {
    return { error: result.ok || result.status !== 429 ? "הכניסה עם Google נכשלה. נסו שוב." : TOO_MANY };
  }
  return { url: result.data.url };
}

/**
 * What the join screen shows before anyone types: which studio, and which address was invited.
 *
 * Returns null for a token that is wrong, expired or already used — one "this link is no longer
 * valid" state for all three, because telling a stranger which it is turns this into a token test.
 * The email is returned and NOT editable: the invitation was addressed to it.
 */
export async function inviteInfo(
  token: string,
): Promise<{ email: string; name: string | null; studioName: string; kind: AccountKind } | null> {
  const value = String(token ?? "");
  if (!value) return null;

  const database = db();
  const [row] = await database
    .select({ id: users.id, email: users.email, name: users.name, kind: users.kind, studioName: organizations.name })
    .from(users)
    // LEFT: an event owner belongs to no studio; their inviting studio is the one whose event it is.
    .leftJoin(organizations, eq(organizations.id, users.organizationId))
    .where(
      and(
        eq(users.inviteTokenHash, hashInviteToken(value)),
        eq(users.state, "pending"),
        gt(users.inviteExpiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.kind === "studio") {
    return row.studioName ? { email: row.email, name: row.name, studioName: row.studioName, kind: "studio" } : null;
  }
  const [shared] = await database
    .select({ studioName: organizations.name })
    .from(eventClients)
    .innerJoin(events, eq(events.id, eventClients.eventId))
    .innerJoin(organizations, eq(organizations.id, events.organizationId))
    .where(eq(eventClients.userId, row.id))
    .limit(1);
  // An invited client with no event shared any more has nothing to join.
  return shared ? { email: row.email, name: row.name, studioName: shared.studioName, kind: "client" } : null;
}

/**
 * Claim an invitation: set a password, become active, and land signed in.
 *
 * The claim is ONE conditional UPDATE — this token, still pending, not yet expired are in the WHERE
 * clause — so two people opening the same link at the same moment cannot both succeed. The password
 * goes in as Better Auth's credential account in the same transaction. The link proved the address
 * reached its owner, so the email counts as verified.
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
  const claimed = await db().transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        name,
        state: "active",
        emailVerified: true,
        // The day they joined a STUDIO; an event owner joined none.
        joinedAt: sql`case when ${users.kind} = 'studio' then ${today()}::date else null end`,
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
      .returning({ id: users.id, kind: users.kind, email: users.email });
    if (!row) return null;
    await tx.insert(authAccounts).values({
      userId: row.id,
      accountId: row.id,
      providerId: "credential",
      password: passwordHash,
    });
    return row;
  });

  if (!claimed) return { error: "קישור ההזמנה פג או כבר נוצל. בקשו מהסטודיו קישור חדש." };

  // A client joining is news for the studio that shared with them — the designer sent a link over
  // WhatsApp and otherwise has no way to know it was opened. One line per event, to each studio's
  // owner and designers.
  if (claimed.kind === "client") {
    const shared = await db()
      .select({ eventId: events.id, organizationId: events.organizationId, clientName: events.clientName })
      .from(eventClients)
      .innerJoin(events, eq(events.id, eventClients.eventId))
      .where(eq(eventClients.userId, claimed.id));
    for (const e of shared) {
      await notify(await studioRecipients(e.organizationId), {
        kind: "client.joined",
        organizationId: e.organizationId,
        eventId: e.eventId,
        payload: { actorName: name, eventLabel: e.clientName },
      });
    }
  }

  // Through the ordinary sign-in, so the session is Better Auth's and nothing here mints one.
  const signedIn = await callAuth("/sign-in/email", { email: claimed.email, password, rememberMe: true });
  if (!signedIn.ok) return { error: "ההצטרפות הושלמה. התחברו עם האימייל והסיסמה שבחרתם." };
  return { home: await homeOf(claimed.id) };
}

export async function signOut(): Promise<void> {
  await callAuth("/sign-out", {});
}

/**
 * Change your own password. Requires the current one — a session cookie is a bearer token, so a
 * borrowed laptop must not be enough to lock the owner out — and signs out every OTHER session,
 * because changing a password is what a person does when they think someone else has it.
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AuthResult> {
  const session = await currentSession();
  if (!session) return { error: "יש להתחבר מחדש" };

  const currentPassword = String(input?.currentPassword ?? "");
  const newPassword = String(input?.newPassword ?? "");
  if (!currentPassword) return { error: "יש להזין את הסיסמה הנוכחית", field: "password" };
  const problem = passwordProblem(newPassword);
  if (problem) return { error: problem, field: "password" };
  if (newPassword === currentPassword) return { error: "הסיסמה החדשה זהה לנוכחית", field: "password" };

  const result = await callAuth("/change-password", { currentPassword, newPassword, revokeOtherSessions: true });
  if (!result.ok) {
    if (result.status === 429) return { error: TOO_MANY };
    if (result.code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
      return { error: "לחשבון הזה אין סיסמה: הוא נכנס עם Google.", field: "password" };
    }
    return { error: "הסיסמה הנוכחית שגויה", field: "password" };
  }
  return {};
}

/**
 * "שכחתי סיסמה". ALWAYS the same answer, whether or not the address has an account — the mail
 * itself is the only place the difference shows (lib/auth/auth.ts sends it, after the response).
 */
export async function requestPasswordReset(input: { email: string }): Promise<{ ok: true } | { error: string }> {
  if (!emailEnabled()) return { error: "איפוס סיסמה במייל אינו זמין כרגע. פנו לבעלי הסטודיו." };
  const email = normalizeEmail(String(input?.email ?? ""));
  if (!EMAIL_RE.test(email)) return { error: "כתובת אימייל לא תקינה" };
  const result = await callAuth("/request-password-reset", { email, redirectTo: "/reset" });
  if (!result.ok && result.status === 429) return { error: TOO_MANY };
  return { ok: true };
}

/** Set a new password from a reset link. Every session of the account ends (revokeSessionsOnPasswordReset). */
export async function resetPassword(input: { token: string; password: string }): Promise<AuthResult> {
  const token = String(input?.token ?? "");
  const password = String(input?.password ?? "");
  if (!token) return { error: "הקישור אינו תקין" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, field: "password" };

  const result = await callAuth("/reset-password", { token, newPassword: password });
  if (!result.ok) {
    if (result.status === 429) return { error: TOO_MANY };
    return { error: "הקישור פג או כבר נוצל. בקשו קישור חדש." };
  }
  return { home: "/login?reset=done" };
}

/** The signed-in user, for the shell. Null rather than a throw — the shell has to be able to render
 *  the "signed out" state without treating it as a failure. */
export async function currentUser(): Promise<Session | null> {
  return currentSession();
}
