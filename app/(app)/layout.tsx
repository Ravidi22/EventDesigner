import { AppShell } from "@/components/app-shell";
import { requireStudio } from "@/lib/auth/guard";
import { fetchMeetingFlow } from "@/lib/settings/actions";
import { MeetingFlowProvider } from "@/lib/meeting/use-flow";
import { fetchVenues } from "@/lib/venues/actions";
import { VenuesProvider } from "@/lib/venues/use-venues";

// Every route under (app) renders inside the persistent shell (plum sidebar + topbar).
// The marketing home (/) and the account screens sit outside the group and have no shell.
//
// THIS is the authorization check, not proxy.ts. The guard out there sees only whether a cookie is
// present; this reads the session row it names, so a cookie that was forged, revoked, or expired
// gets no further than here. Server-side, before any of the shell renders — a signed-out visitor
// never receives the studio's markup at all, which is the difference between a redirect and a
// flicker of someone else's app.
//
// requireStudio, not requireSession: this is a whole business's clients, catalog and prices, and a
// signed-in CLIENT has no more right to it than a stranger.
//
// The meeting flow is read here, once, for the five components below that measure an event's
// progress against it — see lib/meeting/use-flow. Resolving it server-side also means the first
// paint already uses the studio's own flow rather than the default it would then correct.
//
// The venue list is read here for the same reason and now on the same terms: the sidebar's switcher
// and the dashboard both need it, and asking for it from the client meant two serialized POSTs for
// one list. See lib/venues/use-venues.tsx.
//
// Both reads go out TOGETHER. Promise.all is real parallelism here in a way it is not on the client:
// this is one request on the server, not two dispatches through a client-side queue that runs them
// one at a time. The pair costs one round trip instead of two.
//
// requireStudio() stays sequential ahead of them on purpose — it decides whether this person may
// see any of it, and starting the reads before that answer is in would be issuing a studio's
// queries on behalf of someone who may turn out to be a client.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStudio();
  const [flow, venues] = await Promise.all([fetchMeetingFlow(), fetchVenues()]);
  return (
    <MeetingFlowProvider flow={flow}>
      <VenuesProvider initialVenues={venues}>
        <AppShell user={{ name: session.name, email: session.email }}>{children}</AppShell>
      </VenuesProvider>
    </MeetingFlowProvider>
  );
}
