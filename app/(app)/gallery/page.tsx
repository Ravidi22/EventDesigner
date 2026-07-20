import { GalleryScreen } from "./gallery-screen";

// Management-mode gallery: named presentations + the builder (F-2.1). Data loads
// client-side from the storage seam; swap to a Drizzle query once the DB is running.
export default function GalleryPage() {
  return <GalleryScreen manage />;
}
