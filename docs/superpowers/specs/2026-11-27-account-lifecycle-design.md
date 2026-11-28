# Account lifecycle — close, delete, export, audit, 2FA, change email

**Round 4 of EVE-1** (production readiness). Tickets: EVE-22 (close the business / delete my account),
EVE-51 (full export), EVE-52 (audit log), EVE-49 (two-step sign-in), EVE-50 (change email).
Branch `feat/2026-11-27-account-lifecycle`, worktree `.claude/worktrees/lifecycle`, stacked on
`feat/2026-11-27-legal` (PR #4) — merge #2 → #3 → #4 before this one.

Ravid's answers (2026-11-27): "do your recommendations" on all thirteen questions; §3 lists them.

---

## 0. What exists today

- **One person, one business.** `users.organization_id` is one organisation (null for a client
  account, kind `client`). A studio has exactly ONE owner (`lib/team/actions.ts` refuses a second;
  roles owner · designer · crew). Organisations are `studio | supplier | venue`.
- **Almost no foreign key to `organizations` on tenant rows.** `organization_id` is a bare
  `uuid NOT NULL` (`orgId()` in lib/db/schema.ts); the exceptions are `studio_settings` (CASCADE)
  and the two cross-business links `suppliers.linked_org_id` and `orders.supplier_org_id`
  (SET NULL). Deleting an organisation row therefore leaves nearly everything behind;
  `scripts/delete-organization.ts` (operator-only) discovers every table with an
  `organization_id` column and every FK to `organizations`/`users` from `pg_constraint` and
  deletes in up to ten passes.
- **Links to `users`** are all `cascade` or `set null` (sessions, accounts, venue grants, client
  access, Google connection, crew, notifications cascade; sketch proposals' `created_by` /
  `submitted_by` / `resolved_by`, scene links' `created_by`, `billing_documents.issued_by`,
  `event_links.invited_by` set null).
- **What cannot simply be deleted:**
  - `billing_documents` — immutable; the trigger `billing_documents_frozen` (drizzle/0023) refuses
    an UPDATE to every column but the allocation number, the original/sent/cancelled stamps and the
    superseding link. `event_id` → events is **RESTRICT**. A document holds its own customer, lines
    and totals, but the page (`fetchDocument`, lib/billing/actions.ts; `document-page.tsx`) draws
    much of what it prints LIVE: the studio's identity, bank details, logo, signature and Instagram
    from `studio_settings`, and the event's client name, type, date, zones and venue name from the
    event; the ledger joins `events.client_name`.
  - **Venues other businesses use.** Every business may open every venue; `events.venue_id` and
    `event_zones.zone_id` are **RESTRICT**, so a venue another studio's event stands in cannot be
    deleted.
  - `expenses.supplier_id` and `orders.supplier_id` → suppliers are RESTRICT (same tenant — an
    ordering question for the erase, nothing more).
- **⚠ A live bug.** `billing_documents.issued_by` is `ON DELETE SET NULL` and the trigger forbids
  changing it, so deleting a user who ever issued a document FAILS — today's `removeMember` on such
  a member, and any account deletion. Fixed in this round (§5.6).
- **Better Auth 1.7.10** (lib/auth/auth.ts): only `nextCookies()`; reset and verification mail
  through `sendLater(sendEmail…)`; `requireEmailVerification` only when mail is on. It reads and
  returns whole `users` rows — a new `users` column must be in the database BEFORE the code that
  declares it deploys. The `two-factor` plugin ships in the package; `changeEmail` and `deleteUser`
  are core options (off).
- **The seam.** `currentSession()` (lib/auth/session.ts, per-request `cache`) → `currentActor()` /
  `currentOrg()` (lib/db/org.ts) is the one place every studio action passes; page guards are
  lib/auth/guard.ts.
- **Files** live under `<organizationId>/<kind>/<uuid>.<ext>` (lib/files/keys.ts). The driver deletes
  one key; it cannot list.
- **Mail** (`sendEmail`, lib/email/send.ts) answers "email off" without Resend — parked with the
  environment. **No scheduler** — parked (EVE-53).
- **Settings → נתונים וגיבוי** (`app/(app)/settings/data-section.tsx`) still exports and imports a
  `localStorage` snapshot (`lib/settings/data`) from before the Postgres migration — it exports this
  browser's leftovers, not the studio.
- **The legal drafts already promise this round** (`lib/legal/docs/privacy.ts` §95–113,
  `terms.ts` §141–142): deletion within `{{retentionAfterClose}}`, tax documents kept
  `{{taxRecordsYears}}` years. Both facts are null in lib/legal/facts.ts, owed through EVE-84.

## 1. What this round is, and why

A business can leave Eve on its own, take everything it made with it, and know what is kept and
for how long; a person can leave a business; a client can delete their login. The privacy policy
promises it, Google's OAuth review expects it (EVE-18), and today only Ravid can do it by script.
Around it, the owner can see who did what (audit log), protect the sign-in with a second step, and
change the address they sign in with.

**Goals**
- An owner closes the business from settings; it is locked at once, can be reopened for 30 days,
  then erased — except what the law makes us keep, which is kept untouched and erased when its
  years are over.
- A designer or crew member deletes their own account; a client deletes their login.
- An owner downloads the whole business as one zip, open or closed.
- Sensitive actions leave a row an owner can read.
- Two-step sign-in, offered to everyone, nudged for owners. Change of sign-in email, verified.

**Non-goals** — ownership transfer; an owner leaving without closing; an admin console (EVE-41 —
it will write to this audit log); the timer that runs the erase (EVE-53, parked); mail (parked);
PDFs in the export; SMS or email codes for two-step sign-in; restoring an erased business.

**Anti-goals** — anything that edits or deletes an issued billing document before its years are
up; an erase that deletes or edits another business's rows (a link from their row to something
that is gone becomes null, as the schema already says — §5.4 lists each); a closed business that
still answers its
public links; an export that carries a password hash, a token or a Google credential; a "deleted"
person whose name lingers in another business's records it has no right to keep.

