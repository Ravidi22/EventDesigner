// A MaterialRef → a three material, cached per (ref, mirrored) for the life of one viewer.
//
// A known texture is drawn PROCEDURALLY — a 256×256 canvas holding one repeat of the material at
// its real size (lib/scene/materials.ts TEXTURE_REPEAT_MM: a plank, a slab course, a board, a
// tile) tinted by the ref's colour, the same look as the plan's LaidPattern fills — so nothing is
// shipped or hosted. A designer's own picture is fetched through /api/files/<key> (`sameOriginUrl`,
// as the quote's PDF does — the bucket's public domain sends no CORS header). Both repeat in
// METRES, because every geometry's UVs are metres (scene-geometry.ts), so one material serves
// every body made of it; a stretched image repeats once and its body's UVs are normalised.
import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture as ThreeTexture,
  TextureLoader,
} from "three";
import { sameOriginUrl } from "@/lib/files/keys";
import { TEXTURE_TILE_MM, type Texture } from "@/lib/catalog/textures";
import { MM_PER_M } from "@/lib/scene/frame";
import { TEXTURE_REPEAT_MM } from "@/lib/scene/materials";
import type { MaterialRef } from "@/lib/scene/types";
import { polygonOffsetOf } from "./scene-rules";

const SIZE = 256;

/** What one canvas holds, in mm: the material's repeat — except paving, whose running bond needs
 *  TWO courses of 600×400 slabs before it repeats (a single course cannot be half-offset). */
function periodOf(texture: Texture): { w: number; h: number } {
  const r = TEXTURE_REPEAT_MM[texture];
  return texture === "paving" ? { w: r.w, h: r.h * 2 } : r;
}

/** `hex` moved `t` of the way toward `toward` — surface-fill.tsx's own mix, so a joint is darkened
 *  the way the plan darkens it. */
export function tint(hex: string, toward: string, t: number): string {
  const p = (h: string) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const a = p(hex);
  const b = p(toward);
  if (!a || !b) return hex;
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** A deterministic random for the speckle and grain, seeded by the texture's name so the same
 *  material draws the same twice (mulberry32). */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the patterns ---------------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

/** Draw in mm: the canvas is `w` × `h` mm of material. */
function mmSpace(ctx: Ctx, w: number, h: number): void {
  ctx.setTransform(SIZE / w, 0, 0, SIZE / h, 0, 0);
}

function speckle(ctx: Ctx, base: string, w: number, h: number, rnd: () => number, count: number, rMm: number, spread: number): void {
  for (let i = 0; i < count; i++) {
    const t = (rnd() - 0.5) * 2 * spread;
    ctx.fillStyle = tint(base, t < 0 ? "#000000" : "#ffffff", Math.abs(t));
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, rMm * (0.6 + rnd() * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPattern(ctx: Ctx, texture: Texture, base: string): void {
  const { w, h } = periodOf(texture);
  const rnd = seeded(texture);
  mmSpace(ctx, w, h);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  switch (texture) {
    case "wood": {
      // One plank 180 across, 1.8 m along: a dark seam on one side and at the end, faint grain lines.
      ctx.fillStyle = tint(base, "#000000", 0.35);
      ctx.fillRect(0, 0, 3, h);
      ctx.fillRect(0, 0, w, 3);
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const x = 12 + rnd() * (w - 24);
        const t = (rnd() - 0.5) * 0.16;
        ctx.strokeStyle = tint(base, t < 0 ? "#000000" : "#ffffff", Math.abs(t));
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (rnd() - 0.5) * 20, h * 0.33, x + (rnd() - 0.5) * 20, h * 0.66, x + (rnd() - 0.5) * 12, h);
        ctx.stroke();
      }
      break;
    }
    case "paving": {
      // Two courses of 600×400 slabs, the second half a slab over: a running bond, 8 mm joints.
      ctx.fillStyle = tint(base, "#000000", 0.4);
      ctx.fillRect(0, 0, w, h);
      const slab = (x: number, y: number, t: number) => {
        ctx.fillStyle = tint(base, t < 0 ? "#000000" : "#ffffff", Math.abs(t));
        ctx.fillRect(x + 4, y + 4, 592, 392);
      };
      slab(0, 0, 0.04);
      slab(-300, 400, -0.05);
      slab(300, 400, 0.06);
      break;
    }
    case "deck": {
      // A 140 board with a 10 gap, 2.4 m long with an end joint.
      ctx.fillStyle = tint(base, "#000000", 0.6);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = base;
      ctx.fillRect(0, 3, 140, h - 6);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const x = 10 + rnd() * 120;
        ctx.strokeStyle = tint(base, "#000000", 0.08 + rnd() * 0.06);
        ctx.beginPath();
        ctx.moveTo(x, 3);
        ctx.lineTo(x + (rnd() - 0.5) * 10, h - 3);
        ctx.stroke();
      }
      break;
    }
    case "tile": {
      // One 1.2 m tile, the joint and the tile's own shade both drawn TOWARD white, as on the plan.
      ctx.fillStyle = tint(base, "#ffffff", 0.17);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = tint(base, "#ffffff", 0.05);
      ctx.fillRect(10, 10, w - 20, h - 20);
      break;
    }
    case "grass": {
      for (let i = 0; i < 24; i++) {
        const t = (rnd() - 0.5) * 0.1;
        ctx.fillStyle = tint(base, t < 0 ? "#000000" : "#ffffff", Math.abs(t));
        ctx.fillRect(0, (i * h) / 24, w, h / 24 + 1);
      }
      speckle(ctx, base, w, h, rnd, 500, 14, 0.14);
      break;
    }
    case "water": {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 6;
      for (let row = 0; row < 3; row++) {
        const y = 60 + row * 150;
        const x0 = -120 + row * 90;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        for (let k = 0; k < 4; k++) ctx.quadraticCurveTo(x0 + k * 160 + 80, y - 40, x0 + (k + 1) * 160, y);
        ctx.stroke();
      }
      break;
    }
    case "marble": {
      ctx.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        const x0 = rnd() * w;
        const y0 = rnd() * h;
        const x3 = rnd() * w;
        const y3 = rnd() * h;
        const c1x = rnd() * w;
        const c1y = rnd() * h;
        const c2x = rnd() * w;
        const c2y = rnd() * h;
        for (const [width, alpha] of [[40, 0.08], [16, 0.14], [5, 0.3]] as const) {
          ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x3, y3);
          ctx.stroke();
        }
      }
      break;
    }
    case "gravel":
      speckle(ctx, base, w, h, rnd, 700, 9, 0.22);
      break;
    case "sand":
      speckle(ctx, base, w, h, rnd, 900, 5, 0.1);
      break;
    case "soil":
      speckle(ctx, base, w, h, rnd, 700, 8, 0.18);
      break;
    case "plain":
      break;
  }
}

