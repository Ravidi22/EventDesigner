// A CARPET LAID OVER something on the plan — a venue surface (a lawn, a face-filling floor, the
// venue's own stage) or one of this sketch's stages — and reshaped with it (2026-11-07, Ravid:
// "click on surface in design and put on it carpet… mostly surface and stages"; spec docs/superpowers/
// specs/2026-11-07-venue-heights-rails-and-covers-design.md §8).
//
// The link is `Placement.cover` ({ featureId | stageId, insetMm }). The spec had the carpet's shape
// derived on every READ; it is derived here and WRITTEN instead — `outline`/`edgeCurves`/`holes` in
// the placement's own frame plus `position`, `rotation` and `sizeMm` — because `placementFootprint`
// and most readers (the quote, the stacker, the canvas, the printed sheets, the 3D room) are handed
// a placement and its catalog row and nothing else: not the venue, not the other placements. So:
//
//   • `settleCovers` runs in the reducer after every action (lib/design-document/actions.ts apply,
//     beside settleHung): a stage moved, resized, reshaped or merged carries its carpet in the SAME
//     undo entry. A venue surface is read through THIS event's arrangement of the venue
//     (arrangedStructure), from the structure the studio primes here (`primeCovers`).
//   • `adoptCovers` runs once when a sketch is opened (the adoptHung pattern), so a surface reshaped
//     at /halls since reshapes its carpet the next time the sketch opens.
//   • A covered thing that is GONE (the stage deleted, the surface taken out of this event's room or
//     off the property) leaves the last written shape standing — the bar says so and offers
//     "ניתוק מהמשטח", which drops the link and keeps `outline`: a detached carpet stays the shape it
//     was laid in, and a resize scales that shape (`carpetShape`).
//
// The inset is evenInset — the contour's even offset (lib/studio/footprint.ts), which holds its
// width round a corner smaller than the inset. A stage's hole (StagePiece.hole) is a hole in its
// carpet: clipped to the carpet, so a hole at the stage's rim notches it rather than poking out.
//
// Pure; self-checked: npm run check:cover.
import type { DesignDocumentContent, Placement, PlacementCover, Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "./hall";
import { customShapeBounds, evenInset, flattenEdge, footprintOutlines, type BuiltOutline, type Footprint } from "./footprint";
import { outlineAreaMm2 } from "./shaped-outline";
import { outlinePathD } from "./geometry";
import { stageHoles, type DeckLookup, type StagePlacement } from "@/lib/design-document/stage";
import { featureFootprint, FEATURE_KIND_LABEL, SURFACE_MATERIAL_LABEL, surfaceMaterial, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { arrangedStructure } from "@/lib/design-document/features";
import { isMain } from "../self-check";

/** What the settle needs that a document does not hold: the VENUE (raw — it is arranged per document
 *  here) for a carpet on a venue surface, and the deck lookup for the size of a stage's hole. Either
 *  absent = covers of that kind are left as they stand. */
export interface CoverContext {
  structure?: VenueStructure;
  deckOf?: DeckLookup;
}

// The studio primes it for the open event — the same synchronous-cache shape as the catalog's
// (lib/catalog/storage.ts) and the event's shades (catalog-resolver primeEventShades), for the same
// reason: the reducer runs mid-gesture and cannot be handed the venue by every one of its callers.
// Empty everywhere else (the server, the client's sketch, the composite editor): a stage's carpet
// still follows its stage there, a venue surface's simply stays as it stands.
let primed: CoverContext = {};

/** The open event's venue and deck lookup, for every settle until the next prime. */
export function primeCovers(ctx: CoverContext): void {
  primed = ctx;
}

/** Which kinds of venue feature take a carpet: the ground, and the venue's own stage. */
export const COVERABLE_FEATURES: readonly StructureFeature["kind"][] = ["surface", "stage"];

/** A carpet's shape where it is drawn: its outline (and holes) in its own centred frame, stretched to
 *  its `sizeMm`, and that size. */
export interface CarpetShape {
  outline: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  holes: Point[][];
  widthMm: number;
  depthMm: number;
}

/** The fields a cover writes onto its carpet. */
interface Laid {
  position: Point;
  rotation: number;
  sizeMm: { widthMm: number; depthMm: number };
  outline: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  holes?: Point[][];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const rp = (p: Point): Point => ({ x: r1(p.x), y: r1(p.y) });
const RAD = Math.PI / 180;
const turn = (p: Point, deg: number): Point => {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};
const norm360 = (deg: number) => ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360;

function shoelace(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function inside(p: Point, poly: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** An outline as a polygon, curves sampled. */
export function flatOutline(o: { outline: readonly Point[]; edgeCurves?: readonly (EdgeCurve | null)[] }): Point[] {
  const n = o.outline.length;
  return o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % n], o.edgeCurves?.[i]).slice(0, -1));
}

function convex(poly: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cr);
    else if (Math.sign(cr) !== sign) return false;
  }
  return true;
}

