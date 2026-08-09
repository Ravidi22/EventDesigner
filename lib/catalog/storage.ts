// The catalog, in the browser's memory.
//
// This file used to BE the catalog store (localStorage). It isn't any more — Postgres is, behind
// lib/catalog/actions.ts. What survives here is the half that has to stay synchronous, and the
// reason is the studio:
//
//   • catalog-resolver.ts resolves a placement's variantId to its product WHILE RENDERING the
//     canvas, once per placed item. A render cannot await.
//   • studio-screen.tsx looks a product up in the middle of a DROP, to decide whether the thing
//     being dragged belongs on a table, on a wall, or wherever the pointer let go. A drag that
//     waits on a network round-trip is a drag that feels broken.
//
// So the catalog is loaded ONCE per session and held here. That is not a workaround; it is what the
// catalog is — a few hundred rows of reference data that change when the designer edits them and
// at no other time. The write path goes to the server and hands the fresh list back to primeCatalog,
// so the cache and the database cannot disagree for longer than one round-trip.
//
// Nothing in this file reads or writes storage of any kind. It is memory, and it is empty until
// something primes it (see useCatalog in ./use-catalog).
import type { Product } from "./types";

let cache: Product[] = [];

/** Bumped on every prime so the studio's resolver index knows to rebuild (no import cycle). */
export let catalogVersion = 0;

/** Replace the cached catalog. Called with whatever a server action just returned — every action in
 *  lib/catalog/actions.ts answers with the full list precisely so this stays a single assignment
 *  rather than a merge that could drift. */
export function primeCatalog(list: Product[]): void {
  cache = list;
  catalogVersion++;
}

/** Every product this studio has, archived included — callers filter. Empty before the first prime,
 *  which is a real state: a screen rendering at that moment shows its loading or empty view. */
export function loadProducts(): Product[] {
  return cache;
}

export function productById(id: string): Product | undefined {
  return cache.find((p) => p.id === id);
}

/** Every variant id a placement could reference for this product — including the product's own id,
 *  which is the implicit default used when a product has no variants of its own. */
export function variantIdsOf(p: Product): string[] {
  return [p.id, ...p.variants.map((v) => v.id)];
}
