# Platform round 1 — headers, health, CI, photos, isolation, roadmap

Epic **EVE-1** (Platform — security, legal, infrastructure). Source: `docs/qa/2026-11-27-production-readiness.md`.
Tasks in this round: **EVE-11** security headers · **EVE-24** health route (the route only) · **EVE-19** CI · **EVE-25** photo shrink · **EVE-57** roadmap · **EVE-23** isolation test.

## Working agreements (Ravid, 2026-11-27)

- Work in the worktree `.claude/worktrees/platform`, branch `feat/2026-11-27-platform` off master.
- Jira: a task goes **In Progress** when its work starts and **Done** only when it is **merged to master**.
- Anything that depends on the hosting/environment choice (Vercel, Neon, R2, Resend, the domain, monitoring/CAPTCHA/analytics vendors) is **parked**, with a comment on its task: EVE-15, 14, 13, 20, 53, 55, 77, 12, 21, 58 (and EVE-24's monitor half, EVE-56's database).
- Design work is done in Claude Design, on the Eve design system filled from this codebase.
- Legal pages are drafted in Hebrew with placeholders for the business facts, marked "draft — pending legal review", and not linked publicly until a lawyer has read them.

## §1 Security headers — EVE-11

**What exists:** nothing. No `headers()` in `next.config.ts`, nothing in `vercel.json` or `proxy.ts`. `/billing` and `/settings` can be framed by any site.

