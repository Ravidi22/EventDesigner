// THE switch for the legal pages and the sign-up acceptance line (EVE-8/9/10, spec
// docs/superpowers/specs/2026-11-27-legal-pages-design.md).
//
// "draft" (today): /privacy, /terms and /accessibility carry a "טיוטה" notice, are `noindex`, are
// linked from nowhere, and sign-up neither shows nor requires the acceptance line.
// "published": the notice and `noindex` go, the footer and sign-up link to them, and sign-up requires
// the line and stores what was accepted.
//
// ⚠ Flip it only after a lawyer has read the texts and every fact in ./facts.ts is filled —
// `npm run check:legal` refuses "published" while anything is still owed. The go-live checklist is
// docs/legal/README.md.
export type LegalStatus = "draft" | "published";

export const LEGAL_STATUS = "draft" as LegalStatus;

/** The text version a person accepts at sign-up. Bump it (to the day's date) whenever the terms or the
 *  privacy policy change after publishing. */
export const LEGAL_VERSION = "2026-11-27";

export const legalPublished = (status: LegalStatus = LEGAL_STATUS) => status === "published";
