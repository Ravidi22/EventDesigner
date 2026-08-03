// Static hall shell (F-3.1): the fixed physical shell — walls/outline, entrances, ceiling
// height, columns, and near-fixed elements (stage, bars). Editable tables live in the
// DesignDocument, not here. Document units are millimetres (calibration mmPerUnit = 1).
// Seed for now — later this comes from a HallTemplate (docs §4).
import type { ElementStyle } from "@/lib/element-style";

export interface Point {
  x: number;
  y: number;
}

export interface Column {
  x: number;
  y: number;
  rMm: number;
}

// A door cut into a specific wall — position is a distance along that wall's chord (from its
// start vertex), not a free point, so the door slides with the wall instead of floating loose
// when the outline is reshaped. wallIndex is the outline edge index (see EdgeCurve below).
export interface Entrance {
  id: string;
  wallIndex: number;
  distanceMm: number; // from outline[wallIndex] along the wall's chord
  widthMm: number;
  swingInward: boolean; // which side of the wall the door leaf opens toward
  doubleDoor: boolean; // two leaves splitting the opening, meeting in the middle — the common case
}

export type FixtureShape = "rect" | "circle" | "ellipse";

// A near-fixed element the designer chose to keep on the shell (במה, בר). For "circle", widthMm
// is the diameter and depthMm is ignored; for "ellipse" widthMm/depthMm are the two axes.
export interface Fixture {
  id: string;
  label: string;
  x: number; // center
  y: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  shape: FixtureShape;
  rotationDeg: number;
  style?: ElementStyle; // free-form per-fixture look (fill/stroke/dash); absent = the renderer's default
}

// A wall segment's curve, aligned by index to the outline edge it bows (edge i runs from
// outline[i] to outline[(i+1) % outline.length]). Control points are stored as offsets from
// their own edge's endpoint (c1 from the start vertex, c2 from the end vertex) — not absolute
// coordinates — so dragging a vertex carries its adjacent curves along instead of leaving them
// anchored to the vertex's old position.
export interface EdgeCurve {
  c1: Point;
  c2: Point;
}

export interface Hall {
  widthMm: number; // bounding box; also used by renderers that still assume a rectangle
  heightMm: number; // bounding box
  outline?: Point[]; // true room polygon in mm; absent (old saved halls) falls back to the width×height rectangle
  edgeCurves?: (EdgeCurve | null)[]; // per-edge bezier bow, aligned to outline; null/absent = straight wall
  ceilingHeightMm: number;
  columns: Column[];
  entrances: Entrance[];
  stage?: Fixture;
  bars: Fixture[];
}

export const SAMPLE_HALL: Hall = {
  widthMm: 20000,
  heightMm: 13000,
  outline: [
    { x: 0, y: 0 },
    { x: 20000, y: 0 },
    { x: 20000, y: 13000 },
    { x: 0, y: 13000 },
  ],
  ceilingHeightMm: 4500,
  columns: [
    { x: 6500, y: 6500, rMm: 350 },
    { x: 13500, y: 6500, rMm: 350 },
  ],
  entrances: [{ id: "ent-1", wallIndex: 2, distanceMm: 10000, widthMm: 1800, swingInward: true, doubleDoor: true }],
  bars: [],
};
