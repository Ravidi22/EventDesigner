import { PageSkeleton } from "@/components/skeleton";

// The ribbon and the filter bar over the runway list — see production-screen.tsx.
export default function Loading() {
  return <PageSkeleton rows={3} />;
}
