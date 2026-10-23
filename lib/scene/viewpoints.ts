// The curated camera: where a client may stand, how the camera travels between those places, and
// when a guided tour is where. Spec §5. Pure — the viewer (components/scene/scene-camera.tsx) asks
// these and animates; `npm run check:viewpoints` (./viewpoints-check.ts) holds them.
//
// A client never gets a free camera (Ravid, 2026-10-23: "curated only"). They get the designer's
// saved viewpoints, or — until the designer has saved any — the DEFAULTS below, generated from the
// plan so a link is never an empty room: one from inside each door of the event's zones, one from
// above, one from the stage (or the chuppah) looking back over the tables, and one seated beside
// table 1. Saving any viewpoint replaces the defaults with the saved list (`viewpointsOf`).
//
// Everything is in plan mm with z up (./types.ts), the frame every builder uses.
import type { Point } from "@/lib/studio/hall";
import { polygonCentroid, type Bounds } from "@/lib/studio/geometry";
import { pointInPolygon } from "@/lib/venues/faces";
import { doorOffsets, featureFootprint, nodeMap, wallPoints, type VenueStructure } from "@/lib/venues/structure";
import { footprintPolygons } from "@/lib/studio/proximity";
import type { ResolvedZone } from "@/lib/venues/zone";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { edgeItemShape, toRoom, type StagePlacement } from "@/lib/design-document/stage";
import { placementFootprint, tableBlock, tableFootprint } from "@/components/footprint-shape";
import { footprintBounds } from "@/lib/studio/footprint";
import type { DesignTable } from "@/lib/design-document/types";
import {
  DEFAULT_DWELL_MS,
  DEFAULT_FOV_DEG,
  DEFAULT_TRAVEL_MS,
  EYE_MM,
  SEATED_EYE_MM,
  type SceneSettings,
  type Tour,
  type Vec3,
  type Viewpoint,
  vec3,
} from "./types";

/** How far inside a door the "from the entrance" eye stands — far enough to clear what is set
 *  right inside it (a pair of floor candles flanked the first entrance view on plan A). */
export const INSIDE_DOOR_MM = 2500;
/** A table portrait: this far back from the table's rim, this high, looking at its top. */
export const PORTRAIT_BACK_MM = 1700;
export const PORTRAIT_EYE_MM = 1750;
/** How many distinct table designs get a close-up of their own. */
export const MAX_PORTRAITS = 3;
/** The overview's elevation above the floor plane, degrees. */
export const OVERVIEW_ELEVATION_DEG = 35;
/** Never below this: an eye at the floor sees the underside of everything. */
export const MIN_EYE_MM = 300;
/** How far past the plan an eye may stand (an overview steps back to frame the room). */
export const BOUNDS_MARGIN_MM = 10000;
/** A fly between two zones rises this much above the higher eye at its middle, so it passes over
 *  the wall between them rather than through it. */
export const CROSS_ZONE_LIFT_MM = 3000;

const near = (a: number, b: number, eps = 1) => Math.abs(a - b) < eps;

// --- the defaults -----------------------------------------------------------------------------------

export interface DefaultsInput {
  doc: DesignDocumentContent;
  structure: VenueStructure;
  /** The EVENT's zones (EventPlan.zones), in the order picked: the first is the main room. */
  zones: ResolvedZone[];
  bounds: Bounds;
}

/** A stable id per generated viewpoint, so a tour built on the defaults keeps pointing at them. */
const defaultId = (key: string) => `default:${key}`;

