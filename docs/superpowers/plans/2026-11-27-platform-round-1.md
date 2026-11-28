# Platform round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Security headers, a health route, CI that guards master, photos shrunk and stripped before upload, an up-to-date roadmap, and a cross-tenant isolation test that covers every server action.

**Architecture:** Pure rules in small `lib/` modules, each with its own self-check, wired into the existing seams: `next.config.ts` `headers()`, `proxy.ts`'s public list, `lib/files/upload.ts` (the one upload seam), `package.json` scripts, and a GitHub Actions workflow. The isolation test drives the REAL server actions as real users through `actAsUserForScript`.

**Tech Stack:** Next.js 16.3.8 (App Router, `proxy.ts`), TypeScript, Drizzle + postgres-js, tsx self-checks, GitHub Actions, Node 24.

**Spec:** `docs/superpowers/specs/2026-11-27-platform-round-1-design.md`

## Global Constraints

- Nothing names a hosting vendor: storage origins come from `NEXT_PUBLIC_R2_PUBLIC_URL`, `R2_ACCOUNT_ID`, `R2_JURISDICTION`; unset = `'self'` only.
- No secrets in CI. Nothing reads Neon, Vercel or R2 from CI.
- **New self-checks go in a sibling `*.check.ts` file**, never an `isMain` block at the bottom of the module (EVE-54 is moving the old ones out of the browser bundle — don't add to it). Same assert style as the old checks: `ok   …` lines, `FAIL: …` + exit 1.
- Every new check gets a `check:<name>` script in `package.json`.
- Hebrew for anything a person reads; RTL logical properties if any UI is touched (none is planned).
- `npm run typecheck` and `npm run lint` green before every commit.
- Jira: move a task to **In Progress** (transition id `21`) when its first step starts; add a comment with the commit hash when it is committed; **Done** only after merge to master (Ravid merges the PR).
- Never stage `app/(app)/outputs/*` or `app/globals.css` changes from the main checkout — they are not in this worktree and must stay that way.

## Review Focus

1. **A page with a token in its URL** (`/join/<token>`, `/v/<token>`) producing a CSP report — the token must not reach the server log. → Task 1 check: `reportLines` masks a long path segment.
2. **A signed-out visitor's page** sending a CSP report, or a monitor hitting `/api/health` with no cookie — `proxy.ts` must not redirect either to `/login`. → Task 1 Step 6 and Task 2 Step 3 curl without a cookie.
3. **An iPhone photo taken in portrait** — after shrinking it must still be upright (EXIF orientation applied before the metadata is dropped). → Task 4 browser check: a JPEG carrying orientation 6 comes out taller than wide.
4. **A transparent PNG logo or signature** — must stay PNG with its transparency, never turn into a JPEG on a black background. → Task 4 check: `outputType("image/png", true) === "image/png"` and the browser check reads alpha back.
5. **An action added next month without an isolation case** — the isolation script must fail, not pass silently. → Task 6 Step 2: an inventory test with a fake export.

---

### Task 1: Security headers and the CSP report endpoint (EVE-11)

**Files:**
- Create: `lib/security/headers.ts`, `lib/security/headers.check.ts`, `lib/security/csp-report.ts`, `lib/security/csp-report.check.ts`, `app/api/csp-report/route.ts`
- Modify: `next.config.ts` (add `headers()`), `proxy.ts:44` (`PUBLIC` += `"/api/csp-report"`), `package.json` (`check:headers`, `check:csp-report`)

**Interfaces:**
- Produces:
  - `interface HeaderEnv { dev: boolean; filePublicUrl?: string; r2AccountId?: string; r2Jurisdiction?: string }`
  - `headerEnvFromProcess(): HeaderEnv` (reads `NODE_ENV`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `R2_ACCOUNT_ID`, `R2_JURISDICTION`)
  - `securityHeaders(env: HeaderEnv): { key: string; value: string }[]`
  - `ENFORCED_POLICY = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"`
  - `reportOnlyPolicy(env: HeaderEnv): string`
  - `uploadOrigin(accountId?: string, jurisdiction?: string): string | undefined` → `https://<account>.<jurisdiction>.r2.cloudflarestorage.com` or `https://<account>.r2.cloudflarestorage.com` (the same host `lib/files/driver.ts:107` builds)
  - `reportLines(body: unknown): string[]` (csp-report.ts)

- [ ] **Step 1: Move EVE-11 to In Progress** (`transitionJiraIssue` EVE-11, transition `21`).

- [ ] **Step 2: Write `lib/security/headers.check.ts`** asserting:
  - `securityHeaders({dev:false})` has exactly the keys `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, `Content-Security-Policy`, `Content-Security-Policy-Report-Only`
  - HSTS value is `max-age=63072000` exactly (no `includeSubDomains`, no `preload`)
  - `Permissions-Policy` is `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), fullscreen=(self), web-share=(self)`
  - enforced CSP === `ENFORCED_POLICY`
  - report-only with no env: `img-src 'self' data: blob:` and `connect-src 'self'` (no storage host), contains `report-uri /api/csp-report`, contains `upgrade-insecure-requests`, no `'unsafe-eval'`
  - `dev: true`: contains `'unsafe-eval'` in `script-src`, `ws:` in `connect-src`, and no `upgrade-insecure-requests`
  - with `filePublicUrl: "https://media.example.com/x"`, `r2AccountId: "acct"`, `r2Jurisdiction: "eu"`: `img-src` and `media-src` contain `https://media.example.com` (origin, not the path), `connect-src` contains both it and `https://acct.eu.r2.cloudflarestorage.com`
  - `uploadOrigin("acct")` === `https://acct.r2.cloudflarestorage.com`; `uploadOrigin()` undefined; a malformed `filePublicUrl` is ignored, never thrown

