// The three legal documents as data (EVE-8, EVE-9, EVE-10). Plain: no React, no database — the pages
// draw it, documents.check.ts checks it.

export type LegalSlug = "privacy" | "terms" | "accessibility";

/**
 * One block of a section. Text may carry two kinds of inline mark, read by ./inline.ts:
 * `{{factKey}}` — a business fact from ./facts.ts, drawn as a placeholder while it is missing;
 * `[label](/path#anchor)` — a link to a page of this site.
 *
 * A `note` is a question for the reviewing lawyer (or for Ravid). It is drawn only while the documents
 * are drafts, and publishing is refused while any is left (documents.ts `publishBlockers`).
 */
export type LegalBlock = string | { list: string[] } | { note: string };

export interface LegalSection {
  /** The #anchor — lowercase Latin, so a link survives copying. */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  slug: LegalSlug;
  path: `/${LegalSlug}`;
  title: string;
  /** One line for the page's meta description. */
  summary: string;
  intro: LegalBlock[];
  sections: LegalSection[];
}
