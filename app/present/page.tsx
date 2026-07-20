import { PresentScreen } from "./present-screen";

// Full-screen presentation mode (F-2.4) — deliberately OUTSIDE the app shell. `?p=<id>` opens
// a specific presentation; otherwise the first. searchParams is a promise in Next 16.
export default async function PresentPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return <PresentScreen presentationId={p ?? null} />;
}
