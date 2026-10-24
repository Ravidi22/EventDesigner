// A body's parts → three.js geometry, in METRES. This module (and scene-nodes, through `toWorld`)
// is where millimetres become metres; nothing else in the viewer divides by a thousand.
//
// Every part is built about its own base: a box/cylinder/extrude/lathe/ribbon stands on y = 0 and
// grows up, a sphere is centred, a plane lies at y = 0 — then the part's `at`/`rotDeg` is applied
// as a local matrix, and every part sharing one material is merged into ONE geometry (one draw call
// per material per body, whatever the part count). The plan's (x, y) lands on three's (x, z): the
// plan frame is left-handed (y down, z up), so a shape built in three's xy plane is mirrored in y
// first and then turned −90° about x — a proper rotation, so winding and outward normals survive
// (a bare axis swap would flip every face inside out).
//
// UVs are in METRES on every geometry — a box's and a cylinder's 0–1 faces are rescaled by their
// real size; an extrude's and a plane's are three's own world units, which are metres here — so a
// material's texture repeat is one number per material (1 / its repeat size) and the same wood
// material serves every table in the room. The one exception is a stretched image, whose group's
// UVs are normalised to 0–1 over its footprint, because "one copy over the whole shape" is a
// per-body fact.
//
// THE TILT RULE (box and cylinder `tiltDeg`): the part is leaned about ITS OWN x axis, about its
// base centre, before `rotDeg` turns it on the plan — so the base stays put and the part's own x
// axis is the turned one. Positive tilt moves the TOP toward the part's own +y: with rotDeg 0 that
// is plan +y (down the plan), which is three's +z; a tilt of 45° on a part 1000 high puts its top
// at 707 up and 707 toward +y. A mirrored instance (x → −x) leaves the lean alone, because a turn
// about x commutes with a mirror across x. `check:scene-viewer` holds the 707/707 case.
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  ShapeGeometry,
  ShapeUtils,
  SphereGeometry,
  Vector2,
  Vector3,
  TorusGeometry,
  IcosahedronGeometry,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { frondTriangles, lumpField } from "@/lib/scene/organic";
import type { Point } from "@/lib/studio/hall";
import type { BuiltOutline } from "@/lib/studio/footprint";
import { absoluteControlPoints } from "@/lib/studio/geometry";
import { MM_PER_M, toWorld, worldRotationY } from "@/lib/scene/frame";
import type { BodyNode, MaterialRef, Part, Vec3 } from "@/lib/scene/types";

const m = (mm: number) => mm / MM_PER_M;
const rad = (deg: number) => (deg * Math.PI) / 180;
const CURVE_SEGMENTS = 8;
const DEFAULT_RADIAL = 24;
const DEFAULT_SPHERE = 16;
const DEFAULT_TORUS_RADIAL = 12;
const DEFAULT_TORUS_TUBULAR = 48;
const DEFAULT_AMPLITUDE_MM = 40;
const UP = new Vector3(0, 1, 0);

/** One merged geometry and what it is made of. */
export interface Built {
  geometry: BufferGeometry;
  material: MaterialRef;
}

// --- shapes ---------------------------------------------------------------------------------------

/** Walk a closed outline into `path` in metres, bezier edges honoured, forward or — `reverse` —
 *  backward (each edge from its end to its start, its control points swapped), so a hole can be
 *  given the winding opposite to its outline's without touching the outline it came from. */
function walkOutline(path: Path, o: BuiltOutline, ySign: 1 | -1, reverse: boolean): void {
  const pts = o.outline;
  const n = pts.length;
  const X = (p: Point) => m(p.x);
  const Y = (p: Point) => ySign * m(p.y);
  if (!reverse) {
    path.moveTo(X(pts[0]), Y(pts[0]));
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const curve = o.edgeCurves?.[i];
      if (curve) {
        const { c1, c2 } = absoluteControlPoints(a, b, curve);
        path.bezierCurveTo(X(c1), Y(c1), X(c2), Y(c2), X(b), Y(b));
      } else {
        path.lineTo(X(b), Y(b));
      }
    }
  } else {
    path.moveTo(X(pts[0]), Y(pts[0]));
    // Edge i runs pts[i] → pts[i+1]; walked backward from pts[0] the first edge taken is n−1.
    for (let k = 0; k < n; k++) {
      const i = (n - 1 - k + n) % n;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const curve = o.edgeCurves?.[i];
      if (curve) {
        const { c1, c2 } = absoluteControlPoints(a, b, curve);
        path.bezierCurveTo(X(c2), Y(c2), X(c1), Y(c1), X(a), Y(a));
      } else {
        path.lineTo(X(a), Y(a));
      }
    }
  }
  path.closePath();
}

