"use client";
// The end panel holds still while something is dragged on the canvas (the final review of the shell,
// 2026-11-10; CLAUDE.md "The camera is a transform": a drag frame re-renders the thing being dragged
// and nothing else). A drag amends the document every frame, so StudioScreen renders every frame —
// and every open group in the panel went with it: a table's ״ישיבה״ group re-ran `seatsAround` in
// its SeatSidesPicker sixty times a second for a picture that cannot change mid-drag.
//
// A memo boundary that refuses every render while a press that began in the canvas column is moving
// (`useDragIn`, ./use-settled.ts) and takes the latest panel the moment the button lifts. The press
// itself is not held — a click that selects shows its groups at once; only the moves after it are.
import { memo, type ReactNode, type RefObject } from "react";
import { useDragIn } from "./use-settled";

const Held = memo(
  function Held({ children }: { children: ReactNode; hold: boolean }) {
    return <>{children}</>;
  },
  // While held, every new panel is skipped (the one before the drag stays up); let go, it renders.
  (_, next) => next.hold,
);

export function HoldWhileDragging({ area, children }: { area: RefObject<HTMLElement | null>; children: ReactNode }) {
  const hold = useDragIn(area);
  return <Held hold={hold}>{children}</Held>;
}
