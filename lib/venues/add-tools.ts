// What the hall plan can add, in one list — and where each entry came from.
//
// This exists because "add a bar" stopped being a question about SHAPES. The plan's fixed features
// used to be placed as a kind plus a rectangle-or-circle, and the designer then typed the real
// numbers in: a built bar arrived as a 4×1.2m box that had to be reshaped into the ח it actually is,
// every time, in every venue. The studio already owns a description of that bar — the base library
// ships the standard ones (lib/catalog/standard/items.ts) and the designer's own sit beside them —
// so the picker offers THOSE, and the shape, the size and the name come across with the row.
//
// Two surfaces pick from this list (the canvas's add-element flyout and a zone's own quick-add), and
// a drag carries nothing but a tool's `id`. That is the whole reason the list is a module rather
// than an array inside one of them: two pickers building their own ids separately is two protocols
// that agree until one of them grows a department.
//
// The venue's own chairs in rows ("שורות כיסאות", ./seating.ts) take the studio's first chair as
// their chair — its size and style — or a dining chair when the catalog has none.
//
// Only the two departments a VENUE has built versions of are catalog-backed. A pool, a "מבנה", a palm and an
// "אחר" are shapes on a property, not products in a catalog, and there is nothing to pick from.
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, type CategoryGroupId } from "@/lib/catalog/categories";
import {
  FEATURE_KIND_LABEL,
  PLANT_SPECIES,
  PLANT_SPECIES_LABEL,
  SURFACE_MATERIALS,
  SURFACE_MATERIAL_LABEL,
  type FeatureKind,
  type PlantSpecies,
  type SurfaceMaterial,
} from "./structure";
import { CLIMB_BY_CATEGORY } from "./climb";
import { isMain } from "../self-check";

export type AddToolSection = "structure" | "ground" | "plants" | "bars" | "stages" | "seating";

export interface AddTool {
  /** Stable within one list, and the entire payload of a drag onto the canvas. */
  id: string;
  label: string;
  section: AddToolSection;
  /** null = a door, which is hung on a wall rather than placed as a feature. */
  kind: FeatureKind | null;
  /** The catalog row this places. Absent = a plain feature at the model's own rough default size. */
  product?: Product;
  /** The species, iff `kind === "plant"`. */
  plant?: PlantSpecies;
  /** The material, iff `kind === "surface"`. */
  surface?: SurfaceMaterial;
  /** The chair the rows are made of, iff `kind === "seating"` — absent for a studio with no chairs. */
  chair?: Product;
}

export const ADD_TOOL_SECTIONS: AddToolSection[] = ["structure", "ground", "plants", "bars", "stages", "seating"];

export const ADD_TOOL_SECTION_LABEL: Record<AddToolSection, string> = {
  structure: "מבנה",
  ground: "רצפה וקרקע",
  plants: "צמחייה",
  bars: "ברים ומזנונים",
  stages: "במות",
  seating: "ישיבה",
};

// The features a designer places by drawing them, because no catalog has an opinion about them.
const PLAIN: { id: string; label: string; kind: FeatureKind | null }[] = [
  { id: "entrance", label: "כניסה", kind: null },
  // Where the floor changes height — beside the door, because that is where they usually are.
  { id: "stairs", label: FEATURE_KIND_LABEL.stairs, kind: "stairs" },
  { id: "ramp", label: FEATURE_KIND_LABEL.ramp, kind: "ramp" },
  { id: "pool", label: FEATURE_KIND_LABEL.pool, kind: "pool" },
  { id: "structure", label: FEATURE_KIND_LABEL.structure, kind: "structure" },
  { id: "other", label: FEATURE_KIND_LABEL.other, kind: "other" },
];

// Which catalog department stands behind which fixed feature. Departments (CategoryGroupId), not
// fine categories, so a studio that files its מזנונים separately from its ברים still finds both here.
const CATALOG_BACKED: { section: AddToolSection; group: CategoryGroupId; kind: FeatureKind }[] = [
  { section: "bars", group: "grp-bars", kind: "bar" },
  { section: "stages", group: "grp-stages", kind: "stage" },
];

/**
 * The pickable list, given whatever the studio's catalog holds.
 *
 * A department with nothing in it falls back to the plain kind it always was. That is not a
 * courtesy: a studio that predates the base library (or has archived every bar it owns) must still
 * be able to put a bar on its plan, and an empty section with no way out would be a screen telling
 * the designer to go fix their catalog first.
 */
