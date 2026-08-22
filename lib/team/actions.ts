"use server";
// The studio's people, in Postgres.
//
// There is no `team` table: a studio member IS a `users` row with `kind = 'studio'` and an
// organizationId. That was already true — sign-up writes one — and the old localStorage list was a
// second, parallel set of people that agreed with the real accounts only by coincidence. It didn't:
// the account screen edited a fixture named "member-daniel" while the signed-in person sat in the
// database untouched.
//
// EVERY EXPORT HERE IS A PUBLIC POST ENDPOINT (see lib/catalog/actions.ts). So every one starts with
// currentActor(), scopes every statement by the organisation, and — because this file is the one
// that hands out access to the business itself — checks the caller's ROLE before it writes.
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { users } from "@/lib/db/schema";
import { invitePath, mintInviteToken } from "@/lib/auth/invite-token";
import {
  canManagePeople,
  isStudioRole,
  type InviteResult,
  type StudioMember,
  type StudioRole,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** The row shape the screens use. `state` is the database's word for it and `status` is the
 *  screen's; the enum comment in lib/db/schema.ts explains why there is only one column. */
function toMember(row: {
  id: string;
  name: string | null;
  email: string;
  role: StudioRole;
  state: "pending" | "active";
  joinedAt: string | null;
}): StudioMember {
  return {
    id: row.id,
    // An invited person who has not signed up yet may have no name — their address is the only
    // thing anyone knows about them, so it stands in rather than an empty avatar.
    name: row.name?.trim() || row.email.split("@")[0],
    email: row.email,
    role: row.role,
    status: row.state === "active" ? "active" : "invited",
    joinedAt: row.joinedAt ?? "",
  };
}

const MEMBER_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  state: users.state,
  joinedAt: users.joinedAt,
} as const;

/** Everyone who works in this studio, oldest first.
 *
 *  `kind = 'studio'` is not decoration: clients live in this table too (one person, one set of
 *  credentials — see the users comment in the schema), and a client of this studio must never
 *  appear in its staff list. */
async function membersOf(organizationId: string): Promise<StudioMember[]> {
  const rows = await db()
    .select(MEMBER_COLUMNS)
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.kind, "studio")))
    .orderBy(asc(users.createdAt));
  return rows.map(toMember);
}

export async function fetchMembers(): Promise<StudioMember[]> {
  const { organizationId } = await currentActor();
  return membersOf(organizationId);
}

/** The signed-in person's own row — what "החשבון שלי" edits.
 *
 *  Returns null in a script, where there is no person. Callers in the app can treat that as
 *  impossible; they got here through a route guard. */
export async function fetchCurrentMember(): Promise<StudioMember | null> {
  const { organizationId, userId } = await currentActor();
  if (!userId) return null;
  const [row] = await db()
    .select(MEMBER_COLUMNS)
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
    .limit(1);
  return row ? toMember(row) : null;
}

/**
 * Invite someone into the studio.
 *
 * The row is real and the password is NULL — that nullable column is the whole difference between
 * an invitation and an account (see the schema note). They become active by setting a password,
 * which is sign-up's job, not this file's.
 */
export async function inviteMember(
  name: string,
  email: string,
  role: StudioRole,
): Promise<InviteResult> {
  const actor = await currentActor();
  if (!canManagePeople(actor.role)) throw new Error("only the owner can invite people");

  const address = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(address)) {
    return { error: "כתובת אימייל לא תקינה", members: await membersOf(actor.organizationId) };
  }
  if (!isStudioRole(role)) throw new Error("role must be owner | designer | crew");
  // Inviting a second owner is not a thing this screen does: ownership transfer is a different
  // operation with different consequences (billing, the last-owner rule below), and letting it
  // happen through the invite form is how a studio ends up with two people who can remove each
  // other.
  if (role === "owner") throw new Error("a studio has one owner");

  const database = db();
  // One email, one account, across every studio — the unique index says so. A person who already
  // has an account somewhere cannot be invited into a second one by writing a row; that is a
  // membership feature (a user in two organisations) this schema does not have yet, and quietly
  // failing here is better than quietly moving them.
  const [existing] = await database
    .select({ id: users.id, organizationId: users.organizationId })
    .from(users)
    .where(eq(users.email, address))
    .limit(1);
  if (existing) {
    return {
      error:
        existing.organizationId === actor.organizationId
          ? "האדם הזה כבר בצוות"
          : "כתובת האימייל הזאת כבר משויכת לחשבון אחר",
      members: await membersOf(actor.organizationId),
    };
  }

  const invite = mintInviteToken();
  await database.insert(users).values({
    organizationId: actor.organizationId,
    kind: "studio",
    email: address,
    name: String(name ?? "").trim() || null,
    role,
    state: "pending",
    passwordHash: null,
    inviteTokenHash: invite.tokenHash,
    inviteExpiresAt: invite.expiresAt,
    // Set when they accept, not when they are asked — this column is the day they JOINED.
    joinedAt: null,
  });

  return { members: await membersOf(actor.organizationId), link: invitePath(invite.token) };
}

