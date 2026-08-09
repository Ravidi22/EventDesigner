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
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";

/** There is no deleteVenue action — the app has no such button — so the fixture is removed
 *  directly. A test must not be the reason a destructive production action exists. */
async function deleteVenueForTest(id: string) {
  await db().delete(venues).where(eq(venues.id, id));
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
