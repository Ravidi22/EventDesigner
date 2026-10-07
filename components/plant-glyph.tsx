// The top-down drawing of a plant feature — what makes a traced courtyard read as the garden it is
// rather than a grey diagram with circles in it (see the note on FeatureKind in lib/venues/structure.ts).
//
// Drawn in the style of a landscape architect's rendered plan, not as an icon: a canopy is a mass of
// overlapping leaf clumps, each lit from the top-left, whose outline is roughened by a noise
// displacement and whose surface is speckled with leaf texture; a palm is a crown of feathered
// fronds, leaflet by leaflet; everything casts a soft, blurred shadow off its own real outline.
//
// Every species is drawn in a fixed internal space — a 100-unit disc for the radial ones, a strip
// 100 units deep for the hedge and the flower bed — and scaled onto the feature's millimetres
// afterwards. That is what keeps the filters honest: a noise frequency or a blur radius is in the
// drawing's own units, so a 60cm pot and a 5m palm get the same texture at their own scale instead
// of the pot turning to mush and the palm to glass.
//
// Colour comes from one base per species (or the designer's own style.fill), with every lighter and
// darker tone derived from it — repaint a hedge in the inspector and it stays a shaded hedge.
import { useId, useMemo, type ReactNode } from "react";
import type { PlantSpecies } from "@/lib/venues/structure";

export const PLANT_BASE: Record<PlantSpecies, string> = {
  palm: "#5b8f3e",
  tree: "#4a8a3f",
  shrub: "#558f45",
  pot: "#5a9a4c",
  hedge: "#3f7a3a",
  flowers: "#4f8740",
};

const BLOOM_SETS = [
  ["#f4a6c1", "#e3688c", "#ffffff"],
  ["#f7d35e", "#f39a4a", "#fff6d8"],
  ["#c9a7f0", "#9d7bd8", "#ffffff"],
  ["#ff8a80", "#f4a6c1", "#f7d35e"],
];

