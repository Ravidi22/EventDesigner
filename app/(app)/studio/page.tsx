import { EventSurface } from "@/components/event-surface";
import { StudioScreen } from "./studio-screen";

// The screen itself carries no event chrome — it is embedded bare inside the meeting flow's
// שיבוץ step, where the flow's own header already says which event this is.
export default function StudioPage() {
  return (
    <EventSurface active="studio">
      <StudioScreen />
    </EventSurface>
  );
}
