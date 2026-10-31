// The 3D scene's vocabulary — what the pure builder (./build.ts) emits and the one viewer
// (components/scene/) draws. Spec: docs/superpowers/specs/2026-10-23-3d-scene-design.md §1, §3.
//
// Everything here is in PLAN millimetres: x to the right, +y DOWN the plan (the SVG world every
// other renderer draws in), z UP from the venue floor at 0. The single mapping into three.js's
// y-up metres is `toWorld` in ./frame.ts and nowhere else — a builder never thinks in metres, a
// viewer never thinks in the plan's frame.
//
// The vocabulary is deliberately closed and small: a BODY is a list of primitive parts in its own
// frame, placed at one or many transforms (one chair geometry, six hundred instances); an EMITTER
// is a thing that glows at night; a LABEL is an author-only name floating over a thing. There is
// no "chair node" or "stage node": a chair is parts, and the proportions that make it a chair live
// in the builder where `check:scene` can assert them, not in the viewer where nothing can.
import type { Point } from "@/lib/studio/hall";
import type { BuiltOutline } from "@/lib/studio/footprint";
import type { Bounds } from "@/lib/studio/geometry";
import type { Texture, TextureImage } from "@/lib/catalog/textures";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { EventPlan } from "@/lib/events/plan";
import type { VenueStructure } from "@/lib/venues/structure";

/** A point in plan mm with a height: +y down the plan, z up from the floor. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Where a body (or one instance of it) stands, in the frame of whatever contains it: the canvas's
 *  own order — translate · rotate · mirror · scale (canvas-stage.tsx:3990) — so a chip's transform
 *  inside a table's transform composes exactly as the 2D draws it (./frame.ts `compose`). `at.z`
 *  is the height of the body's own floor (a chip on a table: the table's top). `scale` is the
 *  drawing scale of a placement (planar; z is never scaled). */
export interface Transform {
  at: Vec3;
  rotationDeg: number;
  mirrored?: boolean;
  scale?: number;
  /** A lean about the thing's own x axis after `rotationDeg` turns it, positive tipping its top
   *  toward its own +y — a box part's `tiltDeg`, for a whole instance: a flower head facing out of
   *  the side of its arrangement. Only ever on an INNER transform (./frame.ts compose). */
  tiltDeg?: number;
  /** A turn about the thing's own up axis BEFORE the lean, so a head's petals are not stamped. */
  spinDeg?: number;
}

/** `leaves` is a crown's leaf cards: a sprite of a leaf cluster cut out by its own alpha, two-sided,
 *  casting no shadow of its own (the clumps under it do). `petal` is a flower's: two-sided (a petal
 *  is a thin sheet seen from both faces) and shaded by its geometry's vertex colours. */
export type MaterialKind = "matte" | "fabric" | "gloss" | "glass" | "metal" | "water" | "foliage" | "leaves" | "petal" | "emissive";

/** A flower head's family of petals (./flowers.ts bloomMesh): a rose's spiral, a peony's ruffled
 *  layers, a tulip's cup, a lily's star, a gerbera's ring round its disc, an orchid's five. */
export type BloomForm = "rose" | "peony" | "cup" | "star" | "face" | "orchid";

/** What a surface is made of. `colour` is the designer's (a shade's swatch, a style's fill) or the
 *  kind's default tone; a `texture` is one of the plan's materials drawn procedurally by the viewer
 *  at its real repeat (./materials.ts TEXTURE_REPEAT_MM) tinted by `colour`; an `image` is the
 *  designer's own picture and wins over `texture`, as on the plan. */
export interface MaterialRef {
  colour: string;
  kind: MaterialKind;
  texture?: Texture;
  image?: TextureImage;
  /** 0–1; absent = opaque. Glass and halos use it. */
  opacity?: number;
}

