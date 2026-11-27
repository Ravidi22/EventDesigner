// npm run check:legal — the self-check of ./documents.ts, ./inline.ts, ./facts.ts and ./acceptance.ts,
// kept beside them so it never ships in the browser bundle (EVE-54).
import { termsAcceptance } from "./acceptance";
import { LEGAL_DOCS, blockTexts, docBySlug, factsUsed, publishBlockers } from "./documents";
import { FACT_LABELS, LEGAL_FACTS, factHref, missingFacts, type FactKey } from "./facts";
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
const here = parseInline("ראו [סעיף 2](#roles)");
assert(here[1].kind === "link" && here[1].href === "#roles", "a link to a section of the same page");
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
// A mark the parser does not match must not print literally on a published page (review, round 3).
for (const bad of ["{{ legalName }}", "{{legal_name}}", "{{legalName}", "x }} y", "[x] (/terms)", String.raw`[x](/\evil.example)`]) {
  let refused = false;
  try {
    parseInline(bad);
  } catch {
    refused = true;
  }
  assert(refused, `a malformed mark is refused: ${bad}`);
}

// Which facts become links — by WHAT the fact is, never by what its value looks like: a company
// number or a date written 2026-12-01 is digits and dashes too.
assert(factHref("privacyEmail", "privacy@eve.example") === "mailto:privacy@eve.example", "an email fact is a mailto link");
assert(factHref("accessibilityPhone", "03-555 1234") === "tel:035551234", "the phone fact is a tel link");
assert(factHref("companyNumber", "515123456") === null, "a company number is never a phone link");
assert(factHref("effectiveDate", "2026-12-01") === null, "a date is never a phone link");
assert(factHref("contactEmail", "not an email") === null, "an email fact that is not an address is plain text");

// ── Facts: every value Ravid owes is null until he supplies it; each has a placeholder label. ─────
for (const key of Object.keys(LEGAL_FACTS) as FactKey[]) {
  assert(typeof FACT_LABELS[key] === "string" && FACT_LABELS[key].length > 0, `fact ${key} has a label`);
}
assert(missingFacts({ ...LEGAL_FACTS, legalName: "  " }).includes("legalName"), "a blank fact is missing");
const full = Object.fromEntries(Object.keys(LEGAL_FACTS).map((k) => [k, "x"])) as Record<FactKey, string>;
assert(missingFacts(full).length === 0, "nothing missing when all are filled");

// ── The three documents. ────────────────────────────────────────────────────────────────────────
assert(LEGAL_DOCS.map((d) => d.slug).join() === "privacy,terms,accessibility", "three documents, in footer order");
const sectionIds = (path: string) => LEGAL_DOCS.find((d) => d.path === path)?.sections.map((s) => s.id);
for (const doc of LEGAL_DOCS) {
  assert(docBySlug(doc.slug) === doc, `${doc.slug} found by slug`);
  assert(doc.path === `/${doc.slug}`, `${doc.slug} lives at its slug`);
  assert(doc.sections.length >= 5, `${doc.slug} has its sections`);
  const ids = doc.sections.map((s) => s.id);
  assert(new Set(ids).size === ids.length, `${doc.slug}: section ids are unique`);
  for (const id of ids) assert(/^[a-z][a-z0-9-]*$/.test(id), `${doc.slug}: "${id}" is a usable #anchor`);
  // Every paragraph — the intro included — parses: no unknown fact, no link off the site, to a page
  // that does not exist, or to a section (#anchor) that page does not have.
  for (const b of [...doc.intro, ...doc.sections.flatMap((s) => s.blocks)]) {
    for (const text of blockTexts(b, { notes: true })) {
      for (const tok of parseInline(text)) {
        if (tok.kind !== "link") continue;
        const [page, anchor] = tok.href.split("#");
        const ids = page === "" ? doc.sections.map((s) => s.id) : sectionIds(page);
        assert(ids !== undefined || ["/", "/signup", "/login", "/settings"].includes(page), `${doc.slug}: link to ${tok.href} goes somewhere real`);
        if (anchor !== undefined) assert(!!ids?.includes(anchor), `${doc.slug}: ${tok.href} names a section that exists`);
      }
    }
    // What is drawn without the parser must carry no mark: a contact row's label, a reviewer note.
    const raw = typeof b !== "string" && "contact" in b ? b.contact.rows.map((r) => r.label) : typeof b !== "string" && "note" in b ? [b.note] : [];
    for (const text of raw) assert(!/\{\{|\}\}|\]\(/.test(text), `${doc.slug}: "${text}" is drawn raw, so it may hold no mark`);
  }
}
assert(factsUsed().has("privacyEmail") && factsUsed().has("accessibilityName"), "the texts name the contacts they need");
// The design (Claude Design, board א1/א5): each document's way to reach someone is a contact CARD.
const cardOf = (slug: "privacy" | "accessibility", id: string) =>
  docBySlug(slug).sections.find((s) => s.id === id)?.blocks.find((b) => typeof b !== "string" && "contact" in b);
const privacyCard = cardOf("privacy", "contact");
assert(!!privacyCard && blockTexts(privacyCard).some((t) => t.includes("{{privacyEmail}}")), "privacy ends on its contact card");
const a11yCard = cardOf("accessibility", "coordinator");
assert(
  !!a11yCard && ["accessibilityName", "accessibilityPhone", "accessibilityEmail", "auditDate"].every((k) => blockTexts(a11yCard).some((t) => t.includes(`{{${k}}}`))),
  "the coordinator card names the coordinator and the audit date",
);
assert(blockTexts({ note: "n" }).length === 0 && blockTexts({ note: "n" }, { notes: true })[0] === "n", "notes are read only when asked");
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