/** The viewpoints a scene opens with when the designer has saved none. */
export function defaultViewpoints(input: DefaultsInput): Viewpoint[] {
  const out: Viewpoint[] = [];
  const { zones, structure, doc, bounds } = input;
  const main = zones[0];
  const centre = main ? polygonCentroid(main.boundary) : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };

  // From inside each door of the event's zones, looking at the zone's middle.
  const nodes = nodeMap(structure);
  let doorN = 0;
  for (const e of structure.entrances) {
    const wall = structure.walls.find((w) => w.id === e.wallId);
    const pts = wall ? wallPoints(structure, wall, nodes) : null;
    if (!pts) continue;
    const len = Math.hypot(pts.b.x - pts.a.x, pts.b.y - pts.a.y);
    if (len < 1) continue;
    const u = { x: (pts.b.x - pts.a.x) / len, y: (pts.b.y - pts.a.y) / len };
    const mid = doorOffsets(e, len).toCentreMm;
    // doorOffsets reads from the corner it is measured from; storage is always from node a.
    const along = e.measureFrom === "b" ? len - mid : mid;
    const at = { x: pts.a.x + u.x * along, y: pts.a.y + u.y * along };
    const n = { x: -u.y, y: u.x };
    for (const sign of [1, -1]) {
      const eye = { x: at.x + n.x * INSIDE_DOOR_MM * sign, y: at.y + n.y * INSIDE_DOOR_MM * sign };
      const zone = zones.find((z) => z.boundary.length >= 3 && pointInPolygon(eye, z.boundary));
      if (!zone) continue;
      const look = polygonCentroid(zone.boundary);
      doorN++;
      out.push({
        id: defaultId(`door:${e.id}`),
        name: doorN === 1 ? "מהכניסה" : `מהכניסה ${doorN}`,
        eye: vec3(eye.x, eye.y, EYE_MM),
        look: vec3(look.x, look.y, 1000),
      });
      break;
    }
  }

  // From above: elevated over the front (−y side) of the plan, framing all of it.
  out.push(overview(bounds));

  // From the stage (or the chuppah) looking back over the room.
  const stage = doc.placements.find((p) => p.stage) ?? doc.placements.find((p) => resolve(p.variantId)?.product.category === "chuppahs");
  if (stage) {
    const top = stage.stage ? (stage.stage.heightMm ?? 600) : 0;
    out.push({
      id: defaultId("stage"),
      name: stage.stage ? "מהבמה" : "מהחופה",
      eye: vec3(stage.position.x, stage.position.y, top + EYE_MM),
      look: vec3(centre.x, centre.y, 900),
    });
  }

  // Table portraits: the dressed tables the designer worked on, each framed from outside its rim on
  // the room's side, a little above standing height, looking down onto its top — the shot a
  // designer photographs at a set-up. One per distinct design (what stands on it), the most dressed first, the head table
  // (a block numbered 0, or the largest block) before them all.
  for (const p of tablePortraits(doc, centre, sightOf(structure, zones, doc))) out.push(p);
  return out.map((v) => clampViewpoint(v, bounds));
}

/** What a camera may stand in and see through: inside one of the event's zones, with no wall
 *  between it and what it looks at. Seen on plan A in a browser (2026-10-23): a close-up placed
 *  "away from the room's middle" without asking stood inside a wall and showed beige. */
export interface Sight {
  /** True when an eye may stand here. */
  standsAt(p: Point): boolean;
  /** True when nothing solid crosses the straight line from `a` to `b`. */
  clear(a: Point, b: Point): boolean;
}

const OPEN_SIGHT: Sight = { standsAt: () => true, clear: () => true };

