import { requireStudio } from "@/lib/auth/guard";
import { fetchProducts } from "@/lib/catalog/actions";
import { fetchMarketFlowers } from "@/lib/marketplace/actions";
import { CatalogScreen } from "./catalog-screen";

// The catalog is read here, on the server, and handed to the screen — which also primes the
// studio's synchronous resolver cache with it (lib/catalog/use-catalog.ts) before anything draws.
// The marketplace's stems ride along for the drawer's flower rows (names, kinds, colours), and a
// marketplace that cannot be read costs the suggestions, not the catalog.
export default async function CatalogPage() {
  // The layout's guard races this file rather than gating it — see lib/auth/guard.ts.
  await requireStudio();
  const [products, marketFlowers] = await Promise.all([fetchProducts(), fetchMarketFlowers().catch(() => [])]);
  return <CatalogScreen initialProducts={products} marketFlowers={marketFlowers} />;
}
