// Resolve a placement's variantId back to its catalog product/variant, and derive the
// footprint used by the geometry check. Placements reference variants (F-4.2); a product
// with no variants places an implicit default keyed by the product id.
// The index includes ARCHIVED products/variants on purpose (F-4.5) — a design document
// must always resolve, even when the item is hidden from the catalog.
import type { Product, Variant } from "@/lib/catalog/types";
import type { ChairRows, DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { loadProducts, catalogVersion } from "@/lib/catalog/storage";
import { CATEGORY_BY_ID, anchorOf, type Sizing } from "@/lib/catalog/categories";
import type { Anchor } from "@/lib/catalog/categories";
import { variantPrice } from "@/lib/catalog/format";
import { shadeVariant } from "@/lib/catalog/shades";
import { tableAreaMm2 } from "./geometry";
import { catalogBox, sizedFootprint } from "./footprint";
import { deckTypeOf, type DeckLookup } from "@/lib/design-document/stage";
import type { BenchLookup } from "@/lib/design-document/bench";
import { isRailed } from "./rail";
import { AISLE_CATEGORY, AISLE_PIECE_FIELD, aisleLayout, aisleRowBox, aisleSpecOf, canBeAislePiece, mergedAisle, type AisleLayout, type AislePlacement, type AisleSpec } from "@/lib/catalog/aisle";

export interface Resolved {
  product: Product;
  variant?: Variant;
  label: string;
  category: string;
  price?: number;
  footprintMm2: number; // 0 for items that don't consume table area (e.g. tablecloths)
  /** How this item behaves on the plan — lifted off its category so the canvas can ask one
   *  question of one object instead of walking product → category itself at every node. */
  anchor: Anchor;
  sizing: Sizing;
  /** The shade's actual colour, when the designer gave it one (F-4.2). */
  swatch?: string;
  /** WHAT KIND OF SOLID THING this is, for the studio's no-overlap rule (lib/studio/collide.ts) —
   *  or undefined for anything that rule must not touch. Lifted off the category for the same
   *  reason `anchor` and `sizing` are: the canvas asks one question of one object. */
  solid?: string;
}

/** The key every TABLE on the plan is solid under (canvas-stage boxes each DesignTable with it). */
export const TABLE_SOLID = "table";

/** The categories whose key has to match another name for the same thing: the two that match a
 *  venue FeatureKind, so that the house staging and a hired deck are the same kind of thing as far
 *  as the floor is concerned, and a table row, which matches the key the plan's tables are boxed
 *  under — a table carried off the rail as "tables" was pushed off no table it was let go on. Every
 *  other category is its own key, under its own name. */
const SOLID_BY_CATEGORY: Record<string, string> = { stages: "stage", "stage-decks": "stage", bars: "bar", tables: TABLE_SOLID };

/**
 * Which things cannot share the same floor as this one.
 *
 * Three exemptions, and each is a real arrangement the plan has to keep being able to draw: a RUG
 * is laid under things (sizing "stretch"), anything anchored to a table or hanging from the ceiling
 * is not standing on the floor at all, and a drape belongs to a wall. Everything else that stands
 * on the floor is solid against others OF ITS OWN KIND — deck against deck, bar against bar — and
 * free to overlap anything else, which is what keeps a חופה on a stage and a plinth beside a table
 * possible. See lib/studio/collide.ts for why the rule is same-kind-only.
 */
export function solidKind(product: Product): string | undefined {
  const cat = CATEGORY_BY_ID[product.category];
  if (product.layer !== "floor") return undefined;
  if (anchorOf(product) !== "free" || cat?.sizing === "stretch") return undefined;
  return SOLID_BY_CATEGORY[product.category] ?? product.category;
}

/** A stage's decks, as the fill sees them, out of the primed catalog (lib/design-document/stage.ts). */
export const deckOf: DeckLookup = (variantId) => {
  const r = resolve(variantId);
  return r ? deckTypeOf(variantId, r.product) : undefined;
};

/** Which placements are STANDALONE banquettes (lib/design-document/bench.ts): a `stage-benches` row
 *  standing free — not a stage, not perched on one, not on a table — and the box it is drawn at, the
 *  size it was stretched to or the catalog's. The one definition every surface reads (the canvas,
 *  the printed map, the seating readout, the packing list), so none can disagree about what is one. */
export const benchOf: BenchLookup = (p) => {
  if (p.stage || p.perch || p.tableId) return null;
  const r = resolve(p.variantId);
  if (!r || r.product.category !== "stage-benches") return null;
  // …and the shape it is drawn as, so a crescent or a ח banquette is laid along its band
  // (benchLayoutFor) rather than across its box.
  return { ...(p.sizeMm ?? catalogBox(r.product)), footprint: sizedFootprint(r.product, p.sizeMm) };
};

/** Which placements are BLOCKS OF CHAIRS IN ROWS (Placement.rows, lib/design-document/chair-rows.ts):
 *  a `chairs` row standing on the floor — not on a table, a stage or a banquette — with rows set. And
 *  the chair it is made of and that chair's own box, which every chair in it is laid at. The one
 *  definition the footprint, the canvas, the printed map and the bar all read. */
export function chairBlockOf(p: Placement): { spec: ChairRows; product: Product; chair: { widthMm: number; depthMm: number } } | null {
  if (!p.rows || p.stage || p.perch || p.tableId || isRailed(p)) return null;
  const r = resolve(p.variantId);
  if (!r || r.product.category !== "chairs") return null;
  return { spec: p.rows, product: r.product, chair: catalogBox(r.product) };
}

/** AN AISLE as every surface reads it (lib/catalog/aisle.ts): its row, the spec in force (the row's
 *  under the placement's own), the PIECE that lines it — resolved, or absent when none is chosen or the
 *  one named is gone — the box it is laid in, and the layout. `pieces` are the lining as PLACEMENTS of
 *  the piece's own row in the aisle's frame: what the plan draws and the room builds each spot with. */
export interface AisleView {
  product: Product;
  spec: AisleSpec;
  pieceId?: string;
  piece?: Resolved;
  box: { widthMm: number; depthMm: number };
  layout: AisleLayout;
  pieces: Placement[];
}

/** An `aisles` row as an aisle: at `size` (a placement's stretch) or its own, with `own` (a
 *  placement's answers) over the row's. Null for any other row. */
export function aisleViewOf(product: Product | undefined, size?: { widthMm: number; depthMm: number }, own?: AislePlacement, idPrefix = "aisle"): AisleView | null {
  if (!product || product.category !== AISLE_CATEGORY) return null;
  const spec = mergedAisle(aisleSpecOf(product), own);
  const named = own?.piece ?? product.categoryFields[AISLE_PIECE_FIELD];
  const found = typeof named === "string" && named ? resolve(named) : undefined;
  const piece = found && canBeAislePiece(found.product) ? found : undefined;
  const box = size ?? aisleRowBox(product);
  const layout = aisleLayout(box, piece ? catalogBox(piece.product) : null, spec);
  const pieceId = piece ? (named as string) : undefined;
  const pieces: Placement[] = pieceId
    ? layout.spots.map((s, i) => ({ id: `${idPrefix}~${i}`, variantId: pieceId, layer: "floor" as const, quantity: 1, position: { x: s.x, y: s.y }, rotation: s.rotation, scale: 1 }))
    : [];
  return { product, spec, pieceId, piece, box, layout, pieces };
}

// One view per placement object while the catalog stands still — a pan redraws no aisle.
const aisleViews = new WeakMap<Placement, { version: number; view: AisleView | null }>();

/** Which placements are AISLES (an `aisles` row standing on the floor), and each one's view. The one
 *  definition the canvas, the print, the room, the bar and the counts all read. */
export function aisleOf(p: Placement): AisleView | null {
  if (p.stage || p.perch || p.tableId || p.rows || isRailed(p)) return null;
  // A draft resolving over the catalog (withResolved) is never cached: it was never saved.
  const hit = overlay ? undefined : aisleViews.get(p);
  if (hit && hit.version === catalogVersion) return hit.view;
  const product = resolve(p.variantId)?.product;
  const view = product?.category === AISLE_CATEGORY ? aisleViewOf(product, p.sizeMm, p.aisle, p.id) : null;
  if (!overlay) aisleViews.set(p, { version: catalogVersion, view });
  return view;
}

/** What an aisle BRINGS beside itself, for the counts (MeasureContext.aisleOf): N of its piece — and,
 *  when that piece stands in a vessel, N of the vessel. */
export function aisleBrings(p: Placement, vesselOf?: (piece: Placement) => string | undefined): { variantId: string; count: number }[] | undefined {
  const view = aisleOf(p);
  if (!view?.pieceId || view.pieces.length === 0) return undefined;
  const out = [{ variantId: view.pieceId, count: view.pieces.length }];
  const vessel = vesselOf?.(view.pieces[0]);
  if (vessel) out.push({ variantId: vessel, count: view.pieces.length });
  return out;
}

// The open event's shades (EventSummary.shades), primed by the studio when its event resolves —
// the same synchronous-cache shape as the catalog above, and for the same reason: a drop decides
// its variant mid-gesture and cannot wait on a read. Client-only in practice: nothing on the server
// primes it, so there it is always empty and changes nothing.
let eventShades: readonly string[] = [];

/** The studio's open event changed: its palette is what every default below prefers now. */
export function primeEventShades(shades: readonly string[] | undefined): void {
  eventShades = shades ?? [];
}

/** The shade an item lands in when nobody picked one: the first of the open event's shades it
 *  stocks (lib/catalog/shades.ts), else its first variant, as it always was. */
export function defaultVariantId(product: Product): string {
  return shadeVariant(product.variants, eventShades)?.id ?? product.variants[0]?.id ?? product.id;
}

/** A product's first variant, whatever the open event's shades — the STRUCTURAL id a stage stores
 *  and is looked up by: a deck it may be built from, the studio's stairs/skirt/banquette rows, a
 *  surface. defaultVariantId is for what the designer DROPS; here a shade-matched pick would make a
 *  deck product that stocks a variant named like an event shade a different id per event, so a
 *  stage's stored `surfaceVariant` matched no option and its chosen decks read as gone. */
export function firstVariantId(product: Product): string {
  return product.variants[0]?.id ?? product.id;
}

function footprint(product: Product): number {
  // Tablecloths cover the table rather than sit on it — they don't consume area (F-5.4).
  if (product.category === "tablecloths") return 0;
  const d = product.dimensions;
  if (d.diameterMm) return Math.PI * (d.diameterMm / 2) ** 2;
  if (d.widthMm && d.depthMm) return d.widthMm * d.depthMm;
  return 0;
}

// Rebuilt lazily whenever the catalog changes (storage bumps catalogVersion on write).
let index = new Map<string, Resolved>();
let builtVersion = -1;

/** A product's entries in the index: its own id (the implicit default), then every variant. */
function entriesOf(product: Product): [string, Resolved][] {
  const cat = CATEGORY_BY_ID[product.category];
  const base = {
    product,
    category: product.category,
    footprintMm2: footprint(product),
    anchor: anchorOf(product), // a runner is an item on the table, not its cloth (isRunner)
    sizing: cat?.sizing ?? ("fixed" as Sizing),
    solid: solidKind(product),
  };
  return [
    [product.id, { ...base, label: product.name, price: product.unitPrice }],
    ...product.variants.map((variant): [string, Resolved] => [
      variant.id,
      {
        ...base,
        variant,
        label: `${product.name} · ${variant.name}`,
        price: variantPrice(product, variant),
        swatch: variant.swatch,
      },
    ]),
  ];
}

function ensureIndex(): Map<string, Resolved> {
  if (builtVersion === catalogVersion && index.size > 0) return index;
  index = new Map();
  for (const product of loadProducts()) for (const [id, r] of entriesOf(product)) index.set(id, r);
  builtVersion = catalogVersion;
  return index;
}

// Rows resolving OVER the catalog for the span of one synchronous call (withResolved): a draft the
// shape editor is previewing in 3D before it is saved. Never written into the cache — priming it
// would bump catalogVersion and empty every canvas cache keyed on it, for a row nobody has saved.
let overlay: Map<string, Resolved> | null = null;

/** `fn` with `products` resolving as if they were in the catalog, over the real rows (a draft of a
 *  saved row wins over the saved row). Synchronous on purpose: the overlay is lifted before this
 *  returns, so nothing rendered later can see a row that was never saved. */
export function withResolved<T>(products: readonly Product[], fn: () => T): T {
  const prev = overlay;
  const next = new Map(prev ?? []);
  for (const product of products) for (const [id, r] of entriesOf(product)) next.set(id, r);
  overlay = next;
  try {
    return fn();
  } finally {
    overlay = prev;
  }
}

export function resolve(variantId: string): Resolved | undefined {
  return overlay?.get(variantId) ?? ensureIndex().get(variantId);
}

/** The cover a table is wearing — one per table by definition, since a cover IS the table's
 *  surface (CategoryDef.anchor === "table"). */
export function coverOn(doc: DesignDocumentContent, tableId: string): Placement | undefined {
  return doc.placements.find(
    (p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor === "table",
  );
}

/** Every shade of the product this variant belongs to — what a colour picker offers, and what a
 *  bulk re-colour has to replace on the tables it reaches. */
export function shadesOf(variantId: string): { id: string; name: string; swatch?: string }[] {
  const product = resolve(variantId)?.product;
  if (!product) return [];
  return product.variants.filter((v) => !v.archived).map((v) => ({ id: v.id, name: v.name, swatch: v.swatch }));
}

// Fraction of a table's area consumed by the items placed on it (F-5.4: table-area only —
// no passage checks in phase 1). >1 means overflow.
export function tableUtilization(doc: DesignDocumentContent, table: DesignTable): number {
  const area = tableAreaMm2(table);
  if (area === 0) return 0;
  let used = 0;
  for (const p of doc.placements) {
    if (p.layer !== "table" || p.tableId !== table.id) continue;
    used += (resolve(p.variantId)?.footprintMm2 ?? 0) * p.quantity;
  }
  return used / area;
}
