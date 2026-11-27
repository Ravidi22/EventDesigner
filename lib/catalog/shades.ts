// The event's shades ("גווני האירוע") and how a dropped item picks one of its own.
//
// A shade in this app IS a variant name — "זהב", "בורדו" — there is no separate colour vocabulary
// (lib/catalog/types.ts, Variant). So the event's palette is a list of those names, chosen from the
// ones the studio's catalog already carries, and an item placed for the event wears the first of
// them it stocks. Nothing here is a colour match: "זהב" does not pick "זהב מט", and a swatch that
// happens to look gold does not either. A name the designer typed twice the same way is the only
// thing two rows reliably share.
//
// Pure, no I/O: the details form reads `catalogShades` through an action, the studio reads
// `shadeVariant` through catalog-resolver's `defaultVariantId`.
import type { Product, Variant } from "./types";

/** How many shades an event may name. A palette, not an inventory — and every drop walks the list. */
export const MAX_EVENT_SHADES = 12;
const MAX_SHADE_LENGTH = 40;

/** The key two spellings of one shade share: trimmed, inner whitespace collapsed, case-folded, and
 *  the Hebrew points (niqqud and cantillation, U+0591–U+05C7) dropped — "זָהָב" is "זהב". */
export function shadeKey(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[֑-ׇ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export interface CatalogShade {
  /** The spelling to show and to store — the one most of the catalog's rows use. */
  name: string;
  /** The colour most rows give it, when any does. */
  swatch?: string;
  /** How many products stock it — what the list is ordered by. */
  products: number;
}

/** Every distinct shade the catalog's live rows carry, most-stocked first. Archived products and
 *  archived variants are not offered: a shade nothing can be placed in would choose nothing. */
export function catalogShades(products: readonly Product[]): CatalogShade[] {
  const byKey = new Map<string, { names: Map<string, number>; swatches: Map<string, number>; products: Set<string> }>();
  for (const p of products) {
    if (p.archived) continue;
    for (const v of p.variants) {
      if (v.archived) continue;
      const key = shadeKey(v.name);
      if (!key) continue;
      let entry = byKey.get(key);
      if (!entry) byKey.set(key, (entry = { names: new Map(), swatches: new Map(), products: new Set() }));
      const name = v.name.replace(/\s+/g, " ").trim();
      entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
      if (v.swatch) entry.swatches.set(v.swatch, (entry.swatches.get(v.swatch) ?? 0) + 1);
      entry.products.add(p.id);
    }
  }
  const most = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return [...byKey.values()]
    .map((e) => ({ name: most(e.names)!, swatch: most(e.swatches), products: e.products.size }))
    .sort((a, b) => b.products - a.products || a.name.localeCompare(b.name, "he"));
}

/** Whatever arrived over the wire, made safe to store: strings only, trimmed, one per key, in the
 *  order given, capped. */
export function cleanShades(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const name = v.replace(/\s+/g, " ").trim().slice(0, MAX_SHADE_LENGTH);
    const key = shadeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_EVENT_SHADES) break;
  }
  return out;
}

/** Pick a shade on, or off. A new one goes to the END — the order is the designer's preference,
 *  first wins — and picking an existing one again takes it out. */
export function toggleShade(shades: readonly string[], name: string): string[] {
  const key = shadeKey(name);
  if (shades.some((s) => shadeKey(s) === key)) return shades.filter((s) => shadeKey(s) !== key);
  return cleanShades([...shades, name]);
}

/** Whether `name` is one of `shades`, by key. */
export function hasShade(shades: readonly string[], name: string): boolean {
  const key = shadeKey(name);
  return shades.some((s) => shadeKey(s) === key);
}

/** The variant an item should wear for this event: the first of the event's shades, in the event's
 *  order, that the item stocks (live variants only). Undefined when it stocks none of them — the
 *  caller keeps whatever it chose before the event had a palette. */
export function shadeVariant(variants: readonly Variant[], shades: readonly string[]): Variant | undefined {
  if (!shades.length || !variants.length) return undefined;
  for (const shade of shades) {
    const key = shadeKey(shade);
    if (!key) continue;
    const hit = variants.find((v) => !v.archived && shadeKey(v.name) === key);
    if (hit) return hit;
  }
  return undefined;
}
