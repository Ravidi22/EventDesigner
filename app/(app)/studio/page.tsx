import { requireStudio } from "@/lib/auth/guard";
import { fetchProducts } from "@/lib/catalog/actions";
import { EventSurface } from "@/components/event-surface";
import { StudioScreen } from "./studio-screen";

// The screen itself carries no event chrome — it is embedded bare inside the meeting flow's
// שיבוץ step, where the flow's own header already says which event this is.
//
// The catalog is read HERE, on the server, because it is the one thing the studio needs that does
// NOT depend on which event this device has open: it is the same list whoever is looking. Everything
// that does depend on the open event — the event, its document, its venue geometry — is resolved by
// EventSurface in a single call, because the pointer to it lives in this browser and the server
// cannot know it without being told. See lib/events/workspace.ts.
export default async function StudioPage() {
  // The layout's guard races this file rather than gating it — see lib/auth/guard.ts.
  await requireStudio();
  return (
    <EventSurface active="studio">
      <StudioScreen initialProducts={await fetchProducts()} />
    </EventSurface>
  );
}
