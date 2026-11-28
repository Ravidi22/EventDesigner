// npm run check:scene-element — the self-check of ./element-body.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import { footprintOutlines, sizedFootprint } from "@/lib/studio/footprint";
import { definitionOf } from "@/lib/element/adapter";
import { elementGeometry, flat } from "@/lib/element/geometry";
import { type MaterialRef } from "./types";
import { elementBody, elementOf, elementParts, ownBodyParts } from "./element-body";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const body: MaterialRef = { colour: "#aabbcc", kind: "matte" };
const row = (over: Partial<Product>): Product => ({ id: "x", name: "בדיקה", category: "other", layer: "floor", dimensions: { widthMm: 1200, depthMm: 600, heightMm: 900 }, categoryFields: {}, styleTags: [], variants: [], ...over });

// A plain row: one extrude of its footprint to its height, as the fallback always built.
const plain = row({});
const b1 = elementBody(plain, { kind: "rect", widthMm: 1200, depthMm: 600 }, body)!;
assert(b1 !== null && b1.parts.length === 1 && b1.parts[0].shape === "extrude" && b1.parts[0].h === 900 && b1.parts[0].at.z === 0, "a plain row is one extrude, 900 high, on the floor");
assert(b1.parts[0].material === undefined, "…in the body's material");
const old = footprintOutlines({ kind: "rect", widthMm: 1200, depthMm: 600 })[0];
assert(JSON.stringify((b1.parts[0] as { outline: unknown }).outline) === JSON.stringify(old), "…of exactly the footprint's outline");

// The same row handed a footprint that is not its own (a carpet laid to an outline): not ours.
assert(elementBody(plain, { kind: "custom", outline: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 0, y: 500 }] }, body) === null, "a footprint the row does not describe is left to the old path");
// Stretched on the plan: agreed through the sized reading when the row may stretch.
const stretchy = row({ resize: { stepMm: 100, width: { minMm: 100, maxMm: 9000 }, depth: { minMm: 100, maxMm: 9000 } } });
assert(elementBody(stretchy, { kind: "rect", widthMm: 2400, depthMm: 600 }, body)?.parts.length === 1, "a stretched row is read at its stretched size");
assert(elementBody(plain, { kind: "rect", widthMm: 2400, depthMm: 600 }, body) === null, "…but not a row of one size");

// Parts with their own heights and surfaces: the bar.
const bar = row({
  appearance: {
    shape: "rect",
    content: "none",
    texture: "marble",
    parts: [
      { id: "back", shape: "rect", widthMm: 1200, depthMm: 300, x: 0, y: -450, rotation: 0, heightMm: 2000, texture: "wood" },
      { id: "shelf", shape: "rect", widthMm: 1200, depthMm: 250, x: 0, y: -400, rotation: 0, zMm: 1000, heightMm: 40 },
    ],
  },
});
const el = elementOf(bar, elementGeometry(definitionOf(bar)).footprint)!;
assert(!flat(el.geometry), "a bar with a back-bar and a shelf is not flat");
const parts = elementParts(el.geometry, body);
assert(parts.length === 3, `three parts (${parts.length})`);
assert(parts[0].material?.texture === "marble" && parts[1].material?.texture === "wood" && parts[2].material === undefined, "the counter is marble, the back-bar timber, the shelf the body's colour");
assert(parts[1].shape === "extrude" && parts[1].h === 2000 && parts[2].shape === "extrude" && parts[2].at.z === 1000 && parts[2].h === 40, "the back-bar rises 2 m from the floor; the shelf stands at 1 m, 4 cm thick");

// A shape's OWN colour (ShapePart.style / MapAppearance.baseStyle) is its material's colour,
// pinned over the body's; a texture on it is tinted by it.
const painted = row({ appearance: { ...bar.appearance!, baseStyle: { fill: "#111111" }, parts: bar.appearance!.parts!.map((q, i) => (i === 1 ? { ...q, style: { fill: "#aa0000" } } : q)) } });
const paintedParts = elementParts(elementOf(painted, elementGeometry(definitionOf(painted)).footprint)!.geometry, body);
assert(paintedParts[0].material?.colour === "#111111" && paintedParts[0].material?.texture === "marble", "the counter is marble tinted its own black");
assert(paintedParts[2].material?.colour === "#aa0000" && paintedParts[1].material?.texture === "wood" && paintedParts[1].material?.colour === body.colour, "the shelf is its own red; the back-bar keeps the body's colour");

