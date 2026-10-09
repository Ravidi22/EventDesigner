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
import { memo, useId } from "react";
import { footprintBounds, type Footprint } from "@/lib/studio/footprint";
import { TEXTURE_TILE_MM, TEXTURE_TILE_RANGE, hasSurface, surfaceLayers, type Surface, type Texture, type TextureImage } from "@/lib/catalog/textures";
import { FootprintShape, sameDrawProps } from "@/components/footprint-shape";

// `Texture` is the venue's SurfaceMaterial plus the two the catalog adds (wood, marble —
// lib/catalog/textures.ts). Every venue surface is a Texture, so the hall editor is unaffected.
export const SURFACE_BASE: Record<Texture, string> = {
  wood: "#b98a5e",
  marble: "#eeeae4",
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
  /** A band-pass on the tint's opacity (feFuncA tableValues): only where the noise sits near the
   *  table's peak is it laid — thin wandering lines rather than patches. What marble's veins are. */
  band?: string;
};

const DARK: [number, number, number] = [0.05, 0.06, 0.03];
const LIGHT: [number, number, number] = [1, 1, 0.92];

const GRAINS: Record<Texture, Grain[]> = {
  wood: [
    { freq: "0.0009 0.03", octaves: 3, rgb: [0.22, 0.12, 0.05], gain: 1.6, bias: -0.62, channel: 0 }, // grain along the plank
    { freq: "0.002", octaves: 2, rgb: LIGHT, gain: 0.45, bias: -0.2, channel: 1 }, // the sheen of the finish
  ],
  marble: [
    // Veins: where a slow noise crosses its middle value, a thin grey line wanders — Carrara's.
    { freq: "0.0009 0.0016", octaves: 4, rgb: [0.45, 0.45, 0.5], gain: 1, bias: 0, channel: 0, band: "0 0 0 0 0 0 0 0 0 0 0.55 0 0 0 0 0 0 0 0 0 0" },
    { freq: "0.002 0.0035", octaves: 3, rgb: [0.58, 0.58, 0.62], gain: 1, bias: 0, channel: 1, band: "0 0 0 0 0 0 0 0 0 0 0.3 0 0 0 0 0 0 0 0 0 0" },
    { freq: "0.0006", octaves: 2, rgb: [0.62, 0.6, 0.58], gain: 0.35, bias: -0.12, channel: 2 }, // the cloud in the stone
  ],
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
function LaidPattern({ id, material, base, w, d }: { id: string; material: Texture; base: string; w: number; d: number }) {
  const at = { x: -w / 2, y: -d / 2 }; // the tiling starts at the surface's own corner, not the plan's origin
  if (material === "wood") {
    // A tabletop's planks: 180mm wide, 1.8m long, butted tight — a hairline joint, the ends staggered
    // a third of a plank row to row, each plank its own shade of the same timber.
    const joint = mix(base, "#000000", 0.35);
    const plank = (x: number, y: number, t: number) => (
      <rect x={x + 1} y={y + 1} width={1798} height={178} fill={mix(base, t < 0 ? "#000000" : "#ffffff", Math.abs(t))} />
    );
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" x={at.x} y={at.y} width={1800} height={540}>
        <rect width={1800} height={540} fill={joint} />
        {plank(0, 0, 0.04)}
        {plank(-1200, 180, -0.05)}
        {plank(600, 180, 0.02)}
        {plank(-600, 360, 0.07)}
        {plank(1200, 360, -0.03)}
      </pattern>
    );
  }
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
function SurfaceFillView({
  material,
  footprint,
  w,
  d,
  id,
  color,
  opacity,
}: {
  material: Texture;
  footprint: Footprint;
  w: number;
  d: number;
  /** Seeds the noise, so two lawns side by side aren't the same lawn twice. Any stable string. */
  id: string;
  color?: string;
  opacity?: number;
}) {
  const seed = seedOf(id);
  // The seed goes into the id too: a drag image is rendered in a React root of its own, whose
  // useId() can repeat one in the page, and two <pattern>s of one id paint each other's texture.
  const uid = `sf${useId().replace(/[^a-zA-Z0-9_-]/g, "")}x${seed}`;
  const base = color ?? SURFACE_BASE[material];
  const grains = GRAINS[material];
  const hasPattern = material === "paving" || material === "deck" || material === "grass" || material === "tile" || material === "wood";
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
              ...(g.band
                ? [
                    <feComponentTransfer key={`b${i}`} in={`c${i}`} result={`b${i}`}>
                      <feFuncA type="table" tableValues={g.band} />
                    </feComponentTransfer>,
                  ]
                : []),
              <feComposite key={`k${i}`} in={g.band ? `b${i}` : `c${i}`} in2="SourceGraphic" operator="in" result={`k${i}`} />,
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
      {/* `plan-grain`: the noise is the costly part of a texture, re-rasterised at every zoom step,
          so a moving plan drops it (globals.css, PlanCanvas's data-moving) and keeps the laid pattern. */}
      <g filter={grains.length ? `url(#${uid}t)` : undefined} className="plan-grain">
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

export const SurfaceFill = memo(SurfaceFillView, sameDrawProps);

const hexOrUndefined = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined);

/** A catalog item's footprint filled with what it is made of (MapAppearance.texture) — the surface,
 *  sized to the footprint's own box. `color` tints it (a shade's swatch, the row's fill); absent,
 *  the material's own colour. */
export function TextureFill({ texture, footprint, color, seed }: { texture: Texture; footprint: Footprint; color?: string; seed: string }) {
  const b = footprintBounds(footprint);
  return <SurfaceFill material={texture} footprint={footprint} w={b.w} d={b.h} id={seed} color={hexOrUndefined(color)} />;
}

/** A picture of the designer's own as the surface (TextureImage): repeated at its real size from the
 *  shape's corner, or one copy spread over the box `at`/`w`×`d` — cropped to cover it, never squashed. */
function ImageFillView({ image, footprint, w, d, at }: { image: TextureImage; footprint: Footprint; w: number; d: number; at: { x: number; y: number } }) {
  const uid = `im${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const stretch = image.fit === "stretch";
  const tile = Math.min(TEXTURE_TILE_RANGE.max, Math.max(TEXTURE_TILE_RANGE.min, image.tileMm || TEXTURE_TILE_MM));
  const tw = stretch ? Math.max(1, w) : tile;
  const th = stretch ? Math.max(1, d) : tile;
  return (
    <g>
      <defs>
        <pattern id={uid} patternUnits="userSpaceOnUse" x={at.x - w / 2} y={at.y - d / 2} width={tw} height={th}>
          <image href={image.url} width={tw} height={th} preserveAspectRatio="xMidYMid slice" />
        </pattern>
      </defs>
      <FootprintShape footprint={footprint} fill={`url(#${uid})`} />
      <FootprintShape footprint={footprint} fill="none" stroke="#000000" strokeOpacity={0.3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </g>
  );
}
const ImageFill = memo(ImageFillView, sameDrawProps);

/** The box round one shape's points, in the item's frame (its vertices — rule 2 puts a curve's
 *  extremes on them, which is close enough to frame a picture by). */
function pieceBox(outline: readonly { x: number; y: number }[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

function OneSurface({ surface, footprint, w, d, at, color, seed }: { surface: Surface; footprint: Footprint; w: number; d: number; at: { x: number; y: number }; color?: string; seed: string }) {
  if (surface.textureImage?.url) return <ImageFill image={surface.textureImage} footprint={footprint} w={w} d={d} at={at} />;
  if (surface.texture) return <SurfaceFill material={surface.texture} footprint={footprint} w={w} d={d} id={seed} color={hexOrUndefined(color)} />;
  return null;
}

/** Every surfaced shape of an item, each in its own material or picture — the base shape by the
 *  item's own texture, each added part by its own (surfaceLayers). A shape with none is left out,
 *  so the item's flat fill drawn underneath shows through it. Draw it OVER that fill, under the
 *  outline's stroke. Nothing surfaced, nothing drawn. */
export function ItemSurface({
  appearance,
  footprint,
  color,
  seed,
}: {
  appearance: (Surface & { parts?: readonly Surface[] }) | undefined;
  footprint: Footprint;
  color?: string;
  seed: string;
}) {
  const layers = surfaceLayers(appearance);
  if (!layers.some(hasSurface)) return null;
  const b = footprintBounds(footprint);
  if (footprint.kind !== "multi") {
    return hasSurface(layers[0]) ? <OneSurface surface={layers[0]} footprint={footprint} w={b.w} d={b.h} at={{ x: 0, y: 0 }} color={color} seed={seed} /> : null;
  }
  return (
    <g className="pointer-events-none">
      {footprint.parts.map((piece, i) => {
        const s = layers[i];
        if (!hasSurface(s)) return null;
        // Laid in units from the ITEM's corner, so a material running across two shapes lines up;
        // a picture spread over its own shape.
        const own = pieceBox(piece.outline);
        const stretch = s.textureImage?.url && s.textureImage.fit === "stretch";
        return (
          <OneSurface
            key={i}
            surface={s}
            footprint={{ kind: "multi", parts: [piece] }}
            w={stretch ? own.w : b.w}
            d={stretch ? own.h : b.h}
            at={stretch ? own : { x: 0, y: 0 }}
            color={color}
            seed={`${seed}:${i}`}
          />
        );
      })}
    </g>
  );
}
