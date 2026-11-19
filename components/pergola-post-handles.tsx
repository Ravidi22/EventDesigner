"use client";

import { useEffect, useState } from "react";
import { startPointerGesture } from "@/lib/studio/gesture";
import { beamSpotAt, pergolaGeometry, pergolaOf, postSquare, postsAdded, postsMoved, postsRemoved, type PergolaPostSpot } from "@/lib/venues/pergola";
import { featureFootprint, type StructureFeature } from "@/lib/venues/structure";

// A pergola's posts PUT BY HAND (Pergola.legs === "custom", 2026-11-19, the user: "custom legs —
// none or custom"), edited on the /halls plan while the pergola is selected:
//
//   - a click on the BEAM LINE puts a post there (a finger-wide band along it, over the pergola's
//     own body so the press never starts a move of the whole thing);
//   - a post's grip DRAGS it along the beam line — round a corner onto the next side as well — and
//     a plain click picks it (the grip goes solid);
//   - a double-click on a grip, or Delete / Backspace while one is picked, takes it away; Escape lets
//     go of the pick.
//
// Everything is in the pergola's own frame (the feature's place and turn wrap it, as the canvas's
// feature group does), so the spots it writes are the geometry's own: a side and a fraction along it.
// Painted in PlanCanvas's `topmost` layer, after the walls and the figures, like the rotate knob.

export function PergolaPostHandles({
  feature: f,
  clientToMm,
  mm,
  onPosts,
  onCommit,
}: {
  feature: StructureFeature;
  clientToMm: (clientX: number, clientY: number) => { x: number; y: number };
  mm: (px: number) => number;
  /** The whole list of posts again; "drag" while a grip is held (one undo entry), "edit" otherwise. */
  onPosts: (posts: PergolaPostSpot[], during: "drag" | "edit") => void;
  /** A drag ended — closes its undo entry. */
  onCommit?: () => void;
}) {
  const spec = pergolaOf(f);
  const g = pergolaGeometry(featureFootprint(f), spec);
  const [picked, setPicked] = useState<number | null>(null);
  // A pick that no longer names a post (taken away, or the list was replaced by an undo).
  const live = picked !== null && picked < (spec.posts?.length ?? 0) ? picked : null;

  // Delete / Backspace takes the picked post away; Escape lets go of it. Capture phase, so the hall
  // editor's own Delete (which would take the whole pergola) never hears it — and never while a
  // field has the keys.
  useEffect(() => {
    if (live === null) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        onPosts(postsRemoved(spec, live), "edit");
        setPicked(null);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPicked(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [live, onPosts, spec]);

  if (!g || g.ring.length < 3) return null;
  const turn = ((f.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  /** A screen point in the pergola's own frame. */
  const local = (clientX: number, clientY: number) => {
    const p = clientToMm(clientX, clientY);
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  };
  const ring = `M ${g.ring.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
  const grip = mm(6);

  return (
    <g transform={`translate(${f.x} ${f.y})${f.rotationDeg ? ` rotate(${f.rotationDeg})` : ""}`}>
      {/* The beam line: a click puts a post on it. */}
      <path
        d={ring}
        fill="none"
        stroke="var(--color-accent)"
        strokeOpacity={0.35}
        strokeWidth={mm(14)}
        strokeLinejoin="round"
        style={{ pointerEvents: "stroke", cursor: "copy" }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const hit = beamSpotAt(g, local(e.clientX, e.clientY));
          if (!hit) return;
          onPosts(postsAdded(spec, hit.spot), "edit");
          setPicked(spec.posts?.length ?? 0);
        }}
      >
        <title>לחיצה מוסיפה עמוד על הקורה</title>
      </path>
      {g.posts.map((post) => {
        const index = post.spot;
        if (index === undefined) return null;
        const on = live === index;
        const square = postSquare(post, g.postMm);
        return (
          <g key={index}>
            <polygon points={square.map((q) => `${q.x},${q.y}`).join(" ")} fill="var(--color-accent)" fillOpacity={0.35} stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="pointer-events-none" />
            <circle
              cx={post.at.x}
              cy={post.at.y}
              r={grip}
              fill={on ? "var(--color-accent)" : "var(--color-surface)"}
              stroke="var(--color-accent)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              className="cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                startPointerGesture(e, {
                  onMove: (ev) => {
                    const hit = beamSpotAt(g, local(ev.clientX, ev.clientY));
                    if (hit) onPosts(postsMoved(spec, index, hit.spot), "drag");
                  },
                  onEnd: (_ev, moved) => {
                    if (moved) onCommit?.();
                    else setPicked(index);
                  },
                });
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onPosts(postsRemoved(spec, index), "edit");
                setPicked(null);
              }}
            >
              <title>גרירה — הזזת העמוד לאורך הקורה · לחיצה כפולה — הסרה</title>
            </circle>
          </g>
        );
      })}
    </g>
  );
}
