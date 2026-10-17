import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarRange,
  Check,
  ChevronDown,
  Mail,
  PackageCheck,
  Palette,
  PartyPopper,
  Presentation,
  ReceiptText,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { GlassCta } from "@/components/glass-cta";
import { CatalogItems, HallPlan, TableDetail } from "@/components/landing-plan";
import type { AccountKind } from "@/lib/auth/kinds";

// The header's links stay on this page: each one is a section below, reached by its id.
const SECTIONS = [
  { id: "audience", label: "למי זה מתאים" },
  { id: "features", label: "מה בפלטפורמה" },
  { id: "pricing", label: "מחירון" },
  { id: "faq", label: "שאלות נפוצות" },
];

/** A real screenshot of the studio, under /public (e.g. "/landing/studio.png"). Until one is
 *  there, the hero shows a hall drawn by the studio's own drawing code (components/landing-plan). */
const HERO_SHOT: string | null = null;

// A client does not sign up on their own: they come in through their designer's invitation, which
// is what attaches them to their event (event_clients). An open sign-up would land them on an
// empty portal. So the client card carries no sign-up button, only how they get in.
const AUDIENCES: Record<AccountKind, { icon: LucideIcon; title: string; body: string; points: string[]; cta?: string }> = {
  studio: {
    icon: Palette,
    title: "מעצבי אירועים וספקים",
    body: "הסטודיו שלכם במקום אחד: הקטלוג, המתחמים והאירועים, מהפגישה הראשונה עם הלקוח ועד שהצוות פורק את המשאית.",
    points: [
      "משרטטים את האולם פעם אחת, במידות אמת",
      "הצעת מחיר, מפת הצבה ורשימת ציוד מאותו שרטוט",
      "צוות עם הרשאות, לפי תפקיד ולפי מתחם",
    ],
    cta: "הרשמה לספקים ומעצבים",
  },
  client: {
    icon: PartyPopper,
    title: "בעלי אירוע",
    body: "יש לכם אירוע קרוב? המעצב שלכם שולח לכם הזמנה אישית, ומשם רואים את הסקיצה והתוכנית שהוא הכין לכם.",
    points: [
      "האולם שלכם, מולבש, עוד לפני שהוזמן פריט אחד",
      "מסמנים מה אהבתם בגלריית ההשראה",
      "כל מה שסוכם עם המעצב, במקום אחד",
    ],
  },
};

// What the three drawn tiles do not already show.
const MORE_FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ReceiptText,
    title: "הצעת מחיר מהשרטוט",
    body: "ההצעה נגזרת ממה שצויר. משנים את העיצוב, והמספרים מתעדכנים איתו.",
  },
  {
    icon: PackageCheck,
    title: "רשימת ציוד ורכש",
    body: "כל פריט נספר מתוך העיצוב, וההזמנות לספקים נגזרות ממנו.",
  },
  {
    icon: CalendarRange,
    title: "לוח הפקה",
    body: "כל אירוע מתוכנן לאחור מהתאריך שלו, ואירועים שמתנגשים נראים מראש.",
  },
  {
    icon: Presentation,
    title: "מצגת ללקוח",
    body: "מציגים לבעלי האירוע את האולם שלהם, בלי עלויות, מלאי או נתונים פנימיים.",
  },
  {
    icon: CalendarCheck,
    title: "יומן פגישות",
    body: "פגישות הלקוחות ביומן אחד, מסונכרנות ל־Google Calendar של כל חבר צוות.",
  },
];

