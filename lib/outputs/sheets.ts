// WHICH PLAN. A crew does not read one drawing with everything on it: the rigger wants the ceiling,
// the stage crew wants the stage, and the people laying tables want the tables without a rigging
// plan drawn over them. Five named sheets, because five is what gets handed out -- not a free-form
// layer builder, which asks the person printing to design the drawing.
//
// Layers are not enough on their own: "the stage" is a category GROUP, not a layer, and so is
// "chairs". A sheet therefore filters on both, plus the handful of things that are neither.
import type { DesignDocumentContent, Layer } from "../design-document/types";
import type { CategoryGroupId } from "../catalog/categories";
import { isMain } from "../self-check";

/** How the tables appear on a sheet that is not about them. "ghost" is the one that earns its
 *  place: a rigger hanging a chandelier needs to know which table is under it, and a ceiling plan
 *  with no tables on it cannot answer that -- but tables drawn at full weight would bury the rods. */
export type TablePresence = "none" | "ghost" | "full";

export interface PlanSheet {
  id: string;
  label: string;
  layers: Layer[];
  groups?: CategoryGroupId[];
  /** Narrower than a group: only these catalog categories (the rug plan — rugs share the
   *  accessories group with everything else). */
  categories?: string[];
  tables: TablePresence;
  chairs: boolean;
  numbers: boolean;
  /** Which measurements this sheet carries (lib/outputs/measurements.ts). The room's overall width
   *  and depth are on every sheet and are not a flag. */
  measure?: { chains?: boolean; sizes?: boolean; ties?: boolean; gaps?: boolean; aisles?: boolean };
}

// Walls, doors and zone floors are on EVERY sheet and are therefore not a flag: a plan with no room
// on it is not a plan.
export const PLAN_SHEETS: PlanSheet[] = [
  // The hall plan is what stands on the floor of the room: tables, chairs, stages, bars -- everything
  // a crew loading the room needs to see. "layers" filters PLACEMENTS by layer; the stage and the
  // bar are not a separate layer, they are floor placements like the tables, so the floor layer
  // carries them without a groups filter. It carries the sizes of what stands in the room and the
  // chains to the table centres; the rest of the figures live on the dimension plan, because all of
  // them on one sheet bury the tables they measure.
  { id: "hall", label: "שרטוט אולם", layers: ["floor"], tables: "full", chairs: true, numbers: true, measure: { chains: true, sizes: true } },
  // THE DIMENSION PLAN — every figure a crew sets the room out with: sizes, each element's distance
  // to the walls, the gaps between elements and tables, the narrowest aisle in each row. Tables full
  // and numbered (they are what is measured) but without chairs, which would only crowd the figures.
  { id: "dims", label: "תוכנית מידות", layers: ["floor"], tables: "full", chairs: false, numbers: true, measure: { chains: true, sizes: true, ties: true, gaps: true, aisles: true } },
  // The design sheet is about the look: the numbers are on the hall plan, and printed over the
  // dressing here they only cover it.
  { id: "design", label: "שרטוט עיצוב", layers: ["floor", "table"], tables: "full", chairs: true, numbers: false },
  { id: "ceiling", label: "תוכנית תקרה", layers: ["ceiling"], tables: "ghost", chairs: false, numbers: true },
  // "groups" filters by catalog category group, not by layer -- the stage sheet wants ONLY the stage
  // group off the floor layer, not every floor placement.
  { id: "stage", label: "תוכנית במה", layers: ["floor"], groups: ["grp-stages"], tables: "none", chairs: false, numbers: false, measure: { sizes: true, ties: true } },
  // Rugs are laid before anything stands on them, from their size and two distances to the walls.
  { id: "rugs", label: "תוכנית שטיחים", layers: ["floor"], categories: ["rugs"], tables: "ghost", chairs: false, numbers: false, measure: { sizes: true, ties: true } },
  // Chairs keep layers: [] on purpose: this sheet's chairs come from table seating, not from a floor
  // placement, so filtering in the floor layer here would draw every chair twice.
  { id: "chairs", label: "פריסת כיסאות", layers: [], tables: "ghost", chairs: true, numbers: true },
];

/** Whether a sheet would draw anything of its own for this document — a ceiling plan with nothing
 *  on the ceiling is the room's walls on a page, and the rail offers it as empty rather than printing
 *  it. The hall and dimension plans always have the room. `categoryOf` is injected so this file stays
 *  free of the catalog graph and its self-check runs under node. */
export function sheetHasContent(
  sheet: PlanSheet,
  doc: DesignDocumentContent,
  categoryOf: (variantId: string) => { category: string; group?: string } | undefined,
): boolean {
  if (sheet.id === "hall" || sheet.id === "dims") return true;
  if (sheet.id === "chairs") return doc.tables.some((t) => (t.seats ?? 0) > 0);
  return doc.placements.some((p) => {
    if (!sheet.layers.includes(p.layer)) return false;
    const c = categoryOf(p.variantId);
    if (sheet.groups && (!c?.group || !sheet.groups.includes(c.group as CategoryGroupId))) return false;
    if (sheet.categories && (!c || !sheet.categories.includes(c.category))) return false;
    // The design sheet is about what is ON the tables — a floor item alone does not make one.
    if (sheet.id === "design") return p.layer === "table";
    return true;
  });
}

export function sheetById(id: string): PlanSheet | undefined {
  return PLAN_SHEETS.find((s) => s.id === id);
}

// ponytail: self-check. Run: npm run check:sheets
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  assert(new Set(PLAN_SHEETS.map((s) => s.id)).size === PLAN_SHEETS.length, "sheet ids are unique");
  assert(PLAN_SHEETS.every((s) => s.label.trim().length > 0), "every sheet is named on screen");
  assert(sheetById("ceiling")!.tables === "ghost", "the ceiling plan ghosts the tables, so a rigger knows what is underneath");
  assert(sheetById("hall")!.layers.includes("floor"), "the hall plan carries the furniture standing on the floor");
  assert(!!sheetById("dims")!.measure?.gaps, "the dimension plan carries the gaps");
  assert(sheetById("design")!.layers.includes("table"), "the design sheet carries what is ON the tables");
  assert(sheetById("gone") === undefined, "an unknown id is undefined, not a throw");
  const cat = (id: string) => (id === "rug" ? { category: "rugs", group: "grp-accessories" } : { category: "chandeliers", group: "grp-ceiling-design" });
  const bare = { calibration: { mmPerUnit: 1 }, tables: [], placements: [] } as unknown as DesignDocumentContent;
  const withRug = { ...bare, placements: [{ id: "r", layer: "floor", variantId: "rug" }] } as unknown as DesignDocumentContent;
  assert(sheetHasContent(sheetById("hall")!, bare, cat), "the hall plan always has the room");
  assert(!sheetHasContent(sheetById("rugs")!, bare, cat) && sheetHasContent(sheetById("rugs")!, withRug, cat), "the rug plan has content only when a rug is placed");
  assert(!sheetHasContent(sheetById("ceiling")!, withRug, cat), "a rug does not make a ceiling plan");
  assert(sheetById("design")!.numbers === false, "the design sheet carries no table numbers");
  console.log("sheets self-check passed");
}
