// "Which properties may this person open?" — the venue half of the two ladders (CLAUDE.md).
//
// It lived inside lib/venues/actions.ts as a private function, which was right while venues were
// the only thing asking. Procurement asks too: reading a drape's real length means reaching the
// wall graph of every venue in a date window.
//
// It cannot simply be exported from that file. `lib/venues/actions.ts` is a "use server" module, so
// every export there is a public POST endpoint — and this function takes an `Actor` as its
// argument, which over HTTP would mean the CALLER supplies who they are. That is not a helper being
// shared, it is an impersonation endpoint. So it lives here, next to lib/events/ownership.ts, which
// is the same shape for the same reason.
//
// ⚠ SERVER ONLY. Not a "use server" module — it exports helpers, not endpoints, and it is imported
// by the action modules that are.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/db/org";
import { venueGrants, venues } from "@/lib/db/schema";
import { toVenueRow } from "./db-mapping";
import { emptyPlan } from "./types";

/** The venue ids this caller may see, or null meaning "no filter".
 *
 *  ALWAYS null since 2026-10-30: everybody sees the same venue (lib/venues/access.ts
 *  resolveVenueRole), so a venue grant decides who EDITS a property, no longer whose events a member
 *  of the studio is shown. Kept as the one seam the runway and procurement ask, so a future rule has
 *  one place to land. */
export async function grantedVenueIds(actor: Actor): Promise<string[] | null> {
  void actor;
  return null;
}

/** A guest grant handed out to an address before it had an account, adopted the day that address
 *  opens a business: it becomes the new organisation's, and active. Called from completeOnboarding
 *  — the session has just proved the address is theirs. */
export async function adoptVenueGrants(email: string, userId: string, organizationId: string): Promise<void> {
  await db()
    .update(venueGrants)
    .set({ granteeOrgId: organizationId, granteeUserId: userId, state: "active" })
    .where(and(eq(venueGrants.granteeEmail, email.toLowerCase()), eq(venueGrants.kind, "guest"), isNull(venueGrants.granteeOrgId)));
}

/** A hall owner's first property, opened at sign-up under the name they gave the business (the user,
 *  2026-10-30: "when adding a name of the venue it should create a venue by this name and select
 *  it"). The owner's role reaches every venue of the organisation, so no grant is written — the same
 *  as createVenue for an owner. It is an ordinary venue from then on: renamed, given a logo or
 *  deleted from the switcher like any other. */
export async function openFirstVenue(organizationId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  await db().insert(venues).values(toVenueRow({ id, name, plan: emptyPlan() }, organizationId));
  return id;
}
