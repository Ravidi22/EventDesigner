// The quote as a FILE — built in the browser, handed to the OS share sheet.
//
// ADR-9 said every PDF comes out of `window.print()`, and for the crew's sheets it still does. A
// quote is different: it is SENT, usually from a phone, usually into WhatsApp, and the print dialog
// hands back nothing that can be sent. So the quote's pages — the same A4 boxes the screen shows
// and the printer prints (./quote-document.tsx) — are photographed one by one (html-to-image) and
// bound into a PDF (pdf-lib), all on the device. No server renders anything, which was the whole
// point of ADR-9 (no Chromium in the monthly bill), so that decision stands; this is its amendment.
//
// What it costs, said once: the PDF's text is part of a picture — it cannot be selected or searched —
// and a five-page quote with photographs is a couple of megabytes. Vector PDF libraries were the
// alternative and every one of them gets Hebrew wrong: mixed Hebrew and numbers come out reversed.
//
// ⚠ Photographs must be readable by this page's scripts: a photo served from another origin (the R2
// bucket's public domain) needs a CORS rule allowing GET from the app's origin, or it is captured
// as an empty box. The local file driver is same-origin and needs nothing.

import { sameOriginUrl } from "@/lib/files/keys";

/** A4 in PDF points. */
const A4_PT: [number, number] = [595.28, 841.89];

/** Anything carrying this attribute is on the screen to edit the quote and never in the file. */
export const NO_CAPTURE = "data-no-capture";

const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** `trueSize`: each page takes its element's own size (a booklet mixes A3 and landscape sheets, all
 *  laid out in real mm — CSS px × 0.75 is points) instead of A4 portrait. */
export async function buildQuotePdf(pages: HTMLElement[], fileName: string, meta: { title: string; author?: string; trueSize?: boolean }): Promise<File> {
  // Loaded on demand: two libraries nobody needs until the moment they share.
  const [{ toJpeg, getFontEmbedCSS }, { PDFDocument }] = await Promise.all([import("html-to-image"), import("pdf-lib")]);
  const filter = (node: HTMLElement) => !(node instanceof Element && node.hasAttribute(NO_CAPTURE));
  // The fonts are embedded once and handed to every page — each call would otherwise re-read and
  // re-inline every @font-face in the document.
  const fontEmbedCSS = pages[0] ? await getFontEmbedCSS(pages[0]) : undefined;

  const pdf = await PDFDocument.create();
  // Readers that honour it show this Hebrew title instead of the file name — the one name that
  // survives whatever the share path does to the file's own.
  pdf.setTitle(meta.title, { showInWindowTitleBar: true });
  if (meta.author) pdf.setAuthor(meta.author);
  pdf.setCreator("Eve");

  // Every photo on the page is captured by FETCHING its URL, which the bucket's public domain does
  // not allow a script to do (no CORS header) — each one came out as a blank box. Our own files are
  // pointed at this origin for the capture (the route proxies the bucket) and put back after.
  const swapped: { node: Element; attr: string; was: string }[] = [];
  for (const el of pages) {
    for (const node of el.querySelectorAll("img, image")) {
      const attr = node instanceof HTMLImageElement ? "src" : "href";
      const was = node.getAttribute(attr) ?? "";
      const same = sameOriginUrl(was);
      if (same !== was) {
        swapped.push({ node, attr, was });
        node.setAttribute(attr, same);
      }
    }
  }
  try {
  for (const el of pages) {
    const url = await toJpeg(el, {
      pixelRatio: 2,
      quality: 0.88,
      backgroundColor: "#ffffff",
      width: el.offsetWidth,
      height: el.offsetHeight,
      // The on-screen sheet floats with a shadow; the captured one is just the paper.
      style: { boxShadow: "none", margin: "0" },
      filter,
      fontEmbedCSS,
      // One photo that cannot be fetched (a supplier's URL with no CORS, a dead link) used to reject
      // the whole file with a bare image error event; it is a blank space instead.
      imagePlaceholder: BLANK_PIXEL,
      onImageErrorHandler: () => {},
    });
    const bytes = await (await fetch(url)).arrayBuffer();
    const image = await pdf.embedJpg(bytes);
    const [w, h]: [number, number] = meta.trueSize ? [el.offsetWidth * 0.75, el.offsetHeight * 0.75] : A4_PT;
    const page = pdf.addPage([w, h]);
    page.drawImage(image, { x: 0, y: 0, width: w, height: h });
  }
  } finally {
    for (const { node, attr, was } of swapped) node.setAttribute(attr, was);
  }

  const out = await pdf.save();
  return new File([out as BlobPart], fileName, { type: "application/pdf" });
}

/** "הצעת מחיר - בר ונועה - 20-08-26.pdf" — readable in a WhatsApp chat, safe on every filesystem.
 *
 *  Letters, digits, spaces and hyphens only. What else a name can carry is what share paths mangle:
 *  the invisible direction marks a pasted name brings with it, ״ and ׳ (and the ASCII quotes typed
 *  in their place), niqqud, decomposed letters, and the filesystem's reserved characters. Dots stay
 *  out of the date, so the only dot in the name is the one before "pdf". */
export function quoteFileName(client: string | undefined, isoDate: string | undefined, title = "הצעת מחיר"): string {
  const date = isoDate ? isoDate.split("-").reverse().map((p, i) => (i === 2 ? p.slice(2) : p)).join("-") : "";
  const name = [title, client && cleanName(client), date].filter(Boolean).join(" - ");
  return `${name}.pdf`;
}

/** The name a SHARED file travels under. WhatsApp on Windows reads the share sheet's file name as
 *  Latin-1, so a Hebrew one arrives as "×_×¦×¢×ª …" — there it is ASCII, and the PDF's own Hebrew
 *  title (set in `buildQuotePdf`) is what the reader shows. Phones get the Hebrew name. */
function shareName(file: File): string {
  if (typeof navigator === "undefined" || !/Windows/.test(navigator.userAgent)) return file.name;
  const ascii = file.name
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+(?=\.pdf$)/g, "")
    .trim();
  return ascii.length > 4 ? ascii : "Eve.pdf";
}

function cleanName(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[֑-ׇ]/g, "") // niqqud and cantillation
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "") // direction marks, zero-width
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "blocked";

/**
 * Hand the file to the OS share sheet (WhatsApp, mail…), or download it where files cannot be
 * shared (Firefox on a desktop, older browsers).
 *
 * "blocked" is the browser refusing because the click that asked for it was too long ago — building
 * the PDF takes seconds, and Safari wants a share to follow a tap almost at once. The file is ready
 * by then, so the caller offers a second tap that shares instantly.
 */
export async function shareFile(file: File, title: string): Promise<ShareOutcome> {
  const named = shareName(file) === file.name ? file : new File([file], shareName(file), { type: file.type });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [named] })) {
    try {
      // `title` only — a `text` goes out as a SECOND message in WhatsApp, before the file.
      await navigator.share({ files: [named], title });
      return "shared";
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError") return "blocked";
      throw e;
    }
  }
  downloadFile(file);
  return "downloaded";
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
