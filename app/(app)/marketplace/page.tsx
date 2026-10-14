import type { Metadata } from "next";
import { requireDesigner } from "@/lib/auth/guard";
import { fetchMarketplace } from "@/lib/marketplace/actions";
import { MarketplaceScreen } from "./marketplace-screen";

export const metadata: Metadata = { title: "שוק הספקים · Eve" };

// Read on the server, like the catalog: the list is the whole page, and a server read is
// prefetchable by <Link> where a mount-time action is not.
export default async function MarketplacePage() {
  await requireDesigner();
  return <MarketplaceScreen items={await fetchMarketplace()} />;
}
