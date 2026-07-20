// ADR-4: the Design Document is a pure data structure that knows nothing about display.
// The 2D canvas, the operational PDF, and the phase-2 3D scene are all renderers of THIS.
// Shared verbatim between client (canvas) and server (packing list, quote) — principle #2.

export type Layer = "table" | "floor" | "ceiling";

export interface Point {
  x: number;
  y: number;
}

// A table on the plan (from a hall template or PDF import).
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
}

// One product-variant placed somewhere. Targets a table (table layer) or a free point.
export interface Placement {
  id: string;
  variantId: string;
  layer: Layer;
  quantity: number;
  tableId?: string; // set when layer === "table"
  position: Point; // free point for floor/ceiling; offset within table otherwise
  rotation: number;
  scale: number;
}

export interface Calibration {
  mmPerUnit: number; // maps document units to real millimetres (F-3.4)
}

// The event's iPlan sketch, manually aligned over the hall shell (F-3.2). Position/size in
// document units. ponytail: fileName only for now — real PDF pixels arrive with file storage.
export interface SketchRef {
  fileName: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
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
  sketch?: SketchRef;
  tables: DesignTable[];
  placements: Placement[];
  exceptions?: SmartApplyException[];
}

export function emptyDocument(mmPerUnit = 1): DesignDocumentContent {
  return { calibration: { mmPerUnit }, tables: [], placements: [] };
}
