"use client";

import Link from "next/link";
import { ErrorPanel } from "@/components/error-panel";
import { Wordmark } from "@/components/wordmark";

// The outer boundary: everything that is not a studio screen — the marketing home, /login,
// /signup, /meeting, /present, /join and /client — plus any failure in the (app) layout itself,
// which throws above (app)/error.tsx and lands here.
//
// It carries its own chrome, because at this level there may be no shell and no session: a
// signed-out visitor whose /login render failed must still see something that says Eve and offers
// a way back. /present is the one that matters most — it runs on a screen with a client watching.
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 py-16">
      <Link href="/" aria-label="Eve — לדף הבית" className="mb-4">
        <Wordmark tone="solid" className="text-[34px]" />
      </Link>

      <div className="w-full max-w-md rounded-lg bg-surface px-6 shadow-floating">
        <ErrorPanel error={error} retry={unstable_retry} />
      </div>

      <Link
        href="/dashboard"
        className="mt-6 text-sm font-semibold text-ink-soft transition-colors hover:text-accent-hover"
      >
        חזרה ללוח הבקרה
      </Link>
    </main>
  );
}
