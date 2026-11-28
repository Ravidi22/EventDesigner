// A CATALOG ITEM IN A VENUE (2026-11-19, the user: "add option to add all the things from my
// catalog, but make it separate somehow"): the venue's own chandelier, sofa, tree or fountain, put on
// its plan from the studio's catalog and drawn as ITSELF — its category's picture in its shade on
// /halls, the sketch and the printed map, its own body in the 3D room.
//
// A COPY, never a link. Every business may open every venue (lib/venues/access.ts), and a row id
// means nothing in another studio's catalog — so the feature carries what its drawing needs
// (`FeatureItem`: category, layer, measurements, appearance, the drawing's few category fields, the
// flower spec, one shade) and NOTHING the catalog keeps for money or stock: no price, cost, supplier,
// stock count or photo. The venue's plan outlives any edit to the row, as a bar or a stage copied
// from the catalog does (structure.ts newFeatureFromProduct). It is the venue's: never quoted,
// counted, packed or ordered in an event.
//
// The feature's box is its footprint's, so it is selected, moved, turned and resized as any feature;
// `itemProductOf` turns the copy back into a Product at the size the box now has, for the shared
// drawing (components/placed-piece.tsx) and the 3D builder (lib/scene/build.ts, through
// withResolved). Pure. `npm run check:venue-item`.
import type { FlowerLine, MapAppearance, Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, anchorOf } from "@/lib/catalog/categories";

export interface FeatureItem {
  category: string;
  layer: Product["layer"];
  /** The row's measurements when it was copied. */
  dimensions: Product["dimensions"];
  /** The feature's box when it was copied — what a resize is measured against. */
  boxMm: { w: number; h: number };
  appearance?: MapAppearance;
  /** Only what the drawing and the room read (VENUE_ITEM_FIELDS). */
  categoryFields?: Record<string, string | number>;
  flowers?: FlowerLine[];
  /** The shade it was put down in. */
  shade?: { name: string; swatch?: string };
}

/** The category fields a picture reads: candles and arms, a hang height, an arrangement's stems, a
 *  pergola's post. Everything else on a row (a vessel's id, an aisle's piece — ids in a catalog the
 *  venue's next reader does not have) stays behind. */
export const VENUE_ITEM_FIELDS = ["arms", "hangHeightMm", "stems", "postMm"] as const;

/** Departments the build tab already places as the venue's own BUILT things (a bar, a stage, a
 *  pergola — add-tools.ts CATALOG_BACKED), and rows that are not a thing of their own. */
const BUILT_GROUPS = new Set(["grp-bars", "grp-stages"]);
// An LED screen too: the build tab places the venue's own (kind "screen").
const NOT_ITEMS = new Set(["tables", "chairs", "pergolas", "aisles", "composites", "led-screens"]);

/** Whether the catalog tab offers a row: anything with a place of its own on the floor or overhead.
 *  Not what sits ON a table (a venue has no table to put it on), not what rides a wall or a rail (a
 *  curtain, a rod, an LED strip, a sail — the build tab has the venue's own), not a table or a chair
 *  (the sketch's seating), not a composite or an aisle (several things, named in a catalog the reader
 *  may not have), not a bar, a stage or a pergola (the build tab places those as built). */
export function venueItemOffered(product: Product): boolean {
  if (product.archived || product.composition) return false;
  if (product.layer === "table") return false;
  const cat = CATEGORY_BY_ID[product.category];
  if (!cat || BUILT_GROUPS.has(cat.group) || NOT_ITEMS.has(product.category)) return false;
  const anchor = anchorOf(product);
  return anchor !== "wall" && anchor !== "table";
}

/** The copy a feature keeps of a row, in shade `variantId` (absent = its first live one). */
export function itemSnapshot(product: Product, box: { w: number; h: number }, variantId?: string): FeatureItem {
  const live = product.variants.filter((v) => !v.archived);
  const shade = live.find((v) => v.id === variantId) ?? live[0];
  const fields: Record<string, string | number> = {};
  for (const k of VENUE_ITEM_FIELDS) {
    const v = product.categoryFields?.[k];
    if (v !== undefined && v !== "") fields[k] = v;
  }
  return {
    category: product.category,
    layer: product.layer,
    dimensions: { ...product.dimensions },
    boxMm: { w: Math.max(1, Math.round(box.w)), h: Math.max(1, Math.round(box.h)) },
    ...(product.appearance ? { appearance: structuredClone(product.appearance) } : {}),
    ...(Object.keys(fields).length ? { categoryFields: fields } : {}),
    ...(product.flowers?.length ? { flowers: product.flowers.map((l) => ({ ...l })) } : {}),
    ...(shade ? { shade: { name: shade.name, ...(shade.swatch ? { swatch: shade.swatch } : {}) } } : {}),
  };
}

/** The id a feature's copy resolves under (the 3D builder's overlay, a placement's variant). */
export const itemProductId = (featureId: string) => `venue-item:${featureId}`;

/** The copy as a Product, at the size the feature's box has now: a 90 chandelier resized to 120 is
 *  drawn and built at 120. Variantless when the copy has no shade (resolved under its own id). */
export function itemProductOf(f: { id: string; label: string; widthMm: number; depthMm: number; heightMm?: number; item?: FeatureItem }): Product | null {
  const it = f.item;
  if (!it) return null;
  const sx = it.boxMm.w > 0 ? f.widthMm / it.boxMm.w : 1;
  const sy = it.boxMm.h > 0 ? f.depthMm / it.boxMm.h : 1;
  const d = it.dimensions;
  const near1 = (v: number) => Math.abs(v - 1) < 1e-6;
  // Its height is the feature's own (the bar's "גובה"), else the row's.
  const h = f.heightMm && f.heightMm > 0 ? { heightMm: f.heightMm } : {};
  const dimensions = near1(sx) && near1(sy)
    ? { ...d, ...h }
    : {
        ...d,
        ...(d.widthMm ? { widthMm: Math.round(d.widthMm * sx) } : {}),
        ...(d.depthMm ? { depthMm: Math.round(d.depthMm * sy) } : {}),
        ...(d.diameterMm ? { diameterMm: Math.round(d.diameterMm * sx) } : {}),
        ...h,
      };
  const id = itemProductId(f.id);
  return {
    id,
    name: f.label,
    category: it.category,
    layer: it.layer,
    dimensions,
    categoryFields: { ...(it.categoryFields ?? {}) },
    styleTags: [],
    variants: it.shade ? [{ id: `${id}:shade`, name: it.shade.name, ...(it.shade.swatch ? { swatch: it.shade.swatch } : {}) }] : [],
    ...(it.appearance ? { appearance: it.appearance } : {}),
    ...(it.flowers ? { flowers: it.flowers } : {}),
  };
}

/** The variant a placement of the copy names: its shade, else the product itself. */
export function itemVariantId(product: Product): string {
  return product.variants[0]?.id ?? product.id;
}
