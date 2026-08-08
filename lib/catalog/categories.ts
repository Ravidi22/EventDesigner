// Category registry (F-4.3): a structured field exists ONLY when it multiplies quantities in
// the packing list — chandelier/candlestick arms (candles = fixtures × arms), standard chairs
// per table type. Every other trait lives in the product's free-text spec.
import {
  Armchair,
  Table2,
  Lightbulb,
  Flame,
  Frame,
  Square,
  Flower2,
  Boxes,
  Wine,
  Tent,
  Blinds,
  Rainbow,
  Milestone,
  type LucideIcon,
} from "lucide-react";
import type { Layer } from "./types";

export interface CategoryField {
  key: string;
  label: string;
  suffix?: string; // what the multiplication yields ("נרות")
}

export type DimsMode = "round" | "box" | "both";

// The department a designer browses by (F-4.3 catalog UX) — coarser than CategoryDef, which
// stays the real, structural unit (studio icon, dims mode, count-multiplier fields). A handful
// of fine categories share one department (e.g. tablecloths/centerpieces/candlesticks all live
// under "table design"), so this is a many-to-one label on top of CATEGORIES, not a replacement
// for it — existing products keep their exact `category`, only the catalog filter groups by this.
export type CategoryGroupId =
  | "grp-seating"
  | "grp-stages"
  | "grp-bars"
  | "grp-chuppahs"
  | "grp-table-design"
  | "grp-ceiling-design"
  | "grp-accessories";

export interface CategoryGroup {
  id: CategoryGroupId;
  label: string;
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { id: "grp-seating", label: "הושבה" },
  { id: "grp-stages", label: "במות" },
  { id: "grp-bars", label: "ברים ומזנונים" },
  { id: "grp-chuppahs", label: "חופות" },
  { id: "grp-table-design", label: "עיצוב שולחן" },
  { id: "grp-ceiling-design", label: "עיצובי תקרה" },
  { id: "grp-accessories", label: "מוצרים נלווים" },
];

export interface CategoryDef {
  id: string;
  label: string;
  group: CategoryGroupId;
  defaultLayer: Layer;
  icon: LucideIcon;
  dims: DimsMode;
  fields: CategoryField[]; // count-multipliers only (F-4.3); always numeric
}

export const CATEGORIES: CategoryDef[] = [
  { id: "tables", label: "שולחנות", group: "grp-seating", defaultLayer: "floor", icon: Table2, dims: "both", fields: [{ key: "seats", label: "כמות כסאות תקנית", suffix: "כסאות" }] },
  { id: "chairs", label: "כיסאות", group: "grp-seating", defaultLayer: "floor", icon: Armchair, dims: "box", fields: [] },
  { id: "tablecloths", label: "מפות", group: "grp-table-design", defaultLayer: "table", icon: Square, dims: "box", fields: [] },
  { id: "centerpieces", label: "מרכזי שולחן", group: "grp-table-design", defaultLayer: "table", icon: Flower2, dims: "round", fields: [] },
  { id: "chandeliers", label: "שנדליירים", group: "grp-ceiling-design", defaultLayer: "ceiling", icon: Lightbulb, dims: "round", fields: [{ key: "arms", label: "כמות קנים", suffix: "נרות" }] },
  { id: "candlesticks", label: "פמוטים", group: "grp-table-design", defaultLayer: "table", icon: Flame, dims: "box", fields: [{ key: "arms", label: "כמות קנים", suffix: "נרות" }] },
  { id: "rugs", label: "שטיחים", group: "grp-accessories", defaultLayer: "floor", icon: Frame, dims: "box", fields: [] },
  { id: "stages", label: "במות", group: "grp-stages", defaultLayer: "floor", icon: Boxes, dims: "box", fields: [] },
  { id: "bars", label: "ברים", group: "grp-bars", defaultLayer: "floor", icon: Wine, dims: "both", fields: [] },
  { id: "chuppahs", label: "חופות", group: "grp-chuppahs", defaultLayer: "floor", icon: Tent, dims: "both", fields: [] },
  { id: "curtains", label: "ווילונות", group: "grp-accessories", defaultLayer: "floor", icon: Blinds, dims: "box", fields: [] },
  { id: "arches", label: "קשתות", group: "grp-accessories", defaultLayer: "floor", icon: Rainbow, dims: "box", fields: [] },
  { id: "columns", label: "עמודים", group: "grp-accessories", defaultLayer: "floor", icon: Milestone, dims: "round", fields: [] },
];

export const CATEGORY_BY_ID: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

export const LAYERS: { id: Layer; label: string }[] = [
  { id: "table", label: "שולחן" },
  { id: "floor", label: "רצפה" },
  { id: "ceiling", label: "תקרה" },
];

export const LAYER_LABEL: Record<Layer, string> = {
  table: "שולחן",
  floor: "רצפה",
  ceiling: "תקרה",
};
