"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

/** What every error.tsx in the app receives. `unstable_retry` replaced `reset` as the recommended
 *  recovery prop in Next 16.2: `reset` only clears the boundary's state and re-renders the same
 *  children, so a failed server read fails again immediately; `unstable_retry` re-fetches the
 *  segment first, which is what actually recovers from the transient case this button is for. */
export interface ErrorPanelProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// The fallback body shared by every route-level boundary. Deliberately does NOT print
// `error.message`: in production Next replaces a server error's message with a generic string
// anyway, so rendering it would show Hebrew copy on one machine and English boilerplate on
// another. The digest is the honest thing to show — it is the one token that ties what the
// designer is looking at to the line in the server log, so it is here to be read aloud or
// screenshotted rather than hidden.
export function ErrorPanel({
  error,
  retry,
  title = "משהו נשבר כאן",
  body = "התקלה היא אצלנו, לא בנתונים שלכם — שום דבר שנשמר לא אבד. אפשר לנסות שוב; אם זה חוזר, שלחו לנו את הקוד שלמטה.",
}: ErrorPanelProps & { title?: string; body?: string }) {
  // The browser console is the only place this reaches a developer in development, and in
  // production it is where a support call starts. Keyed on the error so a second, different
  // failure inside the same boundary is logged too.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-alert-tint bg-alert-tint">
        <TriangleAlert className="h-7 w-7 text-alert-ink" strokeWidth={1.5} />
      </div>

      <h2 className="font-display text-h2 text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>

      <button
        type="button"
        onClick={retry}
        className="mt-6 inline-flex items-center gap-2.5 rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-canvas shadow-cta transition-colors hover:bg-accent-hover"
      >
        <RotateCw className="h-4 w-4" strokeWidth={2.5} />
        נסו שוב
      </button>

      {error.digest && (
        <p className="mt-6 text-xs text-quiet">
          קוד תקלה:{" "}
          <code dir="ltr" className="nums font-label text-quiet">
            {error.digest}
          </code>
        </p>
      )}
    </div>
  );
}
