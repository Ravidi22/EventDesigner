import Link from "next/link";
import { FACT_LABELS, LEGAL_FACTS, factHref } from "@/lib/legal/facts";
import { parseInline } from "@/lib/legal/inline";

/**
 * One legal paragraph's text with its marks drawn (lib/legal/inline.ts). A fact Ravid has supplied is
 * its value — the email and phone facts become links (`factHref`, by key); one still owed is the
 * design's placeholder pill (Claude Design board א1: warn-tint, dashed edge, the brackets kept so it
 * survives black-and-white print). The pill may wrap: a long label on a phone is wider than the column.
 * `check:legal` keeps "published" from ever drawing a pill.
 */
export function LegalText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.kind === "text") return t.text;
        if (t.kind === "link")
          return (
            <Link
              key={i}
              href={t.href}
              className="font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:text-accent-hover"
            >
              {t.label}
            </Link>
          );
        const value = LEGAL_FACTS[t.key]?.trim();
        if (!value)
          return (
            <span
              key={i}
              className="rounded-pill border border-dashed border-warn bg-warn-tint px-2 font-semibold text-warn-ink [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
            >
              [{FACT_LABELS[t.key]}]
            </span>
          );
        const href = factHref(t.key, value);
        if (!href) return value;
        return (
          <a key={i} href={href} dir="ltr" className="font-semibold text-accent hover:text-accent-hover">
            {value}
          </a>
        );
      })}
    </>
  );
}
