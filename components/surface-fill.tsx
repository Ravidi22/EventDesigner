// The ground a `surface` feature is laid in — a lawn, a paved court, a timber deck — drawn as a
// texture at REAL scale, in the feature's own millimetres: a paving slab is 60cm and a deck board
// 14cm at every zoom, so a surface reads as the size it is next to the tables set on it.
//
// Two layers, both inside the feature's own turned frame (so a deck turned 30° turns its boards):
//   - a pattern for what is laid in units — slabs in a running bond, boards with staggered joints,
//     the faint mowing stripes on a lawn — with `patternUnits="userSpaceOnUse"`, i.e. millimetres;
//   - a noise filter for what is a material rather than a layout — blades of grass, grains of sand,
//     the grain of the timber, weathering on the stone — its frequencies also in millimetres.
//
// Colour: one base per material (or the designer's own style.fill), every other tone derived from
// it by black/white overlays, the same rule as components/plant-glyph.tsx.
import { useId } from "react";
import type { Footprint } from "@/lib/studio/footprint";
import type { SurfaceMaterial } from "@/lib/venues/structure";
import { FootprintShape } from "@/components/footprint-shape";

export const SURFACE_BASE: Record<SurfaceMaterial, string> = {
  grass: "#72a552",
  paving: "#d9d3c7",
  deck: "#a9774b",
  gravel: "#cdc4b2",
  sand: "#e4d1a0",
  soil: "#6f4d34",
  tile: "#2b2a2e",
  plain: "#b9b6b1",
};

/** One band of noise laid over the base: a turbulence, turned into a tint whose opacity follows one
 *  channel of the noise (`gain × channel + bias`), clipped to the shape. */
type Grain = {
  /** baseFrequency — per millimetre. Two numbers ("x y") stretch it: that is the timber's grain. */
  freq: string;
  octaves: number;
  /** The tint laid where the noise is high: [r, g, b] 0–1. */
  rgb: [number, number, number];
  gain: number;
  bias: number;
  channel: 0 | 1 | 2;
};

const DARK: [number, number, number] = [0.05, 0.06, 0.03];
const LIGHT: [number, number, number] = [1, 1, 0.92];

const GRAINS: Record<SurfaceMaterial, Grain[]> = {
  grass: [
    { freq: "0.0007", octaves: 2, rgb: [0.1, 0.2, 0.02], gain: 1.0, bias: -0.44, channel: 0 }, // patchy mottling, metres across
    { freq: "0.03", octaves: 3, rgb: DARK, gain: 1.5, bias: -0.68, channel: 0 }, // shadow between blades
    { freq: "0.04", octaves: 2, rgb: [0.88, 0.98, 0.55], gain: 1.3, bias: -0.64, channel: 1 }, // lit blade tips
  ],
  paving: [
    { freq: "0.0012", octaves: 2, rgb: [0.35, 0.3, 0.22], gain: 0.55, bias: -0.24, channel: 0 }, // weathering, stains
    { freq: "0.05", octaves: 2, rgb: DARK, gain: 1.2, bias: -0.52, channel: 1 }, // the stone's own pitting
  ],
  deck: [
    { freq: "0.0012 0.05", octaves: 3, rgb: [0.2, 0.1, 0.04], gain: 1.5, bias: -0.6, channel: 0 }, // grain along the board
    { freq: "0.0015", octaves: 2, rgb: LIGHT, gain: 0.5, bias: -0.22, channel: 1 }, // sun-bleached patches
  ],
  gravel: [
    { freq: "0.035", octaves: 2, rgb: [0.97, 0.96, 0.92], gain: 3.2, bias: -1.65, channel: 0 }, // pale stones
    { freq: "0.04", octaves: 2, rgb: [0.35, 0.32, 0.28], gain: 3.2, bias: -1.7, channel: 1 }, // dark stones
    { freq: "0.07", octaves: 1, rgb: DARK, gain: 1.4, bias: -0.62, channel: 2 }, // the gaps between them
  ],
  sand: [
    { freq: "0.0009", octaves: 2, rgb: [0.55, 0.42, 0.2], gain: 0.9, bias: -0.38, channel: 0 }, // footprints, damp patches
    { freq: "0.09", octaves: 2, rgb: DARK, gain: 1.1, bias: -0.5, channel: 1 }, // grain
    { freq: "0.1", octaves: 1, rgb: LIGHT, gain: 1.2, bias: -0.58, channel: 2 },
  ],
  soil: [
    { freq: "0.004", octaves: 3, rgb: DARK, gain: 1.4, bias: -0.6, channel: 0 }, // clods
    { freq: "0.04", octaves: 2, rgb: [0.72, 0.58, 0.44], gain: 1.6, bias: -0.78, channel: 1 }, // dry crumbs
  ],
  tile: [
    // One band only, and a broad one: the sheen of a polished floor, tens of metres across. Anything
    // finer reads as dirt on a dark floor rather than as stone.
    { freq: "0.00012", octaves: 1, rgb: [1, 1, 1], gain: 0.22, bias: -0.06, channel: 0 },
  ],
  plain: [], // a flat colour — no grain, and so no filter at all (see below)
};

