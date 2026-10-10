// Bring a designer who signed up on her own into another studio — her account, the venues she drew
// and her own catalog items come with her.
//
//   npx tsx lib/team/join-studio.ts <her-email> <any-email-in-the-target-studio>                  → dry run: report only
//   npx tsx lib/team/join-studio.ts <her-email> <any-email-in-the-target-studio> --drop-events    → dry run, events dropped
//   … add --apply to do it
//
// Why a script and not the invite screen: one email is one account in one studio (users.email is
// unique), so inviting someone who already has an account is refused by design (inviteMember). That
// refusal is right for the screen — "move a person between businesses" is not a click — and this is
// the deliberate version of it, run once, by someone looking at the dry run first.
//
// What moves:
//   · her user row — into the target studio as a DESIGNER (a studio has one owner). Sessions read the
//     organisation from the users row on every request (lib/auth/session.ts), so she does not need to
//     sign in again; the next page she opens is the new studio, catalog and all.
//   · every venue of her old studio, with its wall graph and zones, and a `manager` grant for her on
//     each — a designer reaches only granted venues, and she drew these.
//   · her catalog items, COPIED (new ids, variants with them) into the target catalog. Skipped: the
//     base library (the target studio has its own copy — lib/catalog/standard/), archived rows, and
//     anything the target already has under the same name in the same category. The copy carries no
//     supplier: her suppliers stay in her old studio.
//   · her Google Calendar connection, re-homed; its links to the OLD studio's diary are dropped.
//
// Events: an event and its venue must belong to one studio (assertPlacement), and moving an event
// means moving its design documents, quotes and the catalog rows its placements name — a different
// job. So a venue her events stand in is SKIPPED, unless --drop-events is given, which DELETES those
// events (named in the dry run) so the venue can move. Meant for mock events and nothing else.
//
// Everything else of the old studio (its catalog rows, settings, other events, gallery) is left
// exactly where it is, unreachable but not deleted. Uploaded files keep their URLs under the old
// studio's prefix: they still load; the one cost is that replacing one later leaves the old object
// behind (removeReplacedFile only deletes files under the caller's own prefix).
//
// It writes through the database directly rather than through the server actions, for the same
// reason the catalog backfill does: those carry an authorization check for a request that, out here,
// does not exist.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  appointments,
  eventZones,
  events,
  googleConnections,
  googleEventLinks,
  organizations,
  productVariants,
  products,
  sketchTemplates,
  users,
  venueGrants,
  venueStructures,
  venues,
  zones,
} from "@/lib/db/schema";
import { standardProductId } from "@/lib/catalog/standard/id";
import { RETIRED_STANDARD_KEYS, STANDARD_ITEMS } from "@/lib/catalog/standard/items";

