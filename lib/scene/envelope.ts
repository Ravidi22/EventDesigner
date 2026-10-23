// The venue as a room: the floors, the ground under them, the walls with their doors cut out, the
// ceilings over the roofed zones, and the property's own fixed features. Spec §3.1.
//
// Everything is read off what the plan already resolved — `eventPlan(...).all` for the zones and
// their boundaries, `wallPoints`/`doorOffsets`/`featureFootprint` for the structure — and nothing
// here stores a height or a thickness of its own: walls have neither in the venue (DECIDE 6), so
// a wall is WALL_THICK_MM thick and as tall as the tallest ROOFED zone it borders, a garden wall
// where it borders none, and an `edge` kind is a kerb. A door is an opening the wall is split
// round: two stretches at full height and a lintel over the gap from DOOR_HEIGHT_MM up (the leaf
// is phase B). Plan mm, +y down the plan, z up from the floor at 0 (./types.ts).
//
// Which zones a wall borders is decided GEOMETRICALLY, not by walking the face graph: a few points
// along the wall are pushed one wall-thickness to either side, and a zone whose boundary polygon
// holds any of them borders the wall. The faces are already folded into the boundaries (a face
// zone's boundary IS its face, `resolveZones`), so this reads the same answer the graph would give
// for a face zone and ALSO the right answer for a region zone drawn freehand over open ground and
// a zone made of features — neither of which the face graph knows about. Three probes, not one,
// because a long wall may border a hall along part of its length and two side rooms along the
// rest; the tallest wins.
import type { Point } from "@/lib/studio/hall";
import { bulgeToCurve, type Bounds } from "@/lib/studio/geometry";
import { flattenEdge, footprintOutlines, type BuiltOutline } from "@/lib/studio/footprint";
import { pointInPolygon } from "@/lib/venues/faces";
import {
  doorOffsets,
  featureFootprint,
  nodeMap,
  plantSpecies,
  surfaceMaterial as featureSurface,
  wallPoints,
  type StructureEntrance,
  type StructureFeature,
  type VenueStructure,
  type Wall,
} from "@/lib/venues/structure";
import type { ResolvedZone } from "@/lib/venues/zone";
import { eventPlan } from "@/lib/events/plan";
import { emptyDocument } from "@/lib/design-document/types";
import { isMain } from "../self-check";
import { SceneCollector } from "./collect";
import { headingDeg, roomTransform } from "./frame";
import { ENVELOPE, foliageMaterial, hexOf, surfaceMaterial, waterMaterial } from "./materials";
import {
  DEFAULT_SETTINGS,
  DOOR_HEIGHT_MM,
  GARDEN_WALL_MM,
  GROUND_MARGIN_MM,
  KERB_MM,
  KERB_THICK_MM,
  WALL_THICK_MM,
  WATER_DEPTH_MM,
  type MaterialRef,
  type Part,
  type SceneInput,
  type Transform,
  transform,
  vec3,
} from "./types";

/** A curved wall is cut into chords about this long (spec §3.1: 250 mm). */
const WALL_CHORD_MM = 250;
/** Where along a wall it is asked which zones it borders (fractions of its length). */
const BORDER_PROBES = [0.25, 0.5, 0.75];
/** A pool's floor, this far under its water surface — dark, so the water reads as deep. */
const WELL_BELOW_MM = 600;
const WELL_MATERIAL: MaterialRef = { colour: "#3b4d5a", kind: "matte" };
const WALL_MATERIAL: MaterialRef = { colour: ENVELOPE.wall, kind: "matte" };
const KERB_MATERIAL: MaterialRef = { colour: ENVELOPE.kerb, kind: "matte" };
const CEILING_MATERIAL: MaterialRef = { colour: ENVELOPE.ceiling, kind: "matte" };
const TRUNK_MATERIAL: MaterialRef = { colour: ENVELOPE.trunk, kind: "matte" };
const FEATURE_FILL = "#e4e0d8";
const FOLIAGE_FILL = "#8fae84";

/** Bodies whose parts are already in room mm stand at the room's origin, unturned. */
const here = (): Transform => transform(vec3(0, 0, 0));

// --- walls ----------------------------------------------------------------------------------------

