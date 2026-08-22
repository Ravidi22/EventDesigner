import { AppShell } from "@/components/app-shell";
import { requireStudio } from "@/lib/auth/guard";
import { fetchMeetingFlow } from "@/lib/settings/actions";
import { MeetingFlowProvider } from "@/lib/meeting/use-flow";

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
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStudio();
  const flow = await fetchMeetingFlow();
  return (
    <MeetingFlowProvider flow={flow}>
      <AppShell user={{ name: session.name, email: session.email }}>{children}</AppShell>
    </MeetingFlowProvider>
  );
}
