// v0.3 gallery (F-2.1–F-2.2). A GalleryImage is a PHOTO: file, name, description, and a link
// to exactly ONE catalog product (a product can have many photos, from different events).
// A Presentation is a designer-curated, manually ordered series of photos — the thing
// flipped through with a client (F-2.4).

export interface GalleryImage {
  id: string;
  name: string;
  description?: string;
  /** The ONE catalog product this photo shows — the bridge to the studio rail. Empty when that
   *  product has since been deleted; the photograph outlives the catalog entry. */
  productId: string;
  /** For display. JOINED from the catalog on every read (lib/gallery/actions.ts), not stored on the
   *  photo — while it was a copy, renaming a product left its photos captioned with the old name.
   *  Callers may still SEND it; the server ignores what it is handed and answers with the real one. */
  productName: string;
  /** The photograph, once one has been uploaded (lib/files/). Absent is a real state and always
   *  will be: a photo can be added later, and a slide without one shows a calm neutral tile. */
  imageUrl?: string;
  /** The LINKED PRODUCT's own photo, JOINED from the catalog on every read (lib/gallery/actions.ts) —
   *  never stored, like `productName`. When a photo has a product but no `imageUrl` of its own, this
   *  is what renders: a designer who already photographed the product in the catalog does not upload
   *  it again. `imageUrl` still wins when both are present (a slide-specific override). */
  productImageUrl?: string;
  /** LEGACY. A per-photo OKLCH tile colour, minted at creation, once used as the empty-state
   *  background. Nothing renders it any more — a presentation wants ONE quiet background, not one
   *  per slide (DESIGN.md: the tool recedes). Still a column on the row, still round-tripped, so
   *  the value is not lost; just no longer read. */
  tone?: string;
}

export interface Presentation {
  id: string;
  name: string; // "חופה קלאסית בזהב"
  imageIds: string[]; // manual order (F-2.1)
  createdAt: number;
}