export function addTools(products: Product[] = []): AddTool[] {
  const tools: AddTool[] = PLAIN.map((t) => ({ ...t, section: "structure" }));
  // The ground and the planting are drawn, not picked off a shelf — no catalog has an opinion
  // about a lawn or a palm.
  for (const surface of SURFACE_MATERIALS) {
    tools.push({ id: `surface:${surface}`, label: SURFACE_MATERIAL_LABEL[surface], section: "ground", kind: "surface", surface });
  }
  for (const plant of PLANT_SPECIES) {
    tools.push({ id: `plant:${plant}`, label: PLANT_SPECIES_LABEL[plant], section: "plants", kind: "plant", plant });
  }

  for (const { section, group, kind } of CATALOG_BACKED) {
    // F-4.5: an archived row stays resolvable for the placements that already point at it, and off
    // every list that offers new ones.
    const rows = products
      .filter((p) => !p.archived && CATEGORY_BY_ID[p.category]?.group === group)
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
    if (rows.length === 0) {
      tools.push({ id: kind, label: FEATURE_KIND_LABEL[kind], section, kind });
      continue;
    }
    for (const product of rows) {
      // A rented flight or ramp set down in a venue is that venue's stairs or ramp (./climb.ts) —
      // a stage would have drawn it as a box with nothing to say which way is up.
      tools.push({ id: `product:${product.id}`, label: product.name, section, kind: CLIMB_BY_CATEGORY[product.category] ?? kind, product });
    }
  }
  // The ceremony seating in front of a חופה — the venue's own chairs, five rows of five to start.
  const chair = products.find((p) => !p.archived && p.category === "chairs");
  tools.push({ id: "seating", label: FEATURE_KIND_LABEL.seating, section: "seating", kind: "seating", ...(chair ? { chair } : {}) });
  return tools;
}

/** The tool a drag or an armed button is referring to. Undefined for an id from some other list
 *  entirely (a stray drag off another surface), which is a no-op rather than a guess. */
export function findAddTool(tools: AddTool[], id: string | null | undefined): AddTool | undefined {
  return id ? tools.find((t) => t.id === id) : undefined;
}

// ponytail: self-check. Run: npm run check:add-tools
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const product = (id: string, name: string, category: string, archived = false): Product => ({
    id,
    name,
    category,
    layer: "floor",
    dimensions: { widthMm: 3600, depthMm: 1800, heightMm: 1100 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    ...(archived ? { archived } : {}),
  });

  // An empty catalog is the studio that predates the base library. Every kind is still placeable.
  const empty = addTools([]);
  assert(empty.length === 9 + PLANT_SPECIES.length + SURFACE_MATERIALS.length, "an empty catalog offers the nine plain things — door, stairs, ramp, pool, structure, other, bar, stage, chairs in rows — and the planting");
  assert(empty.find((t) => t.kind === "seating")?.chair === undefined, "…the rows of a dining chair when there is no chair to take");
  assert(empty.filter((t) => t.product).length === 0, "…none of them backed by a row that isn't there");
  for (const kind of ["bar", "stage"] as const) {
    const t = empty.find((x) => x.id === kind)!;
    assert(!!t && t.kind === kind, `${kind} falls back to the plain kind rather than to an empty section`);
  }

  const tools = addTools([
    product("b2", "בר ישר 200×60", "bars"),
    product("b1", "בר בצורת ח 360×180", "bars"),
    product("b3", "בר ישן", "bars", true),
    product("s1", "במה 400×300", "stages"),
    product("r1", "רמפת נגישות", "stage-ramps"),
    product("t1", "עגול 180", "tables"),
  ]);
  const bars = tools.filter((t) => t.section === "bars");
  assert(bars.length === 2, "a department with rows offers the rows, not the plain kind");
  assert(bars.every((t) => t.kind === "bar"), "…and every one of them still lands as a bar on the plan");
  assert(bars[0].label === "בר בצורת ח 360×180", "…in the order a Hebrew reader would look for them");
  assert(!tools.some((t) => t.product?.id === "b3"), "an archived row is off the list (F-4.5)");
  assert(!tools.some((t) => t.product?.id === "t1"), "a table is not something a venue has built");
  assert(tools.filter((t) => t.section === "stages").length === 2, "the stage department is catalog-backed too");
  assert(findAddTool(tools, "product:r1")?.kind === "ramp" && findAddTool(tools, "product:s1")?.kind === "stage", "…and a ramp in it lands as the venue's ramp, a stage as a stage");
  assert(new Set(tools.map((t) => t.id)).size === tools.length, "ids are unique — a drag has to name exactly one tool");

  assert(findAddTool(tools, "product:b1")?.product?.id === "b1", "a drag payload finds its row");
  assert(findAddTool(tools, "entrance")?.kind === null, "the door is a tool with no feature kind");
  assert(findAddTool(tools, "product:gone") === undefined, "an id from another list is a no-op, not a guess");
  assert(findAddTool(tools, null) === undefined, "…and so is no id at all");

  console.log(`add tools: ${tools.length} ok`);
}