/** The sign of an outline's winding by its polygon's signed area (its curves bow, never cross,
 *  so the points decide); 0 for a degenerate one. */
function windingOf(o: BuiltOutline): number {
  return Math.sign(ShapeUtils.area(o.outline));
}

/** A closed outline as a three Shape in metres, bezier edges honoured. `ySign` mirrors the plan's
 *  y so that the −90° turn about x afterwards lands plan +y on three +z (an up-facing face) — or
 *  keeps it for the +90° turn that makes a down-facing one. `holes` are cut out: each is walked
 *  with the winding OPPOSITE to the outline's (normalised by signed area — a builder may hand the
 *  pool's rim in either direction), which is what three's triangulation reads a hole by. A hole
 *  with fewer than three points, or no area, is ignored. */
function shapeOf(o: BuiltOutline, ySign: 1 | -1, holes?: BuiltOutline[]): Shape | null {
  if (o.outline.length < 3) return null;
  const s = new Shape();
  walkOutline(s, o, ySign, false);
  if (holes) {
    const outer = windingOf(o);
    for (const h of holes) {
      if (h.outline.length < 3) continue;
      const inner = windingOf(h);
      if (inner === 0) continue;
      const path = new Path();
      walkOutline(path, h, ySign, outer !== 0 && inner === outer);
      s.holes.push(path);
    }
  }
  return s;
}

