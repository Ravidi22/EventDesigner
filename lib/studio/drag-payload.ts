import type { Product } from "@/lib/catalog/types";
import { footprintBounds, resolveFootprint } from "./footprint";
import { solidKind } from "./catalog-resolver";

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
let carried: { productId: string; widthMm: number; depthMm: number; solid?: string } | null = null;

export function carryProduct(product: Product): void {
  const b = footprintBounds(resolveFootprint(product));
  // `solid` rides along for the same reason the size does: the DROP is the first moment the canvas
  // could otherwise know what it is being handed, and by then the deck has already landed on top of
  // another one (lib/studio/collide.ts).
  carried = { productId: product.id, widthMm: b.w, depthMm: b.h, solid: solidKind(product) };
}

export function dropCarried(): void {
  carried = null;
}

/** What is being dragged over the canvas right now, if anything. */
export function carriedItem(): { productId: string; widthMm: number; depthMm: number; solid?: string } | null {
  return carried;
}