/** A stable number in [0,1) from a feature id, so two palms side by side don't wear identical crowns. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** mulberry32 — a tiny seeded generator, so a plant draws the same on every render and every device. */
function rng(seed: number): () => number {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blend a #rrggbb toward another by t. A colour that isn't plain hex comes back untouched. */
function mix(hex: string, toward: string, t: number): string {
  const p = (h: string) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const a = p(hex);
  const b = p(toward);
  if (!a || !b) return hex;
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Filters ────────────────────────────────────────────────────────────────────────────────────
// Declared per plant (ids from useId), in the drawing's own 100-unit space.

/** The canopy treatment: a ragged leafy outline, dark and light leaf speckle clipped to it, and a
 *  soft shadow cast down-and-right from the roughened shape itself. */
function CanopyFilter({ id, seed, edgeFreq, edgeScale, leafFreq }: { id: string; seed: number; edgeFreq: number; edgeScale: number; leafFreq: number }) {
  const s = Math.floor(seed * 1000);
  return (
    <filter id={id} x="-35%" y="-35%" width="180%" height="180%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={edgeFreq} numOctaves={2} seed={s} result="warp" />
      <feDisplacementMap in="SourceGraphic" in2="warp" scale={edgeScale} xChannelSelector="R" yChannelSelector="G" result="shape" />
      <feTurbulence type="fractalNoise" baseFrequency={leafFreq} numOctaves={2} seed={s + 7} result="leaf" />
      <feColorMatrix in="leaf" type="matrix" values="0 0 0 0 0.02  0 0 0 0 0.06  0 0 0 0 0.02  1.7 0 0 0 -0.74" result="darkA" />
      <feComposite in="darkA" in2="shape" operator="in" result="dark" />
      <feColorMatrix in="leaf" type="matrix" values="0 0 0 0 0.93  0 0 0 0 1  0 0 0 0 0.78  0 1.3 0 0 -0.68" result="lightA" />
      <feComposite in="lightA" in2="shape" operator="in" result="light" />
      <feGaussianBlur in="shape" stdDeviation={3.2} result="blur" />
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.08  0 0 0 0 0.04  0 0 0 0.42 0" result="tint" />
      <feOffset in="tint" dx={4.5} dy={5.5} result="shadow" />
      <feMerge>
        <feMergeNode in="shadow" />
        <feMergeNode in="shape" />
        <feMergeNode in="dark" />
        <feMergeNode in="light" />
      </feMerge>
    </filter>
  );
}

/** Just the soft cast shadow — for the palm's fronds and the pot, whose outlines are already their own. */
function DropFilter({ id, blur = 2.4, dx = 5, dy = 6, alpha = 0.42 }: { id: string; blur?: number; dx?: number; dy?: number; alpha?: number }) {
  return (
    <filter id={id} x="-35%" y="-35%" width="180%" height="180%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="blur" />
      <feOffset in="blur" dx={dx} dy={dy} result="off" />
      <feColorMatrix in="off" type="matrix" values={`0 0 0 0 0.04  0 0 0 0 0.07  0 0 0 0 0.03  0 0 0 ${alpha} 0`} result="shadow" />
      <feMerge>
        <feMergeNode in="shadow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Light from the top-left: a highlight, a clear middle, and a darkened rim — laid over each clump
 *  so a canopy reads as a heap of rounded masses rather than one flat disc. */
function VolumeGradient({ id }: { id: string }) {
  return (
    <radialGradient id={id} cx="36%" cy="32%" r="72%">
      <stop offset="0" stopColor="#ffffff" stopOpacity={0.34} />
      <stop offset="0.42" stopColor="#ffffff" stopOpacity={0} />
      <stop offset="0.74" stopColor="#000000" stopOpacity={0.1} />
      <stop offset="1" stopColor="#000000" stopOpacity={0.4} />
    </radialGradient>
  );
}

// ── Canopies ───────────────────────────────────────────────────────────────────────────────────

type Ring = { n: number; dist: number; size: [number, number] };

/** Overlapping leaf clumps in rings, outermost first so the higher centre of the crown sits on top —
 *  which is how a tree's canopy looks from above. Each clump is tinted a touch apart from the next. */
function Clumps({ rand, rings, color, vol }: { rand: () => number; rings: Ring[]; color: string; vol: string }) {
  const out: ReactNode[] = [];
  rings.forEach((ring, ri) => {
    const turn = rand() * Math.PI * 2;
    for (let i = 0; i < ring.n; i++) {
      const a = turn + (i / ring.n) * Math.PI * 2 + (rand() - 0.5) * 0.35;
      const d = ring.dist + (rand() - 0.5) * 5;
      const r = ring.size[0] + rand() * (ring.size[1] - ring.size[0]);
      const cx = r2(Math.cos(a) * d);
      const cy = r2(Math.sin(a) * d);
      // Inner rings are higher and catch more light; the outer skirt sits in its own shade.
      const tone = mix(color, ri === 0 ? "#000000" : "#ffffff", ri === 0 ? rand() * 0.14 : rand() * 0.1 + ri * 0.03);
      out.push(
        <g key={`${ri}-${i}`}>
          <circle cx={cx} cy={cy} r={r2(r)} fill={tone} />
          <circle cx={cx} cy={cy} r={r2(r)} fill={`url(#${vol})`} />
        </g>,
      );
    }
  });
  return <>{out}</>;
}

function Canopy({ uid, seed, color, rings, edgeFreq, edgeScale, leafFreq }: { uid: string; seed: number; color: string; rings: Ring[]; edgeFreq: number; edgeScale: number; leafFreq: number }) {
  const rand = rng(seed);
  return (
    <>
      <defs>
        <CanopyFilter id={`${uid}c`} seed={seed} edgeFreq={edgeFreq} edgeScale={edgeScale} leafFreq={leafFreq} />
        <VolumeGradient id={`${uid}v`} />
      </defs>
      <g filter={`url(#${uid}c)`}>
        <Clumps rand={rand} rings={rings} color={color} vol={`${uid}v`} />
      </g>
    </>
  );
}

const TREE_RINGS: Ring[] = [
  { n: 13, dist: 31, size: [13, 17] },
  { n: 8, dist: 18, size: [13, 16] },
  { n: 4, dist: 7, size: [12, 15] },
];
const SHRUB_RINGS: Ring[] = [
  { n: 7, dist: 23, size: [15, 20] },
  { n: 3, dist: 8, size: [15, 18] },
];

function Tree({ uid, seed, color }: { uid: string; seed: number; color: string }) {
  return <Canopy uid={uid} seed={seed} color={color} rings={TREE_RINGS} edgeFreq={0.09} edgeScale={9} leafFreq={0.3} />;
}

function Shrub({ uid, seed, color }: { uid: string; seed: number; color: string }) {
  return <Canopy uid={uid} seed={seed} color={color} rings={SHRUB_RINGS} edgeFreq={0.14} edgeScale={7} leafFreq={0.4} />;
}

// ── Palm ───────────────────────────────────────────────────────────────────────────────────────

/** One feathered frond: a gently curving rib with leaflets down both sides, longest mid-frond and
 *  swept toward the tip. Returned as two path strings — the leaflets and the rib — so a crown of a
 *  dozen fronds is two dozen elements, not four hundred. */
function frond(rand: () => number, angle: number, len: number): { leaves: string; rib: string } {
  const bend = (rand() - 0.5) * 0.6;
  const p1 = { x: Math.cos(angle) * len * 0.5, y: Math.sin(angle) * len * 0.5 };
  const p2 = { x: Math.cos(angle + bend) * len, y: Math.sin(angle + bend) * len };
  const at = (t: number) => ({
    x: 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });
  const tan = (t: number) => {
    const dx = 2 * (1 - t) * p1.x + 2 * t * (p2.x - p1.x);
    const dy = 2 * (1 - t) * p1.y + 2 * t * (p2.y - p1.y);
    const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  };
  const sweep = 0.78; // how far the leaflets lean toward the tip (radians off the perpendicular)
  let leaves = "";
  const k = 15;
  for (let i = 1; i <= k; i++) {
    const t = 0.1 + (0.88 * i) / k;
    const p = at(t);
    const T = tan(t);
    const ll = len * 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.75) * (0.85 + rand() * 0.3);
    for (const side of [1, -1]) {
      const nx = -T.y * side;
      const ny = T.x * side;
      const dx = nx * Math.cos(sweep) + T.x * Math.sin(sweep);
      const dy = ny * Math.cos(sweep) + T.y * Math.sin(sweep);
      leaves += `M${r2(p.x)} ${r2(p.y)}L${r2(p.x + dx * ll)} ${r2(p.y + dy * ll)}`;
    }
  }
  return { leaves, rib: `M0 0Q${r2(p1.x)} ${r2(p1.y)} ${r2(p2.x)} ${r2(p2.y)}` };
}

function Palm({ uid, seed, color }: { uid: string; seed: number; color: string }) {
  const rand = rng(seed);
  const dead = Array.from({ length: 6 }, (_, i) => ({ ...frond(rand, (i / 6) * Math.PI * 2 + rand(), 34 + rand() * 6), tone: rand() }));
  const n = 12;
  const live = Array.from({ length: n }, (_, i) => ({
    ...frond(rand, (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.3 + seed * 6, 40 + rand() * 7),
    tone: rand(),
  }));
  // Shuffle the draw order, so which frond lies over which is irregular round the crown.
  live.sort((a, b) => a.tone - b.tone);
  return (
    <>
      <defs>
        <DropFilter id={`${uid}d`} />
        <radialGradient id={`${uid}k`} cx="40%" cy="38%" r="65%">
          <stop offset="0" stopColor="#b08a5a" />
          <stop offset="1" stopColor="#5e4228" />
        </radialGradient>
      </defs>
      <g filter={`url(#${uid}d)`} strokeLinecap="round" fill="none">
        {/* The old fronds hanging below the crown, gone straw-brown. */}
        {dead.map((f, i) => (
          <g key={`d${i}`} stroke={mix("#9a8a52", "#5f5530", f.tone * 0.5)}>
            <path d={f.leaves} strokeWidth={0.9} />
            <path d={f.rib} strokeWidth={1.3} />
          </g>
        ))}
        {live.map((f, i) => {
          const tone = f.tone < 0.5 ? mix(color, "#000000", 0.28 - f.tone * 0.4) : mix(color, "#e8f0a0", (f.tone - 0.5) * 0.45);
          return (
            <g key={`l${i}`}>
              <path d={f.leaves} stroke={tone} strokeWidth={1.05} />
              <path d={f.rib} stroke={mix(tone, "#d9cf86", 0.3)} strokeWidth={1.1} />
            </g>
          );
        })}
      </g>
      <circle r={4.2} fill={`url(#${uid}k)`} />
    </>
  );
}

// ── Pot ────────────────────────────────────────────────────────────────────────────────────────

function Pot({ uid, seed, color }: { uid: string; seed: number; color: string }) {
  const rand = rng(seed + 0.5);
  const pebbles = Array.from({ length: 22 }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 38;
    return { x: r2(Math.cos(a) * d), y: r2(Math.sin(a) * d), r: r2(0.8 + rand() * 1.4), t: rand() };
  });
  return (
    <>
      <defs>
        <DropFilter id={`${uid}d`} blur={2.2} dx={4} dy={5} alpha={0.38} />
        <radialGradient id={`${uid}p`} cx="36%" cy="32%" r="70%">
          <stop offset="0" stopColor="#e7a785" />
          <stop offset="0.55" stopColor="#c47a57" />
          <stop offset="1" stopColor="#8d5139" />
        </radialGradient>
        <radialGradient id={`${uid}s`} cx="60%" cy="62%" r="70%">
          <stop offset="0" stopColor="#6b4a32" />
          <stop offset="1" stopColor="#3f2a1c" />
        </radialGradient>
      </defs>
      <g filter={`url(#${uid}d)`}>
        <circle r={49} fill={`url(#${uid}p)`} />
      </g>
      <circle r={43} fill="none" stroke="#7d4631" strokeOpacity={0.55} strokeWidth={1.4} />
      <circle r={41.5} fill={`url(#${uid}s)`} />
      {pebbles.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.t < 0.5 ? "#8a6a4e" : "#2f1f14"} fillOpacity={0.7} />
      ))}
      <g transform="scale(0.74)">
        <Shrub uid={`${uid}i`} seed={seed} color={color} />
      </g>
    </>
  );
}

