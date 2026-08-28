"use client";

import { useId, type ReactNode } from "react";
import { ChevronsLeft } from "lucide-react";

/** A collapsible side panel: the floating card, the "liquid glass" puck that straddles its edge,
 *  and the width transition between the two states. The app's main navigation is one
 *  (components/app-shell.tsx); the venue plan's zone panel is the other (app/(app)/halls).
 *
 *  It exists because those two were built twice, and the second copy drifted into bugs the first
 *  never had:
 *
 *  - **The puck cannot live inside a scrolling box.** It overhangs the panel's edge by 14px, and
 *    `overflow-y-auto` clips the other axis too (CSS says `overflow-x: visible` computes to `auto`
 *    the moment its partner isn't visible) — so the puck got sliced in half and the panel grew a
 *    horizontal scrollbar. Worse, `top: 50%` inside a scroller is 50% of the *content*, so on a
 *    long zone list the toggle drifted off-screen entirely. The scroll therefore goes on the
 *    content wrapper, never on the <aside> the puck is positioned against.
 *  - **Collapsing must not remount the panel.** Both states stay mounted and are shown or hidden;
 *    swapping one subtree for another restarts transitions, drops scroll position and blurs
 *    whatever field had focus.
 *  - **A panel that only collapses at `lg` must not carry the collapsed geometry below it.** The
 *    toggle is hidden on a narrow viewport, so a state entered on a wide one becomes unreachable —
 *    which is how the zone panel ended up with no padding and no way to get it back after a resize.
 *    `desktopOnly` gates the whole mechanism, geometry included, on one breakpoint. */
export function SidePanel({
  collapsed,
  onToggle,
  label,
  edge = "end",
  className = "",
  expandedClassName = "",
  collapsedClassName = "",
  toggleClassName = "top-1/2",
  desktopOnly = false,
  scrolls = false,
  rail,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** The panel's name, for the toggle's label — "כיווץ {label}" / "הרחבת {label}". */
  label: string;
  /** Which of the panel's own edges the puck straddles. "end" for a panel everything else sits
   *  after (the main nav); "start" for one tucked against the far side of the screen. */
  edge?: "start" | "end";
  /** Shell classes that hold in both states — background, radius, shadow, height, grid placement.
   *  Padding belongs here too when `desktopOnly`, so the narrow viewport keeps it. */
  className?: string;
  expandedClassName?: string;
  collapsedClassName?: string;
  /** Where the puck sits vertically. The default centres it on this panel; override when it has to
   *  line up with another panel that sits under a different amount of chrome. */
  toggleClassName?: string;
  /** Collapse only from `lg` up. Below it the panel is a plain stacked block: no puck, no rail,
   *  and `collapsedClassName` must not apply — so gate every class in it with `lg:`. */
  desktopOnly?: boolean;
  /** Scroll the content instead of the page. Deliberately not on the <aside> — see above. */
  scrolls?: boolean;
  /** What stands in for the content while collapsed, so the panel still says what it holds instead
   *  of going blank. Given one, the content is hidden when collapsed; without one, the content is
   *  expected to read `collapsed` itself (the main nav's rows do). */
  rail?: ReactNode;
  children: ReactNode;
}) {
  const contentId = useId();
  // The chevron points the way the panel would move. On the trailing edge that's outward once
  // collapsed; on the leading edge it's the mirror image, so the same icon serves both.
  const flip = edge === "end" ? collapsed : !collapsed;
  // A rail stands in for the content, so it takes the content's place rather than sitting above it.
  const railReplaces = rail !== undefined && collapsed;

  return (
    <aside
      className={
        "group/panel relative flex flex-col transition-[width] duration-200 ease-fluid " +
        className +
        " " +
        (collapsed ? collapsedClassName : expandedClassName)
      }
    >
      {/* Subtly visible at rest rather than opacity-0: a hover-only reveal meant clicks could miss
          it whenever the hover state wasn't active at that exact moment (no persistent hover on
          touch or trackpad), which reads as "the button doesn't work". */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? `הרחבת ${label}` : `כיווץ ${label}`}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        style={edge === "end" ? { insetInlineEnd: "-14px" } : { insetInlineStart: "-14px" }}
        className={
          "absolute z-30 h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white/50 text-ink-soft opacity-40 shadow-floating backdrop-blur-md transition-all duration-150 hover:bg-white/80 hover:text-accent hover:opacity-100 focus-visible:opacity-100 group-hover/panel:opacity-100 " +
          toggleClassName +
          " " +
          (desktopOnly ? "hidden lg:flex" : "flex")
        }
      >
        <ChevronsLeft
          className={"h-4 w-4 transition-transform duration-200 " + (flip ? "rotate-180" : "")}
          strokeWidth={2}
        />
      </button>

      <div id={contentId} className="flex min-h-0 flex-1 flex-col">
        {rail ? (
          <div
            className={
              "min-h-0 flex-1 flex-col " +
              (collapsed ? (desktopOnly ? "hidden lg:flex" : "flex") : "hidden")
            }
          >
            {rail}
          </div>
        ) : null}

        {/* `hidden` and `flex` are both display utilities, so only ever one of them is emitted —
            relying on their order in the stylesheet to settle a tie is how a panel ends up visible
            in one build and gone in the next. */}
        <div
          className={
            (railReplaces && !desktopOnly ? "hidden " : "flex ") +
            "min-h-0 flex-1 flex-col " +
            (scrolls ? "overflow-y-auto " : "") +
            (railReplaces && desktopOnly ? "lg:hidden" : "")
          }
        >
          {children}
        </div>
      </div>
    </aside>
  );
}
