// What stands on what. Nothing in the document stores an elevation: a table carried onto a stage
// is drawn above it on the plan by the floor stack (lib/design-document/stacking.ts), which is
// PAINT order, and the crew knows what that means. In 3D a table on a stage has to stand on the
// deck, so the height is read off geometry: a thing MOST of whose footprint lies on a platform
// stands on that platform's top (a raised level's, when on the level too); on a rug it stands a
// rug's thickness higher; perched on a banquette (Placement.perch) it stands on the banquette's
// top. Spec §3.8.
//
// "Most of its footprint", not "its centre" (Ravid, 2026-10-24: "object placed on top of stage
// should look above"): plan A's round podium stands in the mouth of a stage's curved front with its
// centre a hand inside the outline, and stood on the deck it floated 40cm over the dance floor.
// The platforms are every stage (the sketch's and the venue's, with their levels), a stage piece
// or a low wide item set down loose (a deck, a podium — `platformRow`), and the venue's own low
// built platforms (a מבנה 30–150cm high, the rule `takesEdgeItems` reads a platform by). A loose
// platform stands on whatever is under IT, so a podium on a stage tops out above the deck.
//
// Keep this the ONE reader of "how high is the floor here" — tables, free items and chair rings
// all ask it, and a perched item asks `perchOf`.
import type { Point } from "@/lib/studio/hall";
import type { Product } from "@/lib/catalog/types";
import { placementFootprint } from "@/components/footprint-shape";
import { footprintPolygons } from "@/lib/studio/proximity";
import { featureFootprint } from "@/lib/venues/structure";
import type { DesignDocumentContent, Placement, StageBuild } from "@/lib/design-document/types";
import { benchInRoom, edgeItemShape, stageHeight, toRoom, type StagePlacement } from "@/lib/design-document/stage";
import { BENCH_TOP_MM } from "@/lib/design-document/bench";
import { featureStage, type VenueStructure } from "@/lib/venues/structure";
import { pointInPolygon } from "@/lib/venues/faces";
import { deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { catalogBox } from "@/lib/studio/footprint";
import { turn } from "./frame";
import { rectOutline } from "@/lib/design-document/stage";
import { primeCatalog } from "@/lib/catalog/storage";
import { isMain } from "../self-check";

/** A rug is this much higher than the floor it lies on. */
export const RUG_MM = 12;
/** A thing stands on a platform when at least this share of its footprint is on it. */
export const ON_SHARE = 0.5;
/** A loose item is a platform to stand things on when it is this low and this wide both ways (a
 *  podium, a riser) — or a stage piece of any size. The venue's own built platforms follow
 *  lib/venues/stage-edges.ts `takesEdgeItems`: 30–150cm high, 1.2m across both ways. */
const PLATFORM_MAX_MM = 1200;
const PLATFORM_MIN_SIDE_MM = 800;
const VENUE_PLATFORM = { minH: 300, maxH: 1500, minSide: 1200 } as const;

interface Platform {
  id: string;
  outline: Point[];
  topMm: number;
}

/** Where a perched item stands: its room point along the banquette and the banquette's top. */
export interface Perch {
  at: Point;
  zMm: number;
  /** The banquette's direction on the plan, for the item's facing. */
  angleDeg: number;
}

export interface Elevation {
  /** The height of the floor under a point in the room: a stage's top, a level's, a rug's, else 0. */
  floorZ(p: Point): number;
  /** The floor under a FOOTPRINT (its outlines in the room): the highest platform that holds at
   *  least ON_SHARE of it, a rug's thickness more on a rug — never the thing's own top (`selfId`). */
  floorUnder(outlines: readonly Point[][], selfId?: string): number;
  /** The items perched on banquettes, spread along each as the canvas spreads them
   *  (canvas-stage.tsx perchedSpots); null for a perch whose banquette is gone. */
  perchOf(p: Placement): Perch | null;
  platforms: Platform[];
}

function stagePlatforms(id: string, p: StagePlacement, stage: StageBuild): Platform[] {
  const top = stageHeight(stage, deckOf);
  const out: Platform[] = [{ id, outline: stage.outline.map((q) => toRoom(p, q)), topMm: top }];
  for (const level of stage.levels ?? []) {
    out.push({ id: `${id}:${level.id}`, outline: level.outline.map((q) => toRoom(p, q)), topMm: level.heightMm });
  }
  return out;
}

/** A loose item that is something to stand on: a stage piece or a deck set down whole, or a low
 *  wide thing — a podium, a riser. Its height is its row's. */
export function platformRow(product: Product | undefined): boolean {
  if (!product) return false;
  const h = product.dimensions.heightMm ?? 0;
  if (product.category === "stages" || product.category === "stage-decks") return h > 0;
  if (product.category !== "other") return false;
  const box = catalogBox(product);
  return h > 0 && h <= PLATFORM_MAX_MM && Math.min(box.widthMm, box.depthMm) >= PLATFORM_MIN_SIDE_MM;
}

/** Points spread over a footprint (its outlines in the room): a grid inside it and its first
 *  outline's middle — what "how much of it is on that platform" is counted over. */
function samplesOf(outlines: readonly Point[][]): Point[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of outlines)
    for (const p of o) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  if (!Number.isFinite(minX)) return [];
  const out: Point[] = [];
  const N = 6;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const p = { x: minX + ((i + 0.5) / N) * (maxX - minX), y: minY + ((j + 0.5) / N) * (maxY - minY) };
      if (outlines.some((o) => pointInPolygon(p, o as Point[]))) out.push(p);
    }
  if (!out.length) out.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  return out;
}

