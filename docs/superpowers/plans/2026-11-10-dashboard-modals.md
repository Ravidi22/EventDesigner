# Dashboard redesign — Stage 1: Modals & popups (4a–4f) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every dashboard window wears the one modal frame, and the six proposals of Ravid's "Modals & popups" board (claude.ai/design project "Dashboard structure design", `Modals.dc.html`) are built: the event dialog (4a), the meeting dialog (4b), the event delete question (4c), the billing dialogs (4d), the calendar's day popover (4e) and its quick-add menu (4f).

**Architecture:** `components/modal-frame.tsx` is the one header/footer; each dialog keeps its own `<dialog>` lifecycle and wears it. Two pure helpers carry the only new logic — `lib/events/availability.ts` (the line under the event's date) and `lib/appointments/day-strip.ts` (the meeting dialog's 08–20 strip, overlap and next free hours) — each a self-checked module like the rest of `lib/`. The calendar's cards move to their own file so the day popover (and Stage 2's week tile) draw the same cards.

**Tech Stack:** Next 16 app router, React 19, Tailwind v4 tokens from `app/globals.css`, lucide-react, drizzle (one new read).

**Spec:** the board itself — `Modals.dc.html` (a copy is in the session scratchpad `design/Modals.dc.html`; re-read it with DesignSync `get_file`, project `206a958d-287f-47e8-8b31-0185a3a4487e`). Stages 2 (Dashboard 1b + notifications 2b) and 3 (event drawer, direction A) get their own plans after this one.

## Global Constraints

- Tokens only, never the board's hex: #efeafb `accent-tint` · #e0d8f6 `accent-wash` · #4b3a8c `accent-deep` · #5b4aa0 `accent-hover` · #c9bdec `accent-line` · #f6e3dc `alert-tint` · #a8482b `alert-ink` · #f6ecd6 `warn-tint` · #856212 `warn-ink` · #dcefe5 `success-tint` · #2a7355 `success-ink` · #faf9fd `inset` · #eae8f0 `inset-border` · #e9e7f0 `border` · #f0eef5 `border-soft` · #7c7889 `muted` · #9c98ac `quiet` · #a29eb2 `faint` · #4a4658 `ink-soft`.
- Radii: modal `rounded-lg` (22), wells/cards `rounded-md` (14), fields/tiles `rounded-sm` (8), chips and buttons `rounded-pill`.
- RTL: logical properties only (`ms-/me-/ps-/pe-/start/end`); a clock range is wrapped with LRM as `appointmentTimeLabel` does.
- ⚠ Never a `display` utility on a `<dialog>` element (see the note in components/event-dialog.tsx).
- Footer order on every window: PRIMARY first, then the secondary (ghost), then a status at the far end (`ms-auto`). A destructive question inverts it: ביטול is the filled primary, the destructive verb is borderless alert-ink text at the far end.
- Kind vocabulary for diary entries is `KIND_CARD_THEME` + `KIND_ICON` (app/(app)/dashboard/dashboard-view-utils.ts) — never new colours.
- The event palette (גווני האירוע) is REMOVED from the event form (Ravid, 2026-11-10: "drop from the dialog, need to relocate it — think where, don't do"). Nothing may clear a stored `shades` value: the form simply stops sending the key.
- Verify before done: `npm run typecheck`, the two new checks, `npm run check:actions`.

## Review Focus

