import { PageSkeleton } from "@/components/skeleton";

// Greeting + title, two half-width cards, then the calendar — see dashboard-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="split" header="stack" />;
}
