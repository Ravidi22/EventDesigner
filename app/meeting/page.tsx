import { Suspense } from "react";
import { MeetingScreen } from "./meeting-screen";
import { requireStudio } from "@/lib/auth/guard";

// Meeting mode (docs/01 §3): the guided client-facing flow. Lives outside the (app) group on
// purpose — no management sidebar, no internal data on a screen the client watches. Outside the
// shell means outside the layout that checks the session, so it checks its own.
export default async function MeetingPage() {
  await requireStudio();
  return (
    <Suspense>
      <MeetingScreen />
    </Suspense>
  );
}
