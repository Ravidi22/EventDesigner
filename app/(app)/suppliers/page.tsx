import { SuppliersScreen } from "./suppliers-screen";

// Suppliers, expenses and the procurement forecast — all three read through lib/suppliers/ from the
// client, the same way the catalog does.
//
// The two query parameters are read HERE rather than with useSearchParams in the screen, which is
// what Next's own reference recommends: reading them in the server page and passing them down keeps
// the client tree out of the prerender bail-out that hook causes, and needs no Suspense boundary
// around a screen that has nothing else to stream. They exist for one link — "רישום הוצאה" on an
// event (dashboard/event-margin-card.tsx) — which has to land on the ledger already filtered to the
// event it was asked about.
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return <SuppliersScreen initialTab={one(params.tab)} initialEventId={one(params.event)} />;
}
