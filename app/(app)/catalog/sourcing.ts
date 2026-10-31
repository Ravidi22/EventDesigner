import { isSourced, STOCK_KIND_LABEL, STOCK_KINDS, type Product, type StockKind } from "@/lib/catalog/types";

// A plain module, not filters.tsx: page.tsx is a server component and validates `?sourcing=`
// against this list, and a value imported from a "use client" file reaches the server as a
// client-reference proxy — `SOURCING_FILTERS.includes` was not a function there.

/** The "רכש" lens: where a row comes from (one of the three kinds), or the two states the forecast
 *  trips over — rented/bought rows with no supplier, owned rows with no count. */
export type SourcingFilter = StockKind | "unsourced" | "uncounted";

export const SOURCING_FILTER_LABEL: Record<SourcingFilter, string> = {
  unsourced: "ללא ספק",
  uncounted: "לא נספרו",
  owned: STOCK_KIND_LABEL.owned,
  rented: STOCK_KIND_LABEL.rented,
  consumable: STOCK_KIND_LABEL.consumable,
};

export const SOURCING_FILTERS: readonly SourcingFilter[] = ["unsourced", "uncounted", ...STOCK_KINDS];

export function matchesSourcing(p: Product, s: SourcingFilter): boolean {
  if (p.composition) return false;
  const kind: StockKind = p.stockKind ?? "owned";
  if (s === "unsourced") return isSourced(kind) && !p.supplierId;
  if (s === "uncounted") return kind === "owned" && p.stockQty === undefined;
  return kind === s;
}
