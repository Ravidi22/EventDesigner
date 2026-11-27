// How a person signs in — with a password, or only through Google.
//
// ⚠ SERVER ONLY, and a PLAIN module (never "use server"): it takes a user id and trusts it. The
// delete question asks for the password only when there is one (deleteMyAccount, the screens that
// open it), so a Google-only account is not asked for a password it never had.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authAccounts } from "@/lib/db/schema";

export async function hasPasswordLogin(userId: string): Promise<boolean> {
  const [credential] = await db()
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, "credential")))
    .limit(1);
  return !!credential;
}