const crosses = (a: Point, b: Point, c: Point, d: Point): boolean => {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** Anything of the venue's this tall hides what is behind it from a standing eye. */
export const BLOCKS_SIGHT_MM = 1500;

/** The venue's walls (not its kerbs — a terrace's lip hides nothing), its tall features (a
 *  structure, a bar's back wall, a column — seen on plan A: a close-up that stood inside one), and
 *  the event's zones. */
export function sightOf(structure: VenueStructure, zones: ResolvedZone[], doc?: DesignDocumentContent): Sight {
  const nodes = nodeMap(structure);
  const segments: { a: Point; b: Point }[] = structure.walls
    .filter((w) => w.kind === "wall")
    .map((w) => wallPoints(structure, w, nodes))
    .filter((p): p is { a: Point; b: Point } => !!p);
  const solids: Point[][] = [];
  for (const f of structure.features) {
    if (f.heightMm < BLOCKS_SIGHT_MM || f.kind === "surface" || f.kind === "pool" || f.kind === "plant") continue;
    for (const poly of footprintPolygons(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0)) {
      if (poly.length < 3) continue;
      solids.push(poly);
      for (let i = 0; i < poly.length; i++) segments.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
    }
  }
  // The sketch's own tall pieces: a stage's backdrop (seen on plan A: a close-up stood on the stage
  // facing its 2.4 m backdrop), and anything standing on the floor taller than an eye.
  for (const p of doc?.placements ?? []) {
    if (p.tableId || p.layer !== "floor" || p.span || p.perch) continue;
    if (p.stage) {
      for (const item of p.stage.stairs ?? []) {
        if ((item.kind ?? "stairs") !== "backdrop") continue;
        const shape = edgeItemShape(p.stage, item, deckOf);
        if (!shape) continue;
        const poly = shape.polygon.map((q) => toRoom(p as StagePlacement, q));
        solids.push(poly);
        for (let i = 0; i < poly.length; i++) segments.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
      }
      continue;
    }
    const product = resolve(p.variantId)?.product;
    if (!product || product.dimensions.heightMm < BLOCKS_SIGHT_MM || product.category === "chairs") continue;
    for (const poly of footprintPolygons(placementFootprint(p), p.position, p.rotation ?? 0, !!p.mirrored, p.scale ?? 1)) {
      if (poly.length < 3) continue;
      solids.push(poly);
      for (let i = 0; i < poly.length; i++) segments.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
    }
  }
  const inZones = zones.filter((z) => z.boundary.length >= 3);
  return {
    standsAt: (p) => (!inZones.length || inZones.some((z) => pointInPolygon(p, z.boundary))) && !solids.some((poly) => pointInPolygon(p, poly)),
    clear: (a, b) => !segments.some((w) => crosses(a, b, w.a, w.b)),
  };
}

/** Where to stand `back` from `centre`: on the ROOM's side of it — between the table and the
 *  room's middle, looking out at it with its wall behind — when that is open and in sight; else
 *  the nearest bearing that is (tried every 30°); else the room's side regardless. Standing on the
 *  far side, between a table and its wall, put the camera in walls, on stages and in front of
 *  backdrops (plan A, 2026-10-23). */
export function clearEye(centre: Point, back: number, roomCentre: Point, sight: Sight): Point {
  let dx = roomCentre.x - centre.x;
  let dy = roomCentre.y - centre.y;
  const d = Math.hypot(dx, dy);
  const away = d < 1 ? 90 : (Math.atan2(dy, dx) * 180) / Math.PI;
  for (const step of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
    const a = ((away + step) * Math.PI) / 180;
    const eye = { x: centre.x + Math.cos(a) * back, y: centre.y + Math.sin(a) * back };
    if (sight.standsAt(eye) && sight.clear(eye, centre)) return eye;
  }
  dx = -dx;
  dy = -dy;
  const n = Math.hypot(dx, dy) || 1;
  return { x: centre.x + (dx / n) * back, y: centre.y + (dy / n) * back };
}

interface Unit {
  key: string;
  tables: DesignTable[];
  centre: Point;
  /** The unit's half-diagonal on the plan: how far its rim reaches from its centre. */
  reachMm: number;
  /** What stands on it, as a signature of variant ids — two tables dressed alike share it. */
  design: string;
  dressed: number;
  head: boolean;
  label: string;
}

/** The table units of a document (a lone table, or a whole block), with what is on them. */
function unitsOf(doc: DesignDocumentContent): Unit[] {
  const onTable = new Map<string, string[]>();
  for (const p of doc.placements) {
    if (!p.tableId) continue;
    onTable.set(p.tableId, [...(onTable.get(p.tableId) ?? []), p.variantId]);
  }
  const seen = new Set<string>();
  const units: Unit[] = [];
  for (const t of doc.tables) {
    const members = t.groupId ? doc.tables.filter((x) => x.groupId === t.groupId) : [t];
    const key = t.groupId ? `g:${t.groupId}` : `t:${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let centre: Point = t.position;
    let reachMm = 0;
    if (members.length > 1) {
      const block = tableBlock(members);
      if (block) {
        centre = block.centre;
        reachMm = Math.hypot(block.widthMm, block.depthMm) / 2;
      }
    } else {
      const b = footprintBounds(tableFootprint(t));
      reachMm = Math.hypot(b.w, b.h) / 2;
    }
    const items = members.flatMap((m) => onTable.get(m.id) ?? []);
    const number = doc.groups?.find((g) => g.id === t.groupId)?.number ?? t.number;
    const head = number === 0;
    units.push({
      key,
      tables: members,
      centre,
      reachMm: reachMm || 900,
      design: [...items].sort().join(","),
      dressed: items.length,
      head,
      label: head ? "שולחן ראש" : `שולחן ${number}`,
    });
  }
  return units;
}

/** One close-up per distinct table design, plus the head table, at most MAX_PORTRAITS + 1. */
export function tablePortraits(doc: DesignDocumentContent, roomCentre: Point, sight: Sight = OPEN_SIGHT): Viewpoint[] {
  const units = unitsOf(doc);
  if (!units.length) return [];
  const picked: Unit[] = [];
  const head = units.find((u) => u.head) ?? [...units].filter((u) => u.tables.length > 1).sort((a, b) => b.reachMm - a.reachMm)[0];
  if (head) picked.push(head);
  const designs = new Set(picked.map((u) => u.design));
  for (const u of [...units].sort((a, b) => b.dressed - a.dressed)) {
    if (picked.length >= MAX_PORTRAITS + (head ? 1 : 0)) break;
    if (u.dressed === 0 || designs.has(u.design) || picked.includes(u)) continue;
    designs.add(u.design);
    picked.push(u);
  }
  return picked.map((u, i) => {
    const back = u.reachMm + PORTRAIT_BACK_MM;
    const eye = clearEye(u.centre, back, roomCentre, sight);
    const top = 760;
    return {
      id: defaultId(`table:${u.key}`),
      name: u === head ? (u.head ? "שולחן ראש" : "השולחן המרכזי") : picked.length - (head ? 1 : 0) > 1 ? `עיצוב שולחן ${i + (head ? 0 : 1)}` : `ליד ${u.label}`,
      eye: vec3(eye.x, eye.y, PORTRAIT_EYE_MM),
      look: vec3(u.centre.x, u.centre.y, top),
      fovDeg: 50,
    };
  });
}

/** The elevated view over the whole plan from its −y side, at OVERVIEW_ELEVATION_DEG, far enough
 *  back for the plan's diagonal to fit the default field of view. */
export function overview(bounds: Bounds, fovDeg = DEFAULT_FOV_DEG): Viewpoint {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const diag = Math.hypot(bounds.widthMm || 1, bounds.heightMm || 1);
  const dist = (diag / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180)) * 1.05;
  const el = (OVERVIEW_ELEVATION_DEG * Math.PI) / 180;
  return {
    id: defaultId("overview"),
    name: "מבט על",
    eye: vec3(cx, cy + dist * Math.cos(el), dist * Math.sin(el)),
    look: vec3(cx, cy, 0),
  };
}

/** Kept to sane ground: the eye never under MIN_EYE_MM and never further than BOUNDS_MARGIN_MM off
 *  the plan; the look point never under the floor. */
export function clampViewpoint(v: Viewpoint, bounds: Bounds): Viewpoint {
  const clampXY = (p: Vec3, margin: number) => ({
    x: Math.min(bounds.maxX + margin, Math.max(bounds.minX - margin, p.x)),
    y: Math.min(bounds.maxY + margin, Math.max(bounds.minY - margin, p.y)),
  });
  // The overview stands back further than the margin on purpose: clamp only what it is not.
  const eyeXY = v.id === defaultId("overview") ? v.eye : clampXY(v.eye, BOUNDS_MARGIN_MM);
  return {
    ...v,
    eye: vec3(eyeXY.x, eyeXY.y, Math.max(MIN_EYE_MM, v.eye.z)),
    look: vec3(v.look.x, v.look.y, Math.max(0, v.look.z)),
  };
}

/** What a client is shown: the designer's saved list, else the defaults. */
export function viewpointsOf(settings: SceneSettings, defaults: Viewpoint[]): Viewpoint[] {
  return settings.viewpoints.length ? settings.viewpoints : defaults;
}

/** The tour a client is played: the designer's, its stops kept only where their viewpoint still
 *  exists; or, with none saved, every viewpoint in order at the default timings. */
export function tourOf(settings: SceneSettings, viewpoints: Viewpoint[]): Tour {
  const ids = new Set(viewpoints.map((v) => v.id));
  if (settings.tour) {
    const stops = settings.tour.stops.filter((s) => ids.has(s.viewpointId));
    if (stops.length) return { stops, loop: settings.tour.loop };
  }
  return { stops: viewpoints.map((v) => ({ viewpointId: v.id, dwellMs: DEFAULT_DWELL_MS, travelMs: DEFAULT_TRAVEL_MS })), loop: true };
}

// --- the fly --------------------------------------------------------------------------------------

/** Ease in and out (smoothstep's cubic): the camera leaves gently and arrives gently. */
export const ease = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => vec3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

/** The camera's pose at `t` (0..1, before easing) on the way from `a` to `b`. Both the eye and
 *  the look point travel; when the two eyes stand in different zones (`crossZones`), the eye lifts
 *  over the room on a parabola peaking CROSS_ZONE_LIFT_MM above the higher eye at the middle — a
 *  straight line between two rooms runs through their wall. */
export function flyPose(a: Viewpoint, b: Viewpoint, t: number, crossZones: boolean): { eye: Vec3; look: Vec3; fovDeg: number } {
  const e = ease(t);
  const eye = lerp3(a.eye, b.eye, e);
  if (crossZones) {
    const peak = Math.max(a.eye.z, b.eye.z) + CROSS_ZONE_LIFT_MM;
    const base = lerp(a.eye.z, b.eye.z, e);
    // 4e(1−e) is 0 at both ends and 1 at the middle: the straight line's height, bent up to the peak.
    eye.z = base + (peak - base) * 4 * e * (1 - e);
  }
  return { eye, look: lerp3(a.look, b.look, e), fovDeg: lerp(a.fovDeg ?? DEFAULT_FOV_DEG, b.fovDeg ?? DEFAULT_FOV_DEG, e) };
}

/** Whether a fly between two viewpoints crosses from one zone into another (or into or out of
 *  the open, past every zone). */
export function crossesZones(a: Viewpoint, b: Viewpoint, zones: ResolvedZone[]): boolean {
  const zoneOf = (p: Point) => zones.find((z) => z.boundary.length >= 3 && pointInPolygon(p, z.boundary))?.zone.id ?? null;
  return zoneOf(a.eye) !== zoneOf(b.eye);
}

// --- the tour -------------------------------------------------------------------------------------

export interface TourLeg {
  /** The stop being flown TO (index into tour.stops). */
  index: number;
  /** When the fly to it starts and when its dwell ends, ms from the tour's start. */
  flyFrom: number;
  arriveAt: number;
  leaveAt: number;
}

/** The tour laid out in time: each stop's fly (its own `travelMs`), then its dwell. The first stop
 *  is flown to from wherever the camera is. */
export function tourSchedule(tour: Tour): { legs: TourLeg[]; totalMs: number } {
  const legs: TourLeg[] = [];
  let t = 0;
  tour.stops.forEach((s, index) => {
    const flyFrom = t;
    const arriveAt = flyFrom + Math.max(0, s.travelMs);
    const leaveAt = arriveAt + Math.max(0, s.dwellMs);
    legs.push({ index, flyFrom, arriveAt, leaveAt });
    t = leaveAt;
  });
  return { legs, totalMs: t };
}

/** Where a tour is at `elapsedMs`: the stop flown to, and how far through its fly (1 = arrived,
 *  dwelling). A looping tour wraps; a finished one rests on its last stop. */
export function tourAt(tour: Tour, elapsedMs: number): { index: number; flyT: number; done: boolean } {
  const { legs, totalMs } = tourSchedule(tour);
  if (!legs.length) return { index: -1, flyT: 1, done: true };
  let t = elapsedMs;
  if (totalMs > 0 && t >= totalMs) {
    if (!tour.loop) return { index: legs.length - 1, flyT: 1, done: true };
    t = t % totalMs;
  }
  const leg = legs.find((l) => t < l.leaveAt) ?? legs[legs.length - 1];
  const fly = leg.arriveAt - leg.flyFrom;
  const flyT = fly > 0 ? Math.max(0, Math.min(1, (t - leg.flyFrom) / fly)) : 1;
  return { index: leg.index, flyT, done: false };
}

// --- validation (what saveSceneSettings accepts) ----------------------------------------------------

export { MAX_VIEWPOINTS } from "./types";
