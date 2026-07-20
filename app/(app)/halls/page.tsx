import type { Metadata } from "next";
import { HallsScreen } from "./halls-screen";

export const metadata: Metadata = { title: "תבניות אולם · iDesign" };

export default function HallsPage() {
  return <HallsScreen />;
}
