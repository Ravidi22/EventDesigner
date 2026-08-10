// Proves Product → Postgres → Product survives the trip unchanged.
//
//   npm run db:verify
//
// It builds its own fixture rather than comparing against seed content, because there is no seed
// content any more — the catalog starts empty and fills with the designer's real products. That
// also makes this safe to run against a catalog with real items in it: everything it creates is
// deleted again, and the last assertion is that the catalog is exactly the size it was on entry.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { actAsOrgForScript, SINGLE_ORG_ID } from "@/lib/db/org";

// This script is a plain Node process: there is no request and no session cookie for currentOrg()
// to read. This is the one seam that lets it say which studio it is acting as, and it refuses to
// work in production. The organisation is the one `npm run db:seed` creates.
//
// It runs at module scope rather than inside main() because it must be set before the first action
// call. (Imports hoist above it — that is fine, since none of them call currentOrg() while being
// evaluated, only when invoked.)
actAsOrgForScript(SINGLE_ORG_ID);

import { fetchProducts, saveProduct, removeProduct } from "@/lib/catalog/actions";
import type { Product } from "@/lib/catalog/types";
import {
  fetchVenues,
  createVenue,
  renameVenue,
  saveVenuePlan,
  fetchVenuePlan,
  fetchVenueGeometry,
} from "@/lib/venues/actions";
import { emptyStructure, type VenueStructure } from "@/lib/venues/structure";
import type { Zone } from "@/lib/venues/zone";
import { fetchEvents, saveEvent, patchEvent, reachStep } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { db } from "@/lib/db";
import { venues, events } from "@/lib/db/schema";

/** There is no deleteVenue or deleteEvent action — the app has no such button, only archive — so
 *  fixtures are removed directly. A test must not be the reason a destructive production action
 *  exists. */
async function deleteVenueForTest(id: string) {
  await db().delete(venues).where(eq(venues.id, id));
}

