// What sign-up writes after Better Auth has created the person (lib/auth/actions.ts signUp). A plain
// module, not "use server": it is called by the action, never from a form.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, users } from "@/lib/db/schema";

/**
 * Better Auth has committed the person with its own defaults (a designer, pending). What they ARE is
 * ours to write: a studio account with no organisation yet — the (app) layout sends it to /welcome —
 * and, once the legal texts are published, which version of them they accepted (EVE-9).
 *
 * ONE transaction, and if it fails the person is deleted again (their sessions and logins go with
 * them, by cascade). Before, a failure here left an account that was neither — "pending", and no
 * acceptance on record — and a retry was refused as "כבר קיים חשבון עם האימייל הזה" (PR #4 review).
 * True when the account is complete; false when the sign-up must be reported as failed.
 */
export async function settleNewAccount(userId: string, accepted: { version: string; at: Date } | null): Promise<boolean> {
  const database = db();
  try {
    await database.transaction(async (tx) => {
      await tx.update(users).set({ kind: "studio", role: "owner", state: "active" }).where(eq(users.id, userId));
      if (accepted) await tx.insert(legalAcceptances).values({ userId, version: accepted.version, acceptedAt: accepted.at });
    });
    return true;
  } catch (e) {
    console.error("sign-up: the new account could not be settled — removing it", e);
    await database
      .delete(users)
      .where(eq(users.id, userId))
      .catch((gone) => console.error("sign-up: …and it could not be removed", gone));
    return false;
  }
}
