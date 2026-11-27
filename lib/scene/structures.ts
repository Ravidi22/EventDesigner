// What the venue's BUILT things are, read off how they are drawn — so a colonnade stands as a
// colonnade and not as a drum (Ravid, 2026-10-24: "improve the visual of the objects: the
// קוליסאום"). Spec §3.1.
//
// A venue draws its architecture as `structure` features: footprints with a height — and, since
// 2026-10-24, its pillars as `column` features (lib/venues/column.ts). At אמרה the קוליסאום was 24
// columns, each drawn as THREE nested footprints on one centre (a 2m square, a ⌀1.5 round, a ⌀0.8
// round), under a ring of 48 band pieces — every one of them 9m tall, so extruding each to its
// height built a solid 9m drum with the columns buried inside it. The drawing says more than that,
// and this module reads it:
//
//   COLUMN  a `column` feature is one: its plinth, base ring and shaft are its own (columnOf).
//           Footprints nested on one centre are one too (columnStacks): the biggest is its PLINTH,
//           the smallest its SHAFT, those between its BASE mouldings — and its capital mirrors them
//           at the top. A lone slender footprint (4× taller than wide, ≤1.2m) is a column too.
//   BEAM    built pieces of one height that touch one another, with a column standing INSIDE the
//           run, are what the columns carry: drawn as the top BEAM_SHARE of their height (a ring
//           beam, a pergola, a lintel), open beneath.
//   SOLID   everything else is its footprint extruded to its height, as before.
//
// Heights here are above the floor the thing stands on; ./envelope.ts adds that floor (a colonnade
// on a stage stands on its deck).
//
// Pure, deterministic; `npx tsx lib/scene/structures.ts` holds a ring colonnade.
import type { Point } from "@/lib/studio/hall";
import { featureFootprint, type StructureFeature } from "@/lib/venues/structure";
import { columnOf, columnStacks } from "@/lib/venues/column";
import { footprintPolygons } from "@/lib/studio/proximity";
import { pointInPolygon } from "@/lib/venues/faces";

/** A beam is this share of its height deep (clamped to BEAM_MM). */
export const BEAM_SHARE = 0.11;
export const BEAM_MM = { min: 350, max: 1100 } as const;
/** Two pieces touch within this. */
const TOUCH_MM = 60;
/** A lone footprint is a column when it is this many times taller than wide, and no wider than this. */
const SLENDER = 3.5;
const SLENDER_MAX_MM = 1200;
const COMPACT_ASPECT = 1.4;
const COMPACT_FILL = 0.7;
/** A beam is something people walk under: a run lower than this is a wall, whatever stands in it
 *  (אמרה's perimeter: 1m walls with 3m pillars rising from their piers). */
const BEAM_MIN_MM = 2200;
export const BAND_STEP_MM = 150;

export interface ColumnReading {
  /** The features it is drawn as — the column feature itself, or every member of a stack. */
  ids: string[];
  /** Its pieces biggest first: [plinth, …bases, shaft] — one for a lone column. A `column`
   *  feature's are made from its spec, the plinth keeping the feature's own id. */
  members: StructureFeature[];
  centre: Point;
  heightMm: number;
  /** The beam it holds up, when it stands under one. */
  beam?: BeamReading;
}

export interface BeamReading {
  ids: string[];
  /** The beam's underside and top above the floor. */
  fromMm: number;
  toMm: number;
  /** How far a piece hangs below the beam: a beam drawn as two bands in two colours (אמרה's ring,
   *  a white band outside a grey one) is the main band and an ARCHITRAVE stepped BAND_STEP_MM down
   *  per band — never two faces at one height where the bands overlap, which flickered. */
  dropOf: Record<string, number>;
  /** The columns standing under it. */
  columns: ColumnReading[];
}

export interface StructureReading {
  columns: ColumnReading[];
  beams: BeamReading[];
  /** Which reading a feature belongs to — absent = a solid, drawn as before. */
  role: Map<string, { kind: "column"; column: ColumnReading; index: number } | { kind: "beam"; beam: BeamReading }>;
}

