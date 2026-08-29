import { PageSkeleton } from "@/components/skeleton";

// Tab pills over a list of supplier cards — see suppliers-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="rows" count={4} toolbar />;
}
