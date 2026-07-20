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
  type LucideIcon,
} from "lucide-react";
import type { Layer } from "./types";

export interface CategoryField {
  key: string;
  label: string;
  suffix?: string; // what the multiplication yields ("נרות")
}

export type DimsMode = "round" | "box" | "both";

export interface CategoryDef {
  id: string;
  label: string;
  defaultLayer: Layer;
  icon: LucideIcon;
  dims: DimsMode;
  fields: CategoryField[]; // count-multipliers only (F-4.3); always numeric
}

export const CATEGORIES: CategoryDef[] = [
  { id: "tables", label: "שולחנות", defaultLayer: "floor", icon: Table2, dims: "both", fields: [{ key: "seats", label: "כמות כסאות תקנית", suffix: "כסאות" }] },
  { id: "chairs", label: "כיסאות", defaultLayer: "floor", icon: Armchair, dims: "box", fields: [] },
  { id: "tablecloths", label: "מפות", defaultLayer: "table", icon: Square, dims: "box", fields: [] },
  { id: "centerpieces", label: "מרכזי שולחן", defaultLayer: "table", icon: Flower2, dims: "round", fields: [] },
  { id: "chandeliers", label: "שנדליירים", defaultLayer: "ceiling", icon: Lightbulb, dims: "round", fields: [{ key: "arms", label: "כמות קנים", suffix: "נרות" }] },
  { id: "candlesticks", label: "פמוטים", defaultLayer: "table", icon: Flame, dims: "box", fields: [{ key: "arms", label: "כמות קנים", suffix: "נרות" }] },
  { id: "rugs", label: "שטיחים", defaultLayer: "floor", icon: Frame, dims: "box", fields: [] },
  { id: "stages", label: "במות", defaultLayer: "floor", icon: Boxes, dims: "box", fields: [] },
  { id: "bars", label: "ברים", defaultLayer: "floor", icon: Wine, dims: "both", fields: [] },
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
