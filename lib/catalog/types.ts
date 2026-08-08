// UI-facing catalog types. This is the seam: today it feeds a seed array, later the
// same shapes come from mapping Drizzle rows (lib/db/schema.ts) — swap happens here only.
import type { Layer, Point } from "../design-document/types";
import type { EdgeCurve } from "../studio/hall";
import type { ElementStyle } from "../element-style";

export type { Layer };

// Map appearance (studio 2D plan). Footprint is always drawn at true scale; `content`
// is what appears inside it. rect/circle/ellipse read from `dimensions` (single source
// of truth) — only "custom" stores its own outline. Outline coordinates are in mm and
// are rendered centered on their bounding box (no pre-centering required).
export interface MapAppearance {
  shape: "rect" | "circle" | "ellipse" | "custom";
  outline?: Point[]; // required iff shape === "custom"
  edgeCurves?: (EdgeCurve | null)[]; // per-edge bezier bow, aligned to outline; null/absent = straight edge (see hall.ts)
  content: "icon" | "name" | "none";
  icon?: string; // Lucide name, iff content === "icon"
  style?: ElementStyle; // free-form footprint look (fill/stroke/dash); absent = the renderer's default
}

// A shade of a product — "זהב", "בורדו". This IS the colour list: a designer who stocks a drape in
// four colours adds four variants, and a placement's `variantId` already records which one is on the
// plan. `swatch` is what makes that colour real rather than a word — the picker shows it, the plan
// draws the item in it. Absent = a version that isn't a colour (a size, a finish), which still reads
// fine everywhere as a name.
export interface Variant {
  id: string;
  name: string; // shade / version, e.g. "זהב"
  swatch?: string; // CSS colour (hex) — the actual shade, for the picker and the plan
  imageUrl?: string;
  unitPrice?: number; // inherits the product price when undefined (F-4.2)
  archived?: boolean; // F-4.5: a placed variant is archived, never deleted
}

/** What a price is per. A drape bought by the running metre and stretched across a 14m wall is not
 *  one unit of anything — the quote multiplies by what was actually drawn (lib/outputs/quote.ts).
 *  Absent = "unit", which is every ordinary countable product. */
export type PriceUnit = "unit" | "m" | "m2";

export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  unit: "ליחידה",
  m: "למטר",
  m2: 'למ"ר',
};

// A stretch product (a drape, a carpet — see CategoryDef.sizing) has no width or depth here: it is
// cut or laid to whatever it has to cover, so its size is a property of the PLACEMENT, not of the
// catalog entry. Height still matters — a 2.8m drape and a 4m drape are different stock.
export interface Dimensions {
  diameterMm?: number;
  widthMm?: number;
  depthMm?: number;
  heightMm: number; // required — needed for phase-2 3D (R-3)
}

export interface Product {
  id: string;
  name: string;
  imageUrl?: string;
  category: string; // CategoryDef id
  layer: Layer;
  dimensions: Dimensions;
  // F-4.3: structured fields exist ONLY where they multiply quantities (arms, seats);
  // every other trait goes in the free-text spec.
  categoryFields: Record<string, string | number>;
  spec?: string; // free specification text ("6 מודולים, 2 מדרגות")
  unitPrice?: number; // feeds the quote (F-4.6); never shown in operational output
  priceUnit?: PriceUnit; // what unitPrice is per; absent = "unit"
  styleTags: string[];
  variants: Variant[];
  appearance?: MapAppearance; // absent → derived from dimensions (see resolveFootprint)
  archived?: boolean; // F-4.5: hidden from the catalog but still resolvable by placements
}