## 2. Words

- **Close** — the owner's act. The business is LOCKED from that moment.
- **Grace** — 30 days after closing during which the owner may reopen. `CLOSE_GRACE_DAYS = 30`.
- **Erase** — what happens after grace: every row and file of the business goes, except the
  RETAINED records.
- **Retained** — issued billing documents and what they need to stay meaningful (§5.4), kept until
  `retain_until`; venues other businesses' events stand in, kept until no event uses them.
- **Gone** — nothing of the business is left.

## 3. Decisions (Ravid, 2026-11-27 — "do your recommendations")

1. Grace is **30 days**.
2. During grace everyone but the owner is locked out at once; the owner signs in only to a
   "closed — reopen or download" screen.
3. Closing locks at once; the erase is a function a timer will run later (EVE-53). Until then it
   runs by script and the closed screen shows the owner the date it is due.
4. Billing documents stay exactly as issued (client names included), not shown in the app,
   available to the owner on request and included in the export; when the tax-record years are
   over the same erase removes them.
5. A closed business's venues that other businesses' events use stay, read-only and ownerless,
   and are erased once no event uses them.
6. No ownership transfer for now; closing is the owner's only way out.
7. Designers and crew delete themselves from "החשבון שלי"; their name on past work becomes
   "חבר/ת צוות לשעבר".
8. A client deleting their login loses only the login; what the studio keeps about them as a
   customer is the studio's record (the studio is the controller, Eve the processor). A line for
   the lawyer.
9. The export is one zip, owner only: all the data, readable tables (events, clients, catalog,
   billing), the photos, every billing document as its frozen record. No PDFs.
10. The audit log records role changes, member removals, venue sharing, documents issued or
    cancelled, deletions, exports and closing; the owner reads it in settings; it lives as long as
    the business.
11. Two-step sign-in is offered to everyone, with a reminder for owners, never forced.
12. Change email is built now and shown only once mail is on.
13. **PR A**: export + close/delete + audit log (+ the `issued_by` fix). **PR B**: two-step sign-in +
    change email.

## 4. Approaches

