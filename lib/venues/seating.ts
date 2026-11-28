// The venue's own chairs, set out in rows — a `seating` feature (the user, 2026-10-17: "שורות כיסאות
// is more for the /halls, i want to add it from the add element").
//
// The ceremony seating in front of a חופה is often the VENUE'S: its own chairs, set the same way for
// every wedding. So it is drawn once, at /halls, like the stage it faces — and every event's sketch
// shows it (and may move it or take it out for the evening, as with a bar: featureMovable).
//
// The rows are the sketch's own block (lib/design-document/chair-rows.ts): ONE layout, so a block
// laid at the venue and one rented for an evening put their chairs in the same places. What the
// venue adds is the chair itself — a style and a size, since a venue's chairs are not a catalog row
// (a chair placed from the studio's catalog copies its row's size and style, and nothing points back
// at the row afterwards, as with a bar: newFeatureFromProduct).
//
// Width × depth are DERIVED from the rows and the chair, and written with them by `seatingPatch` —
// so the footprint every reader takes (hit-testing, the sketch's clearance, the printed map, the
// venue's dimensions) is the block's real floor, and the block takes no resize handles: it is
// resized by typing rows. More rows grow it BACKWARD — its front row holds still (chairRowsMove).
import type { Point } from "../studio/hall";
import type { Product } from "../catalog/types";
import { CHAIR_STYLES, chairStyleOf } from "../catalog/symbols";
import { catalogBox } from "../studio/footprint";
import {
  FALLBACK_CHAIR,
  NEW_BLOCK,
  chairRowsCount,
  chairRowsLayout,
  chairRowsMove,
  cleanRows,
  type ChairRowsLayout,
} from "../design-document/chair-rows";
import { FEATURE_KIND_LABEL, type FeatureSeating, type StructureFeature } from "./structure";

/** A chair is between 30cm and 1.2m either way — a stool to a lounge chair. */
export const CHAIR_MIN_MM = 300;
export const CHAIR_MAX_MM = 1200;

/** The block's spec — five rows of five when a hand-edited row lost it. */
export function seatingOf(f: Pick<StructureFeature, "seating">): FeatureSeating {
  return f.seating ?? NEW_BLOCK;
}

/** One chair's box. */
export function seatingChair(s: FeatureSeating): { widthMm: number; depthMm: number } {
  return { widthMm: s.chairWidthMm ?? FALLBACK_CHAIR.widthMm, depthMm: s.chairDepthMm ?? FALLBACK_CHAIR.depthMm };
}

/** Where every chair stands, in the feature's own frame (front = +y), and the block's box. */
export function seatingLayout(f: Pick<StructureFeature, "seating">): ChairRowsLayout {
  const s = seatingOf(f);
  return chairRowsLayout(s, seatingChair(s));
}

export function seatingCount(f: Pick<StructureFeature, "seating">): number {
  return chairRowsCount(seatingOf(f));
}

/** What is stored: the rows cleaned (lib/design-document/chair-rows.ts), a known style, a chair
 *  size in range and whole — and the defaults left out. */
export function cleanSeating(s: FeatureSeating): FeatureSeating {
  const out: FeatureSeating = cleanRows(s);
  if (s.chairStyle && s.chairStyle !== "dining" && CHAIR_STYLES.includes(s.chairStyle)) out.chairStyle = s.chairStyle;
  const size = (mm: number | undefined, fallback: number) => {
    if (mm === undefined || !Number.isFinite(mm)) return undefined;
    const v = Math.round(Math.min(CHAIR_MAX_MM, Math.max(CHAIR_MIN_MM, mm)));
    return v === fallback ? undefined : v;
  };
  const w = size(s.chairWidthMm, FALLBACK_CHAIR.widthMm);
  const d = size(s.chairDepthMm, FALLBACK_CHAIR.depthMm);
  if (w !== undefined) out.chairWidthMm = w;
  if (d !== undefined) out.chairDepthMm = d;
  return out;
}

/** The edit that changes a block: its spec, the box it comes to, and the centre that keeps its FRONT
 *  row where it stood (more rows go out the back, the middle line stays put). One updateFeature patch. */
export function seatingPatch(
  f: Pick<StructureFeature, "seating" | "x" | "y" | "rotationDeg">,
  change: Partial<FeatureSeating>,
): Pick<StructureFeature, "seating" | "widthMm" | "depthMm" | "x" | "y"> {
  const seating = cleanSeating({ ...seatingOf(f), ...change });
  const before = seatingLayout(f);
  const after = chairRowsLayout(seating, seatingChair(seating));
  const at = chairRowsMove({ x: f.x, y: f.y }, f.rotationDeg ?? 0, before, after);
  return { seating, widthMm: Math.round(after.widthMm), depthMm: Math.round(after.depthMm), x: at.x, y: at.y };
}

/** A new block at `at`: five rows of five of `chair` — the studio's chair, its size and style copied
 *  across — or of a dining chair when the catalog has none. */
export function newSeatingFeature(at: Point, chair?: Product): Omit<StructureFeature, "id"> {
  const box = chair ? catalogBox(chair) : FALLBACK_CHAIR;
  const seating = cleanSeating({ ...NEW_BLOCK, chairStyle: chairStyleOf(chair), chairWidthMm: box.widthMm, chairDepthMm: box.depthMm });
  const l = chairRowsLayout(seating, seatingChair(seating));
  return {
    kind: "seating",
    label: FEATURE_KIND_LABEL.seating,
    x: Math.round(at.x),
    y: Math.round(at.y),
    rotationDeg: 0,
    widthMm: Math.round(l.widthMm),
    depthMm: Math.round(l.depthMm),
    heightMm: chair?.dimensions.heightMm || 900,
    shape: "rect",
    seating,
  };
}
