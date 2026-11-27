// A column — the venue's own pillar, one element (FeatureKind "column", "עמוד"; the user,
// 2026-10-24: "in each pool section there are 2 עמודים, might need to add to the hall option to add
// עמוד, then define them").
//
// Before it existed a venue drew each pillar as a STACK: footprints of one height nested on one
// centre — at אמרה's קוליסאום a 2m square, a ⌀1.5 round and a ⌀0.8 round, 24 times over. The plan
// drew three outlines, the sketch's clearance and the printed sheets measured three things, and only
// the 3D scene (lib/scene/structures.ts) knew to read them back as one column. A column is now one
// feature: its footprint is the PLINTH (square or round, width × depth), the SHAFT rises from it
// `shaftMm` across, and a BASE ring `baseMm` across sits between them (FeatureColumn).
//
// "Define them" is `defineColumns`: the selection's stacks (and a lone built piece picked alone)
// become columns in place — the plinth's place, turn, size, look and lock, the shaft and base read
// off the smaller footprints. It is how the drawn colonnades come across, and the same reading the
// 3D scene used to need (`columnStacks`).
import type { Point } from "../studio/hall";
import { footprintPolygons } from "../studio/proximity";
import { pointInPolygon } from "./faces";
import { featureFootprint, NEW_COLUMN, type FeatureColumn, type StructureFeature, type VenueStructure } from "./structure";

/** A shaft is at least this across (or the plinth's side, if that is less). */
export const SHAFT_MIN_MM = 100;

/** What a column is drawn as: its plinth (the footprint — false when the shaft fills it, a plain
 *  column with no block under it), the base ring round the shaft's foot, and the shaft. */
export interface ColumnParts {
  plinth: boolean;
  baseMm: number | null;
  shaftMm: number;
  square: boolean;
}

const sideOf = (f: Pick<StructureFeature, "widthMm" | "depthMm">) => Math.max(1, Math.min(f.widthMm, f.depthMm));

/** A column's parts, held inside its plinth: the shaft no wider than it, the base between the two. */
export function columnOf(f: Pick<StructureFeature, "column" | "widthMm" | "depthMm">): ColumnParts {
  const side = sideOf(f);
  const spec = f.column ?? NEW_COLUMN;
  const shaft = Math.max(Math.min(SHAFT_MIN_MM, side), Math.min(side, spec.shaftMm > 0 ? spec.shaftMm : side * 0.66));
  const base = spec.baseMm && spec.baseMm > shaft + 1 ? Math.min(side, spec.baseMm) : null;
  return { plinth: shaft < side - 1, baseMm: base, shaftMm: shaft, square: !!spec.square };
}

/** The spec a patch writes: whole millimetres, the shaft inside the plinth, a base wider than the
 *  shaft or none at all. */
export function columnPatch(f: Pick<StructureFeature, "column" | "widthMm" | "depthMm">, patch: Partial<FeatureColumn>): { column: FeatureColumn } {
  const side = sideOf(f);
  const next = { ...(f.column ?? NEW_COLUMN), ...patch };
  const shaftMm = Math.round(Math.max(Math.min(SHAFT_MIN_MM, side), Math.min(side, next.shaftMm)));
  const base = next.baseMm && next.baseMm > shaftMm ? Math.round(Math.min(side, next.baseMm)) : undefined;
  return { column: { shaftMm, ...(base ? { baseMm: base } : {}), ...(next.square ? { square: true } : {}) } };
}

// --- reading stacks -------------------------------------------------------------------------------

/** Two footprints share a centre within this share of the smaller's size (and at least 30mm). */
const CENTRE_SHARE = 0.08;
/** A column's pieces are COMPACT: no longer than this over their width, filling this much of their
 *  box (a circle 0.79, a square 1) — a band piece of a ring beam is neither. */
const COMPACT_ASPECT = 1.4;
const COMPACT_FILL = 0.7;

/** What a stack can be made of: a built thing with a height. */
const stackable = (f: StructureFeature) => (f.kind === "structure" || f.kind === "other") && f.heightMm > 0;

function polysOf(f: StructureFeature): Point[][] {
  return footprintPolygons(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0);
}

function boxOf(polys: Point[][]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys)
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, d: maxY - minY };
}

