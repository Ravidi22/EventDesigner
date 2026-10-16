import type { Metadata } from "next";
import { requireDesigner } from "@/lib/auth/guard";
import { fetchProducts } from "@/lib/catalog/actions";
import { EventSurface } from "@/components/event-surface";
import { OutputsScreen } from "./outputs-screen";

export const metadata: Metadata = { title: "פלטים · Eve" };

// The catalog is read here, on the server, for the reason the studio page reads it: every sheet
// resolves its items against it while rendering, and it is the one thing they need that does not
// depend on which event this device has open (lib/events/workspace.ts resolves that part).
export default async function OutputsPage() {
  // A supplier has no outputs; it goes to its inbox before this reads anything (lib/auth/guard.ts).
  await requireDesigner();
  return (
    <EventSurface active="outputs">
      <OutputsScreen initialProducts={await fetchProducts()} />
    </EventSurface>
  );
}
