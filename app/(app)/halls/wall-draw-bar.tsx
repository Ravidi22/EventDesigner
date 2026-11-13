"use client";

import { PenLine } from "lucide-react";
import { Bar } from "@/components/inspector-bar";
import { Button } from "@/components/button";
import { SegmentedToggle } from "@/components/plan-canvas";
import type { WallKind } from "@/lib/venues/structure";

// The quick bar while walls are being drawn (2026-11-09, the "Studio + Halls" board: "while drawing,
// the quick bar becomes the drawing bar — options · ביטול · סיום"). קיר / גבול שטח was a toggle in
// the toolbar that only appeared while drawing; it belongs to the tool in use, so it lives here.
export function WallDrawBar({
  kind,
  onKind,
  running,
  onCancel,
  onFinish,
}: {
  kind: WallKind;
  onKind: (kind: WallKind) => void;
  /** A run of walls is under way — ביטול ends it (Esc does the same), and is idle otherwise. */
  running: boolean;
  /** Ends the run in progress and keeps drawing (the next click starts a new run). */
  onCancel: () => void;
  /** Ends the run and leaves drawing — back to selecting. */
  onFinish: () => void;
}) {
  return (
    <Bar icon={PenLine} title="שרטוט קיר" facts="לחיצה לכל פינה · Enter מסיים קטע">
      <SegmentedToggle
        value={kind}
        options={[
          { value: "wall" as WallKind, label: "קיר" },
          { value: "edge" as WallKind, label: "גבול שטח" },
        ]}
        onChange={onKind}
        ariaLabel="מה משרטטים"
      />
      <div className="min-w-12 flex-1" />
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={!running}>
        ביטול
      </Button>
      <Button size="sm" onClick={onFinish}>
        סיום
      </Button>
    </Bar>
  );
}
