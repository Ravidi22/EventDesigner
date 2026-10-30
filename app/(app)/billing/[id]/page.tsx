import { notFound, redirect } from "next/navigation";
import { requireHost } from "@/lib/auth/guard";
import { fetchDocument } from "@/lib/billing/actions";
import { fetchSettings } from "@/lib/settings/actions";
import { fetchVenues } from "@/lib/venues/actions";
import { DocumentView } from "./document-view";

// One billing document: the page as it prints, and what may still be done to it (markOriginal,
// markSent, cancel, credit, the allocation number). Owners and designers only, like the ledger.
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireHost();
  if (session.role === "crew") redirect("/dashboard");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [view, settings, venues] = await Promise.all([fetchDocument(id), fetchSettings(), fetchVenues()]);
  if (!view) notFound();
  const venueName = view.event.venueId ? venues.find((v) => v.id === view.event.venueId)?.name : undefined;
  return <DocumentView view={view} settings={settings} venueName={venueName} />;
}