async function deleteEventForTest(id: string) {
  await db().delete(events).where(eq(events.id, id));
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

/** Drop undefined keys, the way JSON transport does — absent and undefined are one thing here. */
const clean = (p: Product) => JSON.parse(JSON.stringify(p)) as Record<string, unknown>;

/** JSON with object keys sorted, so two structurally equal values compare equal.
 *
 *  Needed because Postgres JSONB does not preserve key ORDER — it stores keys sorted by length then
 *  alphabetically — so a value written as {id, a, b} comes back as {a, b, id}. Same data, different
 *  string. Any equality test on a JSONB round-trip has to normalise first. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}

function fixture(): Product {
  return {
    id: crypto.randomUUID(),
    name: "בדיקה — מפת קטיפה",
    category: "tablecloths",
    layer: "table",
    dimensions: { widthMm: 3200, depthMm: 3200, heightMm: 5 },
    categoryFields: { arms: 5 },
    spec: "בד קטיפה",
    unitPrice: 45.75,
    styleTags: ["קלאסי", "זוהר"],
    variants: [
      { id: crypto.randomUUID(), name: "זהב", swatch: "#c9a227" },
      { id: crypto.randomUUID(), name: "בורדו", swatch: "#6d1f2e", unitPrice: 52.25 },
    ],
  };
}

async function main() {
  const before = (await fetchProducts()).length;
  console.log(`catalog on entry: ${before} products\n`);

  // ── round trip ───────────────────────────────────────────────────────────────────────────────
  const original = fixture();
  const afterSave = await saveProduct(original);
  const returned = afterSave.find((p) => p.id === original.id);
  check("saveProduct created it", !!returned);

  if (returned) {
    const a = clean(original);
    const b = clean(returned);
    const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k}: sent=${JSON.stringify(a[k])} got=${JSON.stringify(b[k])}`);
    check("the whole object round-trips identically", diffs.length === 0, diffs.join(" | "));
    check("dimensions survived (nested → flat → nested)", JSON.stringify(returned.dimensions) === JSON.stringify(original.dimensions));
    check("price is a NUMBER with exact decimals", returned.unitPrice === 45.75, `${typeof returned.unitPrice} ${returned.unitPrice}`);
    check("variant price kept precision", returned.variants[1]?.unitPrice === 52.25, String(returned.variants[1]?.unitPrice));
    check("variants kept their order", returned.variants.map((v) => v.name).join(",") === "זהב,בורדו");
    check("jsonb categoryFields survived", JSON.stringify(returned.categoryFields) === JSON.stringify({ arms: 5 }));
    check("styleTags array survived", JSON.stringify(returned.styleTags) === JSON.stringify(["קלאסי", "זוהר"]));
  }

  // ── visibility ───────────────────────────────────────────────────────────────────────────────
  check("a new product defaults to private (absent)", returned?.visibility === undefined, String(returned?.visibility));

  const published = await saveProduct({ ...original, visibility: "public" });
  const pub = published.find((p) => p.id === original.id);
  check("publishing persists", pub?.visibility === "public", String(pub?.visibility));

  const unpublished = await saveProduct({ ...original, visibility: "private" });
  const priv = unpublished.find((p) => p.id === original.id);
  check("un-publishing collapses back to absent, not the string", priv?.visibility === undefined, String(priv?.visibility));

  // ── update ───────────────────────────────────────────────────────────────────────────────────
  const edited = { ...original, name: "בדיקה — שם מעודכן", variants: [] };
  const afterEdit = await saveProduct(edited);
  const updated = afterEdit.find((p) => p.id === original.id);
  check("update is in place, not a duplicate", afterEdit.filter((p) => p.id === original.id).length === 1);
  check("rename landed", updated?.name === "בדיקה — שם מעודכן");
  check("variants replaced wholesale (now empty)", updated?.variants.length === 0);

  // ── delete ───────────────────────────────────────────────────────────────────────────────────
  const { products: afterDelete, archived } = await removeProduct(original.id);
  check("an unplaced product is deleted, not archived", archived === false);
  check("it is gone", !afterDelete.some((p) => p.id === original.id));
  check("the catalog is exactly as we found it", afterDelete.length === before, `${afterDelete.length} vs ${before}`);

  await verifyVenues();
  await verifyEvents();

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

/** The venue half: a property, its wall graph and its zones — written together, read back apart. */
async function verifyVenues() {
  console.log("\n— venues —");
  const before = (await fetchVenues()).length;

  const { venues: created, id } = await createVenue();
  check("createVenue added one", created.length === before + 1);

  const renamed = await renameVenue(id, "בדיקה — חוות");
  check("renameVenue landed", renamed.find((v) => v.id === id)?.name === "בדיקה — חוות");

  // A minimal wall graph: two nodes, one wall between them, and a zone anchored inside.
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  const structure: VenueStructure = {
    ...emptyStructure(),
    nodes: [
      { id: a, x: 0, y: 0 },
      { id: b, x: 12000, y: 0 },
    ],
    walls: [{ id: crypto.randomUUID(), a, b, kind: "wall" }],
  };
  const zone: Zone = {
    id: crypto.randomUUID(),
    venueId: id,
    name: "האולם הגדול",
    kind: "hall",
    source: { type: "face", anchor: { x: 6000, y: 3000 } },
    ceilingHeightMm: 4200,
    capacity: { seated: 300 },
    createdAt: Date.now(),
  };

  await saveVenuePlan(id, structure, [zone]);
  const plan = await fetchVenuePlan(id);
  check(
    "wall graph round-trips",
    stable(plan.structure) === stable(structure),
    `sent=${JSON.stringify(structure).slice(0, 120)} got=${JSON.stringify(plan.structure).slice(0, 120)}`,
  );
  check("zone round-trips", JSON.stringify(plan.zones) === JSON.stringify([zone]), JSON.stringify(plan.zones[0]?.capacity));
  check("zone createdAt survives as epoch ms", plan.zones[0]?.createdAt === zone.createdAt);

  // Saving again replaces wholesale — the undo path. Two saves must not leave two zones.
  await saveVenuePlan(id, structure, [zone]);
  check("re-saving does not duplicate zones", (await fetchVenuePlan(id)).zones.length === 1);

  // Removing a zone from the list is how an undo expresses itself.
  await saveVenuePlan(id, structure, []);
  check("a shorter list deletes the zone", (await fetchVenuePlan(id)).zones.length === 0);

  const geometry = await fetchVenueGeometry(id);
  check("geometry carries the walls", geometry.structure.walls.length === 1);
  check("geometry carries the venue's scale", geometry.mmPerUnit === 1);

  check("an absent venue yields empty geometry, not an error", (await fetchVenueGeometry(undefined)).zones.length === 0);

  await deleteVenueForTest(id);
  check("cleanup: the venue list is as we found it", (await fetchVenues()).length === before, `${(await fetchVenues()).length} vs ${before}`);
}

/** The event half: a client record standing on zones of a property. Needs a venue and a zone to
 *  stand on, so it builds both and takes both down again. */
async function verifyEvents() {
  console.log("\n— events —");
  const before = (await fetchEvents()).length;

  // The property this event is booked into.
  const { id: venueId } = await createVenue();
  const zoneA: Zone = {
    id: crypto.randomUUID(),
    venueId,
    name: "האולם",
    kind: "hall",
    source: { type: "face", anchor: { x: 1000, y: 1000 } },
    ceilingHeightMm: 4000,
    createdAt: Date.now(),
  };
  const zoneB: Zone = { ...zoneA, id: crypto.randomUUID(), name: "החופה", kind: "canopy" };
  await saveVenuePlan(venueId, emptyStructure(), [zoneA, zoneB]);

  const original: EventSummary = {
    id: crypto.randomUUID(),
    clientName: "בדיקה — משפחת לוי",
    phone: "050-0000000",
    contactName: "נועה",
    contact2Name: "אבי",
    contact2Phone: "052-0000000",
    // The date this whole check exists for. It is a Sunday in August; the machine running this is
    // at UTC+3, so anything that parses it into a Date and formats it back lands on the 8th.
    date: "2026-08-09",
    time: "19:30",
    meetingDate: "2026-06-01",
    venueId,
    // B before A on purpose: the order is the designer's, not the table's.
    zoneIds: [zoneB.id, zoneA.id],
    zonesLabel: "החופה + האולם",
    guests: 240,
    step: 2,
    createdAt: Date.now(),
  };

  const afterSave = await saveEvent(original);
  const returned = afterSave.find((e) => e.id === original.id);
  check("saveEvent created it", !!returned);

  if (returned) {
    const a = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    const b = JSON.parse(JSON.stringify(returned)) as Record<string, unknown>;
    const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k}: sent=${JSON.stringify(a[k])} got=${JSON.stringify(b[k])}`);
    check("the whole event round-trips identically", diffs.length === 0, diffs.join(" | "));
    check("the wedding is still the same CALENDAR DAY", returned.date === "2026-08-09", returned.date);
    check("the start time survives as HH:mm", returned.time === "19:30", String(returned.time));
    check("the meeting date is its own date", returned.meetingDate === "2026-06-01", String(returned.meetingDate));
    check("zone order is the designer's, not the table's", returned.zoneIds.join() === [zoneB.id, zoneA.id].join());
    check("an unarchived event has no archived key", returned.archived === undefined, String(returned.archived));
    check("createdAt survives as epoch ms", returned.createdAt === original.createdAt);
  }

  // ── patch ────────────────────────────────────────────────────────────────────────────────────
  const patched = await patchEvent(original.id, { guests: 260, zoneIds: [zoneA.id] });
  const one = patched.find((e) => e.id === original.id);
  check("patch is in place, not a duplicate", patched.filter((e) => e.id === original.id).length === 1);
  check("patch landed", one?.guests === 260, String(one?.guests));
  check("a shorter zone list drops the zone", one?.zoneIds.join() === zoneA.id, String(one?.zoneIds));
  check("patch left untouched fields alone", one?.clientName === original.clientName && one?.date === "2026-08-09");

  const stamped = await patchEvent(original.id, { quoteSentAt: 1_760_000_000_000, archived: true });
  const sent = stamped.find((e) => e.id === original.id);
  check("quoteSentAt survives as epoch ms", sent?.quoteSentAt === 1_760_000_000_000, String(sent?.quoteSentAt));
  check("archived is true once set", sent?.archived === true, String(sent?.archived));

  // ── the flow only moves forward ──────────────────────────────────────────────────────────────
  const forward = await reachStep(original.id, 4);
  check("reachStep advances", forward.find((e) => e.id === original.id)?.step === 4);
  const backward = await reachStep(original.id, 1);
  check(
    "reachStep NEVER regresses",
    backward.find((e) => e.id === original.id)?.step === 4,
    String(backward.find((e) => e.id === original.id)?.step),
  );

  // ── the tenant/placement boundary ────────────────────────────────────────────────────────────
  // A zone id that is real, but belongs to a DIFFERENT property. The foreign key alone would accept
  // it — nothing about zone→venue is expressed in the events table — so this is the assertion that
  // proves the check in assertPlacement is doing the work.
  const { id: otherVenueId } = await createVenue();
  const strayZone: Zone = { ...zoneA, id: crypto.randomUUID(), venueId: otherVenueId };
  await saveVenuePlan(otherVenueId, emptyStructure(), [strayZone]);
  let rejected = false;
  try {
    await patchEvent(original.id, { zoneIds: [strayZone.id] });
  } catch {
    rejected = true;
  }
  check("a zone from another venue is refused", rejected);

  await deleteEventForTest(original.id);
  await deleteVenueForTest(venueId);
  await deleteVenueForTest(otherVenueId);
  check("cleanup: the event list is as we found it", (await fetchEvents()).length === before, `${(await fetchEvents()).length} vs ${before}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