// A recipe's share and the model's: the bar's counter is the recipe's, its raised back-bar and
// shelf the model's; a row with no own bodies hands nothing over.
const split = ownBodyParts(bar, el.geometry.footprint, body)!;
const restPieces = split?.rest.kind === "multi" ? split.rest.parts : [];
assert(split !== null && split.parts.length === 2 && restPieces.length === 1, "the back-bar and the shelf are the model's; the counter is left for the recipe");
assert(JSON.stringify(restPieces[0].outline) === JSON.stringify(el.geometry.parts[0].pieces[0].outline), "…where it stands in the element's frame");
assert(ownBodyParts(plain, { kind: "rect", widthMm: 1200, depthMm: 600 }, body) === null, "a row with no own bodies hands nothing over");
// SH-2: what the recipe keeps is never an outline-only shape, and each of its pieces carries the
// look its own shape asked for — a table's top was all timber, and built from an outline-only base.
const looked = row({ appearance: { shape: "rect", content: "none", baseStyle: { fill: "#111111" }, parts: [{ id: "end", shape: "circle", diameterMm: 600, x: 600, y: 0, rotation: 0, texture: "marble" }] } });
const lookedSplit = ownBodyParts(looked, elementGeometry(definitionOf(looked)).footprint, body)!;
assert(lookedSplit !== null && lookedSplit.whole && lookedSplit.parts.length === 0, "shapes with a look of their own are still the recipe's, whole");
assert(lookedSplit.materials[0]?.colour === "#111111" && lookedSplit.materials[1]?.texture === "marble", "…each piece in its own look");
const reach = row({ appearance: { shape: "rect", content: "none", body: "none", parts: [{ id: "top", shape: "circle", diameterMm: 600, x: 0, y: 0, rotation: 0 }] } });
const reachSplit = ownBodyParts(reach, elementGeometry(definitionOf(reach)).footprint, body)!;
assert(reachSplit !== null && !reachSplit.whole && reachSplit.rest.kind === "multi" && reachSplit.rest.parts.length === 1, "an outline-only first shape is left out of what the recipe builds");
// A round base with a profile of its own: the lathe is the model's and the base's piece stays the
// recipe's footprint, so a chandelier keeps its arms round a crystal heart.
const heart = row({ appearance: { shape: "circle", content: "none", revolve: [{ r: 0.3, z: 0 }, { r: 1, z: 0.6 }, { r: 0.2, z: 1 }] }, dimensions: { diameterMm: 800, heightMm: 600 } });
const heartSplit = ownBodyParts(heart, elementGeometry(definitionOf(heart)).footprint, body)!;
assert(heartSplit !== null && heartSplit.parts.length === 1 && heartSplit.parts[0].shape === "lathe", "a base with a profile hands its lathe over");
assert(heartSplit.rest.kind === "multi" && heartSplit.rest.parts.length === 1, "…and keeps its footprint for the picture");

// Lines only: a thin wall along the drawn sides, the closing side left out.
const lines = row({ dimensions: { widthMm: 1400, depthMm: 900, heightMm: 1000 }, appearance: { shape: "custom", content: "none", open: true, outline: [{ x: 0, y: 0 }, { x: 1400, y: 0 }, { x: 1400, y: 900 }, { x: 0, y: 900 }] } });
const lb = elementBody(lines, elementGeometry(definitionOf(lines)).footprint, body)!;
assert(lb.parts.length === 1 && lb.parts[0].shape === "extrude" && (lb.parts[0] as { outline: { outline: unknown[] } }).outline.outline.length > 4, "lines only stand as a band along the drawn sides");

// A revolved part stands as a lathe at its piece's centre, its rim the circle's, its top its height.
const bowl = row({
  appearance: { shape: "circle", content: "none", parts: [{ id: "b", shape: "circle", diameterMm: 400, x: 800, y: 0, rotation: 0, zMm: 900, heightMm: 300, revolve: [{ r: 0.25, z: 0 }, { r: 1, z: 1 }] }] },
  dimensions: { diameterMm: 1200, heightMm: 900 },
});
const bd = definitionOf(bowl);
assert(bd.parts[1].op.kind === "revolve" && bd.parts[0].op.kind === "extrude", "a round part with a profile is revolved; the base without one is extruded");
const bg = elementGeometry(bd);
const bp = elementParts(bg, body);
assert(bp[1].shape === "lathe" && bp[1].at.z === 900 && Math.abs(bp[1].at.x - 800 + bg.box.w / 2 - 600) < 1e-6, "a revolved part is a lathe at its centre, at its z");
const prof = (bp[1] as { profile: { r: number; z: number }[] }).profile;
assert(Math.abs(prof[0].r - 50) < 1e-6 && Math.abs(prof[1].r - 200) < 1e-6 && prof[1].z === 300, `…turned from the fractions in the piece's millimetres (${JSON.stringify(prof)})`);

// Proving item 3 (Stage 3): the pergola — its roof line builds nothing; every post, beam and slat
// the repeats laid is a body of its own at its part's z and height.
const pergola = row({
  dimensions: { widthMm: 4000, depthMm: 4000, heightMm: 2500 },
  resize: { stepMm: 100, width: { minMm: 1000, maxMm: 12000 }, depth: { minMm: 1000, maxMm: 12000 } },
  appearance: {
    shape: "rect",
    content: "none",
    body: "none",
    parts: [
      { id: "post", shape: "rect", widthMm: 120, depthMm: 120, x: 0, y: 0, rotation: 0, heightMm: 2200, repeat: { along: "corners" } },
      { id: "beam", shape: "rect", widthMm: 1000, depthMm: 150, x: 0, y: 0, rotation: 0, zMm: 2200, heightMm: 200, repeat: { along: "edges" } },
      { id: "slat", shape: "rect", widthMm: 50, depthMm: 1000, x: 0, y: 0, rotation: 0, zMm: 2400, heightMm: 100, repeat: { along: "row", spacingMm: 300, axis: "x", marginMm: 150 } },
    ],
  },
});
// The room is handed the placement's footprint — the plan's own composition, copies and all.
const pb = elementBody(pergola, sizedFootprint(pergola), body)!;
assert(pb !== null && pb.parts.length === 4 + 4 + 13, `the pergola is 21 bodies and no roof slab (${pb?.parts.length})`);
assert(
  pb.parts.slice(0, 4).every((p) => p.shape === "extrude" && p.h === 2200 && p.at.z === 0) && pb.parts.slice(4, 8).every((p) => p.shape === "extrude" && p.at.z === 2200 && p.h === 200),
  "…posts 2.2 m from the floor, beams on them",
);
const pbWide = elementBody(pergola, sizedFootprint(pergola, { widthMm: 6000, depthMm: 4000 }), body)!;
assert(pbWide !== null && pbWide.parts.length === 4 + 4 + 19, `laid 6 × 4 it is four posts, four beams and nineteen slats (${pbWide?.parts.length})`);
console.log("scene element-body self-check passed");
