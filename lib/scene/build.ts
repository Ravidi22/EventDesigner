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
import { chairStyleOf, curtainStyleOf, symbolOf } from "@/lib/catalog/symbols";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import { hangHeightOf } from "@/lib/studio/hang";
import { resolveSpan } from "@/lib/studio/anchor";
import { rugShapeOf } from "@/lib/studio/rug-shape";
import { carpetFootprint, carpetShape } from "@/lib/studio/cover";
import { pointInPolygon } from "@/lib/venues/faces";
import { footprintPolygons } from "@/lib/studio/proximity";
import type { StructureFeature } from "@/lib/venues/structure";
import { CURTAIN_FILL, curtainLines, curtainOf, curtainPieces } from "@/lib/venues/curtain";
import { isRailed, offsetPath, railLines, railOf, sketchRailContext } from "@/lib/studio/rail";
import type { Placement } from "@/lib/design-document/types";
import type { Point } from "@/lib/studio/hall";
import { SceneCollector } from "./collect";
import { LED_COLOUR, isLedStrip, ledColour, ledLines, ledRail } from "@/lib/venues/led";
import type { RailLine } from "@/lib/studio/rail";
import { SCREEN_FRAME, ledStripBody, screenBody, stripBaseMm } from "./led";
import { envelopeNodes } from "./envelope";
import { elevationOf, RUG_MM, type Elevation } from "./elevation";
import { roomTransform } from "./frame";
import { chairRequest, itemBody } from "./items";
import { type ItemContext } from "./item-context";
import { floorKindBody, rugBody } from "./floor-kinds";
import { danceFloorBody } from "./dance-floor";
import { hexOf } from "./materials";
import { ceilingUndersideMm, curtainBody, hungFlowersBody } from "./overhead";
import { ceilingDrapeBody, sailBody } from "./overhead";
import { clothView } from "@/lib/studio/ceiling-cloth";
import { chairSpecOf, itemContextOf, tableNodes, topsOf } from "./tables";
import { stageNodes, venueStageNodes, type StageOpts } from "./stage";
import { type Scene, type SceneInput, WALL_THICK_MM, transform, vec3 } from "./types";
import type { StagePlacement } from "@/lib/design-document/stage";
import { roofHeightAt, sketchPergolas } from "@/lib/venues/roofs";

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
    else if (f.kind === "curtain") venueCurtain(input, out, f);
    else venueClimb(input, out, f);
  }
  // The venue's own LED (spec 2026-11-07 §7.3): a strip along its rail, a screen on what is under it.
  for (const f of input.structure.features) {
    if (f.kind === "led") venueLed(input, out, f);
    else if (f.kind === "screen") venueScreen(out, f, elevation);
  }
  // What a hanging thing hangs from (lib/venues/roofs.ts): the roofed zone it is in, else the
  // building, else the venue's pergola, else a hired one in this sketch — never "the tallest ceiling
  // anywhere on the plan", which gave a chandelier on the open terrace a chain to the hall's roof.
  const roofOf = roofHeightAt(input.structure, input.plan.all, sketchPergolas(input.doc.placements, (v) => resolve(v)?.product));
  const tables = new Map(input.doc.tables.map((t) => [t.id, t]));
  tableNodes(input, out, (tableId) => {
    const t = tables.get(tableId);
    return t ? elevation.floorUnder(topsOf(t)) : 0;
  });
  for (const p of input.doc.placements) {
    if (p.tableId || p.layer === "table") continue; // on a table: tables.ts drew it
    // An LED strip rides a rail as a drape does, and is built as light, not cloth (./led.ts).
    if (isLedStrip(resolve(p.variantId)?.product)) {
      ledStrip(input, out, p);
      continue;
    }
    if (isRailed(p) && ceilingCloth(input, out, p)) continue; // a sail or a ceiling drape
    if (isRailed(p)) curtain(input, out, p);
    else if (p.perch) perched(input, out, p, elevation);
    else if (p.layer === "ceiling") ceilingPlacement(input, out, p, roofOf(p.position));
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
  if (product?.category === "rugs" || product?.category === "dance-floors") {
    // The rug's own top is what floorZ reads under it; its base is a rug lower. A carpet laid to an
    // outline (over a stage, a lawn — lib/studio/cover.ts) is read by its whole footprint, as anything
    // standing on a platform is: its middle may be over a hole, or in a ring's hollow.
    const carpet = carpetShape(p);
    const z = (carpet ? elevation.floorUnder(footprintPolygons(carpetFootprint(carpet), p.position, p.rotation ?? 0), p.id) : elevation.floorZ(p.position)) - RUG_MM;
    // A dance floor lies the same way, as its gloss panels (./dance-floor.ts).
    const laid = { ...ctx, rug: rugShapeOf(p), ...(carpet ? { carpet } : {}) };
    out.item(p.id, { type: "item", id: p.id, label: product.name }, product.category === "dance-floors" ? danceFloorBody(laid) : rugBody(laid), roomTransform(p, Math.max(0, z)));
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

/** A curtain on its RAIL (lib/studio/rail.ts — the canvas's own reading), as a pleated ribbon in the
 *  row's style and drop. On a WALL: along the wall a hand off its room face (round the bow of a curved
 *  one), from the room's ceiling — or the wall's own typed height when lower (Wall.heightMm) — or the
 *  row's height under open sky. On a SIDE: a hand off the thing's face on the side it hangs, from the
 *  thing's height. On a ROD: under the rod at its height, the rod on its posts. */
/** A SAIL or a CEILING DRAPE (lib/studio/ceiling-cloth.ts — the canvas's own reading of its rail): a
 *  sagging sheet on its ties and its own poles, or a swag per run, in the row's shade. False when the
 *  placement is not one (a curtain, an LED strip), for the caller to go on. */
function ceilingCloth(input: SceneInput, out: SceneCollector, p: Placement): boolean {
  const rail = railOf(p);
  const resolved = resolve(p.variantId);
  const view = rail ? clothView(resolved?.product.category, rail, sketchRailContext(input.doc, input.structure, input.structure, (v) => resolve(v)?.product)) : null;
  if (!view) return false;
  const product = resolved?.product;
  const colour = hexOf(resolved?.swatch) ?? hexOf(product?.appearance?.style?.fill) ?? (view.kind === "sail" ? "#f4f1ea" : "#f3ede2");
  const tag = { type: "item" as const, id: p.id, label: product?.name };
  if (view.kind === "sail") {
    if (view.sheet) out.item(p.id, tag, sailBody(view.sheet, colour), transform(vec3(0, 0, 0), 0));
  } else if (view.runs.length) out.item(p.id, tag, ceilingDrapeBody(view.runs, colour), transform(vec3(0, 0, 0), 0));
  return true;
}

function curtain(input: SceneInput, out: SceneCollector, p: Placement): void {
  const rail = railOf(p);
  const line = rail ? railLines(rail, sketchRailContext(input.doc, input.structure, input.structure, (v) => resolve(v)?.product))[0] : undefined;
  if (!rail || !line) return;
  const resolved = resolve(p.variantId);
  const product = resolved?.product;
  const colour = hexOf(resolved?.swatch) ?? hexOf(product?.appearance?.style?.fill) ?? "#f3ede2";
  const opts = { style: curtainStyleOf(product), dropMm: p.dropMm, posts: line.posts };
  const tag = { type: "item" as const, id: p.id };
  if (line.wall) {
    const track = line.wall.track;
    // The wall at the run's middle — out on the bow of a curved wall — and its normal there.
    const { p: mid, n } = track.at((line.wall.t0 + line.wall.t1) / 2);
    const off = WALL_THICK_MM / 2 + CURTAIN_OFF_WALL_MM;
    // Which side is the room: the side a zone lies on; the wall's centre line when neither does.
    const zoneAt = (q: Point) => input.plan.all.find((z) => z.boundary.length >= 3 && pointInPolygon(q, z.boundary));
    const plus = { x: mid.x + n.x * off, y: mid.y + n.y * off };
    const minus = { x: mid.x - n.x * off, y: mid.y - n.y * off };
    const zonePlus = zoneAt(plus);
    const zoneMinus = zoneAt(minus);
    const sign = zonePlus ? 1 : zoneMinus ? -1 : 0;
    const zone = (zonePlus ?? zoneMinus)?.zone;
    // Along the wall itself, a hand off its room face — round the bow on a curved one.
    const path = track.path(line.wall.t0, line.wall.t1, off * sign);
    const topMm = wallCurtainTop(zone?.ceilingHeightMm, wallTypedHeight(input, line.wall.wallId)) ?? (product?.dimensions.heightMm || 3000);
    out.item(p.id, { type: "item", id: p.id, label: product?.name }, curtainBody(path, topMm, colour, tag, opts), transform(vec3(0, 0, 0), 0));
    return;
  }
  // A side's cloth stands a hand off the thing's face, on the side it hangs; a rod's under it.
  const path = line.hang ? offsetPath(line.path, CURTAIN_OFF_WALL_MM * line.hang) : line.path;
  const topMm = line.topMm && line.topMm > 0 ? line.topMm : product?.dimensions.heightMm || 3000;
  out.item(p.id, { type: "item", id: p.id, label: product?.name }, curtainBody(path, topMm, colour, tag, opts), transform(vec3(0, 0, 0), 0));
}

/** A WALL's own typed height (Wall.heightMm), when it has one. */
function wallTypedHeight(input: SceneInput, wallId: string): number | undefined {
  const h = input.structure.walls.find((w) => w.id === wallId)?.heightMm;
  return h !== undefined && h > 0 ? h : undefined;
}

/** Where a curtain on a wall hangs from: the LOWER of the room's ceiling and the wall's own typed
 *  height — a curtain is never taller than the wall it hangs on, nor than the room. Open sky (a
 *  ceiling of 0) and no typed height: undefined, the caller's own fallback. */
export function wallCurtainTop(ceilingMm: number | undefined, wallMm: number | undefined): number | undefined {
  const tops = [ceilingMm && ceilingMm > 0 ? ceilingMm : undefined, wallMm && wallMm > 0 ? wallMm : undefined].filter((v): v is number => v !== undefined);
  return tops.length ? Math.min(...tops) : undefined;
}

/** The venue's own curtain (a feature of kind `curtain`, lib/venues/curtain.ts): the same body a
 *  hired drape gets, in its cloth, style and drop. On a WALL: along its stretch on the side it hangs,
 *  from the ceiling of the zone on that side — or the wall's own typed height when lower — its own
 *  height under open sky, else 3 m, in the pieces its doors leave it. On a side or a rod, as a hired
 *  drape is. */
function venueCurtain(input: SceneInput, out: SceneCollector, f: StructureFeature): void {
  const colour = hexOf(f.style?.fill) ?? CURTAIN_FILL;
  const tag = { type: "feature" as const, id: f.id, label: f.label };
  const opts = { style: f.curtain?.style, dropMm: f.curtain?.dropMm };
  const c = curtainOf(f);
  if (!c) {
    // On a side or a rod (curtainLines reads the rail against the venue's own features).
    curtainLines(input.structure, f).forEach((line, i) => {
      const path = line.hang ? offsetPath(line.path, CURTAIN_OFF_WALL_MM * line.hang) : line.path;
      const topMm = line.topMm && line.topMm > 0 ? line.topMm : f.heightMm > 0 ? f.heightMm : 3000;
      out.item(`feature:${f.id}:${i}`, tag, curtainBody(path, topMm, colour, tag, { ...opts, posts: line.posts }), transform(vec3(0, 0, 0), 0));
    });
    return;
  }
  const span = resolveSpan(input.structure, c);
  if (!span) return;
  const off = (WALL_THICK_MM / 2 + CURTAIN_OFF_WALL_MM) * c.side;
  const at = span.track.at((span.t0 + span.t1) / 2);
  const mid = { x: at.p.x + at.n.x * off, y: at.p.y + at.n.y * off };
  const zone = input.plan.all.find((z) => z.boundary.length >= 3 && pointInPolygon(mid, z.boundary))?.zone;
  const topMm = wallCurtainTop(zone?.ceilingHeightMm, wallTypedHeight(input, c.wallId)) ?? (f.heightMm > 0 ? f.heightMm : 3000);
  // In the pieces its doors leave it (curtainPieces): a doorway stays bare in the room too. Each
  // piece along the wall itself, round the bow of a curved one.
  curtainPieces(input.structure, f).forEach((pc, i) => {
    const path = span.track.path(pc.t0, pc.t1, off);
    out.item(`feature:${f.id}:${i}`, tag, curtainBody(path, topMm, colour, tag, opts), transform(vec3(0, 0, 0), 0));
  });
}

/** A strip's lines in the room, each at the height its light runs (./led.ts): on a WALL a hand off the
 *  wall's face on its side, at the rail's typed height (0 = the floor line; absent = just under the
 *  wall's top — the room's ceiling or the wall's own typed height, as a curtain's); on a SIDE just
 *  proud of the thing's face, just under its top (a deck's edge, a counter's); a RUN where drawn. */
function stripLines(input: SceneInput, lines: RailLine[], wallHeightMm: number | undefined): { path: Point[]; z: number }[] {
  return lines.map((line) => {
    if (line.wall) {
      const off = (WALL_THICK_MM / 2 + 6) * (line.hang || 1);
      const path = line.wall.track.path(line.wall.t0, line.wall.t1, off);
      if (wallHeightMm !== undefined) return { path, z: stripBaseMm(wallHeightMm, false) };
      const { p: mid, n } = line.wall.track.at((line.wall.t0 + line.wall.t1) / 2);
      const q = { x: mid.x + n.x * off * 2, y: mid.y + n.y * off * 2 };
      const zone = input.plan.all.find((z) => z.boundary.length >= 3 && pointInPolygon(q, z.boundary))?.zone;
      const top = wallCurtainTop(zone?.ceilingHeightMm, wallTypedHeight(input, line.wall.wallId)) ?? 2400;
      return { path, z: stripBaseMm(top, true) };
    }
    if (line.side) return { path: line.hang ? offsetPath(line.path, 8 * line.hang) : line.path, z: stripBaseMm(line.topMm ?? 0, true) };
    return { path: line.path, z: stripBaseMm(line.topMm ?? 0, false) };
  });
}

/** A hired LED strip on its rail (spec §7.1), glowing in its shade. */
function ledStrip(input: SceneInput, out: SceneCollector, p: Placement): void {
  const rail = railOf(p);
  if (!rail) return;
  const lines = railLines(rail, sketchRailContext(input.doc, input.structure, input.structure, (v) => resolve(v)?.product));
  const resolved = resolve(p.variantId);
  const colour = hexOf(resolved?.swatch) ?? hexOf(resolved?.product.appearance?.style?.fill) ?? LED_COLOUR;
  const tag = { type: "item" as const, id: p.id, label: resolved?.product.name };
  stripLines(input, lines, rail.type === "wall" ? rail.heightMm : undefined).forEach((s, i) => out.item(i ? `${p.id}:${i}` : p.id, tag, ledStripBody(s.path, s.z, colour), transform(vec3(0, 0, 0), 0)));
}

/** The venue's own strip (a feature of kind `led`, lib/venues/led.ts) — the hired strip's body. */
function venueLed(input: SceneInput, out: SceneCollector, f: StructureFeature): void {
  const rail = ledRail(f);
  const tag = { type: "feature" as const, id: f.id, label: f.label };
  const colour = hexOf(ledColour(f)) ?? LED_COLOUR;
  stripLines(input, ledLines(input.structure, f), rail?.type === "wall" ? rail.heightMm : undefined).forEach((s, i) =>
    out.item(`feature:${f.id}:${i}`, tag, ledStripBody(s.path, s.z, colour), transform(vec3(0, 0, 0), 0)),
  );
}

/** The venue's own screen (a feature of kind `screen`): the catalog screen's body standing on what is
 *  under it, its front (+y) turned with it. */
function venueScreen(out: SceneCollector, f: StructureFeature, elevation: Elevation): void {
  const footprint: Footprint = { kind: "rect", widthMm: f.widthMm, depthMm: f.depthMm };
  const z = elevation.floorUnder(footprintPolygons(footprint, { x: f.x, y: f.y }, f.rotationDeg ?? 0, false, 1));
  const build = screenBody({ widthMm: f.widthMm, depthMm: f.depthMm, heightMm: f.heightMm, tone: hexOf(f.style?.fill) ?? SCREEN_FRAME });
  out.item(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, build, roomTransform({ position: { x: f.x, y: f.y }, rotation: f.rotationDeg ?? 0 }, z));
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
