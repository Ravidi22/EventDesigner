import type { Product } from "@/lib/catalog/types";

/** A supplier as the marketplace shows them: their public profile, nothing else of theirs. */
export interface MarketSupplier {
  orgId: string;
  name: string;
  phone?: string;
  supplies?: string;
  /** The logo, Instagram handle and address the supplier typed in their own settings — the same
   *  fields a studio prints on its quote's letterhead, so already meant to be seen by others. */
  logoUrl?: string;
  instagram?: string;
  address?: string;
}

/** A supplier's shop front on the marketplace's first page: the profile and a digest of what they
 *  publish. Derived from the published rows on every read — nothing here is stored. */
export interface MarketShop {
  supplier: MarketSupplier;
  /** How many rows they publish. */
  count: number;
  /** What they publish in, most rows first. */
  categories: { id: string; count: number }[];
  /** Up to three rows for the card's cover, photographed ones first. */
  preview: Product[];
  /** How many of their rows this studio already copied. */
  inCatalog: number;
  /** Every row's name, so the header search finds a supplier by what it sells. */
  names: string[];
}

/** One published row of a supplier's catalog. `product` is the supplier's row with its price
 *  REMOVED and carried as `wholesalePrice` instead — it is a cost on the designer's side, and
 *  nothing that reads a Product may mistake it for the client price. */
export interface MarketItem {
  product: Product;
  wholesalePrice?: number;
  supplier: MarketSupplier;
  /** The id of this studio's copy, when it already has one. */
  inCatalog?: string;
}

/** What the drawer shows about a copied row's source. */
export interface SourceStatus {
  /** The supplier's current price. */
  wholesalePrice?: number;
  /** The source moved on since the cost was last taken from it. */
  updated: boolean;
  /** Archived or unpublished at the supplier — the copy stands, but no more orders will fill. */
  gone: boolean;
  supplierName: string;
}
