import type { Metadata } from "next";
import { requireStudio } from "@/lib/auth/guard";
import { fetchEvents } from "@/lib/events/actions";
import { fetchAppointments } from "@/lib/appointments/actions";
import { DashboardScreen } from "./dashboard-screen";

export const metadata: Metadata = { title: "לוח בקרה · Eve" };

// Both reads happen HERE, on the server, during the request that renders the screen — not in the
// mount effects of the hooks below it.
//
// The difference is not a matter of taste. A server action dispatched from the client is a POST, so
// it cannot begin until React has mounted, it can never be prefetched by <Link>, and Next runs them
// ONE AT A TIME per client — so the two reads this page used to make were strictly sequential, after
// the empty screen had already been painted. Promise.all here is genuine concurrency: one request,
// two queries in flight together.
//
// Venues are absent on purpose: the (app) layout already read them for the sidebar's switcher and
// the dashboard reads that same copy through VenuesProvider. Fetching them a third time here is
// exactly the duplication this change exists to remove.
export default async function DashboardPage() {
  // Before the reads, not alongside them: the layout's guard runs in parallel with this file and
  // therefore cannot gate it. See lib/auth/guard.ts — it is free, and it is what turns a signed-out
  // visit into a redirect rather than "not signed in" thrown out of fetchEvents.
  await requireStudio();
  const [events, appointments] = await Promise.all([fetchEvents(), fetchAppointments()]);
  return <DashboardScreen initialEvents={events} initialAppointments={appointments} />;
}