function scaleUv(g: BufferGeometry, f: (i: number, u: number, v: number) => [number, number]): void {
  const uv = g.getAttribute("uv");
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = f(i, uv.getX(i), uv.getY(i));
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

function boxGeometry(w: number, d: number, h: number): BufferGeometry {
  const W = m(w);
  const D = m(d);
  const H = m(h);
  const g = new BoxGeometry(W, H, D);
  // BoxGeometry lays its faces px, nx, py, ny, pz, nz, four vertices each: metres per face.
  const dims: [number, number][] = [[D, H], [D, H], [W, D], [W, D], [W, H], [W, H]];
  scaleUv(g, (i, u, v) => {
    const [su, sv] = dims[Math.min(5, Math.floor(i / 4))];
    return [u * su, v * sv];
  });
  g.translate(0, H / 2, 0);
  return g;
}

function cylinderGeometry(rTop: number, rBottom: number, h: number, segments: number): BufferGeometry {
  const RT = m(rTop);
  const RB = m(rBottom);
  const H = m(h);
  const g = new CylinderGeometry(RT, RB, H, segments, 1, false);
  const torso = 2 * (segments + 1);
  const around = Math.PI * (RT + RB);
  const rMax = Math.max(RT, RB);
  scaleUv(g, (i, u, v) => (i < torso ? [u * around, v * H] : [(u - 0.5) * 2 * rMax, (v - 0.5) * 2 * rMax]));
  g.translate(0, H / 2, 0);
  return g;
}

function sphereGeometry(r: number, segments: number): BufferGeometry {
  return new SphereGeometry(m(r), segments, Math.max(6, Math.ceil(segments / 2)));
}

/** A ring lying flat with its BASE at y = 0: three's torus stands in the x/y plane, so it is
 *  turned onto the floor and lifted by its tube. `segments` is the count round the ring; the
 *  tube's own cross-section keeps 12. UVs: u metres round the ring, v metres round the tube. */
function torusGeometry(r: number, tube: number, segments: number): BufferGeometry {
  const R = m(r);
  const T = m(tube);
  const g = new TorusGeometry(R, T, DEFAULT_TORUS_RADIAL, Math.max(3, segments));
  scaleUv(g, (_i, u, v) => [u * 2 * Math.PI * R, v * 2 * Math.PI * T]);
  g.rotateX(Math.PI / 2);
  g.translate(0, T, 0);
  return g;
}

function extrudeGeometry(outline: BuiltOutline, h: number, holes?: BuiltOutline[]): BufferGeometry {
  if (h <= 0) return planeGeometry(outline, "up", holes);
  const shape = shapeOf(outline, -1, holes);
  if (!shape) return new BufferGeometry();
  try {
    const g = new ExtrudeGeometry(shape, { depth: m(h), bevelEnabled: false, curveSegments: CURVE_SEGMENTS });
    g.clearGroups();
    g.rotateX(-Math.PI / 2);
    return g;
  } catch {
    return new BufferGeometry();
  }
}

function latheGeometry(profile: { r: number; z: number }[], segments: number): BufferGeometry {
  if (profile.length < 2) return new BufferGeometry();
  const pts = profile.map((p) => new Vector2(Math.max(0, m(p.r)), m(p.z)));
  const g = new LatheGeometry(pts, segments);
  const rMax = Math.max(...pts.map((p) => p.x));
  const zs = pts.map((p) => p.y);
  const span = Math.max(...zs) - Math.min(...zs);
  scaleUv(g, (_i, u, v) => [u * 2 * Math.PI * rMax, v * span]);
  return g;
}

function flatGeometry(outline: BuiltOutline, side: "up" | "down", holes?: BuiltOutline[]): BufferGeometry {
  const shape = shapeOf(outline, side === "up" ? -1 : 1, holes);
  if (!shape) return new BufferGeometry();
  try {
    const g = new ShapeGeometry(shape, CURVE_SEGMENTS);
    g.rotateX(side === "up" ? -Math.PI / 2 : Math.PI / 2);
    return g;
  } catch {
    return new BufferGeometry();
  }
}

function planeGeometry(outline: BuiltOutline, side: "up" | "down" | "both", holes?: BuiltOutline[]): BufferGeometry {
  if (side !== "both") return flatGeometry(outline, side, holes);
  const up = flatGeometry(outline, "up", holes);
  const down = flatGeometry(outline, "down", holes);
  const both = mergeNonIndexed([up, down]);
  up.dispose();
  down.dispose();
  return both;
}

/** The path, resampled every quarter-wavelength and swung perpendicular by a sine, when pleated. */
function pleated(path: Point[], pleatMm: number, amplitudeMm: number): Point[] {
  if (!(pleatMm > 0) || path.length < 2) return path;
  const step = pleatMm / 4;
  const out: Point[] = [];
  let s = 0;
  let last: { ux: number; uy: number } = { ux: 1, uy: 0 };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    last = { ux, uy };
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const d = (k / n) * len;
      const off = amplitudeMm * Math.sin((2 * Math.PI * (s + d)) / pleatMm);
      out.push({ x: a.x + ux * d - uy * off, y: a.y + uy * d + ux * off });
    }
    s += len;
  }
  const end = path[path.length - 1];
  const off = amplitudeMm * Math.sin((2 * Math.PI * s) / pleatMm);
  out.push({ x: end.x - last.uy * off, y: end.y + last.ux * off });
  return out;
}

/** A vertical strip along the path, both faces (a skirt is seen from outside, a curtain from
 *  inside, and the builder's path runs whichever way the edge does). UV: u metres along, v up. */