/** `subject` clipped to the CONVEX `clip` (Sutherland–Hodgman): what of the carpet lies inside the
 *  hole. The subject may be concave; the clip may be wound either way. */
function clipTo(subject: readonly Point[], clip: readonly Point[]): Point[] {
  const ccw = shoelace(clip) > 0;
  let out = [...subject];
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: Point) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * (ccw ? 1 : -1);
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k];
      const q = input[(k + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 0.05;
  });
}

/** A hole as it is cut from a carpet whose polygon is `carpet`: itself when it lies inside, the part
 *  of the carpet inside it when it crosses the edge (a convex hole — every deck is), else nothing. */
function cutHole(carpet: readonly Point[], hole: readonly Point[]): Point[] | null {
  if (hole.length < 3) return null;
  if (hole.every((p) => inside(p, carpet)) && !carpet.some((p) => inside(p, hole))) return [...hole];
  if (!convex(hole)) return null;
  const cut = clipTo(carpet, hole);
  return cut.length >= 3 && Math.abs(shoelace(cut)) > 100 ? cut : null;
}

/** The largest of a footprint's outlines — a ring-shaped surface's keyhole, a composite's base. */
function largest(pieces: readonly BuiltOutline[]): BuiltOutline | null {
  let best: BuiltOutline | null = null;
  let area = 0;
  for (const p of pieces) {
    if (p.open || p.outline.length < 3) continue;
    const a = Math.abs(shoelace(flatOutline(p)));
    if (a > area) {
      best = p;
      area = a;
    }
  }
  return best;
}

/** `base` (in a frame whose origin stands at `centre`, turned `rotation`) pulled in by `insetMm`,
 *  `holes` cut from it, as the fields a carpet stores: recentred on its own box, the box's middle
 *  carried out into the room. Null when nothing is left inside. */
function lay(base: BuiltOutline, centre: Point, rotation: number, insetMm: number, holes: readonly Point[][]): Laid | null {
  const inner = insetMm > 0 ? evenInset(base, insetMm) : base;
  if (!inner || inner.outline.length < 3) return null;
  const b = customShapeBounds(inner.outline, inner.edgeCurves);
  if (!(b.w > 0 && b.h > 0)) return null;
  const c = { x: b.cx, y: b.cy };
  const local = (p: Point): Point => ({ x: p.x - c.x, y: p.y - c.y });
  const outline = inner.outline.map((p) => rp(local(p)));
  const curved = inner.edgeCurves?.some(Boolean);
  const edgeCurves = curved ? inner.edgeCurves!.map((e) => (e ? { c1: rp(e.c1), c2: rp(e.c2) } : null)) : undefined;
  const flat = flatOutline({ outline, edgeCurves });
  const cut = holes.map((h) => cutHole(flat, h.map(local))).filter((h): h is Point[] => !!h).map((h) => h.map(rp));
  const at = turn(c, rotation);
  return {
    position: { x: r1(centre.x + at.x), y: r1(centre.y + at.y) },
    rotation: norm360(rotation),
    sizeMm: { widthMm: Math.round(b.w), depthMm: Math.round(b.h) },
    outline,
    ...(edgeCurves ? { edgeCurves } : {}),
    ...(cut.length ? { holes: cut } : {}),
  };
}

/** A venue feature's carpet: its drawn outline (curves and rounded corners — featureFootprint) where
 *  this event has it. */
function layOnFeature(f: StructureFeature, insetMm: number): Laid | null {
  const base = largest(footprintOutlines(featureFootprint(f)));
  return base ? lay(base, { x: f.x, y: f.y }, f.rotationDeg ?? 0, insetMm, []) : null;
}

/** A stage's carpet: its outline in its own frame — a mirrored stage's flipped into it, so the carpet
 *  itself is never mirrored — and its holes. `undefined` when a hole's deck is not known to the
 *  lookup: its size cannot be told, so the carpet is left as it stands rather than laid without it. */
