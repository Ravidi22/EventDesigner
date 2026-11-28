// How an upload is redrawn in the browser before it is sent (EVE-25; spec §4). Pure — the canvas half
// is ./shrink.ts.
//
// Every picture is DRAWN AGAIN, even one already small: a canvas carries no metadata, so the redraw
// is what drops a phone photo's EXIF — its GPS location among it — and what keeps a 12 MB original
// from becoming every gallery's and presentation's download on a phone.
import type { FileKind } from "./keys";

/** The longest side a picture of each kind is drawn at. */
export const LONG_SIDE: Record<FileKind, number> = {
  gallery: 2400,
  product: 2400,
  dish: 2400,
  sketch: 2400,
  // A scanned hall plan is traced to scale: it keeps its detail.
  underlay: 4000,
  // Printed small on a quote or a document.
  logo: 1200,
  signature: 1200,
};

export const JPEG_QUALITY = 0.85;

export type OutputType = "image/jpeg" | "image/png";

/** The size to draw at: the long side capped for the kind, the proportions kept, never enlarged. */
export function targetSize(width: number, height: number, kind: FileKind): { width: number; height: number } {
  const scale = Math.min(1, LONG_SIDE[kind] / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** PNG stays PNG — a logo's or a signature's transparency, a scan's sharp lines; a transparent WebP or
 *  AVIF becomes PNG rather than a JPEG on black; every other picture becomes a JPEG. (A canvas cannot
 *  reliably encode WebP or AVIF everywhere — Safari falls back to PNG without saying so.) */
export function outputType(inputType: string, hasAlpha: boolean): OutputType {
  if (inputType === "image/png") return "image/png";
  if (inputType === "image/jpeg") return "image/jpeg";
  return hasAlpha ? "image/png" : "image/jpeg";
}

/** True when the file as PICKED goes up rather than its redraw: the redraw came out bigger, and the
 *  picked file is not a JPEG. A canvas's PNG encoder compresses less than the tools that make an
 *  optimised PNG, so a hall plan that uploaded before EVE-25 could come back over MAX_BYTES and be
 *  refused (PR #2 review). A JPEG always goes up redrawn — that is the only way to drop a phone photo's
 *  EXIF; a PNG or a WebP very rarely carries location data. */
export function uploadOriginal(pickedType: string, pickedSize: number, redrawnSize: number): boolean {
  return redrawnSize > pickedSize && pickedType !== "image/jpeg";
}

/** The same name with the extension of what it now is. */
export function renamed(name: string, type: OutputType): string {
  const ext = type === "image/png" ? "png" : "jpg";
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}