- [ ] **Step 3: Run `npx tsx lib/security/headers.check.ts`** — expect FAIL (module missing).

- [ ] **Step 4: Implement `lib/security/headers.ts`** with the directives from spec §1, no imports (it is imported by `next.config.ts` by relative path). Then `next.config.ts`: `async headers() { return [{ source: "/(.*)", headers: securityHeaders(headerEnvFromProcess()) }]; }` beside the existing `redirects()`.

- [ ] **Step 5: Write `lib/security/csp-report.check.ts`**, then implement `reportLines`. Assertions:
  - legacy body `{"csp-report":{"effective-directive":"img-src","blocked-uri":"https://evil.example/a.png?x=1","document-uri":"https://app.test/join/abcDEF1234567890abcdef?y=2"}}` → `["[csp] img-src blocked https://evil.example on /join/…"]`
  - Reporting-API body `[{"type":"csp-violation","body":{"effectiveDirective":"script-src-elem","blockedURL":"inline","documentURL":"https://app.test/v/Zz9-xYw_1234567890abcd"}}]` → `["[csp] script-src-elem blocked inline on /v/…"]`
  - a path segment of 20+ chars from `[A-Za-z0-9_-]` becomes `…`; short segments stay (`/billing/…` only when the id is long)
  - `null`, a string, `{}` and an array of non-csp reports → `[]`; at most 20 lines per body

- [ ] **Step 6: `app/api/csp-report/route.ts`** — `POST` only: read `request.text()`; over 8192 chars → `413`; `JSON.parse` in try/catch; `console.warn` each of `reportLines(...)`; answer `204`. Add `"/api/csp-report"` to `PUBLIC` in `proxy.ts`. Add `check:headers` and `check:csp-report` to `package.json`.

- [ ] **Step 7: Verify.** `npm run check:headers && npm run check:csp-report` → both pass. Start `npm run dev` in the worktree (port 3100: `npx next dev -p 3100`), then:
  - `curl -sI http://localhost:3100/login` → all seven headers present
  - `curl -s -o /dev/null -w "%{http_code}" -X POST -H "content-type: application/csp-report" --data '{"csp-report":{"effective-directive":"img-src","blocked-uri":"https://x.test/a","document-uri":"http://localhost:3100/join/abcdefghijklmnopqrstuvwx"}}' http://localhost:3100/api/csp-report` → `204` with no cookie, and the dev log shows `[csp] img-src blocked https://x.test on /join/…`
  - open `/`, `/login` and a signed-in `/studio` in headless Chrome (memory `headless-browser-check`) and record any report lines the policy produces — they are the list to fix before enforcement, not failures of this task.

- [ ] **Step 8: Commit** `feat(security): security headers, a report-only CSP and its report endpoint (EVE-11)`; Jira comment on EVE-11 with the hash and the report lines seen in Step 7.

### Task 2: Health route (EVE-24, route only)

