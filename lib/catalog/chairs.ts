// THE CHAIRS ROUND A TABLE. A table's chairs are derived from its seat count (lib/studio/seating.ts)
// and were never a catalog row of their own — which is how a 240-seat event packed zero chairs and
// how the chairs sheet could say where every chair stands but never which chair it is.
//
// A table may now name its chair (DesignTable.chairVariantId); one that does not takes the studio's
// DEFAULT chair: the first unarchived row of the `chairs` category, the same rule a stage's
// banquette chairs have always been packed by (lib/outputs/lookup.ts, stagePart "chair").
import type { DesignTable } from "@/lib/design-document/types";
import { loadProducts } from "./storage";

const CHAIRS = "chairs";

/** Every chair the studio can put round a table: one option per unarchived variant of every
 *  unarchived chairs row ("כיסא נפוליאון · זהב"), or the row itself when it has no variants. */
export function chairOptions(): { value: string; label: string }[] {
  return loadProducts()
    .filter((p) => p.category === CHAIRS && !p.archived)
    .flatMap((p) => {
      const live = p.variants.filter((v) => !v.archived);
      if (live.length === 0) return [{ value: p.id, label: p.name }];
      return live.map((v) => ({ value: v.id, label: live.length > 1 ? `${p.name} · ${v.name}` : p.name }));
    });
}

/** The studio's default chair — what a table that names none is set with. */
export function defaultChair(): string | undefined {
  const p = loadProducts().find((x) => x.category === CHAIRS && !x.archived);
  return p ? (p.variants.find((v) => !v.archived)?.id ?? p.id) : undefined;
}

/** The chair round this table: its own, else the default. */
export function chairOf(table: Pick<DesignTable, "chairVariantId">, fallback: string | undefined = defaultChair()): string | undefined {
  return table.chairVariantId ?? fallback;
}
