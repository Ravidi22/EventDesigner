// npm run db:verify:account — the account lifecycle against a real Postgres (EVE-22, EVE-51, EVE-52).
//
//   DATABASE_URL=postgres://eve:eve@127.0.0.1:55432/eve_account npm run db:verify:account
//
// (A UTF8 database: the embedded Postgres on a Hebrew Windows initialises WIN1255.)
//
// Each step seeds its OWN fixture (lib/db/isolation/fixture.ts — studio A with everything that hangs
// off an event, A's supplier and venue owner, and B's businesses) and deletes it afterwards, whatever
// happens: a step that erases a person or a business must never leave the next one with less to act
// on. Refuses any database that is not this machine's or CI's — it creates and deletes organisations.
import { refusal } from "@/lib/db/isolation/env";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { actAsUserForScript } from "@/lib/auth/session";
import { cleanup, seed, sweep, type Fixture } from "@/lib/db/isolation/fixture";
import { issuePaymentRequest } from "@/lib/billing/actions";
import { removeMember, setMemberRole } from "@/lib/team/actions";
import { fetchAuditLog } from "@/lib/audit/actions";
import { AUTH_BASE_PATH, auth, authOrigin } from "@/lib/auth/auth";
import { hashPassword } from "@/lib/auth/password";
import { closeBusiness, reopenBusiness } from "@/lib/account/actions";
import { BusinessClosedError } from "@/lib/db/org";
import { fetchEvents, saveEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { saveDocument } from "@/lib/studio/actions";
import { mintSceneLink } from "@/lib/scene/actions";
import { sceneByToken } from "@/lib/scene/share-read";
import { fetchMyEvents } from "@/lib/client-portal/actions";
import { fetchMarketplace } from "@/lib/marketplace/actions";
import { fetchVenueDirectory, followVenue } from "@/lib/venues/actions";

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

/** Give this person a password (the fixture writes people without one) and sign in through Better
 *  Auth's own router, as a browser would: the cookie that comes back is a real session. */
async function signInWithPassword(userId: string): Promise<{ cookie: string; password: string }> {
  const password = `pw-${randomUUID()}`;
  const [person] = await db().select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  await db()
    .insert(schema.authAccounts)
    .values({ id: randomUUID(), userId, accountId: userId, providerId: "credential", password: await hashPassword(password) });
  // The steps sign in more often than the router's 5-a-minute limit allows; this is a throwaway
  // database, so the counters are cleared rather than the limit loosened.
  await db().delete(schema.authRateLimits);
  const res = await authPost("/sign-in/email", { email: person.email, password });
  assert(res.status === 200, `signed in (${res.status} ${await res.text()})`);
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, password };
}

