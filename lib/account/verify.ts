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
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { actAsUserForScript } from "@/lib/auth/session";
import { cleanup, seed, sweep, type Fixture } from "@/lib/db/isolation/fixture";
import { issuePaymentRequest } from "@/lib/billing/actions";
import { inviteMember, removeMember, setMemberRole } from "@/lib/team/actions";
import { fetchAuditLog } from "@/lib/audit/actions";
import { AUTH_BASE_PATH, auth, authOrigin } from "@/lib/auth/auth";
import { POST as publicAuthRoute } from "@/app/api/auth/[...all]/route";
import { hashPassword } from "@/lib/auth/password";
import { closeBusiness, reopenBusiness } from "@/lib/account/actions";
import { BusinessClosedError } from "@/lib/db/org";
import { deleteEvent, fetchEvents, saveEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { saveDocument } from "@/lib/studio/actions";
import { mintSceneLink } from "@/lib/scene/actions";
import { sceneByToken } from "@/lib/scene/share-read";
import { fetchMyEvents } from "@/lib/client-portal/actions";
import { fetchMarketplace } from "@/lib/marketplace/actions";
import { deleteVenue, fetchVenueDirectory, fetchVenues, followVenue, renameVenue, revokeGrant, setGrantRole, shareVenue } from "@/lib/venues/actions";
import { closeFinalCount } from "@/lib/hosting/actions";
import { fetchDesignerSketch, inviteDesigner } from "@/lib/event-links/actions";
import { eraseBusiness, sweepAccounts } from "@/lib/account/erase";
import { ACCOUNT_TABLES, isSecretColumn } from "@/lib/account/tables";
import { exportData } from "@/lib/account/export";
import { GET as exportRoute } from "@/app/api/account/export/data/route";
import { shareEventWithClient, unshareEventClient } from "@/lib/events/client-actions";
import { removeProduct } from "@/lib/catalog/actions";
import { saveAppointment } from "@/lib/appointments/actions";
import { saveSketchTemplate } from "@/lib/studio/sketch-actions";
import { fileDriver } from "@/lib/files/driver";
import { listLocalFiles, writeLocalFile } from "@/lib/files/driver-local";
import type { Appointment } from "@/lib/appointments/types";
import { emptyPlan } from "@/lib/venues/types";

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

/** Audit rows that still carry this person's NAME (a wiped one keeps the key with a null name). */
async function namedInAudit(userId: string): Promise<number> {
  const rows = (await db().execute(sql`select count(*)::int as n from audit_log where people -> ${userId} ->> 'name' is not null`)) as unknown as { n: number }[];
  return rows[0].n;
}

/** Run `fn` with every audit insert refused by the database, the way a dropped connection or a full
 *  disk would refuse it. */
async function withAuditRefused<T>(fn: () => Promise<T>): Promise<T> {
  await db().execute(sql.raw(`create or replace function verify_refuse_audit() returns trigger language plpgsql as $$ begin raise exception 'audit refused (db:verify:account)'; end $$`));
  await db().execute(sql.raw(`create trigger verify_refuse_audit before insert on audit_log for each row execute function verify_refuse_audit()`));
  try {
    return await fn();
  } finally {
    await db().execute(sql.raw(`drop trigger if exists verify_refuse_audit on audit_log`));
    await db().execute(sql.raw(`drop function if exists verify_refuse_audit()`));
  }
}

/** True when the promise rejected. */
const refused = (p: Promise<unknown>) => p.then(() => false, () => true);

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

step("the audit log pages through rows that share a timestamp without skipping one", async (f) => {
  // Rows written in one transaction share now() to the microsecond; a cursor cut to the millisecond by
  // a JS Date skipped the rows at a page edge (PR #5 review).
  const at = "2020-01-02 03:04:05.123456+00";
  const ids: string[] = [];
  for (let i = 0; i < 60; i++) {
    const id = randomUUID();
    ids.push(id);
    await db().execute(sql`insert into audit_log (id, organization_id, actor_user_id, action, summary, people, at)
      values (${id}, ${f.orgA}, ${f.ownerA}, 'export.downloaded', ${`row ${i}`}, '{}'::jsonb, ${at}::timestamptz)`);
  }
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let pages = 0; pages < 20; pages++) {
    const page = await as(f.ownerA, () => fetchAuditLog({ before: cursor }));
    seen.push(...page.rows.map((r) => r.id));
    if (!page.more) break;
    cursor = page.next;
  }
  const missing = ids.filter((id) => !seen.includes(id));
  const twice = ids.filter((id) => seen.filter((x) => x === id).length > 1);
  assert(missing.length === 0 && twice.length === 0, `every row once (missing ${missing.length}, twice ${twice.length})`);
});

