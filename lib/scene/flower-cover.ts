// FLOWERS THAT FOLLOW A SHAPE, in the room — the plan's layout (lib/catalog/flower-cover.ts, laid by
// lib/catalog/flower-draw.ts composeShape) lifted into height.
//
// The plan says where each head stands on an outline, how DEEP in the outline it lies and which way
// is OUT. This module gives every outline a SECTION and puts the heads on it:
//   · the CAP — the dome's own law across any outline: the middle highest, the heads leaning out
//     toward the rim (a circle gives the dome back; a ring's band a half-round ridge — a wreath);
//   · the WALL — a piece taller than its cap stands on straight sides, dressed level under level
//     along the outline (a column of flowers, a sleeve round a pillar, a hedge), optionally wound as
//     a SPIRAL (FlowerDrawSpec.spiral);
//   · the UNDERSIDE — a piece that stands off the floor (ShapePart.zMm) is a lens: flowered beneath
//     as above. A hung piece is built upright and turned over (./overhead.ts), so its cap looks down.
// A band thinner than a head, or lines only, is a GARLAND: a rope of heads, one up, one each side.
// A shape drawn on the FRONT plane is covered on its FACE (a flower wall), a thin one all round (an
// arch covered along its curve) — the face is just another outline, stood up through the panel's
// own arithmetic (lib/element/front.ts panelPoint).
//
// Everything is an instance of the heads the rest of the room already draws (./flowers.ts headPart).
// Pure. Run: npm run check:scene-flower-cover
import { composeCover, composeFlowers, type FlowerDrawSpec, type FlowerItem } from "@/lib/catalog/flower-draw";
import type { CoverShape } from "@/lib/catalog/flower-cover";
import { panelPoint } from "@/lib/element/front";
import { flattenEdge, footprintOutlines, pieceOf, type BuiltOutline } from "@/lib/studio/footprint";
import type { InstanceRequest, ItemBuild } from "./collect";
import { elementOf, elementParts } from "./element-body";
import { headKey, headPart, massColour } from "./flowers";
import type { ItemContext } from "./item-context";
import { foliageMaterial } from "./materials";
import { type NodeTag, type Part, type Transform, transform, vec3 } from "./types";

const LEAF = "#8fae84";
const BOARD = "#3d5a38";
const LEAF_UNIT_MM = 100;
const LEAF_WIDTH = 0.38;
/** The cap is this many of the outline's depth high at most: past it the piece stands on walls. */
const CAP_SHARE = 1.15;
/** A piece whose bottom is this far off the floor is seen from beneath: a lens, flowered under. */
const RAISED_MM = 80;
/** Levels down a wall stand this many head radii apart; never more than this many of them. */
const LEVEL_STEP = 1.3;
const MAX_LEVELS = 80;
/** Every other level of a wall looks this far up from level — flowers on a column are seen from
 *  above as well as from the side, and a wall of heads all looking dead level showed in stripes. */
export const WALL_LIFT_DEG = 24;
/** A spiral's band is this share of a turn wide. */
const SPIRAL_BAND = 0.36;
/** A flower wall's relief: its heads stand this far proud of the board at the middle, at most. */
const WALL_RELIEF_MM = 130;
/** A face narrower than this (to its nearest edge) is covered ALL ROUND — an arch's limb, a hoop. */
const TUBE_DEPTH_MM = 330;
/** Fills vanish past this distance, as an arrangement's do. */
const FILL_LOD_MM = 15000;

type Head = Extract<FlowerItem, { t: "head" | "fill" }>;
const deg = (rad: number) => (rad * 180) / Math.PI;
const petal = (colour: string) => ({ colour, kind: "petal" as const });

/** What the room knows of one outline of the footprint: its bottom, its height, and whether the
 *  flowers leave it alone (a front shape's plan band — its FACE is covered instead). */
export interface CoverPiece {
  zMm: number;
  heightMm: number;
  skip?: boolean;
}

/** Behind every bloom, a clump of the dark foliage it is packed into, this share of a head across and
 *  this far behind it: what shows between two flowers is the depth of the piece, never the floor
 *  through it — on any outline, a wall or an underside alike (a solid the shape of the outline stood
 *  out past the heads as a dark kerb). One instanced ball per colour and size. */
const BACK_SHARE = 0.8;
const BACK_BEHIND = 0.95;

