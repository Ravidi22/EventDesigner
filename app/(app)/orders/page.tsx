import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStudio } from "@/lib/auth/guard";
import { fetchIncomingOrders } from "@/lib/orders/actions";
import { OrdersScreen } from "./orders-screen";

export const metadata: Metadata = { title: "הזמנות · Eve" };

// A supplier's inbox. A designer's orders are the ones they SENT, and they live under ספקים ורכש.
export default async function OrdersPage() {
  const session = await requireStudio();
  if (session.organizationKind !== "supplier") redirect("/suppliers?tab=orders");
  return <OrdersScreen initial={await fetchIncomingOrders()} />;
}
