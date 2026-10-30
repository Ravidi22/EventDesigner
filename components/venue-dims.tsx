"use client";

// THE HALL EDITOR'S OWN FIGURES — what "הצגת מידות" adds on /halls beside the walls' lengths (which
// the canvas draws itself). The user asked for "more lengths" (2026-10-17) and picked all four:
//
//   • every element's size, along its own sides — width and depth, a diameter for a round one, and a
//     ח's counter depth across the end of one leg;
//   • every door's place on its wall: the corner it is MEASURED from (StructureEntrance.measureFrom)
//     to the opening, the opening, and the opening to the other corner — drawn for the selected door
//     whatever the switch says, because that is the one figure its bar is about;
//   • the selected element's distance to the nearest wall on each of its four sides;
//   • the sides of a zone drawn freehand (a walled zone's sides ARE walls, already labelled) — or its
//     diameter / two axes when it samples a circle or an ellipse, never two dozen sampled chords.
//
// Pure drawing, screen-sized like every other figure on this canvas, and it takes no pointer: a
// figure must never be what a press meant for a handle lands on (the rotate knob is drawn above all
// of this anyway — PlanCanvas's `topmost`). One memoised node per element and per door, compared by
// value, so dragging one bar re-draws that bar's figures and nothing else.
import { memo, useMemo } from "react";
import type { Point } from "@/lib/studio/hall";
import { doorGeometry, fromLocalFrame, sampleEdgePoints, wallLengthMm } from "@/lib/studio/geometry";
import { uShapeBandOf } from "@/lib/studio/footprint";
import { usesDiameter } from "@/lib/catalog/types";
import { rotateKnobPoint } from "@/components/plan-canvas";
import { detectFaces, wallInteriorHint } from "@/lib/venues/faces";
import { doorOffsets, isDoor, nodeMap, wallPoints, type StructureEntrance, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import type { ResolvedZone } from "@/lib/venues/zone";
import { asRound, curveSides } from "@/lib/outputs/measurements";

type Mm = (px: number) => number;
type Tone = "accent" | "ink" | "muted";

const TONE_CLASS: Record<Tone, string> = { accent: "text-accent", ink: "text-ink-soft", muted: "text-muted" };
/** A side shorter than this on screen is not given a figure: the number would be wider than it. */
const MIN_SIDE_PX = 36;
/** How far past the nearest wall a gap is still worth a figure. */
const MAX_GAP_MM = 30000;

const metres = (mm: number) => (mm / 1000).toFixed(2);

/** One dimension: the line, a tick across each end, and the figure on it — in a halo of the surface,
 *  upright whichever way the line runs, beside the line when it is too short to carry it. */
function Dim({ a, b, text, mm, tone = "ink", bold = false, avoid }: { a: Point; b: Point; text: string; mm: Mm; tone?: Tone; bold?: boolean; avoid?: Point | null }) {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1) return null;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const n = { x: -u.y, y: u.x };
  const t = mm(4);
  const font = mm(11);
  const fits = L > text.length * font * 0.6 + mm(10);
  let off = fits ? 0 : font * 1.1;
  const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // A figure that would land on a rotate knob steps aside, to the side of its line away from it.
  if (avoid && Math.hypot(centre.x + n.x * off - avoid.x, centre.y + n.y * off - avoid.y) < mm(20)) {
    const away = (centre.x - avoid.x) * n.x + (centre.y - avoid.y) * n.y >= 0 ? 1 : -1;
    off = away * Math.max(font * 1.6, mm(24));
  }
  const mid = { x: centre.x + n.x * off, y: centre.y + n.y * off };
  let deg = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  const w = bold ? 1.5 : 1;
  return (
    <g className={`pointer-events-none ${TONE_CLASS[tone]}`}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth={w} vectorEffect="non-scaling-stroke" />
      <line x1={a.x - n.x * t} y1={a.y - n.y * t} x2={a.x + n.x * t} y2={a.y + n.y * t} stroke="currentColor" strokeWidth={w} vectorEffect="non-scaling-stroke" />
      <line x1={b.x - n.x * t} y1={b.y - n.y * t} x2={b.x + n.x * t} y2={b.y + n.y * t} stroke="currentColor" strokeWidth={w} vectorEffect="non-scaling-stroke" />
      <text
        x={mid.x}
        y={mid.y}
        transform={`rotate(${deg} ${mid.x} ${mid.y})`}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        className="nums"
        style={{ fontSize: font, fontWeight: bold ? 700 : 600, direction: "ltr", paintOrder: "stroke", stroke: "var(--color-surface)", strokeWidth: mm(3), strokeLinejoin: "round" }}
      >
        {text}
      </text>
    </g>
  );
}