function ribbonGeometry(path: Point[], h: number, pleatMm: number | undefined, amplitudeMm: number | undefined): BufferGeometry {
  const pts = pleated(path, pleatMm ?? 0, amplitudeMm ?? DEFAULT_AMPLITUDE_MM);
  const H = m(h);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ax = m(a.x);
    const az = m(a.y);
    const bx = m(b.x);
    const bz = m(b.y);
    const len = Math.hypot(bx - ax, bz - az);
    if (len <= 1e-6) continue;
    // (b0 − a0) × (b1 − a0) for the quad's front face is (−dz·h, 0, dx·h).
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const u0 = s;
    const u1 = s + len;
    const push = (x: number, y: number, z: number, u: number, v: number, sign: number) => {
      pos.push(x, y, z);
      nor.push(nx * sign, 0, nz * sign);
      uv.push(u, v);
    };
    push(ax, 0, az, u0, 0, 1);
    push(bx, 0, bz, u1, 0, 1);
    push(bx, H, bz, u1, H, 1);
    push(ax, 0, az, u0, 0, 1);
    push(bx, H, bz, u1, H, 1);
    push(ax, H, az, u0, H, 1);
    push(ax, 0, az, u0, 0, -1);
    push(bx, H, bz, u1, H, -1);
    push(bx, 0, bz, u1, 0, -1);
    push(ax, 0, az, u0, 0, -1);
    push(ax, H, az, u0, H, -1);
    push(bx, H, bz, u1, H, -1);
    s = u1;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

/** A cloth falling from a closed rim to the floor (Part "drape"). The rim is resampled every
 *  DRAPE_STEP_MM; each sample is pushed out along its outward normal by the hem's flare (growing as
 *  t² toward the floor) and by a fold — a sine along the rim whose depth grows with t, so the cloth
 *  lies flat where it leaves the table and folds as it falls. A grid of DRAPE_ROWS rows, smooth
 *  normals: fabric, not facets. Built outward-facing whatever way the outline winds. */
const DRAPE_STEP_MM = 25;
const DRAPE_ROWS = 14;
function drapeGeometry(outline: Point[], h: number, pitchMm: number, depthMm: number, flareMm: number): BufferGeometry {
  // Resample the closed rim.
  const rim: Point[] = [];
  const along: number[] = [];
  let s = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / DRAPE_STEP_MM));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      rim.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      along.push(s + len * t);
    }
    s += len;
  }
  const N = rim.length;
  if (N < 3) return new BufferGeometry();
  // Outward normals: the rim's winding decides which side of each edge is out.
  let area = 0;
  for (let i = 0; i < N; i++) {
    const a = rim[i];
    const b = rim[(i + 1) % N];
    area += a.x * b.y - b.x * a.y;
  }
  const out = area > 0 ? 1 : -1;
  const normal = (i: number): Point => {
    const p0 = rim[(i - 1 + N) % N];
    const p1 = rim[(i + 1) % N];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const L = Math.hypot(dx, dy) || 1;
    // For a CCW rim (positive area, y up) the outside of an edge is its right: (dy, −dx).
    return { x: (dy / L) * out, y: (-dx / L) * out };
  };
  // A whole number of folds round the rim, so the seam does not jump.
  const folds = Math.max(3, Math.round(s / Math.max(80, pitchMm)));
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= DRAPE_ROWS; j++) {
    const t = j / DRAPE_ROWS;
    const z = h * (1 - t);
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const nrm = normal(k);
      const phase = ((i === N ? s : along[k]) / s) * folds * Math.PI * 2;
      const push = flareMm * t * t + depthMm * Math.pow(t, 1.3) * Math.sin(phase);
      pos.push(m(rim[k].x + nrm.x * push), m(z), m(rim[k].y + nrm.y * push));
      uv.push(m(i === N ? s : along[k]), m(z));
    }
  }
  const idx: number[] = [];
  const W = N + 1;
  for (let j = 0; j < DRAPE_ROWS; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Faces outward? Compare the first column's normal half way down with its outward direction
  // (plan (x, y) is three (x, z)); flip the winding if it points in.
  const nAttr = g.getAttribute("normal");
  const probe = Math.floor(DRAPE_ROWS / 2) * W;
  const n0 = normal(0);
  if (nAttr.getX(probe) * n0.x + nAttr.getZ(probe) * n0.y < 0) {
    const flipped: number[] = [];
    for (let q = 0; q < idx.length; q += 3) flipped.push(idx[q], idx[q + 2], idx[q + 1]);
    g.setIndex(flipped);
    g.computeVertexNormals();
  }
  return g;
}

/** A blob (Part "blob"): an icosphere in metres, every vertex pushed out along its direction by
 *  the seeded lump field (lib/scene/organic.ts), its height scaled by `squash`, welded and smooth-
 *  shaded so the lumps read as one living surface; a spherical UV so it merges with the rest. */
