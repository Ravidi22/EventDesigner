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
