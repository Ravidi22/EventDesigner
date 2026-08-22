import { PageSkeleton } from "@/components/skeleton";

// The plan editor is one big canvas rather than a list of cards.
export default function Loading() {
  return <PageSkeleton rows={1} title={false} />;
}