const built = (f: StructureFeature) => f.kind === "structure" || f.kind === "other";

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
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, d: maxY - minY };
}

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Two outlines touch: one's corner in the other, or a corner within TOUCH_MM of the other's side. */
function touches(A: Point[][], B: Point[][]): boolean {
  for (const a of A)
    for (const b of B) {
      if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
      for (const p of a) for (let i = 0; i < b.length; i++) if (segDist(p, b[i], b[(i + 1) % b.length]) <= TOUCH_MM) return true;
      for (const p of b) for (let i = 0; i < a.length; i++) if (segDist(p, a[i], a[(i + 1) % a.length]) <= TOUCH_MM) return true;
    }
  return false;
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

/** A `column` feature as the pieces a stack would have drawn: the plinth (the feature itself, when
 *  it has one), the base ring, the shaft — each turned with it. */
export function columnMembers(f: StructureFeature): StructureFeature[] {
  const parts = columnOf(f);
  const piece = (suffix: string, across: number): StructureFeature => ({ ...f, id: `${f.id}:${suffix}`, shape: parts.square ? "rect" : "circle", widthMm: across, depthMm: across, outline: undefined, edgeCurves: undefined });
  return [...(parts.plinth ? [f] : []), ...(parts.baseMm ? [piece("base", parts.baseMm)] : []), { ...piece("shaft", parts.shaftMm), ...(parts.plinth ? {} : { id: f.id }) }];
}

export function readStructures(features: readonly StructureFeature[]): StructureReading {
  const role: StructureReading["role"] = new Map();
  const columns: ColumnReading[] = [];
  const add = (column: ColumnReading, roleIds: string[]) => {
    columns.push(column);
    roleIds.forEach((id, index) => role.set(id, { kind: "column", column, index }));
  };

  // 1. Columns: the venue's own, then footprints nested on one centre, then lone slender pillars.
  for (const f of features) {
    if (f.kind !== "column") continue;
    add({ ids: [f.id], members: columnMembers(f), centre: { x: f.x, y: f.y }, heightMm: f.heightMm }, [f.id]);
  }
  const stacked = new Set<string>();
  for (const st of columnStacks(features)) {
    const ids = st.members.map((m) => m.id);
    ids.forEach((id) => stacked.add(id));
    add({ ids, members: st.members, centre: st.centre, heightMm: st.heightMm }, ids);
  }
  const items = features
    .filter((f) => built(f) && f.heightMm > 0 && !stacked.has(f.id))
    .map((f) => {
      const polys = polysOf(f);
      // Compact in the feature's OWN frame — a square turned 40° is still a square; a band piece
      // of a ring beam is no pillar however slender (lib/venues/column.ts reads stacks the same way).
      const fill = polys.reduce((s, p) => s + area(p), 0) / Math.max(1, f.widthMm * f.depthMm);
      const compact = Math.max(f.widthMm, f.depthMm) <= COMPACT_ASPECT * Math.min(f.widthMm, f.depthMm) && fill >= COMPACT_FILL;
      return { f, polys, box: boxOf(polys), compact };
    });
  const lone = new Set<string>();
  for (const it of items) {
    const across = Math.max(it.box.w, it.box.d);
    if (!it.compact || across > SLENDER_MAX_MM || it.f.heightMm < SLENDER * across) continue;
    lone.add(it.f.id);
    add({ ids: [it.f.id], members: [it.f], centre: { x: it.box.cx, y: it.box.cy }, heightMm: it.f.heightMm }, [it.f.id]);
  }

  // 2. Beams: runs of touching pieces of one height with a column standing inside.
  const rest = items.filter((it) => !lone.has(it.f.id));
  const parent = rest.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const a = rest[i];
      const b = rest[j];
      if (Math.abs(a.f.heightMm - b.f.heightMm) > 0.05 * Math.max(a.f.heightMm, b.f.heightMm)) continue;
      if (a.box.maxX + TOUCH_MM < b.box.minX || b.box.maxX + TOUCH_MM < a.box.minX || a.box.maxY + TOUCH_MM < b.box.minY || b.box.maxY + TOUCH_MM < a.box.minY) continue;
      if (touches(a.polys, b.polys)) parent[find(i)] = find(j);
    }
  }
  const runs = new Map<number, typeof rest>();
  rest.forEach((it, i) => runs.set(find(i), [...(runs.get(find(i)) ?? []), it]));
  const beams: BeamReading[] = [];
  for (const run of runs.values()) {
    const h = Math.max(...run.map((it) => it.f.heightMm));
    if (h < BEAM_MIN_MM) continue;
    const under = columns.filter((c) => c.heightMm >= 0.8 * h && c.heightMm <= 1.2 * h && run.some((it) => it.polys.some((poly) => pointInPolygon(c.centre, poly))));
    if (!under.length) continue;
    const depth = Math.max(BEAM_MM.min, Math.min(BEAM_MM.max, BEAM_SHARE * h));
    // Its bands by colour, the one with the most area first: that one is the beam, each next one
    // a step lower.
    const areaBy = new Map<string, number>();
    for (const it of run) {
      const k = it.f.style?.fill ?? "";
      areaBy.set(k, (areaBy.get(k) ?? 0) + it.polys.reduce((s, p) => s + area(p), 0));
    }
    const rank = [...areaBy].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const dropOf: Record<string, number> = {};
    for (const it of run) dropOf[it.f.id] = rank.indexOf(it.f.style?.fill ?? "") * BAND_STEP_MM;
    const beam: BeamReading = { ids: run.map((it) => it.f.id), fromMm: Math.max(0, h - depth), toMm: h, dropOf, columns: under };
    beams.push(beam);
    for (const c of under) c.beam ??= beam;
    for (const it of run) role.set(it.f.id, { kind: "beam", beam });
  }
  return { columns, beams, role };
}

/** How high a column's shaft rises above the floor: to the underside of the beam it stands under,
 *  else its top. */
export function shaftTopOf(column: ColumnReading): number {
  return column.beam ? Math.min(column.heightMm, column.beam.fromMm) : column.heightMm;
}