/** An element's own size, along its sides in its own frame: the width across the top, the depth
 *  down the right — each a little outside the shape — or one diameter for a round one; a ח adds its
 *  counter, across the open end of its right leg. */
const FeatureSize = memo(function FeatureSize({ f, mm, knob }: { f: StructureFeature; mm: Mm; knob?: Point | null }) {
  const at = (x: number, y: number) => fromLocalFrame({ x, y }, { x: f.x, y: f.y }, f.rotationDeg ?? 0);
  const px = (lenMm: number) => lenMm / mm(1);
  const gap = mm(12);
  if (f.shape === "circle") {
    if (px(f.widthMm) < MIN_SIDE_PX) return null;
    const r = f.widthMm / 2;
    return <Dim a={at(-r, r + gap)} b={at(r, r + gap)} text={`⌀ ${metres(f.widthMm)}`} mm={mm} avoid={knob} />;
  }
  // Every other shape is figured by its box — the two numbers its handles drag and its bar shows.
  const hw = f.widthMm / 2;
  const hd = f.depthMm / 2;
  const band = f.shape === "u-shape" ? uShapeBandOf(f.widthMm, f.depthMm, f.ring) : null;
  return (
    <>
      {/* Width along the side away from the rotate knob (which hangs off the element's top), depth
          down its right; a ח's counter a step further out across the open end of its right leg. */}
      {px(f.widthMm) >= MIN_SIDE_PX && <Dim a={at(-hw, hd + gap)} b={at(hw, hd + gap)} text={metres(f.widthMm)} mm={mm} avoid={knob} />}
      {px(f.depthMm) >= MIN_SIDE_PX && <Dim a={at(hw + gap, -hd)} b={at(hw + gap, hd)} text={metres(f.depthMm)} mm={mm} avoid={knob} />}
      {band !== null && px(band) >= MIN_SIDE_PX / 2 && <Dim a={at(hw - band, hd + gap * 2.6)} b={at(hw, hd + gap * 2.6)} text={metres(band)} mm={mm} avoid={knob} />}
    </>
  );
});

/** The doors on one wall, figured along it just outside the wall on the side their leaves do not
 *  swing to. With "הצגת מידות" on, ONE chain for the whole wall — corner, opening, the wall between,
 *  the next opening, corner — so two doors on a wall never stack two chains on one line. A selected
 *  door adds the figure its bar is about, bold and a step further out: from the corner it is
 *  measured from (StructureEntrance.measureFrom) to its opening; with the switch off, that door's own
 *  three figures are all that is drawn. */