**Where the export zip is assembled.**
- *A. On the server*, streamed from a route handler. Simple for the browser, but the run time and
  memory limits are the host's — and the host is the open environment question.
- *B. In the browser* (chosen): the server hands over the data as JSON; the browser fetches each
  photo through the same-origin `/api/files/<key>` proxy and zips with `fflate` (streamed, photos
  stored without recompression). It is how the quote PDF is already built, it depends on no host
  limit, and `fflate` (~8 KB gzip, MIT) loads only on that settings section.
- *C. Two downloads* (data zip + a photo zip): no gain over B and two things to keep together.

**How the lock is enforced.**
- *A. One check at the seam* (chosen): `currentSession()` learns whether the business is closed in
  the query it already makes; `currentActor()` refuses a closed business; page guards send the
  owner to `/closed`; Better Auth refuses to create a session for a member of a closed business.
  Every studio action is covered without being touched — the same way clients were refused.
- *B. A check per action* — forty places to forget one.

**Where "closed" is stored.**
- *A. A row of its own, `organization_closures`* (chosen) — the lifecycle (closed, due, erased,
  retained until, the issuer snapshot) lives together and the `organizations` row is untouched.
- *B. Columns on `organizations`* — the same migration-first deploy, and the tombstone's data
  spread across a row every screen reads.

**Which tables the export and the erase cover.** One registry, `lib/account/tables.ts`, names
every table that holds a business's rows with its export rule and its erase rule; `check:account`
fails when the schema has a table with `organization_id` (or a link to `users`) the registry does
not classify. The operator script's run-time discovery stays as the operator's tool; the app does
not delete by guessing.

## 5. The design

### 5.1 States

`open` → (close) → `closed` (grace) → (erase, due) → `erased` (retained records only) → (retention
over, nothing left) → `gone` (no rows). `closed` → (reopen) → `open`. A closure row exists from
close until gone; `erased_at` null = still in grace.

### 5.2 Close and reopen (owner, any kind of business)

Settings → a last section **"סגירת העסק"**, owner only, ordinary ink (not a red page). It says in
plain words: what is locked now, the date it will be erased, that it can be reopened until then,
what is kept and for how long, and recommends downloading the export first (the button is right
there; not forced). Closing asks the owner to type the business name, then confirms through
`ConfirmDialog` (destructive weights).

`closeBusiness({ confirmName })` (lib/account/actions.ts, owner only):
1. One transaction: write `organization_closures` (`closed_at`, `closed_by`, `erase_after =
   closed_at + 30 days`, `name`); delete every session of every member except the owner's current
   one; delete pending invitations; audit `business.closed`. (The issuer snapshot is taken at
   ERASE, §5.4 — a business that reopens and changes its address must not be retained with the old
   one.)
2. After: mail the owner (when mail is on) with the due date and how to reopen. Members are told
   nothing by the app beyond the sign-in refusal (DECIDE-4).

`reopenBusiness()` — the closed owner only, while `erased_at` is null: deletes the closure row;
audit `business.reopened`. Members sign in again as before (their sessions were ended; their rows
were not touched).

### 5.3 The lock (during grace)

- `currentSession()` reads the closure with the organisation kind (one query) and returns
  `closed: { closedAt, eraseAfter } | null`.
- `currentActor()` throws `BusinessClosedError` for a closed business — every studio action, for
  the owner and the members alike. The few things allowed while closed go through
  `closedMember()` instead, which returns the person and their role.
- Page guards (`requireSession` and the guards built on it) redirect anyone of a closed business
  to `/closed` (in `app/`, outside `(app)`), which differs by role:
  - **the owner:** "העסק נסגר ב־X · יימחק ב־Y", the export, "פתיחה מחדש", sign out. When
    `erase_after` has passed but the sweep has not run: "המחיקה מתוזמנת" — still reopenable until it
    runs (DECIDE-2).
  - **a member:** "העסק נסגר ב־X על ידי הבעלים · החשבון שלך יימחק איתו ב־Y", "מחיקת החשבון עכשיו",
    sign out. A member is locked out of the business at once (sessions ended at close; nothing but
    this page), yet never stuck: their address stays taken until the erase, which may be late
    while the timer is parked, so they can free it themselves (DECIDE-12). On reopen, a member who
    did not delete their account signs in as before.
