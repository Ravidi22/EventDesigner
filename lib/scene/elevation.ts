// What stands on what. Nothing in the document stores an elevation: a table carried onto a stage
// is drawn above it on the plan by the floor stack (lib/design-document/stacking.ts), which is
// PAINT order, and the crew knows what that means. In 3D a table on a stage has to stand on the
// deck, so the height is read off geometry: a thing whose centre lies inside a stage's outline in
// the room stands on that stage's top (a raised level's, when inside the level too). Spec §3.8.
//
// Phase A: stages (a sketch's `Placement.stage` and the venue's `stage` features) and their
// levels. Phase B6 adds rugs (+12) and perches (a banquette's top). Keep this the ONE reader of
// "how high is the floor here" — tables, free items and chair rings all ask it.
import type { Point } from "@/lib/studio/hall";
import type { DesignDocumentContent, Placement, StageBuild } from "@/lib/design-document/types";
import { stageHeight, toRoom, type StagePlacement } from "@/lib/design-document/stage";
import { featureStage, type VenueStructure } from "@/lib/venues/structure";
import { pointInPolygon } from "@/lib/venues/faces";
import { deckOf } from "@/lib/studio/catalog-resolver";

interface Platform {
  id: string;
  outline: Point[];
  topMm: number;
}

export interface Elevation {
  /** The height of the floor under a point in the room: a stage's top, a level's, else 0. */
  floorZ(p: Point): number;
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

export function elevationOf(doc: DesignDocumentContent, structure: VenueStructure): Elevation {
  const platforms: Platform[] = [];
  for (const p of doc.placements) {
    if (p.stage) platforms.push(...stagePlatforms(p.id, p as StagePlacement, p.stage));
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
  return {
    platforms,
    floorZ(p) {
      // A level lies inside its stage, so the HIGHEST platform containing the point wins.
      let z = 0;
      for (const s of platforms) if (s.topMm > z && pointInPolygon(p, s.outline)) z = s.topMm;
      return z;
    },
  };
}
