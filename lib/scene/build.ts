// The design document, the venue and the catalog → the scene. Pure: no React, no three, no DOM —
// `npm run check:scene` (./check.ts) builds the fixture (./fixture.ts) and asserts it. Spec §1.
//
// The order is the order things stand in: the envelope (floors, walls, ceilings — ./envelope.ts),
// then the tables with everything on them (./tables.ts), then what stands on the floor, then what
// hangs from the ceiling. Heights come from ./elevation.ts (a table on a stage stands on the deck),
// and every item's body from ./items.ts through the one `itemBody` seam, so a kind drawn better
// tomorrow is drawn better everywhere.
//
// The catalog must be primed before this runs (lib/catalog/storage.ts) — the printed map's rule.
// This module never reads a price: `Resolved.price`, `unitPrice`, the studio's cost and
// `supplierId` are not read anywhere under lib/scene (`check:costs` scans the folder), and the
// check proves the fixture's secret price never reaches the scene.
import { resolve, chairBlockOf, deckOf } from "@/lib/studio/catalog-resolver";
import { placementFootprint } from "@/components/footprint-shape";
import { catalogBox, footprintOutlines, type Footprint } from "@/lib/studio/footprint";
import { chairStyleOf, symbolOf } from "@/lib/catalog/symbols";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import { stageHeight } from "@/lib/design-document/stage";
import { hangHeightOf } from "@/lib/studio/hang";
import type { Placement } from "@/lib/design-document/types";
import { SceneCollector } from "./collect";
import { envelopeNodes } from "./envelope";
import { elevationOf, type Elevation } from "./elevation";
import { roomTransform } from "./frame";
import { chairRequest, itemBody } from "./items";
import { hexOf } from "./materials";
import { itemContextOf, tableNodes } from "./tables";
import { type Scene, type SceneInput, type MaterialRef, transform, vec3 } from "./types";

/** A ceiling item with no hang height of its own hangs this far under the ceiling (a chandelier
 *  clears a standing guest), or at this height when nothing above it is roofed. */
const HANG_UNDER_CEILING_MM = 1200;
const HANG_OPEN_SKY_MM = 3000;

export function buildScene(input: SceneInput): Scene {
  const out = new SceneCollector();
  const { roofedMm } = envelopeNodes(input, out);
  const elevation = elevationOf(input.doc, input.structure);
  const tables = new Map(input.doc.tables.map((t) => [t.id, t]));
  tableNodes(input, out, (tableId) => {
    const t = tables.get(tableId);
    return t ? elevation.floorZ(t.position) : 0;
  });
  for (const p of input.doc.placements) {
    if (p.tableId || p.layer === "table") continue; // on a table: tables.ts drew it
    if (p.layer === "ceiling") ceilingPlacement(input, out, p, roofedMm);
    else floorPlacement(input, out, p, elevation);
  }
  return { nodes: out.nodes(), bounds: input.plan.bounds, roofedMm, stats: out.stats() };
}

function floorPlacement(input: SceneInput, out: SceneCollector, p: Placement, elevation: Elevation): void {
  if (p.span) return; // TODO(B4): a curtain along its wall stretch
  if (p.perch) return; // TODO(B6): an item standing on a banquette
  const z = elevation.floorZ(p.position);
  if (p.stage) {
    // TODO(B1): decks, levels, flights, banquettes, skirt. Phase A: the outline as one slab.
    const material: MaterialRef = { colour: "#d9d3c7", kind: "matte", texture: "deck" };
    out.body(p.id, { type: "stage", id: p.id, label: "במה" }, material, [{ shape: "extrude", outline: { outline: p.stage.outline }, h: stageHeight(p.stage, deckOf), at: vec3(0, 0, 0) }], [roomTransform(p, z)]);
    return;
  }
  const block = p.rows ? chairBlockOf(p) : null;
  if (block) {
    const layout = chairRowsLayout(block.spec, block.chair);
    const r = resolve(p.variantId);
    const tone = hexOf(r?.swatch) ?? hexOf(block.product.appearance?.style?.fill) ?? DEFAULT_TONE.chair;
    const style = chairStyleOf(block.product) ?? "dining";
    const h = block.product.dimensions.heightMm || 900;
    const at = roomTransform(p, z);
    // Every chair faces the block's front (+y, row 1): a chair body's front is +y already.
    for (const c of layout.chairs) {
      out.instance(chairRequest(style, block.chair.widthMm, block.chair.depthMm, h, tone, transform(vec3(c.x, c.y, 0), 0), { type: "chair", id: p.id }), at);
    }
    return;
  }
  const resolved = resolve(p.variantId);
  const product = resolved?.product;
  const footprint: Footprint =
    resolved?.sizing === "stretch" && product
      ? { kind: "rect", ...(p.sizeMm ?? catalogBox(product)) }
      : placementFootprint(p);
  const kind = symbolOf(product, footprint);
  const ctx = itemContextOf(p, product, resolved, footprint, input.author);
  out.item(p.id, { type: kind === "flowers" ? "flowers" : "item", id: p.id, label: product?.name }, itemBody(kind, ctx), roomTransform(p, z));
}

function ceilingPlacement(input: SceneInput, out: SceneCollector, p: Placement, roofedMm: number | null): void {
  const resolved = resolve(p.variantId);
  const product = resolved?.product;
  const footprint = placementFootprint(p);
  const kind = symbolOf(product, footprint);
  const ctx = itemContextOf(p, product, resolved, footprint, input.author);
  // Its underside: the plan's hang height, else a guest's clearance under the ceiling. Spec §3.5.
  const z = hangHeightOf(p, product) ?? (roofedMm ? Math.max(roofedMm - HANG_UNDER_CEILING_MM, 0) : HANG_OPEN_SKY_MM);
  out.item(p.id, { type: "item", id: p.id, label: product?.name }, itemBody(kind, ctx), roomTransform(p, z));
}

/** How many closed outlines a footprint draws — the fixture's assertions count parts with it. */
export const outlineCount = (f: Footprint): number => footprintOutlines(f).length;
