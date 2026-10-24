// What the venue's BUILT things are, read off how they are drawn — so a colonnade stands as a
// colonnade and not as a drum (Ravid, 2026-10-24: "improve the visual of the objects: the
// קוליסאום"). Spec §3.1.
//
// A venue draws its architecture as `structure` features: footprints with a height. At אמרה the
// קוליסאום is 24 columns, each drawn as THREE nested footprints on one centre (a 2m square, a
// ⌀1.5 round, a ⌀0.8 round), under a ring of 48 band pieces — every one of them 9m tall, so
// extruding each to its height built a solid 9m drum with the columns buried inside it. The
// drawing says more than that, and this module reads it:
//
//   COLUMN  footprints nested on one centre are one column: the biggest is its PLINTH, the
//           smallest its SHAFT, those between its BASE mouldings — and its capital mirrors them at
//           the top. A lone slender footprint (4× taller than wide, ≤1.2m) is a column too.
//   BEAM    built pieces of one height that touch one another, with a column standing INSIDE the
//           run, are what the columns carry: drawn as the top BEAM_SHARE of their height (a ring
//           beam, a pergola, a lintel), open beneath.
//   SOLID   everything else is its footprint extruded to its height, as before.
//
// Pure, deterministic; `npx tsx lib/scene/structures.ts` holds a ring colonnade.
import type { Point } from "@/lib/studio/hall";
import { featureFootprint, type StructureFeature } from "@/lib/venues/structure";
import { footprintPolygons } from "@/lib/studio/proximity";
import { pointInPolygon } from "@/lib/venues/faces";
import { isMain } from "../self-check";

/** A beam is this share of its height deep (clamped to BEAM_MM). */
export const BEAM_SHARE = 0.11;
export const BEAM_MM = { min: 350, max: 1100 } as const;
/** Two pieces touch within this. */
const TOUCH_MM = 60;
/** Two footprints share a centre within this share of the smaller's size (and at least 30mm). */
const CENTRE_SHARE = 0.08;
/** A lone footprint is a column when it is this many times taller than wide, and no wider than this. */
const SLENDER = 3.5;
const SLENDER_MAX_MM = 1200;
/** A column's pieces are COMPACT: no longer than this over their width, filling this much of their
 *  box (a circle 0.79, a square 1) — a band piece of a ring beam is neither. */
const COMPACT_ASPECT = 1.4;
const COMPACT_FILL = 0.7;
/** A beam is something people walk under: a run lower than this is a wall, whatever stands in it
 *  (אמרה's perimeter: 1m walls with 3m pillars rising from their piers). */
const BEAM_MIN_MM = 2200;
export const BAND_STEP_MM = 150;

export interface ColumnReading {
  /** Every member's id, biggest footprint first: [plinth, …bases, shaft] — one id for a lone column. */
  ids: string[];
  centre: Point;
  heightMm: number;
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

export function readStructures(features: readonly StructureFeature[]): StructureReading {
  const items = features.filter((f) => built(f) && f.heightMm > 0).map((f) => {
    const polys = polysOf(f);
    const box = boxOf(polys);
    // In the feature's OWN frame (its width × depth): a square plinth turned 40° is still a square.
    const fill = polys.reduce((s, p) => s + area(p), 0) / Math.max(1, f.widthMm * f.depthMm);
    const compact = Math.max(f.widthMm, f.depthMm) <= COMPACT_ASPECT * Math.min(f.widthMm, f.depthMm) && fill >= COMPACT_FILL;
    return { f, polys, box, compact };
  });
  const role: StructureReading["role"] = new Map();
  const columns: ColumnReading[] = [];

  // 1. Columns: footprints nested on one centre.
  const used = new Set<string>();
  const byArea = [...items].sort((a, b) => b.box.w * b.box.d - a.box.w * a.box.d);
  for (const outer of byArea) {
    if (used.has(outer.f.id) || !outer.compact) continue;
    const stack = [outer];
    for (const inner of byArea) {
      if (inner === outer || !inner.compact || used.has(inner.f.id) || stack.includes(inner)) continue;
      const last = stack[stack.length - 1];
      const tol = Math.max(30, CENTRE_SHARE * Math.min(inner.box.w, inner.box.d));
      const centred = Math.hypot(inner.box.cx - outer.box.cx, inner.box.cy - outer.box.cy) <= tol;
      // Truly inside the one before: every corner of its outline in that outline.
      const nested = inner.box.w * inner.box.d < last.box.w * last.box.d && inner.polys.every((poly) => poly.every((p) => last.polys.some((q) => pointInPolygon(p, q) || q.some((v, i) => segDist(p, v, q[(i + 1) % q.length]) <= 2))));
      if (centred && nested) stack.push(inner);
    }
    const shaft = stack[stack.length - 1];
    const lone = stack.length === 1 && Math.max(shaft.box.w, shaft.box.d) <= SLENDER_MAX_MM && shaft.f.heightMm >= SLENDER * Math.max(shaft.box.w, shaft.box.d);
    if (stack.length < 2 && !lone) continue;
    const column: ColumnReading = { ids: stack.map((s) => s.f.id), centre: { x: shaft.box.cx, y: shaft.box.cy }, heightMm: Math.max(...stack.map((s) => s.f.heightMm)) };
    columns.push(column);
    stack.forEach((s, index) => {
      used.add(s.f.id);
      role.set(s.f.id, { kind: "column", column, index });
    });
  }

  // 2. Beams: runs of touching pieces of one height with a column standing inside.
  const rest = items.filter((it) => !used.has(it.f.id));
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
    const holds = columns.some((c) => c.heightMm >= 0.8 * h && c.heightMm <= 1.2 * h && run.some((it) => it.polys.some((poly) => pointInPolygon(c.centre, poly))));
    if (!holds) continue;
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
    const beam: BeamReading = { ids: run.map((it) => it.f.id), fromMm: Math.max(0, h - depth), toMm: h, dropOf };
    beams.push(beam);
    for (const it of run) role.set(it.f.id, { kind: "beam", beam });
  }
  return { columns, beams, role };
}