// ⚠ The split into plans and what each includes is a draft, and no price is set yet — the rows
// say so rather than show a number nobody decided on.
const PLANS: { name: string; who: string; includes: string }[] = [
  {
    name: "סטודיו",
    who: "למעצב או לספק עצמאי",
    includes: "סקיצות, קטלוג והצעות מחיר, סט הפקה מלא להדפסה, רשימת ציוד, רכש ולוח הפקה.",
  },
  {
    name: "סטודיו וצוות",
    who: "לסטודיו עם כמה אנשי צוות ומתחמים",
    includes: "כל מה שבמסלול סטודיו, ועוד חברי צוות עם תפקידים והרשאות נפרדות לכל מתחם.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "צריך להתקין משהו?",
    a: "לא. Eve עובדת בדפדפן. את העריכה נוח לעשות ממחשב, והצפייה וההפקות זמינות גם מטאבלט בשטח.",
  },
  {
    q: "אפשר לעבוד עם הקטלוג שלי?",
    a: "כן. מעלים את הפריטים שלכם עם הגוונים, המלאי והמחירים, והם אלה שמוצבים על הסקיצה. ספריית שולחנות בסיסית מותקנת בחשבון כבר בהרשמה, והיא שלכם לעריכה.",
  },
  {
    q: "איך בעלי אירוע נכנסים?",
    a: "בהזמנה מהמעצב. המעצב שולח קישור אישי לאירוע, בעלי האירוע יוצרים חשבון דרכו ורואים את הסקיצה והתוכנית שלהם.",
  },
  {
    q: "מה הלקוח שלי רואה?",
    a: "את העיצוב בלבד. מחירי עלות, מלאי ונתונים פנימיים של הסטודיו לא מוצגים במצגת או באזור הלקוח.",
  },
  {
    q: "אפשר לצרף אנשי צוות?",
    a: "כן. לכל חבר צוות יש תפקיד, וההרשאה למתחמים ניתנת לכל אחד בנפרד. מי שלא קיבל גישה למתחם לא רואה אותו.",
  },
  {
    q: "המפות קריאות בהדפסה?",
    a: "כן. מפת ההצבה ורשימת הציוד בנויות להדפסה בשחור־לבן: ההבחנות נשענות על צורה, משקל וכיתוב, לא על צבע.",
  },
  {
    q: "זה מתחבר ליומן Google?",
    a: "כן. הפגישות נכתבות ליומן ייעודי בחשבון Google שלכם, והאירועים מהיומנים שלכם מופיעים ב־Eve כזמן תפוס.",
  },
];

const primaryCta =
  "press grad-cta inline-flex h-[58px] items-center justify-center rounded-pill px-8 text-[15px] font-bold whitespace-nowrap text-canvas shadow-cta hover:brightness-110";
const outlineCta =
  "press inline-flex h-11 items-center justify-center rounded-pill border-[1.5px] border-accent-line px-5 text-sm font-bold whitespace-nowrap text-accent hover:bg-accent-tint";

const rise = (ms: number) => ({ animationDelay: `calc(var(--intro, 0ms) + ${ms}ms)` });

