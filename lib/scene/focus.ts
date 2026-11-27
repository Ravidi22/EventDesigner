// Where the studio's 3D pane stands to look at what is SELECTED on the sketch (app/(app)/studio/
// scene-preview.tsx). The תלת-ממד tab's table portrait (./viewpoints.ts tablePortraits) made
// general: a table — or a block, or an item standing on a table — is framed from the room's side a
// little above standing height, looking down at its top; a floor item at half its height, a stage
// at its deck, a chandelier at the height it hangs; several things from far enough back, and high
// enough, to hold them all. Pure, in plan mm with z up; `npm run check:scene-focus` holds the cases.
//
// The viewpoint's ID IS THE SELECTION (sorted ids): the pane flies when the id changes, so clicking
// another table flies there, and re-reading the same selection after an edit gives the same id —
// whether the camera follows a moved table is the pane's call (it re-flies past FOLLOW_MM), not a
// new viewpoint.
import type { Point } from "@/lib/studio/hall";
import { polygonCentroid, type Bounds } from "@/lib/studio/geometry";
import { pointInPolygon } from "@/lib/venues/faces";
import { featureFootprint, type VenueStructure } from "@/lib/venues/structure";
import type { ResolvedZone } from "@/lib/venues/zone";
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { resolve } from "@/lib/studio/catalog-resolver";
import { hangHeightOf } from "@/lib/studio/hang";
import { railOf } from "@/lib/studio/rail";
import { clothRuns, runLowestMm } from "@/lib/studio/ceiling-cloth";
import { roofAt } from "@/lib/venues/roofs";
import { ceilingUndersideMm } from "./overhead";
import { placementFootprint, tableBlock, tableFootprint } from "@/components/footprint-shape";
import { footprintBounds } from "@/lib/studio/footprint";
import { PORTRAIT_BACK_MM, PORTRAIT_EYE_MM, clampViewpoint, clearEye, type Sight } from "./viewpoints";
import { type Viewpoint, vec3 } from "./types";

/** What the sketch selects: canvas-stage's SelectionRef, by shape — lib never imports app. */
export interface FocusRef {
  kind: "table" | "placement" | "feature";
  id: string;
}

export interface FocusInput {
  doc: DesignDocumentContent;
  /** The venue's structure WITH this event's moves applied (arrangedStructure): a feature is looked
   *  at where the sketch stands it. */
  structure: VenueStructure;
  /** The event's zones: the room a thing stands in is where "the room's side" is read from. */
  zones: ResolvedZone[];
  bounds: Bounds;
  selection: readonly FocusRef[];
  /** Walls and tall things the eye must not stand in or look through (./viewpoints.ts sightOf).
   *  Absent = open ground. */
  sight?: Sight;
}

export const FOCUS_ID = "focus:";
/** A table's top, where a portrait looks. */
export const TABLE_TOP_MM = 760;
/** A tall thing (a column, a structure) is looked at no higher than this: the eye goes to the mass,
 *  not the tip. */
export const LOOK_CAP_MM = 2000;
/** A floor piece taller than this is framed whole, from its middle (a chuppah, a flower tower). */
export const TALL_MM = 1800;
/** Looking at a WIDE selection the eye rises with its reach — this fraction of it over a table top —
 *  so a whole row of tables is seen from a little above rather than through the first one. */
export const RISE = 0.35;

const OPEN: Sight = { standsAt: () => true, clear: () => true };

interface Subject {
  centre: Point;
  /** How far its rim reaches from its centre on the plan. */
  reachMm: number;
  /** Where on it the eye looks. */
  zMm: number;
}

function tableSubject(doc: DesignDocumentContent, t: DesignTable): Subject {
  const members = t.groupId ? doc.tables.filter((x) => x.groupId === t.groupId) : [t];
  if (members.length > 1) {
    const block = tableBlock(members);
    if (block) return { centre: block.centre, reachMm: Math.hypot(block.widthMm, block.depthMm) / 2, zMm: TABLE_TOP_MM };
  }
  const b = footprintBounds(tableFootprint(t));
  return { centre: t.position, reachMm: Math.hypot(b.w, b.h) / 2 || 900, zMm: TABLE_TOP_MM };
}

/** Cloth (or a line of light) in the AIR — a swag from point to point, an area of swags, a sail: it is
 *  where its RAIL's points are, never where its placement was first put (an end dragged across the
 *  room leaves `position` behind), and it is looked at between its line and its lowest point, from
 *  far enough back to hold its whole length (seen headless, 2026-11-13: framed as a 50 cm item at its
 *  first centre, a 10 m swag was a band across the lens). Null for any other rail. */
function clothSubject(p: Placement): Subject | null {
  const rail = railOf(p);
  if (!rail || (rail.type !== "run" && rail.type !== "canopy" && rail.type !== "sail")) return null;
  const pts = rail.type === "run" ? [rail.a, rail.b] : rail.type === "canopy" ? rail.outline : rail.ties.map((t) => t.p);
  if (pts.length < 2) return null;
  const centre = { x: pts.reduce((n, q) => n + q.x, 0) / pts.length, y: pts.reduce((n, q) => n + q.y, 0) / pts.length };
  const reachMm = Math.max(500, ...pts.map((q) => Math.hypot(q.x - centre.x, q.y - centre.y)));
  if (rail.type === "sail") return { centre, reachMm, zMm: rail.ties.reduce((n, t) => n + t.heightMm, 0) / rail.ties.length };
  const runs = clothRuns(rail);
  if (!runs.length) return { centre, reachMm, zMm: rail.heightMm };
  const top = runs.reduce((n, r) => n + (r.heightMm + (r.heightBMm ?? r.heightMm)) / 2, 0) / runs.length;
  const low = Math.min(...runs.map(runLowestMm));
  return { centre, reachMm, zMm: (top + low) / 2 };
}

