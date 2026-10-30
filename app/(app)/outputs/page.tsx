import type { Metadata } from "next";
import { requireDesigner } from "@/lib/auth/guard";
import { fetchProducts } from "@/lib/catalog/actions";
import { EventSurface } from "@/components/event-surface";
import { OutputsScreen } from "./outputs-screen";
import { isView } from "./views";

export const metadata: Metadata = { title: "פלטים · Eve" };

// The catalog is read here, on the server, for the reason the studio page reads it: every sheet
// resolves its items against it while rendering, and it is the one thing they need that does not
// depend on which event this device has open (lib/events/workspace.ts resolves that part).
//
// `?view=` opens the screen on one document — the runway's alert button lands on the packing list
// or the map set, not on the quote the screen otherwise opens with. Read here and passed down, as
// the suppliers page reads its tab: the server page reads the parameter and the client tree stays
// out of the prerender bail-out `useSearchParams` causes.
export default async function OutputsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // A supplier has no outputs; it goes to its inbox before this reads anything (lib/auth/guard.ts).
  await requireDesigner();
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  return (
    <EventSurface active="outputs">
      <OutputsScreen initialProducts={await fetchProducts()} initialView={isView(view) ? view : undefined} />
    </EventSurface>
  );
}
