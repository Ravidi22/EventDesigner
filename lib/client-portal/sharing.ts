"use server";
// Sharing an event with the people whose event it is — the STUDIO's side of the client portal.
//
// The only door a client account has. Event owners do not sign up on their own (lib/auth/actions.ts):
// a designer invites them from the event, which writes the event_clients row that is the client's
// whole permission (lib/client-portal/actions.ts joins on it), and, for someone new, a pending
// account with an invitation link — the same link mechanism as a team invitation (/join/<token>),
// so the person sets a password on a screen that already knows who they are and which event it is.
//
// EVERY EXPORT IS A PUBLIC POST ENDPOINT. Each starts with currentActor(), checks the event belongs
// to the actor's studio, and refuses crew (who see events but do not decide who else does).
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { revalidateEvents } from "@/lib/db/revalidate";
import { eventClients, events, organizations, studioSettings, users } from "@/lib/db/schema";
import { INVITE_TTL_DAYS, hashInviteToken, invitePath, mintInviteToken } from "@/lib/auth/invite-token";
import { currentSession } from "@/lib/auth/session";
import { emailConfig } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";
import { clientInvitationEmail } from "@/lib/email/templates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One person an event is shared with, as the studio sees them. */
export interface EventClient {
  userId: string;
  name: string | null;
  email: string;
  /** pending = invited, has not set a password yet; active = has an account. */
  state: "pending" | "active";
}

export interface ShareResult {
  error?: string;
  clients: EventClient[];
  /** A fresh invitation path (`/join/<token>`), present only when one was just minted — shown once. */
  link?: string;
  /** Who the link is for. */
  userId?: string;
}

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** The actor, if they may share THIS event: a member of its studio who is not crew. */
async function sharer(eventId: string) {
  assertId(eventId, "eventId");
  const actor = await currentActor();
  if (actor.role === "crew") throw new Error("crew cannot share events");
  const [event] = await db()
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizationId, actor.organizationId)))
    .limit(1);
  if (!event) throw new Error("event not found");
  return actor;
}

async function clientsOf(eventId: string): Promise<EventClient[]> {
  const rows = await db()
    .select({ userId: users.id, name: users.name, email: users.email, state: users.state })
    .from(eventClients)
    .innerJoin(users, eq(users.id, eventClients.userId))
    .where(eq(eventClients.eventId, eventId))
    .orderBy(asc(eventClients.sharedAt));
  return rows.map((r) => ({ ...r, state: r.state === "active" ? "active" : "pending" }));
}

/** Who this event is shared with — and whether this deployment can mail an invitation, so the card
 *  offers "send by email" only where it can work. */
export async function fetchEventClients(eventId: string): Promise<{ clients: EventClient[]; emailEnabled: boolean }> {
  await sharer(eventId);
  return { clients: await clientsOf(eventId), emailEnabled: emailConfig() !== null };
}

/**
 * Share the event with someone by email.
 *
 * Three cases, by what the address already is:
 *   - nobody: a pending client account with an invitation link (returned once, like the team's);
 *   - a client already (of this studio or another): just the event_clients row — they sign in as
 *     they always do and find it there; if they are still pending, a fresh link replaces the old;
 *   - a STUDIO account: refused. One email is one account of one kind (lib/auth/kinds.ts), and a
 *     studio member cannot be a client too.
 */
export async function inviteEventClient(eventId: string, name: string, email: string): Promise<ShareResult> {
  await sharer(eventId);
  const address = String(email ?? "").trim().toLowerCase();
  const displayName = String(name ?? "").trim() || null;
  if (!EMAIL_RE.test(address)) return { error: "כתובת אימייל לא תקינה", clients: await clientsOf(eventId) };

  const database = db();
  const [existing] = await database
    .select({ id: users.id, kind: users.kind, state: users.state })
    .from(users)
    .where(eq(users.email, address))
    .limit(1);

  if (existing?.kind === "studio") {
    return { error: "הכתובת הזו שייכת לחשבון של סטודיו, ולא יכולה לשמש כחשבון לקוח", clients: await clientsOf(eventId) };
  }

  let userId: string;
  let token: string | null = null;
  if (!existing) {
    const invite = mintInviteToken();
    const [row] = await database
      .insert(users)
      .values({
        organizationId: null,
        kind: "client",
        email: address,
        name: displayName,
        state: "pending",
        inviteTokenHash: invite.tokenHash,
        inviteExpiresAt: invite.expiresAt,
      })
      .returning({ id: users.id });
    userId = row.id;
    token = invite.token;
  } else {
    userId = existing.id;
    if (existing.state === "pending") {
      // Still has no password: a fresh link, which also invalidates any older one.
      const invite = mintInviteToken();
      await database
        .update(users)
        .set({ inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt })
        .where(eq(users.id, userId));
      token = invite.token;
    }
  }

  await database.insert(eventClients).values({ eventId, userId }).onConflictDoNothing();
  revalidateEvents();
  return { clients: await clientsOf(eventId), link: token ? invitePath(token) : undefined, userId };
}