function layOnStage(s: StagePlacement, insetMm: number, deckOf: DeckLookup | undefined): Laid | null | undefined {
  const flip = (q: Point): Point => (s.mirrored ? { x: -q.x, y: q.y } : q);
  const wanted = (s.stage.pieces ?? []).filter((pc) => pc.hole).length;
  const holes = wanted ? stageHoles(s.stage, deckOf ?? (() => undefined)) : [];
  if (holes.length < wanted) return undefined;
  return lay({ outline: s.stage.outline.map(flip) }, s.position, s.rotation || 0, insetMm, holes.map((h) => h.outline.map(flip)));
}

/** A cover as stored: exactly one id, a whole, non-negative inset (absent at 0). Null for none. */
export function cleanCover(raw: PlacementCover | null | undefined): PlacementCover | null {
  if (!raw) return null;
  const inset = Number.isFinite(raw.insetMm) ? Math.max(0, Math.round(raw.insetMm!)) : 0;
  const keep = inset > 0 ? { insetMm: inset } : {};
  if (raw.stageId) return { stageId: raw.stageId, ...keep };
  if (raw.featureId) return { featureId: raw.featureId, ...keep };
  return null;
}

/** The thing a cover lies on, in `doc` — a venue feature through this event's arrangement, or a stage.
 *  `null` = gone; `undefined` = cannot be told here (a venue surface with no venue to hand). */
function targetOf(
  cover: PlacementCover,
  doc: DesignDocumentContent,
  arranged: () => VenueStructure | null,
): { feature: StructureFeature } | { stage: StagePlacement } | null | undefined {
  if (cover.stageId) {
    const s = doc.placements.find((x) => x.id === cover.stageId);
    return s?.stage ? { stage: s as StagePlacement } : null;
  }
  if (cover.featureId) {
    const structure = arranged();
    if (!structure) return undefined;
    const f = structure.features.find((x) => x.id === cover.featureId);
    return f ? { feature: f } : null;
  }
  return null;
}

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** `p` with its cover laid again from what it covers in `doc`. The same object when nothing moved,
 *  and `prev` itself when the result is exactly what it was before the action (a nudge of a covered
 *  rug, put straight back). A target that is gone, or cannot be read, leaves `p` as it stands. */
function settleOne(p: Placement, doc: DesignDocumentContent, ctx: CoverContext, arranged: () => VenueStructure | null, prev?: Placement): Placement {
  const cover = cleanCover(p.cover);
  if (!cover) return p;
  const target = targetOf(cover, doc, arranged);
  if (!target) return p;
  const laid = "stage" in target ? layOnStage(target.stage, cover.insetMm ?? 0, ctx.deckOf) : layOnFeature(target.feature, cover.insetMm ?? 0);
  if (!laid) return p;
  // A rectangle's bows and corners mean nothing on an outline; the outline's own curves say it all.
  // Nor is the carpet ever mirrored — a mirrored stage's outline is flipped into it (layOnStage).
  const { bows: _b, corners: _c, edgeCurves: _e, holes: _h, mirrored: _m, ...rest } = p;
  void _b;
  void _c;
  void _e;
  void _h;
  void _m;
  const next: Placement = { ...rest, ...laid };
  if (prev && same(next, prev)) return prev;
  return same(next, p) ? p : next;
}

/** Every covered carpet whose cover, or whose covered thing, the step `before` → `after` changed,
 *  laid again (`before` absent = every one — the sketch being opened). `after` itself when nothing
 *  moved; `before` itself when the step was undone by the settle (a covered rug nudged and put back),
 *  so that step is no history entry. */
export function settleCovers(before: DesignDocumentContent | undefined, after: DesignDocumentContent, ctx: CoverContext = primed): DesignDocumentContent {
  if (after === before || !after.placements.some((p) => p.cover)) return after;
  const was = before ? new Map(before.placements.map((p) => [p.id, p])) : null;
  const now = new Map(after.placements.map((p) => [p.id, p]));
  let structure: VenueStructure | null | undefined;
  const arranged = () => (structure === undefined ? (structure = ctx.structure ? arrangedStructure(ctx.structure, after) : null) : structure);
  const featuresMoved = !before || before.features !== after.features;
  let changed = false;
  const placements = after.placements.map((p) => {
    if (!p.cover) return p;
    const prev = was?.get(p.id);
    const due =
      !was ||
      prev !== p ||
      (p.cover.stageId ? was.get(p.cover.stageId) !== now.get(p.cover.stageId) : featuresMoved);
    if (!due) return p;
    const next = settleOne(p, after, ctx, arranged, prev);
    if (next !== p) changed = true;
    return next;
  });
  if (!changed) return after;
  const settled = { ...after, placements };
  if (before && Object.keys(settled).every((k) => k === "placements" || (settled as Record<string, unknown>)[k] === (before as unknown as Record<string, unknown>)[k])) {
    if (placements.length === before.placements.length && placements.every((p, i) => p === before.placements[i])) return before;
  }
  return settled;
}