function area(poly: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A stack of footprints read as one column: its members biggest first — [plinth, …bases, shaft]. */
export interface ColumnStack {
  members: StructureFeature[];
  centre: Point;
  heightMm: number;
}

/** The stacks among `features`: compact built footprints nested on one centre, two or more deep —
 *  each inside the one before it, every corner of its outline in that outline. */
export function columnStacks(features: readonly StructureFeature[]): ColumnStack[] {
  const items = features.filter(stackable).map((f) => {
    const polys = polysOf(f);
    const box = boxOf(polys);
    // In the feature's OWN frame (its width × depth): a square plinth turned 40° is still a square.
    const fill = polys.reduce((s, p) => s + area(p), 0) / Math.max(1, f.widthMm * f.depthMm);
    const compact = Math.max(f.widthMm, f.depthMm) <= COMPACT_ASPECT * Math.min(f.widthMm, f.depthMm) && fill >= COMPACT_FILL;
    return { f, polys, box, compact };
  });
  const used = new Set<string>();
  const byArea = [...items].sort((a, b) => b.box.w * b.box.d - a.box.w * a.box.d);
  const stacks: ColumnStack[] = [];
  for (const outer of byArea) {
    if (used.has(outer.f.id) || !outer.compact) continue;
    const stack = [outer];
    for (const inner of byArea) {
      if (inner === outer || !inner.compact || used.has(inner.f.id) || stack.includes(inner)) continue;
      const last = stack[stack.length - 1];
      const tol = Math.max(30, CENTRE_SHARE * Math.min(inner.box.w, inner.box.d));
      const centred = Math.hypot(inner.box.cx - outer.box.cx, inner.box.cy - outer.box.cy) <= tol;
      const nested =
        inner.box.w * inner.box.d < last.box.w * last.box.d &&
        inner.polys.every((poly) => poly.every((p) => last.polys.some((q) => pointInPolygon(p, q) || q.some((v, i) => segDist(p, v, q[(i + 1) % q.length]) <= 2))));
      if (centred && nested) stack.push(inner);
    }
    if (stack.length < 2) continue;
    const shaft = stack[stack.length - 1];
    stack.forEach((s) => used.add(s.f.id));
    stacks.push({ members: stack.map((s) => s.f), centre: { x: shaft.box.cx, y: shaft.box.cy }, heightMm: Math.max(...stack.map((s) => s.f.heightMm)) });
  }
  return stacks;
}

/** One column made of a stack: the plinth's place, turn, shape, size, look, lock and switch; the
 *  shaft the smallest footprint (square when it is not round), the base the next one out. A stack
 *  of one is a plain column — its shaft fills its footprint. */
export function columnFromStack(members: readonly StructureFeature[]): Omit<StructureFeature, "id"> {
  const plinth = members[0];
  const shaft = members[members.length - 1];
  const base = members.length >= 3 ? members[members.length - 2] : null;
  const round = (f: StructureFeature) => featureFootprint(f).kind === "circle";
  const column: FeatureColumn = {
    shaftMm: Math.round(Math.min(shaft.widthMm, shaft.depthMm)),
    ...(base ? { baseMm: Math.round(Math.min(base.widthMm, base.depthMm)) } : {}),
    ...(round(shaft) ? {} : { square: true }),
  };
  return {
    kind: "column",
    label: [...members].map((m) => m.label).find(Boolean) ?? "",
    x: plinth.x,
    y: plinth.y,
    widthMm: plinth.widthMm,
    depthMm: plinth.depthMm,
    heightMm: Math.max(...members.map((m) => m.heightMm)),
    shape: plinth.shape,
    ...(plinth.shape === "custom" && plinth.outline ? { outline: plinth.outline, ...(plinth.edgeCurves ? { edgeCurves: plinth.edgeCurves } : {}) } : {}),
    rotationDeg: plinth.rotationDeg ?? 0,
    ...(plinth.style ? { style: plinth.style } : {}),
    ...(members.some((m) => m.locked) ? { locked: true } : {}),
    ...(plinth.movable !== undefined ? { movable: plinth.movable } : {}),
    column,
  };
}

/** Whether "define as columns" has anything to do with these features. */
export function canDefineColumns(features: readonly StructureFeature[]): boolean {
  const built = features.filter(stackable);
  return built.length === 1 ? built.length === features.length : columnStacks(built).length > 0;
}

/** The stacks among the picked features become columns IN PLACE — each where its plinth was in the
 *  list (so what is painted over it stays over it), and under the PLINTH'S id, so a zone made of
 *  features or an event's offset that named the plinth still names the column. A single built piece
 *  picked alone becomes a plain column. Returns the columns' ids (nothing else is touched). */
export function defineColumns(s: VenueStructure, ids: readonly string[]): { structure: VenueStructure; ids: string[] } {
  const picked = s.features.filter((f) => ids.includes(f.id));
  const built = picked.filter(stackable);
  const stacks: StructureFeature[][] = built.length === 1 && picked.length === 1 ? [built] : columnStacks(built).map((st) => st.members);
  if (!stacks.length) return { structure: s, ids: [] };
  const replace = new Map<string, StructureFeature>();
  const gone = new Set<string>();
  for (const members of stacks) {
    replace.set(members[0].id, { id: members[0].id, ...columnFromStack(members) });
    for (const m of members.slice(1)) gone.add(m.id);
  }
  const features = s.features.filter((f) => !gone.has(f.id)).map((f) => replace.get(f.id) ?? f);
  return { structure: { ...s, features }, ids: [...replace.values()].map((f) => f.id) };
}