/** A rug's rectangle where it lies in the room (the plan ignores a rug's mirror too). */
function rugOutline(p: Placement): Point[] | null {
  const product = resolve(p.variantId)?.product;
  if (!product || product.category !== "rugs") return null;
  const { widthMm, depthMm } = p.sizeMm ?? catalogBox(product);
  const corners: Point[] = [
    { x: -widthMm / 2, y: -depthMm / 2 },
    { x: widthMm / 2, y: -depthMm / 2 },
    { x: widthMm / 2, y: depthMm / 2 },
    { x: -widthMm / 2, y: depthMm / 2 },
  ];
  return corners.map((c) => {
    const t = turn(c, p.rotation ?? 0);
    return { x: p.position.x + t.x, y: p.position.y + t.y };
  });
}

export function elevationOf(doc: DesignDocumentContent, structure: VenueStructure): Elevation {
  const platforms: Platform[] = [];
  const rugs: Point[][] = [];
  const stages = new Map<string, StagePlacement>();
  const loose: Placement[] = [];
  for (const p of doc.placements) {
    if (p.stage) {
      stages.set(p.id, p as StagePlacement);
      platforms.push(...stagePlatforms(p.id, p as StagePlacement, p.stage));
      continue;
    }
    if (p.tableId || p.layer !== "floor" || p.perch || p.span) continue;
    const rug = rugOutline(p);
    if (rug) rugs.push(rug);
    else if (platformRow(resolve(p.variantId)?.product)) loose.push(p);
  }
  for (const f of structure.features) {
    if (f.kind !== "stage") continue;
    const stage = featureStage(f);
    const frame: StagePlacement = {
      id: f.id,
      variantId: "",
      layer: "floor",
      quantity: 1,
      position: { x: f.x, y: f.y },
      rotation: f.rotationDeg ?? 0,
      scale: 1,
      stage,
    } satisfies Placement & { stage: StageBuild };
    platforms.push(...stagePlatforms(`feature:${f.id}`, frame, stage));
  }
  // The venue's own low built platforms — a raised terrace, a dais built in.
  for (const f of structure.features) {
    if (f.kind !== "structure" && f.kind !== "other") continue;
    const h = f.heightMm || 0;
    if (h < VENUE_PLATFORM.minH || h > VENUE_PLATFORM.maxH || Math.min(f.widthMm, f.depthMm) < VENUE_PLATFORM.minSide) continue;
    for (const outline of footprintPolygons(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0)) platforms.push({ id: `feature:${f.id}`, outline, topMm: h });
  }

  const shareOn = (samples: readonly Point[], outline: Point[]) => samples.filter((q) => pointInPolygon(q, outline)).length / samples.length;
  const floorUnder = (outlines: readonly Point[][], selfId?: string): number => {
    const samples = samplesOf(outlines);
    if (!samples.length) return 0;
    let z = 0;
    for (const s of platforms) if (s.topMm > z && s.id !== selfId && shareOn(samples, s.outline) >= ON_SHARE) z = s.topMm;
    if (rugs.some((r) => shareOn(samples, r) >= ON_SHARE)) z += RUG_MM;
    return z;
  };
  // A loose platform stands on what is under it (a podium on a stage), in the document's order.
  for (const p of loose) {
    const product = resolve(p.variantId)?.product;
    const outlines = footprintPolygons(placementFootprint(p), p.position, p.rotation ?? 0, !!p.mirrored, p.scale || 1);
    const base = floorUnder(outlines, p.id);
    for (const outline of outlines) platforms.push({ id: p.id, outline, topMm: base + (product?.dimensions.heightMm ?? 0) });
  }

  // The items on one banquette spread evenly along it, in the order they were put there — the
  // canvas's rule (perchedSpots), so the room and the plan agree about which end a vase is at.
  const perchedByBench = new Map<string, Placement[]>();
  for (const p of doc.placements) {
    if (!p.perch) continue;
    const k = `${p.perch.stageId}|${p.perch.itemId}`;
    perchedByBench.set(k, [...(perchedByBench.get(k) ?? []), p]);
  }
  const perches = new Map<string, Perch>();
  for (const [k, list] of perchedByBench) {
    const [stageId, itemId] = k.split("|");
    const stage = stages.get(stageId);
    const bench = stage ? benchInRoom(stage, itemId, deckOf) : null;
    if (!stage || !bench) continue;
    const item = stage.stage.stairs?.find((x) => x.id === itemId);
    const shape = item ? edgeItemShape(stage.stage, item, deckOf) : null;
    // An outer banquette's top is BENCH_TOP_MM above the deck its chairs stand on; the shape
    // carries the real figure when the designer set one (lib/design-document/bench.ts).
    const zMm = stageHeight(stage.stage, deckOf) + (shape?.heightMm ?? BENCH_TOP_MM);
    list.forEach((p, i) => perches.set(p.id, { at: bench.along((i + 0.5) / list.length - 0.5), zMm, angleDeg: bench.angle }));
  }

  return {
    platforms,
    floorUnder,
    floorZ(p) {
      // A level lies inside its stage, so the HIGHEST platform containing the point wins; a rug on
      // a stage adds its thickness to the stage's top.
      let z = 0;
      for (const s of platforms) if (s.topMm > z && pointInPolygon(p, s.outline)) z = s.topMm;
      for (const r of rugs) {
        if (pointInPolygon(p, r)) {
          z += RUG_MM;
          break;
        }
      }
      return z;
    },
    perchOf(p) {
      return perches.get(p.id) ?? null;
    },
  };
}

