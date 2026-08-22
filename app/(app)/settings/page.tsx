import { requireStudio } from "@/lib/auth/guard";
import { fetchSettings } from "@/lib/settings/actions";
import { fetchCurrentMember, fetchMembers } from "@/lib/team/actions";
import { SettingsScreen } from "./settings-screen";

// Business details (F-8.1), the studio's people (F-8.2) and venue sharing (F-8.3).
//
// The three reads shared by more than one section happen here, once, in parallel — not in the mount
// effect of whichever section you happened to open. `fetchCurrentMember` in particular was being
// asked for by three separate sections, and `fetchMembers` by two; each pair sat behind its own POST
// because the client dispatches server actions one at a time.
//
// TWO THINGS ARE DELIBERATELY ABSENT. The meeting flow, because the (app) layout already read it and
// every section reads that copy through useMeetingFlow(). The venue list, for the same reason, via
// VenuesProvider. Adding them here would reintroduce exactly the duplication this removes.
//
// The per-venue grants stay where they are: they depend on which property is selected, which is a
// per-device pointer this browser holds, so the server has nothing to resolve them against.
export default async function SettingsPage() {
  // The layout's guard races this file rather than gating it — see lib/auth/guard.ts.
  await requireStudio();
  const [settings, me, members] = await Promise.all([
    fetchSettings(),
    fetchCurrentMember(),
    fetchMembers(),
  ]);
  return <SettingsScreen initialSettings={settings} initialMe={me} initialMembers={members} />;
}
