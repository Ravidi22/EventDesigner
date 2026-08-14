# Roadmap — what is built, and what is left

August 2026 · companion to [01 — requirements](01-מסמך-דרישות.md) and [02 — architecture](02-מסמך-ארכיטקטורה-וטכנולוגיות.md)

Those two say what the product *is*. This one says where it stands. Ordered by what unblocks what, not by size — the first item is next for a reason, and every item names the file that actually changes.

**Where it stands.** Every screen in the product exists and works. Every domain lives in Postgres — the design document included, which was the last thing of real value sitting in a browser profile. Files upload, to a folder on disk today and to R2 the moment five environment variables are set. **It is hosted now**: Neon in `eu-central-1`, Vercel deploying from `master`, schema applied by a generated migration rather than by `db:push`.

**What is left is now almost entirely accounts.** Everything that can be built without signing up for a service has been. Two blockers are still credentials — R2 and Clerk — and everything else is either a decision only you can make or a piece of work nobody has started.

**The one thing hosting did not buy:** files. `lib/files/driver-local.ts` writes to a disk that a serverless instance does not keep, so gallery photography — which is *built* — accepts an upload in production and loses the bytes when the container recycles. R2 is not only for the unbuilt half.

---

## At a glance

### Done

| Area | State |
| --- | --- |
| **Product surfaces** | All eleven screens built: dashboard, meeting flow, catalog, halls, studio 2D, gallery, outputs, Gantt, present mode, client portal, settings |
| **Canvas** | One hand-written SVG canvas for every plan surface (ADR-8). No Konva anywhere |
| **Backend migration** | **Finished.** Twelve domains through `lib/<domain>/actions.ts`. Nothing of the studio's is left in a browser |
| **People and access** | Accounts, sessions, two role ladders, per-member venue grants enforced on every read and write, invitations by link |
| **File storage** | Seam built. Upload → store → serve verified end to end on the local driver, with every boundary refused; gallery photography wired, old files cleaned up on replace. The R2 signing path is written and self-checked but **has never been answered by a real bucket** — see §2 |
| **Account management** | Password change (needs no email, so it did not wait for one) |

### Left

| What | Blocked on | Size |
| --- | --- | --- |
| ~~**Neon + Vercel** — go live~~ | **done** | Frankfurt, migrations, deployed. Only the first real organisation is left |
| **Turn R2 on** | 🔑 account | Five env vars + CORS and public-read on Cloudflare's side |
| **Clerk** — retire ~570 lines of our own auth | 🔑 account | Do it *before* the first outside studio signs up |
| **Email** — password reset, quotes to clients, guest invitations | 🔑 a sending domain | Resend, free to 3,000/month |
| **Product images** | nothing | ~3 lines; the catalog drawer just is not wired |
| **Underlay tracing (F-3.5) + calibration (F-3.4)** | nothing | Real canvas work. The upload half already exists |
| **Outputs redesign** | 🤔 your design direction | The quote stage was always marked provisional |
| **Cross-studio hall availability** | 🤔 a modelling decision | See §6 — two studios cannot book one hall today, by construction |
| **Notification bell** | deferred on purpose | Worth building once there is more than one thing to announce |
| **Lint pass** | nothing | 20 pre-existing `set-state-in-effect` errors in four `use-*.ts` hooks |

🔑 needs an account · 🤔 needs a decision from you

---

## Done

### The product surfaces

- [x] **Dashboard** — calendar, today's focus, statistics, event drawer
- [x] **Meeting mode** (`/meeting`) — the guided client flow, stage by stage
- [x] **Catalog** — products, variants, category fields, map appearance, custom shapes, CSV import
- [x] **Halls** (`/halls`) — the venue's wall graph drawn and edited in-app: walls, doors, fixed features, zones over regions
- [x] **Studio 2D** — placement on the plan, catalog rail, inspector, apply-to-all-tables, fit warnings, continuous autosave, undo/redo
- [x] **Gallery & presentations** — curation, presentation mode, the event's liked-images folder
- [x] **Outputs** — placement map, packing list with spares, quote with discount/VAT, print to PDF
- [x] **Gantt** — events across zones over time
- [x] **Present mode** (`/present`) — the client-facing screen, no prices or internal data
- [x] **Client portal** (`/client`) — a client account seeing their own event
- [x] **Settings** — business letterhead, configurable meeting flow, account, team, venue sharing, data export

