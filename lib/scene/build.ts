// The design document, the venue and the catalog → the scene. Pure: no React, no three, no DOM —
// `npm run check:scene` (./check.ts) builds the fixture (./fixture.ts) and asserts it. Spec §1.
//
// The order is the order things stand in: the envelope (floors, walls, ceilings — ./envelope.ts),
// the venue's own flights and stages, then the tables with everything on them (./tables.ts), then
// what stands on the floor, then what hangs from the ceiling and along the walls. Heights come
// from ./elevation.ts (a table on a stage stands on the deck, a vase perched on a banquette on
// its top), and every item's body from ./items.ts through the one `itemBody` seam, so a kind drawn
// better tomorrow is drawn better everywhere.
//
// The catalog must be primed before this runs (lib/catalog/storage.ts) — the printed map's rule.
// This module never reads a price: `Resolved.price`, `unitPrice`, the studio's cost and
// `supplierId` are not read anywhere under lib/scene (`check:costs` scans the folder), and the
// check proves the fixture's secret price never reaches the scene.
import { resolve, chairBlockOf } from "@/lib/studio/catalog-resolver";
import { placementFootprint } from "@/components/footprint-shape";
import { catalogBox, type Footprint } from "@/lib/studio/footprint";
import { chairStyleOf, symbolOf } from "@/lib/catalog/symbols";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import { hangHeightOf } from "@/lib/studio/hang";
import { resolveSpan } from "@/lib/studio/anchor";
import { bowsOf } from "@/lib/studio/rug-shape";
import { pointInPolygon } from "@/lib/venues/faces";
import { footprintPolygons } from "@/lib/studio/proximity";
import type { StructureFeature } from "@/lib/venues/structure";
import type { Placement } from "@/lib/design-document/types";
import type { Point } from "@/lib/studio/hall";
import { SceneCollector } from "./collect";
import { envelopeNodes } from "./envelope";
import { elevationOf, RUG_MM, type Elevation } from "./elevation";
import { roomTransform } from "./frame";
import { chairRequest, itemBody } from "./items";
import { type ItemContext } from "./item-context";
import { floorKindBody, rugBody } from "./floor-kinds";
import { hexOf } from "./materials";
import { ceilingUndersideMm, curtainBody, hungFlowersBody } from "./overhead";
import { chairSpecOf, itemContextOf, tableNodes, topsOf } from "./tables";
import { stageNodes, venueStageNodes, type StageOpts } from "./stage";
import { type Scene, type SceneInput, WALL_THICK_MM, transform, vec3 } from "./types";
import type { StagePlacement } from "@/lib/design-document/stage";

/** A curtain hangs this far off the wall's face into the room. */
const CURTAIN_OFF_WALL_MM = 60;
/** The venue's flights and ramps, which have no catalog row to colour them. */
const VENUE_CLIMB_TONE = "#faf9fd";

export function buildScene(input: SceneInput): Scene {
  const out = new SceneCollector();
  // What stands on what first: a venue's planter under a sketch stage stands on its deck too.
  const elevation = elevationOf(input.doc, input.structure);
  const { roofedMm } = envelopeNodes(input, out, elevation.floorUnder);
  for (const f of input.structure.features) {
    if (f.kind === "stage") venueStageNodes(f, out, stageOpts(input));
    else venueClimb(input, out, f);
  }
  const tables = new Map(input.doc.tables.map((t) => [t.id, t]));
  tableNodes(input, out, (tableId) => {
    const t = tables.get(tableId);
    return t ? elevation.floorUnder(topsOf(t)) : 0;
  });
  for (const p of input.doc.placements) {
    if (p.tableId || p.layer === "table") continue; // on a table: tables.ts drew it
    if (p.span) curtain(input, out, p);
    else if (p.perch) perched(input, out, p, elevation);
    else if (p.layer === "ceiling") ceilingPlacement(input, out, p, roofedMm);
    else floorPlacement(input, out, p, elevation);
  }
  return { nodes: out.nodes(), bounds: input.plan.bounds, roofedMm, stats: out.stats() };
}

/** What every stage is built with: the room's walls (which edges hug one), who is looking, the
 *  studio's default chair for its banquettes, and the railing rule. */
function stageOpts(input: SceneInput): StageOpts {
  return { structure: input.structure, author: input.author, chair: chairSpecOf({}), railingAboveMm: input.railingAboveMm ?? null };
}

/** A placement's catalog row, picture kind and item context — the one way every kind is asked. */
function contextOf(input: SceneInput, p: Placement, footprint?: Footprint) {
  const resolved = resolve(p.variantId);
  const product = resolved?.product;
  const fp: Footprint =
    footprint ??
    (resolved?.sizing === "stretch" && product ? { kind: "rect", ...(p.sizeMm ?? catalogBox(product)) } : placementFootprint(p));
  const kind = symbolOf(product, fp);
  const ctx = itemContextOf(p, product, resolved, fp, input.author);
  return { resolved, product, footprint: fp, kind, ctx };
}

function tagOf(kind: string | null, p: Placement, label: string | undefined) {
  return { type: kind === "flowers" ? ("flowers" as const) : ("item" as const), id: p.id, label };
}

