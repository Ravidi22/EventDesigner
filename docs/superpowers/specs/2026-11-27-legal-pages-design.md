# Round 3 — legal pages, the sign-up terms line, and AA contrast (EVE-8, EVE-9, EVE-10)

Epic EVE-1. Source: `docs/qa/2026-11-27-production-readiness.md` P0-1, P0-2, P0-3 (and P1-13 for the footer links).
Branch `feat/2026-11-27-legal`, stacked on `feat/2026-11-27-self-checks` (PR #3), which is stacked on PR #2.

## Why

Eve holds personal data of people who never signed up with it: each studio's clients, crew and guests.
Israeli law expects a privacy policy (Amendment 13 to the Privacy Protection Law, in force since
14 Aug 2025), terms that say who owns the data and who is responsible for the studio's documents, and an
accessibility statement with a named coordinator (the 2013 service-accessibility regulations, reg. 35;
IS 5568). Google's OAuth verification needs the privacy policy's URL. None of this exists yet.

These are DRAFTS written by an engineer, not legal advice. Nothing goes live until a lawyer has read them
and Ravid has supplied the business facts.

## Decisions (Ravid, 2026-11-27)

- **D1 — the drafts are hidden, and that is documented.** `/privacy`, `/terms`, `/accessibility` exist
  at their address with a "טיוטה" notice, `noindex`, and are linked from nowhere. What is needed to
  publish them is written in `docs/legal/README.md` and in a Jira task assigned to Ravid.
- **D2 — the sign-up acceptance line is built now and switched off.** The storage (accepted version +
  time per user) and the server rule are built; the line is not shown and not required while the texts
  are drafts — nobody is asked to accept a draft. The same Jira/README route says what switches it on.
- **D3 — the contrast fix is designed first in Claude Design**, on the Eve design system, for Ravid's
  approval, then built in this round.
- **D4 — one shared layout for the three documents**, designed in Claude Design for approval before it
  is built.

## The one switch

`lib/legal/status.ts` holds `LEGAL_STATUS` — `"draft"` today. Turning it to `"published"` is the go-live,
in one PR: the notice goes, `noindex` goes, the footer and sign-up links appear, and the acceptance line
becomes required. A self-check refuses `"published"` while any business fact is still missing, so the
switch cannot ship placeholders. It is a code constant, not an environment variable, on purpose: going
live is a reviewed change with a lawyer's sign-off behind it, not a dashboard toggle.

## The business facts

Everything only Ravid can supply (legal name, company number, address, contact addresses, the
accessibility coordinator, the audit date, retention periods, the court's city…) lives in ONE file,
`lib/legal/facts.ts`, every value `null` today. The texts name them as `{{key}}`; the page draws a
missing one as a visible placeholder, so the lawyer and Ravid can see what is still owed.

## Storage

A table of its own, `legal_acceptances` (user, version, time — one row per acceptance; migration 0029).
Written by `signUp` only when the line was shown and ticked; no row for anyone who signed up before
go-live. Not columns on `users` (the review caught it): Better Auth reads whole `users` rows, so a
column there would have to reach production before this code does or every sign-in fails; a table of
its own lets the code deploy first and is needed only from go-live. Whether existing accounts are asked once at go-live is Ravid's call at that time (listed
in the README).

## Not in this round

- The accessibility AUDIT of the main flows (keyboard, focus, labels, the canvas) beyond contrast — the
  statement is drafted with an honest "known limitations" section; the audit is its own piece of work.
- The `/join` invitation path (clients, crew, venues accepting an invitation) — listed in the README as
  a go-live decision.
- Marketing-mail consent (a separate opt-in) — nothing sends marketing today.
