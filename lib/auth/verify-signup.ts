// npm run db:verify:signup — what sign-up writes after Better Auth has created the person is all or
// nothing (PR #4 review). Better Auth commits the user before signUp() marks it a studio owner and
// records the terms acceptance; if those writes failed the person kept an account that was neither
// (state "pending", no acceptance on record), and a retry was refused as "כבר קיים חשבון".
//
//   DATABASE_URL=postgres://eve:eve@127.0.0.1:55432/eve npm run db:verify:signup
//
// Local databases only (lib/db/isolation/env.ts): it creates and deletes people.
import { refusal } from "@/lib/db/isolation/env";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, users } from "@/lib/db/schema";
import { settleNewAccount } from "./new-account";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

/** A person as Better Auth leaves them: its own defaults — a designer, pending. */
async function created(): Promise<string> {
  const id = randomUUID();
  await db().insert(users).values({ id, email: `signup-${id}@example.test`, name: "בדיקת הרשמה" } as never);
  return id;
}

async function main() {
  const why = refusal(process.env.DATABASE_URL, process.env.CI === "true");
  if (why) {
    console.error(why);
    process.exit(2);
  }
  const accepted = { version: "2026-11-27", at: new Date() };
  const made: string[] = [];
  try {
    // A sign-up that goes through: one studio owner, active, with the version they accepted.
    const ok = await created();
    made.push(ok);
    check((await settleNewAccount(ok, accepted)) === true, "a complete sign-up is settled");
    const [row] = await db().select().from(users).where(eq(users.id, ok));
    check(row?.kind === "studio" && row.role === "owner" && row.state === "active", `the person is an active studio owner (${row?.kind}/${row?.role}/${row?.state})`);
    const rows = await db().select().from(legalAcceptances).where(eq(legalAcceptances.userId, ok));
    check(rows.length === 1 && rows[0].version === accepted.version, "the accepted version is recorded");

    // While the texts are drafts nothing is accepted, and nothing is recorded.
    const draft = await created();
    made.push(draft);
    check((await settleNewAccount(draft, null)) === true, "a sign-up with no acceptance (drafts) is settled");
    check((await db().select().from(legalAcceptances).where(eq(legalAcceptances.userId, draft))).length === 0, "…with no acceptance row");

    // The acceptance write fails (here: the same version already on record, a unique violation — in
    // life a dropped connection, or 0029 not yet on that database). Nothing of the sign-up is kept:
    // the person Better Auth created is gone, so trying again is a fresh sign-up.
    const broken = await created();
    made.push(broken);
    await db().insert(legalAcceptances).values({ userId: broken, version: accepted.version, acceptedAt: accepted.at });
    check((await settleNewAccount(broken, accepted)) === false, "a failed acceptance write fails the sign-up");
    const [left] = await db().select().from(users).where(eq(users.id, broken));
    check(!left, `the half-made account is deleted, so the address can sign up again (${left ? `${left.role}/${left.state}` : "gone"})`);
  } finally {
    for (const id of made) await db().delete(users).where(eq(users.id, id));
  }
  console.log(failures ? `\n${failures} failed` : "\nsign-up settles all or nothing");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