**Files:**
- Create: `app/api/health/route.ts`
- Modify: `proxy.ts` (`PUBLIC` += `"/api/health"`)

- [ ] **Step 1: Move EVE-24 to In Progress.**
- [ ] **Step 2: Implement** `GET` and `HEAD`: `Promise.race` of `db().execute(sql\`select 1\`)` and a 3000 ms timeout. Success → `200 {"status":"ok","db":"ok","ms":<int>}`; failure or timeout → `503 {"status":"error","db":"down"}`; never the error text. Header `Cache-Control: no-store`. HEAD returns the same status with no body.
- [ ] **Step 3: Verify** with no cookie: `curl -s http://localhost:3100/api/health` → `200` and `"db":"ok"`; `curl -sI` → `200`; then `docker compose stop db` (or the Postgres service name in `docker-compose.yml`) → `503` within ~3 s; start it again → `200`.
- [ ] **Step 4: Commit** `feat(platform): /api/health checks the database (EVE-24)`; Jira comment (route done; monitor still parked).

### Task 3: CI and the master guard (EVE-19)

**Files:**
- Create: `scripts/run-checks.ts`, `.github/workflows/ci.yml`
- Modify: `package.json` (`"checks": "tsx scripts/run-checks.ts"`), `CLAUDE.md` Working Rules (one bullet: master takes changes only through a PR with green CI)

**Interfaces:**
- Produces: `npm run checks [filter]` — runs every `check:*` script's COMMAND (from `package.json`, through the shell, skipping npm's per-script startup) with concurrency `min(8, os.availableParallelism())`; prints `ok   <name>  <ms>ms` per pass, the full output of each failure, a final `N passed, M failed`; exit 1 on any failure. An optional argument filters names by substring.
- Job names (the required status checks): `typecheck`, `lint`, `checks`, `build`.

- [ ] **Step 1: Move EVE-19 to In Progress.**
- [ ] **Step 2: Write `scripts/run-checks.ts`; run `npm run checks`** locally — expect all 177 (+ the new ones) to pass. Any that fail on master too are reported to Ravid, not silently skipped.
- [ ] **Step 3: Run `npm run lint` and `npx next build`** in the worktree with `.env.local` moved aside (`BETTER_AUTH_SECRET=ci-build-only` and nothing else) to learn exactly which variables the build needs; give the `build` job only those, as dummy literals.
- [ ] **Step 4: Write `.github/workflows/ci.yml`:** `name: CI`; `on: push` (all branches), `pull_request` (branches `[master]`), `workflow_dispatch`; `concurrency: ci-${{ github.ref }}` with cancel-in-progress; four jobs on `ubuntu-latest`, each `actions/checkout@v4` → `actions/setup-node@v4` (`node-version: 24`, `cache: npm`) → `npm ci` → its command; `permissions: contents: read`; `env: NEXT_TELEMETRY_DISABLED: 1`.
- [ ] **Step 5: Commit** `ci: typecheck, lint, every self-check and the build on each push (EVE-19)`, then commit the CLAUDE.md bullet.
- [ ] **Step 6: Push the branch and open a PR to master** (`gh pr create`, title `Platform round 1 — headers, health, CI, photos, isolation`, body lists the Jira keys). Wait for the four jobs; fix until green.
- [ ] **Step 7: Protect master (Q1 = a)** once the four checks have reported on the PR:
  `gh api -X PUT repos/Ravidi22/EventDesigner/branches/master/protection` with `{"required_status_checks":{"strict":false,"contexts":["typecheck","lint","checks","build"]},"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null}`. Verify: `gh api repos/Ravidi22/EventDesigner/branches/master/protection --jq '.required_status_checks.contexts'` lists the four.
