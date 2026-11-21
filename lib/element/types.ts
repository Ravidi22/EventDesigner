// THE ELEMENT MODEL — one definition under every drawing (docs/superpowers/specs/
// 2026-11-07-element-model-design.md).
//
// An ELEMENT is a definition: an assembly of PARTS, each a plan shape (its PROFILE — exactly the
// vocabulary the catalog's shape editor already has, lib/catalog/types.ts MapShape and friends) with
// a place in the element's frame, a HEIGHT and a BOTTOM (z), made by an operation (an extrude of its
// profile, a flat sheet, a revolved side profile). Every reader — the sketch, the printed map, the 3D
// room, the measurer — reads the geometry `elementGeometry` (./geometry.ts) derives from it, so a
// column, a bar with a back-bar or a tiered fountain is ONE description with four pictures.
//
// Stage 1 (this file's first form): the definition is DERIVED from a catalog row's MapAppearance
// (./adapter.ts) — nothing is stored yet, nothing a user sees changes, and the parity check
// (./parity.ts) holds every row's plan to the pixel. Stage 2 lets a part carry its own z and height
// (ShapePart.zMm / heightMm); Stage 3 binds parts to parameters (pins, repeats); later stages store
// definitions as rows. The types here are written for those stages — the fields that do not exist yet
// are simply absent.
//
// PURE: no React, no DB, no three. Imports only types and lib/studio/footprint.ts (the profile engine).
import type { ArcSpec, HollowSpec, MapShape, Pin, Repeat, RevolvePoint, RingSpec } from "@/lib/catalog/types";
import type { Surface } from "@/lib/catalog/textures";
import type { EdgeCurve, Point } from "@/lib/studio/hall";

/** A part's plan shape, in its own frame about its own centre: a MapShape and the measurements it is
 *  drawn from — the same record a base shape or an added part stores today (lib/studio/footprint.ts
 *  ShapeDims). A hand-drawn one carries its outline; a hollow one its band. */
export interface Profile {
  shape: MapShape;
  widthMm?: number;
  depthMm?: number;
  diameterMm?: number;
  outline?: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  /** Lines only: no fill, no closing side (ShapePart.open). */
  open?: boolean;
  arc?: ArcSpec;
  ring?: RingSpec;
  hollow?: HollowSpec;
}

/** What a part IS in the thing, for materials, the mono greys and the quote's per-role counts
 *  (spec §2.1). Absent = the element's body. */
export type PartRole = "frame" | "surface" | "cloth" | "glass" | "ground" | "seat" | "detail" | "light";

/** How a part's solid is made from its profile (spec §2.2). `extrude`: the profile stands `heightMm`
 *  up from `zMm`. `sheet`: a flat face at `zMm`, no thickness (a canopy, a rug). `revolve`: a side
 *  profile turned about the part's centre — a bowl, a basin tier, a baluster — as FRACTIONS of the
 *  part's radius and height (lib/catalog/types.ts RevolvePoint, ./revolve.ts): r = 1 is the rim the
 *  plan draws, z = 1 the part's top. The millimetres are read off the piece as it stands. `none`: an
 *  outline only — on the plan it is the element's reach (a pergola's roof line), in the room it
 *  builds nothing (lib/catalog/types.ts PartBody). */
export type PartOp =
  | { kind: "extrude" }
  | { kind: "sheet" }
  | { kind: "revolve"; profile: RevolvePoint[] }
  | { kind: "none" }
  /** A FRONT shape (lib/catalog/types.ts ShapePart.plane, ./front.ts): the profile is its FACE (x
   *  across, its depth UP), pushed back `thicknessMm`, bent `bendDeg` on the plan, turned
   *  `faceTurnDeg` within the face. On the plan it is its band (lib/studio/footprint.ts frontBand). */
  | { kind: "panel"; thicknessMm: number; bendDeg: number; faceTurnDeg: number };

export interface ElementPart {
  id: string;
  /** The editor's layer name — "דלפק", "מדף אחורי". */
  name?: string;
  role?: PartRole;
  profile: Profile;
  /** The part's centre in the ELEMENT's frame, mm, and its turn about that centre — the ShapePart
   *  offsets every composite stores today. The first part of a derived definition stands at (0, 0). */
  x: number;
  y: number;
  rotation: number;
  /** How the part follows a resize of the element (Stage 3, lib/catalog/types.ts Pin): per axis,
   *  against the base part's box. Absent = scaled with the whole. */
  pin?: Pin;
  /** Laid in copies against the base part (Stage 3, lib/catalog/types.ts Repeat): the profile is the
   *  prototype, the copies are the geometry's pieces — posts at the corners, beams along the sides,
   *  slats at a spacing. Absent = this one part. */
  repeat?: Repeat;
  /** The part's bottom, from the element's own floor (0), and how far it rises from there. */
  zMm: number;
  heightMm: number;
  /** The shape SAID something about its body — its own z or height, a profile — rather than taking
   *  the item's floor and height by default. What a category's recipe (a table's top) hands to the
   *  element model instead of drawing as its own. */
  own?: true;
  op: PartOp;
  /** The part's own surface (a texture or a picture), a layer of its own — lib/catalog/textures.ts. */
  surface?: Surface;
  /** The part's OWN colour (ShapePart.style.fill / MapAppearance.baseStyle.fill), pinned over the
   *  item's shade. Absent = the item's colour. */
  colour?: string;
  /** What the part is MADE of (ShapePart.material / MapAppearance.baseMaterial — lib/catalog/material.ts):
   *  the room builds it in that, over the item's. Absent = the item's. */
  material?: string;
}

export type ParamUnit = "mm" | "count" | "deg" | "choice" | "colour" | "bool" | "percent";

/** A parameter of the definition. Width, depth and height are always the first three; Stage 3 adds
 *  the definition's own and binds parts to them. */
export interface ParamDef {
  key: string;
  label: string;
  unit: ParamUnit;
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  choices?: { value: string; label: string }[];
}

/** Where a definition came from: `row` — derived on read from a catalog row's MapAppearance (Stage
 *  1–2, nothing stored); `builtin` — one of the app's seed definitions; `studio` — the designer's own
 *  row; `market` — copied with a marketplace product. */
export type ElementOrigin = "row" | "builtin" | "studio" | "market";

export interface ElementDefinition {
  id: string;
  version: number;
  name: string;
  params: ParamDef[];
  parts: ElementPart[];
  origin: ElementOrigin;
}

/** The plan box an element is drawn at — a placement's stretched size, else the catalog's. */
export interface ElementSize {
  widthMm: number;
  depthMm: number;
}

/** The three parameters every definition has, in this order. */
export const SIZE_PARAMS = ["width", "depth", "height"] as const;

export function sizeParams(widthMm: number, depthMm: number, heightMm: number): ParamDef[] {
  return [
    { key: "width", label: "רוחב", unit: "mm", default: widthMm, min: 0 },
    { key: "depth", label: "עומק", unit: "mm", default: depthMm, min: 0 },
    { key: "height", label: "גובה", unit: "mm", default: heightMm, min: 0 },
  ];
}
