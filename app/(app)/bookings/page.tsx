import type { Metadata } from "next";
import { requireOrgKind } from "@/lib/auth/guard";
import { fetchBookings } from "@/lib/hosting/actions";
import { fetchMenu } from "@/lib/menus/actions";
import { fetchAppointments } from "@/lib/appointments/actions";
import { BookingsScreen } from "./bookings-screen";

export const metadata: Metadata = { title: "אירועים · Eve" };

// A venue's book of evenings (lib/hosting). Read here, on the server, in one request: the bookings,
// the menu their packages and dishes are named from, and the diary's sittings for their drawers.
export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireOrgKind(["venue"]);
  const params = await searchParams;
  const event = Array.isArray(params.event) ? params.event[0] : params.event;
  const [bookings, menu, appointments] = await Promise.all([fetchBookings(), fetchMenu(), fetchAppointments()]);
  return (
    <BookingsScreen
      initialBookings={bookings}
      initialAppointments={appointments}
      dishes={menu.dishes}
      packages={menu.packages}
      openEventId={event}
    />
  );
}
