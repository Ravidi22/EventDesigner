import { CatalogScreen } from "./catalog-screen";

// Catalog loads client-side from the storage seam (F-4.4–F-4.5); swap to a Drizzle query
// once the DB is running.
export default function CatalogPage() {
  return <CatalogScreen />;
}
