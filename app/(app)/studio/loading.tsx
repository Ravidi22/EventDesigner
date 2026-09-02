import { PageSkeleton } from "@/components/skeleton";

// The studio opens straight into its toolbar strip plus a canvas.
export default function Loading() {
  return <PageSkeleton shape="canvas" toolbar />;
}
