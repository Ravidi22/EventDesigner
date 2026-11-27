// npm run check:style — the self-check of ./element-style.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { resolveStyle, type StyleDefaults } from "./element-style";

// ponytail: self-check. Run: node --experimental-strip-types lib/element-style.ts
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
