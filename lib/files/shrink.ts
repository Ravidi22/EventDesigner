"use client";
// The canvas half of EVE-25: every picture is drawn again before upload (the rules are ./shrink-rules.ts).
//
// `imageOrientation: "from-image"` applies a phone photo's EXIF rotation BEFORE the metadata is
// dropped — without it a portrait photo would arrive lying on its side, once the EXIF that said
// "turn me" is gone. A picture the browser cannot decode goes up as it is (DECIDE-5): the server's
// limits still apply, and refusing a photo the designer can see on their own screen would be worse.
import type { FileKind } from "./keys";
import { JPEG_QUALITY, outputType, renamed, targetSize } from "./shrink-rules";

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

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
function hasTransparency(bitmap: ImageBitmap): boolean {
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = makeCanvas(w, h).getContext("2d") as Canvas2D | null;
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/** The picture as it will be uploaded: no larger than its kind allows, and with no metadata. */
export async function prepareImage(file: File, kind: FileKind): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    // Transparency only matters for the formats that turn into a JPEG when they have none.
    const alpha = file.type === "image/webp" || file.type === "image/avif" ? hasTransparency(bitmap) : false;
    const type = outputType(file.type, alpha);
    const { width, height } = targetSize(bitmap.width, bitmap.height, kind);
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d") as Canvas2D | null;
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await encode(canvas, type, JPEG_QUALITY);
    if (!blob || blob.type !== type) return file;
    return new File([blob], renamed(file.name, type), { type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
