// Copy ONE venue's plan — its row, its structure (walls, doors, features) and its zones — from one
// database into another, under a different organisation. Nothing else travels: no events, no
// appointments, no grants, no sketches. Written 2026-10-31 to hand אמרה ("Amare") to Ravid's
// father's studio on the production branch, which had never held it.
//
//   npx tsx scripts/copy-venue.ts --venue <venue id> --to-org <organisation id>
//       [--from DATABASE_URL]      env var (in .env.local) naming the SOURCE database — default DATABASE_URL
//       [--to PROD_DATABASE_URL]   env var naming the TARGET database — default: the same as --from
//       [--replace]                the venue already exists in the target: overwrite it in place
//       [--dry-run]                say what would be copied, write nothing
//
// IDS ARE KEPT. The structure's zones point at its walls and features by id (a `face` zone names
// nodes, a `features` zone names features), so re-minting ids would mean rewriting every reference
// inside 180 kB of JSON; across two databases the same ids collide with nothing, and within one
// database the venue is refused unless --replace. What changes is `organization_id`, on the venue,
// its structure and every zone — the tenant boundary (lib/venues/actions.ts writes under the
// venue's owner organisation, so this is what makes the copy THEIRS to edit).
//
// A logo (venues.logo_url) is copied into the target organisation's own file prefix through
// lib/files/copy.ts, as the marketplace copies a supplier's photo: a URL under another tenant's
// prefix is dropped by `ownedFileUrl` on the next save. The structure itself holds no files.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { copyFileInto } from "@/lib/files/copy";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hostOf = (url: string) => url.replace(/^[^@]*@/, "").replace(/[/?].*$/, "");

function connect(envVar: string) {
  const url = process.env[envVar];
  if (!url) throw new Error(`${envVar} is not set in .env.local`);
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
  return { client, db: drizzle(client, { schema }), host: hostOf(url) };
}

async function main() {
  const venueId = String(arg("venue") ?? "");
  const toOrg = String(arg("to-org") ?? "");
  const fromVar = arg("from") ?? "DATABASE_URL";
  const toVar = arg("to") ?? fromVar;
  const replace = flag("replace");
  const dryRun = flag("dry-run");
  if (!UUID.test(venueId) || !UUID.test(toOrg)) {
    throw new Error("usage: npx tsx scripts/copy-venue.ts --venue <venue id> --to-org <organisation id> [--from <ENV_VAR>] [--to <ENV_VAR>] [--replace] [--dry-run]");
  }

  const source = connect(fromVar);
  const target = fromVar === toVar ? source : connect(toVar);
  try {
    // --- read the plan ----------------------------------------------------------------------------
    const [venue] = await source.db.select().from(schema.venues).where(eq(schema.venues.id, venueId)).limit(1);
    if (!venue) throw new Error(`no venue ${venueId} in ${fromVar} (${source.host})`);
    const [structure] = await source.db.select().from(schema.venueStructures).where(eq(schema.venueStructures.venueId, venueId)).limit(1);
    const zones = await source.db.select().from(schema.zones).where(eq(schema.zones.venueId, venueId));
    const built = structure?.structure as { walls?: unknown[]; features?: unknown[]; entrances?: unknown[] } | undefined;
    console.log(`source: ${fromVar} (${source.host})`);
    console.log(`venue "${venue.name}" of organisation ${venue.organizationId}`);
    console.log(`  structure: ${structure ? `${built?.walls?.length ?? 0} walls, ${built?.entrances?.length ?? 0} openings, ${built?.features?.length ?? 0} features` : "none"}`);
    console.log(`  zones: ${zones.length}${zones.length ? " — " + zones.map((z) => z.name).join(", ") : ""}`);
    console.log(`  logo: ${venue.logoUrl ? "yes" : "none"}`);

    // --- the target ---------------------------------------------------------------------------------
    const [org] = await target.db.select({ id: schema.organizations.id, name: schema.organizations.name, kind: schema.organizations.kind }).from(schema.organizations).where(eq(schema.organizations.id, toOrg)).limit(1);
    if (!org) throw new Error(`no organisation ${toOrg} in ${toVar} (${target.host})`);
    const [already] = await target.db.select({ id: schema.venues.id, organizationId: schema.venues.organizationId, name: schema.venues.name }).from(schema.venues).where(eq(schema.venues.id, venueId)).limit(1);
    console.log(`target: ${toVar} (${target.host}) — organisation "${org.name}" (${org.kind})`);
    if (already && !replace) {
      throw new Error(`venue ${venueId} ("${already.name}") already exists in the target under organisation ${already.organizationId}; pass --replace to overwrite it in place`);
    }
    if (already) console.log(`  the venue is already there (organisation ${already.organizationId}) — it will be overwritten`);

    if (dryRun) {
      console.log("dry run — nothing written");
      return;
    }

    // --- the logo, into the target organisation's own prefix ---------------------------------------
    let logoUrl: string | null = null;
    if (venue.logoUrl) {
      logoUrl = await copyFileInto(venue.logoUrl, toOrg, "logo");
      console.log(`  logo ${logoUrl ? "copied" : "not copied (not a file this app stored)"}`);
    }

    // --- write, in one transaction ------------------------------------------------------------------
    const now = new Date();
    await target.db.transaction(async (tx) => {
      await tx
        .insert(schema.venues)
        .values({ id: venue.id, organizationId: toOrg, name: venue.name, logoUrl, plan: venue.plan, createdAt: venue.createdAt, updatedAt: now })
        .onConflictDoUpdate({ target: schema.venues.id, set: { organizationId: toOrg, name: venue.name, logoUrl, plan: venue.plan, updatedAt: now } });
      if (structure) {
        await tx
          .insert(schema.venueStructures)
          .values({ venueId: venue.id, organizationId: toOrg, structure: structure.structure, updatedAt: now })
          .onConflictDoUpdate({ target: schema.venueStructures.venueId, set: { organizationId: toOrg, structure: structure.structure, updatedAt: now } });
      }
      // Zones are replaced as a set: a zone deleted at the source must not survive at the target.
      await tx.delete(schema.zones).where(eq(schema.zones.venueId, venue.id));
      if (zones.length) {
        await tx.insert(schema.zones).values(zones.map((z) => ({ ...z, organizationId: toOrg })));
      }
    });
    console.log(`copied "${venue.name}" → organisation ${toOrg}: venue, ${structure ? "structure" : "no structure"}, ${zones.length} zones`);
  } finally {
    await source.client.end();
    if (target !== source) await target.client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  });
