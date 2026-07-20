import Link from "next/link";
import { ArrowLeft, Eye, Map, PackageCheck } from "lucide-react";

const outputs = [
  {
    icon: Eye,
    title: "הדמיה ללקוח",
    body: "מציגים לבעלי האירוע את האולם שלהם, מולבש במלואו, עוד לפני שהוזמן פריט אחד.",
  },
  {
    icon: Map,
    title: "מפת הצבה לצוות",
    body: "הצוות מקבל מפה חד־משמעית — איזה עיצוב על איזה שולחן — קריאה גם בהדפסה שחור־לבן.",
  },
  {
    icon: PackageCheck,
    title: "רשימת ציוד למחסן",
    body: "כל פריט נספר אוטומטית מתוך העיצוב. הספירה לא יכולה לסטות ממה ששורטט.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl text-ink">iDesign</span>
        <div className="flex items-center gap-6">
          <Link href="/catalog" className="text-sm text-muted transition-colors hover:text-ink">
            קטלוג
          </Link>
          <Link href="/login" className="text-sm font-medium text-ink transition-colors hover:text-accent">
            כניסה
          </Link>
        </div>
      </nav>

      {/* Editorial light hero — luxury through space + serif, one held-back accent. */}
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center px-6 py-20 sm:py-28">
        <span className="hero-rise inline-flex items-center gap-3 text-sm font-medium text-accent" style={{ animationDelay: "40ms" }}>
          <span className="hero-rule inline-block h-px w-10 bg-accent" />
          אולפן עיצוב אירועים
        </span>

        <h1 className="mt-6 font-display text-[clamp(2.75rem,7vw,5rem)] leading-[1.05] text-ink text-balance">
          <span className="hero-rise block" style={{ animationDelay: "80ms" }}>מהסקיצה,</span>
          <span className="hero-rise block" style={{ animationDelay: "180ms" }}>אל האירוע.</span>
        </h1>

        <p className="hero-rise mt-6 max-w-xl text-lg leading-relaxed text-ink-soft text-pretty" style={{ animationDelay: "300ms" }}>
          הלבישו את סקיצת האולם בקטלוג העיצוב שלכם, וקבלו שלושה מסמכי־על — הדמיה ללקוח, מפת הצבה
          לצוות ורשימת ציוד למחסן. הכול ממקור אמת אחד, שלא יכול לסתור את עצמו.
        </p>

        <div className="hero-rise mt-8 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ animationDelay: "420ms" }}>
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-accent-hover"
          >
            כניסה למערכת
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.5} />
          </Link>
          <Link href="/catalog" className="text-sm font-medium text-ink transition-colors hover:text-accent">
            עיון בקטלוג
          </Link>
        </div>
      </section>

      {/* One document, three outputs */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl text-ink text-balance">מסמך אחד, שלושה פלטים.</h2>
            <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
              אתם מעצבים פעם אחת על מפת האולם. מאותו מסמך המערכת מפיקה את שלושת המסמכים שהאירוע רץ עליהם —
              בלי לספור ביד, בלי שהמספרים יסטו זה מזה.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
            {outputs.map((o) => (
              <article key={o.title} className="flex flex-col gap-3 bg-surface p-7">
                <o.icon className="h-6 w-6 text-accent" strokeWidth={1.5} />
                <h3 className="font-display text-xl text-ink">{o.title}</h3>
                <p className="text-sm leading-relaxed text-ink-soft text-pretty">{o.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 text-sm text-muted">
          <span>עיצוב אירועים, ממקור אמת אחד.</span>
          <Link href="/login" className="transition-colors hover:text-ink">כניסה</Link>
        </div>
      </footer>
    </main>
  );
}