/** One primitive in a body's own frame. Every `at` is the primitive's BASE centre — x/y its
 *  middle, z its bottom — except a sphere's, which is its centre; a part grows UP from `at.z`.
 *  Outlines and paths are in the part's frame about `at` (a part's own rotation is `rotDeg`). */
export type Part =
  /** `tiltDeg` leans a box or cylinder about its own x axis AFTER `rotDeg` turns it on the plan
   *  (a crossback's X bar, a garden flower's leaning stem, a chuppah's sagging drape): positive
   *  tips the top toward +y. */
  | { shape: "box"; w: number; d: number; h: number; at: Vec3; rotDeg?: number; tiltDeg?: number; material?: MaterialRef }
  | { shape: "cylinder"; rTop: number; rBottom: number; h: number; at: Vec3; segments?: number; rotDeg?: number; tiltDeg?: number; material?: MaterialRef }
  | { shape: "sphere"; r: number; at: Vec3; segments?: number; material?: MaterialRef }
  /** A ring lying flat at `at.z`: `r` to the tube's centre line, `tube` its radius (a chandelier's
   *  ring, a rotunda's entablature, a vase's rim). */
  | { shape: "torus"; r: number; tube: number; at: Vec3; segments?: number; material?: MaterialRef }
  /** A closed outline (bezier edges honoured) extruded `h` up from `at.z`; `holes` are cut out. */
  | { shape: "extrude"; outline: BuiltOutline; holes?: BuiltOutline[]; h: number; at: Vec3; rotDeg?: number; material?: MaterialRef }
  /** A profile of (radius, height) pairs, bottom to top, revolved about the vertical axis at `at`;
   *  `scaleY` stretches it along the plan's y (an oval bowl: its depth over its width). */
  | { shape: "lathe"; profile: { r: number; z: number }[]; at: Vec3; segments?: number; scaleY?: number; material?: MaterialRef }
  /** A flat closed outline at `at.z`, facing up unless told otherwise (a ceiling faces down);
   *  `holes` are cut out (a floor round a recessed pool). */
  | { shape: "plane"; outline: BuiltOutline; holes?: BuiltOutline[]; at: Vec3; side?: "up" | "down" | "both"; rotDeg?: number; material?: MaterialRef }
  /** A vertical strip `h` high standing on `path` (a skirt along a stage edge, a curtain along a
   *  wall): `pleatMm` is the wavelength of its pleats, absent/0 = flat. */
  | { shape: "ribbon"; path: Point[]; h: number; at: Vec3; pleatMm?: number; amplitudeMm?: number; material?: MaterialRef }
  /** A cloth hanging from a closed RIM (`outline`, the cloth's edge where it leaves the table, a
   *  flattened polygon about `at`) down `h` to the floor: folds every `foldPitchMm` that deepen to
   *  `foldDepthMm` at the hem, the hem flaring `flareMm` out. Smooth-shaded — fabric, not facets. */
  | { shape: "drape"; outline: Point[]; h: number; at: Vec3; foldPitchMm?: number; foldDepthMm?: number; flareMm?: number; material?: MaterialRef }
  /** An organic mass — a canopy's clump, a shrub, a hydrangea's mophead: a ball `r` across its
   *  middle whose surface seeded lumps push in and out (`lumps` round its girth, `rough` of r deep,
   *  ./organic.ts lumpField), `squash` its height over its width. `at` is its CENTRE, as a sphere's;
   *  `detail` its subdivision (2 a far shrub, 3 a near canopy or a floret head). */
  | { shape: "blob"; r: number; at: Vec3; seed: number; lumps?: number; rough?: number; squash?: number; detail?: number; material?: MaterialRef }
  /** A leaf or a palm frond grown from `at` along its own +y (turned `rotDeg`): `len` long, rising
   *  `liftDeg` above level and drooping `droopDeg` by its tip. A blade `w` wide at its widest, its
   *  halves folded `foldDeg` up; or, with `leaflets`, pinnate — that many pairs of leaflets up to `w`
   *  long off a thin rachis, hanging `foldDeg` below it (./organic.ts frondTriangles). */
  | { shape: "frond"; len: number; w: number; at: Vec3; rotDeg?: number; liftDeg?: number; droopDeg?: number; leaflets?: number; foldDeg?: number; material?: MaterialRef }
  /** A crown's LEAF CARDS (./plants.ts): square sprites of a leaf cluster, cut out by the `leaves`
   *  material's alpha — what breaks a canopy's outline into leaves and lets the sky through, where
   *  the clumps under them keep its mass. Each card stands about `at`; every card is lit as if the
   *  crown were round, its normal pointing away from `centre` (about `at` too). */
  | { shape: "leaves"; at: Vec3; centre: Vec3; cards: LeafCard[]; material?: MaterialRef }
  /** A flower head of real petals (./flowers.ts bloomMesh), opening up +z, `r` across its widest
   *  ring as the plan draws it. `at` is its CENTRE, as a sphere's; `seed` varies its petals; a face
   *  has `petals` round a `disc` (#rrggbb) of its own colour — a sunflower's brown. */
  | { shape: "bloom"; form: BloomForm; r: number; at: Vec3; seed: number; disc?: string; petals?: number; material?: MaterialRef };

