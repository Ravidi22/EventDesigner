// Writing the audit log (EVE-52). A PLAIN module, never "use server": it takes ids and trusts them —
// the server actions that call it have already proved who is acting (the same rule as
// lib/notifications/write.ts).
//
// Unlike `notify`, it THROWS: it runs inside the writer's own transaction where there is one, and a
// sensitive change that cannot be recorded is not made.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import type { AuditEntry, AuditPeople } from "./types";

/** `db()` or a transaction handed in by the caller. */
export type Database = ReturnType<typeof db> | Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

export async function recordAudit(database: Database, entry: AuditEntry): Promise<void> {
  await database.insert(auditLog).values({
    organizationId: entry.organizationId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetKind: entry.target?.kind ?? null,
    targetId: entry.target?.id ?? null,
    summary: entry.summary,
    people: entry.people,
    details: entry.details ?? null,
  });
}

/** The `people` map for these users, read now: their names and whether each is a member or a client.
 *  An id with no row (already gone) is left out — the line then reads "former member". */
export async function peopleOf(database: Database, ids: readonly (string | null | undefined)[]): Promise<AuditPeople> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  const people: AuditPeople = {};
  for (const id of wanted) {
    const [row] = await database.select({ name: users.name, email: users.email, kind: users.kind }).from(users).where(eq(users.id, id)).limit(1);
    if (row) people[id] = { name: row.name || row.email, kind: row.kind === "studio" ? "member" : "client" };
  }
  return people;
}

/** Erase a person from the business's log: their name goes from every row's `people`; the rows stay,
 *  and every line they appear in reads "former member" (or "former client"). */
export async function forgetPerson(database: Database, organizationId: string, userId: string): Promise<void> {
  await database
    .update(auditLog)
    .set({ people: sql`jsonb_set(${auditLog.people}, ARRAY[${userId}, 'name'], 'null'::jsonb)` })
    .where(and(eq(auditLog.organizationId, organizationId), sql`${auditLog.people} ? ${userId}`));
}
