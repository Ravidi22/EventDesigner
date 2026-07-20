# Front-end build-out — phase 1 screens

Version 1 | 2026-07-15 | Scope: front-end only, backend deferred.

## Goal

Complete the phase-1 front-end surface of iDesign on mock/local data, and lift the
marketing/entry surfaces (Home, Login, Setup) out of the current too-plain look — richer,
more designed, without breaking "The Lit Atelier" neutrality of the operational tool.

Design-direction decision (user-confirmed): keep the documented white-canvas + oxblood
system on the operational screens (Catalog / Studio / Outputs) where print-legibility and
true product-photo colour matter. Give the entry surfaces (Home, Login, Setup) a deeper,
bolder treatment — ink hero bands, confident accent, editorial serif — still one accent,
still no cream body, still RTL-first.

## Screen inventory (complete phase-1 front end)

| Route | State | Requirement |
|---|---|---|
| `/` Home | refactor stub | entry |
| `/login` | new (shell only) | auth entry — see Auth note |
| `/setup` | new | F-1.1–F-1.6 Smart Import + Hall Template |
| `/catalog` | exists | F-2.x |
| `/studio` | exists (light wire-up) | F-3.x |
| `/outputs` | exists + new Quote tab | F-4.1–F-4.6 |

Out of scope: all phase-2 (3D, client link, gallery, presentation mode), any multi-event
dashboard/CRUD, settings/account, real auth session, real PDF detection.

## Conventions to follow (from codebase survey)

- Route = `app/<name>/page.tsx` (thin server component seeding props) + co-located
  `<name>-screen.tsx` (`"use client"`) + sibling sub-pieces. Kebab-case files, named exports.
- Mock data in `lib/<domain>/sample-*.ts`; single-key `localStorage` seam pattern like
  `lib/studio/storage.ts` (`load`/`save`/`clear`, restored client-side in `useEffect`).
- Reuse shared components: `Button` (`primary|ghost|danger`), `IconButton` (needs `label`),
  `SearchInput`, `TagToggle`, `controlClassName`. Reuse `formatPrice`/`formatDimensions`.
- Icons: `lucide-react`, explicit size + `strokeWidth`. All copy Hebrew, RTL logical props.
- Pure-logic modules end with an `import.meta.main` assert self-check (run under
  `node --experimental-strip-types`).

## Per-screen design

### Home (`/`)
Editorial hero on a deep ink band (not white), serif display headline, one oxblood CTA.
Primary action adapts: if a saved studio doc exists → "המשך עיצוב" (resume) + secondary
"התחלה חדשה" (→ `/setup`); else → "התחלת אירוע חדש" (→ `/setup`). Keeps the existing
"one document, three outputs" section but re-styled richer. Links to Catalog.

### Login (`/login`)
Styled front-end shell only (ADR-2: no real signup/auth until phase 3; auth must be a
managed provider per docs/02). Split layout: editorial ink panel + email/password form with
real client-side validation feel. Submit routes to `/` (no session). No signup form — a
single "כניסה". A one-line note that this is a front-end placeholder.

### Setup (`/setup`) — the main new flow
Wizard, mock data. Two entry paths:
- **From saved hall template** (F-1.6, the primary phase-1 path): pick from a list of saved
  templates (1–2 seeded + any saved), preview geometry, "פתח אירוע" → seeds Studio doc → `/studio`.
- **New PDF import** (F-1.1–1.4): upload → render page with `pdf.js` (real, client-side) →
  a clearly-labelled MOCK "table suggestions" step (real detection is backend, out of scope) →
  review/approve list with bulk "אשר הכול" + per-row edit (F-1.3) → calibration: mark a known
  segment, enter its real mm (F-1.4) → name + save as reusable Hall Template (F-1.6) → `/studio`.
- **Manual** (F-1.5): "התחל ריק" → empty hall → `/studio` (Studio already supports manual
  table placement).

Storage: `lib/setup/storage.ts` for hall templates (localStorage), plus writing the chosen
hall into the studio's existing storage seam so Studio opens on it.

### Quote (new tab in `/outputs`)
New `lib/outputs/quote.ts` — aggregation parallel to `packingList`: line items grouped by
category (variant label, qty, unit price, line total), category subtotals, grand total,
discount (amount/percent), VAT (F-4.4). Reuses `formatPrice`. Rendered as a third tab in the
existing Outputs shell (reuse its tab switcher + print button). Tabular-nums, B&W-legible.
`import.meta.main` self-check on the totals math.

### Studio wire-up
Replace hardcoded `SAMPLE_HALL` import with a hall read from the setup storage seam (falling
back to the sample hall). Minimal change; no canvas rework.

## Validation

`npx tsc --noEmit`, `npm run lint`, and a dev-server click-through of every route
(Home → Login → Setup both paths → Studio → Outputs all three tabs). Self-checks for new
logic modules pass under node.