/** One leaf card: `size` across, centred at (x, y, z), turned `yawDeg` on the plan and tipped
 *  `pitchDeg` back from upright (0 = a vertical card, 90 = lying flat), showing atlas `tile` (0–3)
 *  at `shade` of the material's colour. */
export interface LeafCard {
  x: number;
  y: number;
  z: number;
  size: number;
  yawDeg: number;
  pitchDeg: number;
  tile: number;
  shade: number;
}

export type NodeType =
  | "ground" | "floor" | "wall" | "door" | "window" | "ceiling" | "feature"
  | "table" | "cloth" | "chair" | "item" | "flowers" | "tableware"
  | "stage" | "deck" | "edge" | "skirt" | "corner" | "railing";

/** What a body is, for the author's hover name and for the self-check's counts. `id` is the
 *  document/venue id of the thing it belongs to, when it has one. */
export interface NodeTag {
  type: NodeType;
  id?: string;
  label?: string;
}

/** One geometry (its parts, in the body's own frame), placed once or many times. A body with many
 *  instances is drawn as ONE instanced mesh — every chair of one style and colour in the room, every
 *  rose head of one colour — so the builder groups what can share a geometry, and the viewer never
 *  has to. Parts with no `material` take the body's. */
export interface BodyNode {
  kind: "body";
  id: string;
  parts: Part[];
  material: MaterialRef;
  instances: Transform[];
  tag: NodeTag;
  /** A near/far pair: the `near` body hides beyond `beyondMm` from the camera and the `far` one
   *  shows beyond it (flower fills vanish, chairs become boxes). Absent = always drawn. */
  lod?: { tier: "near" | "far"; beyondMm: number };
  /** Absent = casts a shadow (walls, tables, big things). Flowers, chairs and small items say
   *  false: six hundred shadow casters is what sinks a phone. */
  castShadow?: boolean;
}

/** A thing that glows in the evening and at night — a flame, a bulb, a lamp's shade. The viewer
 *  dims it by mood and decides which few get a real light; the builder only says where. */
export interface EmitterNode {
  kind: "emitter";
  id: string;
  at: Vec3;
  radiusMm: number;
  colour: string;
  /** 0–1. A candle flame ~0.4, a chandelier bulb ~0.7, a lamp ~1. */
  strength: number;
}

/** Author mode only: a name floating over a thing (a table number for setting a viewpoint). */
export interface LabelNode {
  kind: "label";
  id: string;
  at: Vec3;
  text: string;
}

export type SceneNode = BodyNode | EmitterNode | LabelNode;

export type Mood = "day" | "evening" | "night";
export const MOODS: readonly Mood[] = ["day", "evening", "night"];
export const MOOD_LABEL: Record<Mood, string> = { day: "יום", evening: "ערב", night: "לילה" };