/** POST to a Better Auth endpoint, as the router sees a browser's request. */
function authPost(path: string, body: unknown, cookie?: string): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json", origin: authOrigin() });
  if (cookie) headers.set("cookie", cookie);
  return auth().handler(new Request(`${authOrigin()}${AUTH_BASE_PATH}${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

async function notificationsOf(userId: string, kind: string) {
  return db()
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.kind, kind as never)));
}

// ── the people ──────────────────────────────────────────────────────────────────────────────────

step("a designer deletes their own account", async (f) => {
  await as(f.ownerA, () => setMemberRole(f.memberA, "crew"));
  const { cookie, password } = await signInWithPassword(f.memberA);
  const res = await authPost("/delete-user", { password }, cookie);
  assert(res.status === 200, `deleted (${res.status} ${await res.text()})`);

  const left = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, f.memberA));
  assert(left.length === 0, "the member's row is gone");
  assert((await notificationsOf(f.ownerA, "member.left")).length === 1, "the owner's bell rang once");
  const log = await as(f.ownerA, () => fetchAuditLog());
  const self = log.rows.find((r) => r.action === "member.self_deleted");
  assert(self?.line === "מחיקת חשבון: חבר/ת צוות לשעבר", `the self-delete row forgot the name (got: ${self?.line})`);
  const role = log.rows.find((r) => r.action === "member.role_changed");
  assert(role?.line.startsWith("תפקיד: חבר/ת צוות לשעבר"), `an older row forgot the name too (got: ${role?.line})`);
});

step("the owner cannot delete their account", async (f) => {
  const { cookie, password } = await signInWithPassword(f.ownerA);
  const res = await authPost("/delete-user", { password }, cookie);
  assert(res.status === 403, `refused by our hook (${res.status})`);
  const left = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, f.ownerA));
  assert(left.length === 1, "the owner is still there");
});

step("a client deletes their login", async (f) => {
  const [before] = await db().select().from(schema.events).where(eq(schema.events.id, f.eventId));
  const { cookie, password } = await signInWithPassword(f.clientC);
  const res = await authPost("/delete-user", { password }, cookie);
  assert(res.status === 200, `deleted (${res.status} ${await res.text()})`);
  const left = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, f.clientC));
  assert(left.length === 0, "the client's row is gone");
  const [after] = await db().select().from(schema.events).where(eq(schema.events.id, f.eventId));
  assert(after.clientName === before.clientName && after.phone === before.phone, "the studio's event is untouched");
  assert((await notificationsOf(f.ownerA, "client.left")).length >= 1, "the studio's bell rang");
});

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

// ── closing ─────────────────────────────────────────────────────────────────────────────────────

const nameOf = async (orgId: string) =>
  (await db().select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, orgId)))[0].name;

/** What a refused call threw, or null when it went through. */
const refusalOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

const aNewEvent = (venueId: string, name: string): EventSummary =>
  ({ id: randomUUID(), clientName: name, phone: "", date: "2027-08-01", zoneIds: [], zonesLabel: "", guests: 10, step: 0, createdAt: Date.now(), venueId }) as EventSummary;

step("closing locks the business", async (f) => {
  // Before: B has an event standing in A's venue, B's hall business finds A's venue in the directory,
  // A has a live 3D link.
  const bEvent = aNewEvent(f.venueId, "אירוע של ב באולם של א");
  await as(f.users.studioB, () => saveEvent(bEvent));
  assert((await as(f.users.venueB, () => fetchVenueDirectory())).some((v) => v.id === f.venueId), "before: A's venue is in the directory");
  const { path } = await as(f.ownerA, () => mintSceneLink(f.eventId));
  const token = path.split("/").pop()!;
  assert((await sceneByToken(token)) !== null, "before: the link opens");
  await signInWithPassword(f.memberA);

  const nameA = await nameOf(f.orgA);
  const closed = await as(f.ownerA, () => closeBusiness({ confirmName: `  ${nameA} ` }));
  assert("eraseAfter" in closed, `closed (${JSON.stringify(closed)})`);
  const days = (Date.parse(closed.eraseAfter) - Date.now()) / 86400000;
  assert(days > 29.9 && days <= 30, `erase in 30 days (${days})`);

  const sessions = await db().select().from(schema.authSessions).where(eq(schema.authSessions.userId, f.memberA));
  assert(sessions.length === 0, "the member was signed out");
  // What a member's open tab would send: the drawing as it stands.
  const [drawing] = await db().select({ content: schema.designDocuments.content }).from(schema.designDocuments).where(eq(schema.designDocuments.eventId, f.eventId)).limit(1);
  const saved = await refusalOf(as(f.memberA, () => saveDocument(f.eventId, drawing.content)));
  assert(saved instanceof BusinessClosedError, `a member's autosave is refused (got: ${String(saved)})`);
  const read = await refusalOf(as(f.ownerA, () => fetchEvents()));
  assert(read instanceof BusinessClosedError, "the owner's studio actions are refused too");

  assert((await sceneByToken(token)) === null, "the 3D link no longer opens");
  const mine = await as(f.clientC, () => fetchMyEvents());
  assert(!mine.some((e) => e.id === f.eventId), "the client's portal no longer lists A's event");

  assert(!(await as(f.users.venueB, () => fetchVenueDirectory())).some((v) => v.id === f.venueId), "A's venue left the directory");
  assert((await refusalOf(as(f.users.venueB, () => followVenue(f.spareVenueId)))) instanceof Error, "nobody new can follow A's venue");
  const placed = await refusalOf(as(f.users.studioB, () => saveEvent(aNewEvent(f.venueId, "אירוע חדש באולם של א"))));
  assert(placed instanceof Error, "B cannot put a NEW event in A's venue");
  const kept = await refusalOf(as(f.users.studioB, () => saveEvent({ ...bEvent, guests: 12 })));
  assert(kept === null, `B's existing event in A's venue still saves (got: ${String(kept)})`);
});

step("a closed supplier leaves the marketplace", async (f) => {
  assert((await as(f.users.studioB, () => fetchMarketplace())).some((p) => p.product.id === f.publicProductS), "before: listed");
  const closed = await as(f.supplierUserS, async () => closeBusiness({ confirmName: await nameOf(f.orgS) }));
  assert("eraseAfter" in closed, "the supplier closed");
  assert(!(await as(f.users.studioB, () => fetchMarketplace())).some((p) => p.product.id === f.publicProductS), "after: gone");
});

step("the wrong name does not close, and a closed business reopens", async (f) => {
  const wrong = await as(f.ownerA, () => closeBusiness({ confirmName: "לא השם" }));
  assert("error" in wrong, "the wrong name is refused");
  assert((await refusalOf(as(f.memberA, () => fetchEvents()))) === null, "still open");

  const byMember = await as(f.memberA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  assert("error" in byMember, "a member cannot close the business");

  await as(f.ownerA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  assert((await refusalOf(as(f.memberA, () => fetchEvents()))) instanceof BusinessClosedError, "closed");
  const reopened = await as(f.ownerA, () => reopenBusiness());
  assert("ok" in reopened, `reopened (${JSON.stringify(reopened)})`);
  assert((await refusalOf(as(f.memberA, () => fetchEvents()))) === null, "open again for the members");
  const log = await as(f.ownerA, () => fetchAuditLog());
  assert(log.rows.some((r) => r.action === "business.closed") && log.rows.some((r) => r.action === "business.reopened"), "both in the log");
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
