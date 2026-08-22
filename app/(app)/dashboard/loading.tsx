import { PageSkeleton } from "@/components/skeleton";

// Two half-width cards over the calendar — see dashboard-screen.tsx.
export default function Loading() {
  return <PageSkeleton rows={2} />;
}