function blobGeometry(r: number, seed: number, lumps: number, rough: number, squash: number, detail: number): BufferGeometry {
  const ico = new IcosahedronGeometry(1, Math.max(1, Math.min(4, detail)));
  ico.deleteAttribute("uv");
  ico.deleteAttribute("normal");
  const g = mergeVertices(ico);
  ico.dispose();
  const field = lumpField(seed, lumps, rough);
  const pos = g.getAttribute("position");
  const uv: number[] = [];
  const colour: number[] = [];
  const R = m(r);
  const deep = Math.max(0.05, rough);
  for (let i = 0; i < pos.count; i++) {
    // three's y is up: the lump field reads plan (x, y, z-up) = three (x, z, y).
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const f = field({ x, y: z, z: y });
    const k = R * f;
    const X = x * k;
    const Y = y * k * squash;
    const Z = z * k;
    pos.setXYZ(i, X, Y, Z);
    // An oblique projection in metres: no seam (a wrapped longitude crushed the leaf pattern into
    // a stripe down every clump — seen 2026-10-24), stretched only where a face lies along it.
    uv.push(X * 0.8 + Z * 0.6, Y * 0.9 + X * 0.25 - Z * 0.3);
    // Light where the clump bulges and on top, dark in its hollows and underneath — the shade
    // between leaves that makes a mass of them read as a tree, not as felt.
    const shade = (0.84 + 0.14 * Math.max(-1.4, Math.min(1.4, (f - 1) / deep))) * (0.72 + 0.28 * (y * 0.5 + 0.5));
    colour.push(shade, shade, shade);
  }
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(colour, 3));
  g.computeVertexNormals();
  return g;
}

/** A frond (Part "frond"): its triangles from lib/scene/organic.ts, plan mm (x across, y along,
 *  z up) into three metres (x, z-up → y, along → +z, then turned onto the plan by the part's
 *  rotation like every other part). Flat-shaded leaflets; the foliage material is two-sided. */
function frondGeometry(part: Extract<Part, { shape: "frond" }>): BufferGeometry {
  const tris = frondTriangles(part);
  const pos: number[] = [];
  const uv: number[] = [];
  const colour: number[] = [];
  for (const p of tris) {
    // Plan frame: +y is DOWN the plan, which is three's +z (see the note at the top).
    pos.push(m(p.x), m(p.z), m(p.y));
    uv.push(m(p.x), m(p.y));
    // Darker at the stem, lighter toward the tips.
    const c = 0.72 + 0.36 * Math.min(1, Math.hypot(p.x, p.y, p.z) / Math.max(1, part.len));
    colour.push(c, c, c);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(colour, 3));
  g.computeVertexNormals();
  return g;
}

/** A crown's leaf cards (Part "leaves"): one quad per card in metres, about the part's own `at` —
 *  upright, tipped back `pitchDeg` about its own x, turned `yawDeg` on the plan — its UVs one cell of
 *  the 2×2 leaf atlas (scene-materials.ts leafCardTexture), its NORMAL pointing away from the
 *  crown's `centre` and a little up whichever way the card faces, so a crown of flat cards is lit
 *  as one round mass, and its colour the card's `shade`, a touch darker at its foot. */
function leavesGeometry(part: Extract<Part, { shape: "leaves" }>): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const colour: number[] = [];
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const c of part.cards) {
    const half = c.size / 2;
    const p = rad(c.pitchDeg);
    const y0 = rad(c.yawDeg);
    const u0 = (c.tile % 2) * 0.5;
    const v0 = (Math.floor(c.tile / 2) % 2) * 0.5;
    let nx = c.x - part.centre.x;
    let ny = c.y - part.centre.y;
    let nz = c.z - part.centre.z;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz = nz / len + 0.25;
    const nl2 = Math.hypot(nx, ny, nz) || 1;
    for (const [u, v] of corners) {
      // Plan frame: a card's width along x, its height along z, then tipped and turned.
      const lx = u * half;
      const lz = v * half;
      const ly = lz * Math.sin(p);
      const lzz = lz * Math.cos(p);
      const x = c.x + lx * Math.cos(y0) - ly * Math.sin(y0);
      const y = c.y + lx * Math.sin(y0) + ly * Math.cos(y0);
      const z = c.z + lzz;
      pos.push(m(x), m(z), m(y));
      nrm.push(nx / nl2, nz / nl2, ny / nl2);
      uv.push(u0 + 0.25 * (u + 1), v0 + 0.25 * (v + 1));
      const k = c.shade * (v < 0 ? 0.86 : 1);
      colour.push(k, k, k);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(colour, 3));
  return g;
}

