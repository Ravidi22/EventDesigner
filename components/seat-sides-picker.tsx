"use client";

import type { KeyboardEvent } from "react";
import { footprintBounds, type Footprint } from "@/lib/studio/footprint";
import { seatSides, seatsAround, CHAIR_BACK_MM, CHAIR_D_MM, CHAIR_OFFSET_MM, CHAIR_W_MM, type Seat } from "@/lib/studio/seating";
import { FootprintShape } from "@/components/footprint-shape";

// Which sides of a table somebody sits at, picked on a drawing of the table itself.
//
// A list of "צד 1, צד 2…" would be correct and useless: nobody knows which side of a ring is its
// second one. So the table is drawn with its chairs, every side is its own target, and clicking a
// side blocks it — the chairs move off it in the same breath, which is the whole explanation.
//
// Shared by the catalog (what a table of this kind does, MapAppearance.blockedSides) and the studio
// inspector (what THIS table does, DesignTable.blockedSides), so both draw the sides the seating
// will actually use: seatSides() is the index both of them store.

const PAD_MM = CHAIR_OFFSET_MM + CHAIR_D_MM / 2 + 120;

export function SeatSidesPicker({
  footprint,
  seats,
  blocked,
  onToggle,
  rotation = 0,
  mirrored = false,
  className = "",
}: {
  footprint: Footprint;
  /** How many chairs to draw — the item's seat count. Zero still lets the sides be picked. */
  seats: number;
  blocked: readonly number[];
  onToggle: (side: number) => void;
  /** Draw the table turned the way it stands on the plan, so "the side facing the stage" is the
   *  side that faces the stage here too. */
  rotation?: number;
  /** …and flipped, when it is drawn flipped (DesignTable.mirrored) — or the side clicked here would
   *  be the mirror image of the side that closes on the plan. */
  mirrored?: boolean;
  className?: string;
}) {
  const sides = seatSides(footprint);
  const chairs = seatsAround(footprint, seats, undefined, blocked);
  const b = footprintBounds(footprint);
  // Wide enough for the table turned any way — its diagonal — so a rotation never crops it.
  const r = Math.hypot(b.w, b.h) / 2 + PAD_MM;
  const extent = rotation ? { w: r * 2, h: r * 2 } : { w: b.w + PAD_MM * 2, h: b.h + PAD_MM * 2 };

  const key = (i: number) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle(i);
    }
  };

  return (
    <svg
      viewBox={`${-extent.w / 2} ${-extent.h / 2} ${extent.w} ${extent.h}`}
      className={"select-none " + className}
      role="group"
      aria-label="צדדי השולחן — לחיצה על צד חוסמת אותו לישיבה או פותחת אותו"
    >
      <g transform={[rotation ? `rotate(${rotation})` : "", mirrored ? "scale(-1 1)" : ""].filter(Boolean).join(" ") || undefined}>
        <SeatChairs seats={chairs} />
        <FootprintShape
          footprint={footprint}
          fill="var(--color-surface)"
          stroke="var(--color-ink-soft)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {sides.map((side, i) => {
          if (side.covered || side.len <= 0) return null;
          const d = "M " + side.pts.map((p) => `${p.x} ${p.y}`).join(" L ");
          const off = blocked.includes(i);
          return (
            <g
              key={i}
              role="switch"
              aria-checked={!off}
              aria-label={`צד ${i + 1} — ${off ? "חסום לישיבה" : "פתוח לישיבה"}`}
              tabIndex={0}
              onClick={() => onToggle(i)}
              onKeyDown={key(i)}
              className="group cursor-pointer focus:outline-none"
            >
              {/* The target: far wider than the line it stands for, so a 60cm cap is clickable. */}
              <path d={d} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <path
                d={d}
                fill="none"
                strokeWidth={off ? 3.5 : 3}
                strokeLinecap="round"
                strokeDasharray={off ? "5 4" : undefined}
                vectorEffect="non-scaling-stroke"
                className={
                  off
                    ? "stroke-alert"
                    : "stroke-transparent group-hover:stroke-accent group-focus-visible:stroke-accent"
                }
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** A ring of chairs as the plan draws them — seat and backrest, in the table's own frame. */
export function SeatChairs({ seats }: { seats: Seat[] }) {
  return (
    <>
      {seats.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.facingDeg})`}>
          <rect
            x={-CHAIR_D_MM / 2}
            y={-CHAIR_W_MM / 2}
            width={CHAIR_D_MM}
            height={CHAIR_W_MM}
            rx={95}
            fill="var(--color-surface)"
            stroke="var(--color-muted)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={-CHAIR_D_MM / 2}
            y={-CHAIR_W_MM / 2}
            width={CHAIR_BACK_MM}
            height={CHAIR_W_MM}
            rx={CHAIR_BACK_MM / 2}
            fill="var(--color-muted)"
            fillOpacity={0.45}
          />
        </g>
      ))}
    </>
  );
}
