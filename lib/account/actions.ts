"use server";
// Closing and reopening a business (EVE-22, spec §5.2). The owner only. Closing LOCKS it at once —
// every studio action refuses (lib/db/org.ts), every studio page goes to /closed, its outward faces
// go dark (lib/account/closure.ts `notClosed`) — and the sweep erases it after the grace period
// (lib/account/erase.ts). Until then the owner may reopen it.
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { authSessions, organizationClosures, organizations, users } from "@/lib/db/schema";
import { closedMember, currentActor } from "@/lib/db/org";
import { revalidateShell } from "@/lib/db/revalidate";
import { peopleOf, recordAudit } from "@/lib/audit/write";
import { sendEmail } from "@/lib/email/send";
import { sendLater } from "@/lib/email/send-later";
import { businessClosedEmail } from "@/lib/email/templates";
import { appOrigin } from "@/lib/app-url";
import { eraseAfterOf, nameConfirms } from "./rules";

/** "8.1.2027" — the date the closed page and the mail print. */
const shortDate = (d: Date) => d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });

export async function closeBusiness(input: { confirmName: string }): Promise<{ eraseAfter: string } | { error: string }> {
  const actor = await currentActor();
  if (actor.role !== "owner" || !actor.userId) return { error: "רק הבעלים יכולים לסגור את העסק" };
  const ownerId = actor.userId;
  const [org] = await db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, actor.organizationId)).limit(1);
  if (!org) throw new Error("no such business");
  if (!nameConfirms(String(input?.confirmName ?? ""), org.name)) return { error: "השם שהוקלד לא תואם לשם העסק" };

  const closedAt = new Date();
  const eraseAfter = eraseAfterOf(closedAt);
  const owner = await db().transaction(async (tx) => {
    await tx.insert(organizationClosures).values({ organizationId: actor.organizationId, name: org.name, closedAt, closedBy: ownerId, eraseAfter });
    // Everyone but the owner is out at once: their sessions end (they may sign in again, to /closed).
    const others = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, actor.organizationId), ne(users.id, ownerId)));
    if (others.length) await tx.delete(authSessions).where(inArray(authSessions.userId, others.map((u) => u.id)));
    // An invitation accepted now would make a member of a closed business (DECIDE-3).
    await tx.delete(users).where(and(eq(users.organizationId, actor.organizationId), eq(users.state, "pending")));
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorUserId: ownerId,
      action: "business.closed",
      summary: `סגירת העסק · מחיקה ב־${shortDate(eraseAfter)}`,
      people: await peopleOf(tx, [ownerId]),
    });
    const [me] = await tx.select({ email: users.email }).from(users).where(eq(users.id, ownerId));
    return me;
  });

  // Dropped by sendEmail while mail is off (parked with the environment).
  const origin = appOrigin() ?? "http://localhost:3000";
  sendLater(() =>
    sendEmail({ to: owner.email, ...businessClosedEmail({ name: org.name, eraseOn: shortDate(eraseAfter), url: `${origin}/closed` }) }),
  );
  revalidateShell();
  return { eraseAfter: eraseAfter.toISOString() };
}

/** The owner changes their mind — while the business is closed and the sweep has not erased it. */
export async function reopenBusiness(): Promise<{ ok: true } | { error: string }> {
  const member = await closedMember();
  if (member.role !== "owner" || !member.userId) return { error: "רק הבעלים יכולים לפתוח את העסק מחדש" };
  const ownerId = member.userId;
  const reopened = await db().transaction(async (tx) => {
    const gone = await tx
      .delete(organizationClosures)
      .where(eq(organizationClosures.organizationId, member.organizationId))
      .returning({ erasedAt: organizationClosures.erasedAt });
    // An erased business has no members left to ask, but say no all the same.
    if (gone.length === 0 || gone[0].erasedAt) return false;
    await recordAudit(tx, {
      organizationId: member.organizationId,
      actorUserId: ownerId,
      action: "business.reopened",
      summary: "פתיחה מחדש של העסק",
      people: await peopleOf(tx, [ownerId]),
    });
    return true;
  });
  if (!reopened) return { error: "העסק כבר נמחק" };
  revalidateShell();
  return { ok: true };
}
