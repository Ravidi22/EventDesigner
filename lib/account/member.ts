// Erasing one person (EVE-22, spec §5.6–5.7): a member who deletes their own account, one the owner
// removes, a client who deletes their login. A PLAIN module, never "use server": it takes ids and
// trusts them — the callers (Better Auth's delete-user hook, the owner's removeMember) have proved who
// is acting.
//
// What the database does by itself when the users row goes: sessions, accounts, venue grants, crew
// rows, notifications, the Google connection and a client's event access CASCADE; the person's name
// on past work (proposals, scene links, billing documents, link invitations) is SET NULL and drawn as
// FORMER_MEMBER / FORMER_CLIENT. What this module adds before the row goes: the audit row and the name
// wiped from the business's audit log. What it adds only AFTER the row is gone — never before, since
// a delete that fails must not have done anything that cannot be taken back: the Google token
// revoked, and the bells (PR #5 re-review).
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventClients, events, users } from "@/lib/db/schema";
import { forgetPerson, forgetPersonEverywhere, peopleOf, recordAudit, type Database } from "@/lib/audit/write";
import { personToken } from "@/lib/audit/render";
import { refreshTokensOf, revokeRefreshTokens } from "@/lib/google/sync";
import { notify, studioRecipients } from "@/lib/notifications/write";

export interface PersonRow {
  id: string;
  organizationId: string | null;
  kind: "studio" | "client";
  name: string | null;
  email: string;
  role: "owner" | "designer" | "crew";
}

export async function personRow(database: Database, userId: string): Promise<PersonRow | null> {
  const [row] = await database
    .select({ id: users.id, organizationId: users.organizationId, kind: users.kind, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { ...row, kind: row.kind === "studio" ? "studio" : "client" };
}

/** What to do once the person's row has been deleted — and only then. */
export type AfterErased = () => Promise<void>;

/** Everything that must happen before a person's row is deleted, in the same transaction as the delete
 *  where there is one. `by` is "self" for their own delete-account, else the owner who removed them.
 *
 *  Returns what must wait until the row is gone: revoking their Google token at Google, and the bells.
 *  Both used to run here — the revoke as an HTTP call plus a delete on a connection of its own, while
 *  the caller's transaction was still open — so a removal whose delete then failed left the member
 *  with no calendar sync and the owners told they had left (PR #5 re-review). The Google connection
 *  row itself cascades with the person. */
export async function beforePersonErased(database: Database, person: PersonRow, by: "self" | { ownerId: string }): Promise<AfterErased> {
  const label = person.name || person.email;
  if (person.kind === "studio" && person.organizationId) {
    const org = person.organizationId;
    const actor = by === "self" ? person.id : by.ownerId;
    await recordAudit(database, {
      organizationId: org,
      actorUserId: actor,
      action: by === "self" ? "member.self_deleted" : "member.removed",
      target: { kind: "user", id: person.id },
      summary: by === "self" ? `מחיקת חשבון: ${personToken(person.id)}` : `הסרה מהצוות: ${personToken(person.id)}`,
      people: { ...(await peopleOf(database, [actor])), [person.id]: { name: null, kind: "member" } },
    });
    // The rows stay; the name goes from every one of them.
    await forgetPerson(database, org, person.id);
    // Read while the connection exists (it goes with the person), revoked once they are gone. The
    // calendar Eve created stays in their own Google account — it is theirs (ruling, Task 5).
    const tokens = await refreshTokensOf(database, org, person.id);
    const owners =
      by === "self"
        ? await database
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.organizationId, org), eq(users.role, "owner"), ne(users.id, person.id)))
        : [];
    return async () => {
      // Best effort, both: the person is already gone, and nothing here can bring them back.
      await revokeRefreshTokens(tokens).catch((e) => console.error("google revoke on erase failed", e));
      if (owners.length) {
        await notify(
          owners.map((o) => o.id),
          { kind: "member.left", organizationId: org, eventId: null, payload: { actorName: label } },
        );
      }
    };
  }
  // A client: their name leaves every studio's log (they are a token there, like a member), and
  // every studio whose event they were on hears it once per event — once they are gone. The events
  // are read now, because their access rows go with them. The studio's own records about the
  // client — the event's name and phone, its documents — are its own and are not touched.
  await forgetPersonEverywhere(database, person.id);
  const shared = await database
    .select({ eventId: events.id, organizationId: events.organizationId, eventLabel: events.clientName })
    .from(eventClients)
    .innerJoin(events, eq(events.id, eventClients.eventId))
    .where(eq(eventClients.userId, person.id));
  return async () => {
    for (const e of shared) {
      await notify(await studioRecipients(e.organizationId), {
        kind: "client.left",
        organizationId: e.organizationId,
        eventId: e.eventId,
        payload: { actorName: label, eventLabel: e.eventLabel },
      });
    }
  };
}

/** The owner removes a member: the steps above, then the row, in one transaction — and what waits for
 *  the row to be gone, once that has committed. Never the owner's own row, never a client, never
 *  another business's person. True when someone was removed. */
export async function eraseMember(organizationId: string, userId: string, ownerId: string): Promise<boolean> {
  const done = await db().transaction(async (tx) => {
    const person = await personRow(tx, userId);
    if (!person || person.kind !== "studio" || person.organizationId !== organizationId || person.role === "owner") return null;
    const after = await beforePersonErased(tx, person, { ownerId });
    const gone = await tx
      .delete(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), eq(users.kind, "studio"), ne(users.role, "owner")))
      .returning({ id: users.id });
    return gone.length > 0 ? after : null;
  });
  if (!done) return false;
  await done();
  return true;
}