/** Every carpet laid again over what it covers — run once when a sketch is opened, so a surface
 *  reshaped at /halls since reshapes its carpet. The document itself when nothing moved. */
export function adoptCovers(doc: DesignDocumentContent, structure: VenueStructure, deckOf?: DeckLookup): DesignDocumentContent {
  return settleCovers(undefined, doc, { structure, deckOf });
}

/** The carpet a NEW cover lays — `p` (a rug placement with `cover` set) with its shape written, for
 *  the caller that adds it, so it arrives whole whatever has been primed. `p` when it cannot be laid. */
export function layCover(p: Placement, doc: DesignDocumentContent, ctx: CoverContext): Placement {
  let structure: VenueStructure | null | undefined;
  const arranged = () => (structure === undefined ? (structure = ctx.structure ? arrangedStructure(ctx.structure, doc) : null) : structure);
  return settleOne(p, doc, ctx, arranged);
}

/** The link let go, the shape kept — "ניתוק מהמשטח", a paste (it would jump back onto its surface
 *  otherwise) and a sketch carried into another venue. The same object when there is no link. */
export function detachCover<T extends Pick<Placement, "cover">>(p: T): T {
  if (!p.cover) return p;
  const { cover: _c, ...rest } = p;
  void _c;
  return rest as T;
}

/** What a carpet lies on, for its bar: the name, and whether it is still there. Null for a carpet
 *  laid by hand. `structure` may be raw or arranged — a surface taken out of this event's room is
 *  read as gone either way. */
export function coverTarget(p: Placement, doc: DesignDocumentContent, structure: VenueStructure | undefined): { name: string; kind: "stage" | "feature"; present: boolean } | null {
  const cover = cleanCover(p.cover);
  if (!cover) return null;
  if (cover.stageId) {
    const s = doc.placements.find((x) => x.id === cover.stageId);
    return { name: "הבמה", kind: "stage", present: !!s?.stage };
  }
  const arranged = structure ? arrangedStructure(structure, doc) : null;
  const f = arranged?.features.find((x) => x.id === cover.featureId) ?? structure?.features.find((x) => x.id === cover.featureId);
  const name = f ? featureName(f) : "המשטח";
  return { name, kind: "feature", present: !!arranged?.features.some((x) => x.id === cover.featureId) };
}

/** A venue feature as a carpet's verb names it: its own label, else what it is laid in. */
export function featureName(f: StructureFeature): string {
  if (f.label) return f.label;
  return f.kind === "surface" ? SURFACE_MATERIAL_LABEL[surfaceMaterial(f)] : FEATURE_KIND_LABEL[f.kind];
}

// ── reading a carpet ────────────────────────────────────────────────────────────────────────────

const shapes = new WeakMap<Placement, CarpetShape | null>();

/** A carpet laid to an outline (Placement.outline), as drawn: centred on its box and stretched to its
 *  `sizeMm` (a detached carpet resized scales its shape; a covered one is written at scale 1). Null
 *  for a rug that is a rectangle. Cached per placement object — the canvas asks every render. */
