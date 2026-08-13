// "Does this event exist, and is it ours?" — asked by every module that hangs a row off an event.
//
// A FOREIGN KEY checks that a row EXISTS, never that it belongs to you. So an action that writes a
// design document, a packing spare or an issued quote against an eventId it was handed over HTTP
// would, without this, happily attach it to another studio's event and let the database agree.
// lib/events/actions.ts closes the same hole for venues and zones (assertPlacement).
//
// It lives here rather than in one of the action modules because three of them need it, and a
// tenant check that exists in three copies is a tenant check that will one day exist in two.
//
// ⚠ SERVER ONLY. Not a "use server" module — it exports a helper, not an endpoint, and it is
// imported by the action modules that are.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

/** @throws when the event does not exist, or belongs to another studio. Callers do not catch: an
 *  action that cannot say whose event it is being asked to write has nothing safe to do. */
export async function assertEventOwned(organizationId: string, eventId: string): Promise<void> {
  const [row] = await db()
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new Error("event not found");
}
