"use server";
// Sharing an event with its clients — the STUDIO's side of event_clients.
//
// A row there is the whole client permission model (see the schema note): it is how the couple
// comes to see their sketch, and deleting it is how that is taken back. Nothing else in the studio
// writes one. The client's own reads, scoped by these rows, are lib/client-portal/actions.ts.
//
// No email exists yet (docs/roadmap.md §3), so sharing works the way the team's invitations do: a
// client account is a real `users` row with no password and a hashed invitation token, and the
// designer copies or WhatsApps the link (/join/<token>), shown once. A client who already has an
// account simply gains the event — they see it next time they sign in, and their bell says so.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { eventClients, events, organizations, users } from "@/lib/db/schema";
import { invitePath, mintInviteToken } from "@/lib/auth/invite-token";
import { notify } from "@/lib/notifications/write";
import type { ClientRole } from "@/lib/client-portal/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${field} must be a uuid`);
}
const isRole = (r: unknown): r is ClientRole => r === "viewer" || r === "editor";

/** A person the event is shared with, as the drawer lists them. */
export interface EventClientRow {
  userId: string;
  name: string | null;
  email: string;
  /** Has set a password — false while the invitation is still open. */
  joined: boolean;
  role: ClientRole;
  sharedAt: string;
}

export interface ShareResult {
  clients: EventClientRow[];
  /** The invitation link, shown ONCE — only for someone who has no password yet. */
  link?: string;
  error?: string;
}

/** The studio member doing this, and the event, proven to be the studio's. Crew do not share. */
async function ownEvent(eventId: string) {
  assertId(eventId, "eventId");
  const actor = await currentActor();
  if (actor.role === "crew") throw new Error("crew cannot share events");
  const [event] = await db()
    .select({ id: events.id, clientName: events.clientName, studio: organizations.name })
    .from(events)
    .leftJoin(organizations, eq(organizations.id, events.organizationId))
    .where(and(eq(events.id, eventId), eq(events.organizationId, actor.organizationId)))
    .limit(1);
  if (!event) throw new Error("no such event");
  return { actor, event };
}

async function clientsOf(eventId: string): Promise<EventClientRow[]> {
  const rows = await db()
    .select({ userId: users.id, name: users.name, email: users.email, state: users.state, role: eventClients.role, sharedAt: eventClients.sharedAt })
    .from(eventClients)
    .innerJoin(users, eq(users.id, eventClients.userId))
    .where(eq(eventClients.eventId, eventId))
    .orderBy(asc(eventClients.sharedAt));
  return rows.map((r) => ({ userId: r.userId, name: r.name, email: r.email, joined: r.state === "active", role: r.role as ClientRole, sharedAt: r.sharedAt.toISOString() }));
}

export async function fetchEventClients(eventId: string): Promise<EventClientRow[]> {
  const { event } = await ownEvent(eventId);
  return clientsOf(event.id);
}

/**
 * Share the event with a client by email.
 *
 *   • nobody has the address → a client account is created, pending, with an invitation link;
 *   • a client still pending → their link is re-minted (the old one stops working) and returned;
 *   • a client who has joined → the event is simply theirs too, and their bell says so;
 *   • a STUDIO account → refused: one email is one account, and a designer is not made someone's
 *     client by a row (the same line inviteMember draws the other way).
 */
export async function shareEventWithClient(eventId: string, input: { name: string; email: string; role?: ClientRole }): Promise<ShareResult> {
  const { actor, event } = await ownEvent(eventId);
  const address = String(input?.email ?? "").trim().toLowerCase();
  const name = String(input?.name ?? "").trim() || null;
  const role: ClientRole = isRole(input?.role) ? input.role : "editor";
  if (!EMAIL_RE.test(address)) return { error: "כתובת אימייל לא תקינה", clients: await clientsOf(event.id) };

  const database = db();
  const [existing] = await database
    .select({ id: users.id, kind: users.kind, state: users.state })
    .from(users)
    .where(eq(users.email, address))
    .limit(1);
  if (existing && existing.kind !== "client") {
    return { error: "הכתובת הזאת שייכת לחשבון סטודיו ולא יכולה לשמש כחשבון לקוח", clients: await clientsOf(event.id) };
  }

  let userId = existing?.id;
  let link: string | undefined;
  if (!existing) {
    const invite = mintInviteToken();
    const [row] = await database
      .insert(users)
      .values({
        organizationId: null,
        kind: "client",
        email: address,
        name,
        state: "pending",
        passwordHash: null,
        inviteTokenHash: invite.tokenHash,
        inviteExpiresAt: invite.expiresAt,
        joinedAt: null,
      })
      .returning({ id: users.id });
    userId = row.id;
    link = invitePath(invite.token);
  } else if (existing.state === "pending") {
    const invite = mintInviteToken();
    await database
      .update(users)
      .set({ inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt, ...(name ? { name } : {}) })
      .where(and(eq(users.id, existing.id), eq(users.state, "pending")));
    link = invitePath(invite.token);
  }

  const [added] = await database
    .insert(eventClients)
    .values({ eventId: event.id, userId: userId!, role })
    .onConflictDoNothing()
    .returning({ userId: eventClients.userId });

  // Someone who already signs in hears about it; a pending account will see it when they join.
  if (added && existing?.state === "active") {
    await notify([existing.id], {
      kind: "event.shared",
      organizationId: actor.organizationId,
      eventId: event.id,
      payload: { actorName: event.studio ?? "", eventLabel: event.clientName },
    });
  }
  return { clients: await clientsOf(event.id), ...(link ? { link } : {}) };
}

/** A fresh link for a client who has not joined yet. The previous link stops working. */
export async function regenerateClientInvite(eventId: string, userId: string): Promise<ShareResult> {
  const { event } = await ownEvent(eventId);
  assertId(userId, "userId");
  const invite = mintInviteToken();
  // Only a pending CLIENT this event is shared with — never a way to reset anybody else's account.
  const [shared] = await db()
    .select({ userId: eventClients.userId })
    .from(eventClients)
    .where(and(eq(eventClients.eventId, event.id), eq(eventClients.userId, userId)))
    .limit(1);
  const [row] = shared
    ? await db()
        .update(users)
        .set({ inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt })
        .where(and(eq(users.id, userId), eq(users.kind, "client"), eq(users.state, "pending")))
        .returning({ id: users.id })
    : [];
  const clients = await clientsOf(event.id);
  if (!row) return { error: "הלקוח כבר הצטרף — הוא נכנס עם הסיסמה שלו", clients };
  return { clients, link: invitePath(invite.token) };
}

export async function setEventClientRole(eventId: string, userId: string, role: ClientRole): Promise<EventClientRow[]> {
  const { event } = await ownEvent(eventId);
  assertId(userId, "userId");
  if (!isRole(role)) throw new Error("role must be viewer | editor");
  await db().update(eventClients).set({ role }).where(and(eq(eventClients.eventId, event.id), eq(eventClients.userId, userId)));
  return clientsOf(event.id);
}

/** Take the event back from a client. Their account stays — it may hold other events. */
export async function unshareEventClient(eventId: string, userId: string): Promise<EventClientRow[]> {
  const { event } = await ownEvent(eventId);
  assertId(userId, "userId");
  await db().delete(eventClients).where(and(eq(eventClients.eventId, event.id), eq(eventClients.userId, userId)));
  return clientsOf(event.id);
}
