// Who may act on a venue's own book — its bookings and its menus.
//
// ⚠ SERVER ONLY, and a PLAIN module: it takes nothing from the caller and exports a helper, not an
// endpoint (the same reason lib/venues/granted.ts is plain).
import { currentActor, type Actor } from "@/lib/db/org";

/** A signed-in member of a VENUE organisation. Writing needs more than the crew: a chef reads the
 *  kitchen sheet, a waiter the floor sheet; neither re-prices a package or moves a date. */
export async function requireVenueActor(write = false): Promise<Actor> {
  const actor = await currentActor();
  if (actor.organizationKind !== "venue") throw new Error("this account is not a venue");
  if (write && actor.role === "crew") throw new Error("אין לך הרשאה לשנות את זה");
  return actor;
}