/** A new link for someone invited to this event who has not joined yet. The old link stops working. */
export async function regenerateClientInvite(eventId: string, userId: string): Promise<ShareResult> {
  await sharer(eventId);
  assertId(userId, "userId");
  const invite = mintInviteToken();
  const database = db();
  const [shared] = await database
    .select({ userId: eventClients.userId })
    .from(eventClients)
    .where(and(eq(eventClients.eventId, eventId), eq(eventClients.userId, userId)))
    .limit(1);
  const [row] = shared
    ? await database
        .update(users)
        .set({ inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt })
        .where(and(eq(users.id, userId), eq(users.kind, "client"), eq(users.state, "pending")))
        .returning({ id: users.id })
    : [];
  const clients = await clientsOf(eventId);
  if (!row) return { error: "אין הזמנה פתוחה לאדם הזה", clients };
  return { clients, link: invitePath(invite.token), userId };
}

/** Stop sharing this event with someone. Their account stays (they may have other events); this
 *  event simply disappears from their portal on the next request. */
export async function removeEventClient(eventId: string, userId: string): Promise<EventClient[]> {
  await sharer(eventId);
  assertId(userId, "userId");
  const database = db();
  await database.delete(eventClients).where(and(eq(eventClients.eventId, eventId), eq(eventClients.userId, userId)));
  // Someone who never joined and now has nothing shared with them is an invitation to nothing — and
  // a row that would block their address from ever being invited cleanly again. It goes.
  const [stillShared] = await database
    .select({ eventId: eventClients.eventId })
    .from(eventClients)
    .where(eq(eventClients.userId, userId))
    .limit(1);
  if (!stillShared) {
    await database.delete(users).where(and(eq(users.id, userId), eq(users.kind, "client"), eq(users.state, "pending")));
  }
  revalidateEvents();
  return clientsOf(eventId);
}

/**
 * Mail a just-minted client invitation to the person it was minted for. As with emailInvite
 * (lib/team/actions.ts) the token comes back from the screen, so it is the input to distrust: it
 * must hash to the pending row, and that row must be shared with this event of this studio.
 */
export async function emailClientInvite(
  eventId: string,
  userId: string,
  token: string,
): Promise<{ ok: true } | { error: string }> {
  const actor = await sharer(eventId);
  assertId(userId, "userId");
  const config = emailConfig();
  if (!config) return { error: "שליחת מיילים לא מוגדרת בשרת" };
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) throw new Error("bad token");

  const database = db();
  const [row] = await database
    .select({ email: users.email, hash: users.inviteTokenHash, expires: users.inviteExpiresAt })
    .from(eventClients)
    .innerJoin(users, eq(users.id, eventClients.userId))
    .where(and(eq(eventClients.eventId, eventId), eq(users.id, userId), eq(users.state, "pending")))
    .limit(1);
  if (!row || row.hash !== hashInviteToken(token) || !row.expires || row.expires < new Date()) {
    return { error: "הקישור הזה כבר לא בתוקף. הנפיקו קישור חדש ונסו שוב." };
  }

  const [studio] = await database
    .select({ businessName: studioSettings.businessName, orgName: organizations.name })
    .from(organizations)
    .leftJoin(studioSettings, eq(studioSettings.organizationId, organizations.id))
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  const studioName = studio?.businessName?.trim() || studio?.orgName?.trim() || "";
  const me = await currentSession();

  const message = clientInvitationEmail({
    studioName,
    url: `${config.appUrl}${invitePath(token)}`,
    expiresInDays: INVITE_TTL_DAYS,
  });
  const sent = await sendEmail({ to: row.email, ...message, fromName: studioName || "Eve", replyTo: me?.email });
  return sent.ok ? { ok: true } : { error: "המייל לא נשלח. אפשר להעתיק את הקישור או לשלוח בוואטסאפ." };
}