// ── Strips ─────────────────────────────────────────────────────────────────────────────────────

/** A clipped hedge, drawn along +x, 100 units deep and `long` units long: a dense double row of
 *  leaf clumps over a darker core, so it reads trimmed on its long faces and leafy everywhere. */
function Hedge({ uid, seed, color, long }: { uid: string; seed: number; color: string; long: number }) {
  const rand = rng(seed);
  const cols = Math.max(2, Math.min(160, Math.round(long / 22)));
  const step = long / cols;
  const clumps: ReactNode[] = [];
  for (const [row, y0] of [[0, -20], [1, 20], [2, 0]] as const) {
    for (let i = 0; i < cols; i++) {
      const cx = -long / 2 + step * (i + 0.5) + (rand() - 0.5) * step * 0.4 + (row === 2 ? step / 2 : 0);
      if (cx > long / 2 - 18 || cx < -long / 2 + 18) continue;
      const r = row === 2 ? 22 + rand() * 6 : 20 + rand() * 6;
      const cy = y0 + (rand() - 0.5) * 6;
      const tone = mix(color, row === 2 ? "#ffffff" : "#000000", rand() * 0.12);
      clumps.push(
        <g key={`${row}-${i}`}>
          <circle cx={r2(cx)} cy={r2(cy)} r={r2(r)} fill={tone} />
          <circle cx={r2(cx)} cy={r2(cy)} r={r2(r)} fill={`url(#${uid}v)`} />
        </g>,
      );
    }
  }
  return (
    <>
      <defs>
        <CanopyFilter id={`${uid}c`} seed={seed} edgeFreq={0.12} edgeScale={6} leafFreq={0.5} />
        <VolumeGradient id={`${uid}v`} />
      </defs>
      <g filter={`url(#${uid}c)`}>
        <rect x={-long / 2 + 2} y={-44} width={long - 4} height={88} rx={40} fill={mix(color, "#000000", 0.25)} />
        {clumps}
      </g>
    </>
  );
}