/** The tilt (see the rule at the top): a turn about the part's own x axis through its base
 *  centre, which is the origin the part was built about. three's rotateX is the right-handed
 *  turn, so +tilt carries the top (0, h, 0) to (0, h·cos, h·sin): toward +z, plan +y. */
function tilted(g: BufferGeometry, tiltDeg: number | undefined): BufferGeometry {
  if (tiltDeg) g.rotateX(rad(tiltDeg));
  return g;
}

/** One part, in metres, about its own base — before its `at`/`rotDeg` is applied. */
export function partGeometry(part: Part): BufferGeometry {
  switch (part.shape) {
    case "box":
      return tilted(boxGeometry(part.w, part.d, part.h), part.tiltDeg);
    case "cylinder":
      return tilted(cylinderGeometry(part.rTop, part.rBottom, part.h, part.segments ?? DEFAULT_RADIAL), part.tiltDeg);
    case "sphere":
      return sphereGeometry(part.r, part.segments ?? DEFAULT_SPHERE);
    case "blob":
      return blobGeometry(part.r, part.seed, part.lumps ?? 4, part.rough ?? 0.2, part.squash ?? 1, part.detail ?? 3);
    case "frond":
      return frondGeometry(part);
    case "leaves":
      return leavesGeometry(part);
    case "extrude":
      return extrudeGeometry(part.outline, part.h, part.holes);
    case "lathe": {
      const g = latheGeometry(part.profile, part.segments ?? DEFAULT_RADIAL);
      // The plan's y is three's z.
      if (part.scaleY && part.scaleY !== 1) g.scale(1, 1, part.scaleY);
      return g;
    }
    case "drape":
      return drapeGeometry(part.outline, part.h, part.foldPitchMm ?? 230, part.foldDepthMm ?? 20, part.flareMm ?? 40);
    case "torus":
      return torusGeometry(part.r, part.tube, part.segments ?? DEFAULT_TORUS_TUBULAR);
    case "plane":
      return planeGeometry(part.outline, part.side ?? "up", part.holes);
    case "ribbon":
      return ribbonGeometry(part.path, part.h, part.pleatMm, part.amplitudeMm);
  }
}

// --- bodies ---------------------------------------------------------------------------------------

const scratchM = new Matrix4();
const scratchP = new Vector3();
const scratchQ = new Quaternion();
const ONE = new Vector3(1, 1, 1);

/** The part's place in its body: translate to `at` (base centre; a sphere's centre), turn `rotDeg`. */
function partMatrix(at: Vec3, rotDeg: number | undefined): Matrix4 {
  const [x, y, z] = toWorld(at);
  scratchP.set(x, y, z);
  scratchQ.setFromAxisAngle(UP, worldRotationY(rotDeg ?? 0));
  return scratchM.compose(scratchP, scratchQ, ONE);
}

function rotDegOf(part: Part): number | undefined {
  return "rotDeg" in part ? part.rotDeg : undefined;
}

/** Merge, with every piece made non-indexed first — ExtrudeGeometry is non-indexed and the
 *  parametric shapes are indexed, and mergeGeometries refuses a mix. The pieces are left for the
 *  caller to dispose. */
function mergeNonIndexed(pieces: BufferGeometry[]): BufferGeometry {
  const flat = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
  const live = flat.filter((g) => (g.getAttribute("position")?.count ?? 0) > 0);
  let out: BufferGeometry;
  if (live.length === 0) out = new BufferGeometry();
  else if (live.length === 1) out = live[0].clone();
  else out = mergeGeometries(live, false) ?? new BufferGeometry();
  out.clearGroups();
  for (let i = 0; i < flat.length; i++) if (flat[i] !== pieces[i]) flat[i].dispose();
  return out;
}