function patternTexture(texture: Texture, base: string): CanvasTexture | null {
  if (texture === "plain" || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawPattern(ctx, texture, base);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  const { w, h } = periodOf(texture);
  t.repeat.set(MM_PER_M / w, MM_PER_M / h);
  t.anisotropy = 4;
  return t;
}

/** The additive glow behind an emitter: a soft radial falloff, white (the sprite tints it). */
function haloTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// --- the materials --------------------------------------------------------------------------------

/** How rough each floor and furniture material is: the plan's materials, given a finish. A hall's
 *  tiles are polished (they mirror the chandeliers), marble is honed, timber oiled, a lawn not at all. */
const FINISH: Partial<Record<NonNullable<MaterialRef["texture"]>, { roughness: number; metalness?: number; env?: number }>> = {
  // Polished, but reflecting the studio environment only faintly: its bright ceiling panel mirrored
  // in the tile as a white pool at grazing angles (headless, 2026-10-23); the room's own lights and
  // the sheen of the grid are what a polished hall floor shows.
  tile: { roughness: 0.27, env: 0.3 },
  marble: { roughness: 0.22, env: 0.6 },
  wood: { roughness: 0.55 },
  deck: { roughness: 0.7 },
  paving: { roughness: 0.85 },
  grass: { roughness: 1 },
  gravel: { roughness: 1 },
  sand: { roughness: 1 },
  soil: { roughness: 1 },
};

function baseMaterial(ref: MaterialRef): MeshStandardMaterial {
  const colour = new Color(ref.colour);
  // Fabric is physical: a sheen at grazing angles is what makes a cloth read as cloth and not as
  // painted plastic — the one place the extra shader cost is worth it on every device.
  const mat: MeshStandardMaterial =
    ref.kind === "fabric"
      ? // A sheen in the cloth's own colour, half strength: a full white sheen takes its energy out of
        // the base colour, and a white napkin read grey (seen headless, 2026-10-23).
        new MeshPhysicalMaterial({ color: colour, roughness: 0.82, metalness: 0, sheen: 0.5, sheenRoughness: 0.7, sheenColor: colour.clone() })
      : new MeshStandardMaterial({ color: colour, roughness: 0.75, metalness: 0 });
  switch (ref.kind) {
    case "matte":
    case "fabric":
      break;
    case "gloss":
      mat.roughness = 0.22;
      mat.metalness = 0.04;
      mat.envMapIntensity = 1.2;
      break;
    case "metal":
      mat.metalness = 0.92;
      mat.roughness = 0.24;
      mat.envMapIntensity = 1.4;
      break;
    case "glass":
      mat.transparent = true;
      mat.opacity = ref.opacity ?? 0.35;
      mat.depthWrite = false;
      mat.roughness = 0.04;
      mat.envMapIntensity = 1.8;
      break;
    case "water":
      mat.roughness = 0.08;
      mat.metalness = 0.1;
      mat.envMapIntensity = 1.4;
      mat.emissive = new Color(tint(ref.colour, "#000000", 0.5));
      mat.emissiveIntensity = 0.12;
      break;
    case "foliage":
      mat.roughness = 0.85;
      mat.side = DoubleSide;
      break;
    case "emissive":
      mat.emissive = colour.clone();
      mat.emissiveIntensity = 2.2;
      mat.roughness = 0.6;
      mat.toneMapped = false;
      break;
  }
  const finish = ref.texture ? FINISH[ref.texture] : undefined;
  if (finish && ref.kind !== "water") {
    mat.roughness = finish.roughness;
    if (finish.metalness !== undefined) mat.metalness = finish.metalness;
    if (finish.env !== undefined) mat.envMapIntensity = finish.env;
  }
  if (ref.kind !== "glass" && ref.opacity !== undefined && ref.opacity < 1) {
    mat.transparent = true;
    mat.opacity = ref.opacity;
  }
  return mat;
}

/** Materials and textures of one mounted viewer. `onLoad` fires when a designer's picture
 *  finishes loading, so a demand-rendered canvas can draw the frame that shows it. */
export class MaterialCache {
  private materials = new Map<string, MeshStandardMaterial>();
  private textures = new Map<string, ThreeTexture>();
  private halo: CanvasTexture | null | undefined;
  private loader: TextureLoader | null = null;

  constructor(private readonly onLoad?: () => void) {}

  private imageTexture(ref: MaterialRef): ThreeTexture | null {
    const image = ref.image;
    if (!image?.url) return null;
    const key = `img:${image.url}:${image.fit}:${image.tileMm ?? ""}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    this.loader ??= new TextureLoader();
    const onLoad = this.onLoad;
    const t = this.loader.load(sameOriginUrl(image.url), () => onLoad?.());
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    if (image.fit === "tile") {
      const per = MM_PER_M / (image.tileMm ?? TEXTURE_TILE_MM);
      t.repeat.set(per, per);
    } else {
      t.repeat.set(1, 1);
    }
    t.anisotropy = 4;
    this.textures.set(key, t);
    return t;
  }

  private textureFor(ref: MaterialRef): ThreeTexture | null {
    const fromImage = this.imageTexture(ref);
    if (fromImage) return fromImage;
    if (!ref.texture) return null;
    const key = `tex:${ref.texture}:${ref.colour}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    const t = patternTexture(ref.texture, ref.colour);
    if (t) this.textures.set(key, t);
    return t;
  }

  /** The material for `ref`. A mirrored instance (negative scale) shows its back faces, so it is
   *  drawn two-sided; a foliage material always is. `floorRank` (scene-rules.ts floorRank, 0 =
   *  not a ranked floor) gives a coplanar floor its polygon offset — the ground pushed back, a
   *  surface laid on the floor pulled in — and is part of the key, because the same paving in the
   *  same tint may be the ground under one venue and a zone's floor in the next. */
  get(ref: MaterialRef, mirrored: boolean, floorRank = 0): MeshStandardMaterial {
    const key = JSON.stringify(ref) + (mirrored ? "|m" : "") + (floorRank ? `|f${floorRank}` : "");
    const hit = this.materials.get(key);
    if (hit) return hit;
    const mat = baseMaterial(ref);
    const map = this.textureFor(ref);
    if (map) {
      mat.map = map;
      // The pattern is already tinted; a picture is the designer's as it is.
      mat.color.set("#ffffff");
    }
    if (mirrored) mat.side = DoubleSide;
    if (floorRank) {
      const offset = polygonOffsetOf(floorRank);
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = offset;
      mat.polygonOffsetUnits = offset;
    }
    this.materials.set(key, mat);
    return mat;
  }

  /** The emitters' halo, drawn once. */
  haloMap(): CanvasTexture | null {
    if (this.halo === undefined) this.halo = haloTexture();
    return this.halo;
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    this.halo?.dispose();
    this.halo = undefined;
  }
}
