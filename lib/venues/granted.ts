// "Which properties may this person open?" — the venue half of the two ladders (CLAUDE.md).
//
// It lived inside lib/venues/actions.ts as a private function, which was right while venues were
// the only thing asking. Procurement asks too: reading a drape's real length means reaching the
// wall graph of every venue in a date window, and a venue query scoped by organizationId alone is
// exactly the bug the access rules exist to prevent.
//
// It cannot simply be exported from that file. `lib/venues/actions.ts` is a "use server" module, so
// every export there is a public POST endpoint — and this function takes an `Actor` as its
// argument, which over HTTP would mean the CALLER supplies who they are. That is not a helper being
// shared, it is an impersonation endpoint. So it moves here, next to lib/events/ownership.ts, which
// is the same shape for the same reason.
//
// ⚠ SERVER ONLY. Not a "use server" module — it exports a helper, not an endpoint, and it is
// imported by the action modules that are.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/db/org";
import { venueGrants } from "@/lib/db/schema";
import { reachesAllVenues } from "@/lib/team/types";

/** The venue ids this caller may see, or null meaning "no filter — everything in the studio". */
export async function grantedVenueIds(actor: Actor): Promise<string[] | null> {
  if (reachesAllVenues(actor.role)) return null;
  if (!actor.userId) return [];
  const rows = await db()
    .select({ venueId: venueGrants.venueId })
    .from(venueGrants)
    .where(
      and(
        eq(venueGrants.granteeUserId, actor.userId),
        eq(venueGrants.kind, "member"),
        eq(venueGrants.state, "active"),
      ),
    );
  return rows.map((r) => r.venueId);
}
