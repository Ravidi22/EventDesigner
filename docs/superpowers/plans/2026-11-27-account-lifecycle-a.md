# Account lifecycle, PR A — close, erase, export, audit log

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner can close the business (locked at once, reopenable for 30 days, then erased
except the retained billing records), any member or client can delete their own account, the owner
can download everything as one zip, and sensitive actions leave an audit row the owner can read.

**Architecture:** Pure rules and a table registry in `lib/account/` (self-checked); the lock at the
one seam every action already passes (`currentSession` → `currentActor`); the erase as a plain
module run by a script until a timer exists; the export assembled in the browser from one JSON
route; audit rows written by a plain `recordAudit` inside the writers' own transactions.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing), Drizzle +
Postgres 18, Better Auth 1.7.10, `fflate@0.8.2` (new, browser-only), tsx self-checks.

**Spec:** `docs/superpowers/specs/2026-11-27-account-lifecycle-design.md` — read it whole first.
§ numbers below are the spec's.

## Global Constraints

- Worktree `.claude/worktrees/lifecycle`, branch `feat/2026-11-27-account-lifecycle`, stacked on
  `feat/2026-11-27-legal`. Never push to `master`; the PR targets the legal branch until #4 merges.
- `CLOSE_GRACE_DAYS = 30`; `TAX_RECORDS_YEARS = 7` (placeholder, EVE-84).
- Migration 0030 must reach production BEFORE this code deploys (every page reads the closure).
- Never `session_replication_role = replica` in app code (it bypasses the billing trigger and every
  FK); the erase deletes in an FK-safe order.
- Plain trusting modules (`lib/account/erase.ts`, `lib/account/member.ts`, `lib/audit/write.ts`,
  `lib/account/closure.ts`) are NEVER `"use server"`; only `actions.ts` files are.
- Every new exported server action gets a case in `lib/db/isolation/cases/` (the isolation run
  fails on a missing one). An action that acts only on the caller's own account/business takes a
  `reason`, never a `call` (a call would close or delete B's or A's real fixture).
- Hebrew copy never guesses a person's gender: noun forms ("מחיקת חשבון: …") or slash forms
  ("סגר/ה"). A person in an audit line is a `{{p:<userId>}}` token, never a name.
- RTL: logical properties only (`ms-*`/`me-*`, `start`/`end`). Design tokens from `app/globals.css`;
  the confirm pattern is `components/confirm-dialog.tsx` (ביטול filled, the destructive verb as
  alert-ink text); every popup closes through `components/close-button.tsx`.
- Former people: `FORMER_MEMBER = "חבר/ת צוות לשעבר"`, `FORMER_CLIENT = "לקוח/ה לשעבר"`.
- Local DB for db scripts: the scratchpad embedded Postgres (memory `local-postgres-without-docker`),
  `DATABASE_URL=postgres://eve:eve@127.0.0.1:55432/eve_isolation`; never `.env.local` (Neon develop).
- Before every commit: `npm run typecheck`; before the PR: `npm run lint`, `npm run checks`,
  `npm run build`, `npm run db:verify:isolation`, `npm run db:verify:account`.

## Review Focus

