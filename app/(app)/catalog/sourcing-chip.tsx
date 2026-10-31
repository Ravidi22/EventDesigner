"use client";

import { Store, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { isSourced, STOCK_KIND_LABEL, type Product, type StockKind } from "@/lib/catalog/types";

const ICON: Record<StockKind, LucideIcon> = { owned: Warehouse, rented: Truck, consumable: Store };

/** The card's one procurement word — מחסן / שוכרים / קונים — and, when the row is rented or bought
 *  and names nobody, "ללא ספק" in alert ink: the one state that keeps a row out of every order
 *  (lib/suppliers/procurement.ts groups it under "ללא ספק", which cannot be sent). A composite is
 *  no stock of its own and wears none.
 *
 *  Informational on the card: the whole card opens the drawer, where the chip is edited; the
 *  catalog's bulk bar changes it for a filtered set at once. */
export function SourcingChip({ product, className = "" }: { product: Product; className?: string }) {
  if (product.composition) return null;
  const kind: StockKind = product.stockKind ?? "owned";
  const Icon = ICON[kind];
  const unsourced = isSourced(kind) && !product.supplierId;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs " +
        (unsourced ? "border-alert/40 bg-alert-tint text-alert-ink" : "border-border text-muted") +
        " " +
        className
      }
      title={unsourced ? `${STOCK_KIND_LABEL[kind]} — בלי ספק, לא יגיע להזמנה` : STOCK_KIND_LABEL[kind]}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {unsourced ? "ללא ספק" : SHORT[kind]}
    </span>
  );
}

/** The chip's short form of STOCK_KIND_LABEL — one word on a card. */
export const SHORT: Record<StockKind, string> = { owned: "מחסן", rented: "שוכרים", consumable: "קונים" };
