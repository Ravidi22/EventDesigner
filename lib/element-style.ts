// Shared per-element visual styling (fill/stroke/dash) for map elements — free-form, not named
// presets. Each element carries its own optional `style`; absent means "the renderer's own
// default look," so old saved data with no `style` field renders exactly as it always has.
// Walls are out of scope; a future element (e.g. Curtain) only needs `style?: ElementStyle`.
//
// Two rendering technologies read this — SVG (hall editor, plan preview, placement map, catalog
// preview) and Konva (the studio canvas) — so resolveStyle returns plain values, never JSX/Konva
// props. Each caller applies them to whatever its own tech expects.

export type DashPattern = "solid" | "dashed" | "dotted";

export interface ElementStyle {
  fill?: string; // CSS colour; absent = the caller's own default (often "no fill")
  fillOpacity?: number; // 0..1; absent = the caller's own default
  stroke?: string; // CSS colour; absent = the caller's own default
  strokeOpacity?: number; // 0..1; absent = fully opaque
  strokeWidthPx?: number; // screen pixels; absent = the caller's own default
  dash?: DashPattern; // named, not a raw array — survives JSON and the monochrome collapse; absent = "solid"
}

export type StyleMode = "screen" | "monochrome";

export interface ResolvedStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  dashArray: number[]; // [] = solid; feed straight into SVG strokeDasharray or Konva's `dash`
}

// What a caller would draw for this element with no style at all — resolveStyle only overrides
// what `style` actually specifies, so an unstyled element resolves to exactly these values.
export interface StyleDefaults {
  fill: string;
  fillOpacity?: number; // default 1
  stroke: string;
  strokeWidth: number;
}

const DASH_PATTERNS: Record<DashPattern, number[]> = {
  solid: [],
  dashed: [8, 4],
  dotted: [1.5, 3],
};

// The B&W print ink + paper — matches placement-map.tsx's existing literal colours.
const MONOCHROME_STROKE = "#1b1725";
const MONOCHROME_FILL = "#ffffff";

// mode "monochrome" only collapses what the *style* contributes — colour never survives to
// print — but a caller's own defaults are already B&W-safe (every unstyled surface already
// prints fine today), so an element with no style is untouched by the mode switch. Width and
// dash always pass through: once colour is gone, they're what has to carry the meaning.
export function resolveStyle(style: ElementStyle | undefined, mode: StyleMode, defaults: StyleDefaults): ResolvedStyle {
  const dashArray = DASH_PATTERNS[style?.dash ?? "solid"];
  const strokeWidth = style?.strokeWidthPx ?? defaults.strokeWidth;
  if (mode === "monochrome" && style) {
    return {
      fill: style.fill ? MONOCHROME_FILL : defaults.fill,
      fillOpacity: 1,
      stroke: MONOCHROME_STROKE,
      strokeOpacity: 1,
      strokeWidth,
      dashArray,
    };
  }
  return {
    fill: style?.fill ?? defaults.fill,
    fillOpacity: style?.fillOpacity ?? defaults.fillOpacity ?? 1,
    stroke: style?.stroke ?? defaults.stroke,
    strokeOpacity: style?.strokeOpacity ?? 1,
    strokeWidth,
    dashArray,
  };
}

/** Is this colour dark enough that ink written on it has to go light? Perceived luminance
 *  (ITU-R BT.601), the same rule the catalog swatches read by. Non-hex values (a CSS variable, a
 *  token fallback) are treated as light, which is what every tint in this palette is. Shared by the
 *  studio canvas and the rail's drag image, which both write a name or an icon inside a fill the
 *  designer chose. */
export function isDark(color: string): boolean {
  const hex = color.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}