export default function Home() {
  return (
    <main className="landing flex min-h-dvh flex-col bg-bg">
      {/* The opening plate (see .intro in globals.css). suppressHydrationWarning: the script right
          after it may have marked it data-seen before React arrives. */}
      <div className="intro" aria-hidden suppressHydrationWarning>
        <span dir="ltr" className="wordmark text-[88px] text-accent">
          {["E", "v", "e"].map((letter, i) => (
            <span key={i} className="intro-letter" style={{ animationDelay: `${120 + i * 110}ms` }}>
              {letter}
            </span>
          ))}
          <span className="intro-dot text-indigo-500">.</span>
        </span>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var i=document.querySelector('.intro');if(sessionStorage.getItem('eve-intro'))i.setAttribute('data-seen','');else sessionStorage.setItem('eve-intro','1')}catch(e){}",
        }}
      />

      <header className="sticky top-0 z-40 border-b border-border bg-canvas">
        <div className="mx-auto flex h-[68px] w-full max-w-6xl items-center gap-3 px-4 sm:px-6 md:gap-6">
          <a href="#top" aria-label="Eve, לראש הדף" className="shrink-0">
            <Wordmark tone="solid" className="text-[28px]" />
          </a>
          <nav aria-label="בדף זה" className="hidden items-center gap-1 md:flex">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-pill px-3 py-2 text-sm font-semibold whitespace-nowrap text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <Link
              href="/login"
              className="press inline-flex h-10 items-center rounded-pill border-[1.5px] border-accent-line px-4 text-sm font-bold whitespace-nowrap text-accent hover:bg-accent-tint"
            >
              כניסה למערכת
            </Link>
            <Link
              href="/signup"
              className="press grad-cta inline-flex h-10 items-center rounded-pill px-5 text-sm font-bold whitespace-nowrap text-canvas shadow-cta hover:brightness-110"
            >
              הרשמה
            </Link>
          </div>
        </div>
      </header>

      {/* Entry surface — the mesh, grained: the one place on the page the brand is at full voice.
          The copy stands on the dark core at the start side; the plan opens into the light. */}
      <section id="top" className="mesh grain relative scroll-mt-[68px]">
        <div className="mesh-scrim" />
        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-12 lg:py-20">
          <div className="flex flex-col items-start">
            <span className="hero-rise inline-flex items-center gap-3 text-sm font-semibold text-gold" style={rise(40)}>
              <span className="hero-rule inline-block h-px w-10 bg-gold" style={rise(40)} />
              אולפן עיצוב אירועים
            </span>

            <h1 className="mt-5 font-display text-display text-canvas text-balance">
              <span className="hero-rise block" style={rise(80)}>מהסקיצה,</span>
              <span className="hero-rise block" style={rise(180)}>אל האירוע.</span>
            </h1>

            <p className="hero-rise mt-6 max-w-md text-lede text-canvas/90 text-pretty" style={rise(300)}>
              מעצבים את האולם פעם אחת, והצעת המחיר, מפת ההצבה ורשימת הציוד נגזרות מאותו שרטוט. בלי לספור ביד.
            </p>

            <Link href="/signup" className="hero-rise press mt-9 block w-full max-w-md rounded-pill" style={rise(420)}>
              <GlassCta icon={<UserPlus className="h-6 w-6" strokeWidth={1.7} />}>הרשמה למערכת</GlassCta>
            </Link>
          </div>

          <figure className="hero-rise" style={rise(340)}>
            <div className="overflow-hidden rounded-lg bg-canvas shadow-dialog">
              {HERO_SHOT ? (
                <Image
                  src={HERO_SHOT}
                  alt="מסך הסקיצה של Eve: אולם עם שולחנות, במה ועיצוב"
                  width={1600}
                  height={1000}
                  priority
                  className="block h-auto w-full"
                />
              ) : (
                <HallPlan className="block h-auto w-full p-3 sm:p-5" />
              )}
            </div>
            {!HERO_SHOT && (
              <figcaption className="mt-3 text-caption text-canvas/85">
                אולם של 220 מקומות, משורטט באותו קוד שמצייר את הסקיצה בסטודיו.
              </figcaption>
            )}
          </figure>
        </div>
      </section>

      {/* Two doors, weighted as the product is: the studio's is the wide one. */}
      <section id="audience" className="scroll-mt-[68px]">
        <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
          <SectionHead title="למי זה מתאים" body="שני סוגי חשבון, כניסה אחת. כל אחד רואה את מה ששלו." />
          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Audience kind="studio" className="border border-border bg-surface" />
            <Audience kind="client" className="border border-badge-line bg-accent-tint" />
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-[68px] border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
          <SectionHead
            title="מה מחכה לכם בפלטפורמה"
            body="מעצבים פעם אחת על מפת האולם. מאותו מסמך המערכת מפיקה את כל מה שהאירוע רץ עליו."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-12">
            <article className="grid items-center gap-6 rounded-lg border border-border bg-inset p-6 sm:grid-cols-2 sm:p-8 lg:col-span-7">
              <div>
                <h3 className="font-display text-h2 text-ink">סקיצה חיה של האולם</h3>
                <p className="mt-2 leading-relaxed text-ink-soft text-pretty">
                  משרטטים את המתחם במידות אמת ומציבים עליו שולחנות, במות ועיצוב. כל שולחן מולבש: מפה, כיסאות, פרחים ופמוטים, כל אחד במקום שלו.
                </p>
              </div>
              <TableDetail className="mx-auto block h-auto w-full max-w-[280px]" />
            </article>

            <article className="flex flex-col justify-between gap-8 rounded-lg border border-badge-line bg-accent-tint p-6 sm:p-8 lg:col-span-5">
              <div>
                <h3 className="font-display text-h2 text-accent-deep">הקטלוג שלכם</h3>
                <p className="mt-2 leading-relaxed text-ink-soft text-pretty">
                  כל פריט עם הגוונים, המלאי והמחיר שלו, ומצויר על התוכנית כמו שהוא נראה מלמעלה.
                </p>
              </div>
              <CatalogItems className="block h-auto w-full" />
            </article>

            <article className="grid items-center gap-6 rounded-lg border border-ink/15 bg-canvas p-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:p-8 lg:col-span-5 lg:grid-cols-1">
              <TableDetail print className="mx-auto block h-auto w-full max-w-[200px]" />
              <div>
                <h3 className="font-display text-h2 text-ink">סט הפקה להדפסה</h3>
                <p className="mt-2 leading-relaxed text-ink-soft text-pretty">
                  מפת הצבה לכל אזור, תוכנית במה ופירוט שולחנות. כל שולחן נושא מספר ואות עיצוב, וקריא גם בשחור־לבן.
                </p>
              </div>
            </article>

            <ul className="grid content-center gap-x-10 gap-y-7 px-2 py-4 sm:grid-cols-2 lg:col-span-7 lg:px-6">
              {MORE_FEATURES.map((f) => (
                <li key={f.title} className="flex items-start gap-3.5">
                  <f.icon className="mt-1 h-5 w-5 shrink-0 text-accent" strokeWidth={1.5} />
                  <div>
                    <h3 className="font-display text-lede font-bold text-ink">{f.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft text-pretty">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-[68px] border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
          <SectionHead title="מחירון" body="המסלולים הם של הסטודיו. בעלי אירוע נכנסים בהזמנת המעצב. המחירים יפורסמו בקרוב, וההרשמה פתוחה כבר עכשיו." />
          <div className="mt-10 divide-y divide-border rounded-lg border border-border bg-surface">
            {PLANS.map((p) => (
              <article
                key={p.name}
                className="grid items-center gap-x-8 gap-y-3 px-6 py-6 sm:px-8 md:grid-cols-[minmax(0,3fr)_minmax(0,6fr)_auto]"
              >
                <div>
                  <h3 className="font-display text-h2 text-ink">{p.name}</h3>
                  <p className="mt-0.5 text-sm text-muted">{p.who}</p>
                </div>
                <p className="leading-relaxed text-ink-soft text-pretty">{p.includes}</p>
                <Link href="/signup" className={`${outlineCta} justify-self-start md:justify-self-end`}>
                  הרשמה
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-[68px] border-t border-border bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-20 pb-16 sm:px-6 sm:pt-24 sm:pb-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <SectionHead title="שאלות נפוצות" className="lg:sticky lg:top-28 lg:self-start" />
          <div className="flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-md border border-border bg-inset open:bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md px-5 py-4 font-display text-lede font-bold text-ink transition-colors hover:text-accent group-open:text-accent [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 group-open:text-accent"
                    strokeWidth={1.6}
                  />
                </summary>
                <p className="max-w-[68ch] px-5 pb-5 leading-relaxed text-ink-soft text-pretty">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* The mesh again, hushed: no dark core, dark ink — the brand closing the page without a
          second saturated surface. */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mesh-soft grain rounded-lg border border-badge-line">
            <div className="relative z-10 flex flex-col items-center px-6 py-14 text-center sm:py-16">
              <h2 className="font-display text-h1 text-accent-deep text-balance">האירוע הבא שלכם מתחיל בסקיצה אחת.</h2>
              <p className="mt-3 max-w-xl leading-relaxed text-ink-soft text-pretty">
                פותחים חשבון, משרטטים את האולם, והמסמכים כבר נגזרים ממנו.
              </p>
              <Link href="/signup" className={`${primaryCta} mt-8`}>
                הרשמה למערכת
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-canvas">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-ink-soft sm:px-6">
          <span>עיצוב אירועים, ממקור אמת אחד.</span>
          <nav aria-label="תחתית הדף" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="transition-colors hover:text-accent">
                {s.label}
              </a>
            ))}
            <Link href="/login" className="transition-colors hover:text-accent">
              כניסה
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function SectionHead({ title, body, className = "" }: { title: string; body?: string; className?: string }) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <h2 className="font-display text-h1 text-ink text-balance">{title}</h2>
      {body && <p className="mt-3 leading-relaxed text-ink-soft text-pretty">{body}</p>}
    </div>
  );
}

function Audience({ kind, className }: { kind: AccountKind; className: string }) {
  const a = AUDIENCES[kind];
  return (
    <article className={`flex flex-col rounded-lg p-6 sm:p-8 ${className}`}>
      <div className="flex items-center gap-3">
        <a.icon className="h-6 w-6 shrink-0 text-accent" strokeWidth={1.4} />
        <h3 className="font-display text-h2 text-ink">{a.title}</h3>
      </div>
      <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-soft text-pretty">{a.body}</p>
      <ul className="mt-6 flex flex-1 flex-col gap-2.5">
        {a.points.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-ink-soft">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
            {item}
          </li>
        ))}
      </ul>
      {a.cta ? (
        <Link href="/signup" className={`${outlineCta} mt-8 self-start`}>
          {a.cta}
        </Link>
      ) : (
        <p className="mt-8 flex items-center gap-2.5 text-sm font-semibold text-accent-deep">
          <Mail className="h-[18px] w-[18px] shrink-0 text-accent" strokeWidth={1.5} />
          הכניסה בהזמנה מהמעצב שלכם
        </p>
      )}
    </article>
  );
}
