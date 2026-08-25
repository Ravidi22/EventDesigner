// A stable id for each studio's copy of a base item.
//
// Deterministic, and that is the entire point: installing the base library is one INSERT … ON
// CONFLICT DO NOTHING, so running it again after a table is added to the list adds exactly that
// table and leaves every existing row — with whatever price and stock count the designer has since
// typed into it — untouched. Random ids would make the second run a duplicate catalog.
//
// UUID v5 (RFC 4122 §4.3), namespaced by the ORGANISATION, so the same base item is a different row
// in every studio — which is what "each studio gets its own copy" means. Hand-rolled rather than
// added as a dependency: it is a SHA-1 over sixteen bytes plus six bits of version and variant.
//
// A designer who DELETES a base table gets it back the next time the install runs; one who ARCHIVES
// it does not, because the row still exists and still conflicts. That asymmetry is the honest cost
// of a deterministic id, and archiving is already the app's answer for an item you do not want to
// see (F-4.5) — a tombstone table for furniture nobody wanted is more machinery than this deserves.
//
// ⚠ SERVER ONLY (node:crypto). Nothing in the browser needs to mint one of these; keep this import
// out of anything a client component reaches, which is why the item list next door has none.
import { createHash } from "node:crypto";
import { isMain } from "../../self-check";

export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16) throw new Error(`namespace must be a uuid: ${namespace}`);

  // Namespace bytes first, then the name — the order is normative, and swapping it produces
  // perfectly stable ids that no other implementation agrees with.
  const bytes = createHash("sha1").update(ns).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The id this studio's copy of `key` has, whether or not it exists yet. */
export function standardProductId(organizationId: string, key: string): string {
  return uuidV5(key, organizationId);
}

// ponytail: self-check. Run: npm run check:standard
if (isMain(import.meta.url)) {
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (ok) {
      console.log(`  ok   ${what}`);
    } else {
      console.error(`FAIL: ${what}`);
      failures.push(what);
    }
  };

  // RFC 4122 §A.1 — if this vector passes, the implementation is the standard one and not merely a
  // consistent hash of its own.
  const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  check(
    uuidV5("www.example.com", DNS_NAMESPACE) === "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    "matches the RFC 4122 test vector",
  );

  const orgA = "00000000-0000-0000-0000-000000000001";
  const orgB = "00000000-0000-0000-0000-000000000002";
  check(
    standardProductId(orgA, "table-round-180") === standardProductId(orgA, "table-round-180"),
    "stable — this is what makes the install idempotent",
  );
  check(
    standardProductId(orgA, "table-round-180") !== standardProductId(orgB, "table-round-180"),
    "one item is a different row in every studio",
  );
  check(
    standardProductId(orgA, "table-round-180") !== standardProductId(orgA, "table-round-244"),
    "two items are two rows",
  );

  // The shape every server action in lib/catalog/actions.ts demands of an id it is handed.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  check(UUID.test(standardProductId(orgA, "table-round-180")), "passes the actions' uuid guard");

  let rejected = false;
  try {
    uuidV5("x", "not-a-uuid");
  } catch {
    rejected = true;
  }
  check(rejected, "refuses a namespace that is not a uuid");

  if (failures.length) {
    console.error(`${failures.length} failed`);
    process.exit(1);
  }
  console.log("standard ids ok");
}