/** A white vertex colour on a geometry that has none. */
function withColour(g: BufferGeometry): void {
  if (g.getAttribute("color")) return;
  const n = g.getAttribute("position")?.count ?? 0;
  g.setAttribute("color", new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
}

/** The group's UVs as fractions of its own footprint, so a stretched image is one copy over it. */
function normaliseUv(g: BufferGeometry): void {
  g.computeBoundingBox();
  const box = g.boundingBox;
  if (!box) return;
  const w = Math.max(1e-6, box.max.x - box.min.x);
  const d = Math.max(1e-6, box.max.z - box.min.z);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  if (!pos || !uv) return;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - box.min.x) / w, (pos.getZ(i) - box.min.z) / d);
  uv.needsUpdate = true;
}

const isStretched = (ref: MaterialRef) => ref.image?.fit === "stretch";

/** Every part placed in the body's frame and merged per effective material (a part's own, else the
 *  body's). The caller owns the geometries. */
export function bodyGeometry(body: BodyNode): Built[] {
  const groups = new Map<string, { material: MaterialRef; pieces: BufferGeometry[] }>();
  for (const part of body.parts) {
    const material = part.material ?? body.material;
    const key = JSON.stringify(material);
    let group = groups.get(key);
    if (!group) {
      group = { material, pieces: [] };
      groups.set(key, group);
    }
    const g = partGeometry(part);
    g.applyMatrix4(partMatrix(part.at, rotDegOf(part)));
    group.pieces.push(g);
  }
  const out: Built[] = [];
  for (const { material, pieces } of groups.values()) {
    // Foliage is vertex-shaded (a blob's hollows, a frond's stem): every piece of it carries a
    // colour, white where its shape has none (a hedge's core box, a bed's heads) — a merge of
    // pieces with and without one would drop them all.
    if (material.kind === "foliage") for (const p of pieces) withColour(p);
    const geometry = mergeNonIndexed(pieces);
    for (const p of pieces) p.dispose();
    if (isStretched(material)) normaliseUv(geometry);
    geometry.computeBoundingSphere();
    out.push({ geometry, material });
  }
  return out;
}

// --- the cache ------------------------------------------------------------------------------------

/** A cheap fingerprint of what the geometry depends on — every number in every part and the
 *  materials that decide the grouping — so a rebuilt scene reuses the geometry of a body that did
 *  not change and rebuilds only what did. Two independent 32-bit folds plus the count. */
