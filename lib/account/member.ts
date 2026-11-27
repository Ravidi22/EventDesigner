// Erasing one person (EVE-22, spec §5.6–5.7): a member who deletes their own account, one the owner
// removes, a client who deletes their login. A PLAIN module, never "use server": it takes ids and
// trusts them — the callers (Better Auth's delete-user hook, the owner's removeMember) have proved who
// is acting.
//
// What the database does by itself when the users row goes: sessions, accounts, venue grants, crew
// rows, notifications, the Google connection and a client's event access CASCADE; the person's name
// on past work (proposals, scene links, billing documents, link invitations) is SET NULL and drawn as
// FORMER_MEMBER / FORMER_CLIENT. What this module adds before the row goes: the audit row, the name
// wiped from the business's audit log, the Google token revoked, and the bells.
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventClients, events, users } from "@/lib/db/schema";
import { forgetPerson, peopleOf, recordAudit, type Database } from "@/lib/audit/write";
import { personToken } from "@/lib/audit/render";
import { disconnect } from "@/lib/google/sync";
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

/** Everything that must happen before a person's row is deleted. `by` is "self" for their own
 *  delete-account, else the owner who removed them. */
export async function beforePersonErased(database: Database, person: PersonRow, by: "self" | { ownerId: string }): Promise<void> {
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
    // Best effort: revoke the Google token and forget the connection. The calendar Eve created stays
    // in their own Google account — it is theirs (ruling, Task 5).
    await disconnect(person.id, org).catch((e) => console.error("google disconnect on erase failed", e));
    if (by === "self") {
      const owners = await database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.organizationId, org), eq(users.role, "owner"), ne(users.id, person.id)));
      await notify(
        owners.map((o) => o.id),
        { kind: "member.left", organizationId: org, eventId: null, payload: { actorName: label } },
      );
    }
    return;
  }
  // A client: every studio whose event they were on hears it once per event. Their records about
  // the client are the studio's own and are not touched.
  const shared = await database
    .select({ eventId: events.id, organizationId: events.organizationId, eventLabel: events.clientName })
    .from(eventClients)
    .innerJoin(events, eq(events.id, eventClients.eventId))
    .where(eq(eventClients.userId, person.id));
  for (const e of shared) {
    await notify(await studioRecipients(e.organizationId), {
      kind: "client.left",
      organizationId: e.organizationId,
      eventId: e.eventId,
      payload: { actorName: label, eventLabel: e.eventLabel },
    });
  }
}

/** The owner removes a member: the steps above, then the row, in one transaction. Never the owner's
 *  own row, never a client, never another business's person. True when someone was removed. */
export async function eraseMember(organizationId: string, userId: string, ownerId: string): Promise<boolean> {
  return db().transaction(async (tx) => {
    const person = await personRow(tx, userId);
    if (!person || person.kind !== "studio" || person.organizationId !== organizationId || person.role === "owner") return false;
    await beforePersonErased(tx, person, { ownerId });
    const gone = await tx
      .delete(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), eq(users.kind, "studio"), ne(users.role, "owner")))
      .returning({ id: users.id });
    return gone.length > 0;
  });
}
