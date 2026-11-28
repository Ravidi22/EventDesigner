// Reading whether a business is closed (EVE-22, spec §5.3). A PLAIN module, never "use server": it
// takes an organisation id and trusts it — the session and the server actions decide whose it is.
import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { organizationClosures } from "@/lib/db/schema";

export type ClosureRow = typeof organizationClosures.$inferSelect;

export async function closureOf(organizationId: string): Promise<ClosureRow | null> {
  const [row] = await db().select().from(organizationClosures).where(eq(organizationClosures.organizationId, organizationId)).limit(1);
  return row ?? null;
}

/** A WHERE clause: the business in this column has not been closed (or erased). Every outward face of
 *  a business — its clients' portal, its 3D links, its marketplace shop, its venues in the directory —
 *  goes dark the moment it closes. */
export function notClosed(orgColumn: AnyPgColumn): SQL {
  return sql`not exists (select 1 from organization_closures c where c.organization_id = ${orgColumn})`;
}