/** How high a column's shaft rises: to the underside of the beam it stands under, else its top. */
export function shaftTopOf(column: ColumnReading, reading: StructureReading, features: readonly StructureFeature[]): number {
  let top = column.heightMm;
  for (const beam of reading.beams) {
    const under = beam.ids.some((id) => {
      const f = features.find((x) => x.id === id);
      return !!f && polysOf(f).some((poly) => pointInPolygon(column.centre, poly));
    });
    if (under) top = Math.min(top, beam.fromMm);
  }
  return top;
}

// ponytail: self-check. Run: npx tsx lib/scene/structures.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  // A ring colonnade: 8 columns (a square plinth, a round base, a round shaft) on a 10m circle,
  // under a ring beam of 8 band pieces — all 6m, as a venue draws it.
  const fs: StructureFeature[] = [];
  const base = { kind: "structure" as const, label: "", heightMm: 6000, rotationDeg: 0 };
  const R = 10000;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = R * Math.cos(a);
    const y = R * Math.sin(a);
    fs.push({ ...base, id: `p${k}`, x, y, widthMm: 1600, depthMm: 1600, shape: "rect", rotationDeg: k * 22.5 + 10 });
    fs.push({ ...base, id: `b${k}`, x: x + 3, y: y - 2, widthMm: 1200, depthMm: 1200, shape: "circle" });
    fs.push({ ...base, id: `s${k}`, x, y, widthMm: 700, depthMm: 700, shape: "circle" });
    // A band piece from this column's bearing to the next, 1.4m wide, as a custom outline.
    const a1 = a - Math.PI / 8;
    const a2 = a + Math.PI / 8;
    const ring = (r: number, t: number) => ({ x: r * Math.cos(t), y: r * Math.sin(t) });
    const arc = (r: number, from: number, to: number) => Array.from({ length: 7 }, (_, i) => ring(r, from + ((to - from) * i) / 6));
    const pts = [...arc(R + 700, a1, a2), ...arc(R - 700, a2, a1)];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const my = (Math.max(...ys) + Math.min(...ys)) / 2;
    fs.push({ ...base, id: `r${k}`, x: mx, y: my, widthMm: w, depthMm: d, shape: "custom", outline: pts.map((p) => ({ x: p.x - mx, y: p.y - my })) });
  }
  // A 1m garden wall with 3m pillars rising from it: a wall, not a beam.
  fs.push({ ...base, id: "lowwall", x: -30000, y: 0, widthMm: 7000, depthMm: 900, shape: "rect", heightMm: 1000 });
  fs.push({ ...base, id: "gatepost", x: -33000, y: 0, widthMm: 800, depthMm: 800, shape: "circle", heightMm: 3000 });
  // And a plain wall that holds nothing, and a lone slender pillar.
  fs.push({ ...base, id: "wall", x: 30000, y: 0, widthMm: 6000, depthMm: 200, shape: "rect" });
  fs.push({ ...base, id: "pillar", x: 30000, y: 5000, widthMm: 500, depthMm: 500, shape: "circle", heightMm: 4000 });
  const r = readStructures(fs);
  assert(r.columns.length === 10, `eight stacked columns, the gate post and the lone pillar (${r.columns.length})`);
  const c0 = r.columns.find((c) => c.ids.includes("s0"))!;
  assert(c0.ids.join() === "p0,b0,s0", `a stack reads plinth, base, shaft — biggest first (${c0.ids.join()})`);
  assert(r.beams.length === 1 && r.beams[0].ids.length === 8, `the eight band pieces are ONE beam (${r.beams.map((b) => b.ids.length).join()} / roles ${[...r.role].map(([id, x]) => id + ":" + x.kind).join(" ")})`);
  assert(r.beams[0].toMm === 6000 && r.beams[0].fromMm === 6000 - 660, "…the top 11% of their height");
  assert(!r.role.has("wall"), "a wall that holds no column stays a solid");
  assert(!r.role.has("lowwall") && r.role.get("gatepost")?.kind === "column", "a low garden wall stays a wall though a pillar rises from it");
  assert(r.columns.every((c) => !c.ids.some((id) => id.startsWith("r"))), "no band piece of the ring is read as part of a column");
  assert(shaftTopOf(c0, r, fs) === 6000 - 660, "a column's shaft rises to the beam's underside");
  const pillar = r.columns.find((c) => c.ids[0] === "pillar")!;
  assert(!!pillar && shaftTopOf(pillar, r, fs) === 4000, "a lone pillar stands to its own height");
  console.log("scene structures ok");
}
