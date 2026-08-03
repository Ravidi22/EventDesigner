import type { Metadata } from "next";
import { EventSurface } from "@/components/event-surface";
import { OutputsScreen } from "./outputs-screen";

export const metadata: Metadata = { title: "פלטים · Eve" };

export default function OutputsPage() {
  return (
    <EventSurface active="outputs">
      <OutputsScreen />
    </EventSurface>
  );
}
