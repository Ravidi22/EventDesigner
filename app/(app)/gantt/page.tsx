import type { Metadata } from "next";
import { requireStudio } from "@/lib/auth/guard";
import { fetchEvents } from "@/lib/events/actions";
import { GanttScreen } from "./gantt-screen";

export const metadata: Metadata = { title: "גאנט אירועים · Eve" };

// Read on the server, during the request that renders the grid — not from a mount effect. See the
// note in ../dashboard/page.tsx for why that distinction is worth a file each.
export default async function GanttPage() {
  // The layout's guard races this file rather than gating it — see lib/auth/guard.ts.
  await requireStudio();
  return <GanttScreen initialEvents={await fetchEvents()} />;
}
