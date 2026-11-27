// npm run db:verify:account — the account lifecycle against a real Postgres (EVE-22, EVE-51, EVE-52).
//
//   DATABASE_URL=postgres://eve:eve@127.0.0.1:55432/eve_isolation npm run db:verify:account
//
// Each step seeds its OWN fixture (lib/db/isolation/fixture.ts — studio A with everything that hangs
// off an event, A's supplier and venue owner, and B's businesses) and deletes it afterwards, whatever
// happens: a step that erases a person or a business must never leave the next one with less to act
// on. Refuses any database that is not this machine's or CI's — it creates and deletes organisations.
import { refusal } from "@/lib/db/isolation/env";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { actAsUserForScript } from "@/lib/auth/session";
import { cleanup, seed, sweep, type Fixture } from "@/lib/db/isolation/fixture";
import { issuePaymentRequest } from "@/lib/billing/actions";
import { removeMember, setMemberRole } from "@/lib/team/actions";
import { fetchAuditLog } from "@/lib/audit/actions";

const steps: { name: string; run: (f: Fixture) => Promise<void> }[] = [];

/** One scenario on a fixture of its own. */
function step(name: string, run: (f: Fixture) => Promise<void>): void {
  steps.push({ name, run });
}

function assert(ok: unknown, what: string): asserts ok {
  if (!ok) throw new Error(`FAIL: ${what}`);
}

/** Run `fn` as this person, then sign the script out again. */
async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  actAsUserForScript(userId);
  try {
    return await fn();
  } finally {
    actAsUserForScript(null);
  }
}

// ── the people ──────────────────────────────────────────────────────────────────────────────────

step("a member who issued a billing document can be removed", async (f) => {
  const issued = await as(f.memberA, () =>
    issuePaymentRequest(f.eventId, { amount: 500, dueDate: "2027-07-01", label: "תשלום של חבר הצוות" } as never),
  );
  assert(!("error" in issued), `the member issued a document: ${JSON.stringify(issued)}`);
  const docId = (issued as { id: string }).id;
  const [before] = await db().select().from(schema.billingDocuments).where(eq(schema.billingDocuments.id, docId));
  assert(before?.issuedBy === f.memberA, "the document names its issuer");

  await as(f.ownerA, () => removeMember(f.memberA));

  const left = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, f.memberA));
  assert(left.length === 0, "the member's row is gone");
  const [after] = await db().select().from(schema.billingDocuments).where(eq(schema.billingDocuments.id, docId));
  assert(after, "the document is still there");
  assert(after.issuedBy === null, "issued_by is null");
  const { issuedBy: _a, ...restBefore } = before;
  const { issuedBy: _b, ...restAfter } = after;
  assert(JSON.stringify(restBefore) === JSON.stringify(restAfter), "every other column unchanged");

  // Only to null: naming somebody else as the issuer is still refused.
  const moved = await db()
    .update(schema.billingDocuments)
    .set({ issuedBy: f.ownerA })
    .where(eq(schema.billingDocuments.id, docId))
    .then(() => "updated", (e: unknown) => String((e as { cause?: unknown }).cause ?? e));
  assert(moved.includes("frozen after issue"), `a different issuer is refused (got: ${moved})`);
});

// ── the audit log ───────────────────────────────────────────────────────────────────────────────

step("a role change writes one audit row the owner reads", async (f) => {
  await as(f.ownerA, () => setMemberRole(f.memberA, "crew"));
  const log = await as(f.ownerA, () => fetchAuditLog());
  const row = log.rows.find((r) => r.action === "member.role_changed");
  assert(row, `a member.role_changed row (got: ${log.rows.map((r) => r.action).join(", ")})`);
  assert(row.line === "תפקיד: member-a · מעצב ← צוות הקמה", `the line names the member (got: ${row.line})`);
  assert(row.actor === "owner-a", `the actor is the owner (got: ${row.actor})`);
  const refused = await as(f.memberA, () => fetchAuditLog()).then(
    () => false,
    () => true,
  );
  assert(refused, "a member cannot read the log");
});

// ── the runner ──────────────────────────────────────────────────────────────────────────────────

async function main() {
  const why = refusal(process.env.DATABASE_URL, process.env.CI === "true");
  if (why) {
    console.error(why);
    process.exit(2);
  }
  const only = process.argv[2];
  const swept = await sweep();
  if (swept) console.log(`swept ${swept} organisations an earlier run left behind`);

  let failed = 0;
  for (const s of steps) {
    if (only && !s.name.includes(only)) continue;
    let f: Fixture | null = null;
    try {
      f = await seed();
      await s.run(f);
      console.log(`  ok   ${s.name}`);
    } catch (e) {
      failed++;
      const cause = e instanceof Error && e.cause instanceof Error ? `\n       cause: ${e.cause.message}` : "";
      console.error(`  FAIL ${s.name}\n       ${e instanceof Error ? e.message : String(e)}${cause}`);
    } finally {
      actAsUserForScript(null);
      if (f) await cleanup([...f.aOrgs, f.orgB, f.orgB2, f.orgB3], [f.clientC, f.users.clientB], f.filePath);
    }
  }
  console.log(failed ? `\ndb:verify:account — ${failed} failed` : "\ndb:verify:account — ok");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