export function carpetShape(p: Placement): CarpetShape | null {
  if (!p.outline || p.outline.length < 3) return null;
  const hit = shapes.get(p);
  if (hit !== undefined) return hit;
  const b = customShapeBounds(p.outline, p.edgeCurves);
  if (!(b.w > 0 && b.h > 0)) {
    shapes.set(p, null);
    return null;
  }
  const want = p.sizeMm;
  const sx = want && want.widthMm > 0 && Math.abs(want.widthMm - b.w) > 1 ? want.widthMm / b.w : 1;
  const sy = want && want.depthMm > 0 && Math.abs(want.depthMm - b.h) > 1 ? want.depthMm / b.h : 1;
  const at = (q: Point): Point => ({ x: (q.x - b.cx) * sx, y: (q.y - b.cy) * sy });
  const curves = p.edgeCurves?.some(Boolean) ? p.edgeCurves.map((c) => (c ? { c1: { x: c.c1.x * sx, y: c.c1.y * sy }, c2: { x: c.c2.x * sx, y: c.c2.y * sy } } : null)) : undefined;
  const shape: CarpetShape = {
    outline: p.outline.map(at),
    ...(curves ? { edgeCurves: curves } : {}),
    holes: (p.holes ?? []).filter((h) => h.length >= 3).map((h) => h.map(at)),
    widthMm: b.w * sx,
    depthMm: b.h * sy,
  };
  shapes.set(p, shape);
  return shape;
}

/** The outline as a footprint — what `placementFootprint` returns for such a carpet. */
export function carpetFootprint(shape: CarpetShape): Footprint {
  return { kind: "custom", outline: shape.outline, ...(shape.edgeCurves ? { edgeCurves: shape.edgeCurves } : {}) };
}

/** Its floor in square millimetres — the outline's true area (curves integrated) less its holes. What
 *  a rug priced per m² bills. Null for a rectangle (the caller's width × depth). */
export function carpetAreaMm2(p: Placement): number | null {
  const s = carpetShape(p);
  if (!s) return null;
  return Math.max(0, outlineAreaMm2(s.outline, s.edgeCurves) - s.holes.reduce((n, h) => n + Math.abs(shoelace(h)), 0));
}

/** One SVG path for the carpet — its outline and every hole — to be filled even-odd. */
export function carpetPathD(s: CarpetShape): string {
  return [outlinePathD(s.outline, s.edgeCurves), ...s.holes.map((h) => outlinePathD(h))].join(" ");
}

/** The carpet as a polygon in its own frame (curves sampled), for a hit, a box or a stack. */
export function carpetPolygon(s: CarpetShape): Point[] {
  return flatOutline(s);
}

