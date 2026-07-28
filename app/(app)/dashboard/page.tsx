import type { Metadata } from "next";
import { DashboardScreen } from "./dashboard-screen";

export const metadata: Metadata = { title: "לוח בקרה · Eve" };

export default function DashboardPage() {
  return <DashboardScreen />;
}
