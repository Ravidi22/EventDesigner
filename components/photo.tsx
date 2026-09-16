"use client";

import type { GalleryImage } from "@/lib/gallery/types";

// A gallery photograph — the photo's own upload, or the LINKED PRODUCT's photo when the photo has
// none of its own, or a calm neutral tile where neither exists yet.
//
// The tile used to be a per-photo random `tone` (an OKLCH colour minted at creation). That is gone:
// a presentation of a dozen slides wants ONE quiet background, not twelve, and DESIGN.md's "the
// tool recedes" says the same. `tone` still exists on the row and the type — dropping a DB column
// is not worth it — but nothing renders it any more.
//
// `alt` is the photo's own name. These are photographs OF SOMETHING — "שנדליר מעל החופה" — and that
// name is exactly what a screen reader should read out. The empty case carries no alt of its own.
//
// ⚠ A plain <img>, not next/image. These files are served either from this app's own route or from
// a bucket on a custom domain, both of which already send immutable cache headers, and next/image
// would put an optimiser in front of a photograph that a client is about to look at full-screen on
// a tablet — latency for no gain. It also needs remote hosts configured in next.config.ts, which
// would mean the R2 domain has to be known at build time. It is not: it is an environment variable.

export function Photo({
  image,
  className = "",
  /** `cover` fills its box and crops; `contain` letterboxes the whole photograph. Presentation
   *  surfaces pass `cover` — the designer asked for the image to fill the slide, not sit small. */
  fit = "cover",
}: {
  image: Pick<GalleryImage, "imageUrl" | "productImageUrl" | "name">;
  className?: string;
  fit?: "cover" | "contain";
}) {
  // The photo's own upload wins; the linked product's photo is the fallback; the neutral tile is last.
  const src = image.imageUrl || image.productImageUrl;
  if (!src) {
    return <span className={`${className} bg-inset`} aria-hidden="true" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- deliberate; see the note at the top of this file
    <img
      src={src}
      alt={image.name}
      loading="lazy"
      decoding="async"
      className={`${className} bg-inset`}
      style={{ objectFit: fit }}
    />
  );
}
