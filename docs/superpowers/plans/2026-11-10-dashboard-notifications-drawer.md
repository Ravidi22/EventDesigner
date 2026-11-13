# Dashboard redesign — Stages 2 & 3: the dashboard (1b), the notifications sheet (2b), the event drawer (3b · A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining proposals of Ravid's claude.ai/design project "Dashboard structure design": the dashboard's top row as today + this week (board `Dashboard.dc.html` 1b), the bell's side sheet (2b), and the event drawer in direction **A · tightened** (board `Event Drawer.dc.html` 3b — Ravid's pick, 2026-11-10).

**Architecture:** Three tasks with DISJOINT files so they can be built at once. Every new rule that is more than layout is a pure, self-checked module in `lib/` (`lib/appointments/week-ahead.ts`, `lib/notifications/groups.ts`, `lib/events/waiting.ts`; their `check:*` scripts are already in package.json).

**Tech Stack:** Next 16, React 19, Tailwind v4 tokens, lucide-react.

**Spec:** the boards. Copies: session scratchpad `design/Dashboard.dc.html` (1b: the `data-screen-label="1b Dashboard proposed"` block + its DEFINITION aside + the `data-dc-script` at the bottom, which holds the board's sample logic; 2b: `data-screen-label="2b Notifications sheet"` + aside) and `design/Drawer.dc.html` (3b: `id="3b"` block + the notes under it + `folds` in the script). Stage 1 (Modals) is built: docs/superpowers/plans/2026-11-10-dashboard-modals.md.

## Global Constraints

- Everything in Stage 1's Global Constraints (tokens not hex, radii, RTL logical properties, no display utility on a `<dialog>`, kind vocabulary `KIND_CARD_THEME`/`KIND_ICON`, status vocabulary `STATUS_CARD_THEME`).
- Both businesses: a studio and a venue (hall) read the same layout; a venue's events carry booking statuses (`look` in venue-dashboard.tsx) and no progress.
- No new server tables, no migrations.
- Verify: `npm run typecheck`, the task's `check:*`, eslint on the task's files.

## Review Focus

1. A day with nothing today must still give each top tile a job (events: what's next; meetings: book one; week: "שבוע פנוי").
2. The notifications sheet must never act for the wrong side: a client's bell (app/client) has no "דורש פעולה" and no studio links.
3. The drawer's "ממתין לכם" must not show anything that is not waiting (a resolved proposal, a past meeting, a quote the client answered).
4. Fold open-state is a per-device UI preference (localStorage, try/catch) — never data.
5. Hebrew copy must not guess an actor's gender (2b note): neutral phrasing.

---

### Task A: The dashboard's top row — today + this week (1b)

**Files (yours alone):** `app/(app)/dashboard/today-focus.tsx`, Create `app/(app)/dashboard/week-ahead.tsx`, Create `lib/appointments/week-ahead.ts`, `app/(app)/dashboard/calendar-card.tsx`, `app/(app)/dashboard/dashboard-screen.tsx`, `app/(app)/dashboard/venue-dashboard.tsx`, `app/(app)/dashboard/page.tsx`.

**Interfaces:**
- Produces `weekAhead(input: { from: string /* tomorrow ISO */; events: EventSummary[]; appointments: Appointment[] }): { days: WeekDay[]; agenda: AgendaDay[] }` — 7 days from `from`; `WeekDay { iso; weekday /* "א׳".."ש׳" */; num; hasEvent: boolean; kinds: AppointmentKind[] /* ≤3, in time order */ }`; `AgendaDay { iso; label /* "מחר · יום ד׳ 11" for the first, else "יום ה׳ · 12" */; note? /* first holiday of calendarDay(iso) */; rows: AgendaRow[] }` only for days with something; `AgendaRow = { kind: "event"; event } | { kind: "appointment"; appointment }`, events and timed entries in time order, untimed entries last.
- CalendarCard gains `jump?: { iso: string; n: number } | null` (a new `n` re-jumps to the same day) → week mode anchored on `iso`; and layer toggles (see Step 3).
- DashboardScreen gains `initialEventId?: string` (page.tsx reads `?event=`); when it is set and the event is in the list, the drawer opens on it (adjust-state-during-render on a prop change, the pattern used across this codebase). Venue: /bookings already handles `?event=`.

- [ ] **Step 1 (check first):** `lib/appointments/week-ahead.ts` with an `isMain` self-check: the board's week (events on the 12th and 15th, a supply on the 11th, an untimed constraint on the 13th, three entries and an event on the 15th, a vacation on the 16th–17th) → 7 days, `hasEvent` on 12 and 15, the 15th's agenda rows in time order with the 18:00 event between the 16:00 and 19:00 entries, the 13th's untimed row present, days with nothing absent from `agenda`; archived/lost events never counted. FAIL → implement → PASS (`npm run check:week-ahead`).
- [ ] **Step 2: three equal tiles** (`lg:grid-cols-3`, gap-5) replacing Today's Focus' two:
  - **אירועים היום** — the one violet surface (keep its gradient and `glass-deep` cards): each card gets chips under the meta (`rounded-pill bg-canvas/16 px-2.5 py-1 text-xs font-semibold text-canvas`): the status word with BadgeCheck when confirmed (via the caller's `look`), and the load-in ("הקמה היום" / "הקמה מ־<d.m>" from `setupDate`; no hour exists — CLAUDE.md: no typed load-in hour). It ENDS with a hairline row "הבא: **<client>** · <weekday d בMMM>" + a white pill "פתיחה ←" (opens the next event) — shown with or without events today; the empty state stays when there are none today.
  - **פגישות היום** — a TIMELINE: a 44px time column (start time, `nums`), the card beside it (kind rail + tint, glyph, name, the duration at the end "1½ ש׳"/"45 דק׳", meta line `<kind> · <note>`); Google blocks INTERLEAVED by start time (dashed, Lock, "Google" at the end); a live NOW line (accent dot + 1.5px rule + "עכשיו", the time in accent) inserted before the first row that ends after now; a row whose time has passed (`hasPassed`) or is `done` goes muted + struck with CircleCheck. The tile's "+" (32px `bg-accent-tint` puck, title "קביעת פגישה") sits in the HEADER beside the title. Summary under the title: `<weekday d בMMMM> · עוד N היום` / `הכל מאחוריך`. Keep the list scrolled to the first row ahead.
  - **השבוע הקרוב** — summary `<d–d בMMMM> · N אירועים · M ביומן`; the 7-day strip (weekday, number, ✦ Sparkles accent when an event, up to 3 6px dots in the kinds' RAIL colour — a local `bg-*` table in week-ahead.tsx mirroring `KIND_CARD_THEME`'s rails, since dashboard-view-utils.ts is not in this task's files); a day with an event on `bg-accent-tint` with `border-badge-line`; clicking a day calls `onJump(iso)` (→ CalendarCard `jump`). Under it the agenda (max-h-[248px] scroll): a day heading (12px bold ink-soft, its holiday note as a small accent-tint pill, a hairline to the end), rows (13px: glyph in its ink, name, status word for an event, time or "כל היום" at the end; event rows bold on their status tint). Empty: "שבוע פנוי — אין אירועים ורשומות ביומן".
- [ ] **Step 3: the calendar.** Layer toggles before "היום": three pills (h-8, 13px semibold, `aria-pressed`; on = `border-accent-line bg-accent-wash text-accent-hover`, off = `border-border bg-surface text-ink-soft`) — Sparkles "אירועים" (a venue passes `eventsLabel="ערבים"`), CalendarDays "יומן", Lock "Google" (only when the person has Google busy blocks or is connected) — hiding that layer's cards in the grid and the day popover (the "+N" counts only shown layers), separated from the rest by a hairline (`border-e border-border-soft pe-2`). `jump` per the Interfaces.
- [ ] **Step 4:** Remove `VenueInvites` from dashboard-screen (the invitations move into the notifications sheet — Task B). `initialEventId` per the Interfaces. Widen `openEvent`'s `to` to `"/meeting" | "/outputs" | "/studio" | "/scene"` (Task C's drawer needs /scene). venue-dashboard gets the same three tiles.
- [ ] **Step 5:** typecheck, `npm run check:week-ahead`, eslint on your files. Do NOT commit.

### Task B: The notifications sheet (2b)

**Files (yours alone):** `components/notification-bell.tsx`, Create `components/notifications-sheet.tsx`, Create `lib/notifications/groups.ts`, `lib/notifications/types.ts`, `app/(app)/dashboard/venue-invites.tsx`.

**Interfaces:**
- Produces `groupNotifications(items: AppNotification[], now: Date): NotificationGroup[]` — `NotificationGroup { eventId: string | null; label: string /* payload.eventLabel, else "כללי" */; when: "היום" | "אתמול" | "מוקדם יותר"; newest: string; items: AppNotification[] }`: one group per event, newest activity first, `when` from the group's newest; within a group newest first. Plus `NOTIFICATION_ICON: Record<NotificationKind, LucideIcon>` (proposal.* PenTool, client.joined UserCheck, event.shared Share2, link.* Building2) in types.ts or a sibling `.tsx`-free module.
- The sheet is the shared `Drawer` (components/drawer.tsx — do NOT edit it; Task C owns it) at its default width (448), opened by the bell (the bell stays tinted `bg-accent-tint text-accent` while open, badge = unread).

- [ ] **Step 1 (check first):** groups.ts self-check: two events + one eventless notification → three groups, newest-active group first, `when` buckets across midnight, items newest first. `npm run check:notification-groups`.
- [ ] **Step 2: copy.** `notificationText` stops guessing gender (2b note): neutral phrasings — `proposal.submitted` "<n> שינויים בסקיצה מ<actor>" (one: "שינוי אחד בסקיצה מ<actor>"), `client.joined` "<actor> בפנים — אפשר להציע שינויים", `link.invited` "הזמנה לעצב אירוע מ<actor>", `link.accepted` / `link.declined` "<actor>: הקישור אושר" / "<actor>: הקישור נדחה", `link.updated` "עדכון מ<actor>: <facts>", `event.shared` "<actor> שיתפו אתכם באירוע", `proposal.resolved` unchanged (it names "המעצב" = the role). Keep `detail`.
- [ ] **Step 3: the sheet** (`NotificationsSheet({ feed, onClose, onMarkAll, onFollow, side: "studio" | "venue" | "client" })`): header = title "התראות" + an accent-wash count pill "<n> חדשות" + "סימון הכל כנקרא" (text button, accent) + ✕ (Drawer's `title`/`titleAside`/`actions`); body on the `bg` plane, `gap-5`:
  - **Filters** — a compact segmented pill row (`segmentFrameClass`/`segmentClass` from components/segmented.tsx, compact) הכל · לא נקראו · דורש פעולה, each with its count.
  - **דורש פעולה** (studio only; pinned on top; the section heading 12px semibold muted + an alert-tint count pill): (a) every PENDING venue invitation as a card (`rounded-md border-accent-line bg-surface p-4`): Building2 tile, "<host> הזמינו אתכם לעצב אירוע" (neutral plural), "<client> · <date> · <venue> · <n> איש", the time ago; an inset well "לקשר ל־" with the event Select (the strip's controls — move them out of venue-invites.tsx into an exported `InviteCard` the sheet renders; venue-invites.tsx keeps exporting it), the line "מעכשיו האירוע עוקב אחרי התאריך, האזורים והאורחים של האולם.", then "אישור וקישור" (primary) + "דחייה" (ghost). (b) every pending client proposal (`fetchPendingProposals`): PenTool tile, "<n> שינויים בסקיצה מ<client>", "<client> · ממתין לאישורכם", the outline "סקירת השינויים" (→ `/studio?review=<id>` after `setActiveEventId`) and ghost "פתיחת האירוע" (→ the event drawer). The sheet reads both (`fetchStudioLinks`, `fetchPendingProposals`, `fetchEvents` for the invite's candidates and the groups' status) when it opens, studio only.
  - **Groups** (`groupNotifications`): the `when` heading when it changes; a white card per event — header row (Sparkles in the status ink, the event's name bold, its status chip — `STATUS_CARD_THEME` by `eventStatus`/booking status when the event is known —, ChevronLeft) that opens the event (`/dashboard?event=<id>` studio, `/bookings?event=<id>` venue); rows: unread dot, the kind glyph (15px muted), the line (13px, semibold when unread), the time ago — a row keeps today's deep link (`notificationHref`). Filter "לא נקראו" drops read rows and empty groups; "דורש פעולה" shows only the pinned section.
  - **Empty**: CircleCheck in a 44px bordered tile, "הכל נקרא", "התראות חדשות יופיעו כאן."
- [ ] **Step 4:** the bell opens the sheet (no Popover any more) and keeps its polling. A client's bell (app/client/*) opens the same sheet with `side="client"` (no action section, groups without status). Typecheck, the check, eslint on your files. Do NOT commit.

### Task C: The event drawer, direction A (3b)

**Files (yours alone):** `app/(app)/dashboard/event-detail-drawer.tsx`, `components/drawer.tsx`, Create `lib/events/waiting.ts`, and — only to give them a "content without the section chrome" mode — `client-access-card.tsx`, `event-billing-section.tsx`, `production-section.tsx`, `drawer-section.tsx`.

**Interfaces:**
- `Drawer` gains `subtitle?: ReactNode` (12px muted `nums` line under the title).
- Produces `waitingItems(input: { event: EventSummary; proposal: SubmittedProposal | null; appointments: Appointment[]; lateInstallment?: { label: string; amount: number; dueDate: string } | null; now: Date }): WaitingItem[]` with `WaitingItem = { kind: "proposal" | "meeting" | "quote" | "payment"; … }` — a submitted proposal; the next meeting from now (today or later, not done); a quote sent > 5 days ago with no answer (`quoteSentAt`, no `confirmedAt`/`lostAt`); the earliest late installment. Order: proposal, meeting, quote, payment.
- `onContinue` may be called with `"/scene"` (Task A widens the type).

- [ ] **Step 1 (check first):** waiting.ts self-check (each source in and out; a done or past meeting is not waiting; a quote 4 days old is not; a lost event's quote is not). `npm run check:waiting`.
- [ ] **Step 2: the drawer, top to bottom** (board 3b):
  - **Header:** the client's name (16px bold) with `subtitle` "<type> · <weekday d בMMM> · <n> אורחים"; the ⋯ menu and ✕ as today.
  - **Status card** (`rounded-md border bg-surface p-4`): the status chip, "שלב <i> מתוך <n>" (13px ink-soft), the % at the end; a 7-SEGMENT stage bar (`grid` of the studio's own flow, 6px pills: done = accent, current = `bg-accent/45`, ahead = `bg-inset-border`, each `title` = the stage's label); the CTA "המשך · <stage>" (44px); under it THREE outline buttons in a row — סטודיו (PenTool) · פלטים (Printer) · תלת-ממד (Box → "/scene"). A confirmed/lost/archived event keeps the chip and drops the bar.
  - **הפקה** — once confirmed, `ProductionSection` moves up here, directly under the status card (as today, but now explicitly first).
  - **ממתין לכם** — only when `waitingItems` returns anything: a 12px muted heading, one white row each (32px tile in the subject's tint — proposal warn, meeting the kind's, quote warn, payment alert —, a bold line, a muted line, and an outline pill "סקירה" / a chevron). Proposal → `/studio?review=<id>` (setActiveEventId first); meeting → `onOpenAppointment`; quote/payment → open the billing fold.
  - **פרטים ואנשי קשר** (with "עריכה" ✎): three facts in a row — שעה · הקמה · מקום (zones) —, then a hairline row "גוונים" with up to 5 swatches (the catalog's swatch when known is out of scope: draw the names only, as today, if no swatch source is at hand) and the names, then one row per contact: name (+ "· <role>" when the contact name differs from the client), the phone (ltr, nums), a 32px accent-tint round `tel:` button with Phone. The hall's card (`VenueHostingSection`) follows when linked, unchanged.
  - **Folds** — ONE white card of `FoldRow`s (variant "card", mandatory summary each, open state remembered per device in localStorage under `eve:drawer-folds`): פגישות (CalendarDays; "N · הבאה <when>" / "לא נקבעו"; the list + "קביעת פגישה") · שיתוף עם הלקוח (Share2; who + their role / "לא שותף") · הצעת מחיר ותשלומים (ReceiptText; "טרם הונפקה הצעה" / the ledger's line) · הפקה (Truck; "אחרי אישור הלקוח", quiet) — the last only while NOT confirmed (once confirmed it is the section above). The three existing section components render their CONTENT inside the fold (give each a `bare` prop that drops its DrawerSection chrome).
  - **Foot:** "נוצר ב־<d בMMM yyyy>" centred, 13px faint.
- [ ] **Step 3:** typecheck, `npm run check:waiting`, eslint on your files. Do NOT commit.
