"use client";

import type { GalleryImage } from "@/lib/gallery/types";
import { Photo } from "@/components/photo";

// The framed slide shared by /present (the client-facing flip-through, F-2.4) and the gallery
// builder's live preview. Extracted so the view a designer approves before saving is BY
// CONSTRUCTION the one the client gets — not a lookalike that drifts the first time either side is
// restyled.
//
// The caller owns navigation, the keyboard, and the thumbnail strip; this renders ONE slide. Pass
// `key` (the image id) so a slide change remounts the figure and replays the `present-in` fade.
export function PresentationSlide({
  image,
  index,
  total,
  fit = "cover",
  className = "",
  showIndex = true,
  action,
}: {
  image: Pick<GalleryImage, "imageUrl" | "productImageUrl" | "name" | "description">;
  index: number;
  total: number;
  /** `cover` (default) fills the slide — the designer asked for the image to fill the frame rather
   *  than sit letterboxed against the background. `contain` is still here for anything that needs
   *  the whole photograph uncropped. */
  fit?: "cover" | "contain";
  /** Extra classes on the outer <figure>. Width lives with the caller, which sizes the slide to
   *  its own container — a viewport fraction in /present, a pane in the builder. */
  className?: string;
  /** The "N מתוך M" line above the title. On in /present (the client wants to know where they
   *  are); off in the builder, where the numbered filmstrip already carries it. */
  showIndex?: boolean;
  /** A control pinned to the slide's top corner — the like button in /present, nothing in the
   *  builder preview. Positioned by the node itself; the figure is the `relative` parent. */
  action?: React.ReactNode;
}) {
  return (
    <figure
      className={
        "present-in relative aspect-[16/9] overflow-hidden rounded-xl border border-border bg-inset shadow-dialog " +
        className
      }
    >
      <Photo image={image} fit={fit} className="absolute inset-0 h-full w-full" />

      {/* Name + description overlay the photo's lower edge, over an ink scrim for legibility.
          Assistant, not font-display — that face (Urbanist) is Latin-only, wrong for Hebrew. */}
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent px-5 pb-4 pt-12">
        {showIndex && (
          <p className="nums text-[11px] tracking-wide text-canvas/70">
            {index + 1} מתוך {total}
          </p>
        )}
        <h2 className="text-sm font-semibold text-canvas sm:text-base">{image.name}</h2>
        {image.description && <p className="mt-0.5 text-xs text-canvas/80">{image.description}</p>}
      </figcaption>

      {action}
    </figure>
  );
}