**Design.** One pure builder, `lib/security/headers.ts` (+ `check:headers`), used by `next.config.ts`'s `headers()` on every path:

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=63072000` — **no** `includeSubDomains`/`preload` until the domain exists (EVE-15) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (a `/join/<token>` or `/v/<token>` URL never leaves as a referrer) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), fullscreen=(self), web-share=(self)` — the app uses fullscreen (/present), share and the clipboard, nothing else |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` (**enforced**) | `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` — the three directives that cannot break a page |
| `Content-Security-Policy-Report-Only` | the full policy below |

The report-only policy: `default-src 'self'` · `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` in dev only) · `style-src 'self' 'unsafe-inline'` · `img-src 'self' data: blob: <file host>` · `font-src 'self' data:` · `connect-src 'self' <file host> <upload host>` · `media-src 'self' blob: <file host>` · `worker-src 'self' blob:` · `frame-src 'none'` · `form-action 'self'` · `manifest-src 'self'` · `upgrade-insecure-requests` (production only) · `report-uri /api/csp-report`.

`<file host>` and `<upload host>` are **read from the existing environment variables** (`NEXT_PUBLIC_R2_PUBLIC_URL`; `R2_ACCOUNT_ID` + `R2_JURISDICTION` for the presigned-PUT host). Unset = local files only (`'self'`). Whatever storage is chosen later, the policy follows its variables — nothing here names a vendor.

**`/api/csp-report`:** accepts both report formats, caps the body at 8 KB, logs ONE line per report — directive, blocked origin, the page's PATH (never its query or a token segment). Public in `proxy.ts`. Reports go to the server log until a monitoring service is chosen (EVE-12).

**Approaches considered:**
- **A — static policy with `'unsafe-inline'` (chosen, DECIDE-1).** Blocks scripts from any other origin, plugins, `<base>` hijack, framing and form posts elsewhere, with no runtime cost.
- **B — a nonce per request from `proxy.ts`.** Stronger against injected inline scripts, but it forces every page (the landing too) to render per request, and the app's inline `style={…}` attributes (the canvas transforms, positions) still need `'unsafe-inline'` for styles. Can come later on top of A.

**Done when** (per the ticket): headers on every response; report-only runs a week on production with nothing broken, then the full policy is enforced. The enforcement step needs production traffic, so EVE-11 stays open after merge until then.

## §2 Health route — EVE-24 (route only; the monitor is parked)

`GET`/`HEAD /api/health`: runs `select 1` with a 3 s timeout. `200 {"status":"ok","db":"ok","ms":12}` or `503 {"status":"error","db":"down"}`. `Cache-Control: no-store`. No version, region, env or error text in the body. Public in `proxy.ts`.

## §3 CI — EVE-19

`.github/workflows/ci.yml` on every push and on pull requests to master. Four parallel jobs, npm cache, Node 24 (what runs here), **no secrets** — nothing from Neon, Vercel or R2:

1. **typecheck** — `npm run typecheck`
2. **lint** — `npm run lint`
3. **checks** — every `check:*` script (177 today) through a small runner, `scripts/run-checks.ts`, that runs them several at a time and prints only failures with their output. The five that touch the database code (`variant-refs`, `password`, `access`, `appointments`, `marketplace`) are looked at while building: those that need a live database get a Postgres service container with `npm run db:migrate`.
4. **build** — `next build` with dummy values for the variables it requires at build time.

Later, **isolation** (§5) joins as a fifth job against the same Postgres container.

The repo is public, so Actions minutes are free and branch protection is available. **How master is protected is Ravid's call — question Q1.**

## §4 Photos shrunk and stripped before upload — EVE-25

**What exists:** `uploadFile(file, kind)` in `lib/files/upload.ts` is the ONE browser seam every upload goes through; it PUTs the original (≤ 25 MB, JPEG/PNG/WebP/AVIF). Nothing resizes, nothing strips EXIF.

**Design.** `uploadFile` first calls `prepareImage(file, kind)` (`lib/files/shrink.ts`, browser): decode with `createImageBitmap(file, { imageOrientation: "from-image" })` (a phone photo comes out the right way up), draw onto a canvas at most N px on its long side, re-encode. The canvas output carries **no metadata**, so a client's photo loses its GPS location. The rule (size and format by kind) is pure, in `lib/files/shrink-rules.ts` (+ `check:shrink`).

| Kind | Long side (DECIDE-4) | Why |
| --- | --- | --- |
| `gallery`, `product`, `dish`, `sketch` | 2400 px | photographs on screens and presentations |
| `underlay` | 4000 px | a scanned hall plan is traced to scale; it needs its detail |
| `logo`, `signature` | 1200 px | printed small on documents |

Format: JPEG → JPEG (quality 0.85); PNG → PNG (keeps the transparency of a logo or signature); WebP/AVIF → JPEG, or PNG when the picture has transparency. **Always re-encoded, even when already small** — that is what removes the location. A file the browser cannot decode is uploaded as today (DECIDE-5): the server's limits still apply. The 25 MB server limit stays. Files already uploaded are not reprocessed.

## §5 Cross-tenant isolation test — EVE-23

**What exists:** no row-level security; isolation rests on every action filtering by `currentOrg()`. 191 exported server actions in 28 `"use server"` files. Scripts act as an organisation or a user through `actAsOrgForScript` / `actAsUserForScript` (refused in production). The billing walk-through already runs in throwaway organisations.

**Design.** `lib/db/verify-isolation.ts` → `npm run db:verify:isolation`:
- Creates throwaway organisations — studio **A**, studio **B**, plus a supplier and a venue where an action needs one — seeds A through the real actions (venue, zones, event, design document, quote, billing document, gallery, appointment, product, order…), and deletes everything at the end.
- Acting as **B**, calls every action with **A's ids**. Each must refuse: throw, return `{ error }`, return empty/null, or change nothing — checked by re-reading A's rows as A afterwards.
- **Coverage is enforced (DECIDE-6):** the script reads the export list of every `"use server"` file itself, and every export must have an entry — a cross-tenant case, or "acts only on the caller's own organisation" with a reason. Even those are checked: a list read as B must contain none of A's ids. A new action without an entry fails the script, so the test cannot fall behind the code.
- Runs locally against the Docker Postgres, and in CI (§3). Never against Neon.

## §6 Roadmap — EVE-57

Update `docs/roadmap.md`. Clerk → Better Auth (done). The bell is built, and product images are wired. Each "Left" item is checked against the code. Environment items are marked "under review", and the document links to the production-readiness audit and the Jira epics.

## Build order

1. §1 headers + `/api/csp-report` + §2 `/api/health` (one commit)
2. §3 CI
3. §4 photo shrink
4. §6 roadmap
5. §5 isolation test (the largest), then its CI job

Each step: typecheck, lint and the new check green; commit; Jira comment with the commit. The task stays In Progress until merged.

## DECIDE

1. CSP approach A (static, `'unsafe-inline'`) now; nonces (B) can come later.
2. HSTS without `includeSubDomains`/`preload` until the domain is chosen.
3. CSP reports go to the server log via `/api/csp-report` until a monitoring service is chosen.
4. Long-side limits: 2400 / 4000 (underlay) / 1200 (logo, signature).
5. A photo the browser cannot decode is uploaded unchanged.
6. Isolation coverage is enforced by the inventory: a new action without a case fails the script.

## Questions for Ravid

- **Q1 — How CI guards master.** Today you push straight to master.
  - a) Master accepts changes only through a PR with green CI. Safest; each round merges with one click.
  - b) CI is required, but you (admin) can still push directly. You see red/green on every push and nothing blocks you.
  - c) No rule; CI only reports.
  - Recommendation: **a**.
- **Q2 — The repository is public.** Anyone can read the whole codebase and its docs, and `CLAUDE.md` contains the dev supplier's login and password (`scripts/supplier-buki.ts`'s account on the develop database). If that isn't intended, making it private is one click, but then:
  - Actions get 2,000 free minutes a month instead of unlimited.
  - Branch protection (Q1 a/b) needs a paid GitHub plan.
  - Either way, that password should come out of `CLAUDE.md` and be changed.
