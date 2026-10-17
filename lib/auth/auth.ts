// Who a person is and how they prove it: Better Auth, configured for this app.
//
// WHAT IT OWNS: passwords, sessions, email verification, password reset, Google sign-in, and the
// rate limit on all of them. WHAT IT DOES NOT: roles, tenancy, venue grants — those stay in our own
// tables and in lib/db/org.ts (docs/02, ADR-10). Nothing above lib/auth/session.ts learns that this
// file exists: currentSession() still returns the same Session shape it always did.
//
// THE CHOICES THAT ARE NOT DEFAULTS, and why:
//   - users IS Better Auth's user table (schema mapping below). A person is one row; every foreign
//     key in the schema keeps pointing at users.id; kind/role/organizationId/state ride along as
//     server-owned fields nobody can set from a form (input: false).
//   - The password hash is OURS (lib/auth/password.ts): the same scrypt format the existing accounts
//     already hold, so nobody is forced to reset on the day this landed.
//   - Verification identifiers are stored HASHED, so a database dump holds no usable reset link.
//   - Rate limits live in the database. On Vercel each request may hit a different instance and an
//     in-memory counter limits nothing.
//   - Sign-in with Google never CREATES an account (disableImplicitSignUp): it signs in the person
//     whose verified address matches, as the old hand-written flow did.
//   - A session is refused for any user whose state is not "active" — an invited row that never
//     accepted must not be signed in by any route, Google included.
//
// ⚠ SERVER ONLY. Built lazily (auth()), because building it opens the database handle and an import
// must never do that (see lib/db/index.ts).
import { after } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from "@/lib/db/schema";
import { appOrigin } from "@/lib/app-url";
import { emailEnabled } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";
import { resetPasswordEmail, verifyEmailEmail } from "@/lib/email/templates";
import { googleConfig } from "@/lib/google/config";
import { hashPassword, verifyPassword } from "./password";

/** The longest a "remembered" session lives; an unremembered one is a day (Better Auth's
 *  dontRememberMe) and its cookie dies with the browser — the same two numbers as before. */
const SESSION_DAYS = 30;
export const RESET_TTL_MINUTES = 60;
export const VERIFY_TTL_HOURS = 24;

/** Where the auth endpoints are mounted (app/api/auth/[...all]/route.ts). */
export const AUTH_BASE_PATH = "/api/auth";

/** The origin the app answers on: APP_URL in any real deployment, localhost when developing. */
export function authOrigin(): string {
  return appOrigin() ?? "http://localhost:3000";
}

/**
 * Mail goes out AFTER the response, never awaited inside it: a reset request for an address that
 * exists must take the same time as one for an address that does not, or the delay itself says
 * which addresses have accounts. Outside a request (a script) there is no after(); send inline.
 */
function sendLater(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

type Database = ReturnType<typeof db>;

/** Exported for verification scripts, which hand it a throwaway database; the app uses auth(). */
export function buildAuth(database: Database = db()) {
  const google = googleConfig();
  const origin = authOrigin();
  return betterAuth({
    appName: "Eve",
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
    // Read from BETTER_AUTH_SECRET. Better Auth refuses to start in production without one.
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins:
      process.env.NODE_ENV === "production" ? [origin] : [origin, "http://localhost:3000", "http://127.0.0.1:3000"],
    telemetry: { enabled: false },

    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        rateLimit: authRateLimits,
      },
    }),

    user: {
      additionalFields: {
        // Server-owned. A sign-up is a client until lib/auth/actions.ts says otherwise — the least
        // a mistake can grant.
        kind: { type: "string", input: false, required: false, defaultValue: "client" },
        organizationId: { type: "string", input: false, required: false },
        role: { type: "string", input: false, required: false, defaultValue: "designer" },
        state: { type: "string", input: false, required: false, defaultValue: "active" },
      },
    },

    session: {
      expiresIn: SESSION_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 200,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(password, hash),
      },
      // Only when mail can actually be delivered. With no provider (lib/email/ off) an unverified
      // sign-up is the only kind there can be, as it was before this file existed.
      requireEmailVerification: emailEnabled(),
      resetPasswordTokenExpiresIn: RESET_TTL_MINUTES * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendLater(() => sendEmail({ to: user.email, ...resetPasswordEmail({ url, expiresInMinutes: RESET_TTL_MINUTES }) }));
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      // An unverified person who tries to sign in gets a fresh link (rate-limited like the rest).
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFY_TTL_HOURS * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        sendLater(() => sendEmail({ to: user.email, ...verifyEmailEmail({ url, expiresInHours: VERIFY_TTL_HOURS }) }));
      },
    },

    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            // The ONE redirect URI the Cloud project has registered, shared with the calendar
            // connection. app/api/google/callback tells the two flows apart and hands this one to
            // Better Auth — so turning this on needs nothing new registered at Google.
            redirectURI: google.redirectUri,
            disableImplicitSignUp: true,
            scope: ["openid", "email"],
          },
        }
      : undefined,

    account: {
      // Google's tokens are not used after sign-in; encrypted at rest all the same.
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },

    verification: { storeIdentifier: "hashed" },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },

    advanced: {
      cookiePrefix: "eve",
      database: { generateId: "uuid" },
    },

    databaseHooks: {
      session: {
        create: {
          // Whatever route reached here — password, Google, a verification link — an account that
          // is not active (an invitation never accepted) gets no session.
          before: async (session) => {
            const [row] = await database
              .select({ state: users.state })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (!row || row.state !== "active") return false;
          },
        },
      },
    },

    // Last, as Better Auth requires: lets endpoints called from server actions set cookies.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof buildAuth>;
const holder = globalThis as typeof globalThis & { __eveAuth?: Auth };

/** The Better Auth instance, built on first use. */
export function auth(): Auth {
  holder.__eveAuth ??= buildAuth();
  return holder.__eveAuth;
}
