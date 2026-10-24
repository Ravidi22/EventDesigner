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
import { isMain } from "../self-check";

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

// ponytail: self-check. Run: npm run check:column
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  // A new column: a 60cm plinth, a ⌀50 base, a ⌀40 shaft.
  const fresh = columnOf({ widthMm: 600, depthMm: 600 });
  assert(fresh.plinth && fresh.baseMm === 500 && fresh.shaftMm === 400 && !fresh.square, "a new column has a plinth, a base and a round shaft");
  assert(columnOf({ widthMm: 400, depthMm: 400, column: { shaftMm: 900 } }).shaftMm === 400 && !columnOf({ widthMm: 400, depthMm: 400, column: { shaftMm: 900 } }).plinth, "a shaft is never wider than its plinth — filling it, there is no plinth");
  assert(columnOf({ widthMm: 600, depthMm: 600, column: { shaftMm: 400, baseMm: 300 } }).baseMm === null, "a base no wider than the shaft is none");
  assert(columnPatch({ widthMm: 600, depthMm: 600 }, { baseMm: 0 }).column.baseMm === undefined, "…and clearing it stores none");
  assert(columnPatch({ widthMm: 600, depthMm: 600 }, { shaftMm: 333.3, square: true }).column.shaftMm === 333 && columnPatch({ widthMm: 600, depthMm: 600 }, { square: true }).column.square === true, "a patch writes whole mm and the square switch");

  // אמרה's way of drawing one: a 2m square turned 96°, a ⌀1.5 round, a ⌀0.8 round, all 9m — and a
  // ring-beam piece and a wall nearby that are not columns.
  const base = { kind: "structure" as const, label: "", heightMm: 9000, rotationDeg: 0 };
  const stack: StructureFeature[] = [
    { ...base, id: "p", x: 1000, y: 1000, widthMm: 2000, depthMm: 2000, shape: "rect", rotationDeg: 96, locked: true, style: { fill: "#fbf9f4" } },
    { ...base, id: "b", x: 1000, y: 1000, widthMm: 1500, depthMm: 1500, shape: "circle", locked: true },
    { ...base, id: "s", x: 1001, y: 999, widthMm: 800, depthMm: 800, shape: "circle", locked: true },
  ];
  const beam: StructureFeature = { ...base, id: "beam", x: 1000, y: 1000, widthMm: 6000, depthMm: 1400, shape: "rect" };
  const wall: StructureFeature = { ...base, id: "wall", x: 8000, y: 0, widthMm: 400, depthMm: 400, shape: "rect", heightMm: 1000 };
  const pool: StructureFeature = { ...base, id: "pool", kind: "pool", x: 1000, y: 1000, widthMm: 3000, depthMm: 3000, shape: "circle", heightMm: 0 };
  const stacks = columnStacks([...stack, beam, wall, pool]);
  assert(stacks.length === 1 && stacks[0].members.map((m) => m.id).join() === "p,b,s", `one stack, biggest first (${stacks.map((s) => s.members.map((m) => m.id).join()).join(" | ")})`);
  const col = columnFromStack(stacks[0].members);
  assert(col.kind === "column" && col.rotationDeg === 96 && col.widthMm === 2000 && col.shape === "rect", "the column is the plinth's place, turn and size");
  assert(col.column?.shaftMm === 800 && col.column.baseMm === 1500 && !col.column.square && col.heightMm === 9000, "…its shaft and base read off the rounds");
  assert(col.locked === true && col.style?.fill === "#fbf9f4", "…its lock and look carried");

  const s: VenueStructure = { nodes: [], walls: [], entrances: [], features: [pool, ...stack, beam, wall] };
  const defined = defineColumns(s, ["p", "b", "s", "beam", "pool"]);
  assert(defined.ids.join() === "p" && defined.structure.features.map((f) => f.id).join() === "pool,p,beam,wall", `the stack becomes one column where its plinth stood, under its id; the rest stays (${defined.structure.features.map((f) => f.id).join()})`);
  assert(defined.structure.features.find((f) => f.id === "p")?.kind === "column", "…and it is a column");
  assert(canDefineColumns([stack[0], stack[2]]) && !canDefineColumns([beam, pool]) && canDefineColumns([wall]), "define is offered for a stack, or one built piece alone");
  const one = defineColumns(s, ["wall"]);
  const lone = one.structure.features.find((f) => f.id === "wall")!;
  assert(lone.kind === "column" && !columnOf(lone).plinth && lone.column?.square === true, "one square piece alone is a plain square pillar");
  assert(defineColumns(s, ["beam", "pool"]).ids.length === 0, "…and nothing that is not a stack changes");
  console.log("venue columns ok");
}
