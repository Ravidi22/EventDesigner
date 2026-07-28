import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * The signature entry action: a glass pill floating on the mesh. A white disc carries the glyph
 * at the start edge, the label centres in the remaining space, and three chevrons trail at the
 * end pointing the way forward (RTL: leftward).
 *
 * Only ever placed over `.mesh` — glass over a flat surface is decoration.
 */
export function GlassCta({
  children,
  icon,
  className = "",
}: {
  children: ReactNode;
  icon: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`glass flex h-[76px] items-center rounded-pill p-[7px] transition-all hover:brightness-110 ${className}`}
    >
      <span className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full bg-canvas text-ink shadow-[0_8px_18px_-6px_rgb(40_20_80_/_0.5)]">
        {icon}
      </span>
      <span className="flex-1 text-center text-h2 font-medium text-canvas [text-shadow:0_1px_2px_rgb(40_20_70_/_0.25)]">
        {children}
      </span>
      {/* Three chevrons, each a step fainter — a direction cue, not a control. */}
      <span aria-hidden className="flex shrink-0 pe-5 text-canvas">
        <ChevronLeft className="h-5 w-5 opacity-70" strokeWidth={1.6} />
        <ChevronLeft className="-ms-2.5 h-5 w-5 opacity-45" strokeWidth={1.6} />
        <ChevronLeft className="-ms-2.5 h-5 w-5 opacity-25" strokeWidth={1.6} />
      </span>
    </span>
  );
}
