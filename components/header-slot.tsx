"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The app shell's top bar, lent to a page that has more to say there than a title. The event
// surfaces (/studio, /outputs) put the EVENT there — whose it is, when, and the way across — where
// they used to add a second bar of their own under the shell's: two white bands saying "סטודיו
// עיצוב" and "סטודיו" one above the other, the lower one a flat strip on a screen of floating cards.
// The meeting already does it this way (one header card: the client, the date, the way on).
const HeaderSlotContext = createContext<HTMLElement | null>(null);

export const HeaderSlotProvider = HeaderSlotContext.Provider;

/** Renders its children into the shell's top bar, in place of the page title. Nothing on the
 *  server's pass or outside the shell — the bar is the shell's node, there is no slot without it. */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const node = useContext(HeaderSlotContext);
  return node ? createPortal(children, node) : null;
}
