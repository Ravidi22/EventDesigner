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
import { POOL_PRESETS, POOL_PRESET_LABEL, type PoolPreset } from "./pool";
import { PERGOLA_CATEGORY } from "./pergola";
import { venueItemOffered } from "./item";
import { BILLIARD_TABLE } from "@/lib/catalog/game-tables";
import { STANDARD_TABLES, standardProduct } from "@/lib/catalog/standard/items";
import { TABLE_CATEGORY } from "./venue-table";

export type AddToolSection = "structure" | "pool" | "ground" | "plants" | "bars" | "stages" | "tables" | "seating" | "lounge" | "catalog";

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
  /** The shape a pool is put down in, iff `kind === "pool"` (./pool.ts) — "free" is the freehand
   *  trace in water, which the screen starts rather than places. */
  pool?: PoolPreset;
}

export const ADD_TOOL_SECTIONS: AddToolSection[] = ["structure", "pool", "ground", "plants", "bars", "stages", "tables", "seating", "lounge"];

export const ADD_TOOL_SECTION_LABEL: Record<AddToolSection, string> = {
  structure: "מבנה",
  pool: "בריכה",
  ground: "רצפה וקרקע",
  plants: "צמחייה",
  bars: "ברים ומזנונים",
  stages: "במות",
  tables: "שולחנות",
  seating: "ישיבה",
  lounge: "טרקלין",
  catalog: "מהקטלוג",
};