function floorPlacement(input: SceneInput, out: SceneCollector, p: Placement, elevation: Elevation): void {
  if (p.stage) {
    // A stage stands on the venue floor: its own outline is not a platform under itself.
    stageNodes(p as StagePlacement, out, stageOpts(input));
    return;
  }
  /** The floor under this placement drawn at `fp`: what most of it stands on. */
  const floorOf = (fp: Footprint) => elevation.floorUnder(footprintPolygons(fp, p.position, p.rotation ?? 0, !!p.mirrored, p.scale || 1), p.id);
  const block = p.rows ? chairBlockOf(p) : null;
  if (block) {
    const z = floorOf(placementFootprint(p));
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
  const { product, kind, ctx, footprint } = contextOf(input, p);
  if (product?.category === "rugs") {
    // The rug's own top is what floorZ reads under it; its base is a rug lower.
    const z = elevation.floorZ(p.position) - RUG_MM;
    out.item(p.id, { type: "item", id: p.id, label: product.name }, rugBody({ ...ctx, bows: bowsOf(p) }), roomTransform(p, Math.max(0, z)));
    return;
  }
  out.item(p.id, tagOf(kind, p, product?.name), itemBody(kind, ctx), roomTransform(p, floorOf(footprint)));
}

/** A design item standing on a banquette: where the plan spreads it along the strip, on its top. */
function perched(input: SceneInput, out: SceneCollector, p: Placement, elevation: Elevation): void {
  const perch = elevation.perchOf(p);
  if (!perch) return; // its banquette is gone: the plan draws nothing either
  const { product, kind, ctx } = contextOf(input, p);
  out.item(p.id, tagOf(kind, p, product?.name), itemBody(kind, ctx), transform(vec3(perch.at.x, perch.at.y, perch.zMm), p.rotation ?? 0, p.mirrored, p.scale));
}

function ceilingPlacement(input: SceneInput, out: SceneCollector, p: Placement, roofedMm: number | null): void {
  const { product, kind, ctx } = contextOf(input, p);
  // Its underside: the plan's hang height, else a guest's clearance under the ceiling. Spec §3.5.
  const z = hangHeightOf(p, product) ?? ceilingUndersideMm(roofedMm, ctx.heightMm);
  // The chain reaches from the item's top to the ceiling; open sky hangs from nothing.
  const top = z + ctx.heightMm;
  if (roofedMm && roofedMm > top) ctx.chainMm = roofedMm - top;
  const build = kind === "flowers" || kind === "centerpiece" ? hungFlowersBody(ctx) : itemBody(kind, ctx);
  out.item(p.id, tagOf(kind, p, product?.name), build, roomTransform(p, z));
}

/** A curtain along its wall stretch (resolveSpan — the canvas's own reading of a span), hung a
 *  hand off the wall's room face, from the room's ceiling (or the row's drop under open sky). */
function curtain(input: SceneInput, out: SceneCollector, p: Placement): void {
  const span = p.span ? resolveSpan(input.structure, p.span) : null;
  if (!span) return;
  const resolved = resolve(p.variantId);
  const product = resolved?.product;
  const dx = span.to.x - span.from.x;
  const dy = span.to.y - span.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / len, y: dx / len };
  const mid = { x: (span.from.x + span.to.x) / 2, y: (span.from.y + span.to.y) / 2 };
  const off = WALL_THICK_MM / 2 + CURTAIN_OFF_WALL_MM;
  // Which side is the room: the side a zone lies on; the wall's centre line when neither does.
  const zoneAt = (q: Point) => input.plan.all.find((z) => z.boundary.length >= 3 && pointInPolygon(q, z.boundary));
  const plus = { x: mid.x + n.x * off, y: mid.y + n.y * off };
  const minus = { x: mid.x - n.x * off, y: mid.y - n.y * off };
  const zonePlus = zoneAt(plus);
  const zoneMinus = zoneAt(minus);
  const sign = zonePlus ? 1 : zoneMinus ? -1 : 0;
  const zone = (zonePlus ?? zoneMinus)?.zone;
  const path = [span.from, span.to].map((q) => ({ x: q.x + n.x * off * sign, y: q.y + n.y * off * sign }));
  const topMm = zone && zone.ceilingHeightMm > 0 ? zone.ceilingHeightMm : product?.dimensions.heightMm || 3000;
  const colour = hexOf(resolved?.swatch) ?? hexOf(product?.appearance?.style?.fill) ?? "#f3ede2";
  out.item(p.id, { type: "item", id: p.id, label: product?.name }, curtainBody(path, topMm, colour, { type: "item", id: p.id }), transform(vec3(0, 0, 0), 0));
}

/** The venue's own flight or ramp (a feature of kind `stairs`/`ramp`): the same body a rented one
 *  gets (./floor-kinds.ts), from the feature's size and the height it climbs. */
function venueClimb(input: SceneInput, out: SceneCollector, f: StructureFeature): void {
  if (f.kind !== "stairs" && f.kind !== "ramp") return;
  const footprint: Footprint = { kind: "rect", widthMm: f.widthMm, depthMm: f.depthMm };
  const ctx: ItemContext = {
    product: undefined,
    resolved: undefined,
    footprint,
    widthMm: f.widthMm,
    depthMm: f.depthMm,
    heightMm: f.heightMm,
    tone: hexOf(f.style?.fill) ?? VENUE_CLIMB_TONE,
    count: 1,
    climb: { heightMm: f.heightMm, reversed: f.climb?.reversed, risers: f.climb?.risers },
    author: input.author,
  };
  out.item(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, floorKindBody(f.kind, ctx), roomTransform({ position: { x: f.x, y: f.y }, rotation: f.rotationDeg ?? 0 }));
}
