// Bring a fresh database up to the minimum the app needs to run.
//
//   npm run db:seed
//
// THE STUDIO, NOT ITS CONTENT. This creates the organization every row hangs off (ADR-2) and the
// one settings row that carries the letterhead and the meeting flow — infrastructure, without which
// nothing can be saved at all. It creates NO products: the catalog starts empty and fills up when
// the designer adds their real items. A shelf of invented products is not a head start, it is
// something to delete before you can trust what you are looking at.
//
// Idempotent: `onConflictDoNothing` means running it twice does nothing the second time, and it
// never overwrites a value you have since edited.
//
// It talks to the tables directly rather than through the server actions on purpose: those carry an
// authorization check for a request that, here, does not exist.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { db } from "@/lib/db";
import { SINGLE_ORG_ID } from "@/lib/db/org";
import { organizations, studioSettings } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

async function main() {
  const database = db();

  // "Eve" is a placeholder, not a business. The real name arrives at sign-up, which renames this
  // organisation when the first account adopts it (see claimOrganization).
  await database
    .insert(organizations)
    .values({ id: SINGLE_ORG_ID, name: "Eve" })
    .onConflictDoNothing();

  // The letterhead fields are left at their defaults — which are EMPTY. Seeding a business name and
  // an owner would put an invented studio on a real quote for any designer who never opened the
  // settings screen.
  //
  // meetingFlow is left empty too, and that is not the same as writing DEFAULT_FLOW into it: an
  // empty list means "never customised", so a studio that has not touched the meeting screen keeps
  // following the app's default even after that default changes. See fetchMeetingFlow.
  await database
    .insert(studioSettings)
    .values({
      organizationId: SINGLE_ORG_ID,
      vatRate: String(DEFAULT_SETTINGS.vatRate),
      currency: DEFAULT_SETTINGS.currency,
    })
    .onConflictDoNothing();

  console.log("seeded — 1 organization, 1 settings row. The catalog is intentionally empty.");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
