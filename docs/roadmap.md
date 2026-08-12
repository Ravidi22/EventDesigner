# Roadmap — what is built, and what is left

August 2026 · companion to [01 — requirements](01-מסמך-דרישות.md) and [02 — architecture](02-מסמך-ארכיטקטורה-וטכנולוגיות.md)

Those two say what the product *is*. This one says where it stands. Ordered by what unblocks what, not by size — the first item is next for a reason, and every item names the file that actually changes.

**Where it stands.** Every screen in the product exists and works. The system runs against a real Postgres with real accounts. What is missing is not features: it is that the most valuable object in the app — the design document — still lives in a browser profile, that nothing is hosted anywhere, and that the entire visual half of the product is waiting on a file bucket that has not been opened yet.

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

Every domain goes through a `lib/<domain>/` module, so each crossing is a one-file change (that claim has now been tested six times).

- [x] **Accounts and sessions** — `lib/auth/`, sessions revocable, token stored hashed
- [x] **Events** — `lib/events/actions.ts`, status derived from the meeting stage
- [x] **Catalog** — `lib/catalog/actions.ts`
- [x] **Venues, structures, zones** — `lib/venues/actions.ts`
- [x] **Studio settings + meeting flow** — `lib/settings/actions.ts`
- [x] **Client portal** — `lib/client-portal/actions.ts`
- [x] **Studio members** — `lib/team/actions.ts`; a member is a `users` row, not a parallel list
- [x] **Venue grants** — per-member venue access, enforced on every read and write

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

---

## Left

### 1. Design documents → Postgres · **next**

The last thing of real value living in a browser profile. Events and the catalog survive a lost laptop; the plans themselves do not, and the only backup is a "download JSON" button.

- [ ] `lib/studio/storage.ts` swaps to a server action — the seam is already cut, no screen above it changes
- [ ] Quotes lock to a real `version` number instead of comparing serialized documents (`lib/quotes/storage.ts`)
- [ ] Gallery, packing spares and export versions follow on the same pattern

The `design_documents` table already exists with a `version` column, and each save is a new row — that is what F-6.4 and F-7.4 need.

### 2. Go live — Neon + Vercel

Once (1) lands, hosting means real backups instead of a device-bound app in the cloud.

- [ ] Point `DATABASE_URL` at Neon's **pooled** host; teach `drizzle.config.ts` to prefer `DIRECT_URL` for migrations (a migration through a pooler hangs with no error to read)
- [ ] Switch from `db:push` to generated migrations, since there will be data worth not losing
- [ ] First real organisation instead of the seed's placeholder

Budget: **$26–44/month** all in — see §9 of the architecture doc.

### 3. File storage (R2) — the visual half

One missing capability blocks three features. Until it exists the gallery shows an empty state and `PlanUnderlay` is a type nothing renders.

- [ ] Presigned upload straight from the browser to the bucket; public read through a custom domain
- [ ] Gallery photography and product images
- [ ] **Underlay tracing** (F-3.5) — place a photo or scan under the wall graph and draw over it
- [ ] **Calibration** (F-3.4) — `mmPerUnit` is hardcoded to `1` at every call site today; tracing a real plan is the moment it starts to matter

### 4. Clerk

Blocks nothing, which is why it is not first — but do it **before the first outside studio signs up**. Migrating zero passwords beats migrating real ones.

- [ ] Clerk answers "who"; roles and tenancy stay in our own tables (ADR-10)
- [ ] Retires `lib/auth/password.ts`, `lib/auth/session.ts`, the `sessions` table and the cookie guard — ~570 lines that are a liability to own
- [ ] Brings verification, reset and invitation email with it

### 5. Delivery and notifications

- [ ] **Venue guest invitations are still undeliverable** — `shareVenue({ kind: "guest" })` writes a pending grant and sends nothing. A guest is another studio's designer, so joining them needs a cross-org account flow, not just a password screen
- [ ] **The bell in the top bar is decorative** — an icon button with no handler and no table behind it. Worth building only once there is more than one thing to announce (a venue shared with an existing teammate is the first real candidate)
- [ ] **Product email** (Resend, free to 3,000/month) once a sending domain exists — mailing a quote to a client is the first genuine need

### 6. Account management

- [ ] Password change and reset by email — currently neither exists
- [ ] Changing your sign-in address (needs verification of the new one before the old stops working; the field is deliberately read-only until then)

### 7. Known rough edges

Small, real, and each one is a decision already made rather than an oversight:

- [ ] **No "you have no access to this property" state.** A designer opening an event booked into a venue nobody shared with them gets an empty plane instead of an explanation — `fetchVenueGeometry` returns empty geometry rather than throwing, because throwing would take down the studio screen mid-meeting. The honest fix is a state next to the plan
- [ ] **Venue-guest availability has no surface.** `grantScope()` promises guests anonymous busy/free dates, and the Gantt has nowhere to show them. This is the one thing two studios sharing a hall genuinely need
- [ ] **The outputs surface wants a redesign** — the quote stage renders the existing screen and was always marked provisional
- [ ] **`F-8.2` is cited in code** (`lib/team/types.ts`) but no such requirement exists in `docs/01` §5.8 — the team screen was built ahead of its spec line

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
npm run check:actions  # the design-document action layer
npm run check:access   # the venue access policy
npm run db:verify      # full roundtrip against a real Postgres
```
