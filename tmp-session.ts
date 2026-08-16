import { config } from "dotenv";
config({ path: ".env.local" });
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, sessions, organizations } from "@/lib/db/schema";
async function main() {
  if (process.argv[2] === "revoke") {
    await db().delete(sessions).where(eq(sessions.tokenHash, createHash("sha256").update(process.argv[3]).digest("hex")));
    console.log("revoked"); process.exit(0);
  }
  const [owner] = await db().select({ id: users.id }).from(users).limit(1);
  if (!owner) {
    console.log("NO_USER"); process.exit(0);
  }
  const token = randomBytes(32).toString("base64url");
  await db().insert(sessions).values({ userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600000) });
  console.log(token); process.exit(0);
}
main();
