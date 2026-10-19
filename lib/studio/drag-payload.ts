import type { Product } from "@/lib/catalog/types";
import type { ChairRows } from "@/lib/design-document/types";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import { catalogBox, footprintBounds, resolveFootprint } from "./footprint";
import { solidKind } from "./catalog-resolver";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { isTableSet } from "@/lib/catalog/composition";

// What the pointer is carrying between the catalog rail and the canvas, for the length of one HTML5
// drag.
//
// It exists because `dataTransfer.getData` is deliberately unreadable during `dragover` — the spec
// only exposes the TYPES until the drop, so that a page cannot read what is being dragged over it
// before the user commits. That protection is right, and it also means the canvas cannot know how
// big the thing hovering over it is, which is exactly what the alignment and equal-gap guides need
// in order to draw anything at all while the drag is still in the air.
//
// So the rail says what it is carrying when the drag starts, and clears it when the drag ends. The
// id still travels through dataTransfer — that is the real payload and the only thing the DROP
// reads. This is a hint about a gesture that is happening right now, nothing more: it is not state,
// it is never persisted, and a stale value can do no harm beyond one wrong guide line.
export interface CarriedItem {
  productId: string;
  widthMm: number;
  depthMm: number;
  solid?: string;
  /** Where it lands is decided by what is UNDER the pointer — a centrepiece by the table, a drape by
   *  the wall — so its drop point must not be pulled onto an alignment line first: a candlestick let
   *  go near the seam of a head table was snapped onto the neighbouring table's edge and landed on
   *  that table instead. Only a free-standing thing ("free") is snapped. A ceiling item ("hang")
   *  is hung over what is under the pointer — centred on it — so it is not snapped either: a snap
   *  onto the seam between two tables hung it over the wrong one. */
  landing: "free" | "table" | "wall" | "hang";
}

let carried: CarriedItem | null = null;

/** What the canvas needs to know about an item it is about to receive — by drag, or by the click
 *  of an item armed on the rail, which asks the same questions of the same product. */
export function carriedOf(product: Product): CarriedItem {
  const b = footprintBounds(resolveFootprint(product));
  // `solid` rides along for the same reason the size does: the DROP is the first moment the canvas
  // could otherwise know what it is being handed, and by then the deck has already landed on top of
  // another one (lib/studio/collide.ts).
  return { productId: product.id, widthMm: b.w, depthMm: b.h, solid: solidKind(product), landing: landingOf(product) };
}

/** See CarriedItem.landing. A composite lands as its parts about the point, like anything free. */
export function landingOf(product: Product): CarriedItem["landing"] {
  // A table set lands on the table under the pointer, like the items it is made of.
  if (product.composition) return isTableSet(product.composition) ? "table" : "free";
  if (CATEGORY_BY_ID[product.category]?.anchor === "wall") return "wall";
  if (product.layer === "ceiling") return "hang";
  return product.layer === "table" ? "table" : "free";
}

export function carryProduct(product: Product): void {
  carried = carriedOf(product);
}

// A BLOCK OF CHAIRS IN ROWS travels as its chair's product id behind this prefix — the rail's
// "שורות כיסאות" card, dragged or armed (lib/design-document/chair-rows.ts). The drop and the armed
// click both read it with rowsTool(); everything else about the drag is the chair's.
const ROWS_PREFIX = "rows:";

/** The id the rail carries for a block of `chairProductId`. */
export function rowsToolId(chairProductId: string): string {
  return ROWS_PREFIX + chairProductId;
}

/** What a carried or armed id names: the product, and whether it is a block of rows of it. */
export function rowsTool(id: string): { productId: string; rows: boolean } {
  return id.startsWith(ROWS_PREFIX) ? { productId: id.slice(ROWS_PREFIX.length), rows: true } : { productId: id, rows: false };
}

/** The block a chair lands as — the size the canvas's guides and the armed ghost measure. */
export function carriedRowsOf(product: Product, spec: ChairRows): CarriedItem {
  const l = chairRowsLayout(spec, catalogBox(product));
  return { productId: product.id, widthMm: l.widthMm, depthMm: l.depthMm, solid: solidKind(product), landing: "free" };
}

export function carryRows(product: Product, spec: ChairRows): void {
  carried = carriedRowsOf(product, spec);
}

export function dropCarried(): void {
  carried = null;
}

/** What is being dragged over the canvas right now, if anything. */
export function carriedItem(): CarriedItem | null {
  return carried;
}
