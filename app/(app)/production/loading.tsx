import { PageSkeleton } from "@/components/skeleton";

// The lane filter and search over the runway list. The load ribbon above them is not drawn: it
// appears only when there are dated events to navigate, so a bar there would promise a control the
// screen may not have — see production-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="rows" count={4} toolbar />;
}