/** A wall as a polyline from node a to node b: the chord of a straight wall, ~250 mm chords of a
 *  bowed one (`flattenEdge`, with enough steps for the bow's real length). */
export function wallPolyline(a: Point, b: Point, curve: Wall["curve"]): Point[] {
  if (!curve) return [a, b];
  const rough = flattenEdge(a, b, curve, 16);
  const steps = Math.min(64, Math.max(4, Math.ceil(polylineLength(rough) / WALL_CHORD_MM)));
  return flattenEdge(a, b, curve, steps);
}

function polylineLength(poly: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
  return len;
}

/** The point a fraction `t` along a polyline, and the unit normal of the stretch it is on. */
function alongPolyline(poly: readonly Point[], t: number): { p: Point; n: Point } {
  const total = polylineLength(poly);
  let target = total * t;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    if (target <= len || i === poly.length - 1) {
      const u = Math.max(0, Math.min(1, target / len));
      return { p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, n: { x: -(b.y - a.y) / len, y: (b.x - a.x) / len } };
    }
    target -= len;
  }
  return { p: poly[0], n: { x: 0, y: 1 } };
}

/** The zones a wall (as a polyline) borders: those whose boundary holds a probe point pushed one
 *  wall-thickness off the wall, on either side, at a quarter, half and three quarters along. */
export function borderingZones(poly: readonly Point[], zones: readonly ResolvedZone[]): ResolvedZone[] {
  if (poly.length < 2 || polylineLength(poly) < 1e-6) return [];
  const probes: Point[] = [];
  for (const t of BORDER_PROBES) {
    const { p, n } = alongPolyline(poly, t);
    probes.push({ x: p.x + n.x * WALL_THICK_MM, y: p.y + n.y * WALL_THICK_MM });
    probes.push({ x: p.x - n.x * WALL_THICK_MM, y: p.y - n.y * WALL_THICK_MM });
  }
  return zones.filter((z) => z.boundary.length >= 3 && probes.some((p) => pointInPolygon(p, z.boundary)));
}

/** How high a wall stands: an `edge` kind is a kerb; a `wall` is as tall as the tallest ROOFED
 *  zone (ceilingHeightMm > 0) it borders, and a garden wall when it borders none — both faces
 *  open sky, or outside every zone. */
export function wallHeightMm(wall: Pick<Wall, "kind">, poly: readonly Point[], zones: readonly ResolvedZone[]): number {
  if (wall.kind === "edge") return KERB_MM;
  let tallest = 0;
  for (const z of borderingZones(poly, zones)) tallest = Math.max(tallest, z.zone.ceilingHeightMm || 0);
  return tallest > 0 ? tallest : GARDEN_WALL_MM;
}

/** An opening in a wall, measured along the wall from node a (the convention `distanceMm` keeps). */
export interface WallOpening {
  id: string;
  startMm: number;
  endMm: number;
}

/** The boxes one STRAIGHT stretch of wall becomes once its openings are cut: the solid stretches
 *  between them (the jambs, full height) and, over each opening, a lintel from DOOR_HEIGHT_MM to
 *  the top — none when the wall is no taller than the door (a kerb with a gap is just a gap).
 *  Openings are in mm along a→b; anything outside the stretch is clipped off, so a door on a bowed
 *  wall can be handed to each of its chords in turn. Every box is centred on the wall's line,
 *  `thickMm` thick, turned to the stretch's heading. */
