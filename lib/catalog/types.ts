// UI-facing catalog types. This is the seam: today it feeds a seed array, later the
// same shapes come from mapping Drizzle rows (lib/db/schema.ts) — swap happens here only.
import type { Layer } from "../design-document/types";

export type { Layer };

export interface Variant {
  id: string;
  name: string; // shade / version, e.g. "זהב"
  imageUrl?: string;
  unitPrice?: number; // inherits the product price when undefined (F-4.2)
  archived?: boolean; // F-4.5: a placed variant is archived, never deleted
}

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
  styleTags: string[];
  variants: Variant[];
  archived?: boolean; // F-4.5: hidden from the catalog but still resolvable by placements
}