/**
 * A fresh link for someone who is still pending.
 *
 * Both uses are the same operation: the designer lost the link, or the fortnight ran out. Minting a
 * new token INVALIDATES the previous one — there is one hash per row — which is the honest
 * behaviour for a credential and means a link forwarded to the wrong person can be revoked by
 * generating another.
 */
export async function regenerateInvite(id: string): Promise<InviteResult> {
  assertId(id, "id");
  const actor = await currentActor();
  if (!canManagePeople(actor.role)) throw new Error("only the owner can invite people");

  const invite = mintInviteToken();
  const [row] = await db()
    .update(users)
    .set({ inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt })
    .where(
      and(
        eq(users.id, id),
        eq(users.organizationId, actor.organizationId),
        eq(users.kind, "studio"),
        // Only a pending row. Re-issuing a link for someone who already joined would hand out a
        // way to set their password without knowing the old one.
        eq(users.state, "pending"),
      ),
    )
    .returning({ id: users.id });

  const members = await membersOf(actor.organizationId);
  if (!row) return { error: "אין הזמנה פתוחה לאדם הזה", members };
  return { members, link: invitePath(invite.token) };
}

/** Change what someone is inside the studio. Owner only, and never your own row: a lone owner who
 *  demotes themselves locks the studio's people screen for everybody, permanently. */
export async function setMemberRole(id: string, role: StudioRole): Promise<StudioMember[]> {
  assertId(id, "id");
  if (!isStudioRole(role) || role === "owner") throw new Error("role must be designer | crew");
  const actor = await currentActor();
  if (!canManagePeople(actor.role)) throw new Error("only the owner can change roles");
  if (id === actor.userId) throw new Error("you cannot change your own role");

  await db()
    .update(users)
    .set({ role })
    .where(and(eq(users.id, id), eq(users.organizationId, actor.organizationId), eq(users.kind, "studio")));
  return membersOf(actor.organizationId);
}

/**
 * Remove someone from the studio.
 *
 * Their venue grants go with them, and this function does NOT sweep them by hand — the foreign key
 * on venue_grants.grantee_user_id is ON DELETE CASCADE, so the database does it in the same
 * statement. (The old localStorage version made the caller do it, and warned that a silent cascade
 * across a seam is how orphans appear. Inside one database it is the opposite: the FK is the only
 * version that cannot be forgotten by a second caller.)
 */
export async function removeMember(id: string): Promise<StudioMember[]> {
  assertId(id, "id");
  const actor = await currentActor();
  if (!canManagePeople(actor.role)) throw new Error("only the owner can remove people");
  if (id === actor.userId) throw new Error("you cannot remove yourself");

  await db()
    .delete(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.organizationId, actor.organizationId),
        eq(users.kind, "studio"),
        // Belt and braces next to the self-check above: whatever happens to roles later, the row
        // that owns this studio is not deletable through the people screen.
        ne(users.role, "owner"),
      ),
    );
  return membersOf(actor.organizationId);
}

/** Rename yourself. Separate from setMemberRole on purpose: everyone may edit their own name, and
 *  nobody but the owner may touch anyone's role — one function that did both would have to decide
 *  which rule applies per field. */
export async function updateMyName(name: string): Promise<StudioMember | null> {
  const { organizationId, userId } = await currentActor();
  if (!userId) throw new Error("not signed in");
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new Error("name is required");

  await db()
    .update(users)
    .set({ name: trimmed })
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));
  return fetchCurrentMember();
}