/** One head looking along (outRad on the plan, tiltDeg from upright), its centre at (x, y, z); `back`
 *  (a radius) puts its clump of foliage behind it. */
function pushHead(build: ItemBuild, tag: NodeTag, it: Head, x: number, y: number, z: number, outRad: number, tiltDeg: number, spin: number, back = 0): void {
  if (back > 0 && it.t === "head") {
    const t = (Math.max(0, Math.min(180, tiltDeg)) * Math.PI) / 180;
    const r = Math.round(back * BACK_SHARE);
    const bx = x - Math.cos(outRad) * Math.sin(t) * back * BACK_BEHIND;
    const by = y - Math.sin(outRad) * Math.sin(t) * back * BACK_BEHIND;
    const bz = z - Math.cos(t) * back * BACK_BEHIND;
    build.instanced.push({ key: `flower-mass:${build.material.colour}:${r}`, parts: [{ shape: "sphere", r, at: vec3(0, 0, 0), segments: 8 }], material: { colour: massColour(build.material.colour), kind: "matte" }, tag, at: transform(vec3(bx, by, bz)), castShadow: false });
  }
  const part = headPart(it);
  const at: Transform = part.shape === "bloom" ? { ...transform(vec3(x, y, z), deg(outRad) - 90), spinDeg: deg(spin) } : transform(vec3(x, y, z), deg(spin));
  const tilt = Math.max(0, Math.min(180, tiltDeg));
  if (part.shape === "bloom" && tilt > 0.5) at.tiltDeg = Math.round(tilt * 10) / 10;
  const req: InstanceRequest = { key: headKey(it.kind, it.col, it.r), parts: [part], material: petal(it.col), tag, at, castShadow: false };
  if (it.t === "fill") req.lod = { tier: "near", beyondMm: FILL_LOD_MM };
  build.instanced.push(req);
}

function pushLeaf(build: ItemBuild, tag: NodeTag, col: string, x: number, y: number, z: number, angRad: number, len: number): void {
  if (len <= 0) return;
  build.instanced.push({
    key: `leaf:${col}`,
    parts: [{ shape: "frond", len: LEAF_UNIT_MM, w: LEAF_UNIT_MM * LEAF_WIDTH, at: vec3(0, 0, 0), rotDeg: -90, liftDeg: 18, droopDeg: 55, foldDeg: 22 }],
    material: foliageMaterial(col),
    tag,
    at: transform(vec3(x, y, z), deg(angRad), false, len / LEAF_UNIT_MM),
    castShadow: false,
  });
}

/** An outline's section: the heights of its lens, wall and cap, and where a head `d` deep in an
 *  outline `dep` deep stands on the cap and how it leans. */
function sectionOf(piece: CoverPiece, dep: number) {
  const H = Math.max(20, piece.heightMm);
  const lens = piece.zMm >= RAISED_MM;
  const cap = Math.min(lens ? H / 2 : H, dep * CAP_SHARE);
  const under = lens ? cap : 0;
  const wall = H - cap - under;
  const base = piece.zMm + under + wall;
  return {
    H,
    lens,
    cap,
    wall,
    /** The cap's foot — the top of the wall. */
    base,
    /** The wall's foot (the lens's widest underneath). */
    foot: piece.zMm + under,
    top(d: number) {
      const u = 1 - Math.min(1, d / dep);
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      return { z: base + cap * s, lean: deg(Math.atan2(u * cap, Math.max(1e-6, s * dep))) };
    },
  };
}

/**
 * The plan's shape-following layout (`spec.form === "shape"`) stood up: every outline at the bottom
 * and height `pieceOf` says. In the footprint's frame, z up from the item's own floor.
 */
