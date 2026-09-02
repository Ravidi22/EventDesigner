import { PageSkeleton } from "@/components/skeleton";

// Page-setup controls over the sheet being printed.
export default function Loading() {
  return <PageSkeleton shape="canvas" toolbar />;
}