/** A saved camera: where the eye is and what it looks at, in plan mm with z up. */
export interface Viewpoint {
  id: string;
  name: string;
  eye: Vec3;
  look: Vec3;
  /** Vertical field of view; absent = DEFAULT_FOV_DEG. */
  fovDeg?: number;
}

export interface TourStop {
  viewpointId: string;
  dwellMs: number;
  travelMs: number;
}

export interface Tour {
  stops: TourStop[];
  loop: boolean;
}

/** Everything about the 3D view that is NOT the drawing: the designer's camera work and the mood.
 *  Stored per event (event_scenes.settings), never inside the design document. */
export interface SceneSettings {
  mood: Mood;
  /** Empty = the generated defaults (./viewpoints.ts defaultViewpoints). */
  viewpoints: Viewpoint[];
  tour: Tour | null;
  /** A place setting at every seat (./tableware.ts) — an illustration, never counted or quoted.
   *  Absent = on. */
  tableware?: boolean;
}

export const DEFAULT_SETTINGS: SceneSettings = { mood: "evening", viewpoints: [], tour: null };
export const DEFAULT_FOV_DEG = 55;
export const EYE_MM = 1600;
export const SEATED_EYE_MM = 1200;
export const MAX_VIEWPOINTS = 40;
export const DEFAULT_DWELL_MS = 4000;
export const DEFAULT_TRAVEL_MS = 1500;

/** The envelope's constants (spec §3.1, DECIDE 6). Nothing in the venue stores these yet. */
export const WALL_THICK_MM = 200;
export const GARDEN_WALL_MM = 1000;
export const KERB_MM = 150;
export const KERB_THICK_MM = 100;
export const DOOR_HEIGHT_MM = 2100;
export const DOOR_LEAF_MM = 40;
export const GROUND_MARGIN_MM = 20000;
export const WATER_DEPTH_MM = 300;

export interface Scene {
  nodes: SceneNode[];
  /** The plan's frame (EventPlan.bounds), for the ground, the sky and the default camera. */
  bounds: Bounds;
  /** The tallest roofed zone's ceiling, or null when nothing on the plan has a ceiling — what a
   *  chandelier's chain reaches for and the author camera's upper clamp. */
  roofedMm: number | null;
  stats: { bodies: number; instances: number; emitters: number };
}

/** What `buildScene` takes. `structure` is the venue's structure WITH this event's moves and
 *  removals applied (arrangedStructure) — the walls come from it too, they never move. The catalog
 *  must be primed (lib/catalog/storage.ts primeCatalog) before building, as for the printed map. */
export interface SceneInput {
  doc: DesignDocumentContent;
  plan: EventPlan;
  structure: VenueStructure;
  settings: SceneSettings;
  /** The designer's view: labels, missing stage pieces, stats. Never true on a client surface. */
  author: boolean;
  /** The studio's stage railing rule (settings → במות, studio_settings.stage_railing_above_mm):
   *  a stage higher than this wears a railing on its open sides. Absent/null = off. */
  railingAboveMm?: number | null;
}

// --- small constructors, so builders read as geometry rather than as object literals -----------

export const vec3 = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

export function transform(at: Vec3, rotationDeg = 0, mirrored = false, scale = 1): Transform {
  const t: Transform = { at, rotationDeg };
  if (mirrored) t.mirrored = true;
  if (scale !== 1) t.scale = scale;
  return t;
}

export function body(id: string, tag: NodeTag, material: MaterialRef, parts: Part[], instances: Transform[], extra?: Partial<Pick<BodyNode, "lod" | "castShadow">>): BodyNode {
  return { kind: "body", id, parts, material, instances, tag, ...extra };
}

export function emitter(id: string, at: Vec3, radiusMm: number, colour: string, strength: number): EmitterNode {
  return { kind: "emitter", id, at, radiusMm, colour, strength };
}