// The features a designer places by drawing them, because no catalog has an opinion about them.
const PLAIN: { id: string; label: string; kind: FeatureKind | null }[] = [
  { id: "entrance", label: "כניסה", kind: null },
  // A window is hung on a wall as a door is (StructureEntrance.kind) — an opening nobody walks through.
  { id: "window", label: "חלון / ויטרינה", kind: null },
  // Hung on a wall too — the venue's own curtain (./curtain.ts), the whole wall at a click.
  { id: "curtain", label: FEATURE_KIND_LABEL.curtain, kind: "curtain" },
  // …or on a free-standing rod (spec 2026-11-07 §6.2): a click for every post, Enter to end.
  { id: "curtain-rod", label: "וילון על מוט", kind: "curtain" },
  // The venue's own LED (spec 2026-11-07 §7.3, ./led.ts): a strip along the nearest wall or side of a
  // thing with height at a click, or between two points drawn; and a screen.
  { id: "led", label: FEATURE_KIND_LABEL.led, kind: "led" },
  { id: "led-run", label: "פס לד חופשי", kind: "led" },
  { id: "screen", label: FEATURE_KIND_LABEL.screen, kind: "screen" },
  // Where the floor changes height — beside the door, because that is where they usually are.
  { id: "stairs", label: FEATURE_KIND_LABEL.stairs, kind: "stairs" },
  { id: "ramp", label: FEATURE_KIND_LABEL.ramp, kind: "ramp" },
  { id: "fountain", label: FEATURE_KIND_LABEL.fountain, kind: "fountain" },
  { id: "structure", label: FEATURE_KIND_LABEL.structure, kind: "structure" },
  // A pillar — its plinth, base and shaft are the column's own (./column.ts).
  { id: "column", label: FEATURE_KIND_LABEL.column, kind: "column" },
  // Posts, beams and a roof (./pergola.ts) — the venue's own; a hired one is the catalog's, below.
  { id: "pergola", label: FEATURE_KIND_LABEL.pergola, kind: "pergola" },
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
  // A pool is put down by its SHAPE (./pool.ts): rectangle, oval, kidney, ר, or traced by hand. The
  // oval keeps the id the one pool tool always had — it is that tool — so a drag payload naming
  // "pool" still lands the pool it always did.
  for (const pool of POOL_PRESETS) {
    tools.push({ id: pool === "ellipse" ? "pool" : `pool:${pool}`, label: POOL_PRESET_LABEL[pool], section: "pool", kind: "pool", pool });
  }
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
  // The studio's own pergolas (lib/catalog/categories.ts `pergolas`), beside the plain one: a venue
  // that rents the same 4 × 4 every week is drawn as that row — its post, its roof — and lands as the
  // venue's pergola (newFeatureFromProduct carries the spec). The plain one stays: a property's built
  // pergola is no catalog's.
  for (const product of products.filter((p) => !p.archived && p.category === PERGOLA_CATEGORY).sort((a, b) => a.name.localeCompare(b.name, "he"))) {
    tools.push({ id: `product:${product.id}`, label: product.name, section: "structure", kind: "pergola", product });
  }
  // THE VENUE'S DEFAULT TABLE LAYOUT (./venue-table.ts): the studio's own table rows, or — for a
  // business with none (a venue owner has no catalog) — the base library's standard tables, so every
  // hall can lay out its usual room. Each lands as a table of the layout, numbered next.
  const ownTables = products.filter((p) => !p.archived && p.category === TABLE_CATEGORY).sort((a, b) => a.name.localeCompare(b.name, "he"));
  const tableRows = ownTables.length ? ownTables : STANDARD_TABLES.map((item) => standardProduct(item, `standard:${item.key}`));
  for (const product of tableRows) tools.push({ id: `table:${product.id}`, label: product.name, section: "tables", kind: "table", product });
  // The ceremony seating in front of a חופה — the venue's own chairs, five rows of five to start.
  const chair = products.find((p) => !p.archived && p.category === "chairs");
  tools.push({ id: "seating", label: FEATURE_KIND_LABEL.seating, section: "seating", kind: "seating", ...(chair ? { chair } : {}) });
  // A lounge's billiard table (lib/catalog/game-tables.ts) — the standard 8-foot one, offered to every
  // business: a venue owner has no catalog to pick one from. Lands as the venue's own item (./item.ts).
  tools.push({ id: `item:${BILLIARD_TABLE.id}`, label: BILLIARD_TABLE.name, section: "lounge", kind: "item", product: BILLIARD_TABLE });
  // Everything else the studio's catalog holds that has a place of its own (./item.ts) — the venue's
  // own chandelier or sofa, drawn as itself. Its own section, kept OUT of ADD_TOOL_SECTIONS: the rail
  // shows it on a tab of its own, apart from what the venue is built of.
  for (const product of products.filter(venueItemOffered).sort((a, b) => a.name.localeCompare(b.name, "he"))) {
    tools.push({ id: `item:${product.id}`, label: product.name, section: "catalog", kind: "item", product });
  }
  return tools;
}

/** The catalog tab's tools (the rail's "מהקטלוג"). */
export function catalogTools(tools: readonly AddTool[]): AddTool[] {
  return tools.filter((t) => t.section === "catalog");
}

/** The tool a drag or an armed button is referring to. Undefined for an id from some other list
 *  entirely (a stray drag off another surface), which is a no-op rather than a guess. */
export function findAddTool(tools: AddTool[], id: string | null | undefined): AddTool | undefined {
  return id ? tools.find((t) => t.id === id) : undefined;
}

/** The one entry on the venue's rail that is not a tool: trace a surface of any shape, point by
 *  point, as a freehand zone is traced. */
export const DRAW_SURFACE_ID = "surface:draw";

/** One grid of the venue's draw + add rail (app/(app)/halls/halls-rail.tsx). */
export interface RailSection {
  section: AddToolSection;
  label: string;
  tools: AddTool[];
}

/** The tools grouped for the rail: one section per ADD_TOOL_SECTIONS entry, in that order, the
 *  empty ones left out (a catalog with no bars still has the plain bar, but a section can empty). */
export function railSections(tools: readonly AddTool[]): RailSection[] {
  return ADD_TOOL_SECTIONS.map((section) => ({ section, label: ADD_TOOL_SECTION_LABEL[section], tools: tools.filter((t) => t.section === section) })).filter((r) => r.tools.length > 0);
}
