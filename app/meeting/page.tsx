import { Suspense } from "react";
import { MeetingScreen } from "./meeting-screen";

// Meeting mode (docs/01 §3): the guided client-facing flow. Lives outside the (app) group on
// purpose — no management sidebar, no internal data on a screen the client watches.
export default function MeetingPage() {
  return (
    <Suspense>
      <MeetingScreen />
    </Suspense>
  );
}
