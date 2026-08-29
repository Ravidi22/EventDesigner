import { PageSkeleton } from "@/components/skeleton";

// A plan editor, edge to edge, with no header row above it — see halls-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="canvas" />;
}