export function doorPieces(
  a: Point,
  b: Point,
  heightMm: number,
  thickMm: number,
  openings: readonly WallOpening[],
): { solids: Part[]; lintels: { id: string; part: Part }[] } {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const solids: Part[] = [];
  const lintels: { id: string; part: Part }[] = [];
  if (len < 1 || heightMm <= 0) return { solids, lintels };
  const rot = headingDeg(a, b);
  const box = (s: number, e: number, z: number, h: number): Part => {
    const m = (s + e) / 2 / len;
    return { shape: "box", w: e - s, d: thickMm, h, at: vec3(a.x + (b.x - a.x) * m, a.y + (b.y - a.y) * m, z), rotDeg: rot };
  };
  const cut = openings
    .map((o) => ({ id: o.id, s: Math.max(0, Math.min(len, o.startMm)), e: Math.max(0, Math.min(len, o.endMm)) }))
    .filter((o) => o.e - o.s >= 1)
    .sort((p, q) => p.s - q.s);
  let cursor = 0;
  for (const o of cut) {
    if (o.s - cursor >= 1) solids.push(box(cursor, o.s, 0, heightMm));
    const s = Math.max(cursor, o.s);
    if (o.e - s >= 1 && heightMm > DOOR_HEIGHT_MM) lintels.push({ id: o.id, part: box(s, o.e, DOOR_HEIGHT_MM, heightMm - DOOR_HEIGHT_MM) });
    cursor = Math.max(cursor, o.e);
  }
  if (len - cursor >= 1) solids.push(box(cursor, len, 0, heightMm));
  return { solids, lintels };
}

/** The entrances on a wall as openings along its CHORD from node a (`doorOffsets` reads the corner
 *  each is measured from). */
function wallOpenings(entrances: readonly StructureEntrance[], chordMm: number): WallOpening[] {
  return entrances.map((e) => {
    const o = doorOffsets(e, chordMm);
    const centre = e.measureFrom === "b" ? chordMm - o.toCentreMm : o.toCentreMm;
    return { id: e.id, startMm: centre - e.widthMm / 2, endMm: centre + e.widthMm / 2 };
  });
}

/** One wall's boxes: its stretches (and its doors' lintels) along the polyline, openings cut by
 *  distance along it — a door on a bowed wall sits where its chord distance falls along the bow,
 *  scaled by the bow's extra length, which is as exact as a door hung on a chord can be. */
function wallBodies(structure: VenueStructure, wall: Wall, entrances: readonly StructureEntrance[], zones: readonly ResolvedZone[], out: SceneCollector): void {
  const pts = wallPoints(structure, wall);
  if (!pts) return;
  const poly = wallPolyline(pts.a, pts.b, wall.curve);
  const chord = Math.hypot(pts.b.x - pts.a.x, pts.b.y - pts.a.y);
  const along = polylineLength(poly);
  if (chord < 1 || along < 1) return;
  const h = wallHeightMm(wall, poly, zones);
  const thick = wall.kind === "edge" ? KERB_THICK_MM : WALL_THICK_MM;
  const openings = wallOpenings(entrances, chord).map((o) => ({ ...o, startMm: (o.startMm * along) / chord, endMm: (o.endMm * along) / chord }));
  const solids: Part[] = [];
  const lintels = new Map<string, Part[]>();
  let from = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const local = openings.map((o) => ({ ...o, startMm: o.startMm - from, endMm: o.endMm - from }));
    const pieces = doorPieces(a, b, h, thick, local);
    solids.push(...pieces.solids);
    for (const l of pieces.lintels) {
      const have = lintels.get(l.id);
      if (have) have.push(l.part);
      else lintels.set(l.id, [l.part]);
    }
    from += len;
  }
  out.body(`wall:${wall.id}`, { type: "wall", id: wall.id }, wall.kind === "edge" ? KERB_MATERIAL : WALL_MATERIAL, solids, [here()]);
  for (const [id, parts] of lintels) out.body(`door:${id}`, { type: "door", id }, WALL_MATERIAL, parts, [here()]);
}

// --- features -------------------------------------------------------------------------------------

/** An outline as one closed polyline (its curves cut into chords), for a ribbon round it. */
function closedPolyline(o: BuiltOutline): Point[] {
  const path: Point[] = [];
  const n = o.outline.length;
  for (let i = 0; i < n; i++) {
    const seg = flattenEdge(o.outline[i], o.outline[(i + 1) % n], o.edgeCurves?.[i]);
    path.push(...seg.slice(0, -1));
  }
  if (path.length) path.push(path[0]);
  return path;
}

const featureFrame = (f: StructureFeature): Transform => roomTransform({ position: { x: f.x, y: f.y }, rotation: f.rotationDeg ?? 0 });

/** A water surface recessed WATER_DEPTH_MM inside a well: dark matte walls (a ribbon round the
 *  outline) and floor, and the water plane at the top of the recess. */
