import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireDesigner } from "@/lib/auth/guard";
import { fetchMarketplace } from "@/lib/marketplace/actions";
import { SupplierShop } from "./supplier-shop";

export const metadata: Metadata = { title: "שוק הספקים · Eve" };

// One supplier's shop: their profile and every row they publish. A supplier with nothing
// published has no shop — the same rule that keeps them off the first page.
export default async function SupplierShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  await requireDesigner();
  const [{ supplierId }, { q, category }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(supplierId)) notFound();
  const items = await fetchMarketplace(supplierId);
  if (items.length === 0) notFound();
  return (
    <SupplierShop
      supplier={items[0].supplier}
      items={items}
      initialQuery={typeof q === "string" ? q : ""}
      initialCategory={typeof category === "string" ? category : ""}
    />
  );
}
