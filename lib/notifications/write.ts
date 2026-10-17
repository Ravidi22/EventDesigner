// Writing notifications — a PLAIN server module on purpose, like lib/google/sync.ts.
//
// Not "use server": every export of such a file is a POST endpoint any signed-in browser can call,
// and "notify these users of this" must not be one, or a client could fill a studio's bell with
// anything they liked. Only the server actions that have already decided something happened
// (a proposal was sent, an answer was given, an invitation was accepted) import this.
//
// Best-effort, like the Google push: the thing being announced has already been committed, and a
// failed write here must not turn a successful submit into an error on the client's screen.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventClients, notifications, users } from "@/lib/db/schema";
import type { NotificationKind, NotificationPayload } from "./types";

export interface NotificationDraft {
  kind: NotificationKind;
  /** The studio whose event it is about (see the schema note). */
  organizationId: string;
  eventId: string | null;
  payload: NotificationPayload;
}

/** One row per recipient. Never throws. */
export async function notify(recipients: readonly string[], draft: NotificationDraft): Promise<void> {
  const ids = [...new Set(recipients)];
  if (ids.length === 0) return;
  try {
    await db()
      .insert(notifications)
      .values(ids.map((userId) => ({ ...draft, userId })));
  } catch (err) {
    console.error("notify failed", draft.kind, err);
  }
}

/** Who in a studio hears about a client: the owner and the designers who have joined. Not the crew
 *  — a client's change to the sketch is a design decision, and the crew's screen is the runway. */
export async function studioRecipients(organizationId: string, except?: string | null): Promise<string[]> {
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.kind, "studio"),
        eq(users.state, "active"),
        inArray(users.role, ["owner", "designer"]),
      ),
    );
  return rows.map((r) => r.id).filter((id) => id !== except);
}

/** Everyone an event is shared with — the couple, a parent — but the one who did the thing. */
export async function eventClientRecipients(eventId: string, except?: string | null): Promise<string[]> {
  const rows = await db().select({ id: eventClients.userId }).from(eventClients).where(eq(eventClients.eventId, eventId));
  return rows.map((r) => r.id).filter((id) => id !== except);
}
