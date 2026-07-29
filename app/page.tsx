import Link from "next/link";
import { ArrowLeft, Eye, Map, PackageCheck } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { GlassCta } from "@/components/glass-cta";

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
      {/* Entry surface — the mesh, grained, carrying the wordmark and the one glass action.
          This is the brand at full voice; everything below it returns to the quiet plane. */}
      <section className="mesh grain relative flex min-h-[88vh] flex-col">
        <div className="mesh-scrim" />

        <nav className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
          <Wordmark tone="on-dark" className="text-[28px]" />
          <div className="flex items-center gap-6">
            <Link href="/catalog" className="text-sm text-canvas/75 transition-colors hover:text-canvas">
              קטלוג
            </Link>
            <Link href="/login" className="text-sm font-semibold text-canvas transition-colors hover:text-gold">
              כניסה
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center px-6 py-16">
          <span
            className="hero-rise inline-flex items-center gap-3 text-sm font-semibold text-gold"
            style={{ animationDelay: "40ms" }}
          >
            <span className="hero-rule inline-block h-px w-10 bg-gold" />
            אולפן עיצוב אירועים
          </span>

          <h1 className="mt-5 font-display text-display text-canvas text-balance">
            <span className="hero-rise block" style={{ animationDelay: "80ms" }}>מהסקיצה,</span>
            <span className="hero-rise block" style={{ animationDelay: "180ms" }}>אל האירוע.</span>
          </h1>

          <p className="hero-rise mt-6 max-w-xl text-lede text-canvas/85 text-pretty" style={{ animationDelay: "300ms" }}>
            הלבישו את סקיצת האולם בקטלוג העיצוב שלכם, וקבלו שלושה מסמכי־על — הדמיה ללקוח, מפת הצבה
            לצוות ורשימת ציוד למחסן. הכול ממקור אמת אחד, שלא יכול לסתור את עצמו.
          </p>

          <Link
            href="/dashboard"
            className="hero-rise mt-10 block w-full max-w-md"
            style={{ animationDelay: "420ms" }}
          >
            <GlassCta icon={<ArrowLeft className="h-6 w-6" strokeWidth={1.7} />}>כניסה למערכת</GlassCta>
          </Link>
        </div>
      </section>

      {/* One document, three outputs */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-h1 text-ink text-balance">מסמך אחד, שלושה פלטים.</h2>
            <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
              אתם מעצבים פעם אחת על מפת האולם. מאותו מסמך המערכת מפיקה את שלושת המסמכים שהאירוע רץ עליהם —
              בלי לספור ביד, בלי שהמספרים יסטו זה מזה.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
            {outputs.map((o) => (
              <article key={o.title} className="flex flex-col gap-3 bg-surface p-7">
                <o.icon className="h-6 w-6 text-accent" strokeWidth={1.5} />
                <h3 className="font-display text-lede text-ink">{o.title}</h3>
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