// ponytail: self-check. Run: npx tsx lib/scene/elevation.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const podium: Product = { id: "podium", name: "פודיום עגול", category: "other", layer: "floor", dimensions: { diameterMm: 1500, heightMm: 300 }, categoryFields: {}, styleTags: [], variants: [] };
  const rug: Product = { id: "rug", name: "שטיח", category: "rugs", layer: "floor", dimensions: { widthMm: 3000, depthMm: 2000, heightMm: 10 }, categoryFields: {}, styleTags: [], variants: [] };
  const partition: Product = { id: "wall", name: "מחיצה", category: "other", layer: "floor", dimensions: { widthMm: 3000, depthMm: 100, heightMm: 2400 }, categoryFields: {}, styleTags: [], variants: [] };
  primeCatalog([podium, rug, partition]);
  const floor = (id: string, variantId: string, x: number, y: number): Placement => ({ id, variantId, layer: "floor", quantity: 1, position: { x, y }, rotation: 0, scale: 1 });
  const stage: Placement = { ...floor("s", "", 0, 0), stage: { outline: rectOutline(6000, 4000), front: 0, heightMm: 500, decks: [] } };
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [stage, floor("pod", "podium", 1500, 0), floor("rug", "rug", -1500, 0), floor("part", "wall", 0, 5000)],
  };
  const terrace = { id: "terrace", kind: "structure", label: "", x: 20000, y: 0, widthMm: 4000, depthMm: 4000, heightMm: 1000, shape: "rect", rotationDeg: 0 } as const;
  const el = elevationOf(doc, { nodes: [], walls: [], entrances: [], features: [terrace, { ...terrace, id: "tower", x: 30000, heightMm: 6000 }] });
  const square = (x: number, y: number, s = 400): Point[][] => [[{ x: x - s / 2, y: y - s / 2 }, { x: x + s / 2, y: y - s / 2 }, { x: x + s / 2, y: y + s / 2 }, { x: x - s / 2, y: y + s / 2 }]];
  assert(el.floorUnder(square(0, 1000)) === 500, "a thing on a stage stands on its deck");
  assert(el.floorUnder(square(0, 3000)) === 0, "…and off it, on the floor");
  assert(el.floorUnder(square(1500, 0)) === 800, "a thing on a podium on a stage stands on the podium's top: deck + podium");
  assert(el.floorUnder(square(1500, 0, 1500), "pod") === 500, "…and the podium itself stands on the deck, never on its own top");
  assert(el.floorUnder(square(-1500, 0)) === 500 + RUG_MM, "a rug on a stage adds its thickness");
  assert(el.floorUnder(square(-2950, 1500, 400)) === 500, "more than half on the deck: on it");
  assert(el.floorUnder(square(-3100, 1500, 400)) === 0, "a quarter on the deck: on the floor");
  assert(el.floorUnder(square(20000, 0)) === 1000 && el.floorUnder(square(30000, 0)) === 0, "a low built terrace is a floor; a tall building is not stood on");
  assert(el.floorUnder(square(0, 5000)) === 0, "a tall partition is not a platform");
  console.log("scene elevation ok");
}
