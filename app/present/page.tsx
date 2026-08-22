import { PresentScreen } from "./present-screen";
import { requireStudio } from "@/lib/auth/guard";

// Full-screen presentation mode (F-2.4) — deliberately OUTSIDE the app shell. `?p=<id>` opens
// a specific presentation; otherwise the first. `?meeting=1` is set only when opened from the
// meeting flow — that's what turns on the like / "תיק האירוע" affordance (a studio preview of
// the same presentation has no client and no event to save into). searchParams is a promise
// in Next 16.
export default async function PresentPage({ searchParams }: { searchParams: Promise<{ p?: string; meeting?: string }> }) {
  // Outside the (app) group, so it does not inherit that layout's session check — see lib/auth/guard.
  await requireStudio();
  const { p, meeting } = await searchParams;
  return <PresentScreen presentationId={p ?? null} meeting={meeting === "1"} />;
}