1. A member's open tab keeps autosaving after the owner closes → the save must fail with the
   closed message, never write. (Test: Task 6, "a member's saveDocument after close throws
   BusinessClosedError".)
2. A photo key that 404s, or a file that is not ours, during export → listed in
   `missing-files.txt`, the zip still completes. (Test: Task 8, `buildExportZip` with a failing
   `fetchFile`.)
3. The sweep runs twice, or dies between the DB commit and the file deletes → the second run is a
   no-op for rows and finishes the files. (Test: Task 7, "second sweep changes no row; files
   finish".)
4. CSV cells with commas, quotes, newlines and Hebrew → valid CSV, UTF-8 BOM, Excel-safe (a cell
   starting with `=`, `+`, `-`, `@` is prefixed with `'`). (Test: Task 8, `export-csv.check.ts`.)
5. The owner types the business name with extra spaces → accepted; any other difference → refused.
   (Test: Task 2, `nameConfirms`.)

---

## File structure

| File | Responsibility |
|---|---|
| `lib/account/rules.ts` (+ `rules.check.ts`) | Pure: constants, dates, states, name confirmation, retained set |
| `lib/account/tables.ts` (+ `tables.check.ts`) | The registry: every schema table's export and erase rule, the secret columns |
| `lib/account/words.ts` | `FORMER_MEMBER`, `FORMER_CLIENT`, the closed-page and refusal strings |
| `lib/account/closure.ts` | Plain reads: `closureOf`, the `notClosed` SQL predicate |
| `lib/account/member.ts` | Plain: `beforePersonErased`, `eraseMember` |
| `lib/account/erase.ts` | Plain: the sweep — erase, retention, venues, files |
| `lib/account/export.ts` | Plain: `exportData(organizationId)` |
| `lib/account/export-csv.ts` (+ check) | Pure: the four readable CSVs |
| `lib/account/export-zip.ts` (+ check) | Browser: `buildExportZip` over `fflate` |
| `lib/account/actions.ts` | `"use server"`: `closeBusiness`, `reopenBusiness`, `deleteMyAccount` |
| `lib/account/verify.ts` | `npm run db:verify:account` |
| `lib/audit/types.ts`, `render.ts` (+ check), `write.ts`, `actions.ts` | The audit log |
| `lib/files/list-objects.ts` (+ check), `lib/files/driver.ts` | `list(prefix)` on both drivers |
| `app/api/account/export/data/route.ts` | The export JSON |
| `app/closed/page.tsx`, `closed-screen.tsx` | The closed page (owner / member) |
| `app/(app)/settings/close-section.tsx`, `export-section.tsx`, `audit-section.tsx` | New settings sections (`data-section.tsx` deleted) |
| `scripts/accounts-erase-due.ts`, `scripts/retained-documents.ts` | Operator scripts |
| `drizzle/0030_*.sql` | Two tables + the trigger fix |

---

### Task 1: The `issued_by` trigger fix, the two tables, the verify skeleton

**Files:**
- Modify: `lib/db/schema.ts` (append `organizationClosures`, `auditLog`)
- Create: `drizzle/0030_<generated>.sql` (generated, then the trigger appended by hand), its snapshot, `drizzle/meta/_journal.json`
- Create: `lib/account/verify.ts`; Modify: `package.json` (`db:verify:account`)

**Interfaces:**
- Produces: `organizationClosures` (§6 columns: `organizationId` PK, `name`, `closedAt`,
  `closedBy`, `eraseAfter`, `erasedAt`, `filesErasedAt`, `retainUntil` date, `issuer` jsonb
  `$type<IssuerSnapshot>()`, `printed` jsonb `$type<Record<string, PrintedFacts>>()`);
  `auditLog` (`id`, `organizationId`, `at`, `actorUserId`, `action` `$type<AuditAction>()`,
  `targetKind`, `targetId`, `summary`, `people` jsonb `$type<AuditPeople>()`, `details` jsonb;
  index `audit_log_org_at_idx` on (`organizationId`, `at` desc)). `IssuerSnapshot`,
  `PrintedFacts` are declared in `lib/account/rules.ts` (Task 2) — declare them there now as types
  only. `AuditAction`/`AuditPeople` likewise in `lib/audit/types.ts` (Task 4) — declare now.
- Produces: `lib/account/verify.ts` with `step(name, fn: (f: Fixture) => Promise<void>)` — EVERY
  step seeds its own fixture (`seed()` of `lib/db/isolation/fixture.ts`) and cleans it up
  (`cleanup()`) whatever happens, so steps never depend on each other's deletions; `sweep()` of the
  fixture runs once at start for strays. Refuses non-local databases through `refusal()` of
  `lib/db/isolation/env.ts`. Later tasks add steps.

- [ ] **Step 1: Write the failing verify step** — `lib/account/verify.ts`, step
  `"a member who issued a billing document can be removed"`: seed; as A's member (`memberA`), make
  them an owner-less issuer: issue a payment request on A's event acting as `memberA`
  (`actAsUserForScript(f.memberA)` + `issuePaymentRequest`); then acting as `ownerA`, call
  `removeMember(f.memberA)`; assert it resolves, the member row is gone, and the document's every
  frozen column is unchanged except `issued_by` = null. Cleanup always.
- [ ] **Step 2: Run it — expect FAIL**
  Run: `DATABASE_URL=postgres://eve:eve@127.0.0.1:55432/eve_isolation npm run db:verify:account`
  Expected: FAIL — `billing_documents are frozen after issue` (check_violation from the trigger).
- [ ] **Step 3: Add the two tables to `lib/db/schema.ts`; `npm run db:generate`; append to the
  generated SQL a `CREATE OR REPLACE FUNCTION billing_documents_frozen()` identical to 0023's except
  the `issued_by` line becomes**
  ```sql
  OR (NEW.issued_by IS DISTINCT FROM OLD.issued_by AND NEW.issued_by IS NOT NULL)
  ```
  with a comment: a person may be erased; the document keeps every other column.
- [ ] **Step 4: Migrate the local DB and run — expect PASS**
  Run: `DATABASE_URL=… DIRECT_URL=… npx drizzle-kit migrate && DATABASE_URL=… npm run db:verify:account`
  Expected: `ok  a member who issued a billing document can be removed`.
- [ ] **Step 5: Typecheck, commit**
  `git commit -m "fix(billing): a member who issued a document can be erased — the frozen trigger lets issued_by go null (EVE-22)"`

### Task 2: The rules

**Files:** Create `lib/account/rules.ts`, `lib/account/rules.check.ts`, `lib/account/words.ts`;
Modify `package.json` (`"check:account": "tsx lib/account/rules.check.ts"`).

**Interfaces:**
- Produces (all pure, dates as `Date` in, ISO strings out where stored as `date`):
  - `CLOSE_GRACE_DAYS = 30`, `TAX_RECORDS_YEARS = 7`
  - `eraseAfterOf(closedAt: Date): Date` — `closedAt + 30 × 24h`
  - `type ClosureState = "open" | "closed" | "due" | "erased"`;
    `closureState(c: { closedAt: Date; eraseAfter: Date; erasedAt: Date | null } | null, now: Date): ClosureState`
  - `retainUntilOf(documentDates: readonly string[]): string | null` — null for none; else
    `${year(max) + TAX_RECORDS_YEARS}-12-31` (end of the tax year of the latest document date)
  - `retentionOver(retainUntil: string | null, now: Date): boolean` — true when `now`'s date >
    `retainUntil`
  - `nameConfirms(typed: string, name: string): boolean` — trims both and collapses runs of
    whitespace; otherwise exact (niqqud and case count)
  - `interface IssuerSnapshot { businessName; ownerName; businessNumber; address; phone; email;
    vatStatus; vatRate; currency; bankDetails; instagram; showBsd: boolean; logoKey: string | null;
    signatureKey: string | null }` (strings unless said)
  - `interface PrintedFacts { venueName: string; zonesLabel: string }`
  - `EVENT_SKELETON_KEEP = ["id", "organization_id", "event_date", "event_type", "client_name", "created_at", "updated_at"] as const`
    — the columns a retained event keeps (DECIDE-5); `skeletonPatch(columns: readonly string[]):
    Record<string, null | "" | false>` — for every other column: `null` if nullable, `""` for a
    NOT NULL text, `false` for a NOT NULL boolean (the caller passes the column metadata).
- `lib/account/words.ts`: `FORMER_MEMBER`, `FORMER_CLIENT`, `CLOSED_REFUSAL = "העסק נסגר"`.

- [ ] **Step 1: Write `rules.check.ts`** with these assertions (assert helper as in
  `lib/legal/documents.check.ts`):
  ```ts
  const at = new Date("2026-11-27T10:00:00Z");
  assert(eraseAfterOf(at).toISOString() === "2026-12-27T10:00:00.000Z", "30 days");
  const c = { closedAt: at, eraseAfter: eraseAfterOf(at), erasedAt: null };
  assert(closureState(null, at) === "open", "no row = open");
  assert(closureState(c, new Date("2026-12-27T09:59:59Z")) === "closed", "inside grace");
  assert(closureState(c, new Date("2026-12-27T10:00:00Z")) === "due", "due at the minute");
  assert(closureState({ ...c, erasedAt: at }, at) === "erased", "erased wins");
  assert(retainUntilOf([]) === null, "nothing retained");
  assert(retainUntilOf(["2025-03-01", "2026-11-20"]) === "2033-12-31", "latest year + 7, year end");
  assert(!retentionOver("2033-12-31", new Date("2033-12-31T23:00:00Z")), "not on the last day");
  assert(retentionOver("2033-12-31", new Date("2034-01-01T00:00:00Z")), "over the day after");
  assert(nameConfirms("  אירית   עיצובים ", "אירית עיצובים"), "spaces forgiven");
  assert(!nameConfirms("אירית עיצוב", "אירית עיצובים"), "a different name refused");
  assert(!nameConfirms("", "אירית עיצובים"), "empty refused");
  ```
  plus `skeletonPatch` cases: a nullable column → null, a NOT NULL text → "", a kept column absent.
- [ ] **Step 2: Run — expect FAIL** `npm run check:account` → module not found.
- [ ] **Step 3: Implement `rules.ts` and `words.ts`.**
- [ ] **Step 4: Run — expect PASS** `check:account — ok`.
- [ ] **Step 5: Commit** `feat(account): the lifecycle rules — grace, retention, name confirmation (EVE-22)`

### Task 3: The table registry

**Files:** Create `lib/account/tables.ts`, `lib/account/tables.check.ts`; `package.json`
`"check:account-tables": "tsx lib/account/tables.check.ts"`.

**Interfaces:**
- Produces:
  ```ts
  type Reach = "org" | "global" | { via: string /* "<parent_table>.<fk column on this table>" */ };
  type ExportRule = "all" | { omit: readonly string[] } | { skip: string };
  type EraseRule = "delete" | "cascade" | "retain-billing" | "retain-event" | "retain-design" | "retain-venue" | { skip: string };
  interface TableRule { reach: Reach; export: ExportRule; erase: EraseRule }
  export const ACCOUNT_TABLES: Record<string /* SQL table name */, TableRule>;
  export const SECRET_COLUMNS: readonly string[]; // "password_hash", "invite_token_hash", "token_hash", "token", "access_token", "refresh_token", "id_token", "secret", …
  export const ERASE_ORDER: readonly string[]; // tables with erase "delete", children before parents
  export function exportedColumns(table: string, columns: readonly string[]): string[];
  ```
  Rules to encode: `auth_*` tables `export: { skip: "credentials" }`; `users` exports `id, name,
  email, role, kind, state, joined_at, created_at` only (`omit` the rest); `google_connections`
  omits every token column; `scene_links` omits `token_hash`; `billing_documents` erase
  `retain-billing`; `events` `retain-event`; `design_documents` `retain-design`; `venues`,
  `venue_structures`, `zones` `retain-venue`; `organizations` and `organization_closures` erase
  `{ skip: "the tombstone, handled by erase.ts" }`; `audit_log` export `all`, erase `delete`;
  `auth_rate_limits`, `auth_verifications` `reach: "global"`.

- [ ] **Step 1: Write `tables.check.ts`:** read every `pgTable` exported from
  `@/lib/db/schema` (`getTableConfig` from `drizzle-orm/pg-core`) and assert: every table name is a
  key of `ACCOUNT_TABLES`, and every key is a real table; every column whose name is in
  `SECRET_COLUMNS` or ends in `token_hash` / `_token` is NOT in `exportedColumns(table, cols)`; every
  table whose erase is `"delete"` appears in `ERASE_ORDER` exactly once; for every FK between two
  `"delete"` tables, the child comes before the parent in `ERASE_ORDER`; every `{ via }` names a
  real table and a real column.
- [ ] **Step 2: Run — expect FAIL** `npm run check:account-tables` → missing module.
- [ ] **Step 3: Implement `tables.ts`** — classify all 50 tables in schema.ts.
- [ ] **Step 4: Run — expect PASS.** To prove the check bites: temporarily delete one registry key,
  run (FAIL naming that table), restore.
- [ ] **Step 5: Commit** `feat(account): every table's export and erase rule in one registry, held to the schema (EVE-22, EVE-51)`

### Task 4: The audit log

**Files:** Create `lib/audit/types.ts`, `lib/audit/render.ts`, `lib/audit/render.check.ts`,
`lib/audit/write.ts`, `lib/audit/actions.ts`; `package.json` `"check:audit": "tsx lib/audit/render.check.ts"`;
Modify the writers listed in Step 5; `lib/db/isolation/cases/people.ts` (case for `fetchAuditLog`).

**Interfaces:**
- Produces (`lib/audit/types.ts`):
  ```ts
  export type AuditAction = "member.invited" | "member.role_changed" | "member.removed" | "member.self_deleted"
    | "client.access_granted" | "client.access_revoked" | "venue.grant_changed" | "venue.deleted"
    | "billing.issued" | "billing.cancelled" | "billing.credited" | "billing.original_marked"
    | "event.deleted" | "product.deleted" | "export.downloaded" | "business.closed" | "business.reopened"
    | "security.password_changed";
  export type AuditGroup = "people" | "places" | "documents" | "deletions" | "account";
  export const AUDIT_GROUP: Record<AuditAction, AuditGroup>;          // per spec §5.9's table
  export const AUDIT_GROUP_LABEL: Record<AuditGroup, string>;        // אנשים · מקומות · מסמכים · מחיקות · חשבון
  export type AuditPeople = Record<string, { name: string | null; kind: "member" | "client" }>;
  export interface AuditEntry { organizationId: string; actorUserId: string | null; action: AuditAction;
    target?: { kind: string; id: string }; summary: string; people: AuditPeople; details?: Record<string, unknown> }
  export interface AuditRow { id: string; at: string; action: AuditAction; group: AuditGroup; actor: string; line: string }
  ```
- Produces (`render.ts`, pure): `personToken(userId: string): string` → `{{p:<id>}}`;
  `renderLine(summary: string, people: AuditPeople): string`; `actorLabel(actorUserId, people)`.
- Produces (`write.ts`, plain): `recordAudit(database: Database, entry: AuditEntry): Promise<void>`
  (throws — it runs inside the caller's transaction; an audit failure fails the change);
  `forgetPerson(database: Database, organizationId: string, userId: string): Promise<void>` — sets
  `people->id->name` to null in every row of that organisation (one `UPDATE … SET people =
  jsonb_set(people, ARRAY[id, 'name'], 'null') WHERE organization_id = $1 AND people ? id`).
  `Database` = the type `db()` returns or a transaction.
- Produces (`actions.ts`): `fetchAuditLog(input?: { before?: string; group?: AuditGroup }): Promise<{ rows: AuditRow[]; more: boolean }>`
  — owner only (throws otherwise), 50 rows, newest first, `before` an ISO cursor.

- [ ] **Step 1: Write `render.check.ts`:**
  ```ts
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  const people = { [a]: { name: "רונית", kind: "member" }, [b]: { name: null, kind: "client" } } as const;
  assert(renderLine(`תפקיד: ${personToken(a)} · מעצב/ת ← צוות`, people) === "תפקיד: רונית · מעצב/ת ← צוות", "a person by name");
  assert(renderLine(`ביטול שיתוף: ${personToken(b)}`, people) === "ביטול שיתוף: לקוח/ה לשעבר", "a forgotten client");
  assert(renderLine(`הסרה מהצוות: ${personToken("33333333-3333-4333-8333-333333333333")}`, people) === "הסרה מהצוות: חבר/ת צוות לשעבר", "unknown = former member");
  assert(actorLabel(null, people) === "המערכת", "no actor = a script");
  ```
  and the coverage scan: read every `.ts`/`.tsx` under `lib/` and `app/` (skip `*.check.ts`), and
  for every `AuditAction` not in `PENDING` assert some file contains `recordAudit(` within 400
  characters before `"<action>"` — failing message names the unwritten action. `PENDING` (in the
  check) starts as `["member.self_deleted", "business.closed", "business.reopened",
  "export.downloaded"]`; Tasks 5, 6 and 8 each remove theirs, and Task 8 adds
  `assert(PENDING.length === 0)`. Also every action has a group, every group a label.
- [ ] **Step 2: Run — expect FAIL** (missing modules, then every action "never written").
- [ ] **Step 3: Implement `types.ts`, `render.ts`, `write.ts`, `actions.ts`.**
- [ ] **Step 4: Add the writers** — each inside the existing transaction when the action has one,
  else right after the write; `summary` exact copy (people as tokens, things by name):

  | Where | Action | Summary |
  |---|---|---|
  | `lib/team/actions.ts` `inviteMember` | `member.invited` | `הזמנה לצוות: {p} · {roleLabel}` |
  | `setMemberRole` | `member.role_changed` | `תפקיד: {p} · {fromLabel} ← {toLabel}` |
  | `removeMember` | `member.removed` | `הסרה מהצוות: {p}` (Task 5 moves it into `eraseMember`) |
  | `lib/events/client-actions.ts` `shareEventWithClient` / `unshareEventClient` | `client.access_granted` / `client.access_revoked` | `שיתוף עם לקוח/ה: {p} · {clientName}` / `ביטול שיתוף: {p} · {clientName}` |
  | `lib/venues/actions.ts` `shareVenue`, `setGrantRole`, `revokeGrant` | `venue.grant_changed` | `שיתוף מתחם: {venue} · {grantee} · {roleLabel or "בוטל"}` — a member grantee as `{p}`, a business by name |
  | `deleteVenue` | `venue.deleted` | `מחיקת מתחם: {venue}` |
  | `lib/billing/actions.ts` `issueOrder`, `issueInvoice`, `issuePaymentRequest`, `recordPayment` | `billing.issued` | `הפקת {kindLabel} {series}-{number} · {customer.name}` |
  | `cancelDocument` / `creditDocument` / `markOriginal` | `billing.cancelled` / `billing.credited` / `billing.original_marked` | `ביטול {kindLabel} {number}` / `זיכוי {number} · נגד {invoiceNumber}` / `הדפסת מקור: {kindLabel} {number}` |
  | `lib/events/actions.ts` `deleteEvent` | `event.deleted` | `מחיקת אירוע: {clientName} · {date}` |
  | `lib/catalog/actions.ts` `removeProduct` (the delete branch only, not archive) | `product.deleted` | `מחיקת פריט מהקטלוג: {name}` |
  | `lib/auth/actions.ts` `changePassword` (success) | `security.password_changed` | `שינוי סיסמה` |

  (`export.downloaded`, `business.*`, `member.self_deleted` are written in Tasks 5, 6, 8.) The actor
  is `currentActor().userId`; `people` holds the actor and every `{p}`.
- [ ] **Step 5: Isolation case** for `lib/audit/actions.ts#fetchAuditLog` in
  `lib/db/isolation/cases/people.ts`: `call: () => fetchAuditLog()` as B's owner — B's own log;
  `expect: (r) => (r as { rows: unknown[] }).rows.every(…)` nothing of A's (the judge scans ids).
  Seed one audit row for A in the fixture (`recordAudit` in `seed()`), so the control has something.
- [ ] **Step 6: Verify step** in `lib/account/verify.ts`: "a role change writes one audit row the
  owner reads": as `ownerA`, `setMemberRole(memberA, "crew")`; `fetchAuditLog()` returns a row whose
  `line` is `תפקיד: <member name> · מעצב/ת ← צוות`; as `memberA`, `fetchAuditLog()` throws.
- [ ] **Step 7: Run** `npm run check:audit`, `db:verify:account`, `db:verify:isolation` → PASS.
- [ ] **Step 8: Commit** `feat(audit): an audit log of sensitive actions, people as tokens (EVE-52)`

### Task 5: Deleting a person — member, client, owner's remove

**Files:** Create `lib/account/member.ts`; Modify `lib/auth/auth.ts` (`user.deleteUser`),
`lib/auth/actions.ts` (`deleteMyAccount`), `lib/team/actions.ts` (`removeMember` → `eraseMember`),
`lib/notifications/types.ts` (+ `member.left`, `client.left`), the readers of set-null person
columns (Step 6), `lib/db/isolation/cases/people.ts`.

**Interfaces:**
- Consumes: `recordAudit`, `forgetPerson`, `personToken` (Task 4); `notify` (lib/notifications/write.ts).
- Produces (`member.ts`, plain):
  - `beforePersonErased(database, person: { id: string; organizationId: string | null; kind: "studio" | "client"; name: string | null; role: string }, by: "self" | { ownerId: string }): Promise<void>`
    — a studio person: audit (`member.self_deleted` with `מחיקת חשבון: {p}`, or `member.removed`),
    `forgetPerson`, best-effort Google calendar removal (call the existing disconnect path in
    lib/google with errors swallowed and logged), bell `member.left` to the owner when `self`; a
    client: bell `client.left` to `studioRecipients(org)` of each studio whose event they were on,
    payload `actorName`.
  - `eraseMember(organizationId: string, userId: string, ownerId: string): Promise<void>` — one
    transaction: `beforePersonErased(…, { ownerId })` then delete the row (same WHERE guards as
    today's `removeMember`).
- Produces (`lib/auth/actions.ts`): `deleteMyAccount(input: { password?: string }): Promise<{ ok: true } | { error: string }>`
  — refuses an owner (`"בעלים לא יכולים למחוק את החשבון — אפשר לסגור את העסק בהגדרות"`); calls
  `callAuth("/delete-user", { password })`; maps 400 wrong password → `"הסיסמה שגויה"`, a stale
  Google-only session → `"יש להתחבר מחדש ואז למחוק"`; on success clears the cookie (Better Auth did)
  and returns ok (the client redirects to `/`).
- Better Auth: `user.deleteUser = { enabled: true, beforeDelete: async (user) => { …load our row;
  refuse owner (throw APIError FORBIDDEN); await beforePersonErased(row, "self") } }`; `session.freshAge`
  stays the default (1 day) for Google-only deletion.
- Notification kinds: `"member.left"` (side studio), `"client.left"` (side studio); the bell's line
  for both: `"החשבון של {actorName} נמחק"`.

- [ ] **Step 1: Verify steps (RED):** "a designer deletes their own account": as `memberA`,
  `deleteMyAccount({ password })` (seed gives `memberA` a known password — add to `seed()` if
  absent) → ok; row gone; A's owner has a `member.left` notification; A's audit has
  `מחיקת חשבון: חבר/ת צוות לשעבר` (the name was forgotten). "the owner cannot delete their account":
  as `ownerA` → the owner refusal. "a client deletes their login": as `clientC` → ok; A's event and
  its `client_name` untouched; A's owner has `client.left`. "the owner removes a member who issued a
  document" (Task 1's step, now through `eraseMember`) still passes.
- [ ] **Step 2: Run — expect FAIL** (`deleteMyAccount` missing).
- [ ] **Step 3: Implement** member.ts, the auth option, `deleteMyAccount`, `removeMember` →
  `eraseMember`, the two notification kinds (+ `KIND_SIDE`, the bell's line and its target: the
  settings team section).
- [ ] **Step 4: Former people in readers** — find every read that joins `users` on
  `sketch_proposals.created_by/submitted_by/resolved_by`, `scene_links.created_by`,
  `billing_documents.issued_by`, `event_links.invited_by` (`grep -rn "createdBy\|submittedBy\|resolvedBy\|issuedBy\|invitedBy" lib app`)
  and make a null person draw `FORMER_MEMBER` (`FORMER_CLIENT` for a proposal's `created_by`/`submitted_by`).
- [ ] **Step 5: Isolation cases:** `lib/auth/actions.ts#deleteMyAccount` → `reason: "deletes the
  caller's own account; takes no id"`.
- [ ] **Step 6: Run — expect PASS:** `db:verify:account`, `db:verify:isolation`, `typecheck`.
- [ ] **Step 7: Commit** `feat(account): a member, a client or the owner's remove erases a person cleanly (EVE-22)`

### Task 6: Close, reopen, the lock

**Files:** Create `lib/account/closure.ts`, `lib/account/actions.ts`; Modify `lib/auth/session.ts`,
`lib/db/org.ts`, `lib/auth/guard.ts`, `lib/client-portal/actions.ts` (`fetchMyEvents`,
`sharedEvent`), `lib/scene/share-read.ts` (`sceneByToken`), `lib/marketplace/actions.ts`
(`published()`), `lib/venues/actions.ts` (`fetchVenueDirectory`, `followVenue`),
`lib/events/actions.ts` (`assertPlacement`), `lib/event-links/actions.ts` (`acceptLinkInvite`),
`lib/google/sync.ts` (skip a closed org), `lib/db/isolation/cases/people.ts`.

**Interfaces:**
- Produces (`closure.ts`, plain): `closureOf(organizationId: string): Promise<ClosureRow | null>`;
  `notClosed(orgColumn: AnyPgColumn): SQL` — `not exists (select 1 from organization_closures c where c.organization_id = <col>)`.
- `Session` gains `closed: { closedAt: string; eraseAfter: string; state: "closed" | "due" } | null`
  (filled in the same query as the kind — one left join). Erased businesses have no members, so a
  session never sees `"erased"`.
- `lib/db/org.ts`: `class BusinessClosedError extends Error` (message `CLOSED_REFUSAL`);
  `currentActor()` throws it when `session.closed`; `closedMember(): Promise<{ organizationId; userId; role; closed }>`
  throws when NOT closed (and for a script).
- `lib/auth/guard.ts`: `requireStudio()` → `redirect("/closed")` when `session.closed`.
- Produces (`lib/account/actions.ts`): `closeBusiness(input: { confirmName: string }): Promise<{ eraseAfter: string } | { error: string }>`
  (owner, open business; `nameConfirms` against `organizations.name`; one transaction: closure row,
  delete other members' `auth_sessions` and every member's sessions but the caller's, delete
  pending invitations (`users` rows of the org with `state = "pending"`), audit `business.closed`
  `סגירת העסק · מחיקה ב־{date}`; after the commit, `sendLater` a mail to the owner — a
  `businessClosedEmail({ name, eraseAfter })` template beside `resetPasswordEmail` — which
  `sendEmail` drops while mail is off); `reopenBusiness(): Promise<{ ok: true } | { error: string }>`
  (via `closedMember`, owner, `erased_at` null → delete the closure row, audit `business.reopened`
  `פתיחה מחדש של העסק`).

- [ ] **Step 1: Verify steps (RED):** "closing locks the business": as `ownerA`,
  `closeBusiness({ confirmName: "  " + A's name + " " })` → `eraseAfter` = now+30d; `memberA` has
  no sessions; as `memberA`, `saveDocument(...)` on A's event throws `BusinessClosedError`
  (Review Focus 1); `sceneByToken(A's live token)` → null; as `clientC`, `fetchMyEvents()` has
  none of A's; a published product of a closed supplier (close `orgS` too) is absent from
  `fetchMarketplace()`; B's `saveEvent` placing a NEW event in A's venue is refused, B's existing
  event in A's venue still saves; `fetchVenueDirectory()` as B lists no venue of A's.
  "the wrong name is refused": `closeBusiness({ confirmName: "x" })` → error, still open.
  "reopen": as `ownerA`, `reopenBusiness()` → as `memberA` (new session via `actAsUserForScript`)
  `saveDocument` works again.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** closure.ts, the session field, `BusinessClosedError`/`closedMember`,
  the guard, the two actions, and the outward filters (each a `notClosed(<org column>)` in the
  WHERE; `assertPlacement` refuses only when the event did not already stand in that venue).
- [ ] **Step 4: Isolation cases:** `closeBusiness`, `reopenBusiness` → `reason: "acts on the
  caller's own business; takes no id"`.
- [ ] **Step 5: Run — expect PASS:** `db:verify:account`, `db:verify:isolation`, `typecheck`.
- [ ] **Step 6: Commit** `feat(account): close and reopen a business — the lock at the one seam (EVE-22)`

### Task 7: The erase

**Files:** Create `lib/account/erase.ts`, `lib/files/list-objects.ts`, `lib/files/list-objects.check.ts`,
`scripts/accounts-erase-due.ts`, `scripts/retained-documents.ts`; Modify `lib/files/driver.ts`
(+ `list`), `lib/files/driver-local.ts` (+ `listLocalFiles`), `lib/notifications/types.ts`
(+ `link.venue_closed`), the booking screen's linked-designer line, `package.json`
(`"accounts:erase-due": "tsx scripts/accounts-erase-due.ts"`, `"check:list-objects": "tsx lib/files/list-objects.check.ts"`).

**Interfaces:**
- Consumes: `ACCOUNT_TABLES`, `ERASE_ORDER` (Task 3); rules (Task 2); `closureOf` (Task 6).
- Produces (`erase.ts`, plain):
  ```ts
  export interface SweepReport { erased: string[]; retentionOver: string[]; venuesGone: string[]; filesPending: string[]; plan?: Record<string, { delete: Record<string, number>; keep: Record<string, number> }> }
  export async function sweepAccounts(input: { now: Date; dryRun: boolean }): Promise<SweepReport>;
  ```
  Order inside `sweepAccounts`: (1) every due closure → `eraseBusiness` (one transaction each,
  §5.4 steps 1–3, the issuer snapshot and `printed` facts written BEFORE settings/zones/venues go,
  venue bookings' linked designers notified `link.venue_closed` before the bookings go; before the
  transaction, best-effort removal of each member's Eve calendar in Google — the same call Task 5's
  `beforePersonErased` makes, errors logged); (2) every erased
  closure past `retain_until` → its documents, skeleton events, kept drawings, closure, organisation;
  (3) every retained venue of an erased owner with no event standing in it → the venue (cascade)
  and its files; (4) files: every erased closure with `files_erased_at` null → `removePrefix`.
- `FileDriver.list(prefix: string): Promise<string[]>`; `parseListObjects(xml: string): { keys: string[]; next: string | null }`
  (pure, ListObjectsV2 with continuation); `removePrefix(prefix: string, keep: ReadonlySet<string>): Promise<{ removed: number; failed: number }>`
  in `erase.ts`.
- `scripts/accounts-erase-due.ts`: `--yes` to act (default dry run printing the plan), `--now <iso>`
  for tests only; refuses a non-local DB unless `--prod-ok` AND `DATABASE_URL` is the one in
  `PROD_DIRECT_URL` (prints which it is).
- `scripts/retained-documents.ts --org <id> --out <dir>`: writes `documents/*.json`,
  `issuer.json`, `printed.json`, the logo and signature files.

- [ ] **Step 1: `list-objects.check.ts` (RED):** a two-page ListObjectsV2 XML fixture → keys of
  page 1 and `next` token; an empty bucket → `{ keys: [], next: null }`; a key with `&amp;` decoded.
- [ ] **Step 2: Verify steps (RED):** "the sweep erases a due business": close A (Task 6), add the
  extra fixture rows the spec's §8 names (B's saved sketch + diary meeting in A's `spareVenueId`,
  B's supplier linked to A, A's grant on a venue of B's, a pending client row of A's, a B event in
  A's `venueId`); `sweepAccounts({ now: +31d, dryRun: false })` → A's remaining rows are exactly: the
  organisation, the closure (`issuer` and `printed` filled), every billing document unchanged, the
  skeleton events (`client_name`, `event_type`, `event_date` kept, every other personal column
  blank, `venue_id` null), the order's sealed drawing, `venueId` + its zones/structure; no user of
  A; A's local files gone except logo/signature/the kept venue's; B's sketch and meeting
  `venue_id` null, B's supplier `linked_org_id` null, every other B row unchanged (snapshot
  before/after); A's grant on B's venue gone; the pending client row A created is gone while
  `clientC` (accepted) still has a `users` row and no `event_clients`; when A is a VENUE business
  (repeat with `orgV` closed), the linked designer's studio has a `link.venue_closed` bell and its
  event stands unlinked. "the sweep twice": a second `sweepAccounts` reports nothing
  erased and changes no row (Review Focus 3); with one file made undeletable for the first run,
  the second run removes it and stamps `files_erased_at`. "the venue goes when unused": move B's
  event to another venue → `sweepAccounts` → `venueId` gone. "retention over": `sweepAccounts({ now: retain_until + 1 day })`
  → nothing of A left.
- [ ] **Step 3: Run — expect FAIL.**
- [ ] **Step 4: Implement** `parseListObjects` + both drivers' `list` (R2: signed GET
  `?list-type=2&prefix=…&continuation-token=…` through `lib/files/sigv4.ts`; local: walk
  `.uploads/<prefix>`), `erase.ts`, the two scripts, the notification kind, and the booking screen
  drawing a null `studio_event_id` link as `"המעצב/ת סגר/ה את החשבון"`.
- [ ] **Step 5: Run — expect PASS:** `check:list-objects`, `db:verify:account`, `typecheck`.
- [ ] **Step 6: Commit** `feat(account): the erase — retained records kept exactly, everything else gone, files too (EVE-22)`

### Task 8: The export

**Files:** Create `lib/account/export.ts`, `lib/account/export-csv.ts` (+ check),
`lib/account/export-zip.ts` (+ check), `app/api/account/export/data/route.ts`; `package.json`
(`fflate@0.8.2` dependency; `check:export-csv`, `check:export-zip`).

**Interfaces:**
- Consumes: `ACCOUNT_TABLES`, `exportedColumns` (Task 3); `productsToCsv` (lib/catalog/csv.ts);
  `recordAudit` (Task 4); `closedMember` (Task 6).
- Produces:
  ```ts
  export interface ExportData { meta: { business: string; kind: OrgKind; at: string; app: string };
    tables: Record<string, Record<string, unknown>[]>; venuesUsed: { id: string; name: string; structure: unknown; zones: unknown[] }[]; files: string[] }
  export async function exportData(organizationId: string): Promise<ExportData>;          // export.ts, plain
  export function eventsCsv(d: ExportData): string; clientsCsv; catalogCsv; billingCsv;     // export-csv.ts, pure
  export async function buildExportZip(d: ExportData, fetchFile: (key: string) => Promise<Uint8Array>,
    onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<Blob>; // export-zip.ts
  ```
  Route `GET /api/account/export/data`: `currentActor()` owner, or `closedMember()` owner; anything
  else 403; audit `export.downloaded` `ייצוא כל הנתונים`; `Content-Type: application/json`,
  `Cache-Control: no-store`.
- Zip layout exactly as spec §5.8 (README.txt Hebrew text: one line per folder).

- [ ] **Step 1: `export-csv.check.ts` (RED):** a client named `כהן, "דני"` with a newline in
  notes → one quoted cell, quotes doubled, the row count right; output starts with `﻿`; a cell
  `=SUM(A1)` is written `'=SUM(A1)` (Review Focus 4); billing CSV: one row per document, totals in
  shekels with two decimals.
- [ ] **Step 2: `export-zip.check.ts` (RED):** with `fetchFile` throwing for one of three keys →
  the zip (read back with `fflate.unzipSync`) has two files under `files/`, `missing-files.txt`
  naming the third, `data/events.json` equal to the input rows, `README.txt` present
  (Review Focus 2); an aborted signal rejects with `AbortError`.
- [ ] **Step 3: Verify step (RED):** "the export carries the business and no secret": as `ownerA`
  `exportData(orgA)` → `tables.events` has A's events only; no key in any row is a secret column;
  `tables.users` rows have no `password_hash`; `venuesUsed` lists A's venue; as `memberA` the route
  answers 403 (call the route's handler function directly with the script session).
- [ ] **Step 4: Run — expect FAIL.**
- [ ] **Step 5: Implement**, `npm i fflate@0.8.2`.
- [ ] **Step 6: Run — expect PASS:** `check:export-csv`, `check:export-zip`, `check:audit` (now
  green — every action written), `db:verify:account`, `typecheck`.
- [ ] **Step 7: Commit** `feat(account): the full export — every table, readable CSVs, the photos, in one zip (EVE-51)`

### Task 9: The design board (stop for Ravid)

**Files:** none in the repo.

- [ ] **Step 1:** Load the `artifact-design` guidance and make a Claude Design board on the Eve
  design system (artifact PhTybVhVcedKmAnd2L9Caa, the same way round 3's legal board was made) with
  the screens of spec §7 that PR A builds: settings "סגירת העסק" + its confirm; `/closed` for the
  owner and for a member; settings "ייצוא כל הנתונים" idle / in progress / done / with missing
  files; settings "יומן פעולות" with filters and "טען עוד"; "מחיקת החשבון" in החשבון שלי + its
  confirm; the client's account menu + confirm. Real Hebrew copy from this plan.
- [ ] **Step 2:** Send Ravid the link and wait for his approval or notes. **Do not start Task 10
  before he answers.** Record his calls in the ledger.

### Task 10: The screens

**Files:** Create `app/(app)/settings/close-section.tsx`, `export-section.tsx`, `audit-section.tsx`,
`app/closed/page.tsx`, `app/closed/closed-screen.tsx`, `components/delete-account-dialog.tsx`;
Modify `app/(app)/settings/settings-screen.tsx` (sections: `close` "סגירת העסק" and `audit`
"יומן פעולות" owner only, `data` → `export` "ייצוא נתונים" owner only), `account-section.tsx`
(the delete entry, not for the owner), `app/client/client-home.tsx` and the client event pages'
header (account menu); Delete `app/(app)/settings/data-section.tsx` and `lib/settings/data*` (its
only other mention is a comment in `lib/studio/storage.ts` — update that comment).

**Interfaces:** Consumes everything above; builds what the approved board shows.

- [ ] **Step 1:** Build the sections and pages to the board. The export section loads
  `export-zip` with `await import(…)` on the button press (fflate never in the settings first load);
  saves with an `<a download>` over `URL.createObjectURL`; progress line `תמונות {done} מתוך {total}`.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm run build` — PASS; `npm run bundle:report`
  shows fflate only in the export chunk.
- [ ] **Step 3: Headless check** (memory `headless-browser-check`) on the dev server against the
  local DB with a throwaway studio: export downloads a zip that opens; close → redirected to
  `/closed`; a member's sign-in lands on the member `/closed`; reopen; the audit section lists the
  rows; a designer deletes their account; the client deletes their login. Screenshots to the
  scratchpad; compare with the board.
- [ ] **Step 4: Commit** `feat(account): the close, export, audit and delete screens (EVE-22, EVE-51, EVE-52)`

### Task 11: The legal drafts, CI, the record

**Files:** Modify `lib/legal/docs/privacy.ts`, `lib/legal/docs/terms.ts`, `.github/workflows/ci.yml`
(isolation job: `npm run db:verify:account` after `db:verify:isolation`), `CLAUDE.md` (one bullet:
"Account lifecycle (2026-11-27)" — the states, the seam, the registry rule "a new table needs its
entry in lib/account/tables.ts", plain modules), `docs/roadmap.md` if it lists account deletion.

- [ ] **Step 1:** Privacy and terms drafts describe §5.12's list; keep `{{retentionAfterClose}}`
  and `{{taxRecordsYears}}` as facts; add a reviewer `note` on the client-login line (decision 8).
  `npm run check:legal` → PASS.
- [ ] **Step 2:** CI step; `npm run checks` → PASS (count reported).
- [ ] **Step 3:** Full gate: `typecheck`, `lint`, `checks`, `build`, `db:verify:isolation`,
  `db:verify:account` — all PASS, outputs read.
- [ ] **Step 4: Commit** `docs(account): the legal drafts and the record describe the account lifecycle (EVE-22)`
- [ ] **Step 5:** Jira: comment on EVE-22/51/52 with the commits; EVE-53 comment (the sweep waits
  for the timer: `npm run accounts:erase-due`); EVE-84 comment (the accountant: 7 years? is the data
  enough for an audit?).