### The canvas

- [x] **One canvas for every plan surface** — `components/plan-canvas.tsx`, 2,362 lines of hand-written SVG. No Konva, no second SVG implementation anywhere (ADR-8)

### The backend migration

Every domain goes through a `lib/<domain>/` module, so each crossing is a one-file change (that claim has now been tested nine times). **It is finished** — nothing of the studio's is left in a browser.

- [x] **Accounts and sessions** — `lib/auth/`, sessions revocable, token stored hashed
- [x] **Events** — `lib/events/actions.ts`, status derived from the meeting stage
- [x] **Catalog** — `lib/catalog/actions.ts`
- [x] **Venues, structures, zones** — `lib/venues/actions.ts`
- [x] **Studio settings + meeting flow** — `lib/settings/actions.ts`
- [x] **Client portal** — `lib/client-portal/actions.ts`
- [x] **Studio members** — `lib/team/actions.ts`; a member is a `users` row, not a parallel list
- [x] **Venue grants** — per-member venue access, enforced on every read and write
- [x] **Design documents** — `lib/studio/actions.ts`. Autosave updates one row; a *version* is minted only when an output seals the drawing, so an evening's dragging is one row rather than thousands, and a sealed drawing can never move again
- [x] **Issued quotes** — `lib/quotes/actions.ts`. F-7.4 compares two integers instead of two serialised documents, and the drawing a client was quoted from is still on disk to compare against
- [x] **Packing spares + exports** — `lib/outputs/actions.ts`. An export is a row naming the drawing it came from, not a counter in a browser
- [x] **Gallery** — `lib/gallery/actions.ts`. The event folder was the half that mattered: the client likes photos on a tablet, and the studio rail that pins what they loved is on the designer's laptop. `productName` is joined from the catalog now, so renaming a product re-captions its photos

Two things the crossing turned up, both fixed here:

- `packing_spares.variant_id` had a foreign key to `product_variants` — but a "variantId" is a *product's* id whenever that product has no variants (`defaultVariantId`), so a reserve on any un-varianted product would have been rejected the first time a designer typed one. The key is gone and the reason is written on the table
- The settings **data-and-backup panel** was still telling designers their catalog, venues, events and plans "are stored in this browser only" and to export a backup after every working evening. That is now the reverse of the truth, and a backup button that points at the wrong copy is worse than none — the copy says what the file actually holds (which event this device had open, and a scratch drawing)

### People and access

- [x] **Sign up / sign in / sessions**, two account kinds (studio, client)
- [x] **Two role ladders** — `StudioRole` (owner/designer/crew) for the business, `VenueRole` (viewer/editor/manager) for one property
- [x] **Per-member venue access, enforced** — the owner reaches every property; everyone else reaches what they drew or were given. A designer who creates a venue gets a manager grant in the same transaction
- [x] **Sharing with a level** — member or guest, viewer/editor/manager. A guest gets plan + anonymous availability, never events, clients or prices (`npm run check:access` asserts that line)
- [x] **Invitations by link** — `/join/<token>`, copy or send by WhatsApp, 14-day expiry, regenerate invalidates the old link. Nothing is mailed, on purpose

### Documentation and hygiene

- [x] `docs/01` v0.4 and `docs/02` v0.4 — the cancelled PDF-import path recorded, not silently deleted
- [x] `docs/architecture.html` — what runs where, the three rented services, the monthly bill
- [x] `.env.example` rewritten for Neon + R2 + Clerk
- [x] `CLAUDE.md` — the seam rules and the two ladders
- [x] `pdfjs-dist` removed (unused since PDF import was dropped)
- [x] `npm run db:verify` covers the three new domains — including the two rules that would be expensive to break quietly: autosave must not mint a version, and a sealed drawing must be unreachable by any later save
- [x] **The race that used to lose a drawing**, found while writing those checks and fixed with them: `saveDocument`'s writes are guarded by `sealed = false`, so a seal landing between its read and its write (a colleague issues the quote while a designer keeps drawing) matched no row — and the function reported success anyway, leaving the studio showing נשמר over an edit that was never written. Every write counts the rows it touched now, re-reads, and opens the next version; three failed passes throw rather than lie. `db:verify` reproduces the race