step("a grant set to the role it already has writes nothing to the log", async (f) => {
  const [grant] = await db().select({ role: schema.venueGrants.role }).from(schema.venueGrants).where(eq(schema.venueGrants.id, f.grantId));
  const lines = async () =>
    (await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.organizationId, f.orgA), eq(schema.auditLog.action, "venue.grant_changed")))).length;
  const before = await lines();
  await as(f.ownerA, () => setGrantRole(f.grantId, grant.role as never));
  assert((await lines()) === before, `no line for a role that did not change (${before} → ${await lines()})`);
  await as(f.ownerA, () => setGrantRole(f.grantId, grant.role === "editor" ? "viewer" : "editor"));
  assert((await lines()) === before + 1, "one line for a real change");
});

step("a hall cannot invite a designer whose studio is closed", async (f) => {
  // The invitation would ring a bell in a business whose people only reach /closed: accepted never,
  // the booking waiting forever (PR #5 review).
  await as(f.ownerA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  const answer = await as(f.venueUserV, () => inviteDesigner(f.bookingEventId, f.ownerAEmail));
  assert("error" in answer, `refused (${JSON.stringify(answer).slice(0, 200)})`);
});

step("a change whose audit row cannot be written is not made", async (f) => {
  // lib/audit/write.ts: "a sensitive change that cannot be recorded is not made" (PR #5 review).
  const [grant] = await db().select({ role: schema.venueGrants.role }).from(schema.venueGrants).where(eq(schema.venueGrants.id, f.grantId));
  const other = grant.role === "editor" ? "viewer" : "editor";
  const stamp = randomUUID().slice(0, 8);
  const outcomes = await withAuditRefused(() =>
    as(f.ownerA, async () => ({
      deleteEvent: await refused(deleteEvent(f.bareEventId)),
      removeProduct: await refused(removeProduct(f.copyProductId)),
      deleteVenue: await refused(deleteVenue(f.spareVenueId)),
      shareVenue: await refused(shareVenue({ venueId: f.venueId, name: "אורח", email: `guest-${stamp}@example.test`, kind: "guest", role: "viewer" } as never)),
      setGrantRole: await refused(setGrantRole(f.grantId, other)),
      revokeGrant: await refused(revokeGrant(f.grantId)),
      shareEventWithClient: await refused(shareEventWithClient(f.eventId, { name: "לקוחה", email: `client-${stamp}@example.test` })),
      unshareEventClient: await refused(unshareEventClient(f.eventId, f.clientC)),
      inviteMember: await refused(inviteMember("חבר", `member-${stamp}@example.test`, "designer")),
      exportRoute: await refused(exportRoute()),
    })),
  );
  const notRefused = Object.entries(outcomes).filter(([, r]) => !r).map(([k]) => k);
  assert(notRefused.length === 0, `every audited change fails when its row cannot be written (went through: ${notRefused.join(", ")})`);

  const kept: Record<string, boolean> = {
    "the event": (await db().select().from(schema.events).where(eq(schema.events.id, f.bareEventId))).length === 1,
    "the product": (await db().select().from(schema.products).where(eq(schema.products.id, f.copyProductId))).length === 1,
    "the venue": (await db().select().from(schema.venues).where(eq(schema.venues.id, f.spareVenueId))).length === 1,
    "no guest grant": (await db().select().from(schema.venueGrants).where(eq(schema.venueGrants.granteeEmail, `guest-${stamp}@example.test`))).length === 0,
    "the grant and its role": (await db().select().from(schema.venueGrants).where(eq(schema.venueGrants.id, f.grantId)))[0]?.role === grant.role,
    "no new client": (await db().select().from(schema.users).where(eq(schema.users.email, `client-${stamp}@example.test`))).length === 0,
    "the client's share": (await db().select().from(schema.eventClients).where(and(eq(schema.eventClients.eventId, f.eventId), eq(schema.eventClients.userId, f.clientC)))).length === 1,
    "no invitation": (await db().select().from(schema.users).where(eq(schema.users.email, `member-${stamp}@example.test`))).length === 0,
  };
  const lost = Object.entries(kept).filter(([, ok]) => !ok).map(([k]) => k);
  assert(lost.length === 0, `nothing changed (changed anyway: ${lost.join(", ")})`);
});

step("a browser cannot delete an account through Better Auth's public route", async (f) => {
  // Better Auth deletes without a password on a session under a day old (freshAge). The app asks for
  // the password in deleteMyAccount, which reaches Better Auth in-process; the public route must not
  // offer the endpoint at all (PR #5 review).
  const { cookie } = await signInWithPassword(f.memberA);
  const headers = new Headers({ "content-type": "application/json", origin: authOrigin(), cookie });
  const res = await publicAuthRoute(new Request(`${authOrigin()}${AUTH_BASE_PATH}/delete-user`, { method: "POST", headers, body: "{}" }));
  assert(res.status === 404, `refused at the public route (${res.status} ${await res.text()})`);
  const left = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, f.memberA));
  assert(left.length === 1, "the member is still there");
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
  assert((await namedInAudit(f.clientC)) > 0, "before: a studio's log names the client (the share)");
  const { cookie, password } = await signInWithPassword(f.clientC);
  const res = await authPost("/delete-user", { password }, cookie);
  assert(res.status === 200, `deleted (${res.status} ${await res.text()})`);
  const left = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, f.clientC));
  assert(left.length === 0, "the client's row is gone");
  const [after] = await db().select().from(schema.events).where(eq(schema.events.id, f.eventId));
  assert(after.clientName === before.clientName && after.phone === before.phone, "the studio's event is untouched");
  assert((await notificationsOf(f.ownerA, "client.left")).length >= 1, "the studio's bell rang");
  assert((await namedInAudit(f.clientC)) === 0, "the client's name is gone from every studio's log");
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

  assert((await namedInAudit(f.pendingMemberA)) > 0, "before: the log names the pending invitation");
  const nameA = await nameOf(f.orgA);
  const closed = await as(f.ownerA, () => closeBusiness({ confirmName: `  ${nameA} ` }));
  assert("eraseAfter" in closed, `closed (${JSON.stringify(closed)})`);
  const days = (Date.parse(closed.eraseAfter) - Date.now()) / 86400000;
  assert(days > 29.9 && days <= 30, `erase in 30 days (${days})`);

  assert((await namedInAudit(f.pendingMemberA)) === 0, "the deleted invitation's name left the log");
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
  const listed = mine.find((e) => e.id === f.eventId);
  assert(listed?.studioClosed === true, `the client's portal says the studio closed (${JSON.stringify(listed)})`);

  assert(!(await as(f.users.venueB, () => fetchVenueDirectory())).some((v) => v.id === f.venueId), "A's venue left the directory");
  // Both are corrections the person can make (pick another venue), so they come back as { error } —
  // a thrown message is redacted in production (CLAUDE.md; PR #5 review).
  const follow = await as(f.users.venueB, () => followVenue(f.spareVenueId)).catch((e: unknown) => e);
  assert(
    !!follow && typeof follow === "object" && "error" in follow && String(follow.error).includes("נסגר"),
    `nobody new can follow A's venue, and is told why (got: ${follow instanceof Error ? `a throw: ${follow.message}` : JSON.stringify(follow)})`,
  );
  const placed = await as(f.users.studioB, () => saveEvent(aNewEvent(f.venueId, "אירוע חדש באולם של א"))).catch((e: unknown) => e);
  assert(
    !!placed && typeof placed === "object" && "error" in placed && String(placed.error).includes("נסגר"),
    `B cannot put a NEW event in A's venue, and is told why (got: ${placed instanceof Error ? `a throw: ${placed.message}` : JSON.stringify(placed)})`,
  );
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

