// Which of a studio's rows are its BUILT-INS (lib/catalog/built-in.ts) — derived, never stored.
//
// A built-in's row id is the base library's UUIDv5 over (organisation, key) (./id.ts), so "is this
// row the studio's LED strip" is a hash and a comparison, with no column and no migration. A row
// made by hand — or copied off the marketplace into the same category — has a random id and is never
// one. That is also why this is the server's answer: minting the id needs node:crypto.
//
// ⚠ SERVER ONLY, like ./id.ts. Run: npm run check:built-in
import { standardProductId } from "./id";
import { STANDARD_ITEMS } from "./items";
import type { Product } from "../types";

export const BUILT_IN_KEYS: readonly string[] = STANDARD_ITEMS.filter((i) => i.builtIn).map((i) => i.key);

/** This organisation's built-in row ids → their keys. ~20 hashes; cheap enough per read. */
export function builtInIds(organizationId: string): Map<string, string> {
  return new Map(BUILT_IN_KEYS.map((key) => [standardProductId(organizationId, key), key]));
}

/** The built-in key of row `id` in this organisation, or undefined. */
export function builtInKeyOf(organizationId: string, id: string): string | undefined {
  return builtInIds(organizationId).get(id);
}

/** The products with `builtIn` set where the row is one — and cleared where it is not, since the
 *  field is derived and a value that came from anywhere else is not the server's answer. */
export function markBuiltIns(list: Product[], organizationId: string): Product[] {
  const ids = builtInIds(organizationId);
  return list.map((p) => {
    const key = ids.get(p.id);
    if (key) return p.builtIn === key ? p : { ...p, builtIn: key };
    if (p.builtIn === undefined) return p;
    const { builtIn: _forged, ...rest } = p;
    return rest;
  });
}
