// A TABLE GARDEN — "גינת ירק" (bug round 2026-11-21 §7.2; Ravid: "a type of flowers that takes the
// table's shape but smaller, customisable sizes, filled with flowers at some default height"). A
// flowers row with `arrangement.bed` set: set on a table, its outline is DERIVED from the table every
// time it is drawn (like a runner's trim), so a table resized or swapped carries its bed with it.
//   - a long table: a band down its middle, as long as the table less 30 cm at each end, as wide as
//     the table less 40 cm each side for the place settings (never under 20 cm) — or the typed width;
//   - a round one: a disc 40 cm inside the rim (DECIDE 6).
// Its flowers are the row's mix covering that outline (lib/catalog/flower-cover.ts). Billed by the
// row's unit — by the metre, the bed's length (DECIDE 12: its flower lines are per metre of bed).

/** Room left at each side for the place settings. */
export const BED_SETTING_MM = 400;
/** …and at each end of a long table. */
export const BED_END_MM = 300;
/** The narrowest a bed is drawn. */
export const BED_MIN_MM = 200;
/** A bed's default height (the row's own height wins when it has one). */
export const BED_HEIGHT_MM = 250;

export interface BedSpec {
  widthMm?: number;
}

/** The row says it is a bed: `arrangement.bed` set. */
export function bedOf(appearance: { arrangement?: { bed?: BedSpec | boolean } } | undefined): BedSpec | null {
  const b = appearance?.arrangement?.bed;
  return b ? (typeof b === "object" ? b : {}) : null;
}

/** The bed a table of this box (round = ⌀ in `widthMm`) takes, in the table's own frame: a rect
 *  along its long side, or a disc. */
export function bedFootprint(table: { widthMm: number; depthMm: number; round: boolean }, spec: BedSpec): { kind: "rect"; widthMm: number; depthMm: number } | { kind: "circle"; diameterMm: number } {
  if (table.round) return { kind: "circle", diameterMm: Math.max(BED_MIN_MM, Math.min(table.widthMm, table.depthMm) - 2 * BED_SETTING_MM) };
  const L = Math.max(table.widthMm, table.depthMm);
  const D = Math.min(table.widthMm, table.depthMm);
  const across = spec.widthMm && spec.widthMm > 0 ? Math.min(spec.widthMm, D) : Math.max(BED_MIN_MM, D - 2 * BED_SETTING_MM);
  const along = Math.max(BED_MIN_MM, L - 2 * BED_END_MM);
  return table.widthMm >= table.depthMm ? { kind: "rect", widthMm: along, depthMm: across } : { kind: "rect", widthMm: across, depthMm: along };
}

/** A bed's length, mm — what a row priced by the metre bills. */
export function bedLengthMm(f: ReturnType<typeof bedFootprint>): number {
  return f.kind === "circle" ? f.diameterMm : Math.max(f.widthMm, f.depthMm);
}
