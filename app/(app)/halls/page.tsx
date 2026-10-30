import type { Metadata } from "next";
import { requireHost } from "@/lib/auth/guard";
import { HallsScreen } from "./halls-screen";

export const metadata: Metadata = { title: "תוכנית המתחם · Eve" };

export default async function HallsPage() {
  // A designer's and a venue's: the venue owns the plan, every designer working there draws on it.
  await requireHost();
  return <HallsScreen />;
}