function waterWell(f: StructureFeature, outlines: readonly BuiltOutline[], out: SceneCollector): void {
  const bottom = -(WATER_DEPTH_MM + WELL_BELOW_MM);
  const tint = hexOf(f.style?.fill);
  const water: MaterialRef = tint ? { ...surfaceMaterial("water", tint), opacity: 0.8 } : waterMaterial();
  const parts: Part[] = [];
  for (const o of outlines) {
    parts.push({ shape: "ribbon", path: closedPolyline(o), h: WATER_DEPTH_MM + WELL_BELOW_MM, at: vec3(0, 0, bottom) });
    parts.push({ shape: "plane", outline: o, at: vec3(0, 0, bottom) });
    parts.push({ shape: "plane", outline: o, at: vec3(0, 0, -WATER_DEPTH_MM), material: water });
  }
  out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, WELL_MATERIAL, parts, [featureFrame(f)], { castShadow: false });
}

/** A ground material laid over the feature's footprint, a hair above the zone floor; the k-th
 *  surface a millimetre above the one before, so what the plan paints later lies on top. */
function surfacePlane(f: StructureFeature, outlines: readonly BuiltOutline[], ordinal: number, out: SceneCollector): void {
  const material = surfaceMaterial(featureSurface(f), hexOf(f.style?.fill));
  const parts: Part[] = outlines.map((outline) => ({ shape: "plane", outline, at: vec3(0, 0, 1 + ordinal) }));
  out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, material, parts, [featureFrame(f)], { castShadow: false });
}

/** A built thing (a column, a pergola, a permanent bar): its footprint extruded to its height. */
function extrudedFeature(f: StructureFeature, outlines: readonly BuiltOutline[], out: SceneCollector): void {
  const material: MaterialRef = { colour: hexOf(f.style?.fill) ?? FEATURE_FILL, kind: "matte" };
  const h = Math.max(10, f.heightMm || 0);
  const parts: Part[] = outlines.map((outline) => ({ shape: "extrude", outline, h, at: vec3(0, 0, 0) }));
  out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, material, parts, [featureFrame(f)]);
}

/** A plant as a placeholder — a trunk and one canopy ball — shared by every plant of the same
 *  species, size and colour (TODO(B5): the species' real shapes). The key carries the colour
 *  because a shared body has one material. */
function plantInstance(f: StructureFeature, out: SceneCollector): void {
  const w = Math.max(1, Math.round(f.widthMm));
  const d = Math.max(1, Math.round(f.depthMm));
  const h = Math.max(1, Math.round(f.heightMm));
  const r = Math.min(w, d) / 2;
  const species = plantSpecies(f);
  const colour = hexOf(f.style?.fill) ?? FOLIAGE_FILL;
  const parts: Part[] = [
    { shape: "cylinder", rTop: 0.07 * r, rBottom: 0.07 * r, h: 0.7 * h, at: vec3(0, 0, 0), segments: 8, material: TRUNK_MATERIAL },
    { shape: "sphere", r, at: vec3(0, 0, 0.7 * h), segments: 10 },
  ];
  out.instance({
    key: `plant:${species}:${w}x${d}x${h}:${colour}`,
    parts,
    material: foliageMaterial(colour),
    tag: { type: "feature", id: f.id, label: f.label },
    at: featureFrame(f),
  });
}

/** The venue's own fixed things, as this event has them (moved and removed applied upstream). */
function featureBodies(structure: VenueStructure, out: SceneCollector): void {
  let surfaces = 0;
  for (const f of structure.features) {
    switch (f.kind) {
      case "surface": {
        const outlines = footprintOutlines(featureFootprint(f));
        if (featureSurface(f) === "water") waterWell(f, outlines, out);
        else surfacePlane(f, outlines, surfaces, out);
        surfaces++;
        break;
      }
      case "pool":
        waterWell(f, footprintOutlines(featureFootprint(f)), out);
        break;
      case "structure":
      case "other":
      case "bar":
        extrudedFeature(f, footprintOutlines(featureFootprint(f)), out);
        break;
      case "plant":
        plantInstance(f, out);
        break;
      case "stage": // TODO(B1): featureStage → the stage builder (decks, flights, ramps, skirt)
      case "stairs": // TODO(B2): lib/venues/climb.ts flights as tread boxes
      case "ramp": // TODO(B2): a wedge over its run
      case "seating": // TODO(B3): the venue's chair rows through chairRowsLayout
        break;
    }
  }
}

