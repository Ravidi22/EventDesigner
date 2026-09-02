// WHICH PLAN. A crew does not read one drawing with everything on it: the rigger wants the ceiling,
// the stage crew wants the stage, and the people laying tables want the tables without a rigging
// plan drawn over them. Five named sheets, because five is what gets handed out -- not a free-form
// layer builder, which asks the person printing to design the drawing.
//
// Layers are not enough on their own: "the stage" is a category GROUP, not a layer, and so is
// "chairs". A sheet therefore filters on both, plus the handful of things that are neither.
import type { Layer } from "../design-document/types";
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
  tables: TablePresence;
  chairs: boolean;
  rigs: boolean;
  numbers: boolean;
}

// Walls, doors and zone floors are on EVERY sheet and are therefore not a flag: a plan with no room
// on it is not a plan.
export const PLAN_SHEETS: PlanSheet[] = [
  // The hall plan is what stands on the floor of the room: tables, chairs, stages, bars -- everything
  // a crew loading the room needs to see. "layers" filters PLACEMENTS by layer; the stage and the
  // bar are not a separate layer, they are floor placements like the tables, so the floor layer
  // carries them without a groups filter.
  { id: "hall", label: "שרטוט אולם", layers: ["floor"], tables: "full", chairs: true, rigs: false, numbers: true },
  { id: "design", label: "שרטוט עיצוב", layers: ["floor", "table"], tables: "full", chairs: true, rigs: false, numbers: true },
  { id: "ceiling", label: "תוכנית תקרה", layers: ["ceiling"], tables: "ghost", chairs: false, rigs: true, numbers: true },
  // "groups" filters by catalog category group, not by layer -- the stage sheet wants ONLY the stage
  // group off the floor layer, not every floor placement.
  { id: "stage", label: "במה", layers: ["floor"], groups: ["grp-stages"], tables: "none", chairs: false, rigs: false, numbers: false },
  // Chairs keep layers: [] on purpose: this sheet's chairs come from table seating, not from a floor
  // placement, so filtering in the floor layer here would draw every chair twice.
  { id: "chairs", label: "פריסת כיסאות", layers: [], tables: "ghost", chairs: true, rigs: false, numbers: true },
];

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
  assert(sheetById("ceiling")!.rigs, "the ceiling plan carries the rods");
  assert(sheetById("ceiling")!.tables === "ghost", "…and ghosts the tables, so a rigger knows what is underneath");
  assert(!sheetById("hall")!.rigs, "the hall plan does not");
  assert(sheetById("hall")!.layers.includes("floor"), "the hall plan carries the furniture standing on the floor");
  assert(sheetById("design")!.layers.includes("table"), "the design sheet carries what is ON the tables");
  assert(sheetById("gone") === undefined, "an unknown id is undefined, not a throw");
  console.log("sheets self-check passed");
}
