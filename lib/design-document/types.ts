// ADR-4: the Design Document is a pure data structure that knows nothing about display.
// The 2D canvas, the operational PDF, and the phase-2 3D scene are all renderers of THIS.
// Shared verbatim between client (canvas) and server (packing list, quote) — principle #2.
// DesignTable.style (below) doesn't violate this: it's the designer's colour/dash *choice* for a
// table — design intent, serialisable, renderer-agnostic plain data — not a rendering concern.
// resolveStyle (lib/element-style.ts) is what turns it into pixels, and it lives outside this file.
import type { ElementStyle } from "../element-style";

export type Layer = "table" | "floor" | "ceiling";

export interface Point {
  x: number;
  y: number;
}

// A table on the plan, drawn in the meeting's hall-sketch stage.
export interface DesignTable {
  id: string;
  type: string; // "round" | "rectangle" | "knight" ... (drives smart-apply, F-3.3)
  number: number; // human-facing table number for the placement map
  position: Point;
  rotation: number; // degrees
  diameterMm?: number;
  widthMm?: number;
  depthMm?: number;
  seats?: number;
  style?: ElementStyle; // free-form per-table look (fill/stroke/dash); absent = the renderer's default
}

/** A drape's run along one wall of the venue, as fractions of that wall's length (0 = the wall's
 *  start node, 1 = its end). Fractions rather than millimetres on purpose: the wall belongs to the
 *  property, not to this document, so a wall later redrawn at /halls carries its curtain with it
 *  instead of leaving it hanging in the air. `wallId` may dangle if the wall is deleted — the
 *  renderer draws nothing and the inspector says so, same contract as a zone id. */
export interface WallSpan {
  wallId: string;
  from: number; // 0..1 along the wall
  to: number; // 0..1, always > from
}

// One product-variant placed somewhere. Targets a table (table layer), a wall (a drape), or a free
// point. Which of those it is comes from the product's category (CategoryDef.anchor), never from
// guessing at which fields happen to be set.
export interface Placement {
  id: string;
  variantId: string;
  layer: Layer;
  quantity: number;
  tableId?: string; // set when layer === "table"
  position: Point; // free point for floor/ceiling; offset within table otherwise
  rotation: number;
  scale: number;
  /** Wall-anchored items (curtains). When set, `position` is ignored — the wall places it. */
  span?: WallSpan;
  /** Stretch items sized on the plan rather than in the catalog (a carpet). Overrides the product's
   *  footprint; absent means "the size the catalog gives it". */
  sizeMm?: { widthMm: number; depthMm: number };
}

export interface Calibration {
  /** Maps document units to real millimetres (F-3.4). Copied from the VENUE plan when the event is
   *  opened — scale is a property of the property, so it is measured there, once, and never asked
   *  again per event. A plan drawn with the wall tools is already in millimetres: 1. */
  mmPerUnit: number;
}

// F-5.3: a table the designer explicitly diverged from smart-apply for this variant.
// Recorded when a table-layer placement is removed; a later bulk re-apply skips these.
export interface SmartApplyException {
  tableId: string;
  variantId: string;
}

// The whole document. Stored as JSONB in design_documents.content; the packing list
// and quote are pure aggregations over `placements`.
export interface DesignDocumentContent {
  calibration: Calibration;
  tables: DesignTable[];
  placements: Placement[];
  exceptions?: SmartApplyException[];
}

export function emptyDocument(mmPerUnit = 1): DesignDocumentContent {
  return { calibration: { mmPerUnit }, tables: [], placements: [] };
}
