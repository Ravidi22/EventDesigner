import { PageSkeleton } from "@/components/skeleton";

// The lanes, the search and a stack of evenings — see bookings-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="rows" count={5} toolbar />;
}