/** The server's calendar day — same helper, same reason, as lib/venues/actions.ts. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function studioUser(email: string) {
  const [row] = await db()
    .select({ id: users.id, name: users.name, email: users.email, organizationId: users.organizationId, role: users.role })
    .from(users)
    .where(and(eq(users.email, email), eq(users.kind, "studio")))
    .limit(1);
  return row;
}

async function orgName(id: string): Promise<string> {
  const [row] = await db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, id)).limit(1);
  return row?.name ?? id;
}

/** Same name, same category, ignoring spacing and case — "the same item" as a person would judge it. */
const sameKey = (category: string, name: string) => `${category}|${name.trim().replace(/\s+/g, " ").toLowerCase()}`;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dropEvents = args.includes("--drop-events");
  const [herEmail, intoEmail] = args.filter((a) => !a.startsWith("--")).map((a) => a.trim().toLowerCase());
  if (!herEmail || !intoEmail) {
    console.error("usage: npx tsx lib/team/join-studio.ts <her-email> <any-email-in-the-target-studio> [--drop-events] [--apply]");
    process.exit(1);
  }

  const her = await studioUser(herEmail);
  const anchor = await studioUser(intoEmail);
  if (!her?.organizationId) return fail(`no studio account with the email ${herEmail}`);
  if (!anchor?.organizationId) return fail(`no studio account with the email ${intoEmail}`);
  if (her.organizationId === anchor.organizationId) return fail(`${herEmail} is already in that studio`);

  const fromOrg = her.organizationId;
  const intoOrg = anchor.organizationId;
  const database = db();

  console.log(`\n${apply ? "APPLYING" : "DRY RUN — nothing is written; add --apply to do it"}\n`);
  console.log(`  person   ${her.name ?? her.email} <${her.email}>  (${her.role} of "${await orgName(fromOrg)}")`);
  console.log(`  into     "${await orgName(intoOrg)}"  as designer\n`);

  // Who else is in her old studio — they are not moved, and they should not be a surprise.
  const others = await database
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, fromOrg), eq(users.kind, "studio"), ne(users.id, her.id)));
  if (others.length) {
    console.log(`  ⚠ ${others.length} other people stay in the old studio: ${others.map((o) => o.email).join(", ")}\n`);
  }

  // ── Venues, and the events standing in them ──────────────────────────────────────────────────
  console.log("  VENUES");
  const venueRows = await database
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(eq(venues.organizationId, fromOrg))
    .orderBy(asc(venues.createdAt));

  const movable: { id: string; name: string }[] = [];
  const doomed = new Map<string, string>(); // event id → how it is described
  for (const v of venueRows) {
    // An event is "in" a venue by its venue column, or — belt and braces — by a zone it was placed in.
    const zonedIds = database
      .select({ id: eventZones.eventId })
      .from(eventZones)
      .innerJoin(zones, eq(zones.id, eventZones.zoneId))
      .where(eq(zones.venueId, v.id));
    const inIt = await database
      .select({ id: events.id, clientName: events.clientName, eventDate: events.eventDate })
      .from(events)
      .where(or(eq(events.venueId, v.id), inArray(events.id, zonedIds)));
    const zoneCount = (await database.select({ id: zones.id }).from(zones).where(eq(zones.venueId, v.id))).length;

    if (inIt.length > 0 && !dropEvents) {
      console.log(`    ✗ "${v.name}" — skipped: ${inIt.length} of her events are in it (add --drop-events to delete them)`);
      continue;
    }
    console.log(`    ✓ "${v.name}" — moves, with ${zoneCount} zones`);
    for (const e of inIt) {
      doomed.set(e.id, `"${e.clientName}"${e.eventDate ? ` (${e.eventDate})` : ""} in "${v.name}"`);
    }
    movable.push(v);
  }
  if (venueRows.length === 0) console.log("    (her studio has no venues)");
  for (const what of doomed.values()) console.log(`    🗑 event ${what} — DELETED, with its design, quote and exports`);

  // ── Catalog ──────────────────────────────────────────────────────────────────────────────────
  console.log("\n  CATALOG");
  const standardIds = new Set(
    [...STANDARD_ITEMS.map((i) => i.key), ...RETIRED_STANDARD_KEYS].map((key) => standardProductId(fromOrg, key)),
  );
  const theirs = await database.select().from(products).where(eq(products.organizationId, fromOrg)).orderBy(asc(products.createdAt));
  const ours = await database
    .select({ name: products.name, category: products.category })
    .from(products)
    .where(and(eq(products.organizationId, intoOrg), eq(products.archived, false)));
  const have = new Set(ours.map((p) => sameKey(p.category, p.name)));

  const toCopy: (typeof theirs)[number][] = [];
  let skippedStandard = 0;
  let skippedArchived = 0;
  for (const p of theirs) {
    if (standardIds.has(p.id)) skippedStandard++;
    else if (p.archived) skippedArchived++;
    else if (have.has(sameKey(p.category, p.name))) console.log(`    = "${p.name}" — already in the catalog, skipped`);
    else {
      console.log(`    + "${p.name}"`);
      toCopy.push(p);
      have.add(sameKey(p.category, p.name)); // two of hers with one name land once
    }
  }
  console.log(
    `    ${toCopy.length} to copy · ${skippedStandard} base-library items skipped (the studio has its own)` +
      (skippedArchived ? ` · ${skippedArchived} archived skipped` : ""),
  );
  const variants = toCopy.length
    ? await database
        .select()
        .from(productVariants)
        .where(inArray(productVariants.productId, toCopy.map((p) => p.id)))
    : [];

  // ── Google ───────────────────────────────────────────────────────────────────────────────────
  const [connection] = await database
    .select({ id: googleConnections.id })
    .from(googleConnections)
    .where(eq(googleConnections.userId, her.id))
    .limit(1);
  if (connection) console.log("\n  ✓ her Google Calendar connection moves (links to the old studio's diary are dropped)");

  console.log("\n  Everything else of the old studio stays where it is, untouched.\n");
  if (!apply) return;

  const ids = movable.map((v) => v.id);
  await database.transaction(async (tx) => {
    // Events first: their zone links (event_zones, ON DELETE RESTRICT toward zones) go with them, and
    // so do their design documents, quotes, exports and diary entries (all ON DELETE CASCADE).
    if (doomed.size) await tx.delete(events).where(inArray(events.id, [...doomed.keys()]));

    if (ids.length) {
      const now = new Date();
      await tx.update(venues).set({ organizationId: intoOrg, updatedAt: now }).where(inArray(venues.id, ids));
      await tx.update(venueStructures).set({ organizationId: intoOrg, updatedAt: now }).where(inArray(venueStructures.venueId, ids));
      await tx.update(zones).set({ organizationId: intoOrg }).where(inArray(zones.venueId, ids));
      // The old studio's grants on these venues were handed out by a studio that no longer owns them.
      await tx.delete(venueGrants).where(inArray(venueGrants.venueId, ids));
      // Rows the old studio keeps must not point across the tenant line at a venue it no longer holds.
      await tx
        .update(appointments)
        .set({ venueId: null })
        .where(and(eq(appointments.organizationId, fromOrg), inArray(appointments.venueId, ids)));
      await tx
        .update(sketchTemplates)
        .set({ venueId: null })
        .where(and(eq(sketchTemplates.organizationId, fromOrg), inArray(sketchTemplates.venueId, ids)));
    }

    // Copies, under new ids — the old rows stay where her old (now unreachable) designs can still
    // resolve them.
    const newId = new Map(toCopy.map((p) => [p.id, crypto.randomUUID()]));
    if (toCopy.length) {
      await tx.insert(products).values(
        toCopy.map(({ createdAt: _c, updatedAt: _u, ...p }) => ({
          ...p,
          id: newId.get(p.id)!,
          organizationId: intoOrg,
          supplierId: null,
        })),
      );
    }
    if (variants.length) {
      await tx.insert(productVariants).values(
        variants.map(({ createdAt: _c, ...v }) => ({
          ...v,
          id: crypto.randomUUID(),
          organizationId: intoOrg,
          productId: newId.get(v.productId)!,
        })),
      );
    }

    // Any grant she held inside the old studio is meaningless now and would only confuse its list.
    await tx.delete(venueGrants).where(eq(venueGrants.granteeUserId, her.id));

    await tx.update(users).set({ organizationId: intoOrg, role: "designer" }).where(eq(users.id, her.id));

    for (const id of ids) {
      await tx.insert(venueGrants).values({
        venueId: id,
        grantorOrgId: intoOrg,
        granteeOrgId: intoOrg,
        granteeUserId: her.id,
        granteeEmail: her.email,
        granteeName: her.name,
        kind: "member",
        role: "manager",
        state: "active",
        invitedAt: today(),
      });
    }

    if (connection) {
      await tx.delete(googleEventLinks).where(eq(googleEventLinks.connectionId, connection.id));
      await tx.update(googleConnections).set({ organizationId: intoOrg }).where(eq(googleConnections.id, connection.id));
    }
  });

  console.log(
    `done — ${her.email} is now a designer in "${await orgName(intoOrg)}", with ${ids.length} venue(s); ` +
      `${toCopy.length} catalog item(s) copied, ${doomed.size} event(s) deleted.`,
  );
  console.log("To give her more of the studio's venues: Settings → מתחמים ושיתוף → חבר צוות.\n");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
