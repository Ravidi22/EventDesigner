// Give the base library to a studio that existed before it did.
//
//   npm run catalog:standard                 → every organisation in the database
//   npm run catalog:standard -- <org-uuid>   → just that one
//   npm run catalog:standard -- --redraw     → also re-apply how the base items are DRAWN
//
// New studios get it at sign-up (lib/auth/actions.ts); this is for the ones already here, and for
// the day a department is added to the list — re-running it adds the new items to everybody and
// touches nothing else (see installStandardCatalog).
//
// --redraw is the one thing here that overwrites, and it is opt-in for that reason: it re-applies
// the `appearance` column of rows that already exist, which is how a correction to the way a base
// item is drawn reaches a catalog that already has it. It writes no other column, and a studio that
// has reshaped its own copy in the drawer loses that reshaping (see redrawStandardCatalog).
//
// It writes through the install module rather than the catalog's server actions, for the same
// reason the seed does: those carry an authorization check for a request that, out here, does not
// exist.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { installStandardCatalog, redrawStandardCatalog } from "./install";
import { STANDARD_ITEMS } from "./items";

async function main() {
  const args = process.argv.slice(2);
  const redraw = args.includes("--redraw");
  const only = args.find((a) => !a.startsWith("--"));

  const all = await db().select({ id: organizations.id, name: organizations.name }).from(organizations);
  const targets = only ? all.filter((o) => o.id === only) : all;

  if (only && targets.length === 0) {
    console.error(`no organisation with id ${only}`);
    process.exit(1);
  }
  if (targets.length === 0) {
    console.log("no organisations yet — sign up, and the base library arrives with the studio.");
    process.exit(0);
  }

  for (const org of targets) {
    const added = await installStandardCatalog(org.id);
    const redrawn = redraw ? await redrawStandardCatalog(org.id) : 0;
    const drawing = redraw ? `, redrew ${redrawn}` : "";
    console.log(
      `${org.name} — added ${added} of ${STANDARD_ITEMS.length} (the rest were already there)${drawing}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
