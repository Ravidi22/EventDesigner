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
import { placementFootprint, tableBlock, tableFootprint } from "@/components/footprint-shape";
import { footprintBounds } from "@/lib/studio/footprint";
import { isMain } from "../self-check";
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

function placementSubject(doc: DesignDocumentContent, p: Placement): Subject | null {
  // An item on a table is the table being dressed; one on a banquette is its stage.
  if (p.tableId) {
    const t = doc.tables.find((x) => x.id === p.tableId);
    return t ? tableSubject(doc, t) : null;
  }
  if (p.perch) {
    const stage = doc.placements.find((x) => x.id === p.perch?.stageId);
    return stage && stage !== p ? placementSubject(doc, stage) : null;
  }
  const b = footprintBounds(placementFootprint(p));
  const reachMm = (Math.hypot(b.w, b.h) / 2) * (p.scale || 1) || 500;
  if (p.stage) return { centre: p.position, reachMm, zMm: p.stage.heightMm ?? 600 };
  const product = resolve(p.variantId)?.product;
  if (p.layer === "ceiling") return { centre: p.position, reachMm, zMm: hangHeightOf(p, product) ?? 2500 };
  const h = product?.dimensions.heightMm ?? TABLE_TOP_MM;
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
      s = placementSubject(doc, p);
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

// --- self-check -------------------------------------------------------------------------------------

if (isMain(import.meta.url)) {
  const assert = (cond: unknown, msg: string) => {
    if (!cond) {
      console.error(`check:scene-focus FAILED — ${msg}`);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1) => Math.abs(a - b) < eps;
  const room: Point[] = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ];
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 10000, widthMm: 10000, heightMm: 10000 };
  const zones = [{ zone: { id: "z", name: "אולם" }, boundary: room } as unknown as ResolvedZone];
  const structure = { nodes: [], walls: [], entrances: [], features: [] } as unknown as VenueStructure;
  const table = (id: string, x: number, y: number, groupId?: string): DesignTable =>
    ({ id, type: "round", number: 1, position: { x, y }, rotation: 0, diameterMm: 1800, seats: 10, ...(groupId ? { groupId } : {}) }) as DesignTable;
  const placement = (id: string, extra: Partial<Placement>): Placement =>
    ({ id, variantId: "v-unknown", layer: "floor", quantity: 1, position: { x: 5000, y: 5000 }, rotation: 0, scale: 1, ...extra }) as Placement;
  const doc = {
    tables: [table("t1", 2000, 2000), table("t2", 8000, 5000), table("h1", 4000, 8000, "g"), table("h2", 6000, 8000, "g")],
    placements: [
      placement("c1", { layer: "table", tableId: "t2", position: { x: 0, y: 0 } }),
      placement("ch", { layer: "ceiling", position: { x: 5000, y: 5000 }, hangHeightMm: 2800 }),
      placement("s1", {
        position: { x: 5000, y: 2000 },
        stage: {
          outline: [
            { x: -2000, y: -1000 },
            { x: 2000, y: -1000 },
            { x: 2000, y: 1000 },
            { x: -2000, y: 1000 },
          ],
          front: 2,
          decks: [],
          heightMm: 400,
        } as unknown as Placement["stage"],
      }),
    ],
    groups: [],
  } as unknown as DesignDocumentContent;
  const at = (selection: FocusRef[]) => focusViewpoint({ doc, structure, zones, bounds, selection });

  // One table: the tab's portrait — on the room's side of it, at standing height, looking at its top.
  const one = at([{ kind: "table", id: "t1" }]);
  assert(one && one.id === "focus:t1", "one table: id is the selection");
  assert(one && near(one.look.x, 2000) && near(one.look.y, 2000) && near(one.look.z, TABLE_TOP_MM), "one table: looks at its top");
  assert(one && near(one.eye.z, PORTRAIT_EYE_MM), "one table: eye at portrait height");
  assert(one && one.eye.x > 2000 && one.eye.y > 2000, "one table: the eye is between the table and the room's middle");
  // Its reach is the half-diagonal of its box, as the tab's portrait reads it (tablePortraits).
  assert(one && near(Math.hypot(one.eye.x - 2000, one.eye.y - 2000), Math.hypot(1800, 1800) / 2 + PORTRAIT_BACK_MM, 2), "one table: stands reach + back off its centre");

  // Two tables apart: framed together, from further back and higher.
  const two = at([{ kind: "table", id: "t1" }, { kind: "table", id: "t2" }]);
  assert(two && two.id === "focus:t1,t2", "two tables: both ids, sorted");
  assert(two && near(two.look.x, 5000) && near(two.look.y, 3500), "two tables: looks at the middle of both");
  assert(two && two.eye.z > PORTRAIT_EYE_MM, "two tables: the eye rises");
  assert(
    two && one && Math.hypot(two.eye.x - 5000, two.eye.y - 3500) > Math.hypot(one.eye.x - 2000, one.eye.y - 2000),
    "two tables: stands further back",
  );

  // A block selected by two members is one subject, with the block's reach.
  const block = at([{ kind: "table", id: "h1" }, { kind: "table", id: "h2" }]);
  assert(block && block.id === "focus:h1,h2" && near(block.look.x, 5000) && near(block.look.y, 8000), "a block: one subject at the block's centre");
  const member = at([{ kind: "table", id: "h1" }]);
  assert(member && near(member.look.x, 5000) && near(member.look.y, 8000), "one member of a block: the whole block");

  // An item on a table is the table.
  const dressing = at([{ kind: "placement", id: "c1" }]);
  assert(dressing && near(dressing.look.x, 8000) && near(dressing.look.y, 5000) && near(dressing.look.z, TABLE_TOP_MM), "an item on a table: the table's portrait");

  // A chandelier is looked at where it hangs, from standing height.
  const hung = at([{ kind: "placement", id: "ch" }]);
  assert(hung && near(hung.look.z, 2800) && near(hung.eye.z, PORTRAIT_EYE_MM), "a ceiling item: looked at at its hang height");

  // A stage at its deck.
  const stage = at([{ kind: "placement", id: "s1" }]);
  assert(stage && near(stage.look.z, 400), "a stage: looked at at its deck");

  // Nothing to look at.
  assert(at([]) === null, "empty selection: null");
  assert(at([{ kind: "table", id: "nope" }, { kind: "feature", id: "nope" }]) === null, "unknown ids: null");

  console.log("check:scene-focus ok");
}
