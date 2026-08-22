import Link from "next/link";
import { Compass } from "lucide-react";
import { Wordmark } from "@/components/wordmark";

// The root not-found catches two things: an explicit notFound() from any segment, and — because
// this is the ROOT one — every URL that matches no route in the app at all.
//
// It renders inside the root layout only (html/dir/fonts), NOT inside the (app) shell: an unmatched
// URL never entered that group, so there is no sidebar, no venue, and no session to draw one from.
// That is the honest thing to show — a 404 wearing the studio chrome would imply the page is a
// place in the app that failed, rather than a place that does not exist.
//
// Quiet, not a brand moment: DESIGN.md keeps the mesh for the entry surfaces, and a wrong address
// is not a moment to celebrate. White card on the bg plane, one accent, one action.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 py-16">
      <Link href="/" aria-label="Eve — לדף הבית" className="mb-8">
        <Wordmark tone="solid" className="text-[34px]" />
      </Link>

      <div className="w-full max-w-md rounded-lg bg-surface px-8 py-11 text-center shadow-floating">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-canvas">
          <Compass className="h-7 w-7 text-accent" strokeWidth={1.5} />
        </div>

        {/* Latin digits, so dir="ltr" — in an RTL paragraph "404" is fine, but on its own line it
            is a Latin string and gets the same treatment as the wordmark. */}
        <p dir="ltr" className="nums font-display text-display leading-none text-accent-wash">
          404
        </p>

        <h1 className="mt-5 font-display text-h2 text-ink">הדף הזה לא קיים</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          ייתכן שהכתובת הוקלדה חלקית, או שהיא מפנה לאירוע, למתחם או לתצוגה שנמחקו מאז. הכול השאר
          במקומו — נחזיר אתכם לסטודיו.
        </p>

        <div className="mt-7 flex items-center justify-center gap-2.5">
          {/* /dashboard and not /: whoever hit this is far more likely to be a designer mid-work
              than a first-time visitor. Signed out, the (app) layout sends them to /login on its
              own, so this one link is right in both cases. */}
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-canvas shadow-cta transition-colors hover:bg-accent-hover"
          >
            חזרה ללוח הבקרה
          </Link>
          <Link
            href="/"
            className="inline-flex items-center rounded-pill px-4 py-2.5 text-sm font-bold text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            לדף הבית
          </Link>
        </div>
      </div>
    </main>
  );
}
