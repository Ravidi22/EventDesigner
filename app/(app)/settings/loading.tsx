import { PageSkeleton } from "@/components/skeleton";

// The 228px section nav beside the active section's panel — see settings-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="aside" />;
}
