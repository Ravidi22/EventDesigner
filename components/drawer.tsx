"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseButton } from "./close-button";

/** The app's side drawer: a floating `.drawer` <dialog> with a titled header and a body that
 *  scrolls inside it.
 *
 *  It was written twice — the dashboard's event detail and the catalog's product form — and the
 *  copies drifted apart on all three things a drawer is made of:
 *
 *  - **Geometry.** One floated off the viewport edge (rounded-md, shadow-floating, like the
 *    sidebar) and the other was a flush, square-cornered panel pinned to the inline edge with a
 *    hand-rolled shadow. The floating one is the shape the app settled on, so it is the one here.
 *  - **The scrollbar.** A <dialog> scrolls itself by UA default, so a drawer whose body ALSO
 *    scrolls shows two bars side by side and the outer one drags the header out of view.
 *    `overflow-hidden` on the dialog is what keeps the scroll on the body where it belongs — it
 *    is not decoration, and it belongs to the shell rather than to whoever renders next.
 *  - **The header.** Same hairline, same padding, same close button — the version in the catalog
 *    happened to put its close button inside the form, where it is one missing `type="button"`
 *    away from submitting it.
 *
 *  Mounting it opens it, unmounting closes it (both callers render `null` while there is nothing
 *  to show), so there is no `open` prop to keep in sync with the caller's own state.
 *
 *  The children are the body and, usually, a footer: a form drawer wants both INSIDE its <form>,
 *  so this component does not own that split. `flex min-h-0 flex-1 flex-col` on whatever is
 *  passed, and an `overflow-y-auto` body inside it. */
export function Drawer({
  title,
  onClose,
  closeLabel = "סגירה",
  actions,
  children,
}: {
  title: ReactNode;
  /** Fired by Esc and by the header's close button — the caller unmounts the drawer. */
  onClose: () => void;
  closeLabel?: string;
  /** What this drawer can DO to the thing it is showing, beside the close button — in practice a
   *  `Menu`. It is a slot rather than an `items` prop because the shell has no business knowing
   *  what a delete means; it only knows where the trigger goes. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    // The left edge is pinned with a physical `left`, not a logical one: `inset-inline-start`
    // resolves to the RIGHT in this RTL app, and this drawer sits on the left by request.
    // `top`/`bottom`/`height` are inline styles for a reason too — a shown <dialog> lives in the
    // top layer, where its height does not stretch to fill top+bottom offsets on its own.
    <dialog
      ref={ref}
      onClose={onClose}
      style={{ left: "8px", right: "auto", top: "4px", bottom: "4px", height: "calc(100dvh - 8px)" }}
      className="drawer fixed m-0 w-full max-w-md overflow-hidden rounded-md bg-bg text-ink shadow-floating"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          {actions}
          <CloseButton label={closeLabel} onClick={onClose} />
        </header>
        {children}
      </div>
    </dialog>
  );
}