// --- the envelope ---------------------------------------------------------------------------------

function grown(b: Bounds, byMm: number): BuiltOutline {
  const x0 = b.minX - byMm;
  const x1 = b.maxX + byMm;
  const y0 = b.minY - byMm;
  const y1 = b.maxY + byMm;
  return { outline: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}

/** Floors, ground, walls with doors, ceilings and the fixed features — into `out`. Returns the
 *  tallest ceiling on the plan (what a chandelier's chain reaches for), or null under open sky. */
export function envelopeNodes(input: SceneInput, out: SceneCollector): { roofedMm: number | null } {
  const { plan, structure } = input;
  const zones = plan.all;

  // Floors: every zone on the property, so the hall next door is still there through its door.
  for (const rz of zones) {
    if (rz.boundary.length < 3) continue;
    const z = rz.zone;
    const material = surfaceMaterial(z.surface ?? "plain", hexOf(z.style?.fill));
    out.body(`floor:${z.id}`, { type: "floor", id: z.id, label: z.name }, material, [{ shape: "plane", outline: { outline: rz.boundary }, at: vec3(0, 0, 0) }], [here()], { castShadow: false });
  }

  // Ground: a neutral plane well past the plan, a hair under the floors.
  out.body("ground", { type: "ground" }, surfaceMaterial("paving", ENVELOPE.ground), [{ shape: "plane", outline: grown(plan.bounds, GROUND_MARGIN_MM), at: vec3(0, 0, -1) }], [here()], { castShadow: false });

  // Walls, each with the doors hung on it.
  const byWall = new Map<string, StructureEntrance[]>();
  for (const e of structure.entrances) {
    const have = byWall.get(e.wallId);
    if (have) have.push(e);
    else byWall.set(e.wallId, [e]);
  }
  const nodes = nodeMap(structure);
  for (const wall of structure.walls) {
    if (!nodes.has(wall.a) || !nodes.has(wall.b)) continue;
    wallBodies(structure, wall, byWall.get(wall.id) ?? [], zones, out);
  }

  // Ceilings over the roofed zones; the sky shows over the rest.
  let roofedMm: number | null = null;
  for (const rz of zones) {
    const h = rz.zone.ceilingHeightMm || 0;
    if (h <= 0 || rz.boundary.length < 3) continue;
    out.body(`ceiling:${rz.zone.id}`, { type: "ceiling", id: rz.zone.id, label: rz.zone.name }, CEILING_MATERIAL, [{ shape: "plane", outline: { outline: rz.boundary }, at: vec3(0, 0, h), side: "down" }], [here()]);
    roofedMm = roofedMm === null ? h : Math.max(roofedMm, h);
  }

  featureBodies(structure, out);
  return { roofedMm };
}

// ponytail: self-check. Run: npx tsx lib/scene/envelope.ts
if (isMain(import.meta.url)) {
  {
    const assert = (ok: boolean, msg: string) => {
      if (!ok) {
        console.error("FAIL", msg);
        process.exit(1);
      }
    };
    const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

    // A hall (roofed, 4 m) and a terrace (open sky) sharing the wall n2–n3; the terrace's top wall
    // bows outward, its bottom is a kerb; one door on the hall's left wall.
    //   n1 ──── n2 ──(bow)── n5
    //    │  hall │  terrace   │
    //   n4 ──── n3 ══kerb═══ n6
    const structure: VenueStructure = {
      nodes: [
        { id: "n1", x: 0, y: 0 },
        { id: "n2", x: 6000, y: 0 },
        { id: "n3", x: 6000, y: 4000 },
        { id: "n4", x: 0, y: 4000 },
        { id: "n5", x: 10000, y: 0 },
        { id: "n6", x: 10000, y: 4000 },
      ],
      walls: [
        { id: "w-top-a", a: "n1", b: "n2", kind: "wall" },
        { id: "w-shared", a: "n2", b: "n3", kind: "wall" },
        { id: "w-bot-a", a: "n3", b: "n4", kind: "wall" },
        { id: "w-left", a: "n4", b: "n1", kind: "wall" },
        { id: "w-top-b", a: "n2", b: "n5", kind: "wall", curve: bulgeToCurve({ x: 6000, y: 0 }, { x: 10000, y: 0 }, { x: 8000, y: -500 }) },
        { id: "w-right", a: "n5", b: "n6", kind: "wall" },
        { id: "w-bot-b", a: "n6", b: "n3", kind: "edge" },
      ],
      entrances: [{ id: "door-1", wallId: "w-left", distanceMm: 2000, widthMm: 1000, swingInward: true, doubleDoor: false }],
      features: [
        { id: "col-1", kind: "structure", label: "עמוד", x: 1000, y: 1000, widthMm: 500, depthMm: 500, heightMm: 3000, shape: "rect", rotationDeg: 0 },
        { id: "pool-1", kind: "pool", label: "בריכה", x: 3500, y: 2000, widthMm: 3000, depthMm: 2000, heightMm: 0, shape: "ellipse", rotationDeg: 0 },
        { id: "lawn-1", kind: "surface", label: "דשא", x: 8000, y: 2000, widthMm: 2000, depthMm: 2000, heightMm: 0, shape: "rect", rotationDeg: 0, surface: "grass" },
        { id: "tree-1", kind: "plant", label: "עץ", x: 8000, y: 2000, widthMm: 3500, depthMm: 3500, heightMm: 4000, shape: "circle", rotationDeg: 0, plant: "tree" },
        { id: "tree-2", kind: "plant", label: "עץ", x: 9000, y: 3000, widthMm: 3500, depthMm: 3500, heightMm: 4000, shape: "circle", rotationDeg: 0, plant: "tree" },
        { id: "stage-1", kind: "stage", label: "במה", x: 2000, y: 3000, widthMm: 4000, depthMm: 2000, heightMm: 600, shape: "rect", rotationDeg: 0 },
      ],
    };
    const zone = (id: string, name: string, kind: "hall" | "open", anchor: Point, ceilingHeightMm: number) => ({ id, venueId: "v", name, kind, source: { type: "face" as const, anchor }, ceilingHeightMm, createdAt: 0 });
    const plan = eventPlan({ venueId: "v", zoneIds: ["z-hall"] }, {
      structure,
      zones: [zone("z-hall", "אולם", "hall", { x: 3000, y: 2000 }, 4000), zone("z-terrace", "מרפסת", "open", { x: 8000, y: 2000 }, 0)],
      mmPerUnit: 1,
      access: "granted",
    });
    assert(plan.all.length === 2 && plan.all.every((z) => !z.detached), "both zones resolve to their faces through the real face detection");

    const out = new SceneCollector();
    const { roofedMm } = envelopeNodes({ doc: emptyDocument(), plan, structure, settings: DEFAULT_SETTINGS, author: true }, out);
    const nodes = out.nodes();
    const bodies = nodes.filter((n): n is Extract<typeof n, { kind: "body" }> => n.kind === "body");
    const byId = (id: string) => bodies.find((b) => b.id === id);
    const boxH = (id: string) => {
      const b = byId(id);
      assert(!!b, `${id} is in the scene`);
      const hs = b!.parts.map((p) => (p.shape === "box" ? p.h : NaN));
      assert(hs.length > 0 && hs.every((h) => h === hs[0]), `${id} is boxes of one height`);
      return hs[0];
    };

    assert(bodies.filter((b) => b.tag.type === "floor").length === 2, "floors = 2 (every zone on the property)");
    assert(roofedMm === 4000, `roofedMm is the hall's 4000 (got ${roofedMm})`);
    const ceilings = bodies.filter((b) => b.tag.type === "ceiling");
    assert(ceilings.length === 1, "one ceiling plane — the terrace is open sky");
    const ceil = ceilings[0].parts[0];
    assert(ceil.shape === "plane" && ceil.at.z === 4000 && ceil.side === "down", "the ceiling is a plane at 4000 facing down");

    assert(boxH("wall:w-shared") === 4000, "the wall between hall and terrace takes the hall's 4000");
    assert(boxH("wall:w-top-a") === 4000 && boxH("wall:w-bot-a") === 4000, "the hall's outer walls are 4000");
    assert(boxH("wall:w-right") === GARDEN_WALL_MM, "the terrace's outer wall, bordering no roofed zone, is a garden wall");
    assert(boxH("wall:w-top-b") === GARDEN_WALL_MM, "…and so is its bowed one");
    assert(byId("wall:w-top-b")!.parts.length >= 8, `a bowed wall is many chords (got ${byId("wall:w-top-b")!.parts.length})`);
    const kerb = byId("wall:w-bot-b")!;
    assert(boxH("wall:w-bot-b") === KERB_MM && kerb.parts.every((p) => p.shape === "box" && p.d === KERB_THICK_MM), "an edge kind is a kerb, KERB_MM high and KERB_THICK_MM thick");
    assert(kerb.material.colour === ENVELOPE.kerb, "…in the kerb's tone");
    const shared = byId("wall:w-shared")!.parts[0];
    assert(shared.shape === "box" && shared.d === WALL_THICK_MM && near(shared.at.x, 6000) && near(shared.at.y, 2000) && near(shared.w, 4000), "a wall box is centred on its chord, WALL_THICK_MM thick, the chord long");

    const left = byId("wall:w-left")!;
    assert(left.parts.length === 2, `the door splits its wall into two jambs (got ${left.parts.length})`);
    assert(left.parts.every((p) => p.shape === "box" && p.h === 4000 && near(p.w, 1500)), "each jamb is full height and 1500 long (4000 − 1000, split either side of a door 2000 from n4)");
    const lintel = byId("door:door-1");
    assert(!!lintel && lintel.tag.type === "door" && lintel.parts.length === 1, "the door is one lintel body tagged door");
    const l = lintel!.parts[0];
    assert(l.shape === "box" && l.at.z === DOOR_HEIGHT_MM && l.h === 4000 - DOOR_HEIGHT_MM && near(l.w, 1000) && near(l.at.y, 2000) && near(l.at.x, 0), "the lintel spans the opening from DOOR_HEIGHT_MM to the wall top, over the door's middle");

    const ground = byId("ground")!;
    const g = ground.parts[0];
    assert(g.shape === "plane" && g.at.z === -1 && near(Math.min(...g.outline.outline.map((p) => p.x)), plan.bounds.minX - GROUND_MARGIN_MM), "the ground is a plane at −1 grown GROUND_MARGIN_MM past the plan's bounds");

    const col = byId("feature:col-1")!;
    assert(col.parts[0].shape === "extrude" && col.parts[0].h === 3000 && col.instances[0].at.x === 1000, "a structure feature is its footprint extruded to its height, at its place");
    const pool = byId("feature:pool-1")!;
    const water = pool.parts.find((p) => p.shape === "plane" && p.material?.kind === "water");
    assert(!!water && water.at.z === -WATER_DEPTH_MM, "a pool is a water plane recessed WATER_DEPTH_MM");
    assert(pool.parts.some((p) => p.shape === "ribbon") && pool.material.kind === "matte", "…inside a well with matte walls");
    const lawn = byId("feature:lawn-1")!;
    assert(lawn.parts[0].shape === "plane" && lawn.parts[0].at.z === 1 && lawn.material.texture === "grass", "a surface feature is a plane a hair above the floor in its material");
    const trees = bodies.filter((b) => b.id.startsWith("i:plant:tree:"));
    assert(trees.length === 1 && trees[0].instances.length === 2 && trees[0].parts.length === 2, "two trees of one size are one shared body with two instances, trunk + canopy");
    assert(trees[0].parts[1].shape === "sphere" && near(trees[0].parts[1].at.z, 2800) && near(trees[0].parts[1].r, 1750), "the canopy ball is at 0.7 of the height, as wide as the plant");
    assert(!byId("feature:stage-1"), "a venue stage is left to phase B");

    const total = out.stats();
    console.log(`scene envelope ok: ${total.bodies} bodies, ${total.instances} instances; roofed ${roofedMm}`);
  }
}
