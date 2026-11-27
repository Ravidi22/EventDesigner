"use server";
// Closing and reopening a business (EVE-22, spec §5.2). The owner only. Closing LOCKS it at once —
// every studio action refuses (lib/db/org.ts), every studio page goes to /closed, its outward faces
// go dark (lib/account/closure.ts `notClosed`) — and the sweep erases it after the grace period
// (lib/account/erase.ts). Until then the owner may reopen it.
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, authSessions, billingDocuments, events, organizationClosures, organizations, products, users, venues } from "@/lib/db/schema";
import { closedMember, currentActor } from "@/lib/db/org";
import { revalidateShell } from "@/lib/db/revalidate";
import { peopleOf, recordAudit } from "@/lib/audit/write";
import { actorLabel } from "@/lib/audit/render";
import { fileDriver } from "@/lib/files/driver";
import { sendEmail } from "@/lib/email/send";
import { sendLater } from "@/lib/email/send-later";
import { businessClosedEmail } from "@/lib/email/templates";
import { appOrigin } from "@/lib/app-url";
import { retainedOf } from "./erase";
import { eraseAfterOf, nameConfirms, retainUntilOf } from "./rules";

/** What closing would erase and what it keeps — the close question counts it (spec §5.2). */
export interface ClosePreview {
  name: string;
  events: number;
  /** Every person signed in to the business, the owner included: their accounts go with it. */
  members: number;
  /** The catalog as the designer sees it (archived rows are erased too, but nobody counts them). */
  products: number;
  /** Every stored file — photos, the logo, the signature, sketch pictures. */
  photos: number;
  documents: number;
  /** The last day the issued billing documents are kept ("2033-12-31"); null = none issued. */
  retainUntil: string | null;
  /** Venues another business's events stand in: kept, by name. */
  venuesKept: string[];
}

/** The owner's count before closing. The same retained set the sweep keeps (./erase.ts retainedOf). */
export async function fetchClosePreview(): Promise<ClosePreview> {
  const actor = await currentActor();
  if (actor.role !== "owner") throw new Error("only the owner closes the business");
  const org = actor.organizationId;
  const [[business], [eventCount], [memberCount], [productCount], [documentCount], keep, files] = await Promise.all([
    db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, org)).limit(1),
    db().select({ n: count() }).from(events).where(eq(events.organizationId, org)),
    db().select({ n: count() }).from(users).where(and(eq(users.organizationId, org), ne(users.state, "pending"))),
    db().select({ n: count() }).from(products).where(and(eq(products.organizationId, org), eq(products.archived, false))),
    db().select({ n: count() }).from(billingDocuments).where(eq(billingDocuments.organizationId, org)),
    retainedOf(db(), org),
    fileDriver().list(`${org}/`),
  ]);
  const kept = keep.venueIds.length
    ? await db().select({ name: venues.name }).from(venues).where(inArray(venues.id, keep.venueIds))
    : [];
  return {
    name: business?.name ?? "",
    events: eventCount.n,
    members: memberCount.n,
    products: productCount.n,
    photos: files.length,
    documents: documentCount.n,
    retainUntil: retainUntilOf(keep.docDates),
    venuesKept: kept.map((v) => v.name),
  };
}

/** When the business was last downloaded, and by whom (the audit log's `export.downloaded`). Owner only. */
export async function fetchLastExport(): Promise<{ at: string; by: string } | null> {
  const actor = await currentActor();
  if (actor.role !== "owner") throw new Error("only the owner downloads the business");
  const [last] = await db()
    .select({ at: auditLog.at, actorUserId: auditLog.actorUserId, people: auditLog.people })
    .from(auditLog)
    .where(and(eq(auditLog.organizationId, actor.organizationId), eq(auditLog.action, "export.downloaded")))
    .orderBy(desc(auditLog.at))
    .limit(1);
  return last ? { at: last.at.toISOString(), by: actorLabel(last.actorUserId, last.people) } : null;
}

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
