// The one layout of the three legal documents (EVE-8/9/10) — Claude Design "Eve — דפים משפטיים
// וניגודיות", boards א1–א5, approved by Ravid 2026-11-27. A document, not a brand moment: no mesh, the
// landing's own header and footer, a white reading sheet on the lavender plane, the table of contents
// on the start side. While LEGAL_STATUS is "draft" the page carries the notice, is `noindex`, and draws
// owed facts as placeholders and the lawyer's questions as notes (docs/legal/README.md).
import type { Metadata } from "next";
import Link from "next/link";
import { Accessibility, FilePenLine, MessageSquareWarning, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { docBySlug, LEGAL_DOCS } from "@/lib/legal/documents";
import { LEGAL_FACTS } from "@/lib/legal/facts";
import { LEGAL_VERSION, legalPublished } from "@/lib/legal/status";
import type { LegalBlock, LegalContact, LegalSlug } from "@/lib/legal/types";
import { LegalText } from "./legal-text";
import { LegalToc, LegalTocMobile } from "./legal-toc";

export function legalMetadata(slug: LegalSlug): Metadata {
  const doc = docBySlug(slug);
  return {
    title: `${doc.title} · Eve`,
    description: doc.summary,
    // A draft is reachable by its address and by nothing else: no search engine may list it.
    robots: legalPublished() ? undefined : { index: false, follow: false },
  };
}

const CONTACT_ICON: Record<LegalSlug, typeof ShieldCheck> = {
  privacy: ShieldCheck,
  terms: ShieldCheck,
  accessibility: Accessibility,
};

export function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = docBySlug(slug);
  const draft = !legalPublished();
  const [lede, ...intro] = doc.intro;
  const entries = doc.sections.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <PublicHeader />

      {draft && (
        <div role="note" className="border-b border-border bg-warn-tint">
          <div className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-3 text-body text-warn-ink min-[901px]:px-6">
            <FilePenLine aria-hidden className="mt-[3px] h-5 w-5 shrink-0" strokeWidth={1.75} />
            <p>
              <strong className="font-bold">טיוטה</strong> — ממתינה לבדיקה משפטית. הנוסח אינו מחייב עד לפרסומו.
            </p>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-12 min-[901px]:px-6 min-[901px]:pt-10 min-[901px]:pb-20">
        <div className="grid grid-cols-1 items-start min-[901px]:grid-cols-[248px_minmax(0,calc(68ch+130px))] min-[901px]:gap-12">
          <LegalToc entries={entries} slug={slug} />

          <article className="min-w-0 rounded-lg border border-border bg-surface px-5 pt-7 pb-8 min-[901px]:px-16 min-[901px]:pt-14 min-[901px]:pb-16">
            <div className="max-w-[68ch] text-body text-ink-soft">
              <h1 className="font-display text-h1 text-ink">{doc.title}</h1>
              <p className="mt-3 text-caption text-ink-soft">
                עודכן לאחרונה: <LegalText text="{{effectiveDate}}" /> · גרסה <bdi dir="ltr">{LEGAL_VERSION}</bdi>
              </p>

              <LegalTocMobile entries={entries} />

              {lede !== undefined && (
                <div className="mt-6 text-lede text-pretty text-ink-soft">
                  <Block block={lede} slug={slug} />
                </div>
              )}
              {intro.map((b, i) => (
                <div key={i} className="mt-3">
                  <Block block={b} slug={slug} />
                </div>
              ))}
              <hr className="mt-8 h-px border-0 bg-border-soft" />

              {doc.sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-[92px]">
                  <h2 className="mt-10 mb-3 font-display text-h2 text-ink">
                    {i + 1}. {s.title}
                  </h2>
                  {s.blocks.map((b, j) => (
                    <Block key={j} block={b} slug={slug} />
                  ))}
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>

      <PublicFooter current={slug} />
    </div>
  );
}

function Block({ block, slug }: { block: LegalBlock; slug: LegalSlug }) {
  if (typeof block === "string")
    return (
      <p className="mb-3 text-pretty">
        <LegalText text={block} />
      </p>
    );
  if ("list" in block)
    return (
      <ul className="mb-3 list-disc ps-[22px] marker:text-faint">
        {block.list.map((item, i) => (
          <li key={i} className="mb-1.5 ps-0.5">
            <LegalText text={item} />
          </li>
        ))}
      </ul>
    );
  if ("contact" in block) return <ContactCard contact={block.contact} slug={slug} />;
  // A question for the lawyer — shown only on a draft; publishing is refused while one is left.
  if (legalPublished()) return null;
  return (
    <p className="mb-3 flex items-start gap-2 rounded-md border border-dashed border-warn bg-warn-tint px-3.5 py-2.5 text-caption text-warn-ink">
      <MessageSquareWarning aria-hidden className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>
        <strong className="font-bold">הערה לבדיקה משפטית: </strong>
        {block.note}
      </span>
    </p>
  );
}

function ContactCard({ contact, slug }: { contact: LegalContact; slug: LegalSlug }) {
  const Icon = CONTACT_ICON[slug];
  return (
    <div className="mt-4 rounded-md border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border-soft p-4 min-[901px]:px-6 min-[901px]:py-[18px]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-accent-tint text-accent">
          <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div>
          <h3 className="font-display text-lede leading-[1.3] text-ink">
            <LegalText text={contact.title} />
          </h3>
          {contact.sub && (
            <p className="mt-0.5 text-caption text-ink-soft">
              <LegalText text={contact.sub} />
            </p>
          )}
        </div>
      </div>
      <dl className="flex flex-col px-4 py-0.5 min-[901px]:px-6 min-[901px]:py-1">
        {contact.rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-1 items-baseline gap-0.5 border-b border-border-soft py-3 last:border-b-0 min-[901px]:grid-cols-[128px_minmax(0,1fr)] min-[901px]:gap-4"
          >
            <dt className="text-caption text-ink-soft">{r.label}</dt>
            <dd className="text-body leading-normal [overflow-wrap:anywhere] text-ink">
              <LegalText text={r.value} />
            </dd>
          </div>
        ))}
      </dl>
      {contact.foot && (
        <p className="rounded-b-md border-t border-border-soft bg-inset px-4 py-3 text-caption leading-normal text-ink-soft min-[901px]:px-6">
          <LegalText text={contact.foot} />
        </p>
      )}
    </div>
  );
}