const WallDoors = memo(function WallDoors({
  doors,
  ax,
  ay,
  bx,
  by,
  hx,
  hy,
  selectedIds,
  dims,
  mm,
}: {
  doors: StructureEntrance[];
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** The interior hint doorGeometry swings the leaves by. */
  hx: number;
  hy: number;
  selectedIds: string[];
  dims: boolean;
  mm: Mm;
}) {
  const a = { x: ax, y: ay };
  const b = { x: bx, y: by };
  const len = wallLengthMm(a, b);
  if (len < 1 || doors.length === 0) return null;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -u.y, y: u.x };
  // Which side the leaves sweep — the figures go on the other one. A wall of windows alone has no
  // leaf to read; its figures take the first side.
  const first = doors.find(isDoor) ?? doors[0];
  const geo = doorGeometry(a, b, first.distanceMm, first.widthMm, first.swingInward, { x: hx, y: hy }, first.doubleDoor, null);
  const tip = geo.leaves[0]?.tip ?? geo.center;
  const away = -(Math.sign((tip.x - geo.center.x) * n.x + (tip.y - geo.center.y) * n.y) || 1);
  const at = (d: number, offPx: number) => ({ x: a.x + u.x * d + n.x * away * mm(offPx), y: a.y + u.y * d + n.y * away * mm(offPx) });
  const span = (e: StructureEntrance) => [Math.max(0, e.distanceMm - e.widthMm / 2), Math.min(len, e.distanceMm + e.widthMm / 2)] as const;
  const sorted = [...doors].sort((p, q) => p.distanceMm - q.distanceMm);
  const chain: { from: number; to: number; opening: boolean }[] = [];
  let cursor = 0;
  for (const e of sorted) {
    const [s0, s1] = span(e);
    if (s0 > cursor + 1) chain.push({ from: cursor, to: s0, opening: false });
    chain.push({ from: s0, to: s1, opening: true });
    cursor = Math.max(cursor, s1);
  }
  if (len > cursor + 1) chain.push({ from: cursor, to: len, opening: false });
  const picked = sorted.filter((e) => selectedIds.includes(e.id));
  return (
    <g>
      {dims && chain.map((c, i) => <Dim key={`c${i}`} a={at(c.from, 12)} b={at(c.to, 12)} text={metres(c.to - c.from)} mm={mm} tone={c.opening ? "muted" : "ink"} />)}
      {picked.map((e) => {
        const [s0, s1] = span(e);
        const fromA = e.measureFrom !== "b";
        const off = doorOffsets(e, len);
        const out = dims ? 30 : 14;
        return (
          <g key={e.id}>
            {fromA
              ? s0 > 0 && <Dim a={at(0, out)} b={at(s0, out)} text={metres(off.toEdgeMm)} mm={mm} tone="accent" bold />
              : s1 < len && <Dim a={at(s1, out)} b={at(len, out)} text={metres(off.toEdgeMm)} mm={mm} tone="accent" bold />}
            {!dims && (
              <>
                <Dim a={at(s0, out)} b={at(s1, out)} text={metres(e.widthMm)} mm={mm} tone="muted" />
                {fromA
                  ? s1 < len && <Dim a={at(s1, out)} b={at(len, out)} text={metres(off.farEdgeMm)} mm={mm} tone="ink" />
                  : s0 > 0 && <Dim a={at(0, out)} b={at(s0, out)} text={metres(off.farEdgeMm)} mm={mm} tone="ink" />}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
});

/** Every wall and boundary as straight pieces — a bowed wall sampled along its curve. */
function wallSegments(s: VenueStructure): [Point, Point][] {
  const nodes = nodeMap(s);
  const out: [Point, Point][] = [];
  for (const w of s.walls) {
    const pts = wallPoints(s, w, nodes);
    if (!pts) continue;
    const run = [pts.a, ...sampleEdgePoints(pts.a, pts.b, w.curve ?? null, 16), pts.b];
    for (let i = 1; i < run.length; i++) out.push([run[i - 1], run[i]]);
  }
  return out;
}

/** How far along the ray from `o` in direction `d` (a unit vector) it first meets a segment. */
function rayHit(o: Point, d: Point, segs: [Point, Point][]): number | null {
  let best: number | null = null;
  for (const [p, q] of segs) {
    const e = { x: q.x - p.x, y: q.y - p.y };
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const w = { x: p.x - o.x, y: p.y - o.y };
    const t = (w.x * e.y - w.y * e.x) / den;
    const s = (w.x * d.y - w.y * d.x) / den;
    if (t > 0.5 && s >= 0 && s <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

/** The selected element's distance to the nearest wall straight out from each of its four sides, in
 *  its own frame — from the middle of the side (the extreme of a round one) to where that line first
 *  meets a wall or a boundary. */
function WallGaps({ f, segs, mm, knob }: { f: StructureFeature; segs: [Point, Point][]; mm: Mm; knob?: Point | null }) {
  const rad = ((f.rotationDeg ?? 0) * Math.PI) / 180;
  const ux = { x: Math.cos(rad), y: Math.sin(rad) };
  const uy = { x: -Math.sin(rad), y: Math.cos(rad) };
  const hw = f.widthMm / 2;
  const hd = (f.shape === "circle" ? f.widthMm : f.depthMm) / 2;
  const sides: { d: Point; reach: number }[] = [
    { d: ux, reach: hw },
    { d: { x: -ux.x, y: -ux.y }, reach: hw },
    { d: uy, reach: hd },
    { d: { x: -uy.x, y: -uy.y }, reach: hd },
  ];
  return (
    <>
      {sides.map(({ d, reach }, i) => {
        const o = { x: f.x + d.x * reach, y: f.y + d.y * reach };
        const t = rayHit(o, d, segs);
        if (t === null || t > MAX_GAP_MM) return null;
        return <Dim key={i} a={o} b={{ x: o.x + d.x * t, y: o.y + d.y * t }} text={metres(t)} mm={mm} tone="accent" bold avoid={knob} />;
      })}
    </>
  );
}

/** A freehand zone's sides — or, when its outline samples a circle or an ellipse, its diameter or
 *  its two axes across the middle. Sides that sample a curve inside an otherwise straight outline
 *  are left unlabelled (curveSides), as on the printed sheets. */
const RegionSides = memo(function RegionSides({ boundary, mm }: { boundary: Point[]; mm: Mm }) {
  const round = asRound(boundary);
  if (round) {
    const v = { x: -round.u.y, y: round.u.x };
    const across = (dir: Point, r: number) => ({ a: { x: round.c.x - dir.x * r, y: round.c.y - dir.y * r }, b: { x: round.c.x + dir.x * r, y: round.c.y + dir.y * r } });
    if (round.circle) {
      const { a, b } = across({ x: 1, y: 0 }, round.rx);
      return <Dim a={a} b={b} text={`⌀ ${metres(round.rx * 2)}`} mm={mm} tone="accent" />;
    }
    const major = across(round.u, round.rx);
    const minor = across(v, round.ry);
    return (
      <>
        <Dim a={major.a} b={major.b} text={metres(round.rx * 2)} mm={mm} tone="accent" />
        <Dim a={minor.a} b={minor.b} text={metres(round.ry * 2)} mm={mm} tone="accent" />
      </>
    );
  }
  const curve = curveSides(boundary);
  return (
    <>
      {boundary.map((p, i) => {
        const q = boundary[(i + 1) % boundary.length];
        const L = Math.hypot(q.x - p.x, q.y - p.y);
        if (curve[i] || L / mm(1) < MIN_SIDE_PX) return null;
        return <Dim key={i} a={p} b={q} text={metres(L)} mm={mm} tone="accent" />;
      })}
    </>
  );
});

export function VenueDims({
  structure,
  zones,
  dims,
  selectedFeatureIds,
  selectedDoorIds,
  editingOutline,
  mm,
}: {
  structure: VenueStructure;
  zones: ResolvedZone[];
  /** A surface's outline while it is being reshaped point by point: its sides are measured whether
   *  or not "הצגת מידות" is on — the lengths are what the reshaping is for. */
  editingOutline?: Point[] | null;
  /** "הצגת מידות" — off, only the selected door's chain is drawn. */
  dims: boolean;
  selectedFeatureIds: string[];
  selectedDoorIds: string[];
  mm: Mm;
}) {
  const nodes = useMemo(() => nodeMap(structure), [structure]);
  const faces = useMemo(() => detectFaces(structure), [structure]);
  const segs = useMemo(() => (dims && selectedFeatureIds.length === 1 ? wallSegments(structure) : []), [dims, selectedFeatureIds.length, structure]);
  // Where a selected, unlocked element's rotate knob hangs — the one spot no figure may sit on.
  const knobOf = (f: StructureFeature): Point | null =>
    selectedFeatureIds.includes(f.id) && !f.locked ? rotateKnobPoint({ x: f.x, y: f.y }, (usesDiameter(f.shape) ? f.widthMm : f.depthMm) / 2, f.rotationDeg ?? 0, mm) : null;
  const gapFeature = dims && selectedFeatureIds.length === 1 ? structure.features.find((f) => f.id === selectedFeatureIds[0] && f.kind !== "surface") : undefined;
  return (
    <g aria-hidden>
      {dims &&
        zones.filter((r) => r.zone.source.type === "region" && r.boundary.length >= 3).map((r) => <RegionSides key={r.zone.id} boundary={r.boundary} mm={mm} />)}
      {editingOutline && editingOutline.length >= 3 && <RegionSides boundary={editingOutline} mm={mm} />}
      {dims &&
        structure.features
          .filter((f) => f.kind !== "plant" && f.kind !== "surface")
          .map((f) => <FeatureSize key={f.id} f={f} mm={mm} knob={knobOf(f)} />)}
      {structure.walls.map((w) => {
        const doors = structure.entrances.filter((e) => e.wallId === w.id);
        if (doors.length === 0 || (!dims && !doors.some((e) => selectedDoorIds.includes(e.id)))) return null;
        const pts = wallPoints(structure, w, nodes);
        if (!pts) return null;
        const hint = wallInteriorHint(faces, pts.a, pts.b, w.a, w.b);
        return (
          <WallDoors
            key={w.id}
            doors={doors}
            ax={pts.a.x}
            ay={pts.a.y}
            bx={pts.b.x}
            by={pts.b.y}
            hx={hint.x}
            hy={hint.y}
            selectedIds={selectedDoorIds}
            dims={dims}
            mm={mm}
          />
        );
      })}
      {gapFeature && <WallGaps f={gapFeature} segs={segs} mm={mm} knob={knobOf(gapFeature)} />}
    </g>
  );
}
