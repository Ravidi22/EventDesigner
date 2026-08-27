import { requireStudio } from "@/lib/auth/guard";
import { fetchProducts } from "@/lib/catalog/actions";
import { CatalogScreen } from "./catalog-screen";

// The catalog is read here, on the server, and handed to the screen — which also primes the
// studio's synchronous resolver cache with it (lib/catalog/use-catalog.ts) before anything draws.
export default async function CatalogPage() {
  // The layout's guard races this file rather than gating it — see lib/auth/guard.ts.
  await requireStudio();
  return <CatalogScreen initialProducts={await fetchProducts()} />;
}