export function coverBuild(spec: FlowerDrawSpec, pieceAt: (shape: number) => CoverPiece, tag: NodeTag): ItemBuild {
  const items = composeFlowers(spec);
  const greenCol = items.find((it): it is Extract<FlowerItem, { t: "green" }> => it.t === "green")?.col ?? LEAF;
  const build: ItemBuild = { parts: [], material: foliageMaterial(greenCol), instanced: [], emitters: [] };
  const heads = items.filter((it): it is Head => (it.t === "head" || it.t === "fill") && !!it.on);
  const blooms = heads.filter((it) => it.t === "head");
  const rbar = blooms.length ? blooms.reduce((s, it) => s + it.r, 0) / blooms.length : 40;
  const shapes = spec.cover ?? [];

  // The heads the plan laid: on the cap (and mirrored under a lens); a garland's round its rope.
  heads.forEach((it, i) => {
    const on = it.on!;
    const piece = pieceAt(on.shape);
    if (piece.skip) return;
    const S = sectionOf(piece, on.dep);
    const out = Math.atan2(on.ny, on.nx);
    // What fills the hollows between the heads stands a little under them.
    const fillDip = it.t === "fill" ? rbar * 0.4 : 0;
    if (on.garland) {
      // A rope of heads: one up, one out each side, turn about.
      const rope = Math.max(rbar * 0.85, on.dep * 0.6);
      const k = i % 3;
      const side = k === 1 ? 1 : k === 2 ? -1 : 0;
      const x = it.x + on.nx * side * rope * 0.7;
      const y = it.y + on.ny * side * rope * 0.7;
      const z = S.base + (side ? rope * 0.75 : rope * 1.35) - fillDip;
      pushHead(build, tag, it, x, y, z, side < 0 ? out + Math.PI : out, side ? 72 : 8, it.rot);
      return;
    }
    const top = S.top(on.d);
    pushHead(build, tag, it, it.x, it.y, top.z - it.r * 0.15 - fillDip, out, top.lean, it.rot, rbar);
    if (S.lens) pushHead(build, tag, it, it.x, it.y, piece.zMm + S.cap - (top.z - S.base) + it.r * 0.15, out, 180 - top.lean, it.rot + 1, rbar);
  });

  // The WALLS, and the steep foot of every cap: level under level along each outline's rim row.
  shapes.forEach((shape, si) => {
    const piece = pieceAt(si);
    if (piece.skip) return;
    const rim = blooms.filter((it) => it.on!.shape === si && it.on!.rim);
    if (!rim.length) return;
    const dep = rim[0].on!.dep;
    const garland = rim[0].on!.garland;
    const S = sectionOf(piece, dep);
    const step = LEVEL_STEP * rbar;
    // From just under the rim row down to the piece's foot (a lens: to its rim row underneath).
    const rimD = rim.reduce((s, it) => s + it.on!.d, 0) / rim.length;
    const from = garland ? S.base : S.top(rimD).z;
    const to = S.lens ? piece.zMm + S.cap - (S.top(rimD).z - S.base) : piece.zMm + rbar * 0.35;
    const levels = Math.min(MAX_LEVELS, Math.floor((from - to) / step));
    const spiral = spec.spiral && S.wall > rbar * 4 ? spec.spiral : 0;
    for (let k = 1; k <= levels; k++) {
      const z = from - ((from - to) * k) / (levels + (S.lens ? 1 : 0.4));
      // How far in from the edge the section stands at this height, and how it leans there.
      let inset = 0;
      let lean = k % 2 ? 90 : 90 - WALL_LIFT_DEG;
      if (!garland && z > S.base) {
        const hf = Math.min(1, (z - S.base) / Math.max(1, S.cap));
        const u = Math.sqrt(Math.max(0, 1 - hf * hf));
        inset = dep * (1 - u);
        lean = deg(Math.atan2(u * S.cap, Math.max(1e-6, hf * dep)));
      } else if (!garland && S.lens && z < S.foot) {
        const hf = Math.min(1, (S.foot - z) / Math.max(1, S.cap));
        const u = Math.sqrt(Math.max(0, 1 - hf * hf));
        inset = dep * (1 - u);
        lean = 180 - deg(Math.atan2(u * S.cap, Math.max(1e-6, hf * dep)));
      }
      rim.forEach((it, j) => {
        const on = it.on!;
        if (spiral) {
          const turn = on.u - (spiral * (z - piece.zMm)) / S.H;
          if (turn - Math.floor(turn) > SPIRAL_BAND) return;
        }
        const src = rim[(j + k * 3) % rim.length];
        // Odd levels stand between the heads of the level above.
        const shift = k % 2 ? rbar * 0.85 : 0;
        const side = garland ? ((j + k) % 2 ? 1 : -1) : 1;
        const push = garland ? rbar * 0.55 * side : on.d - inset + src.r * 0.2;
        const x = it.x + on.nx * push - on.ny * shift;
        const y = it.y + on.ny * push + on.nx * shift;
        const out = Math.atan2(on.ny, on.nx) + (side < 0 ? Math.PI : 0);
        // (A spiral is seen from behind too, through the turns it leaves bare: no clump behind its heads.)
        pushHead(build, tag, src, x, y, z, out, lean, src.rot + k, garland || spiral ? 0 : rbar);
        if ((j + k) % 5 === 0) pushLeaf(build, tag, greenCol, x, y, z, out + ((j % 3) - 1) * 0.5, rbar * 2.2);
      });
    }
  });

  // The sprigs: out of each outline a little under its cap's shoulder. A piece of GREENS ALONE (a
  // foliage hoop, a garland of ruscus) is all sprigs — each with a second leaf over it and a clump of
  // foliage under them, so it has a body.
  const leafy = !blooms.length;
  items.forEach((it, i) => {
    if (it.t !== "green") return;
    const piece = pieceAt(it.sh ?? 0);
    if (piece.skip) return;
    const S = sectionOf(piece, rbar * 2);
    const z = S.base + Math.min(S.cap * 0.5, rbar * 1.1);
    pushLeaf(build, tag, it.col, it.x, it.y, z, it.ang, it.len * 1.15);
    if (!leafy) return;
    pushLeaf(build, tag, it.col, it.x, it.y, z + rbar * 0.7, it.ang + 1.9 + (i % 5) * 0.3, it.len);
    if (i % 2 === 0) build.instanced.push({ key: `foliage-clump:${it.col}`, parts: [{ shape: "blob", r: rbar * 1.25, at: vec3(0, 0, 0), seed: 5, lumps: 9, rough: 0.2, detail: 2 }], material: foliageMaterial(it.col), tag, at: transform(vec3(it.x, it.y, z - rbar * 0.2), (i * 67) % 360), castShadow: false });
  });
  return build;
}

