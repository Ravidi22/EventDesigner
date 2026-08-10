import type { Metadata } from "next";
import { requireClient } from "@/lib/auth/guard";
import { fetchMyEvents } from "@/lib/client-portal/actions";
import { ClientHome } from "./client-home";

export const metadata: Metadata = { title: "האירוע שלי · Eve" };

// The client's side of the product. Outside the (app) group and with no sidebar: there is nothing
// to navigate between yet, and a client is not managing a business.
//
// It renders on the SERVER, unlike most of the studio, because there is no canvas here and nothing
// to hold in local state — the page is a read of two or three facts about one event. The studio's
// pattern (fetch in an effect, hydrate) exists to keep a drawing responsive; borrowing it here
// would add a loading flash to a page that does not need one.
export default async function ClientPage() {
  const session = await requireClient();
  const eventList = await fetchMyEvents();
  return <ClientHome name={session.name} email={session.email} events={eventList} />;
}
