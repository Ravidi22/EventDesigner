import type { Metadata } from "next";
import { requireOrgKind } from "@/lib/auth/guard";
import { fetchMenu } from "@/lib/menus/actions";
import { MenusScreen } from "./menus-screen";

export const metadata: Metadata = { title: "תפריטים · Eve" };

// A venue's dishes and packages (lib/menus), read here on the server.
export default async function MenusPage() {
  await requireOrgKind(["venue"]);
  const menu = await fetchMenu();
  return <MenusScreen initialDishes={menu.dishes} initialPackages={menu.packages} />;
}
