import type { Layer } from "../design-document/types";

// The four planes the studio's chip row switches between, and the one place their order and their
// names are written.
//
// THE TABLES ARE A PLANE OF THEIR OWN, and that is the whole reason this file exists. A stage and a
// table are both floor-plane furniture — a stage is `layer: "floor"`, a table is a DesignTable with
// no layer at all — so "work in the floor layer" used to mean both of them at once. That is exactly
// the sentence a designer needs to be able to say and could not: the tables are laid first and then
// finished with, and everything that comes after (stages, bars, rugs, the dance floor) is placed
// OVER them. A rubber-band round three stages standing on top of the tables caught the tables too,
// and the drag that followed moved a plan that was already right.
//
// `Plane` is NOT `Layer` with one more member bolted on, even though it reads like one. `Layer` is
// a PRODUCT's own fact — where in the room the thing goes — and it is persisted on every placement
// row; `Plane` is a question about the SCREEN: what am I looking at, and what may the pointer
// reach. "tables" is a plane and can never be a layer, because no product is ever tagged with it —
// a table is a table because it is a DesignTable, not because a column says so.
export type Plane = "tables" | Layer;

/** The chip row, in the order it is drawn: the tables, then what stands on them, then the floor
 *  around them, then what hangs above. Not the catalog's LAYERS order — this row is read as a
 *  section through the room.
 *
 *  שולחנות is the tables; שולחן is what is laid ON one, which is the catalog's own word for that
 *  layer everywhere else in the app and stays that word here. They are one letter apart, and they
 *  are adjacent for exactly that reason: read as a pair, in this order, the plural/singular does
 *  the work — the tables, then the table. Split across the row they would be two chips a designer
 *  has to stop and tell apart. */
export const PLANES: { id: Plane; label: string }[] = [
  { id: "tables", label: "שולחנות" },
  { id: "table", label: "שולחן" },
  { id: "floor", label: "רצפה" },
  { id: "ceiling", label: "תקרה" },
];

/** Everything visible, nothing singled out — what the studio opens on. */
export const ALL_PLANES_VISIBLE: Record<Plane, boolean> = { tables: true, table: true, floor: true, ceiling: true };