/** The landing page's header (app/page.tsx), with the wordmark going home instead of to the top. */
function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas">
      <div className="mx-auto flex h-[68px] w-full max-w-6xl items-center gap-3 px-4 sm:px-6 md:gap-6">
        <Link href="/" aria-label="Eve, לדף הבית" className="shrink-0">
          <Wordmark tone="solid" className="text-[28px]" />
        </Link>
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
  );
}

/** The landing's footer with the documents in it. The documents link to each other even as drafts —
 *  nothing OUTSIDE them links in until they are published (app/page.tsx's footer). */
function PublicFooter({ current }: { current: LegalSlug }) {
  const email = LEGAL_FACTS.contactEmail?.trim();
  return (
    <footer className="border-t border-border bg-canvas">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-4 py-6 text-sm text-ink-soft sm:px-6 min-[901px]:flex-row min-[901px]:flex-wrap min-[901px]:items-center">
        <span>עיצוב אירועים, ממקור אמת אחד.</span>
        <nav aria-label="תחתית הדף" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LEGAL_DOCS.map((d) => (
            <Link
              key={d.slug}
              href={d.path}
              aria-current={d.slug === current ? "page" : undefined}
              className="transition-colors hover:text-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent"
            >
              {d.title}
            </Link>
          ))}
          {email && (
            <a href={`mailto:${email}`} className="transition-colors hover:text-accent">
              יצירת קשר
            </a>
          )}
          <span aria-hidden className="hidden h-3.5 w-px bg-border min-[901px]:block" />
          <Link href="/login" className="transition-colors hover:text-accent">
            כניסה
          </Link>
        </nav>
      </div>
    </footer>
  );
}
