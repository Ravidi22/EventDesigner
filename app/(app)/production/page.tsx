import type { Metadata } from "next";
import { requireDesigner } from "@/lib/auth/guard";
import { fetchRunway } from "@/lib/production/actions";
import { fetchEvents } from "@/lib/events/actions";
import { fetchAppointments } from "@/lib/appointments/actions";
import { ProductionScreen } from "./production-screen";

export const metadata: Metadata = { title: "הפקה · Eve" };

// Read on the server, during the request that renders the runway — not from a mount effect. The
// note in ../dashboard/page.tsx spells out why that distinction is worth a file each: a server
// action dispatched from the client is a POST, so it cannot start until React has mounted and it
// can never be prefetched by <Link>.
//
// THREE reads, together. `fetchRunway` assembles every fact the LIST shows — the events, their
// zones, their gallery passes, their drawings, their quotes and their exports — in one batch of
// set-based queries and returns the finished `Runway`, so the screen renders what it is handed
// instead of recomputing the checkpoints per row on every keystroke of the search box. The events
// and the diary are for the event DRAWER the rows open (the dashboard's own, app/(app)/dashboard/
// event-detail-drawer.tsx): the brief, the contacts, the meetings, the client's side and, for a
// confirmed event, the production section. A row used to jump straight into /studio, which is a
// design surface; from a screen about deadlines the first click should be a look, not a leap.
//
// There is no venue parameter, and that is the fix for one of the old screen's real bugs. The
// Kanban filtered to whichever venue the sidebar had active, which meant "how many open deals do I
// have" was unanswerable on the one screen whose job it was. A designer's book of business spans
// properties; venue GRANTS are still honoured inside fetchRunway, which is a different question.
//
// `?venue=<id>` is the ONE exception, and it is not a scope but a question: "what is still on this
// property" — asked from the venue switcher when a delete was refused because events sit on it.
// It is a filter over the same runway (grants still apply), keyed so arriving at it from the
// unscoped screen starts fresh rather than keeping the lane the other view had open.
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Before the read, not alongside it: the layout's guard races this file rather than gating it.
  // See lib/auth/guard.ts.
  await requireDesigner();
  const params = await searchParams;
  const venueId = (Array.isArray(params.venue) ? params.venue[0] : params.venue) || undefined;
  const [runway, events, appointments] = await Promise.all([fetchRunway(), fetchEvents(), fetchAppointments()]);
  return (
    <ProductionScreen
      key={venueId ?? "all"}
      runway={runway}
      venueId={venueId}
      initialEvents={events}
      initialAppointments={appointments}
    />
  );
}
