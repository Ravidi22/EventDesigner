// Open a designer's studio BY HAND, in whichever database an env var names — what sign-up and
// /welcome do together (lib/auth/actions.ts signUp + completeOnboarding), for an account that
// somebody else will sign in to: the organisation, its settings row, one owner with a password, and
// the base library of tables (lib/catalog/standard). Written 2026-10-31 to open Ravid's father's
// studio on the production branch, whose only difference from develop was that nobody had ever
// signed up there.
//
//   npx tsx scripts/create-studio-account.ts --email <address> --name <full name> --studio <business>
//       [--password <p>]         a password of your own; otherwise one is generated and PRINTED ONCE
//       [--db PROD_DATABASE_URL] the env var (in .env.local) holding the connection string — default DATABASE_URL
//       [--dry-run]              say what would happen, write nothing
//
// The rows are exactly the ones acceptInvite and claimOrganization write — users.kind "studio",
// role "owner", state "active", emailVerified TRUE (so a deployment that requires verification lets
// them in), and the credential in auth_accounts hashed by the app's own hasher, which is what Better
// Auth verifies with (lib/auth/auth.ts password.verify). Nothing here goes through the sign-up
// endpoint: that needs a request, a rate limit and a mail provider, none of which a script has.
//
// Refuses an address that already has a row anywhere in that database: one email, one account.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Letters and digits that cannot be misread over the phone: no 0/O, 1/l/I. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generatePassword = () => Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function main() {
  const email = String(arg("email") ?? "").trim().toLowerCase();
  const name = String(arg("name") ?? "").trim();
  const studio = String(arg("studio") ?? "").trim();
  const dbVar = arg("db") ?? "DATABASE_URL";
  const dryRun = flag("dry-run");
  if (!email || !name || !studio) {
    throw new Error("usage: npx tsx scripts/create-studio-account.ts --email <address> --name <full name> --studio <business> [--password <p>] [--db <ENV_VAR>] [--dry-run]");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`not an email address: ${email}`);
  const url = process.env[dbVar];
  if (!url) throw new Error(`${dbVar} is not set in .env.local`);
  // lib/db connects lazily off DATABASE_URL on its first call, so every module below — the base
  // library installer included — talks to the database named by --db and to no other.
  process.env.DATABASE_URL = url;

  const { db } = await import("@/lib/db");
  const { organizations, studioSettings, users, authAccounts } = await import("@/lib/db/schema");
  const { hashPassword } = await import("@/lib/auth/password");
  const { installStandardCatalog } = await import("@/lib/catalog/standard/install");

  const database = db();
  const host = url.replace(/^[^@]*@/, "").replace(/[/?].*$/, "");
  const [{ migrations }] = await database.execute<{ migrations: number }>(sql`select count(*)::int as migrations from drizzle.__drizzle_migrations`);
  const [{ people }] = await database.execute<{ people: number }>(sql`select count(*)::int as people from users`);
  console.log(`database: ${dbVar} (${host}) — ${migrations} migrations applied, ${people} users`);

  const [existing] = await database
    .select({ id: users.id, organizationId: users.organizationId, state: users.state })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw new Error(`${email} already has an account there (user ${existing.id}, state ${existing.state}, organisation ${existing.organizationId ?? "none"})`);

  const given = arg("password");
  const password = given ?? generatePassword();
  if (password.length < 8) throw new Error("the password must be at least 8 characters");

  console.log(`${dryRun ? "would open" : "opening"} studio "${studio}" with owner ${name} <${email}>`);
  if (dryRun) {
    console.log("dry run — nothing written");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { organizationId, userId } = await database.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: studio, kind: "studio" }).returning({ id: organizations.id });
    await tx.insert(studioSettings).values({ organizationId: org.id, businessName: studio, ownerName: name });
    const [user] = await tx
      .insert(users)
      .values({
        organizationId: org.id,
        kind: "studio",
        email,
        name,
        role: "owner",
        state: "active",
        emailVerified: true,
        joinedAt: today,
      })
      .returning({ id: users.id });
    await tx.insert(authAccounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(password),
    });
    return { organizationId: org.id, userId: user.id };
  });
  console.log(`organisation ${organizationId}`);
  console.log(`user         ${userId}`);

  // Best-effort, as /welcome does it: the studio is real without its shelf of tables, and
  // `npm run catalog:standard` is the idempotent retry.
  try {
    const added = await installStandardCatalog(organizationId);
    console.log(`base library: ${added} rows installed`);
  } catch (error) {
    console.error("base library install failed — run `npm run catalog:standard` for this organisation:", error);
  }

  console.log("");
  console.log(`sign in with  ${email}`);
  if (given) console.log("password      (the one you passed)");
  else console.log(`password      ${password}   ← printed once; it is stored only as a hash`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  });
