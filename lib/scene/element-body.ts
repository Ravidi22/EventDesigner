// AN ELEMENT'S BODY — the room reads the element model (lib/element, docs/superpowers/specs/
// 2026-11-07-element-model-design.md §3): every part of a definition stood up at its own z and
// height, each in its own surface. The first customer is the ADR-5 fallback (./item-context.ts):
// an item with no picture of its own used to be its footprint extruded to the row's height in one
// material; now it is its parts — a hollow band in marble beside a timber end, a shelf a metre up
// the back-bar — and a row with no heights of its own builds exactly what it did.
//
// Pure. Run: npm run check:scene-element
import type { Product } from "@/lib/catalog/types";
import { buildHollow, footprintBounds, footprintOutlines, frontBand, frontFace, sizedFootprint, type Footprint } from "@/lib/studio/footprint";
import { definitionOf, elementSizeOf } from "@/lib/element/adapter";
import { revolveProfileMm } from "@/lib/element/revolve";
import { elementGeometry, flat, sameFootprint, type ElementGeometry, type ResolvedPart } from "@/lib/element/geometry";
import type { ElementDefinition } from "@/lib/element/types";
import { isMain } from "../self-check";
import type { ItemBuild } from "./collect";
import { type MaterialRef, type Part, vec3 } from "./types";

/** How thick a shape drawn as lines only stands in the room — a rope, a rail, a hedge-line. */
export const LINE_WALL_MM = 40;
/** The least a part rises: a sheet laid flat still has a top to see. */
const MIN_PART_MM = 10;

/** A part's own material: its texture or picture over its own colour, else `body`'s; none when it has
 *  neither a surface nor a colour of its own (the body's material is used). */
function partMaterial(p: ResolvedPart, body: MaterialRef): MaterialRef | undefined {
  const s = p.part.surface;
  const colour = p.part.colour;
  if (!s && !colour) return undefined;
  const m: MaterialRef = { colour: colour ?? body.colour, kind: body.kind };
  if (s?.textureImage?.url) m.image = s.textureImage;
  else if (s?.texture) m.texture = s.texture;
  return m.image || m.texture || colour ? m : undefined;
}

/** The outlines a part is built from: its pieces, a lines-only one as a thin wall along its lines
 *  (its closing side left out, as the plan leaves it out). */
function solids(p: ResolvedPart) {
  return p.pieces.flatMap((o) => (o.open ? buildHollow(o, { bandMm: LINE_WALL_MM, openSides: [o.outline.length - 1] }) : [o]));
}

