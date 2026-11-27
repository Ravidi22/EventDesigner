// npm run check:legal — the self-check of ./documents.ts, ./inline.ts, ./facts.ts and ./acceptance.ts,
// kept beside them so it never ships in the browser bundle (EVE-54).
import { termsAcceptance } from "./acceptance";
import { LEGAL_DOCS, docBySlug, factsUsed, publishBlockers } from "./documents";
import { FACT_LABELS, LEGAL_FACTS, missingFacts, type FactKey } from "./facts";
import { parseInline } from "./inline";
import { LEGAL_STATUS, LEGAL_VERSION } from "./status";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

// ── Inline text: facts and links are read out of a paragraph; the rest is text, in order. ────────
const t = parseInline("לפנות אל {{privacyEmail}} או לקרוא את [תנאי השימוש](/terms).");
assert(t.length === 5, `five tokens: ${JSON.stringify(t)}`);
assert(t[0].kind === "text" && t[0].text === "לפנות אל ", "leading text kept with its space");
assert(t[1].kind === "fact" && t[1].key === "privacyEmail", "a fact");
assert(t[3].kind === "link" && t[3].label === "תנאי השימוש" && t[3].href === "/terms", "a link");
assert(t[4].kind === "text" && t[4].text === ".", "trailing text");
assert(parseInline("רק טקסט").length === 1, "plain text is one token");
let threw = false;
try {
  parseInline("{{noSuchFact}}");
} catch {
  threw = true;
}
assert(threw, "an unknown fact key is refused, never drawn as text");
threw = false;
try {
  parseInline("[מחוץ לאתר](https://example.com)");
} catch {
  threw = true;
}
assert(threw, "a link leaves the site only through a fact, never typed into the text");

// ── Facts: every value Ravid owes is null until he supplies it; each has a placeholder label. ─────
for (const key of Object.keys(LEGAL_FACTS) as FactKey[]) {
  assert(typeof FACT_LABELS[key] === "string" && FACT_LABELS[key].length > 0, `fact ${key} has a label`);
}
assert(missingFacts({ ...LEGAL_FACTS, legalName: "  " }).includes("legalName"), "a blank fact is missing");
const full = Object.fromEntries(Object.keys(LEGAL_FACTS).map((k) => [k, "x"])) as Record<FactKey, string>;
assert(missingFacts(full).length === 0, "nothing missing when all are filled");

// ── The three documents. ────────────────────────────────────────────────────────────────────────
assert(LEGAL_DOCS.map((d) => d.slug).join() === "privacy,terms,accessibility", "three documents, in footer order");
for (const doc of LEGAL_DOCS) {
  assert(docBySlug(doc.slug) === doc, `${doc.slug} found by slug`);
  assert(doc.path === `/${doc.slug}`, `${doc.slug} lives at its slug`);
  assert(doc.sections.length >= 5, `${doc.slug} has its sections`);
  const ids = doc.sections.map((s) => s.id);
  assert(new Set(ids).size === ids.length, `${doc.slug}: section ids are unique`);
  for (const id of ids) assert(/^[a-z][a-z0-9-]*$/.test(id), `${doc.slug}: "${id}" is a usable #anchor`);
  // Every paragraph parses: no unknown fact, no link off the site or to a page that does not exist.
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      const texts = typeof b === "string" ? [b] : "list" in b ? b.list : [b.note];
      for (const text of texts) {
        for (const tok of parseInline(text)) {
          if (tok.kind === "link") {
            const target = tok.href.split("#")[0];
            assert(
              LEGAL_DOCS.some((d) => d.path === target) || ["/", "/signup", "/login", "/settings"].includes(target),
              `${doc.slug}: link to ${tok.href} goes somewhere real`,
            );
          }
        }
      }
    }
  }
}
assert(factsUsed().has("privacyEmail") && factsUsed().has("accessibilityName"), "the texts name the contacts they need");
for (const key of factsUsed()) assert(key in LEGAL_FACTS, `${key} is a known fact`);

// ── The switch: publishing is refused while anything is still owed. ────────────────────────────
const draftBlockers = publishBlockers(LEGAL_FACTS);
assert(draftBlockers.length > 0, "today's drafts cannot be published");
assert(draftBlockers.some((b) => b.includes(FACT_LABELS.legalName)), "a missing fact is named by its label");
assert(draftBlockers.some((b) => b.includes("לבדיקה משפטית")), "a reviewer note left in the text blocks publishing");
assert(
  publishBlockers(full).every((b) => b.includes("לבדיקה משפטית")),
  "with every fact filled, only the reviewer notes remain",
);
// The constant itself may say "published" only when nothing blocks it — this is what stops a PR that
// flips the switch with placeholders still in the text.
assert(LEGAL_STATUS === "draft" || publishBlockers(LEGAL_FACTS).length === 0, "published with blockers left");
assert(/^\d{4}-\d{2}-\d{2}$/.test(LEGAL_VERSION), "the version is a date");

// ── Acceptance at sign-up. ──────────────────────────────────────────────────────────────────────
const now = new Date("2026-11-27T10:00:00Z");
assert(termsAcceptance({ status: "draft", accepted: true, version: "v", now }) === null, "a draft is never accepted or stored");
assert(termsAcceptance({ status: "draft", accepted: undefined, version: "v", now }) === null, "and never required");
const ok = termsAcceptance({ status: "published", accepted: true, version: "2026-12-01", now });
assert(ok !== null && "version" in ok && ok.version === "2026-12-01" && ok.at === now, "published + ticked = stored");
for (const accepted of [false, undefined, "true", 1, null]) {
  const r = termsAcceptance({ status: "published", accepted, version: "v", now });
  assert(r !== null && "error" in r, `published + ${JSON.stringify(accepted)} is refused`);
}

console.log("check:legal — ok");
