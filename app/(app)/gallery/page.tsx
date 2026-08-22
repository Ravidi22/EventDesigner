import { requireStudio } from "@/lib/auth/guard";
import { fetchImages, fetchPresentations } from "@/lib/gallery/actions";
import { GalleryScreen } from "./gallery-screen";

// Studio gallery: named presentations + the builder (F-2.1). Both lists are read here, on the
// server, in one request — the screen used to ask for them from a mount effect, which meant two
// serialized POSTs after the empty gallery had already been painted.
export default async function GalleryPage() {
  // The layout's guard races this file rather than gating it — see lib/auth/guard.ts.
  await requireStudio();
  const [images, presentations] = await Promise.all([fetchImages(), fetchPresentations()]);
  return <GalleryScreen initialImages={images} initialPresentations={presentations} />;
}
