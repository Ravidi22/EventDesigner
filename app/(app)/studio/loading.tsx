import { PageSkeleton } from "@/components/skeleton";

// No title block: the studio opens straight into EventSurface chrome plus a canvas.
export default function Loading() {
  return <PageSkeleton rows={1} title={false} />;
}