- **Outward faces of a closed business go dark at once:** its clients' portal pages
  (`lib/client-portal/reads.ts`) and its `/v/<token>` links (`sceneByToken`) answer as for an
  unknown event — the client page says "הסטודיו סגר את החשבון"; a supplier's shop and published rows
  leave the marketplace (`published()`); a venue owner's designer invitations stop being
  acceptable; the Google push stops.
- **Its venues, from the moment it closes:** existing events of other businesses keep standing in
  them and keep opening them read-only, but no NEW event may be placed in one and they leave the
  venue directory (`assertPlacement`, `fetchVenueDirectory`, the venue pickers filter closing and
  erased owners) — otherwise "erased once no event uses them" might never come true. Reopening
  lifts it.
- **What else other businesses keep seeing during grace:** an order a studio sent a closed supplier
  stays in the studio's list (the supplier cannot answer); a designer linked to a closed venue
  keeps their event (it stops following the booking).

### 5.4 The erase (after grace)

`eraseDueBusinesses({ now, dryRun })` in `lib/account/erase.ts` — a PLAIN module (never
`"use server"`; it takes ids and trusts them, like lib/notifications/write.ts). Run by
`npm run accounts:erase-due` (dry run unless `--yes`; prints what each due business would lose
and keep) until the timer exists. Per due business, ONE transaction:

1. **Find what is retained.** "Exactly as issued" (decision 4) means a retained document must still
   print as it printed, so everything its page draws is kept:
   - every `billing_documents` row of the business;
   - the `events` those documents name (RESTRICT) — kept as SKELETONS: id, organization, date,
     event type and client name (all four are printed); every other personal and free-text column
     blanked, `venue_id` set null (DECIDE-5);
   - the event facts the page reads through other rows, snapshotted per retained event into the
     closure's `printed` jsonb: the venue name and the zones label;
   - the `issuer` snapshot into the closure: everything the page reads from `studio_settings`
     (business name, owner name, business number, address, phone, email, VAT status, VAT rate and
     currency, bank details, Instagram, BSD line, and the logo and signature file keys);
   - those two files, and the sealed `design_documents` an order names (`design_document_id` is
     frozen on the document);
   - `document_counters` are NOT kept (nothing more will be issued);
   - venues of the business that another business's event stands in (`events.venue_id` or
     `event_zones` → its zones), with their structures, zones and files (logo, plan underlay).
