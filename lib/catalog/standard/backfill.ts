// Give the base library to a studio that existed before it did.
//
//   npm run catalog:standard                 → every organisation in the database
//   npm run catalog:standard -- <org-uuid>   → just that one
//   npm run catalog:standard -- --redraw     → also re-apply how the base items are DRAWN
//   npm run catalog:standard -- --retire     → also ARCHIVE the base items the app stopped shipping
//   npm run catalog:standard -- --db PROD_DATABASE_URL <org-uuid>
//                                            → in the database that env var (in .env.local) names,
//                                              the way scripts/create-studio-account.ts takes it;
//                                              default DATABASE_URL (develop)
//   npm run catalog:standard -- --dry-run    → say what each studio lacks, write nothing
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
// --retire is the other: it sets `archived` on the studio's copies of RETIRED_STANDARD_KEYS (the five
// finished stage sizes, replaced by decks). Archived, not deleted — designs drawn with them still
// resolve — and nothing but that one column is written (see retireStandardCatalog).
//
// It writes through the install module rather than the catalog's server actions, for the same
// reason the seed does: those carry an authorization check for a request that, out here, does not
// exist.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, products } from "@/lib/db/schema";
import { standardProductId } from "./id";
import { installStandardCatalog, redrawStandardCatalog, retireStandardCatalog } from "./install";
import { RETIRED_STANDARD_KEYS, STANDARD_ITEMS } from "./items";

/** Equal as JSON values — jsonb hands keys back in its own order, so never compare strings. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * What each opt-in step would do to this studio, read only:
 *  - `missing`  — base items it has no row for (what a plain run adds);
 *  - `retired`  — its live copies of items the app stopped shipping (what --retire archives);
 *  - `redrawn`  — its copies drawn differently from the library today (what --redraw overwrites —
 *                 a studio's own reshaping included, so read this list before passing --redraw).
 */
async function dryRunFor(organizationId: string) {
  const idOf = (key: string) => standardProductId(organizationId, key);
  const ids = [...STANDARD_ITEMS.map((item) => idOf(item.key)), ...RETIRED_STANDARD_KEYS.map(idOf)];
  const have = await db()
    .select({ id: products.id, name: products.name, archived: products.archived, appearance: products.appearance })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), inArray(products.id, ids)));
  const byId = new Map(have.map((r) => [r.id, r]));
  const missing = STANDARD_ITEMS.filter((item) => !byId.has(idOf(item.key)));
  const redrawn = STANDARD_ITEMS.flatMap((item) => {
    const row = byId.get(idOf(item.key));
    return row && !sameJson(row.appearance, item.product.appearance ?? null) ? [row.name] : [];
  });
  const retired = RETIRED_STANDARD_KEYS.flatMap((key) => {
    const row = byId.get(idOf(key));
    return row && !row.archived ? [row.name] : [];
  });
  return { missing, redrawn, retired };
}

async function main() {
  const args = process.argv.slice(2);
  const redraw = args.includes("--redraw");
  const retire = args.includes("--retire");
  const dryRun = args.includes("--dry-run");
  const dbAt = args.indexOf("--db");
  const dbVar = dbAt >= 0 ? args[dbAt + 1] : "DATABASE_URL";
  // The org id is the one bare argument — not the value that follows --db.
  const only = args.find((a, i) => !a.startsWith("--") && i !== dbAt + 1);

  const url = dbVar ? process.env[dbVar] : undefined;
  if (!url) {
    console.error(`${dbVar ?? "--db needs an env var name"} is not set in .env.local`);
    process.exit(1);
  }
  // lib/db connects lazily off DATABASE_URL on its first call (nothing above has called it), so
  // every write below goes to the database --db named and to no other.
  process.env.DATABASE_URL = url;
  console.log(`database: ${new URL(url).host}${dryRun ? " (dry run — nothing is written)" : ""}`);

  const all = await db().select({ id: organizations.id, name: organizations.name, kind: organizations.kind }).from(organizations);
  // STUDIOS only, the sign-up rule (lib/auth/actions.ts): a supplier's catalog is what it sells and a
  // hall has none. Base rows are `visibility: "public"`, so in a supplier org they would pass the
  // marketplace's own filter and be listed as that supplier's stock. Naming an org by id still
  // reaches it, whatever its kind — that is a deliberate, one-off act.
  const targets = only ? all.filter((o) => o.id === only) : all.filter((o) => o.kind === "studio");

  if (only && targets.length === 0) {
    console.error(`no organisation with id ${only}`);
    process.exit(1);
  }
  if (targets.length === 0) {
    console.log("no organisations yet — sign up, and the base library arrives with the studio.");
    process.exit(0);
  }

  for (const org of targets) {
    if (dryRun) {
      const { missing, redrawn, retired } = await dryRunFor(org.id);
      console.log(`${org.name} (${org.id}) — lacks ${missing.length} of ${STANDARD_ITEMS.length}`);
      for (const item of missing) console.log(`    + ${item.product.name}`);
      if (retired.length) console.log(`  --retire would archive ${retired.length}: ${retired.join(" · ")}`);
      if (redrawn.length) console.log(`  --redraw would redraw ${redrawn.length}: ${redrawn.join(" · ")}`);
      continue;
    }
    const added = await installStandardCatalog(org.id);
    const redrawn = redraw ? await redrawStandardCatalog(org.id) : 0;
    const retired = retire ? await retireStandardCatalog(org.id) : 0;
    const drawing = redraw ? `, redrew ${redrawn}` : "";
    const retiring = retire ? `, archived ${retired} retired` : "";
    console.log(
      `${org.name} — added ${added} of ${STANDARD_ITEMS.length} (the rest were already there)${drawing}${retiring}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
