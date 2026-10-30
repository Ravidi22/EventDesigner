import { PageSkeleton } from "@/components/skeleton";

// The tabs and the dish cards, on the same auto-fill template — see menus-screen.tsx.
export default function Loading() {
  return <PageSkeleton shape="grid" cell={220} count={6} toolbar />;
}
