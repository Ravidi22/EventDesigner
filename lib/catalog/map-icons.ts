// Curated glyphs offered for a catalog item's map appearance. `name` is the stable
// string stored on Product.appearance.icon; the component is used both in the DOM
// picker and, at footprint scale, on the plan itself (app/(app)/studio/canvas-stage.tsx).
import {
  Armchair, Table2, Lightbulb, Flame, Frame, Square, Flower2, Wine, Martini,
  Sofa, Speaker, Music, Utensils, Coffee, Gift, Sparkles, Cake, TreePine,
  Star, Heart, Crown, Lamp, GlassWater, Disc, LayoutGrid, Tent, Umbrella, Circle,
  type LucideIcon,
} from "lucide-react";

export interface MapIcon {
  name: string;
  label: string;
  Icon: LucideIcon;
}

export const MAP_ICONS: MapIcon[] = [
  { name: "armchair", label: "כיסא", Icon: Armchair },
  { name: "table", label: "שולחן", Icon: Table2 },
  { name: "lightbulb", label: "תאורה", Icon: Lightbulb },
  { name: "flame", label: "נר / פמוט", Icon: Flame },
  { name: "frame", label: "שטיח / מסגרת", Icon: Frame },
  { name: "square", label: "מפה", Icon: Square },
  { name: "flower", label: "פרחים", Icon: Flower2 },
  { name: "wine", label: "בר", Icon: Wine },
  { name: "martini", label: "קוקטייל", Icon: Martini },
  { name: "sofa", label: "ספה", Icon: Sofa },
  { name: "speaker", label: "רמקול", Icon: Speaker },
  { name: "music", label: "מוזיקה", Icon: Music },
  { name: "utensils", label: "כלי אוכל", Icon: Utensils },
  { name: "coffee", label: "קפה", Icon: Coffee },
  { name: "gift", label: "מתנה", Icon: Gift },
  { name: "sparkles", label: "נצנוץ", Icon: Sparkles },
  { name: "cake", label: "עוגה", Icon: Cake },
  { name: "tree", label: "עץ", Icon: TreePine },
  { name: "star", label: "כוכב", Icon: Star },
  { name: "heart", label: "לב", Icon: Heart },
  { name: "crown", label: "כתר", Icon: Crown },
  { name: "lamp", label: "מנורה", Icon: Lamp },
  { name: "glass", label: "כוס", Icon: GlassWater },
  { name: "disc", label: "רחבה", Icon: Disc },
  { name: "grid", label: "רשת", Icon: LayoutGrid },
  { name: "tent", label: "אוהל", Icon: Tent },
  { name: "umbrella", label: "שמשייה", Icon: Umbrella },
  { name: "circle", label: "עיגול", Icon: Circle },
];

export const ICON_BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  MAP_ICONS.map((i) => [i.name, i.Icon]),
);