export function geometrySignature(body: BodyNode): string {
  let a = 0x811c9dc5 | 0;
  let b = 0x1b873593 | 0;
  let n = 0;
  const num = (v: number) => {
    const x = Math.round(v * 4) | 0;
    a = Math.imul(a ^ x, 16777619);
    b = (Math.imul(b, 31) + x) | 0;
    n++;
  };
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) num(s.charCodeAt(i));
  };
  const pt = (p: Point) => {
    num(p.x);
    num(p.y);
  };
  const v3 = (v: Vec3) => {
    num(v.x);
    num(v.y);
    num(v.z);
  };
  const outline = (o: BuiltOutline) => {
    num(o.outline.length);
    for (const p of o.outline) pt(p);
    if (o.edgeCurves) {
      for (const c of o.edgeCurves) {
        if (c) {
          pt(c.c1);
          pt(c.c2);
        } else num(-1);
      }
    }
  };
  str(JSON.stringify(body.material));
  for (const p of body.parts) {
    str(p.shape);
    v3(p.at);
    if (p.material) str(JSON.stringify(p.material));
    switch (p.shape) {
      case "box":
        num(p.w);
        num(p.d);
        num(p.h);
        num(p.rotDeg ?? 0);
        num(p.tiltDeg ?? 0);
        break;
      case "cylinder":
        num(p.rTop);
        num(p.rBottom);
        num(p.h);
        num(p.segments ?? 0);
        num(p.rotDeg ?? 0);
        num(p.tiltDeg ?? 0);
        break;
      case "sphere":
        num(p.r);
        num(p.segments ?? 0);
        break;
      case "blob":
        num(p.r);
        num(p.seed);
        num(p.lumps ?? 0);
        num((p.rough ?? 0) * 1000);
        num((p.squash ?? 1) * 1000);
        num(p.detail ?? 0);
        break;
      case "frond":
        num(p.len);
        num(p.w);
        num(p.rotDeg ?? 0);
        num(p.liftDeg ?? 0);
        num(p.droopDeg ?? 0);
        num(p.leaflets ?? 0);
        num(p.foldDeg ?? 0);
        break;
      case "torus":
        num(p.r);
        num(p.tube);
        num(p.segments ?? 0);
        break;
      case "leaves":
        v3(p.centre);
        num(p.cards.length);
        for (const c of p.cards) {
          num(c.x);
          num(c.y);
          num(c.z);
          num(c.size);
          num(c.yawDeg);
          num(c.pitchDeg);
          num(c.tile);
          num(c.shade * 1000);
        }
        break;
      case "extrude":
        num(p.h);
        num(p.rotDeg ?? 0);
        outline(p.outline);
        num(p.holes?.length ?? 0);
        for (const h of p.holes ?? []) outline(h);
        break;
      case "lathe":
        num(p.segments ?? 0);
        num((p.scaleY ?? 1) * 1000);
        for (const q of p.profile) {
          num(q.r);
          num(q.z);
        }
        break;
      case "plane":
        str(p.side ?? "up");
        num(p.rotDeg ?? 0);
        outline(p.outline);
        num(p.holes?.length ?? 0);
        for (const h of p.holes ?? []) outline(h);
        break;
      case "ribbon":
        num(p.h);
        num(p.pleatMm ?? 0);
        num(p.amplitudeMm ?? 0);
        for (const q of p.path) pt(q);
        break;
      case "drape":
        num(p.h);
        num(p.foldPitchMm ?? 0);
        num(p.foldDepthMm ?? 0);
        num(p.flareMm ?? 0);
        num(p.outline.length);
        for (const q of p.outline) pt(q);
        break;
    }
  }
  return `${n}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

/** The far stand-in for a body: one box over the bounding box of everything it is made of, in the
 *  body's own frame (a chair past 25 m is its box — the shape still reads as a chair's size at
 *  that distance, and six hundred of them are one instanced draw of twelve triangles). */
export function proxyGeometry(built: Built[]): BufferGeometry {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const b of built) {
    b.geometry.computeBoundingBox();
    const box = b.geometry.boundingBox;
    if (!box || box.isEmpty()) continue;
    minX = Math.min(minX, box.min.x);
    minY = Math.min(minY, box.min.y);
    minZ = Math.min(minZ, box.min.z);
    maxX = Math.max(maxX, box.max.x);
    maxY = Math.max(maxY, box.max.y);
    maxZ = Math.max(maxZ, box.max.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return new BufferGeometry();
  const g = new BoxGeometry(Math.max(1e-3, maxX - minX), Math.max(1e-3, maxY - minY), Math.max(1e-3, maxZ - minZ));
  g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  g.computeBoundingSphere();
  return g;
}

interface CacheEntry {
  signature: string;
  built: Built[];
  /** Built on first ask, by `proxy()`; disposed with the entry. */
  proxy?: BufferGeometry;
}

function disposeEntry(entry: CacheEntry): void {
  for (const b of entry.built) b.geometry.dispose();
  entry.proxy?.dispose();
}

/** Built geometries by body id, kept across rebuilds while the body's signature holds. One per
 *  mounted viewer: `sweep` drops the bodies a new scene no longer has, `dispose` everything. */
export class GeometryCache {
  private entries = new Map<string, CacheEntry>();

  private entry(body: BodyNode): CacheEntry {
    const signature = geometrySignature(body);
    const hit = this.entries.get(body.id);
    if (hit && hit.signature === signature) return hit;
    if (hit) disposeEntry(hit);
    const entry: CacheEntry = { signature, built: bodyGeometry(body) };
    this.entries.set(body.id, entry);
    return entry;
  }

  get(body: BodyNode): Built[] {
    return this.entry(body).built;
  }

  /** The body's far box (proxyGeometry), kept beside its geometry under the same signature. */
  proxy(body: BodyNode): BufferGeometry {
    const entry = this.entry(body);
    entry.proxy ??= proxyGeometry(entry.built);
    return entry.proxy;
  }

  sweep(live: ReadonlySet<string>): void {
    for (const [id, entry] of this.entries) {
      if (live.has(id)) continue;
      disposeEntry(entry);
      this.entries.delete(id);
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) disposeEntry(entry);
    this.entries.clear();
  }
}
