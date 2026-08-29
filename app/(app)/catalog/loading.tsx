import { PageSkeleton } from "@/components/skeleton";

// Filters + view toggle over an auto-fill grid of 190px cards — see catalog-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="grid" cell={190} count={10} toolbar />;
}
