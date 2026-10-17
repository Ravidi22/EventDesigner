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
import { isMain } from "../self-check";

/** A chair is between 30cm and 1.2m either way — a stool to a lounge chair. */
const CHAIR_MIN_MM = 300;
const CHAIR_MAX_MM = 1200;

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

// ponytail: self-check. Run: npm run check:seating
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const feature = (f: Omit<StructureFeature, "id">): StructureFeature => ({ ...f, id: "s" });

  // A plain block: five rows of five dining chairs, its box the layout's.
  const plain = feature(newSeatingFeature({ x: 1000, y: 2000 }));
  assert(seatingCount(plain) === 25, "a new block is five rows of five");
  const l = seatingLayout(plain);
  assert(plain.widthMm === l.widthMm && plain.depthMm === l.depthMm && plain.shape === "rect", "its footprint is the block's box");
  assert(plain.seating !== undefined && plain.seating.chairWidthMm === undefined && plain.seating.chairStyle === undefined, "a dining chair is the default and is not stored");

  // From the studio's chair: its size and style come across.
  const napoleon = {
    id: "c",
    name: "כיסא נפוליאון",
    category: "chairs",
    layer: "floor",
    dimensions: { widthMm: 400, depthMm: 400, heightMm: 920 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    appearance: { symbolStyle: "chiavari" },
  } as unknown as Product;
  const fromChair = feature(newSeatingFeature({ x: 0, y: 0 }, napoleon));
  assert(fromChair.seating?.chairStyle === "chiavari" && fromChair.seating.chairWidthMm === 400 && fromChair.seating.chairDepthMm === 400, "a block of the studio's chair copies its style and size");
  assert(fromChair.widthMm === 5 * 400 + 4 * 50 && fromChair.heightMm === 920, "…and its box and height follow the chair");

  // Two more rows: the block grows BACKWARD — the front edge (+y, unturned) holds still.
  const front = (f: Pick<StructureFeature, "y" | "depthMm">) => f.y + f.depthMm / 2;
  const grown = { ...plain, ...seatingPatch(plain, { rows: 7 }) };
  assert(seatingCount(grown) === 35 && grown.depthMm > plain.depthMm, "seven rows of five is 35, and deeper");
  assert(Math.abs(front(grown) - front(plain)) <= 1 && grown.x === plain.x, "the front row stays where it stood");

  // Turned to face the other way (180°): its front is now −y on the plan, and still holds still.
  const turned = { ...plain, rotationDeg: 180 };
  const turnedGrown = { ...turned, ...seatingPatch(turned, { rows: 7 }) };
  assert(Math.abs((turnedGrown.y - turnedGrown.depthMm / 2) - (turned.y - turned.depthMm / 2)) <= 1, "a turned block keeps its front row too");

  // A wider chair: the same rows, a wider block; out-of-range sizes are held to a chair's.
  const wider = { ...plain, ...seatingPatch(plain, { chairWidthMm: 550 }) };
  assert(wider.widthMm === 5 * 550 + 4 * 50 && seatingCount(wider) === 25, "a wider chair widens the block, not the count");
  assert(cleanSeating({ rows: 2, perRow: 2, chairWidthMm: 20, chairDepthMm: 9000 }).chairWidthMm === CHAIR_MIN_MM, "a chair is at least 30cm");
  assert(cleanSeating({ rows: 2, perRow: 2, chairDepthMm: 9000 }).chairDepthMm === CHAIR_MAX_MM, "…and at most 1.2m");
  assert(cleanSeating({ rows: 2, perRow: 2, chairStyle: "nonsense" as never }).chairStyle === undefined, "an unknown style reads as the default");

  // A row that lost its spec still draws five rows of five.
  assert(seatingCount({ seating: undefined }) === 25, "no spec is five rows of five");

  console.log("seating: ok");
}
