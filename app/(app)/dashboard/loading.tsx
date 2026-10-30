import { PageSkeleton } from "@/components/skeleton";

// Today's two tiles, then the calendar — see dashboard-screen.tsx (and venue-dashboard.tsx, a hall's,
// which is the same layout). No greeting or title: the dashboard no longer draws one.
export default function Loading() {
  return <PageSkeleton shape="split" />;
}
