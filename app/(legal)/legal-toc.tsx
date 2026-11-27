"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ListOrdered } from "lucide-react";
import type { LegalSlug } from "@/lib/legal/types";

export interface TocEntry {
  id: string;
  title: string;
}

/** What the sticky header leaves of the top of the window: a section counts as "where you are" once
 *  its heading has passed under it. Matches the sections' `scroll-mt`. */
const UNDER_HEADER = 92;

/** The section being read — the last whose top has passed under the header. */
function useCurrent(entries: TocEntry[]) {
  const [current, setCurrent] = useState(entries[0]?.id ?? "");
  useEffect(() => {
    const read = () => {
      let at = entries[0]?.id ?? "";
      for (const e of entries) {
        const el = document.getElementById(e.id);
        if (el && el.getBoundingClientRect().top <= UNDER_HEADER + 8) at = e.id;
      }
      setCurrent((c) => (c === at ? c : at));
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [entries]);
  return current;
}

const OTHERS: { slug: LegalSlug; title: string }[] = [
  { slug: "privacy", title: "מדיניות פרטיות" },
  { slug: "terms", title: "תנאי שימוש" },
  { slug: "accessibility", title: "הצהרת נגישות" },
];

/** The desktop table of contents (Claude Design board א1): on the start side, sticky under the header,
 *  the section being read in accent; the other two documents under it. Hidden under 900px. */
export function LegalToc({ entries, slug }: { entries: TocEntry[]; slug: LegalSlug }) {
  const current = useCurrent(entries);
  return (
    <nav aria-label="תוכן העניינים" className="sticky top-[92px] hidden flex-col gap-2 min-[901px]:flex">
      <p className="px-3 text-caption font-semibold text-ink-soft">תוכן העניינים</p>
      <ol className="flex flex-col gap-0.5">
        {entries.map((e, i) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              aria-current={current === e.id ? "true" : undefined}
              className="flex gap-1.5 rounded-md px-3 py-[7px] text-body leading-[1.4] font-medium text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover aria-[current=true]:bg-accent-tint aria-[current=true]:font-bold aria-[current=true]:text-accent"
            >
              <span className="min-w-[1.4em] shrink-0 tabular-nums">{i + 1}.</span>
              {e.title}
            </a>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-col gap-1.5 border-t border-border px-3 pt-3.5 text-caption text-ink-soft">
        <span>מסמכים נוספים</span>
        {OTHERS.filter((o) => o.slug !== slug).map((o) => (
          <Link key={o.slug} href={`/${o.slug}`} className="font-semibold text-accent hover:text-accent-hover">
            {o.title}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** The phone's table of contents (boards א3/א4): one row that opens the list in place. */
export function LegalTocMobile({ entries }: { entries: TocEntry[] }) {
  const current = useCurrent(entries);
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="תוכן העניינים" className="mt-5 rounded-md border border-border bg-surface min-[901px]:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="legal-toc-list"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-2.5 px-3.5 text-start text-body leading-[1.4] font-semibold text-ink"
      >
        <ListOrdered aria-hidden className="h-[18px] w-[18px] text-accent" strokeWidth={1.75} />
        תוכן העניינים
        <span className="text-caption font-normal text-ink-soft">
          <bdi>{entries.length}</bdi> סעיפים
        </span>
        <ChevronDown aria-hidden className={`ms-auto h-[18px] w-[18px] text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol id="legal-toc-list" className="border-t border-border-soft p-1.5">
          {entries.map((e, i) => (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                onClick={() => setOpen(false)}
                aria-current={current === e.id ? "true" : undefined}
                className="flex min-h-11 items-center gap-1.5 rounded-sm px-2.5 text-body leading-[1.4] text-ink-soft aria-[current=true]:bg-accent-tint aria-[current=true]:font-bold aria-[current=true]:text-accent"
              >
                <span className="min-w-[1.4em] shrink-0 tabular-nums">{i + 1}.</span>
                {e.title}
              </a>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
