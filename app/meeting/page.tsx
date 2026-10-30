import { Suspense } from "react";
import { MeetingScreen } from "./meeting-screen";
import { HallMeetingScreen } from "./hall-meeting-screen";
import { requireHost } from "@/lib/auth/guard";
import { fetchBookings } from "@/lib/hosting/actions";
import { fetchMenu } from "@/lib/menus/actions";
import { fetchVenues } from "@/lib/venues/actions";
import { VenuesProvider } from "@/lib/venues/use-venues";

// Meeting mode (docs/01 §3): the guided client-facing flow. Lives outside the (app) group on
// purpose — no management sidebar, no internal data on a screen the client watches. Outside the
// shell means outside the layout that checks the session, so it checks its own.
//
// A hall has one too (2026-10-30): the booking's steps full-screen (./hall-meeting-screen.tsx), on
// `?event=<id>` or a new booking (`?date=` seeds its day). Its reads happen here, like /bookings'.
export default async function MeetingPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requireHost();
  if (session.organizationKind === "venue") {
    const params = await searchParams;
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const eventId = one(params.event);
    const date = one(params.date);
    const [bookings, menu, venues] = await Promise.all([fetchBookings(), fetchMenu(), fetchVenues()]);
    const booking = (eventId && bookings.find((b) => b.event.id === eventId)) || null;
    return (
      <VenuesProvider initialVenues={venues}>
        <HallMeetingScreen
          booking={booking}
          seed={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : undefined}
          dishes={menu.dishes}
          packages={menu.packages}
        />
      </VenuesProvider>
    );
  }
  return (
    <Suspense>
      <MeetingScreen />
    </Suspense>
  );
}
