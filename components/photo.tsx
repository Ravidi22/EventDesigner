"use client";

import type { GalleryImage } from "@/lib/gallery/types";

// A gallery photograph — or the coloured tile that stands where one is not yet.
//
// Five places rendered this: three sizes of thumbnail, a row in the presentation builder, and the
// full-bleed slide in /present. While every one of them was `background: img.tone` they agreed by
// accident; the moment real photographs arrived they would have diverged, and the one that mattered
// most is the one a client is looking at.
//
// `alt` is the photo's own name. These are photographs OF SOMETHING — "שנדליר מעל החופה" — and that
// name is exactly what a screen reader should read out. The decorative case is the tile with no
// photograph, which is why it carries no alt text of its own.
//
// ⚠ A plain <img>, not next/image. These files are served either from this app's own route or from
// a bucket on a custom domain, both of which already send immutable cache headers, and next/image
// would put an optimiser in front of a photograph that a client is about to look at full-screen on
// a tablet — latency for no gain. It also needs remote hosts configured in next.config.ts, which
// would mean the R2 domain has to be known at build time. It is not: it is an environment variable.

export function Photo({
  image,
  className = "",
  /** `cover` fills its box and crops (thumbnails); `contain` shows the whole photograph (/present,
   *  where cropping a client's chosen image is not ours to do). */
  fit = "cover",
}: {
  image: Pick<GalleryImage, "imageUrl" | "tone" | "name">;
  className?: string;
  fit?: "cover" | "contain";
}) {
  if (!image.imageUrl) {
    return <span className={className} style={{ background: image.tone }} aria-hidden="true" />;
  }
  return (
    <img
      src={image.imageUrl}
      alt={image.name}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ objectFit: fit, background: image.tone }}
    />
  );
}
