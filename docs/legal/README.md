# Legal pages — status and the go-live checklist

**Status: DRAFT, hidden** (decided 2026-11-27, spec `docs/superpowers/specs/2026-11-27-legal-pages-design.md`).
Jira: EVE-8 (privacy), EVE-9 (terms + sign-up acceptance), EVE-10 (accessibility), under epic EVE-1.

The three texts are drafts written by an engineer from what the code does. They are **not legal advice**
and must not be published before a lawyer has read them.

## What "hidden" means today

- `/privacy`, `/terms` and `/accessibility` exist, carry a "טיוטה — ממתינה לבדיקה משפטית" notice, are
  marked `noindex`, and **no page links to them** (not the footer, not sign-up).
- Missing business facts are drawn as visible placeholders; questions for the lawyer are drawn as notes.
- Sign-up does **not** show the "I agree" line and does not require it. The storage for it is built
  (`users.terms_version`, `users.terms_accepted_at`, migration 0029) and stays empty.

## Where things live

| What | File |
|---|---|
| The switch (`draft` / `published`) and the text version | `lib/legal/status.ts` |
| Every fact only the owner can supply | `lib/legal/facts.ts` |
| The texts | `lib/legal/docs/privacy.ts`, `terms.ts`, `accessibility.ts` |
| The acceptance rule at sign-up | `lib/legal/acceptance.ts` (called by `signUp` in `lib/auth/actions.ts`) |
| The self-check (refuses `published` while anything is owed) | `npm run check:legal` |
| All three texts in one Markdown file, for the lawyer | `npm run legal:export -- docs/legal/drafts-for-review.md` (not committed) |

## What is needed before going live (owner: Ravid)

1. **Business facts** — fill every value in `lib/legal/facts.ts`: legal name, company number, registered
   address, contact email, privacy email, effective date, retention after closing an account, years tax
   documents are kept, notice days before charging / before changing the terms, the court's city, the
   accessibility coordinator (name, phone, email), the reply time for accessibility requests, the audit
   date and what it covered.
2. **The hosting stack** — the subprocessors and the region where data is stored (`subprocessors`,
   `dataRegion`) depend on the environment choice (Vercel, Neon, R2, Resend…), which is still open.
3. **A lawyer** (Israeli privacy law) reads all three texts and answers the notes in them
   (`npm run legal:export` puts them at the top of the file). Among them: the
   controller/processor wording after Amendment 13, whether a privacy officer is required, whether the
   terms' processing clause is enough or a separate data-processing agreement is needed, the liability
   cap, and accessibility exemptions.
4. **The accountant** — how many years billing documents are kept, and whether the software must be
   registered with the Tax Authority for its documents to count as originals.
5. **What the texts promise must exist first:**
   - data export and closing an account (the account-lifecycle round: EVE-22, EVE-49–52);
   - the accessibility audit of the main flows (EVE-10) — the "what we did" list is to be confirmed by it;
   - the AA contrast fix (this round, after Ravid approves the colours).
6. **Decisions at go-live:**
   - Do people who signed up before go-live accept the terms once, on their next sign-in? (Not built.)
   - Do invited people (clients, crew, venue partners who join through `/join`) accept them too? (Not built.)
   - Marketing mail needs its own opt-in if it is ever sent. (Nothing sends marketing today.)

## How to go live (one PR)

1. Fill `lib/legal/facts.ts`; apply the lawyer's changes to the texts and delete every `note`.
2. In `lib/legal/status.ts` set `LEGAL_STATUS` to `"published"` and `LEGAL_VERSION` to the day's date.
3. `npm run check:legal` — it fails while any fact or note is left.
4. Apply migration 0029 to production (`npm run db:migrate:prod`) before or with the deploy.

What the switch then does by itself: removes the notice and `noindex`, adds the three links to the
landing page's footer and the acceptance line to sign-up, and makes `signUp` require it and store the
version and time. Every later change to the terms or the privacy policy bumps `LEGAL_VERSION`.

Google's OAuth verification also needs the privacy policy's public URL (readiness P0-11).