/** A planted bed, drawn like the hedge along +x: a stone kerb round dark soil, low foliage, and
 *  flowers laid in drifts of two or three colours — the way a bed is actually planted — rather than
 *  confetti. */
function Flowers({ uid, seed, color, long }: { uid: string; seed: number; color: string; long: number }) {
  const rand = rng(seed);
  const palette = BLOOM_SETS[Math.floor(seed * BLOOM_SETS.length)];
  const foliage: ReactNode[] = [];
  const fStep = 17;
  for (let x = -long / 2 + 12; x <= long / 2 - 12; x += fStep) {
    for (let y = -34; y <= 34; y += fStep) {
      const cx = x + (rand() - 0.5) * 8;
      const cy = y + (rand() - 0.5) * 8;
      const r = 9 + rand() * 4;
      foliage.push(
        <g key={`${r2(x)}:${y}`}>
          <circle cx={r2(cx)} cy={r2(cy)} r={r2(r)} fill={mix(color, "#000000", rand() * 0.15)} />
          <circle cx={r2(cx)} cy={r2(cy)} r={r2(r)} fill={`url(#${uid}v)`} />
        </g>,
      );
    }
  }
  const count = Math.min(260, Math.round((long * 70) / 110));
  const blooms: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * (long - 26);
    const y = (rand() - 0.5) * 68;
    // Drifts: the colour follows position along the bed, with a little bleed at the seams.
    const drift = Math.floor(((x + long / 2) / 70 + rand() * 0.6) % palette.length);
    const c = palette[drift];
    const s = 0.8 + rand() * 0.5;
    blooms.push(
      <g key={i} transform={`translate(${r2(x)} ${r2(y)}) scale(${r2(s)}) rotate(${Math.round(rand() * 72)})`}>
        <use href={`#${uid}b`} fill={c} />
        <circle r={1.2} fill={c === "#f7d35e" || c === "#fff6d8" ? "#b86b1f" : "#f5d44a"} />
      </g>,
    );
  }
  const rx = 12;
  return (
    <>
      <defs>
        <CanopyFilter id={`${uid}c`} seed={seed} edgeFreq={0.16} edgeScale={4} leafFreq={0.6} />
        <DropFilter id={`${uid}d`} blur={1.2} dx={1.4} dy={1.8} alpha={0.35} />
        <VolumeGradient id={`${uid}v`} />
        {/* One five-petal blossom, reused — a long bed is hundreds of them. */}
        <path
          id={`${uid}b`}
          d="M0 -1.2C1.8 -5.2 3.6 -3.6 1.1 -0.4C5.2 -1 4.6 1.4 0.7 1C2.9 4.6 0.6 5.3 -0.2 1.2C-2.7 4.6 -4.4 2.7 -1 0.6C-4.9 0.3 -4.4 -2.6 -0.9 -0.9C-2.6 -4.8 0.2 -5.2 0 -1.2Z"
        />
      </defs>
      <rect x={-long / 2} y={-50} width={long} height={100} rx={rx} fill="#d8d1c3" />
      <rect x={-long / 2 + 5} y={-45} width={long - 10} height={90} rx={rx - 4} fill="#4a3322" />
      <g filter={`url(#${uid}c)`}>{foliage}</g>
      <g filter={`url(#${uid}d)`}>{blooms}</g>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────────────────────────

/** A plant, centred on the origin at `w × d` millimetres. `color` overrides the species' own green —
 *  the feature's style.fill, when the designer has set one. */
export function PlantGlyph({
  species,
  w,
  d,
  id,
  color,
  opacity,
}: {
  species: PlantSpecies;
  w: number;
  d: number;
  /** Seeds the per-plant variation. Any stable string. */
  id: string;
  color?: string;
  opacity?: number;
}) {
  // useId's own characters (colons, guillemets) are not safe inside url(#…).
  const uid = `pl${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const seed = seedOf(id);
  const c = color ?? PLANT_BASE[species];
  const strip = species === "hedge" || species === "flowers";
  const long = strip ? Math.max(100, Math.round((Math.max(w, d) / Math.max(1, Math.min(w, d))) * 100)) : 100;

  // The drawing depends on the species, the seed, the colour and — for a strip — its proportions,
  // never on the absolute size (that is the scale transform below), so a drag or a resize of a
  // hedge along its length is the only change that rebuilds it.
  const body = useMemo(() => {
    switch (species) {
      case "palm":
        return <Palm uid={uid} seed={seed} color={c} />;
      case "tree":
        return <Tree uid={uid} seed={seed} color={c} />;
      case "pot":
        return <Pot uid={uid} seed={seed} color={c} />;
      case "hedge":
        return <Hedge uid={uid} seed={seed} color={c} long={long} />;
      case "flowers":
        return <Flowers uid={uid} seed={seed} color={c} long={long} />;
      default:
        return <Shrub uid={uid} seed={seed} color={c} />;
    }
  }, [species, uid, seed, c, long]);

  if (strip) {
    const k = Math.min(w, d) / 100;
    return (
      <g opacity={opacity} transform={`${d > w ? "rotate(90) " : ""}scale(${k})`}>
        {body}
      </g>
    );
  }
  return (
    <g opacity={opacity} transform={`scale(${w / 100} ${d / 100})`}>
      {body}
    </g>
  );
}