function mix(hex: string, toward: string, t: number): string {
  const p = (h: string) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const a = p(hex);
  const b = p(toward);
  if (!a || !b) return hex;
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

/** What is laid in units, as a pattern tile — or nothing, for a material that is all texture. */
function LaidPattern({ id, material, base, w, d }: { id: string; material: SurfaceMaterial; base: string; w: number; d: number }) {
  const at = { x: -w / 2, y: -d / 2 }; // the tiling starts at the surface's own corner, not the plan's origin
  if (material === "paving") {
    // 600×400 slabs in a running bond, 8mm joints, each slab its own shade of the same stone.
    const joint = mix(base, "#000000", 0.4);
    const slab = (x: number, y: number, t: number) => (
      <rect x={x + 4} y={y + 4} width={592} height={392} rx={6} fill={mix(base, t < 0 ? "#000000" : "#ffffff", Math.abs(t))} />
    );
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" x={at.x} y={at.y} width={1200} height={800}>
        <rect width={1200} height={800} fill={joint} />
        {slab(0, 0, 0.04)}
        {slab(600, 0, -0.05)}
        {slab(-300, 400, -0.02)}
        {slab(300, 400, 0.07)}
        {slab(900, 400, -0.07)}
      </pattern>
    );
  }
  if (material === "deck") {
    // 140mm boards with 10mm gaps, 2.4m long, the joints staggered a half-board row to row.
    const gap = mix(base, "#000000", 0.6);
    const board = (x: number, y: number, len: number, t: number) => (
      <rect x={x + 3} y={y} width={len - 6} height={140} rx={4} fill={mix(base, t < 0 ? "#000000" : "#ffffff", Math.abs(t))} />
    );
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" x={at.x} y={at.y} width={2400} height={450}>
        <rect width={2400} height={450} fill={gap} />
        {board(0, 5, 2400, 0.03)}
        {board(-1200, 155, 2400, -0.06)}
        {board(1200, 155, 2400, 0.08)}
        {board(-600, 305, 2400, -0.02)}
        {board(1800, 305, 2400, 0.05)}
      </pattern>
    );
  }
  if (material === "tile") {
    // 1.2m square tiles on a straight grid. Everything is derived TOWARD WHITE — the joint and each
    // tile's own shade — so the grid survives a black floor, which a darkened joint would not.
    const joint = mix(base, "#ffffff", 0.17);
    const tile = (x: number, y: number, t: number) => (
      <rect x={x + 10} y={y + 10} width={1180} height={1180} fill={mix(base, "#ffffff", t)} />
    );
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" x={at.x} y={at.y} width={2400} height={2400}>
        <rect width={2400} height={2400} fill={joint} />
        {tile(0, 0, 0.05)}
        {tile(1200, 0, 0.065)}
        {tile(0, 1200, 0.07)}
        {tile(1200, 1200, 0.055)}
      </pattern>
    );
  }
  if (material === "grass") {
    // The mower's stripes: two-metre bands, alternately a shade lighter.
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" x={at.x} y={at.y} width={4000} height={4000}>
        <rect width={2000} height={4000} fill="#ffffff" fillOpacity={0.12} />
      </pattern>
    );
  }
  return null;
}

/** The surface, filling `footprint` (centred on the origin, like FootprintShape). */
export function SurfaceFill({
  material,
  footprint,
  w,
  d,
  id,
  color,
  opacity,
}: {
  material: SurfaceMaterial;
  footprint: Footprint;
  w: number;
  d: number;
  /** Seeds the noise, so two lawns side by side aren't the same lawn twice. Any stable string. */
  id: string;
  color?: string;
  opacity?: number;
}) {
  const uid = `sf${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const base = color ?? SURFACE_BASE[material];
  const seed = seedOf(id);
  const grains = GRAINS[material];
  const hasPattern = material === "paving" || material === "deck" || material === "grass" || material === "tile";
  return (
    <g opacity={opacity}>
      <defs>
        <LaidPattern id={`${uid}p`} material={material} base={base} w={w} d={d} />
        <filter id={`${uid}t`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {grains.map((g, i) => {
            const row = [0, 1, 2].map((c) => (c === g.channel ? g.gain : 0)).join(" ");
            return [
              <feTurbulence key={`n${i}`} type="fractalNoise" baseFrequency={g.freq} numOctaves={g.octaves} seed={seed + i * 31} result={`n${i}`} />,
              <feColorMatrix
                key={`c${i}`}
                in={`n${i}`}
                type="matrix"
                values={`0 0 0 0 ${g.rgb[0]}  0 0 0 0 ${g.rgb[1]}  0 0 0 0 ${g.rgb[2]}  ${row} 0 ${g.bias}`}
                result={`c${i}`}
              />,
              <feComposite key={`k${i}`} in={`c${i}`} in2="SourceGraphic" operator="in" result={`k${i}`} />,
            ];
          })}
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            {grains.map((_, i) => (
              <feMergeNode key={i} in={`k${i}`} />
            ))}
          </feMerge>
        </filter>
      </defs>
      <g filter={grains.length ? `url(#${uid}t)` : undefined}>
        <FootprintShape footprint={footprint} fill={base} />
        {hasPattern && <FootprintShape footprint={footprint} fill={`url(#${uid}p)`} />}
      </g>
      {/* A hairline edge — the kerb of a paved court, the lip of a deck, the cut edge of a lawn. */}
      <FootprintShape
        footprint={footprint}
        fill="none"
        stroke={mix(base, "#000000", 0.35)}
        strokeOpacity={0.5}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