2. **Delete everything else** the registry lists for the business, in an order the RESTRICT links
   allow (expenses and orders before suppliers, child rows before events, …): events and all their
   children, drawings, catalog, gallery, settings, suppliers, orders, appointments, Google
   connections (best effort: the calendar Eve created in each member's Google account first),
   notifications, menus, sketch templates, venues no one else uses, venue grants on the venues
   that stay (so nobody can edit them), grants the business held on OTHER businesses' venues,
   every member's `users` row (cascading their sessions, accounts, grants, crew rows), and the
   PENDING client rows it created and nobody accepted (`lib/events/client-actions.ts` — unsharing
   already deletes those). A client who accepted keeps their login: it is their own account with
   Eve, and they can delete it (§5.7) (DECIDE-13).
3. **Stamp** `erased_at = now`, and `retain_until` = the end of the tax year of the latest
   document date + `TAX_RECORDS_YEARS` (§5.5). With nothing retained, the closure and the
   organisation rows go too — the business is gone.
4. **After the commit, the files**: every object under `<organizationId>/` except a KEEP list —
   the issuer's logo and signature, and the files of retained venues (driver gains `removePrefix(
   prefix, keep)` — R2 ListObjectsV2 + DELETE per key; local: walk the folder). `files_erased_at`
   is stamped when everything not kept is gone; a sweep picks up any business with `erased_at` set
   and files not yet erased (a failed delete is retried, never fatal). Kept files go with what kept
   them (a retained venue's on its last sweep; the issuer's when the business is gone).

**Other businesses after the erase.** Their rows are never deleted or edited; links from their rows
to what is gone become null, as the schema already says, and each is in `db:verify:account`:
- A venue that stayed is read-only for everyone (no grants left, no member to own it), its owner
  shown by the tombstone name; it goes on the first sweep after no event uses it. Only an EVENT keeps
  a venue alive: another studio's saved sketch or diary meeting in a venue that goes loses its
  `venue_id` (SET NULL, as today) (DECIDE-14).
- Event links: the bookings of an erased VENUE business are deleted, and `event_links.venue_event_id`
  is CASCADE, so the link row goes with them — before deleting, the erase rings the bell of each
  linked designer ("האולם <name> סגר את החשבון — האירוע שלך נשאר, בלי הקישור"). An erased DESIGNER's
  events go; `studio_event_id` becomes null and the venue's booking shows the link ended (the
  booking screen draws a null designer event as "המעצב/ת סגר/ה את החשבון").
- A studio's orders to an erased supplier stay, unlinked (`orders.supplier_org_id` and
  `suppliers.linked_org_id` → null, as today); a supplier loses the orders an erased studio sent it
  (they were the studio's rows). Marketplace copies are untouched (they never pointed at the
  source).

### 5.5 Retention over

The same sweep deletes, for every erased business whose `retain_until` has passed: its billing
documents (the trigger guards UPDATE only), then the skeleton events and kept drawings, the
issuer's two files, then the closure and organisation rows — gone. `TAX_RECORDS_YEARS = 7` is a
placeholder in `lib/account/rules.ts` until the accountant confirms it (EVE-84 owes the same number
as the legal fact `taxRecordsYears`).

A retained document is never shown in the app. The owner gets copies on request: Ravid runs
`scripts/retained-documents.ts --org <id>`, which writes each document's record, the issuer
snapshot, the printed event facts and the logo/signature to a folder — everything needed to
reproduce the page. A faithful re-drawn page for an erased business comes with the admin console
(EVE-41), which can feed the existing document page from the retained data. Whether keeping the
data (rather than a PDF) satisfies a tax audit is a line for the accountant on EVE-84.

### 5.6 A person deletes their own account (designer, crew) — and the owner removes one

One plain function, `eraseMember(organizationId, userId)`, used by both the member's own
"מחיקת החשבון" (settings → החשבון שלי, not shown to the owner — the owner's way out is §5.2) and the
owner's existing "remove" in the team section.

- **Self-delete** goes through Better Auth's `deleteUser` (enabled in lib/auth/auth.ts): the
  password for a credential account, a fresh session (`freshAge`) for a Google-only one;
  `beforeDelete` enforces our rules (not an owner, not a client — §5.7 is theirs) and calls
  `eraseMember`'s pre-steps; it works whether the business is open or closed (§5.3's member page);
  audit `member.self_deleted`; the owner gets a bell (by name).
- **The bug fix** (failing db test first): a migration replaces `billing_documents_frozen` so that
  `issued_by` may change from a value to NULL and to nothing else. Deleting a member who issued
  documents then succeeds and the documents are otherwise untouched.
- **What their deletion leaves:** cascades remove sessions, accounts, venue grants, crew rows,
  notifications, the Google connection (best effort: delete the calendar Eve created in their
  Google account first; failure is recorded, never fatal). Set-null columns leave the work where it
  was; every place that shows the person behind such a column draws "חבר/ת צוות לשעבר" when it is
  null (a client's: "לקוח/ה לשעבר"). In the audit log their rows stay and their name is wiped
  wherever it appears — as the actor or inside a line (§5.9).

### 5.7 A client deletes their login

The client side gains a small account menu (name, sign out, "מחיקת החשבון"). Deleting: same
Better Auth path and re-auth; the `users` row goes, cascading `event_clients`, notifications and
the client's sessions; sketch proposals stay with `created_by` null. Each studio the client had
access to gets a bell: "<name> מחק/ה את החשבון שלו/ה ב־Eve" — worded without guessing gender
("החשבון של <name> נמחק"). The studio's event (client name, phone, notes) is untouched — it is the
studio's record.

### 5.8 The export (owner, open or closed)

Settings → **"ייצוא כל הנתונים"** replaces the old "נתונים וגיבוי" panel (the `localStorage`
snapshot export/import goes; `lib/settings/data` is deleted if nothing else imports it, its one
other reference in lib/studio/storage.ts checked). Also on `/closed`.

- `GET /api/account/export/data` — owner only (`currentActor`, or `closedMember` with the owner's role), audit
  `export.downloaded`. Returns JSON: `meta` (business, kind, when, app version), one array per
  registry table (columns the registry marks secret left out), the venues its events use but it
  does not own (name, structure, zones — read-only copies, so the drawings mean something), and the
  file keys.
- The browser (`app/(app)/settings/export-section.tsx`, `fflate` loaded on demand) writes:
  ```
  README.txt                         Hebrew: what is in each folder
  data/<table>.json                  every row, as stored
  tables/events.csv · clients.csv · catalog.csv · billing.csv   readable, Excel-ready (UTF-8 BOM)
  documents/<series>-<number>.json   each billing document's frozen record + the issuer
  files/<kind>/<name>                every photo, logo, signature, sketch picture
  missing-files.txt                  only when a file could not be fetched
  ```
  `eve-<business>-<yyyy-mm-dd>.zip`, a progress line ("תמונות 34 מתוך 120"), cancellable. The catalog
  and billing CSVs reuse the existing catalog-CSV and ledger-CSV builders.
- **Never exported:** `auth_*` tables, `password_hash`, invitation token hashes, scene-link token
  hashes, Google tokens. `check:account` asserts every column the registry exports is not on a
  secret list.

### 5.9 The audit log

`audit_log` rows are written by `recordAudit(db | tx, { organizationId, actorUserId, action, target,
summary, people, details? })` in `lib/audit/write.ts` (plain, like `notify`), inside the same
transaction as the change where there is one. `summary` is the Hebrew line written at the time,
so the log reads after the things are gone — but a PERSON in it is a token, never their name:
`תפקיד: {{p:<userId>}} · מעצב/ת ← צוות`. Lines are worded without a verb on the person, so they
never guess gender (the notification rule). `people` holds `{ [userId]: { name, kind } }` for every token, the actor included, as they
were then; the reader fills the tokens. Deleting a person wipes their entry in every row of the
business (one jsonb UPDATE) — the token then draws "חבר/ת צוות לשעבר" or "לקוח/ה לשעבר" by
`kind`. Things (events, venues, documents) are written by name: they are the business's.

| Group | Actions |
|---|---|
| אנשים | `member.invited`, `member.role_changed`, `member.removed`, `member.self_deleted`, `client.access_granted`, `client.access_revoked` |
| מקומות | `venue.grant_changed`, `venue.deleted` |
| מסמכים | `billing.issued`, `billing.cancelled`, `billing.credited`, `billing.original_marked` |
| מחיקות | `event.deleted`, `product.deleted` |
| חשבון | `export.downloaded`, `business.closed`, `business.reopened`, `security.2fa_on`, `security.2fa_off`, `security.email_changed`, `security.password_changed` |

(EVE-41's admin "view as" will add `admin.viewed_as`.) Settings → **"יומן פעולות"**, owner only:
newest first, grouped by day, a row = time · who · the summary; group chips as filters; 50 at a
time, "טען עוד". Kept as long as the business; erased with it.

### 5.10 Two-step sign-in (PR B)

Better Auth's `twoFactor` plugin, authenticator app (TOTP) + ten backup codes. No SMS, no email
code. Offered to every studio-side account (owner, designer, crew, of every kind of business);
clients have no settings page in v1 (DECIDE-11).
- Settings → החשבון שלי → **"אימות דו־שלבי"**: turn on (password → QR + the key to type → one code
  to confirm → the backup codes, copy/download, "שמרתי"); turn off (password); new backup codes.
- Sign-in: after the password, a second step (`/login/code`): the 6-digit code or a backup code,
  "לזכור את המכשיר הזה ל־30 יום". Google sign-in is not asked (Google's own protection covers it) —
  said in the settings note.
- The nudge: an owner without it sees one line in the settings account section and a dismissible
  notice on their dashboard (dismissed per device).
- Lost phone and no backup codes: `scripts/reset-two-factor.ts --user <email>` (operator, audited).
- **Deploy order:** the plugin adds `two_factor_enabled` to `users`, so migration 0031 reaches
  production BEFORE the PR B code deploys.

### 5.11 Change email (PR B)

Better Auth `user.changeEmail` (`updateEmailWithoutVerification: false`): the link goes to the NEW
address; the old one keeps working until it is clicked; after the change the OLD address is told
("כתובת ההתחברות שלך שונתה ל־…; לא אתה/את? פנו אלינו") and the audit logs it. Settings → החשבון
שלי shows "שינוי כתובת" only while `emailEnabled()`; otherwise today's note stays. Studio members
only in v1 (clients have no settings page).

### 5.12 The legal drafts

Update `lib/legal/docs/privacy.ts` and `terms.ts` (still drafts) to describe what is built: closing,
the 30-day reopen, the export, what is kept and for how long, venues that stay for others,
deleting a member or a client login, two-step sign-in. `retentionAfterClose` stays null — it can
truthfully say "30 יום" only once the timer runs the erase (EVE-53); noted on EVE-84.

## 6. Data model

| Table / change | Columns | PR | Migration |
|---|---|---|---|
| `organization_closures` (new) | `organization_id` uuid PK · `name` text · `closed_at` · `closed_by` uuid (no FK) · `erase_after` · `erased_at` null · `files_erased_at` null · `retain_until` date null · `issuer` jsonb null (written at erase) · `printed` jsonb null (per retained event: venue name, zones label) | A | 0030 |
| `audit_log` (new) | `id` · `organization_id` · `at` · `actor_user_id` uuid (no FK) · `action` text · `target_kind` text null · `target_id` text null · `summary` text (people as `{{p:<id>}}`) · `people` jsonb (`{ id: { name, kind } }`) · `details` jsonb null; index (`organization_id`, `at` desc) | A | 0030 |
| `billing_documents_frozen()` | `issued_by` may become NULL, nothing else changes | A | 0030 (hand-written SQL, like 0023) |
| `users.two_factor_enabled` | boolean not null default false | B | 0031 — prod BEFORE code |
| `auth_two_factors` (new) | the plugin's schema (secret, backup codes, user id → users cascade) mapped to our naming | B | 0031 |

Every page reads the closure through `currentSession()`, so **0030 too must reach production
before PR A's code** — the release order is migrate → deploy (EVE-20).

## 7. Screens (designed first)

A Claude Design board on the Eve design system before any of this UI is built, approved by Ravid:
settings "סגירת העסק" + its confirm; `/closed` (the owner's and the member's); settings "ייצוא כל
הנתונים" with progress;
settings "יומן פעולות"; "מחיקת החשבון" (member, client menu) + confirm; PR B's "אימות דו־שלבי"
(setup, codes, off), the sign-in code step, "שינוי כתובת", the owner's nudge. The back end of PR A
(tables, erase, export data, audit writers, the bug fix) does not wait for the board.

## 8. Checks

- `check:account` (lib/account/*.check.ts) — the rules (grace and due dates; `retain_until` from
  document dates; the retained set for a given set of rows); the registry covers every
  `organization_id` table and every `users` link in `lib/db/schema.ts`; no secret column is
  exported.
- `check:audit` — every action has a group and a label; every action listed is written somewhere
  (a source scan of `recordAudit(` calls).
- `db:verify:account` — against a throwaway database (the CI isolation job's Postgres; the local
  embedded Postgres): two throwaway businesses A and B. A has members, events, drawings, photos (local
  driver), issued documents (one issued by a member), a venue B's event uses and a venue nobody else
  uses; a client on A's event and a pending client row A created; B holds a saved sketch and a
  diary meeting in A's unused venue, a supplier row linked to A, and an event linked to A's
  booking (A as a venue business in a second pass); A holds a grant on one of B's venues. Then:
  the member who issued a document deletes their account (succeeds; the document unchanged; their
  name gone from the audit rows); the client deletes their login (A's event intact; A's bell); A
  closes (every studio action refuses; a member reaches only `/closed` and can delete their account
  there; A's `/v` and client reads refuse; B still opens A's venue but cannot place a new event in
  it); A reopens; A closes again and the sweep runs at `now + 31 days` → exactly the retained set
  remains and a retained document's page data is complete from it; A's files are gone but the kept
  ones; A's grant on B's venue is gone; B's rows are unchanged except the listed links now null
  (sketch and meeting `venue_id`, `linked_org_id`), B's linked designer got the bell; B's event
  still opens A's venue read-only; B's event moves to another venue → next sweep removes A's venue
  and its files; the sweep at `retain_until + 1` → A is gone. Added to the CI isolation job.

## 9. Build order

**PR A** (EVE-22, 51, 52):
1. Migration 0030 + the trigger fix with its failing db test; `eraseMember` used by today's
   `removeMember`.
2. The registry + `check:account`.
3. `recordAudit` + `check:audit`; writers in team, venues access, billing, events, catalog, client
   access.
4. Close / reopen / the lock (`currentSession`, `currentActor`, Better Auth hook, guards, outward
   faces).
5. The erase + retention sweep + `removePrefix` + `accounts:erase-due` + `retained-documents`.
6. Export data route + the browser zip.
7. The screens (after the board): close section, `/closed`, export section, audit section, member
   and client delete; the old data panel removed.
8. Legal draft text; `db:verify:account` in CI.

**PR B** (EVE-49, 50): migration 0031, the plugin, the sign-in code step, settings, the nudge,
change email.

## 10. Parked with the environment

- The timer that calls `eraseDueBusinesses` daily (EVE-53) — until then `npm run accounts:erase-due`.
- Mail (Resend): the close/erase notices to the owner, change email, the old-address notice.
- R2 bucket settings (versioning or lifecycle rules would keep "erased" files) — to check when the
  storage is chosen.

## 11. DECIDE (my calls — say if any is wrong)

1. **One page, `/closed`, for the closed owner**, rather than a banner over a read-only app — a
   read-only app would need every screen to know about the lock.
2. **Reopenable until the sweep actually runs**, even past the due date — the alternative locks the
   owner out of their own data because a script was late.
3. **Pending invitations are deleted at close**, not at erase — an invitation accepted during grace
   would make a member of a closed business.
4. **Members are not mailed at close** (the owner closed; the sign-in says it) — mail is parked
   anyway.
5. **Retained events are skeletons** that keep exactly what a document prints (date, type, client
   name; the venue name and zones label snapshotted) — everything else blanked.
6. **The issuer details are snapshotted at erase**, not at each issue — no change to the frozen
   documents or their trigger, and a business that reopened and moved is kept as it last stood.
7. **Audit names of a deleted person are wiped everywhere in the log** — people are tokens with
   one name map per row; the row and the action stay.
8. **A client's bell to the studio does not name the reason**, and the studio's records are not
   touched.
9. **Two-step sign-in has no SMS/email codes and does not cover Google sign-in** in v1.
10. **The export is built in the browser**, with `fflate` (approach B, §4).
11. **Change email and two-step sign-in for studio-side accounts only** in v1 — clients have no
    settings page.
12. **A member of a closed business can still delete their own account**, from the member version
    of `/closed` — otherwise their address is taken until a late script runs.
13. **The erase deletes the pending client invitations the business created**; a client who
    accepted keeps their own login.
14. **Only an event keeps a closed business's venue alive**; from the moment it closes no new event
    may be placed in it and it leaves the directory. Another business's saved sketch or diary
    meeting there just loses the link.

## 12. Left to the builder

The exact registry entries and deletion order; where each set-null person is drawn and its
fallback words; the Hebrew copy within the board's frame; the progress and cancel mechanics of the
zip; how the sign-in form receives Better Auth's two-factor redirect through `callAuth`; the
per-device dismissal key for the nudge.