step("a closed designer's link stops following, and the hall may link another", async (f) => {
  const guestsOf = async () =>
    (await db().select({ guests: schema.events.guests }).from(schema.events).where(eq(schema.events.id, f.linkedEventId)))[0].guests;
  const before = await guestsOf();
  await as(f.ownerA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  await as(f.venueUserV, () => closeFinalCount(f.bookingEventId, before + 37));
  assert((await guestsOf()) === before, "the closed designer's event did not follow the booking");
  assert((await as(f.venueUserV, () => fetchDesignerSketch(f.bookingEventId))) === null, "the hall no longer reads the closed designer's sketch");
  const again = await as(f.venueUserV, () => inviteDesigner(f.bookingEventId, `another-${randomUUID()}@example.test`));
  assert(!("error" in again), `the hall may invite another designer (${JSON.stringify(again)})`);
});

step("an erased business cannot be reopened, and its closure stays", async (f) => {
  await as(f.ownerA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  // The sweep committed while the owner's reopen was on its way: the closure is erased by now.
  await db().update(schema.organizationClosures).set({ erasedAt: new Date() }).where(eq(schema.organizationClosures.organizationId, f.orgA));
  const answer = await as(f.ownerA, () => reopenBusiness());
  assert("error" in answer, `refused (${JSON.stringify(answer)})`);
  const left = await db().select().from(schema.organizationClosures).where(eq(schema.organizationClosures.organizationId, f.orgA));
  assert(left.length === 1, "the erased business's closure is kept");
});

step("a closed business's venue: its guests only read it, and the pickers mark it", async (f) => {
  await db().insert(schema.venueGrants).values({
    id: randomUUID(),
    venueId: f.venueId,
    grantorOrgId: f.orgA,
    granteeOrgId: f.orgB,
    granteeEmail: `guest-${randomUUID()}@example.test`,
    granteeName: "סטודיו ב",
    kind: "guest",
    role: "manager",
    state: "active",
  } as never);
  await as(f.users.studioB, () => saveEvent(aNewEvent(f.venueId, "אירוע של ב באולם של א")));
  const [{ name }] = await db().select({ name: schema.venues.name }).from(schema.venues).where(eq(schema.venues.id, f.venueId));
  await as(f.users.studioB, () => renameVenue(f.venueId, name));
  await as(f.ownerA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  const renamed = await refusalOf(as(f.users.studioB, () => renameVenue(f.venueId, `${name} ב`)));
  assert(renamed instanceof Error, "a guest manager can no longer change the closed business's venue");
  const listed = (await as(f.users.studioB, () => fetchVenues())).find((v) => v.id === f.venueId);
  assert(
    listed?.access === "viewer" && listed.ownerClosed === true,
    `B still reads it, marked closed (${JSON.stringify(listed && { access: listed.access, ownerClosed: listed.ownerClosed })})`,
  );
});

// ── the erase ───────────────────────────────────────────────────────────────────────────────────

const DAY = 86400000;
const later = (days: number) => new Date(Date.now() + days * DAY);

/** Every row of these businesses in every table that has organization_id, keyed "table id". */
async function rowsOfOrgs(orgIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = orgIds.map((o) => `'${o}'`).join(",");
  for (const [table, rule] of Object.entries(ACCOUNT_TABLES)) {
    if (rule.reach !== "org") continue;
    const rows = (await db().execute(sql.raw(`select * from "${table}" where organization_id in (${list})`))) as unknown as Record<string, unknown>[];
    for (const row of rows) out.set(`${table} ${String(row.id ?? JSON.stringify(row))}`, JSON.stringify(row));
  }
  return out;
}

async function countOf(table: string, orgId: string): Promise<number> {
  const rows = (await db().execute(sql.raw(`select count(*)::int as n from "${table}" where organization_id = '${orgId}'`))) as unknown as { n: number }[];
  return rows[0].n;
}

/** Everything §8 asks of the other side, set up before A closes. */
async function setUpTheOtherSide(f: Fixture) {
  const bEvent = aNewEvent(f.venueId, "אירוע של ב באולם של א");
  await as(f.users.studioB, () => saveEvent(bEvent));
  const [drawing] = await db().select({ content: schema.designDocuments.content }).from(schema.designDocuments).where(eq(schema.designDocuments.eventId, f.eventId)).limit(1);
  const sketches = await as(f.users.studioB, () => saveSketchTemplate({ name: "סקיצה של ב", venueId: f.spareVenueId, content: drawing.content }));
  const sketchId = (sketches as { id: string }[])[0].id;
  const meetingId = randomUUID();
  await as(f.users.studioB, () => saveAppointment({ ...f.appointment, id: meetingId, eventId: undefined, venueId: f.spareVenueId } as Appointment));
  const supplierId = randomUUID();
  await db().insert(schema.suppliers).values({ id: supplierId, organizationId: f.orgB, name: "ספק של ב", linkedOrgId: f.orgA });
  const bVenue = randomUUID();
  await db().insert(schema.venues).values({ id: bVenue, organizationId: f.orgB, name: "אולם של ב", plan: emptyPlan() });
  await as(f.ownerA, () => followVenue(bVenue));
  const shared = await as(f.ownerA, () => shareEventWithClient(f.eventId, { name: "לקוחה ממתינה", email: `pending-${randomUUID()}@example.test` }));
  const pendingClient = (shared as { userId?: string }).userId!;
  return { bEvent, sketchId, meetingId, supplierId, bVenue, pendingClient };
}

async function closeAndSweep(owner: string, orgId: string, days = 31) {
  const name = await nameOf(orgId);
  const closed = await as(owner, () => closeBusiness({ confirmName: name }));
  assert("eraseAfter" in closed, `closed ${orgId}`);
  return sweepAccounts({ now: later(days), dryRun: false });
}

step("the sweep erases a due business and keeps exactly what is retained", async (f) => {
  const other = await setUpTheOtherSide(f);
  const bBefore = await rowsOfOrgs([f.orgB, f.orgB2, f.orgB3]);
  const docsBefore = await db().select().from(schema.billingDocuments).where(eq(schema.billingDocuments.organizationId, f.orgA));
  const docEvents = [...new Set(docsBefore.map((d) => d.eventId))];
  const keptDesigns = [...new Set(docsBefore.map((d) => d.designDocumentId).filter(Boolean))] as string[];
  const [settings] = await db().select().from(schema.studioSettings).where(eq(schema.studioSettings.organizationId, f.orgA));
  const [event] = await db().select().from(schema.events).where(eq(schema.events.id, f.eventId));

  const report = await closeAndSweep(f.ownerA, f.orgA);
  assert(report.erased.includes(f.orgA), `A was erased (${JSON.stringify(report)})`);

  // Exactly the retained set.
  const allowed: Record<string, number> = {
    organization_closures: 1,
    billing_documents: docsBefore.length,
    events: docEvents.length,
    design_documents: keptDesigns.length,
    venues: 1,
  };
  for (const [table, rule] of Object.entries(ACCOUNT_TABLES)) {
    if (rule.reach !== "org" || table === "venue_structures" || table === "zones") continue;
    const n = await countOf(table, f.orgA);
    assert(n === (allowed[table] ?? 0), `${table}: ${n} rows of A left (expected ${allowed[table] ?? 0})`);
  }
  const [org] = await db().select().from(schema.organizations).where(eq(schema.organizations.id, f.orgA));
  assert(org, "the organisation row stays as the tombstone");
  const [kept] = await db().select().from(schema.venues).where(eq(schema.venues.organizationId, f.orgA));
  assert(kept.id === f.venueId, "the venue B stands in is the one kept");
  assert((await db().select().from(schema.venueGrants).where(eq(schema.venueGrants.venueId, f.venueId))).length === 0, "nobody may edit it");

  const [closure] = await db().select().from(schema.organizationClosures).where(eq(schema.organizationClosures.organizationId, f.orgA));
  assert(closure.erasedAt && closure.retainUntil, "erased, with a retention date");
  assert(closure.issuer?.businessName === settings.businessName && closure.issuer?.businessNumber === settings.businessNumber, "the issuer was snapshotted");
  assert(Object.keys(closure.printed ?? {}).length === docEvents.length, "the printed facts of every retained event");

  const docsAfter = await db().select().from(schema.billingDocuments).where(eq(schema.billingDocuments.organizationId, f.orgA));
  for (const d of docsBefore) {
    const a = docsAfter.find((x) => x.id === d.id)!;
    const { issuedBy: _1, ...x } = d;
    const { issuedBy: _2, ...y } = a;
    assert(JSON.stringify(x) === JSON.stringify(y), `document ${d.series} ${d.number} unchanged`);
  }
  const [skeleton] = await db().select().from(schema.events).where(eq(schema.events.id, f.eventId));
  assert(skeleton.clientName === event.clientName && skeleton.eventDate === event.eventDate && skeleton.eventType === event.eventType, "the skeleton keeps what is printed");
  assert(skeleton.phone === "" && skeleton.venueId === null && skeleton.contactName === null, "and nothing else");

  assert((await db().select().from(schema.users).where(eq(schema.users.organizationId, f.orgA))).length === 0, "no member of A is left");
  assert((await db().select().from(schema.users).where(eq(schema.users.id, other.pendingClient))).length === 0, "A's unanswered client invitation went");
  assert((await db().select().from(schema.users).where(eq(schema.users.id, f.clientC))).length === 1, "an accepted client keeps their login");
  assert((await db().select().from(schema.eventClients).where(eq(schema.eventClients.userId, f.clientC))).length === 0, "with nothing of A's shared");
  assert((await listLocalFiles(`${f.orgA}/`)).length === 0, "A's files are gone");
  assert((await db().select().from(schema.venueGrants).where(eq(schema.venueGrants.venueId, other.bVenue))).length === 0, "A's grant on B's venue went");

  // B: unchanged but for the links to what is gone.
  const bAfter = await rowsOfOrgs([f.orgB, f.orgB2, f.orgB3]);
  const expected = new Map([
    [`sketch_templates ${other.sketchId}`, "venue_id"],
    [`appointments ${other.meetingId}`, "venue_id"],
    [`suppliers ${other.supplierId}`, "linked_org_id"],
  ]);
  for (const [key, before] of bBefore) {
    const after = bAfter.get(key);
    assert(after !== undefined, `B's ${key} is still there`);
    if (after === before) continue;
    const column = expected.get(key);
    assert(column !== undefined, `B's ${key} changed: ${before} → ${after}`);
    const b = JSON.parse(before);
    assert(JSON.stringify({ ...b, [column]: null }) === after, `only ${key}.${column} went null`);
  }
  for (const key of expected.keys()) assert(bAfter.get(key) !== bBefore.get(key), `${key} lost its link`);
  const [bEventAfter] = await db().select().from(schema.events).where(eq(schema.events.id, other.bEvent.id));
  assert(bEventAfter.venueId === f.venueId, "B's event still stands in A's venue");
});

step("a dry run says what would go and changes nothing", async (f) => {
  const name = await nameOf(f.orgA);
  await as(f.ownerA, () => closeBusiness({ confirmName: name }));
  const before = await rowsOfOrgs([f.orgA]);
  const report = await sweepAccounts({ now: later(31), dryRun: true });
  const plan = report.plan?.[f.orgA];
  assert(plan && (plan.delete.events ?? 0) > 0 && (plan.keep.billing_documents ?? 0) > 0, `a plan for A (${JSON.stringify(plan)})`);
  assert(report.erased.length === 0, "nothing reported erased");
  const after = await rowsOfOrgs([f.orgA]);
  assert([...before].every(([k, v]) => after.get(k) === v) && after.size === before.size, "not a row changed");
});

step("a venue business's erase tells the linked designer", async (f) => {
  await closeAndSweep(f.venueUserV, f.orgV);
  const bells = await notificationsOf(f.ownerA, "link.venue_closed");
  assert(bells.length === 1 && bells[0].eventId === f.linkedEventId, `the designer's bell names their event (${JSON.stringify(bells)})`);
  assert((await db().select().from(schema.events).where(eq(schema.events.id, f.linkedEventId))).length === 1, "the designer's event stays");
  assert((await db().select().from(schema.eventLinks).where(eq(schema.eventLinks.studioEventId, f.linkedEventId))).length === 0, "unlinked");
});

step("the sweep twice: nothing more, and files left behind are finished", async (f) => {
  const stuck = `${f.orgA}/product/${randomUUID()}.webp`;
  await writeLocalFile(stuck, Buffer.from("x"));
  const real = fileDriver();
  const failing = { list: real.list, remove: async (key: string) => (key === stuck ? Promise.reject(new Error("locked")) : real.remove(key)) };
  const name = await nameOf(f.orgA);
  await as(f.ownerA, () => closeBusiness({ confirmName: name }));
  const first = await sweepAccounts({ now: later(31), dryRun: false, files: failing });
  assert(first.erased.includes(f.orgA) && first.filesPending.includes(f.orgA), `the first sweep left a file (${JSON.stringify(first)})`);
  const rowsBefore = await rowsOfOrgs([f.orgA]);
  const second = await sweepAccounts({ now: later(31), dryRun: false });
  assert(second.erased.length === 0, "nothing erased twice");
  const rowsAfter = await rowsOfOrgs([f.orgA]);
  const changed = [...rowsBefore].filter(([k, v]) => rowsAfter.get(k) !== v && !k.startsWith("organization_closures"));
  assert(changed.length === 0, `no row changed (${changed.map(([k]) => k).join(", ")})`);
  assert((await listLocalFiles(`${f.orgA}/`)).length === 0, "the stuck file is gone");
  const [closure] = await db().select().from(schema.organizationClosures).where(eq(schema.organizationClosures.organizationId, f.orgA));
  assert(closure.filesErasedAt, "and the files are stamped done");
});

step("a business that is not due keeps its Google connections; an erased one loses them", async (f) => {
  // The sweep reads the due list once; a business reopened while another was being erased reached
  // eraseBusiness with no closure — and its members' connections were revoked and deleted BEFORE the
  // locked re-check said "not due" (PR #5 review).
  const connect = async (userId: string) => {
    await db().insert(schema.googleConnections).values({
      userId,
      organizationId: f.orgA,
      googleEmail: `g-${randomUUID()}@example.test`,
      refreshToken: "sealed-token",
      calendarId: `cal-${randomUUID()}`,
    } as never);
  };
  await connect(f.memberA);
  const connectionsOfA = async () =>
    (await db().select({ id: schema.googleConnections.id }).from(schema.googleConnections).where(eq(schema.googleConnections.organizationId, f.orgA))).length;
  assert((await eraseBusiness(f.orgA, later(31))) === false, "an open business is not erased");
  assert((await connectionsOfA()) === 1, "…and its member's Google connection is untouched");

  await as(f.ownerA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  const report = await sweepAccounts({ now: later(31), dryRun: false });
  assert(report.erased.includes(f.orgA), "the closed business is erased when due");
  assert((await connectionsOfA()) === 0, "…and its Google connections go with it");
});

step("the erase ends the erased designer's links for good", async (f) => {
  await closeAndSweep(f.ownerA, f.orgA);
  const [link] = await db().select().from(schema.eventLinks).where(eq(schema.eventLinks.id, f.linkId));
  assert(
    link?.state === "ended" && link.studioEventId === null,
    `the link is ended and lets go of the event (${JSON.stringify(link && { state: link.state, studioEventId: link.studioEventId })})`,
  );
});

step("a business whose files cannot be listed does not stop the sweep", async (f) => {
  const real = fileDriver();
  const broken = {
    list: (prefix: string) => (prefix.startsWith(f.orgA) ? Promise.reject(new Error("list failed")) : real.list(prefix)),
    remove: real.remove,
  };
  await as(f.ownerA, async () => closeBusiness({ confirmName: await nameOf(f.orgA) }));
  await as(f.supplierUserS, async () => closeBusiness({ confirmName: await nameOf(f.orgS) }));
  const report = await sweepAccounts({ now: later(31), dryRun: false, files: broken });
  assert(report.erased.includes(f.orgA) && report.erased.includes(f.orgS), `both erased (${JSON.stringify(report)})`);
  assert(report.filesPending.includes(f.orgA), "A's files wait for the next run");
  // S had nothing to keep, so it may be gone altogether — either way its files were finished.
  const [s] = await db().select().from(schema.organizationClosures).where(eq(schema.organizationClosures.organizationId, f.orgS));
  assert(!report.filesPending.includes(f.orgS) && (report.gone.includes(f.orgS) || s?.filesErasedAt), "S's files were finished all the same");
});

step("an unused venue goes, and when retention is over nothing is left", async (f) => {
  const other = await setUpTheOtherSide(f);
  await closeAndSweep(f.ownerA, f.orgA);
  await as(f.users.studioB, () => saveEvent({ ...other.bEvent, venueId: undefined, zoneIds: [] }));
  const moved = await sweepAccounts({ now: later(31), dryRun: false });
  assert(moved.venuesGone.includes(f.venueId), `the venue went once no event stood in it (${JSON.stringify(moved)})`);
  const [closure] = await db().select().from(schema.organizationClosures).where(eq(schema.organizationClosures.organizationId, f.orgA));
  const over = new Date(`${closure.retainUntil}T00:00:00Z`).getTime() + 2 * DAY;
  // A file a failed venue delete left behind, with no record of it anywhere.
  await writeLocalFile(`${f.orgA}/underlay/${randomUUID()}.webp`, Buffer.from("x"));
  const end = await sweepAccounts({ now: new Date(over), dryRun: false });
  assert(end.retentionOver.includes(f.orgA) && end.gone.includes(f.orgA), `retention over, gone (${JSON.stringify(end)})`);
  for (const table of ["billing_documents", "events", "design_documents", "organization_closures"]) {
    assert((await countOf(table, f.orgA)) === 0, `${table}: nothing of A`);
  }
  assert((await db().select().from(schema.organizations).where(eq(schema.organizations.id, f.orgA))).length === 0, "the organisation row too");
  assert((await listLocalFiles(`${f.orgA}/`)).length === 0, "and nothing of A is left in storage");
});

// ── the export ──────────────────────────────────────────────────────────────────────────────────

step("the export carries the whole business and no secret", async (f) => {
  const d = await exportData(f.orgA);
  const aEvents = await db().select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.organizationId, f.orgA));
  assert((d.tables.events ?? []).length === aEvents.length, `every event of A (${d.tables.events?.length} / ${aEvents.length})`);
  assert((d.tables.events ?? []).every((e) => e.organization_id === f.orgA), "and only A's");
  for (const [table, rows] of Object.entries(d.tables)) {
    assert(!table.startsWith("auth_"), `${table} is never exported`);
    for (const row of rows) for (const col of Object.keys(row)) assert(!isSecretColumn(col), `${table}.${col} is a secret`);
  }
  assert((d.tables.users ?? []).length >= 2 && (d.tables.users ?? []).every((u) => !("password_hash" in u)), "the people, without credentials");
  assert((d.tables.billing_documents ?? []).length > 0 && (d.tables.design_documents ?? []).length > 0, "documents and drawings");
  assert(d.clientAccounts.some((c) => c.eventId === f.eventId), "the client accounts its events are shared with");
  assert(d.meta.business === (await nameOf(f.orgA)), "the business's name");

  await as(f.users.studioB, () => saveEvent(aNewEvent(f.venueId, "אירוע של ב באולם של א")));
  const b = await exportData(f.orgB);
  assert(b.venuesUsed.some((v) => v.id === f.venueId), "B's export carries the venue of A's its event stands in");
  assert(!JSON.stringify(b.tables).includes(f.orgA), "and nothing else of A's");

  const asMember = await as(f.memberA, () => exportRoute());
  assert(asMember.status === 403, `a member is refused (${asMember.status})`);
  const asOwner = await as(f.ownerA, () => exportRoute());
  assert(asOwner.status === 200 && ((await asOwner.json()) as { meta: { business: string } }).meta.business === d.meta.business, "the owner gets it");
  const log = await as(f.ownerA, () => fetchAuditLog());
  assert(log.rows.some((r) => r.action === "export.downloaded"), "the download is in the log");

  // Closed, the owner still takes it.
  const name = await nameOf(f.orgA);
  await as(f.ownerA, () => closeBusiness({ confirmName: name }));
  assert((await as(f.ownerA, () => exportRoute())).status === 200, "the owner of a closed business still downloads it");
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
