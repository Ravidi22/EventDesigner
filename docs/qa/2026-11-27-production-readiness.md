# Production readiness — 2026-11-27

What is still missing before Eve is a real production product, ranked by importance and split by account type. It started from two social-media checklists ("20 hidden vibecoded website giveaways" and "20 things to add after launch"; scored item by item at the end) and adds what a multi-tenant SaaS that issues tax documents and holds other people's clients' data needs on top.

**How it was checked:** read from the code on `feat/2026-11-25-supplier-gaps` (9eb8549): routes, `next.config.ts`, `vercel.json`, `proxy.ts`, `lib/auth`, `lib/email`, `lib/files`, `lib/orders`, `lib/event-links`, `lib/billing`, `drizzle/`, the landing page, the last production build in `.next/` (13 Nov), lint, the QA audit's IDs against the commit log. **Not visible from the repo, marked "verify":** what is set on Vercel (env vars, domain), the Neon plan, Cloudflare's bucket settings. Legal points are a starting list, not advice — have an Israeli lawyer (privacy, terms) and your accountant (tax documents) confirm them.

## Priority levels

| Level | Meaning |
| --- | --- |
| **P0 — Blocker** | Don't take an outside business's money or data without it: legal exposure, security, data loss, people unable to get in |
| **P1 — Launch** | Before opening sign-ups to the public, or in the first 30 days: what makes people stay, and what you need to support them |
| **P2 — Soon** | First three months |
| **P3 — Later** | Nice to have |

## Account types

| Type | Who | Where they live |
| --- | --- | --- |
| **Everyone** | Platform-wide: security, legal, infrastructure | — |
| **Visitor** | Signed out, on the marketing site or a search result | `/`, `/signup`, `/login` |
| **Studio** | Event designer — roles owner · designer · crew | `/dashboard`, `/studio`, `/outputs`, `/billing`… |
| **Supplier** | Publishes a catalog, answers orders | `/catalog`, `/orders` |
| **Venue** | בעל אולם — bookings, menus, occupancy | `/bookings`, `/menus`, `/halls` |
| **Client** | בעל אירוע — invited by the designer | `/join`, `/client`, `/v/<token>` |
| **You** | The platform operator. **There is no such account today** — that is itself a gap (P1-23) | scripts only |

## At a glance

| | P0 | P1 | P2 | P3 |
| --- | --- | --- | --- | --- |
| Everyone | 8 | 7 | 10 | 3 |
| Visitor | — | 10 | 5 | 2 |
| Studio | 1 | 5 | 4 | 1 |
| Supplier | — | 2 | 2 | 1 |
| Venue | — | 2 | 4 | — |
| Client | — | 2 | 2 | — |
| You (operator) | 2 | 2 | — | 1 |

**Already in good shape** (no action): Better Auth with email verification, reset, Google sign-in and a rate limit (`lib/auth/auth.ts`); 404, error and global-error pages; the landing page is server-rendered (view-source is full); `<html lang="he" dir="rtl">`; every image has alt text; no source maps served; lint clean; 182 `check:*` self-checks + 6 `db:verify:*` walk-throughs; 75 of the 76 QA-audit findings fixed (only ST-9, a feature request, is open); production migrated to 0028, the latest migration.

---

## P0 — Blockers

### Everyone

**P0-1 · Privacy policy (מדיניות פרטיות)** — none exists.
You hold personal data of people who never signed up with you: your studios' clients (names, phones, emails, and on `events.billing_name/address/number` their legal details), crew members, venue guests' counts and special meals. Amendment 13 to the Privacy Protection Law (in force since 14 Aug 2025) raised the duties and the fines. Google's OAuth consent screen also requires a privacy-policy URL on your domain (P0-11). Say where data lives (Neon in Frankfurt, Cloudflare R2), the subprocessors (Vercel, Neon, Cloudflare, Resend, Google), retention, the person's rights and how to reach you. Note that uploaded files are readable by anyone holding the URL (P2-7).

**P0-2 · Terms of service (תנאי שימוש) + acceptance at sign-up** — no page, and `app/signup` has no acceptance line.
Cover: who owns the data (the studio), that quotes and tax documents are the studio's responsibility, liability limits, payment / cancellation / refund, and a **data-processing clause** — you process each studio's client data on its behalf. Store the accepted version + timestamp per user.

