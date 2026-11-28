// The three legal documents, in footer order, and what stands between them and publishing
// (EVE-8/9/10). Plain data + pure functions.
import { ACCESSIBILITY } from "./docs/accessibility";
import { PRIVACY } from "./docs/privacy";
import { TERMS } from "./docs/terms";
import { FACT_LABELS, LEGAL_FACTS, missingFacts, type FactKey } from "./facts";
import { parseInline } from "./inline";
import type { LegalBlock, LegalDoc, LegalSlug } from "./types";

export const LEGAL_DOCS: LegalDoc[] = [PRIVACY, TERMS, ACCESSIBILITY];

export const docBySlug = (slug: LegalSlug): LegalDoc => LEGAL_DOCS.find((d) => d.slug === slug)!;

/** Every text in a block, for the checks and the export. A reviewer note only when asked — it never
 *  reaches a published page. */
export function blockTexts(b: LegalBlock, { notes = false } = {}): string[] {
  if (typeof b === "string") return [b];
  if ("list" in b) return b.list;
  if ("contact" in b) {
    const c = b.contact;
    return [c.title, ...(c.sub ? [c.sub] : []), ...c.rows.flatMap((r) => [r.label, r.value]), ...(c.foot ? [c.foot] : [])];
  }
  return notes ? [b.note] : [];
}

const allBlocks = (doc: LegalDoc): LegalBlock[] => [...doc.intro, ...doc.sections.flatMap((s) => s.blocks)];

/** Every fact some text names (reviewer notes excluded — they never reach a published page). */
export function factsUsed(): Set<FactKey> {
  const out = new Set<FactKey>();
  for (const doc of LEGAL_DOCS)
    for (const b of allBlocks(doc))
      for (const text of blockTexts(b)) for (const t of parseInline(text)) if (t.kind === "fact") out.add(t.key);
  return out;
}

/** Why the documents cannot be published as they stand, in Hebrew, one line each: a fact still
 *  owed (named by its label) or a reviewer note left in a text. Empty = ready. */
export function publishBlockers(facts: Record<FactKey, string | null> = LEGAL_FACTS): string[] {
  const out = missingFacts(facts).map((k) => `חסר: ${FACT_LABELS[k]}`);
  for (const doc of LEGAL_DOCS) {
    const notes = allBlocks(doc).filter((b) => typeof b !== "string" && "note" in b).length;
    if (notes) out.push(`${doc.title}: ${notes === 1 ? "הערה אחת" : `${notes} הערות`} לבדיקה משפטית`);
  }
  return out;
}
