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

// ponytail: self-check. Run: node --experimental-strip-types lib/element-style.ts
if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const defaults: StyleDefaults = { fill: "#ffffff", stroke: "#1b1725", strokeWidth: 1.5 };

  // No style at all: byte-identical to the caller's own defaults, in both modes — this is what
  // guarantees old saved data (no `style` field) renders unchanged.
  const bare = resolveStyle(undefined, "screen", defaults);
  assert(bare.fill === "#ffffff" && bare.stroke === "#1b1725" && bare.strokeWidth === 1.5 && bare.dashArray.length === 0, "no style resolves to exactly the caller's defaults on screen");
  const bareMono = resolveStyle(undefined, "monochrome", defaults);
  assert(JSON.stringify(bareMono) === JSON.stringify(bare), "no style resolves identically in monochrome — there is nothing to collapse");

  // Screen mode passes a custom colour straight through.
  const colored = resolveStyle({ fill: "#c9a227", stroke: "#7a4b12", dash: "dashed" }, "screen", defaults);
  assert(colored.fill === "#c9a227" && colored.stroke === "#7a4b12", "screen mode keeps the chosen colours");
  assert(colored.dashArray[0] === 8 && colored.dashArray[1] === 4, "dashed resolves to its named pattern");

  // Monochrome collapses colour but keeps width/dash — that's what has to carry the meaning once
  // colour is gone.
  const mono = resolveStyle({ fill: "#c9a227", stroke: "#7a4b12", strokeWidthPx: 3, dash: "dotted" }, "monochrome", defaults);
  assert(mono.fill === "#ffffff" && mono.stroke === "#1b1725", "monochrome collapses any custom colour to ink-on-paper");
  assert(mono.strokeWidth === 3 && mono.dashArray[0] === 1.5, "monochrome still carries the custom width and dash through");

  // An element with no fill of its own (outline-only) stays unfilled even in monochrome.
  const outlineOnly = resolveStyle({ stroke: "#7a4b12" }, "monochrome", { ...defaults, fill: "none" });
  assert(outlineOnly.fill === "none", "an element with no fill of its own stays unfilled in monochrome");

  // Partial style: unset sub-fields fall back to the caller's own defaults, not some global one.
  const partial = resolveStyle({ stroke: "#7a4b12" }, "screen", defaults);
  assert(
    partial.fill === "#ffffff" && partial.fillOpacity === 1 && partial.strokeOpacity === 1 && partial.strokeWidth === 1.5,
    "unset style fields fall back to the caller's own defaults",
  );

  // strokeOpacity passes through on screen, and collapses to fully opaque in monochrome — a print
  // is opaque ink, so a translucent stroke wouldn't mean anything there.
  const translucentStroke = resolveStyle({ stroke: "#7a4b12", strokeOpacity: 0.4 }, "screen", defaults);
  assert(translucentStroke.strokeOpacity === 0.4, "screen mode keeps a custom stroke opacity");
  const translucentMono = resolveStyle({ stroke: "#7a4b12", strokeOpacity: 0.4 }, "monochrome", defaults);
  assert(translucentMono.strokeOpacity === 1, "monochrome always prints a fully opaque stroke");

  console.log("element-style self-check passed");
}