**P0-3 · Accessibility statement (הצהרת נגישות)** — none.
Israel's service-accessibility regulations (reg. 35, standard IS 5568 ≈ WCAG AA) require a statement and a named accessibility coordinator for a service offered to the public; small-business exemptions exist — confirm whether one applies. DESIGN.md already targets WCAG AA, so this is mostly an audit (`/design:accessibility-review` on the main flows) plus a page.

**P0-4 · Security headers** — none are set: no `headers()` in `next.config.ts`, nothing in `vercel.json` or `proxy.ts`.
Add `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `frame-ancestors 'none'` / `X-Frame-Options: DENY` (today /billing and /settings can be framed by any site — clickjacking). Then a Content-Security-Policy in report-only mode first (it must allow the R2 image domain, `blob:` for the 3D textures and the PDF builder, Google sign-in).

**P0-5 · Error monitoring** — nothing reports a failure.
`app/error.tsx` and `global-error.tsx` show a page and tell no one. A server action that throws, a quote PDF that comes out blank on someone's iPad, an autosave that keeps failing — you hear about it by phone, if at all. Add Sentry (its Next.js SDK) with releases, and upload source maps privately (keep them out of `/_next/static`, as now).

**P0-6 · Backups you have restored once.**
`scripts/backup-db.ts` is manual. Check the Neon plan's point-in-time-restore window (short on the free plan). R2 keeps no old versions of an object, and replacing a photo deletes the one it replaced (roadmap §2), so a mistaken replace or delete is permanent — add a scheduled copy to a second bucket. Write a one-page restore runbook and do one real restore into a Neon branch.

**P0-7 · Production email really works — verify on Vercel** (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`).
`lib/auth/auth.ts` sets `requireEmailVerification: emailEnabled()`. **If email is not configured in production:** anyone can sign up as any address, and "שכחתי סיסמה" sends nothing, so a locked-out studio cannot get back in. **If it is configured but the domain is not verified at Resend:** only your own inbox receives mail, so every outside sign-up is stuck at verification. Also set SPF, DKIM and DMARC on the domain.

