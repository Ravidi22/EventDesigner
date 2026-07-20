import type { Metadata } from "next";
import { DashboardScreen } from "./dashboard-screen";

export const metadata: Metadata = { title: "לוח בקרה · iDesign" };

export default function DashboardPage() {
  return <DashboardScreen />;
}
