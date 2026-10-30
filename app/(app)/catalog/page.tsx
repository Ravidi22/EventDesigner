import { requireOrgKind } from "@/lib/auth/guard";
import { fetchProducts } from "@/lib/catalog/actions";
import { fetchMarketFlowers } from "@/lib/marketplace/actions";
import { CatalogScreen } from "./catalog-screen";
import { SOURCING_FILTERS, type SourcingFilter } from "./sourcing";

// The catalog is read here, on the server, and handed to the screen — which also primes the
// studio's synchronous resolver cache with it (lib/catalog/use-catalog.ts) before anything draws.
// The marketplace's stems ride along for the drawer's flower rows (names, kinds, colours), and a
// marketplace that cannot be read costs the suggestions, not the catalog.
//
// `?sourcing=unsourced|uncounted|…` lands with the רכש lens already set — the procurement tab's
// setup strip sends the designer here to fix "12 פריטים ללא ספק" in one go. Read in the server
// page rather than with useSearchParams, for the reason app/(app)/suppliers/page.tsx gives.
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The layout's guard races this file rather than gating it — see lib/auth/guard.ts.
  await requireOrgKind(["studio", "supplier"]);
  const params = await searchParams;
  const raw = Array.isArray(params.sourcing) ? params.sourcing[0] : params.sourcing;
  const sourcing = (SOURCING_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as SourcingFilter) : null;
  const [products, marketFlowers] = await Promise.all([fetchProducts(), fetchMarketFlowers().catch(() => [])]);
  return <CatalogScreen initialProducts={products} marketFlowers={marketFlowers} initialSourcing={sourcing} />;
}