**P0-8 · A custom domain — verify** (image 1, #1).
If production still answers on `*.vercel.app`, get a domain. Everything else hangs on it: Resend domain verification (P0-7), Google OAuth verification (P0-11), Search Console (P1-17), and trust — clients open your `/join` and `/v` links from WhatsApp.

### Studio

**P0-9 · Tax documents — billing phase 2.**
Phase 1 issues numbered tax invoices and receipts (`lib/billing`). Phase 2 is not built:
- **Allocation numbers (מספר הקצאה)** from the Tax Authority's "חשבוניות ישראל" API. The rule is already in your code (`allocationRequired`: 5,000 ₪ net from 1.6.2026) — and that date has passed, so any tax invoice to a VAT-deducting business buyer above it (corporate events; a venue buying from a designer) needs one now.
- **Digital signature / "מסמך ממוחשב"** — that is why the document page prints העתק.
- **Uniform-structure export (מבנה אחיד / OPENFRMT)** for the accountant.
- **Ask your accountant** whether software that issues tax documents must be registered with the Tax Authority and print its registration number.

Until it is built, either limit tax invoices to private buyers or amounts under the threshold, or say clearly on screen what the document lacks. Blocked on your Tax Authority login, not on code.

### You (operator)

**P0-10 · Decide the business model and the price.**
The landing page's pricing has no numbers (`app/page.tsx`: "the split into plans… is a draft, and no price is set yet"). Subscription billing (P1-24), plan limits and the trial all depend on it. Decide: who pays (designers? suppliers free, to seed the marketplace? venues per hall?), per seat or per studio, trial length, what a plan limits.

**P0-11 · Google OAuth verification — if Calendar sync is offered to outside studios.**
The calendar scopes are "sensitive": until Google verifies the app you are capped at 100 test users added by hand, and verification takes weeks (`.env.example` says so). It needs the domain (P0-8) and the privacy policy (P0-1). The landing page sells "מסונכרנות ל־Google Calendar" — start verification now, or hide the feature for new studios until it passes.

---

## P1 — Launch

### Everyone

**P1-1 · CI** — there is no `.github/` folder. Nothing runs typecheck, lint, the 182 `check:*` scripts or `next build` except you, locally. Add a GitHub Action on every push (typecheck · lint · checks in parallel · build), and require it to pass before merging to master. A `db:verify` job against a Neon branch per PR can come second.

**P1-2 · A written release process.** Deploying does not run migrations (roadmap §1). Work lives on feature branches with unpushed commits (9eb8549) and uncommitted files (the four outputs files today). Write the steps: merge → CI green → `npm run db:migrate:prod` → deploy → smoke test. Consider a staging deploy pointed at a Neon staging branch.

**P1-3 · Bot protection on sign-up.** No CAPTCHA. Each sign-up opens an organisation, installs the 33-row base library and sends an email from your 3,000-a-month free quota; the auth rate limit throttles per IP, not bots. Add Cloudflare Turnstile (free) to sign-up and forgot-password.

**P1-4 · "Delete my account / close my business".** No self-serve path — only `scripts/delete-organization.ts`, which only you can run. The privacy policy will promise it, and Google's OAuth policy expects it. Export first, then delete after a grace period. Issued tax documents must be **kept** (bookkeeping rules: years — confirm the period with your accountant), so closing a business anonymises it and keeps `billing_documents`; say so in the policy.

**P1-5 · A cross-tenant isolation test.** There is no row-level security (no policies in `drizzle/*.sql`); isolation rests on every action filtering by `currentOrg()`. QA findings PR-12/PR-13 (fixed) showed how it slips. Add `db:verify:isolation`: sign in as org B and call every read and write action with org A's ids.

**P1-6 · Uptime monitoring.** Add BetterStack or UptimeRobot (free tiers) on `/` and on a health route (none exists) that touches the database. Alert to your phone.

**P1-7 · Shrink photos before upload.** Phones send 4–12 MB originals; `lib/files/keys.ts` accepts up to 25 MB and nothing resizes or strips EXIF — so a client's phone photo can carry its GPS location. Resize to ~2400 px and drop metadata in the browser before the PUT: faster galleries and presentations on phones, a smaller R2 bill (image 2, #17).

### Visitor (marketing site)

**P1-8 · Brand icons.** `app/favicon.ico` is Next.js's default (25,931 bytes, unchanged since the July baseline). Add the Eve mark as `app/icon.svg` + `app/apple-icon.png`, and delete the five unused create-next-app files in `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`).

**P1-9 · Link previews (Open Graph).** No `opengraph-image`, no `metadataBase`. Your links travel by WhatsApp — the `/join/<token>` invitations, the `/v/<token>` 3D link, the landing page — and today they unfurl with no picture. Add `app/opengraph-image` and set `metadataBase` to the domain (a per-event image for `/v` can come later).

**P1-10 · Titles and descriptions.** The root title "פלטפורמת עיצוב אירועים" doesn't name Eve. Ten pages have no title of their own and show that same root title: `/`, `/catalog`, `/billing`, `/billing/[id]`, `/gallery`, `/settings`, `/studio`, `/suppliers`, `/meeting`, `/present`. Every page shares one description. Add a title template (`%s · Eve`) in the root layout, a real landing title and description, and descriptions for `/login` and `/signup`.

**P1-11 · robots.txt, sitemap.xml, noindex.** None exist. Index only the public pages (`/`, `/signup`, `/login`, the legal pages). Mark the rest `noindex`: `/join/*`, `/client/*`, `/reset`, `/welcome` (today only `/v` has it). Don't block AI crawlers on the marketing pages (image 1, #13) — you want an assistant to answer "תוכנה למעצבי אירועים".

**P1-12 · Canonical URLs.** Add `alternates.canonical` on the public pages.

**P1-13 · Footer and contact.** The footer has section anchors and "כניסה" only. Add privacy, terms, accessibility statement, contact (email + WhatsApp) and about.

**P1-14 · The landing page shows two account types; the product has four.** It says "שני סוגי חשבון" (studio + client), and the studio card is "מעצבי אירועים וספקים". Sign-up offers designer, supplier, venue and client. Venue owners — a whole product (bookings, menus, an occupancy calendar) — aren't mentioned anywhere on the page.

**P1-15 · Real prices** in `#pricing` (after P0-10).

**P1-16 · A real hero.** `HERO_SHOT` is `null`, so the hero shows a drawn plan. Use a real screenshot, plus a 30–60 s video: hall sketch → 3D → quote.

**P1-17 · Search Console.** Verify the domain and submit the sitemap (image 2, #19).

### Studio

**P1-18 · Email for the notifications that matter.** The bell is in-app only (it polls every 60 s). A designer who isn't looking at the app never learns that a client sent a sketch proposal, a venue linked an evening, or a supplier answered an order (P1-25). Send email (WhatsApp later) for: proposal submitted, order answered or declined, venue invitation, installment late.

**P1-19 · Onboarding.** After `/welcome` a new studio lands on an empty dashboard. Add a first-run checklist (draw your hall → catalog → first event → first quote), a sample venue and event to play with, and short videos. The product is deep — a stranger won't find the stage-fill tool on their own.

**P1-20 · Help and support inside the app.** No help pages and no contact. Add a "עזרה" item in the nav: WhatsApp to you, a few articles, the keyboard shortcuts.

**P1-21 · The meeting on a real tablet.** Meeting mode is used beside the client, on a tablet. The 3D on phones and tablets is unverified (CLAUDE.md: "real GPU/phone unseen"; ~2.8 M triangles on plan A). Run the meeting flow on a real iPad and a mid-range Android tablet before selling it.

**P1-22 · The event palette has nowhere to be set.** `ShadePicker` was taken out of the event form on 2026-11-10 and waits for your call on where it goes, so the shade-aware defaults (`defaultVariantId`) have no input today.

### You (operator)

**P1-23 · An admin console.** There is no admin role and no "view as". You can't see who signed up, which studios are active, who is stuck at email verification, or how much storage an org uses — except through scripts, and production reads are refused from here. Minimum: `/admin` gated to your user id — organisations, users, last active, resend verification, disable an account, storage used — plus a read-only "view as" that writes an audit row.

**P1-24 · Subscription billing (after P0-10).** Pick a payment provider that works in Israel (Cardcom, Tranzila, PayPlus, Grow) for recurring charges; add a trial, plan limits enforced in code (members, venues, storage), and failed-payment handling. Each payment also needs a tax invoice/receipt to **your** customer: an invoicing service (Morning / Green Invoice, iCount) issues those automatically and handles allocation numbers for you.

### Supplier

**P1-25 · Orders notify nobody.** `lib/orders` calls neither `notify()` nor email. A linked supplier sees a new order only by opening `/orders`; the studio isn't told when it's confirmed or declined (the runway shows it, if opened). Add the bell + email in both directions.

**P1-26 · Their own door.** A section or page on the landing site, and onboarding ("publish your catalog in three steps", a CSV template).

### Venue

**P1-27 · An invitation to a designer who isn't on Eve goes nowhere.** `inviteDesigner` (`lib/event-links/actions.ts`) only notifies in-app when the address already has an account; otherwise it writes a pending row and nobody is told. Email it — `lib/email/templates/invitation.ts` is the pattern.

**P1-28 · Their own landing page** (P1-14).

### Client

**P1-29 · Phone first.** Clients open `/join`, `/client` and `/v` from WhatsApp on a phone. Test the client sketch and the 3D on a mid-range phone, and add the lighter phone tier if they struggle (an open item in CLAUDE.md).

**P1-30 · Keep token pages out of search** — `noindex` on `/join` and `/client` (P1-11).

---

## P2 — Soon (first three months)

### Everyone

- **P2-1 · Two-factor sign-in for owners.** Better Auth has a `twoFactor` plugin; owners hold billing and client data.
- **P2-2 · Change email address.** The field is read-only (roadmap §5).
- **P2-3 · A full export per studio**: events, drawings, clients, catalog, documents — beyond today's catalog CSV and ledger CSV.
- **P2-4 · An audit log** of sensitive actions: role change, venue grant, document issued or cancelled, member removed, deletions.
- **P2-5 · Scheduled jobs.** `vercel.json` has no crons. Candidates: installment reminders, "quote unanswered a week", expired `/v` links, orphaned R2 files, a weekly digest.
- **P2-6 · Take the self-checks out of the browser bundle.** 193 modules end in an `if (isMain(import.meta.url))` block — about 19,200 lines together. `isMain` is a runtime call, so the bundler cannot drop them, and 45 client chunks in the 13 Nov build contain the checks' strings. Move each block into a sibling `*.check.ts` and point its `check:*` script there. Then measure with the bundle analyzer: 7.7 MB of client chunks raw today, the largest ~1 MB (image 1, #20).
- **P2-7 · Private files behind signed URLs.** Every upload is public to whoever holds its URL (`/api/files` GET, the R2 public domain). Fine for catalog photos; less fine for a studio's signature image and clients' photos. Move those behind short-lived signed URLs, or at least say it in the privacy policy.
- **P2-8 · End-to-end smoke tests in CI.** Playwright lives only in a scratchpad today. Promote five flows: sign-up → venue → event → quote PDF; client join → proposal; supplier order → answer; venue booking → link; billing issue → receipt.
- **P2-9 · Update `docs/roadmap.md`.** It still plans Clerk (replaced by Better Auth), calls the bell decorative (built) and product images "not wired" (done). It's the first doc a helper reads.
- **P2-10 · Cookie consent** — only if you add Google Analytics or an ad pixel. Cookieless analytics (Vercel Analytics, Plausible) avoids it; that is the recommendation for P2-11.

### Visitor

- **P2-11 · Analytics.** There's none at all (image 2, #18). Add cookieless site analytics, and an activation funnel in the app: signed up → venue drawn → first event → first quote issued → first client shared.
- **P2-12 · Audience pages**: `/designers`, `/venues`, `/suppliers` — three buyers with three sets of search words (תוכנה למעצבי אירועים, תוכנה לניהול אולם אירועים, קטלוג ציוד לאירועים) (image 2, #5).
- **P2-13 · Structured data**: Organization, SoftwareApplication (with offers once priced), FAQPage on the existing FAQ (image 1, #8).
- **P2-14 · About page, testimonials, trust signals** — one quote from your first studio and from אמרה as a venue, "data stored in the EU", who's behind Eve (image 2, #7, #10, #11).
- **P2-15 · llms.txt** — a short plain-text description of Eve for AI assistants (image 1, #12).

### Studio

- **P2-16 · Email a quote or a payment request** straight from the app (today: the share sheet / WhatsApp).
- **P2-17 · Online payment** on a payment request (card, Bit) through the provider from P1-24, so the ledger closes itself.
- **P2-18 · ST-9**, the one open QA item — the area a drawing closes with the walls (connected-drawings plan 1b).
- **P2-19 · Leftovers from the last rounds**, listed in CLAUDE.md: the material look on the 2D plan, picking a קאנט's sides on the plan, a bed along a whole block, the corner piece across two stages, the 2D drawing of supplier pieces and glass relief.

### Supplier

- **P2-20 · Availability for rented stock** — two studios renting the same 40 chairs on one night.
- **P2-21 · Marketplace numbers** — views, and how many catalogs added each product.

### Venue

- **P2-22 · Kitchen and floor sheets** (listed as not built) — the menu to the kitchen and the evening's run sheet. A venue needs these first to run the evening from Eve.
- **P2-23 · Seasonal prices, a venue runway, guest list / seating / hostess** (you said later).
- **P2-24 · Cross-studio hall availability** — a model decision (roadmap §6).
- **P2-25 · An online deposit** when a date is held.

### Client

- **P2-26 · Client portal phases 2–4** (spec 2026-10-16): a quote page with online approval that sets `confirmedAt`, pinned comments, a freeze date, a seating chart, email and push.
- **P2-27 · Email the client** when the designer answers their proposal.

---

## P3 — Later

- **Everyone:** row-level security in Postgres as defence in depth (roadmap phase 3); a status page; feature flags.
- **Visitor:** English pages (Hebrew-first is right for now); content articles (how to plan a hall layout, stage builds, quote templates) for internal links and search (image 2, #12).
- **Supplier:** public shop pages — good for search, and a reason for suppliers to join.
- **You:** bounce and complaint webhooks from Resend.
- **Studio:** a tablet "add to home screen" install (web manifest) for meeting mode.
- *Not counted:* location pages (image 2, #6) — not relevant to a SaaS, unless the marketplace grows city pages.

---

## The two checklists, item by item

### Image 1 — "20 hidden vibecoded website giveaways"

| # | Giveaway | Eve | Evidence / item |
| --- | --- | --- | --- |
| 1 | vercel.app URL | ❓ verify | P0-8 |
| 2 | view-source empty | ✅ | `app/page.tsx` is a server component |
| 3 | no 404 page | ✅ | `app/not-found.tsx`, plus `error.tsx`, `global-error.tsx` |
| 4 | Vite + React in the browser | ✅ n/a | Next.js 16 |
| 5 | same page titles | ⚠️ | 10 pages share the root title — P1-10 |
| 6 | no meta description | ⚠️ | one description for every page — P1-10 |
| 7 | no og:image | ❌ | P1-9 |
| 8 | no structured data | ❌ | P2-13 |
| 9 | multiple H1s | ✅ | one `<h1>` on the landing page |
| 10 | no H1 | ✅ | |
| 11 | no canonical tag | ❌ | P1-12 |
| 12 | no llms.txt | ❌ | P2-15 |
| 13 | robots.txt blocks AI | ❌ no robots.txt at all | P1-11 |
| 14 | no favicon | ❌ it's Next's default | P1-8 |
| 15 | no sitemap.xml | ❌ | P1-11 |
| 16 | no lang attribute | ✅ | `lang="he" dir="rtl"` |
| 17 | missing alt text | ✅ | every `<img>` and `next/image` has `alt` |
| 18 | source maps public | ✅ | no `.map` under `.next/static` |
| 19 | console errors | ❓ check live | self-check code ships to the browser — P2-6 |
| 20 | massive JS bundles | ⚠️ | 7.7 MB raw, largest chunk ~1 MB; three.js is lazy (good) — P2-6 |

### Image 2 — "20 things to add after launching"

| # | Item | Eve | Evidence / item |
| --- | --- | --- | --- |
| 1 | Clear H1 | ✅ | |
| 2 | Strong call to action | ✅ / ⚠️ | sign-up CTA in the hero and at the end; no door for venues or suppliers — P1-14 |
| 3 | SEO page titles | ⚠️ | P1-10 |
| 4 | Meta descriptions | ⚠️ | P1-10 |
| 5 | Service pages | ❌ | one page for four audiences — P2-12 |
| 6 | Location pages | n/a | P3 |
| 7 | About page | ❌ | P2-14 |
| 8 | Contact page | ❌ | P1-13 |
| 9 | FAQ section | ✅ | `#faq`; add FAQPage schema — P2-13 |
| 10 | Customer reviews | ❌ | P2-14 |
| 11 | Trust signals | ❌ | P2-14 |
| 12 | Internal links | ⚠️ | anchors only; nothing to link to yet — P2-12, P3 |
| 13 | Image alt text | ✅ | |
| 14 | Privacy policy | ❌ | P0-1 |
| 15 | Terms & conditions | ❌ | P0-2 |
| 16 | Mobile | ⚠️ | landing is responsive; client pages and meeting on a phone or tablet unverified — P1-21, P1-29 |
| 17 | Fast images | ⚠️ | uploads are never resized — P1-7 |
| 18 | Google Analytics | ❌ | none of any kind — P2-11 |
| 19 | Search Console | ❌ | P1-17 |
| 20 | XML sitemap | ❌ | P1-11 |

### What neither checklist covers (added here)

Legal duties specific to Israel (privacy amendment 13, accessibility statement, tax-document rules), security headers, error monitoring, backups, CI, the admin console, how you get paid, bot protection, account deletion, tenant isolation, the missing notifications between businesses (orders, venue invitations), and onboarding and support.
