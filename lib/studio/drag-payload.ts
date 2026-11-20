import type { Product } from "@/lib/catalog/types";
import type { ChairRows } from "@/lib/design-document/types";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import { catalogBox, footprintBounds, resolveFootprint } from "./footprint";
import { holdKind, TABLE_SOLID } from "./catalog-resolver";
import { FLOOR_COVER } from "./collide";
import { seatRing, type SeatRing } from "./seat-ring";
import { seatsAround } from "./seating";
import { isMain } from "../self-check";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { isTableSet } from "@/lib/catalog/composition";
import { isCeilingClothCategory } from "./ceiling-cloth";

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
  /** Its footprint is a circle — held off other things as one (lib/studio/collide.ts), not as the
   *  square round it. */
  round?: boolean;
  /** A TABLE with chairs: the ring they make with it (lib/studio/seat-ring.ts), in its own frame —
   *  what it is held off the other tables by, so it lands where its chairs meet theirs (QA MG-16). */
  ring?: SeatRing;
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
  const f = resolveFootprint(product);
  const b = footprintBounds(f);
  // `solid` rides along for the same reason the size does: the DROP is the first moment the canvas
  // could otherwise know what it is being handed, and by then the deck has already landed on top of
  // another one (lib/studio/collide.ts).
  const solid = holdKind(product);
  // The chairs a table is dropped with (studio-screen tableFields: the row's count), round its shape.
  const seats = solid === TABLE_SOLID ? Number(product.categoryFields?.seats) : 0;
  const ring = seats > 0 ? seatRing({ widthMm: b.w, depthMm: b.h, round: f.kind === "circle" }, seatsAround(f, seats, undefined, product.appearance?.blockedSides ?? [])) : undefined;
  return { productId: product.id, widthMm: b.w, depthMm: b.h, solid, landing: landingOf(product), ...(f.kind === "circle" ? { round: true } : {}), ...(ring ? { ring } : {}) };
}

/** See CarriedItem.landing. A composite lands as its parts about the point, like anything free. */
export function landingOf(product: Product): CarriedItem["landing"] {
  // A table set lands on the table under the pointer, like the items it is made of.
  if (product.composition) return isTableSet(product.composition) ? "table" : "free";
  // A sail or a ceiling drape is not hung on the wall under the pointer: the drop is the first tie
  // (or the swag's first end) of a cloth drawn point by point (lib/studio/ceiling-cloth.ts), read at
  // the raw point — no wall ghost, no snap.
  if (isCeilingClothCategory(product.category)) return "hang";
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
  return { productId: product.id, widthMm: l.widthMm, depthMm: l.depthMm, solid: holdKind(product), landing: "free" };
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

// Self-check. Run: npm run check:drag-payload
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const row = (category: string) =>
    ({ id: "p", name: "x", category, layer: "floor", dimensions: { widthMm: 1800, depthMm: 900, heightMm: 750 }, categoryFields: {}, styleTags: [], variants: [], appearance: { shape: "rect" } }) as unknown as Product;
  // The rail's drop pushes what it carries off anything solid OF THE SAME KEY (lib/studio/collide.ts),
  // and the plan boxes every table under TABLE_SOLID: a table row carried under its category's name
  // ("tables") matched nothing, and a table let go half on another landed overlapping it (QA MG-8).
  assert(carriedOf(row("tables")).solid === TABLE_SOLID, "a table carried off the rail is solid as the plan's tables are");
  assert(carriedOf(row("stage-decks")).solid === "stage" && carriedOf(row("stages")).solid === "stage", "a deck and a stage are one kind of solid");
  assert(carriedOf(row("sofas")).solid === "sofas", "every other floor category is solid against its own");
  const round = { ...row("tables"), dimensions: { diameterMm: 1800, heightMm: 750 }, appearance: { shape: "circle" } } as unknown as Product;
  assert(carriedOf(round).round === true && !carriedOf(row("tables")).round, "a round table is carried as round — held off the others as a circle");
  // A rug lies under everything but is still held by a wall (collide.ts FLOOR_COVER).
  assert(carriedOf(row("rugs")).solid === FLOOR_COVER && carriedOf(row("dance-floors")).solid === FLOOR_COVER, "a rug or a dance floor is carried as a floor cover");
  // A composite lands as its parts, pasted about the point: its box holds nothing off.
  assert(carriedOf({ ...row("composites"), composition: { tables: [], placements: [] } } as unknown as Product).solid === undefined, "a composite carries no hold of its own");
  // A table with its chairs is held off the others by its seat ring (QA MG-16).
  const seated = { ...row("tables"), categoryFields: { seats: 10 } } as unknown as Product;
  const ring = carriedOf(seated).ring;
  assert(!!ring && ring.widthMm > 1800 && ring.depthMm > 900, "a table with its catalog chairs is carried with the ring they make");
  assert(!carriedOf(row("tables")).ring, "…a table with none has no ring but its top");
  const roundSeated = carriedOf({ ...round, categoryFields: { seats: 10 } } as unknown as Product).ring;
  assert(!!roundSeated?.round && roundSeated.widthMm > 1800, "…and a round one a round ring");
  console.log("drag-payload self-check passed");
}
