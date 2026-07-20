import { AppShell } from "@/components/app-shell";

// Every route under (app) renders inside the persistent shell (plum sidebar + topbar).
// The marketing home (/) and /login sit outside the group and have no shell.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