1. An event edited from the drawer must keep its `shades` — the form no longer sends them (patchEvent must see no `shades` key).
2. A venue with no zones, or a venue whose zones are still loading, must not read as "no zones" (keep `zoneSelection`'s rule) and must say why there are no chips.
3. The meeting dialog opened on a day with an all-day אילוץ/חופשה must warn even with no hour typed.
4. The day popover must stay on screen at the grid's last column and last row (flip up, clamp inside the viewport) and close on Escape without closing anything behind it.
5. The event delete question on an event with billing documents must not offer a delete the server will refuse.

---

### Task 1: The frame — header tones, a status slot, a reshaped ConfirmDialog

**Files:**
- Modify: `components/modal-frame.tsx`
- Modify: `components/confirm-dialog.tsx`

**Interfaces:**
- Produces: `ModalHeader({ tile, title, titleId?, facts?, onClose?, closeTabIndex?, tileClassName? })` — `tileClassName` default `"bg-accent-tint text-accent"`; `onClose` optional (no ✕ when absent — the meeting frame's form). `ModalStatus({ children, tone? })` — `<span className="ms-auto text-xs text-muted">`, `tone="alert"` → `text-alert-ink font-medium`.
- Produces: `ConfirmDialog` gains `facts?: ReactNode`, `tone?: "danger" | "neutral"` (default `"danger"`), `icon?: LucideIcon` (default TriangleAlert), `confirmIcon?: LucideIcon`, `hideConfirm?: boolean`, `wide?: boolean` (`w-[min(92vw,27.5rem)]` vs today's 25rem). Danger tile `bg-alert-tint text-alert-ink`; neutral tile accent and the confirm verb in `text-accent`. Body in `p-5` (`flex flex-col gap-3.5`), the two answers in a `ModalFooter`. ביטול stays the first focusable element (✕ keeps `tabIndex={-1}`).

- [ ] **Step 1:** Implement both files to the interfaces above; keep every current caller compiling unchanged (all new props optional).
- [ ] **Step 2:** Billing's issuance confirms ("להפיק …?") pass `tone="neutral"` and `icon={FileCheck2}` — issuing is final, not destructive (board 4c: "tile turns alert-tint for destructive questions only").
- [ ] **Step 3:** `npm run typecheck` → clean. Commit `feat(modals): the frame's tile tones and status slot; ConfirmDialog wears the frame's footer`.

### Task 2: 4c — the event delete question counts what goes

**Files:**
- Modify: `lib/events/actions.ts` (new read)
- Create: `app/(app)/dashboard/event-delete-dialog.tsx`
- Modify: `app/(app)/dashboard/dashboard-screen.tsx`

**Interfaces:**
- Produces: `fetchEventFootprint(id: string): Promise<EventFootprint>` in lib/events/actions.ts, scoped like `deleteEvent` (verify the event is the org's first), with `export interface EventFootprint { drawing: boolean; quotes: number; appointments: number; likedImages: number; clients: string[]; expenses: number; billingDocuments: number }` in lib/events/types.ts. `clients` = the names (else emails) of `event_clients` users.
- Produces: `EventDeleteDialog({ event: EventSummary | null; onConfirm: () => void; onMarkLost: () => Promise<void>; onClose: () => void })`.

- [ ] **Step 1:** Write `fetchEventFootprint` (counts from design_documents, issued_quotes, appointments, event_liked_images, event_clients⨝users, expenses, billing_documents — all by `event_id`).
- [ ] **Step 2:** Build `EventDeleteDialog` on `ConfirmDialog` (`wide`, `confirmIcon={Trash2}`, confirm label "מחיקה לצמיתות"): title `למחוק את האירוע של <client>?`; facts `<eventType> · <formatEventDate> · <STATUS_LABEL>` (missing parts dropped). Body: an inset well (`rounded-md border-inset-border bg-inset px-3.5 py-3`) headed "נמחק לצמיתות" in alert-ink 12px semibold, a two-column grid of what exists — PenTool "הסקיצה", ReceiptText "N הצעות מחיר", CalendarDays "N פגישות", Images "N תמונות שסומנו", UserMinus "הגישה של <name>" (each client) — rows with 0 left out, "אין לאירוע סקיצה, פגישות או תמונות." when all are; then under a hairline "נשמרות: N הוצאות שנרשמו, בלי שיוך לאירוע." when expenses > 0. Loading = two muted skeleton lines.
- [ ] **Step 3:** The way out that keeps the data: a bordered row "האירוע לא נסגר? אפשר לסמן ״לא נסגר״ ולשמור את הכל." + outline pill "סימון כלא נסגר" → `onMarkLost` (calls `markEventLost`, reloads, closes the dialog; the drawer stays). Hidden when the event is already lost or archived.
- [ ] **Step 4:** `billingDocuments > 0`: `hideConfirm`, and the well's place takes an alert line "לאירוע הופקו מסמכי חיוב והם נשמרים בספרים — אי אפשר למחוק אותו." (the server would refuse — lib/events/actions.ts deleteEvent).
- [ ] **Step 5:** Replace dashboard-screen's ConfirmDialog with it. Typecheck. Commit `feat(dashboard): the delete question counts what the event holds and offers "לא נסגר"`.

### Task 3: 4a — the event dialog as a brief

**Files:**
- Create: `lib/events/availability.ts` (+ `"check:availability": "tsx lib/events/availability.ts"` in package.json)
- Create: `components/shade-picker.tsx` (ShadePicker moved out of event-form.tsx verbatim, exported, unused until relocated — its header comment says so)
- Modify: `components/event-form.tsx`, `components/event-dialog.tsx`

**Interfaces:**
- Produces: `availabilityLine(input: { date: string; venueId: string; zoneIds: string[]; selfId?: string; events: EventSummary[]; place: string }): { tone: "free" | "busy" | "info"; text: string } | null`. `place` = the picked zones' names joined with " · ", else the venue's name, else "".
- Produces: `EventDialog({ …, defaultDate?: string })` and `EventForm({ …, defaultDate?: string })` — create only.

- [ ] **Step 1: The check (failing).** In availability.ts under `isMain`: no date → `null`; another live event the same date in the same venue sharing a zone → `busy`, text starts `ביום הזה כבר: <client>`; same date, same venue, no shared zone → `info` `ביום הזה גם: <client> · <zonesLabel>`; same date elsewhere → `info`; nothing that day → `free`, text `<place> פנוי ביום הזה` (or `אין אירוע אחר ביום הזה` with an empty place); an event 1–2 days before in the same venue (any venue when none is picked) appends ` · ערב קודם: <client> (<d.m>)`; archived, lost and `selfId` never count. Run `npx tsx lib/events/availability.ts` → FAIL.
- [ ] **Step 2:** Implement; run → PASS.
- [ ] **Step 3: The form.** Header: the frame's header (tile Sparkles; title "אירוע חדש" / "פרטי האירוע"; facts — create: `<venue name or "טרם נבחר מתחם"> · אחרי השמירה נפתחת הפגישה בשלב ״<stepAt(flow, 1).label>״`; edit: `<STATUS_LABEL> · <formatEventDate>`; ✕ only in the dialog frame). Body: four groups, each `grid sm:grid-cols-[88px_1fr] gap-4 py-4` with a hairline between, label `text-[13px] font-bold text-accent-deep`:
  - **מי** — שם הלקוח * (autofocus on create) and the event types as chips (`EVENT_TYPES` + a saved custom type; pressing the chosen one clears it; `aria-pressed`).
  - **מתי** — תאריך האירוע * and יום ההקמה (`align="end"`, `max={date}`, placeholder "ביום האירוע"); under them the availability line: a 6px dot + 12px text in `success-ink` / `warn-ink` / `muted`. The form reads `fetchEvents()` once on mount for it.
  - **איפה וכמה** — מתחם (Select, 1fr) + אורחים (NumberField, 120px); אזורים as chips with a Check on the chosen ones (loading → "טוען אזורים…", no venue → "בחרו מתחם תחילה", none → "למתחם אין אזורים מוגדרים"); the saved-sketch Select when offered, with its other-venue note.
  - **איש קשר** — name + phone, "+ איש קשר נוסף" → the second pair.
- [ ] **Step 4:** Remove the palette from the form; submit no longer sends `shades`. Date becomes required: submit disabled until name and date; the footer status reads "חובה: שם הלקוח ותאריך" while either is missing. Footer: primary first ("פתיחת האירוע" + ArrowLeft / "שמירה" / "שמירה והמשך"), ביטול, status. `defaultDate` seeds `date` on create.
- [ ] **Step 5:** Typecheck; open /dashboard → אירוע חדש (create) and the drawer's עריכה (edit) and the meeting's details stage; commit `feat(events): the event dialog reads as a brief — chips, availability, name and date required`.

### Task 4: 4b — the meeting dialog

**Files:**
- Create: `lib/appointments/day-strip.ts` (+ `"check:day-strip"`)
- Modify: `app/(app)/dashboard/appointment-dialog.tsx`, `dashboard-screen.tsx`, `venue-dashboard.tsx`, `app/(app)/bookings/bookings-screen.tsx`

**Interfaces:**
- Produces (day-strip.ts): `interface DayItem { id: string; start: number; end: number; label: string; kind?: AppointmentKind; google?: boolean; allDay?: boolean }` (minutes past midnight); `dayItems(date: string, appointments: Appointment[], busy: BusyBlock[], excludeId?: string): DayItem[]` (timed entries as they are; an untimed `constraint`/`vacation` is `allDay` 08:00–20:00; other untimed entries are left out); `overlapOf(start: number, durationMin: number, items: DayItem[]): DayItem | null`; `freeStarts(start: number, durationMin: number, items: DayItem[], max = 2): number[]` (candidates = every item's end ≥ start, then the window's 08:00; a candidate fits when [t, t+d) is inside 08:00–20:00 and touches nothing; ascending; at most `max`); `STRIP = { from: 480, to: 1200 }`; `stripSpan(item, STRIP)` → `{ start: %, width: % }` clamped.
- Produces: `AppointmentDialog` new props `appointments: Appointment[]` (the whole diary, for the strip), `busyOn?: (iso: string) => BusyBlock[]`, `defaultKind?: AppointmentKind`, `venueName?: string`, `googleSync?: boolean`.

- [ ] **Step 1: The check (failing).** Candidates for `freeStarts` are the items' ends at or after `start`, ascending; overlap is strict (`a.start < b.end && b.start < a.end`, so touching is free). Assertions — the board's own day, items 14:00–15:30 and 17:00–18:00: `overlapOf(900, 60, items)` is the 14:00 item; `freeStarts(900, 60, items)` → `[930, 1080]` (15:30 and 18:00, as the board's pills). Items 14:00–15:30 and 16:00–18:00: `freeStarts(900, 60, …)` → `[1080]`; duration 30 → `[930, 1080]`. An end past 20:00 is refused: item 19:30–20:00, `freeStarts(1170, 60, …)` → `[]`. An all-day vacation overlaps any slot and `freeStarts` → `[]`. `dayItems` leaves out `excludeId` and untimed consultations, keeps an untimed constraint as `allDay`. Run `npx tsx lib/appointments/day-strip.ts` → FAIL; implement; → PASS.
- [ ] **Step 2: The dialog** (`max-w-[33rem]`), top to bottom:
  - Header: tile in the kind's `bg`/`text` with `KIND_ICON`; title new+client "פגישה חדשה", new+other "רשומה חדשה ביומן", edit+client "עריכת פגישה", edit+other "עריכת רשומה"; facts `<long date> · <venueName>`.
  - Kind chips (h-[30px], 13px, icon 13px in the kind's ink): היכרות · המשך · סיור במתחם · טעימה │ (1px divider) │ אספקה · אילוץ · חופשה · אישי · אחר. Chosen: `border-current` + the kind's `bg`/`text`, bold.
  - תאריך (1fr) + שעה (112px).
  - משך: `Segmented` — 30 ד׳ · 45 ד׳ · שעה · 1½ ש׳ · 2 ש׳ · 3 ש׳ (values 30/45/60/90/120/180).
  - The day well (`rounded-md border-inset-border bg-inset px-3.5 py-3`): heading "היום ביומן" (or `ביומן · <d בMMM>`) with "08:00–20:00" quiet at the end; a 26px track of the day's items (diary: kind tint with a 3px start rail; Google: dashed `border-border`, `bg-inset`) and, when a time is set, the new slot outlined `border-2 border-warn bg-warn-tint/70` standing 3px proud; hour ticks 08…20 (10px quiet). An overlap → a `bg-warn-tint` line with TriangleAlert: diary `חופף ל<kind> עם <name> (<range>)`, Google `חופף ל־״<title>״ ביומן Google (<range>)`, all-day `<kind> ביום הזה`, then up to two white pills of `freeStarts` that set the time. Hidden when the day is empty and no time is set.
  - Client kinds only: "שיוך לאירוע" — `Segmented` [ללא — פגישה ראשונה] [לאירוע קיים + Link2]. Linked: the event picker IN FLOW (never an absolute panel inside the scrolling body): the chosen row (Sparkles in the status ink, **name** · date · zones, status chip, chevron) that opens a search field + a `max-h-56` list below it (upcoming first by date, then past, then undated), and the hint "הפגישה תופיע גם במגירת האירוע."; unlinked: "אפשר לשייך לאירוע גם אחר כך — מעריכת הפגישה או ממגירת האירוע." Linking switches היכרות to המשך; unlinking clears `eventId`.
  - שם הלקוח + טלפון (client kinds); a quiet "מהאירוע" tag in the name field while it equals the linked event's.
  - "+ הערה" reveals the note (shown open when the entry has one).
  - Edit + client kind: the "הפגישה התקיימה" switch row.
  - Footer: primary ("קביעת הפגישה" / "הוספה ליומן" / "שמירה"), ביטול, then at the far end — new: RefreshCw "תופיע גם ב־Google" when `googleSync`; edit: "מחיקה" (alert text + Trash2) through a `ConfirmDialog` "למחוק את <label>?".
- [ ] **Step 3:** Callers pass `appointments`, `busyOn={(d) => busy.byDate.get(d) ?? []}`, `venueName`, `googleSync={googleConnected}`. Typecheck. Commit `feat(dashboard): the meeting dialog — kinds as chips, the day in context, linking as a visible choice`.

### Task 5: 4d — the billing dialogs wear the frame; the payment dialog reads the ledger

**Files:**
- Modify: `app/(app)/dashboard/billing-dialogs.tsx`

**Interfaces:**
- Consumes: Task 1's `ModalHeader`, `ModalFooter`, `ModalStatus`.
- Produces: the local `Modal({ title, tile: LucideIcon, facts?, status?, onClose, children, footer, wide? })`; `Issue` renders primary · ביטול · (error ?? status).

- [ ] **Step 1:** Frame every dialog — tiles: הזמנה ClipboardCheck · התקבל תשלום HandCoins · חשבונית מס ReceiptText · דרישת תשלום Send · זיכוי Undo2. Facts `<client> · <order ? "הזמנה <number>" : "ללא הזמנה"> · יתרה X מתוך Y` (the balance part only with an order). Status: payment/invoice "מספר המסמך סופי — תיקון בזיכוי"; order "הזמנה שהופקה משתנה רק בהזמנה מתוקנת"; request "דרישת תשלום אינה מסמך מס"; credit "הזיכוי סופי".
- [ ] **Step 2: עבור is the ledger.** A `rounded-md border` list, one row per installment (13px): paid → `bg-inset text-muted`, CircleCheck success, "שולם"; otherwise a radio dot (accent when chosen, the row `bg-accent-tint` with a 1.5px accent inset outline), `<label> · עד <d.m>` (or "ביום האירוע" when the due date is the event's), "באיחור" in alert-ink with TriangleAlert when `state === "late"`, the amount left at the end; a last row "תשלום אחר" (no installment). Picking fills the amount.
- [ ] **Step 3: PaymentFields.** אמצעי התשלום becomes a `Segmented` with glyphs in the board's order — העברה Landmark · אשראי CreditCard · אפליקציה Smartphone · שיק FileText · מזומן Banknote — the means' own fields under it, rules unchanged (CreditDialog shares it). Amount label "סכום כולל מע״מ".
- [ ] **Step 4:** "יופק" becomes one inset line (ReceiptText accent · "יופק **<kind>**" · at the end "לפני מע״מ X · מע״מ Y"); הערה hides behind "+ הערה". Typecheck. Commit `feat(billing): the billing dialogs wear the modal frame; התקבל תשלום reads the ledger`.

### Task 6: 4e — the day popover

**Files:**
- Create: `app/(app)/dashboard/calendar-cards.tsx` (EventCard, AppointmentChip, BusyChip, CHIP_SIZE, EventLook moved out of calendar-card.tsx, exported)
- Create: `app/(app)/dashboard/day-popover.tsx`
- Modify: `app/(app)/dashboard/calendar-card.tsx`

**Interfaces:**
- Produces: `DayPopover({ iso, anchor: HTMLElement, events, appointments, busy, lookOf, addItems?, past, onOpenEvent, onOpenAppointment, onWeek, onClose })` — rendered with `createPortal` into `document.body`, `position: fixed`, `w-[336px]`, placed under the anchor's start edge, flipped above when the room below is short, clamped 12px inside the viewport; re-placed on scroll (capture) and resize; closes on Escape (capture, `preventDefault`), a pointerdown outside it and its anchor, and any card click.

- [ ] **Step 1:** Move the cards (no behaviour change). Typecheck.
- [ ] **Step 2:** The popover: Popover's panel look (`rounded-md border-border bg-surface shadow-lifted`; header CalendarDays accent · `יום א׳, 15 בנובמבר` 14px bold · CloseButton; hairline), body `px-4 py-3.5 flex flex-col gap-2` of FULL-size cards (events, then the diary in hour order, then Google), footer under a hairline: the quick-add menu (Task 7's `trigger="link"`, "הוספה ביום הזה"; not on a past day) and at the far end "פתיחה בתצוגת שבוע" + ArrowLeft (→ `onWeek`: week mode anchored on that day).
- [ ] **Step 3:** In the grid, "+N נוספים" becomes a pill (`rounded-pill bg-accent-tint px-2 py-[3px] text-[11px] font-bold text-accent-hover`; `bg-accent-wash` + accent outline while its popover is open; the day cell `bg-accent-tint/35` while open) that opens the popover; the in-place expansion and `expandedDate` go. Typecheck. Commit `feat(calendar): "+N נוספים" opens a day popover; the row keeps its height`.

### Task 7: 4f — one quick-add menu for both businesses

**Files:**
- Modify: `components/menu.tsx`
- Create: `app/(app)/dashboard/quick-add.ts`
- Modify: `calendar-card.tsx`, `dashboard-screen.tsx`, `venue-dashboard.tsx`, `components/event-dialog.tsx` (defaultDate from Task 3)

**Interfaces:**
- Produces (menu.tsx): `Menu({ …, heading?: string, panelClassName?: string, trigger: "icon" | "chip" | "pill" | "link" })`; `MenuItem` gains `iconClassName?: string`, `hint?: string`, `emphasis?: boolean`. The heading is a non-item row (`px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted`); `hint` sits at the row's end in 12px `text-quiet`; `emphasis` = `font-semibold text-accent`; `link` = `inline-flex items-center gap-1 text-[13px] font-semibold text-accent` with the icon.
- Produces (quick-add.ts): `quickAddItems(org: "studio" | "venue", on: { kind: (k: AppointmentKind) => void; other: () => void; event: () => void }): MenuItem[]` — studio: פגישת היכרות · פגישת המשך · סיור במתחם · טעימה │ חסימת היום (Ban, hint "אילוץ") · רשומה אחרת… (Ellipsis) │ אירוע חדש בתאריך הזה (Sparkles, emphasis). Venue: אירוע באולם (CalendarHeart, emphasis) first, then the same kinds, then the block and "other" — no "אירוע חדש". Kind rows wear `KIND_ICON` with the kind's text ink. `quickAddHeading(iso)` → `הוספה ביום ד׳, 18 בנוב׳`.

- [ ] **Step 1:** Extend Menu; `panelClassName="w-[232px]"` for this menu.
- [ ] **Step 2:** `quick-add.ts`. CalendarCard always renders a `Menu` for a day's "+" (`addItems` required) with the heading; the `onCreateAppointment` prop stays for Today's Focus.
- [ ] **Step 3:** Wire: a kind → the meeting dialog on that day with `defaultKind`; "חסימת היום" → kind `constraint`; "רשומה אחרת…" → the dialog blank; studio "אירוע חדש בתאריך הזה" → `EventDialog` create with `defaultDate`; venue "אירוע באולם" → the booking dialog seeded with the date (as today). Past days still get no "+".
- [ ] **Step 4:** Typecheck; `npm run check:availability && npm run check:day-strip && npm run check:actions`. Commit `feat(calendar): one quick-add menu for both businesses`.

### Task 8: See it

- [ ] Headless Chrome (memory `headless-browser-check`) with a studio login on develop: screenshots of 4a create + edit, 4b new (unlinked and linked, with an overlap), 4c, 4d payment, 4e popover at the last column, 4f menu — at 1440×900. Fix what the pictures show; commit.
