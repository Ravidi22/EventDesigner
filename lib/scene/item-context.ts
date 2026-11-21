// What every kind's builder is handed, and the one body every kind falls back to. Its own module
// so ./items.ts (the dispatch and the table kinds), ./floor-kinds.ts and ./overhead.ts can all
// import it without importing each other.
import { materialRefOf } from "./materials";
import type { Material } from "@/lib/catalog/material";
import type { CandleSpec } from "@/lib/catalog/candles";
import type { Footprint } from "@/lib/studio/footprint";
import { buildHollow, footprintOutlines } from "@/lib/studio/footprint";
import type { Product, RevolvePoint } from "@/lib/catalog/types";
import type { ChandelierDraw } from "@/lib/catalog/chandelier";
import type { ChuppahDraw } from "@/lib/catalog/chuppah";
import type { Resolved } from "@/lib/studio/catalog-resolver";
import type { ChairStyle, DrawStyle } from "@/lib/catalog/symbols";
import type { FlowerDrawSpec } from "@/lib/catalog/flower-draw";
import type { ChairRows, PlacementClimb } from "@/lib/design-document/types";
import type { BenchLayout } from "@/lib/design-document/bench";
import type { RugShape } from "@/lib/studio/rug-shape";
import type { CarpetShape } from "@/lib/studio/cover";
import type { Pergola } from "@/lib/venues/pergola";
import type { Border } from "@/lib/catalog/border";
import type { ItemBuild } from "./collect";
import { LINE_WALL_MM, elementBody } from "./element-body";
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
  /** The resolved colour: swatch → row fill → the material's tone → the kind's DEFAULT_TONE. */
  tone: string;
  /** What the item is made of — the shade's, else the row's (lib/catalog/material.ts materialOf).
   *  Absent = every recipe's own guess, as before. */
  material?: Material;
  /** A candlestick's candles, guards, arm heights and crystal (lib/catalog/candles.ts). Absent = the
   *  candles it always built. */
  candles?: CandleSpec;
  /** symbolCount: arms, bulbs, candles. */
  count: number;
  chairStyle?: ChairStyle;
  drawStyle?: DrawStyle;
  flowers?: FlowerDrawSpec;
  /** How high above the floor the item's own foot stands — a table's top under what is on it: how
   *  far a flower runner's fall hangs (lib/scene/flowers.ts). Absent = unknown (a table's height). */
  standMm?: number;
  climb?: PlacementClimb & { heightMm: number };
  bench?: BenchLayout;
  author: boolean;
  /** What the instanced parts (flower heads, a chair) are tagged as; absent = the kind's own tag,
   *  labelled with the row's name. */
  tag?: NodeTag;
  /** A block of chairs in rows (Placement.rows): the chair kind lays every chair of the block. */
  rows?: ChairRows;
  /** A rug with curved sides or rounded corners (Placement.bows / corners): the slab, border and
   *  fringe follow them. */
  rug?: RugShape;
  /** A carpet laid to an OUTLINE (Placement.outline — over a surface or a stage, lib/studio/cover.ts):
   *  the slab is that outline extruded with its holes cut, the weave or contour laid along it. Wins
   *  over `rug`. */
  carpet?: CarpetShape;
  /** A rug's or a runner's contour (lib/catalog/border.ts, borderOf — this plan's, else its row's):
   *  its bands laid on top in their colours, its fringe in the fringe's. Absent = the woven band. */
  border?: Border;
  /** A ceiling item: how far above the item's TOP the ceiling is (a chain that long rises from
   *  it); absent = open sky, no chain. */
  chainMm?: number;
  /** A VENUE's pergola (StructureFeature.pergola, lib/venues/pergola.ts): its spec, which a catalog
   *  row says through its post field and drawing style instead. Absent = read off the row. */
  pergola?: Pergola;
  /** A chandelier's tiers and crystal (MapAppearance.chandelier, lib/catalog/chandelier.ts) and its
   *  silhouette (the base's body). Absent = the style's own. */
  chandelier?: ChandelierDraw;
  /** A chuppah's posts, roof and flowers (MapAppearance.chuppah, lib/catalog/chuppah.ts) and its roof's
   *  section (the base's body). Absent = the chuppah it always was. */
  chuppah?: ChuppahDraw;
  /** The first shape's side profile (lib/element/adapter.ts baseProfileOf — fractions of the radius
   *  and the height): what the kind's recipe reads as its own outline (lib/catalog/body-profiles.ts).
   *  Absent = none, and the recipe builds what it always did. */
  profile?: RevolvePoint[];
}

/** The ADR-5 fallback: the item's PARTS, each stood up at its own z and height in its own surface
 *  (lib/element — a row with no heights of its own is its footprint extruded to the row's height,
 *  exactly as before), the row's photo on the body when it has one. What an unknown category, a
 *  `symbol === false` row and "other" get. A footprint the row's element does not describe (a
 *  carpet laid to an outline) is extruded as it always was. */
export function fallbackBody(ctx: ItemContext): ItemBuild {
  const material: MaterialRef = ctx.material ? materialRefOf(ctx.material, ctx.tone) : { colour: ctx.tone, kind: "matte" };
  if (ctx.product?.imageUrl) material.image = { url: ctx.product.imageUrl, fit: "stretch" };
  const element = elementBody(ctx.product, ctx.footprint, material);
  if (element) return element;
  // A shape drawn as lines only stands as a thin wall along its lines: the band of a hollow shape
  // whose closing side is open (buildHollow), so the side never drawn is never built.
  const parts: Part[] = footprintOutlines(ctx.footprint)
    .flatMap((o) => (o.open ? buildHollow(o, { bandMm: LINE_WALL_MM, openSides: [o.outline.length - 1] }) : [o]))
    .map((outline) => ({ shape: "extrude", outline, h: Math.max(10, ctx.heightMm), at: vec3(0, 0, 0) }));
  return { parts, material, instanced: [], emitters: [] };
}