// ponytail: self-check. Run: npm run check:cover
if (isMain(import.meta.url)) {
  const assert = (c: unknown, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
  const doc = (placements: Placement[], features?: DesignDocumentContent["features"]): DesignDocumentContent => ({ calibration: { mmPerUnit: 1 }, tables: [], placements, ...(features ? { features } : {}) });
  const rug = (cover: PlacementCover, extra: Partial<Placement> = {}): Placement => ({ id: "rug", variantId: "v-rug", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, cover, ...extra });
  const feature = (f: Partial<StructureFeature> & Pick<StructureFeature, "id" | "shape" | "widthMm" | "depthMm">): StructureFeature => ({ kind: "surface", label: "דשא", x: 5000, y: 5000, heightMm: 0, rotationDeg: 0, surface: "grass", ...f });
  const venue = (features: StructureFeature[]): VenueStructure => ({ nodes: [], walls: [], entrances: [], features });
  /** The carpet's outline where it lies in the room. */
  const inRoom = (p: Placement) => carpetPolygon(carpetShape(p)!).map((q) => {
    const t = turn(q, p.rotation);
    return { x: p.position.x + t.x, y: p.position.y + t.y };
  });

  // ── a rectangle, turned ──
  const lawn = feature({ id: "lawn", shape: "rect", widthMm: 4000, depthMm: 3000, rotationDeg: 30 });
  const onLawn = adoptCovers(doc([rug({ featureId: "lawn" })]), venue([lawn])).placements[0];
  assert(onLawn.sizeMm?.widthMm === 4000 && onLawn.sizeMm.depthMm === 3000, "a carpet over a 4×3 lawn is 4×3");
  assert(near(onLawn.position.x, 5000) && near(onLawn.position.y, 5000) && onLawn.rotation === 30, "…where the lawn is, turned as it is");
  assert(near(carpetAreaMm2(onLawn)!, 12e6, 1e3), "…and bills its twelve square metres");
  const inset = adoptCovers(doc([rug({ featureId: "lawn", insetMm: 200 })]), venue([lawn])).placements[0];
  assert(inset.sizeMm?.widthMm === 3600 && inset.sizeMm.depthMm === 2600, `an inset of 20cm leaves 3.6×2.6 (${inset.sizeMm?.widthMm}×${inset.sizeMm?.depthMm})`);
  assert(near(inset.position.x, 5000) && near(inset.position.y, 5000), "…on the lawn's middle");

  // ── an ellipse: its curves are kept ──
  const oval = feature({ id: "oval", shape: "ellipse", widthMm: 6000, depthMm: 4000 });
  const onOval = adoptCovers(doc([rug({ featureId: "oval" })]), venue([oval])).placements[0];
  assert(onOval.edgeCurves?.filter(Boolean).length === 4, "a carpet over an oval lawn keeps the oval's four curves");
  assert(Math.abs(carpetAreaMm2(onOval)! / (Math.PI * 3000 * 2000) - 1) < 0.005, `…and its area is the ellipse's (${carpetAreaMm2(onOval)})`);
  const ovalIn = adoptCovers(doc([rug({ featureId: "oval", insetMm: 300 })]), venue([oval])).placements[0];
  assert(near(ovalIn.sizeMm!.widthMm, 5400, 2) && near(ovalIn.sizeMm!.depthMm, 3400, 2), `…and 30cm in it is 5.4×3.4 (${ovalIn.sizeMm?.widthMm}×${ovalIn.sizeMm?.depthMm})`);

  // ── a bowed and rounded hand-drawn bed ──
  const bed = feature({
    id: "bed",
    shape: "custom",
    widthMm: 6000,
    depthMm: 3000,
    outline: [{ x: -3000, y: -1500 }, { x: 3000, y: -1500 }, { x: 3000, y: 1500 }, { x: -3000, y: 1500 }],
    edgeCurves: [{ c1: { x: 1000, y: -600 }, c2: { x: -1000, y: -600 } }, null, null, null],
    corners: [null, null, 500, 500],
  });
  const fp = featureFootprint(bed);
  const truth = outlineAreaMm2(footprintOutlines(fp)[0].outline, footprintOutlines(fp)[0].edgeCurves);
  const onBed = adoptCovers(doc([rug({ featureId: "bed" })]), venue([bed])).placements[0];
  assert(Math.abs(carpetAreaMm2(onBed)! / truth - 1) < 0.002, `a bowed, rounded bed: the carpet's area is the bed's (${carpetAreaMm2(onBed)} vs ${truth})`);
  assert((onBed.edgeCurves?.filter(Boolean).length ?? 0) >= 3, "…its bow and its two rounded corners are curves on the carpet");
  const bedIn = adoptCovers(doc([rug({ featureId: "bed", insetMm: 150 })]), venue([bed])).placements[0];
  assert(carpetAreaMm2(bedIn)! < carpetAreaMm2(onBed)! && near(bedIn.sizeMm!.widthMm, onBed.sizeMm!.widthMm - 300, 3), "…and 15cm in it is 30cm narrower");

  // ── a stage: carried when it moves, its holes cut ──
  const stage: Placement = {
    id: "st",
    variantId: "deck",
    layer: "floor",
    quantity: 1,
    position: { x: 10000, y: 8000 },
    rotation: 0,
    scale: 1,
    stage: { outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 2000 }, { x: -3000, y: 2000 }], front: 0, decks: ["deck"] },
  };
  const decks: DeckLookup = (id) => (id === "deck" ? { id, widthMm: 1000, depthMm: 500, heightMm: 600 } : undefined);
  const ctx: CoverContext = { deckOf: decks };
  const d0 = settleCovers(undefined, doc([stage, rug({ stageId: "st", insetMm: 100 })]), ctx);
  const c0 = d0.placements[1];
  assert(c0.sizeMm?.widthMm === 5800 && c0.sizeMm.depthMm === 3800 && near(c0.position.x, 10000) && near(c0.position.y, 8000), "a carpet 10cm in from a 6×4 stage's edge is 5.8×3.8 on its middle");
  const movedStage = { ...stage, position: { x: 12000, y: 9000 }, rotation: 90 };
  const d1 = settleCovers(d0, { ...d0, placements: [movedStage, c0] }, ctx);
  const c1 = d1.placements[1];
  assert(near(c1.position.x, 12000) && near(c1.position.y, 9000) && c1.rotation === 90, "the stage moved and turned: its carpet with it");
  const untouched = { ...d1, tables: [...d1.tables] };
  assert(settleCovers(d1, untouched, ctx).placements[1] === c1, "a step that leaves the stage alone leaves the carpet alone");
  const nudged = { ...d1, placements: [movedStage, { ...c1, position: { x: 0, y: 0 } }] };
  assert(settleCovers(d1, nudged, ctx) === d1, "a covered carpet nudged is put straight back — and the step is no step at all");
  // A hole in the middle, and one at the rim.
  const holed: Placement = { ...stage, stage: { ...stage.stage!, pieces: [{ variantId: "deck", centre: { x: 0, y: 0 }, rotation: 0, hole: true }, { variantId: "deck", centre: { x: 2800, y: 0 }, rotation: 90, hole: true }] } };
  const d2 = settleCovers(undefined, doc([holed, rug({ stageId: "st" })]), ctx);
  const c2 = d2.placements[1];
  assert(c2.holes?.length === 2, "the stage's two holes are holes in its carpet");
  // The rim one is a 1000×500 deck stood on end at x 2550…3050: 45cm of it over the carpet.
  assert(near(carpetAreaMm2(c2)!, 24e6 - 0.5e6 - 0.45e6, 2e3), `…the one in the middle whole, the one at the rim only where the carpet is (${carpetAreaMm2(c2)})`);
  const blind = settleCovers(d0, { ...d0, placements: [holed, c0] }, {});
  assert(blind.placements[1] === c0, "with no lookup to size its holes, a holed stage's carpet is left as it stands");
  // A mirrored stage of a non-symmetric outline: the carpet lies over the stage as the plan draws it.
  const ell: Placement = { ...stage, mirrored: true, rotation: 20, stage: { ...stage.stage!, outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 2000 }, { x: -3000, y: 2000 }] } };
  const c3 = settleCovers(undefined, doc([ell, rug({ stageId: "st" })]), ctx).placements[1];
  const toRoomPt = (q: Point) => {
    const t = turn({ x: -q.x, y: q.y }, 20);
    return { x: 10000 + t.x, y: 8000 + t.y };
  };
  const room = ell.stage!.outline.map(toRoomPt);
  assert(room.every((q) => inRoom(c3).some((r) => near(r.x, q.x, 2) && near(r.y, q.y, 2))), "a mirrored, turned L-stage: every corner of its carpet is a corner of the stage");

  // ── detached, gone, moved per event ──
  const loose = detachCover(c1);
  assert(!loose.cover && loose.outline === c1.outline && loose.sizeMm === c1.sizeMm, "detached: the link goes, the shape stays");
  const gone = settleCovers(d1, { ...d1, placements: [c1] }, ctx);
  assert(gone.placements[0] === c1, "the stage deleted: its carpet keeps the last shape it was laid in");
  const removed = adoptCovers(doc([rug({ featureId: "lawn" }, { outline: onLawn.outline, sizeMm: onLawn.sizeMm, position: onLawn.position })], [{ featureId: "lawn", dx: 0, dy: 0, removed: true }]), venue([{ ...lawn, movable: true }]));
  assert(removed.placements[0].position.x === onLawn.position.x && removed.placements[0].outline === onLawn.outline, "a surface taken out of this event's room: the carpet stands as it was");
  const movable = { ...lawn, movable: true, rotationDeg: 0 };
  const e0 = adoptCovers(doc([rug({ featureId: "lawn" })]), venue([movable]));
  const e1 = settleCovers(e0, { ...e0, features: [{ featureId: "lawn", dx: 1000, dy: -500 }] }, { structure: venue([movable]) });
  assert(near(e1.placements[0].position.x, 6000) && near(e1.placements[0].position.y, 4500), "a movable lawn moved for this event: its carpet with it");
  assert(settleCovers(e0, { ...e0, features: [{ featureId: "lawn", dx: 1000, dy: 0 }] }, {}).placements[0] === e0.placements[0], "…but with no venue to hand, the carpet stands");

  // ── a detached carpet resized scales its shape ──
  const big = { ...loose, sizeMm: { widthMm: loose.sizeMm!.widthMm * 2, depthMm: loose.sizeMm!.depthMm * 2 } };
  assert(near(carpetAreaMm2(big)!, carpetAreaMm2(loose)! * 4, 10), "a detached carpet stretched to twice its size is four times the floor");
  assert(carpetShape({ ...loose, outline: undefined }) === null, "a rug with no outline is a rectangle");
  assert(cleanCover({ stageId: "a", featureId: "b", insetMm: -5 })?.stageId === "a" && cleanCover({ featureId: "b", insetMm: 12.4 })?.insetMm === 12, "a cover names one thing, and a whole, non-negative inset");

  console.log("cover ok");
}
