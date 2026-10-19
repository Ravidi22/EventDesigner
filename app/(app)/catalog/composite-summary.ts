// What a composite catalog item (lib/catalog/composition.ts) says about itself on a card and in its
// drawer: what it is made of, in a line, and what its parts add up to. Read through the studio's
// synchronous catalog cache (lib/studio/catalog-resolver.ts), so it follows the parts' current
// prices and names rather than a copy taken when the item was saved.
import type { Composition } from "@/lib/catalog/types";
import { compositionPrice } from "@/lib/catalog/composition";
import { resolve } from "@/lib/studio/catalog-resolver";
import { defaultChair } from "@/lib/catalog/chairs";
import { vesselOf } from "@/lib/catalog/vessel";

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** "2 שולחנות · 8 פריטים · 24 כיסאות" — the parts that are there; an empty count is left out. */
export function compositeLine(c: Composition): string {
  const items = c.placements.reduce((n, p) => n + p.quantity, 0);
  const seats = c.tables.reduce((n, t) => n + (t.seats ?? 0), 0);
  return [
    c.tables.length ? count(c.tables.length, "שולחן אחד", "שולחנות") : null,
    items ? count(items, "פריט אחד", "פריטים") : null,
    seats ? count(seats, "כיסא אחד", "כיסאות") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The parts' prices added up (compositionPrice) — the chairs at the chair each table names, else the
 *  studio's default chair. */
export function compositeTotal(c: Composition): { total: number; partial: boolean } {
  return compositionPrice(
    c,
    (id) => {
      const r = resolve(id);
      return r ? { price: r.price, perUnit: (r.product.priceUnit ?? "unit") === "unit" } : undefined;
    },
    defaultChair(),
    (p) => vesselOf(p, (id) => resolve(id)?.product),
  );
}