---

## Left

Ordered by what unblocks what. Some sections below carry a checked item among the unchecked ones — that is deliberate: half of "account management" is done and half waits on email, and separating them would put the reason for one on a different page from the other.

### 1. Go live — Neon + Vercel · **done, bar one item**

- [x] Point `DATABASE_URL` at Neon's **pooled** host — project `Eve` / `icy-rice-92083559`, `aws-eu-central-1`, Postgres 18. Frankfurt rather than Ohio because no Neon region is nearer Israel, and the region cannot be changed after a project is created
- [x] `drizzle.config.ts` prefers `DIRECT_URL` and falls back to `DATABASE_URL` — migrations take the direct host, the app takes the pooled one (a migration through a pooler hangs with no error to read)
- [x] Switch from `db:push` to generated migrations. Done at the cut-over as planned, against an empty Neon: the two stale files (19 tables, never applied anywhere) were archived, `drizzle/0000_baseline.sql` generated from `schema.ts` — 21 tables, 57 indexes and constraints — the `public` schema dropped, and the baseline *applied*, so the schema is produced by the migration rather than merely resembling it. `__drizzle_migrations` has one row
- [x] `vercel.json` pins functions to `fra1`, so they run beside the database rather than across an ocean from it
- [x] The local container tracks Neon's major version (18). Not a one-line change: the 18 image moved its mount to `/var/lib/postgresql`, and a data directory cannot be upgraded in place
- [ ] **First real organisation instead of the seed's placeholder** — the only step left, and it is a signup form

**Deploying does not run migrations.** Nothing applies `drizzle/*.sql` to Neon on push; a schema change reaches production only when someone runs `db:migrate` with `DIRECT_URL` set to the direct host. Worth automating before the first schema change that matters, and worth remembering until then.

Budget: **$26–44/month** all in — see §9 of the architecture doc.

### 2. File storage — the visual half

**The seam is built and uploading works today.** `lib/files/` owns the storage decision the same way every domain module owns its own: R2 when all five environment variables are set, and a folder on disk (`.uploads/`, served by `app/api/files`) otherwise. Turning R2 on is those five lines — nothing above the driver changes.

The shape is R2's on purpose, not the local driver's: the browser asks for a ticket and PUTs the bytes straight to storage, so files never pass through the Node process. A local driver that took the easy route (bytes posted through a server action) would be a seam that lies about what it stands in for.

- [x] **Presigned upload straight from the browser**, public read — `lib/files/sigv4.ts` signs without pulling in ~15MB of AWS SDK for one URL
- [x] **Gallery photography** — pick a file when adding a photo; a photo-less row is still valid and renders its `tone` tile. One `<Photo>` component now serves all five places that used to each render the tile themselves
- [x] Replacing a photograph deletes the one it replaced, so re-uploads do not quietly accumulate objects on a bill nobody is watching
- [ ] **Product images** — same three lines (`uploadFile` → store the url); the catalog drawer just has not been wired yet
- [ ] **Underlay tracing** (F-3.5) — place a photo or scan under the wall graph and draw over it. The upload half exists (`kind: "underlay"`); the canvas half does not
- [ ] **Calibration** (F-3.4) — `mmPerUnit` is hardcoded to `1` at every call site today; tracing a real plan is the moment it starts to matter

**What is verified, and what is not.** The local path was exercised end to end against a running server: an authenticated PUT stores bytes, a public GET returns them byte-identical with immutable cache headers, and every boundary refuses — another studio's key prefix (404), an SVG (415), an empty body (400), no session (401), a traversal key (rejected). The R2 path is checked against published SHA-256 and RFC 4231 vectors and asserted for structure and determinism, but **no byte has ever landed in a real bucket** — that needs an account. If the first PUT returns 403, the canonical request is where to look. Cloudflare also needs two things set on its side that no environment variable here can express: CORS allowing PUT from the app's origin, and public read on the custom domain.

