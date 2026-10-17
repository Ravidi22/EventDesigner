"use server";
// The bell's reads, for whoever is signed in — a designer or a client, the same rows and the same
// two calls. The scope is the RECIPIENT and nothing else: a notification is a fact about the person
// it was written for, so there is no organisation filter to forget and no way to read another's.
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth/session";
import { notifications } from "@/lib/db/schema";
import type { AppNotification } from "./types";

const LIMIT = 30;

export interface NotificationFeed {
  items: AppNotification[];
  unread: number;
}

/** The newest notifications and how many are unread. Empty for nobody signed in — the bell is on
 *  every page and a stale tab polling after sign-out is not an error worth a red screen. */
export async function fetchNotifications(): Promise<NotificationFeed> {
  const session = await currentSession();
  if (!session) return { items: [], unread: 0 };
  const database = db();
  const [rows, [unread]] = await Promise.all([
    database.select().from(notifications).where(eq(notifications.userId, session.userId)).orderBy(desc(notifications.createdAt)).limit(LIMIT),
    database
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, session.userId), isNull(notifications.readAt))),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      eventId: r.eventId,
      payload: r.payload,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    unread: unread?.n ?? 0,
  };
}

/** Mark these as read — or all of the caller's, with no ids. Only ever the caller's own rows. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const session = await currentSession();
  if (!session) return;
  const mine = and(eq(notifications.userId, session.userId), isNull(notifications.readAt));
  const list = Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, 200) : null;
  if (list && list.length === 0) return;
  await db()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(list ? and(mine, inArray(notifications.id, list)) : mine);
}
