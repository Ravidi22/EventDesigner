import type { Metadata } from "next";
import { HallsScreen } from "./halls-screen";

export const metadata: Metadata = { title: "תוכנית המתחם · Eve" };

export default function HallsPage() {
  return <HallsScreen />;
}