/** The parts of `geometry` as 3D parts in the element's frame, bottom at each part's z. */
export function elementParts(geometry: ElementGeometry, body: MaterialRef): Part[] {
  const out: Part[] = [];
  for (const p of geometry.parts) {
    const op = p.part.op;
    // An outline only (a pergola's roof line): the plan's, never the room's.
    if (op.kind === "none") continue;
    const material = partMaterial(p, body);
    if (op.kind === "panel") {
      out.push(...panelParts(p, op, material));
      continue;
    }
    const h = Math.max(MIN_PART_MM, p.heightMm);
    for (const outline of solids(p)) {
      if (op.kind === "revolve") {
        // The side profile turned about the piece's centre — a bowl, a basin, a baluster: the
        // fractions read against the piece as it stands (its half-width the rim, `h` the top), an
        // ellipse the same body stretched along y.
        const b = footprintBounds({ kind: "custom", outline: outline.outline, ...(outline.edgeCurves ? { edgeCurves: outline.edgeCurves } : {}) });
        const xs = outline.outline.map((v) => v.x);
        const ys = outline.outline.map((v) => v.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const part: Part = { shape: "lathe", profile: revolveProfileMm(op.profile, b.w / 2, h), at: vec3(cx, cy, p.zMm) };
        if (b.w && b.h && Math.abs(b.w - b.h) > 1) part.scaleY = b.h / b.w;
        if (material) part.material = material;
        out.push(part);
        continue;
      }
      const part: Part = op.kind === "sheet" ? { shape: "plane", outline, at: vec3(0, 0, p.zMm) } : { shape: "extrude", outline, h, at: vec3(0, 0, p.zMm) };
      if (material) part.material = material;
      out.push(part);
    }
  }
  return out;
}

/** A front shape's panel (lib/element/front.ts): its face pushed back, standing on its plan band —
 *  the band's own frame found from where its first corner landed in the element's frame (the band is
 *  turned about its box centre and moved to the part's place, then the lot is centred), so the panel
 *  stands exactly on what the plan draws. */
function panelParts(p: ResolvedPart, op: Extract<ResolvedPart["part"]["op"], { kind: "panel" }>, material: MaterialRef | undefined): Part[] {
  const face = frontFace(p.part.profile.shape, { ...p.part.profile, faceTurnDeg: op.faceTurnDeg });
  const band = frontBand(face.w, op.thicknessMm, op.bendDeg);
  const turn = ((p.part.rotation || 0) * Math.PI) / 180;
  return p.pieces.map((piece) => {
    const c0 = band.outline[0];
    const q0 = piece.outline[0];
    const cx = q0.x - (c0.x * Math.cos(turn) - c0.y * Math.sin(turn));
    const cy = q0.y - (c0.x * Math.sin(turn) + c0.y * Math.cos(turn));
    const part: Part = {
      shape: "panel",
      face: face.pieces,
      widthMm: face.w,
      faceHeightMm: face.h,
      thicknessMm: op.thicknessMm,
      bendDeg: op.bendDeg,
      at: vec3(cx, cy, p.zMm),
      ...(p.part.rotation ? { rotDeg: p.part.rotation } : {}),
    };
    if (material) part.material = material;
    return part;
  });
}

/** The definition's geometry at the size the item is drawn at, when the element model agrees
 *  with the footprint the room was handed — a placement whose footprint is overridden (a carpet laid
 *  to an outline, a runner's trimmed strip) is not the row's element and gets null. */
export function elementOf(product: Product | undefined, footprint: Footprint): { definition: ElementDefinition; geometry: ElementGeometry } | null {
  if (!product) return null;
  const definition = definitionOf(product);
  // A placement's size is whole millimetres (clampSize); the box read back off a composed footprint
  // may be a hair off (a beam turned 90° through sin/cos), so it is rounded before the element is
  // sized again — otherwise the two readings differ by 1e-12 and the room falls back to an extrude.
  const b = footprintBounds(footprint);
  const catalog = elementGeometry(definition);
  const same = (g: ElementGeometry) => (sameFootprint(g.footprint, footprint) ? g : null);
  const geometry = same(catalog) ?? same(elementGeometry(definition, elementSizeOf(product, { widthMm: Math.round(b.w), depthMm: Math.round(b.h) })));
  return geometry ? { definition, geometry } : null;
}

/** A category's recipe meets the element model: the shapes that SAID something about their bodies
 *  (ElementPart.own — a shelf a metre up, a raised tier) built by the model, and the footprint of
 *  the rest handed back for the recipe to draw as it always did (a table's top, its legs, its
 *  cloth). The rest keeps its place in the element's frame. Null when nothing is the model's. */
export function ownBodyParts(product: Product | undefined, footprint: Footprint, body: MaterialRef, opts: { baseProfileIsPicture?: boolean } = {}): { parts: Part[]; rest: Footprint } | null {
  const el = elementOf(product, footprint);
  if (!el) return null;
  // The base's own body of revolution is the model's too (a bowl on a table) — the user, 2026-11-07:
  // "the body you added is good but it doesn't combine with the drawing" — while the base's PIECES
  // stay in the rest: the recipe's picture stands on the item's footprint whatever stands at its
  // centre. Unless the PICTURE reads that profile itself (`baseProfileIsPicture` — a chandelier's
  // silhouette, lib/catalog/chandelier.ts): built here as well, it was a solid the size of the whole
  // piece with the picture inside it.
  const isOwn = (p: ResolvedPart) => !!p.part.own || (!opts.baseProfileIsPicture && p.index === 0 && p.part.op.kind === "revolve");
  if (!el.geometry.parts.some(isOwn)) return null;
  const own = { ...el.geometry, parts: el.geometry.parts.filter(isOwn) };
  const rest = el.geometry.parts.filter((p) => p.index === 0 || !p.part.own).flatMap((p) => p.pieces);
  return { parts: elementParts(own, body), rest: { kind: "multi", parts: rest } };
}

/** The fallback body through the element model: the item's parts, each in its own surface, on the
 *  body's material. Null when the element model does not describe this footprint. */
export function elementBody(product: Product | undefined, footprint: Footprint, body: MaterialRef): ItemBuild | null {
  const el = elementOf(product, footprint);
  if (!el) return null;
  return { parts: elementParts(el.geometry, body), material: body, instanced: [], emitters: [] };
}

if (isMain(import.meta.url)) {
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
}
