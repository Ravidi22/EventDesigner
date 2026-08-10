import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { currentSession } from "@/lib/auth/session";

// Every route under (app) renders inside the persistent shell (plum sidebar + topbar).
// The marketing home (/) and the account screens sit outside the group and have no shell.
//
// THIS is the authorization check, not proxy.ts. The guard out there sees only whether a cookie is
// present; this reads the session row it names, so a cookie that was forged, revoked, or expired
// gets no further than here. Server-side, before any of the shell renders — a signed-out visitor
// never receives the studio's markup at all, which is the difference between a redirect and a
// flicker of someone else's app.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  return <AppShell user={{ name: session.name, email: session.email }}>{children}</AppShell>;
}