### 3. Clerk

Blocks nothing, which is why it is not first — but do it **before the first outside studio signs up**. Migrating zero passwords beats migrating real ones.

- [ ] Clerk answers "who"; roles and tenancy stay in our own tables (ADR-10)
- [ ] Retires `lib/auth/password.ts`, `lib/auth/session.ts`, the `sessions` table and the cookie guard — ~570 lines that are a liability to own
- [ ] Brings verification, reset and invitation email with it

### 4. Delivery and notifications

- [ ] **Venue guest invitations are still undeliverable** — `shareVenue({ kind: "guest" })` writes a pending grant and sends nothing. A guest is another studio's designer, so joining them needs a cross-org account flow, not just a password screen
- [ ] **The bell in the top bar is decorative** — an icon button with no handler and no table behind it. Worth building only once there is more than one thing to announce (a venue shared with an existing teammate is the first real candidate)
- [ ] **Product email** (Resend, free to 3,000/month) once a sending domain exists — mailing a quote to a client is the first genuine need

### 5. Account management

- [x] **Password change** — `changePassword` in `lib/auth/actions.ts`, on the account screen. Needs no email, which is why it did not wait for one: it requires the CURRENT password (a session cookie is a bearer token, so a borrowed laptop must not be enough to take an account away from its owner) and ends every other session, which is what a person actually wants when they change a password they think someone else knows
- [ ] **Reset by email** — for someone who has *forgotten* it. This half genuinely waits on a sending domain
- [ ] Changing your sign-in address (needs verification of the new one before the old stops working; the field is deliberately read-only until then)

### 6. Known rough edges

Small, real, and each one is a decision already made rather than an oversight:

- [x] **"You have no access to this property" state.** `fetchVenueGeometry` now returns *why* it is empty (`VenueGeometry.access`: `none` / `granted` / `denied`) instead of the same blank plane for both, and the studio, the placement map, the packing list and the quote each say so. It still does not throw — that would take down the studio screen mid-meeting.
  - Worth recording what this turned up: the silence was not only rude, it was **mispriced**. A drape measures its metres off the wall it hangs on, and with no wall it falls back to the product's catalog width — so a 14-metre run quoted as 3 metres of fabric on a screen that looked merely empty. The notice on the quote and the packing list says exactly that
- [ ] **Venue-guest availability has no surface.** `grantScope()` promises guests anonymous busy/free dates and the Gantt has nowhere to show them — but it is **blocked on a model decision, not on UI**: `venue_grants.grantee_org_id` is null until phase 3, and `assertPlacement` requires an event's venue to belong to the event's own studio, so two studios cannot book the same hall today. Decide how a cross-studio booking is represented first
- [ ] **The outputs surface wants a redesign** — the quote stage renders the existing screen and was always marked provisional
- [x] **`F-8.2` and `F-8.3` are cited in code but were missing from `docs/01`** — §5.8 now carries both: the studio's people, and venue sharing with the guest line written where the requirement can be read rather than only where it is enforced

---

## Not scheduled

**Phase 2** (per §6 of the requirements): 3D in approximation, the client viewing link, saved viewpoints.

**Phase 3**: billing, onboarding, full tenant isolation with RLS.

**Cancelled and not to be rebuilt without reading why**: PDF import and automatic table recognition (ADR-3), Konva (ADR-8), server-side Playwright PDF rendering (ADR-9). Each removed a dependency, a service or a monthly bill. See appendix ב' of `docs/01`.

---

## The gates

Before anything is called done:

```
npm run typecheck      # tsc --noEmit; a Stop hook runs this too
npm run check:actions  # the design-document reducer + undo history
npm run check:access   # the venue access policy
npm run check:files    # key shape, path traversal, the upload allowlist
npm run check:sigv4    # the R2 signing chain, against published crypto vectors
npm run db:verify      # full roundtrip against a real Postgres
```

`npm run lint` currently reports 20 pre-existing `react-hooks/set-state-in-effect` errors in four `use-*.ts` hooks. They are not in the list above because they predate this work and are not gating it — worth a pass of their own.
