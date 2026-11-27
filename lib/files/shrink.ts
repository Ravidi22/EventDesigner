"use client";
// The canvas half of EVE-25: every picture is drawn again before upload (the rules are ./shrink-rules.ts).
//
// The picture is decoded with its EXIF rotation APPLIED, before the metadata is dropped — otherwise a
// portrait phone photo would arrive lying on its side, once the EXIF that said "turn me" is gone. Two
// decoders: an <img> FIRST — every current engine applies the rotation to an <img> and to drawImage()
// of it (Chrome 81, Firefox 77, Safari 13.1) — then createImageBitmap with `imageOrientation:
// "from-image"`, which an engine may reject (a TypeError) or accept and ignore. Only when BOTH fail does
// the file go up as it is (DECIDE-5); before the round-1 review one failure already did, silently, with
// its GPS location inside. Probed headless 2026-11-27: Chrome and Firefox upright on both paths.
import type { FileKind } from "./keys";
import { JPEG_QUALITY, outputType, renamed, targetSize } from "./shrink-rules";

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function viaBitmap(file: File): Promise<Decoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

async function viaImage(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function decode(file: File): Promise<Decoded | null> {
  for (const attempt of [viaImage, viaBitmap]) {
    try {
      return await attempt(file);
    } catch {
      // next decoder
    }
  }
  return null;
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encode(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Any pixel not fully opaque — read off a small copy, which is plenty to tell a logo from a photo. */
function hasTransparency(picture: Decoded): boolean {
  const scale = Math.min(1, 256 / Math.max(picture.width, picture.height));
  const w = Math.max(1, Math.round(picture.width * scale));
  const h = Math.max(1, Math.round(picture.height * scale));
  const ctx = makeCanvas(w, h).getContext("2d") as Canvas2D | null;
  if (!ctx) return false;
  ctx.drawImage(picture.source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/** The picture as it will be uploaded: no larger than its kind allows, and with no metadata. */
export async function prepareImage(file: File, kind: FileKind): Promise<File> {
  const picture = await decode(file);
  if (!picture) return file;
  try {
    // Transparency only matters for the formats that turn into a JPEG when they have none.
    const alpha = file.type === "image/webp" || file.type === "image/avif" ? hasTransparency(picture) : false;
    const type = outputType(file.type, alpha);
    const { width, height } = targetSize(picture.width, picture.height, kind);
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d") as Canvas2D | null;
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(picture.source, 0, 0, width, height);
    const blob = await encode(canvas, type, JPEG_QUALITY);
    if (!blob || blob.type !== type) return file;
    return new File([blob], renamed(file.name, type), { type, lastModified: file.lastModified });
  } catch {
    // A canvas that refuses to draw or encode: the upload still happens, as it did before EVE-25.
    return file;
  } finally {
    picture.release();
  }
}
