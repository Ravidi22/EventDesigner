// What stands on what. Nothing in the document stores an elevation: a table carried onto a stage
// is drawn above it on the plan by the floor stack (lib/design-document/stacking.ts), which is
// PAINT order, and the crew knows what that means. In 3D a table on a stage has to stand on the
// deck, so the height is read off geometry: a thing whose centre lies inside a stage's outline in
// the room stands on that stage's top (a raised level's, when inside the level too); inside a rug
// it stands a rug's thickness higher; perched on a banquette (Placement.perch) it stands on the
// banquette's top. Spec §3.8.
//
// Keep this the ONE reader of "how high is the floor here" — tables, free items and chair rings
// all ask it, and a perched item asks `perchOf`.
import type { Point } from "@/lib/studio/hall";
import type { DesignDocumentContent, Placement, StageBuild } from "@/lib/design-document/types";
import { benchInRoom, edgeItemShape, stageHeight, toRoom, type StagePlacement } from "@/lib/design-document/stage";
import { BENCH_TOP_MM } from "@/lib/design-document/bench";
import { featureStage, type VenueStructure } from "@/lib/venues/structure";
import { pointInPolygon } from "@/lib/venues/faces";
import { deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { catalogBox } from "@/lib/studio/footprint";
import { turn } from "./frame";

/** A rug is this much higher than the floor it lies on. */
export const RUG_MM = 12;

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
  for (const p of doc.placements) {
    if (p.stage) {
      stages.set(p.id, p as StagePlacement);
      platforms.push(...stagePlatforms(p.id, p as StagePlacement, p.stage));
      continue;
    }
    if (p.tableId || p.layer !== "floor" || p.perch || p.span) continue;
    const rug = rugOutline(p);
    if (rug) rugs.push(rug);
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
