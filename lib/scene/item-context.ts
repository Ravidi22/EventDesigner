// What every kind's builder is handed, and the one body every kind falls back to. Its own module
// so ./items.ts (the dispatch and the table kinds), ./floor-kinds.ts and ./overhead.ts can all
// import it without importing each other.
import type { Footprint } from "@/lib/studio/footprint";
import { footprintOutlines } from "@/lib/studio/footprint";
import type { Product } from "@/lib/catalog/types";
import type { Resolved } from "@/lib/studio/catalog-resolver";
import type { CandleStyle, ChairStyle, ChuppahStyle } from "@/lib/catalog/symbols";
import type { FlowerDrawSpec } from "@/lib/catalog/flower-draw";
import type { ChairRows, PlacementClimb } from "@/lib/design-document/types";
import type { BenchLayout } from "@/lib/design-document/bench";
import type { RugBows } from "@/lib/studio/rug-shape";
import type { ItemBuild } from "./collect";
import { type MaterialRef, type NodeTag, type Part, vec3 } from "./types";

/** Everything a kind's builder may need, resolved by the caller once per item. Sizes are the
 *  item's own (its footprint's box and the row's height) — the placement's drawing scale is in
 *  its transform, never here. */
export interface ItemContext {
  product: Product | undefined;
  resolved: Resolved | undefined;
  /** In the item's own frame, centred. */
  footprint: Footprint;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** The resolved colour: swatch → row fill → the kind's DEFAULT_TONE. */
  tone: string;
  /** symbolCount: arms, bulbs, candles. */
  count: number;
  chairStyle?: ChairStyle;
  drawStyle?: CandleStyle | ChuppahStyle;
  flowers?: FlowerDrawSpec;
  climb?: PlacementClimb & { heightMm: number };
  bench?: BenchLayout;
  author: boolean;
  /** What the instanced parts (flower heads, a chair) are tagged as; absent = the kind's own tag,
   *  labelled with the row's name. */
  tag?: NodeTag;
  /** A block of chairs in rows (Placement.rows): the chair kind lays every chair of the block. */
  rows?: ChairRows;
  /** A rug with curved sides (Placement.bows): the slab, border and fringe follow them. */
  bows?: RugBows;
  /** A ceiling item: how far above the item's TOP the ceiling is (a chain that long rises from
   *  it); absent = open sky, no chain. */
  chainMm?: number;
}

/** The ADR-5 fallback: the footprint extruded to the item's height, the row's photo on it when it
 *  has one. What an unknown category, a `symbol === false` row and "other" get. */
export function fallbackBody(ctx: ItemContext): ItemBuild {
  const material: MaterialRef = { colour: ctx.tone, kind: "matte" };
  if (ctx.product?.imageUrl) material.image = { url: ctx.product.imageUrl, fit: "stretch" };
  const parts: Part[] = footprintOutlines(ctx.footprint).map((outline) => ({ shape: "extrude", outline, h: Math.max(10, ctx.heightMm), at: vec3(0, 0, 0) }));
  return { parts, material, instanced: [], emitters: [] };
}
