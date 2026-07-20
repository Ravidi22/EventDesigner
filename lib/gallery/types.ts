// v0.3 gallery (F-2.1–F-2.2). A GalleryImage is a PHOTO: file, name, description, and a link
// to exactly ONE catalog product (a product can have many photos, from different events).
// A Presentation is a designer-curated, manually ordered series of photos — the thing
// flipped through with a client (F-2.4).

export interface GalleryImage {
  id: string;
  name: string;
  description?: string;
  productId: string; // the ONE catalog product this photo shows — the bridge to the studio rail
  productName: string; // denormalized for display (mock; later joined from products)
  tone: string; // OKLCH placeholder tile standing in for the photo file until real assets exist
}

export interface Presentation {
  id: string;
  name: string; // "חופה קלאסית בזהב"
  imageIds: string[]; // manual order (F-2.1)
  createdAt: number;
}
