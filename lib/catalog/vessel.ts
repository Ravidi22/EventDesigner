// An ARRANGEMENT IN A VESSEL — a flower arrangement (or a centrepiece, or a single stem) set in a
// vase or a jug from the studio's own `vases` rows (אגרטלים וכלים).
//
// The vessel is not a second placement standing under the flowers: an item whose place is another
// item's would have to be carried by every rule that moves, lays out, patterns, copies, saves or
// sanitises the dressing on a table, and each one that forgot would leave a vase behind. It is a
// FIELD, the way a table names its chair (DesignTable.chairVariantId): the arrangement's catalog row
// says which vessel it is made in (`categoryFields.vessel`, a variant id — set in the drawer), a
// placement may say otherwise (`Placement.vessel`: a variant id, or null for "no vessel on this
// plan"), and everything that already carries a placement carries its vessel with it.
//
// The vessel is a real thing the crew packs: measureTotals counts it beside the arrangement (one
// per arrangement, × its quantity) through `MeasureContext.vesselOf`, so the packing list, the stock
// peak and the quote see it. On the plan it is drawn under the flowers, and where the flowers hide
// it, its rim is dashed over them — the plan's hidden-line convention.
//
// Pure, no catalog cache: the caller hands in how to look a variant up. Self-checked:
// `npm run check:vessel`.
import type { Placement } from "@/lib/design-document/types";
import type { Product } from "./types";

/** The categories whose items may stand in a vessel. */
export const VESSEL_HOLDERS: ReadonlySet<string> = new Set(["flower-arrangements", "centerpieces", "flowers"]);
/** The category the vessels themselves are in. */
export const VESSEL_CATEGORY = "vases";

export const takesVessel = (p: Pick<Product, "category"> | undefined): boolean => !!p && VESSEL_HOLDERS.has(p.category);
export const isVessel = (p: Pick<Product, "category"> | undefined): boolean => p?.category === VESSEL_CATEGORY;

/** The vessel a catalog row says it is made in — a variant id, or undefined. */
export function productVessel(p: Pick<Product, "categoryFields"> | undefined): string | undefined {
  const v = p?.categoryFields?.vessel;
  return typeof v === "string" && v ? v : undefined;
}

/**
 * The vessel this placement stands in, as a variant id: its own (`vessel`), else its row's — and
 * only when that names a row of the vessels' category, so a deleted or re-filed vase is simply no
 * vessel rather than a phantom line on the packing list. `null` on the placement is "none here",
 * whatever the row says. A row that HANGS (layer "ceiling" — a flower cloud, a hoop) stands in no
 * vessel at all: the drawer offers none for it, and one left from when the row stood on a table was
 * still counted, packed and quoted under it (QA 2026-11-20, PR-7).
 */
export function vesselOf(p: Pick<Placement, "variantId" | "vessel">, productOf: (variantId: string) => Product | undefined): string | undefined {
  if (p.vessel === null) return undefined;
  const holder = productOf(p.variantId);
  if (!takesVessel(holder) || holder?.layer === "ceiling") return undefined;
  const id = p.vessel ?? productVessel(holder);
  return id && isVessel(productOf(id)) ? id : undefined;
}
