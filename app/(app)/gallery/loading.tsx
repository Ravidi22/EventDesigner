import { PageSkeleton } from "@/components/skeleton";

// One of the two screens with a title of its own ("תצוגות" + the new-presentation button), over a
// grid of 240px 4:3 cards — see gallery-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="grid" cell={240} count={6} header="row" />;
}