/** A front shape's panel as the room builds it (./types.ts Part "panel"). */
export type Panel = Extract<Part, { shape: "panel" }>;

/** A face outline as a shape to cover: its curves flattened, in the face's own frame (y = −up). */
const faceShape = (o: BuiltOutline): CoverShape => {
  const n = o.outline.length;
  return { poly: Array.from({ length: n }, (_, i) => flattenEdge(o.outline[i], o.outline[(i + 1) % n], o.edgeCurves?.[i], 10).slice(0, -1)).flat() };
};

/**
 * A FRONT shape's face covered: a flower wall on a panel, an arch covered along its curve. The
 * spec's own flowers over the face's outlines, each head stood on the panel through panelPoint (so a
 * bent wall is followed), looking out of the face and leaning toward its rim. A face too narrow to
 * be a wall is covered all round — front, back and edge.
 */
export function faceCoverBuild(spec: FlowerDrawSpec, panel: Panel, tag: NodeTag, salt: number): ItemBuild {
  const items = composeCover(spec, panel.face.map(faceShape), salt);
  const greenCol = items.find((it): it is Extract<FlowerItem, { t: "green" }> => it.t === "green")?.col ?? LEAF;
  const build: ItemBuild = { parts: [], material: foliageMaterial(greenCol), instanced: [], emitters: [] };
  const W = panel.widthMm;
  const th = Math.max(1, panel.thicknessMm);
  const turn = ((panel.rotDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  /** A face point (fx across, fy = −up) `w` through the panel, in the item's frame. */
  const stand = (fx: number, fy: number, w: number) => {
    const p = panelPoint(fx, w, W, th, panel.bendDeg);
    return { x: panel.at.x + p.x * cos - p.y * sin, y: panel.at.y + p.x * sin + p.y * cos, z: panel.at.z + panel.faceHeightMm / 2 - fy };
  };
  const heads = items.filter((it): it is Head => (it.t === "head" || it.t === "fill") && !!it.on);
  const blooms = heads.filter((it) => it.t === "head");
  const rbar = blooms.length ? blooms.reduce((s, it) => s + it.r, 0) / blooms.length : 40;
  heads.forEach((it, i) => {
    const on = it.on!;
    const tube = on.garland || on.dep < TUBE_DEPTH_MM;
    const relief = tube ? Math.max(on.dep, rbar * 0.85) : Math.min(on.dep * 0.6, WALL_RELIEF_MM);
    const u = 1 - Math.min(1, on.d / on.dep);
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const lean = Math.atan2(u * relief, Math.max(1e-6, s * on.dep));
    // The panel's own axes where this head stands: out of the face, across it, and up.
    const p0 = stand(it.x, it.y, 0);
    const pn = stand(it.x, it.y, 10);
    const pa = stand(it.x + 10, it.y, 0);
    const n = { x: (pn.x - p0.x) / 10, y: (pn.y - p0.y) / 10 };
    const a = { x: (pa.x - p0.x) / 10, y: (pa.y - p0.y) / 10 };
    // The way out of the outline, in the room: across the face and up it.
    const rimDir = { x: a.x * on.nx, y: a.y * on.nx, z: -on.ny };
    const look = (face: number, l: number) => {
      const v = { x: n.x * face * Math.cos(l) + rimDir.x * Math.sin(l), y: n.y * face * Math.cos(l) + rimDir.y * Math.sin(l), z: rimDir.z * Math.sin(l) };
      return { outRad: Math.atan2(v.y, v.x), tilt: deg(Math.acos(Math.max(-1, Math.min(1, v.z)))) };
    };
    const put = (face: number, w: number, l = 0, fx = it.x, fy = it.y, spin = 0) => {
      const p = stand(fx, fy, w);
      const v = look(face, l);
      pushHead(build, tag, it, p.x, p.y, p.z, v.outRad, v.tilt, it.rot + spin);
    };
    const out = th / 2 + relief * s - it.r * 0.15 - (it.t === "fill" ? rbar * 0.4 : 0);
    if (on.garland) {
      // A rope standing on its edge: front, back and edge in turn.
      const k = i % 3;
      if (k === 0) put(1, th / 2 + relief);
      else if (k === 1) put(-1, -(th / 2 + relief));
      else put(1, 0, Math.PI / 2, it.x + on.nx * relief * 0.8, it.y + on.ny * relief * 0.8);
      return;
    }
    put(1, out, lean);
    if (tube) {
      put(-1, -out, lean, it.x, it.y, 1);
      // …and its edge, between the two faces: the rim row once more, looking along the face.
      if (on.rim && it.t === "head") put(1, 0, Math.PI / 2, it.x + on.nx * (on.d + it.r * 0.25), it.y + on.ny * (on.d + it.r * 0.25), 2);
    }
  });
  for (const it of items) {
    if (it.t !== "green") continue;
    const p = stand(it.x, it.y, th / 2 + rbar * 0.6);
    const p1 = stand(it.x + Math.cos(it.ang) * 20, it.y, th / 2 + rbar * 0.6 + 14);
    pushLeaf(build, tag, it.col, p.x, p.y, p.z, Math.atan2(p1.y - p.y, p1.x - p.x), it.len * 1.1);
  }
  return build;
}

/**
 * A flowers row whose flowers follow its shapes (ctx.flowers.form "shape"): every plan shape covered
 * at its own bottom and height (the element model's — a ring 2 m up is a wreath in the air), every
 * front shape covered on its face over its own board, an outline-only shape left bare.
 */
export function shapedFlowersBody(ctx: ItemContext, tag: NodeTag): ItemBuild {
  const spec = ctx.flowers!;
  const el = elementOf(ctx.product, ctx.footprint);
  const outlines = footprintOutlines(ctx.footprint);
  const multi = ctx.footprint.kind === "multi";
  const pieceAt = (shape: number): CoverPiece => {
    const part = el?.geometry.parts[multi && outlines[shape] ? pieceOf(outlines[shape], shape) : 0];
    if (!part) return { zMm: 0, heightMm: ctx.heightMm };
    return { zMm: part.zMm, heightMm: part.heightMm, skip: part.part.op.kind === "panel" || part.part.op.kind === "none" };
  };
  const build = coverBuild(spec, pieceAt, tag);
  if (!el) return build;
  // The board the flowers stand on: a deep leaf green — the foliage between the blooms, not a hole.
  const board = { colour: BOARD, kind: "matte" as const };
  el.geometry.parts.forEach((p, k) => {
    if (p.part.op.kind !== "panel") return;
    for (const part of elementParts({ ...el.geometry, parts: [p] }, board)) {
      if (part.shape !== "panel") continue;
      build.parts.push({ ...part, material: board });
      const face = faceCoverBuild(spec, part, tag, k);
      build.instanced.push(...face.instanced);
    }
  });
  return build;
}