- [ ] **Step 8: Jira comment on EVE-19** — PR link, protection on, and that direct pushes to master (including other Claude sessions' "push to master") are now refused.

### Task 4: Photos shrunk and stripped before upload (EVE-25)

**Files:**
- Create: `lib/files/shrink-rules.ts`, `lib/files/shrink-rules.check.ts`, `lib/files/shrink.ts` (`"use client"`)
- Modify: `lib/files/upload.ts:39-50` (`uploadFile` prepares the file first), `package.json` (`check:shrink`)

**Interfaces:**
- Consumes: `FileKind`, `ALLOWED_TYPES`, `MAX_BYTES` from `lib/files/keys.ts`
- Produces:
  - `LONG_SIDE: Record<FileKind, number>` = gallery 2400, product 2400, dish 2400, sketch 2400, underlay 4000, logo 1200, signature 1200
  - `JPEG_QUALITY = 0.85`
  - `targetSize(width: number, height: number, kind: FileKind): { width: number; height: number }` — never enlarges; rounds; ≥ 1 px
  - `outputType(inputType: string, hasAlpha: boolean): "image/jpeg" | "image/png"`
  - `renamed(name: string, type: "image/jpeg" | "image/png"): string` — same base name, `.jpg`/`.png`
  - `prepareImage(file: File, kind: FileKind): Promise<File>` (shrink.ts)

- [ ] **Step 1: Move EVE-25 to In Progress.**
- [ ] **Step 2: Write `lib/files/shrink-rules.check.ts`:** `targetSize(4032, 3024, "gallery")` → `{2400, 1800}`; `targetSize(3024, 4032, "product")` → `{1800, 2400}`; `targetSize(6000, 4000, "underlay")` → `{4000, 2667}`; `targetSize(800, 600, "gallery")` → unchanged; `targetSize(5000, 1, "logo")` → height 1; `LONG_SIDE` has every `FILE_KINDS` entry; `outputType("image/jpeg", false)` jpeg; `outputType("image/png", false)` and `(…, true)` png; `outputType("image/webp", true)` png, `(…, false)` jpeg; `outputType("image/avif", false)` jpeg; `renamed("IMG_1.HEIC.webp", "image/jpeg")` → `IMG_1.HEIC.jpg`; `renamed("logo", "image/png")` → `logo.png`.
- [ ] **Step 3: Run it** — FAIL; **implement `shrink-rules.ts`**; run — PASS; add `check:shrink`.
- [ ] **Step 4: Implement `prepareImage`:** `createImageBitmap(file, { imageOrientation: "from-image" })` (catch → return `file` unchanged, DECIDE-5); `OffscreenCanvas` when defined, else a `<canvas>`; alpha is read only for WebP/AVIF input (draw a ≤ 256 px copy, any `alpha < 255`); `convertToBlob`/`toBlob` with `outputType` and `JPEG_QUALITY`; return `new File([blob], renamed(file.name, type), { type })`. Always re-encodes (that is what drops EXIF/GPS).
- [ ] **Step 5: Wire it:** in `uploadFile`, after `fileProblem(file)`, `const ready = await prepareImage(file, kind)`; use `ready.type`, `ready.size` and `ready` as the body.
- [ ] **Step 6: Browser check** (headless Chrome against the dev server, script in the scratchpad): build a 4032×3024 JPEG on a canvas, splice in an APP1 `Exif` segment with orientation 6 and a GPS IFD; run `prepareImage(file, "gallery")` in the page →
  - output is `image/jpeg`, 1800×2400 (rotated upright)
  - the bytes contain no `Exif` marker
  - it is well under 1 MB
  - a transparent 3000×3000 PNG through `"logo"` → `image/png`, 1200×1200, corner pixel alpha 0

  Then upload a real photo through the gallery screen and open it.
- [ ] **Step 7: Commit** `feat(files): photos shrunk and stripped of location before upload (EVE-25)`; Jira comment with before/after sizes from Step 6.

### Task 5: Roadmap (EVE-57)

**Files:** Modify: `docs/roadmap.md`

- [ ] **Step 1: Move EVE-57 to In Progress.**
- [ ] **Step 2: Update it:**
  - §3 "Clerk" becomes Better Auth, done (ADR-10 as updated 2026-10-17).
  - The bell is built; product images are wired.
  - Check each item under "Left" against the code (grep the named module or route) and mark it built or still open.
  - Hosting items are marked "under review (environment choice)".
  - A new top line links `docs/qa/2026-11-27-production-readiness.md` and the Jira epics (EVE-1 …).
- [ ] **Step 3: Commit** `docs: roadmap brought up to date, linked to the production-readiness audit (EVE-57)` with the audit file itself (`docs/qa/2026-11-27-production-readiness.md`) and the round-1 spec and plan; Jira comment.

### Task 6: Cross-tenant isolation test (EVE-23)

**Files:**
- Create: `lib/db/isolation/inventory.ts`, `lib/db/isolation/inventory.check.ts`, `lib/db/isolation/fixture.ts`, `lib/db/isolation/judge.ts`, `lib/db/isolation/judge.check.ts`, `lib/db/isolation/cases/<domain>.ts` (one per `"use server"` file's folder), `lib/db/verify-isolation.ts`
- Modify: `package.json` (`db:verify:isolation`, `check:isolation-inventory`, `check:isolation-judge`), `.github/workflows/ci.yml` (fifth job `isolation`), branch protection (add `isolation` to the required checks)

**Interfaces:**
- Produces:
  - `serverActions(root: string): string[]` — every `"use server"` file under `lib/` and `app/`, every `export (async) function NAME` / `export const NAME =`, as `"<path>#<NAME>"` (191 today)
  - `type Case = { kind: "cross"; call: (a: Fixture) => Promise<unknown> } | { kind: "own"; reason: string; call?: () => Promise<unknown> }`
  - `CASES: Record<string, Case>` (merged from `cases/*.ts`)
  - `interface Fixture` — org, user and row ids of studio A (and its supplier/venue/client counterparts): `{ orgA, ownerA, venueId, zoneId, eventId, documentId, quoteId, billingDocumentId, productId, galleryImageId, appointmentId, orderId, … }`; `seedA(): Promise<Fixture>`; `cleanup(f: Fixture): Promise<void>`; `snapshotA(f: Fixture): Promise<string>` (a stable hash of A's rows across every table carrying `organization_id`)
  - `judge(result: unknown | Error, aIds: string[]): { refused: boolean; why: string }` — refused = threw, or `{ error }`, or null/undefined/empty, or the serialised result contains none of `aIds`

- [ ] **Step 1: Move EVE-23 to In Progress.**
- [ ] **Step 2: Inventory and its check.** `inventory.check.ts`:
  - `serverActions` on the repo returns ≥ 191 entries, including `lib/catalog/actions.ts#fetchProducts`
  - run against a temp dir holding a fake `"use server"` file with `export async function sneaky()`, `missingCases(serverActions(tmp), CASES)` returns `["<tmp>/x.ts#sneaky"]` (Review Focus 5)
- [ ] **Step 3: `judge` and its check:** throws → refused; `{error:"x"}` → refused; `[]`/`null` → refused; `{rows:[{id: A_EVENT}]}` with `aIds=[A_EVENT]` → NOT refused; `{rows:[{id:"other"}]}` → refused.
- [ ] **Step 4: Fixture** — throwaway organisations created through the same inserts sign-up uses (study `lib/billing/verify.ts` and `lib/client-portal/verify.ts`): studio A with owner user, studio B with owner user, a supplier org + user, a venue org + user, a client user invited to A's event. Seed A through the real actions while acting as A's owner (`actAsUserForScript(ownerA)`). Every name carries "(בדיקת בידוד)" so a leftover is obvious; `cleanup` deletes by organisation in FK order and runs in `finally`.
- [ ] **Step 5: Cases, one file per domain folder** (28 files → one `cases/<folder>.ts` each), every export either `cross` (called as B's owner — or B's supplier/venue/client user where the action is gated on that kind — with A's ids) or `own` with its reason. One commit per few folders is fine.
- [ ] **Step 6: `verify-isolation.ts`:** load `.env.local`; refuse unless `DATABASE_URL` host is `localhost`/`127.0.0.1`/the CI service; `missingCases` → fail listing them; `seedA`; `snapshotA` before; for each case act as the right B user, run, `judge`; `snapshotA` after must equal before; print `ok`/`LEAK` per action and a summary; `cleanup`; exit 1 on any leak or missing case.
- [ ] **Step 7: Run `npm run db:verify:isolation`** against the local Docker Postgres. A LEAK is a real bug: stop, report it to Ravid with the action and what came back, fix it in its own commit (with a Jira comment), re-run.
- [ ] **Step 8: CI job `isolation`:** `services: postgres` (image `postgres:16`, the user/password/db from `docker-compose.yml`, health-cmd `pg_isready`), `env: DATABASE_URL=postgres://…@localhost:5432/…`, steps `npm ci` → `npm run db:migrate` → `npm run db:verify:isolation`. Push; wait for green; add `isolation` to the required checks.
- [ ] **Step 9: Commit and Jira comment** with the action count, the cases by kind, and any leaks found and fixed.