function placementSubject(doc: DesignDocumentContent, p: Placement, structure: Pick<VenueStructure, "features">, zones: readonly ResolvedZone[]): Subject | null {
  const cloth = clothSubject(p);
  if (cloth) return cloth;
  // An item on a table is the table being dressed; one on a banquette is its stage.
  if (p.tableId) {
    const t = doc.tables.find((x) => x.id === p.tableId);
    return t ? tableSubject(doc, t) : null;
  }
  if (p.perch) {
    const stage = doc.placements.find((x) => x.id === p.perch?.stageId);
    return stage && stage !== p ? placementSubject(doc, stage, structure, zones) : null;
  }
  const b = footprintBounds(placementFootprint(p));
  const reachMm = (Math.hypot(b.w, b.h) / 2) * (p.scale || 1) || 500;
  if (p.stage) return { centre: p.position, reachMm, zMm: p.stage.heightMm ?? 600 };
  const product = resolve(p.variantId)?.product;
  if (p.layer === "ceiling") {
    // Looked at the middle of its body, from far enough back to hold its height too — a tall
    // cascade's crown and its tail both in the frame (seen headless, 2026-11-08: looked at its
    // underside, a 90 cm chandelier lost its top past the pane's edge).
    // Where the ROOM hangs it (build.ts ceilingPlacement): its own hang height, else under the roof
    // over it, else the open sky's — a guess of 2.5 m looked half a metre under a chandelier the
    // room had hung at 3 m, and a tall one lost its top (seen headless, 2026-11-08). Backed off
    // enough to hold a 1.8 m cascade with the 50° lens.
    const h = product?.dimensions.heightMm ?? 0;
    const hang = hangHeightOf(p, product) ?? ceilingUndersideMm(roofAt(p.position, structure, zones)?.heightMm ?? null, h);
    return { centre: p.position, reachMm: Math.max(reachMm, h * 0.85), zMm: hang + h / 2 };
  }
  const h = product?.dimensions.heightMm ?? TABLE_TOP_MM;
  // A piece taller than a person (a chuppah, a flower tower, a tree) is looked at its middle from
  // far enough back to hold its height, as a hung one is: looked at a metre up from its footprint's
  // reach, a chuppah's canopy was over the top of the pane (seen headless, 2026-11-09).
  if (h > TALL_MM) return { centre: p.position, reachMm: Math.max(reachMm * 1.35, h), zMm: Math.min(h / 2, LOOK_CAP_MM) };
  return { centre: p.position, reachMm, zMm: Math.min(h, LOOK_CAP_MM) / 2 };
}

function featureSubject(structure: VenueStructure, id: string): Subject | null {
  const f = structure.features.find((x) => x.id === id);
  if (!f) return null;
  const b = footprintBounds(featureFootprint(f));
  return { centre: { x: f.x, y: f.y }, reachMm: Math.hypot(b.w, b.h) / 2 || 500, zMm: Math.min(f.heightMm, LOOK_CAP_MM) / 2 };
}

/** The middle of the zone `p` stands in, else the plan's. */
function roomCentre(p: Point, zones: ResolvedZone[], bounds: Bounds): Point {
  const zone = zones.find((z) => z.boundary.length >= 3 && pointInPolygon(p, z.boundary));
  return zone ? polygonCentroid(zone.boundary) : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/** Where to stand to look at the selection, or null when nothing in it can be looked at. */
export function focusViewpoint({ doc, structure, zones, bounds, selection, sight = OPEN }: FocusInput): Viewpoint | null {
  const subjects: Subject[] = [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const ref of selection) {
    let s: Subject | null = null;
    if (ref.kind === "table") {
      const t = doc.tables.find((x) => x.id === ref.id);
      if (!t) continue;
      // A block is one subject however many of its members are selected.
      const key = t.groupId ? `g:${t.groupId}` : `t:${t.id}`;
      ids.push(ref.id);
      if (seen.has(key)) continue;
      seen.add(key);
      s = tableSubject(doc, t);
    } else if (ref.kind === "placement") {
      const p = doc.placements.find((x) => x.id === ref.id);
      if (!p) continue;
      s = placementSubject(doc, p, structure, zones);
      if (s) ids.push(ref.id);
    } else {
      s = featureSubject(structure, ref.id);
      if (s) ids.push(ref.id);
    }
    if (s) subjects.push(s);
  }
  if (!subjects.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of subjects) {
    minX = Math.min(minX, s.centre.x - s.reachMm);
    maxX = Math.max(maxX, s.centre.x + s.reachMm);
    minY = Math.min(minY, s.centre.y - s.reachMm);
    maxY = Math.max(maxY, s.centre.y + s.reachMm);
  }
  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  // The smallest circle about the centre that holds every subject's reach: one table's own reach,
  // never the diagonal of a box drawn round it.
  const reachMm = Math.max(...subjects.map((s) => Math.hypot(s.centre.x - centre.x, s.centre.y - centre.y) + s.reachMm));
  const zMm = subjects.reduce((t, s) => t + s.zMm, 0) / subjects.length;
  const back = reachMm + PORTRAIT_BACK_MM;
  const eye = clearEye(centre, back, roomCentre(centre, zones, bounds), sight);
  const eyeZ = Math.max(PORTRAIT_EYE_MM, TABLE_TOP_MM + reachMm * RISE);
  return clampViewpoint(
    {
      id: FOCUS_ID + [...new Set(ids)].sort().join(","),
      name: "מה שנבחר",
      eye: vec3(eye.x, eye.y, eyeZ),
      look: vec3(centre.x, centre.y, zMm),
      fovDeg: 50,
    },
    bounds,
  );
}
