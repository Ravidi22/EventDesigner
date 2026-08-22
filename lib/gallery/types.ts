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
   *  will be: a photo can be added later, and everything that renders one falls back to `tone`. */
  imageUrl?: string;
  /** An OKLCH tile shown where there is no photograph yet. It was a stand-in for the whole feature
   *  before file storage existed; it stays as the empty state, which a gallery of a hundred photos
   *  still needs on the day someone adds the hundred-and-first. */
  tone: string;
}

export interface Presentation {
  id: string;
  name: string; // "חופה קלאסית בזהב"
  imageIds: string[]; // manual order (F-2.1)
  createdAt: number;
}
