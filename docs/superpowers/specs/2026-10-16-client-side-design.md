# The client side: the couple plays with the sketch, the designer approves the delta

Version 1.1 | 2026-10-17 | **Phase 1 built** on `feat/client-side`, on the recommended answers below (migration 0017, applied to `develop`; `npm run db:verify:client` walks the whole round trip against it). Each **DECIDE** is a product call only Ravid can overturn. Not yet seen in a browser. Companion to [2026-10-14 marketplace & production](2026-10-14-supplier-marketplace-and-production-design.md) §6 ("the road to the client side"), which this replaces as the plan of record for the client.

Ravid, 2026-10-16: *"After the first meeting and the sketch, I want the client to get not only the quote PDF — an account where they can play with the sketch: move / add / change tables (and more). The designer gets a notification that the sketch changed, sees it as a delta on the sketch — what moved — and has to approve it."*

## 0. What exists

- **Client accounts** (`users.kind = client`, no organisation), `event_clients` (event × user — the whole client permission model), `requireClient()`, and `/client`: a list of the events shared with you. Nothing in the studio creates an `event_clients` row yet, so no real client has ever seen anything.
- **Invitations by link** (`/join/<token>`) — built for studio members. `inviteInfo` joins the studio through `users.organizationId`, which is null for a client, so it cannot onboard one as written.
- **No email.** No sending domain; invitations go by WhatsApp link, like the team's.
- **The bell** in the top bar is decorative (docs/roadmap.md §4: "worth building once there is more than one thing to announce" — this is that).
- **The canvas** handles mouse and trackpad. A one-finger pan and a two-finger pinch on a phone are not handled, and a client is on a phone.
- **`check:costs`** already scans `app/client` and `lib/client-portal`.

## 1. The one idea: a client never edits the drawing — they edit a PROPOSAL

The designer's drawing feeds the quote, the packing list, procurement and the production runway. If a client could move a table in it, the next autosave would reprice the event and reorder flowers with nobody having decided anything. That is the "status somebody forgot to flip" failure this codebase has already paid for twice, the other way round.

So the client edits a **copy**: a `sketch_proposals` row holding the drawing they forked (`base`) and their edited drawing (`content`). The designer's `design_documents` row is never written by a client, and the studio's autosave cannot collide with them, because they are two different rows. (The open "two designers on one event" question stays open; it is not made worse.)

Everything else falls out of one pure module, `lib/design-document/delta.ts` (`check:delta`):

- **`diffDocuments(base, proposed) → DocChange[]`** — per entity, keyed by id: a table *added*, *removed*, or *edited*, with the aspects edited (moved, turned, resized, retyped, seats, seated, number). Moves under 1cm and turns under 0.5° are noise, not changes.
- **`mergeChanges(current, base, proposed, keys) → { doc, conflicts }`** — the three-way merge. It applies the chosen changes to the designer's CURRENT drawing, aspect by aspect, through the document reducer's own actions (so a removed table takes its dressing with it, a moved one carries its hung chandelier, numbering stays unique). An aspect the designer has ALSO changed since `base` is a **conflict**: reported, and left unticked by default.

The same two functions do three jobs:

1. **The permission filter.** On every client save, the server recomputes `diff(base, content)`, keeps only the changes a client may make (§3), and stores `merge(base, base, content, allowed)`. What a client may not touch cannot be in the row, whatever the browser sent.
2. **The delta the designer sees.** Ghosts and arrows on the plan, plus a list of changes.
3. **The approval.** `merge(current, base, content, ticked)` → one `loadDocument` entry in the studio's history, so an approval can be undone with Ctrl+Z like any other edit.

## 2. The flow

1. **Share.** In the event drawer, under "שיתוף עם הלקוח": name + email → a client account (new, pending, with an invitation token), or the existing one → an `event_clients` row. The designer copies the link or sends it by WhatsApp. Shown: who has access, joined or pending, plus a new link and a ✕ to take access back. A second contact (contact2) is a second person with their own login, so no shared password.
2. **Join.** `/join/<token>` recognises a client invitation (the studio's name comes from the event, not from the user's organisation), sets a password, and lands on `/client`.
3. **Look.** `/client/events/<id>`: the event's facts, the studio's contact details, and the sketch, drawn by the real canvas, read-only, pannable and pinchable.
4. **Play.** "הצעת שינויים" opens the editor on a draft forked from the designer's current drawing. Autosaved. A change counter ("3 שינויים") opens the list of what the client changed, each line with "ביטול השינוי". "חזרה לסקיצה של המעצב" discards the draft.
5. **Send.** "שליחה למעצב" + an optional note → `submitted`. The draft is read-only while it waits ("ממתין לאישור המעצב"), and "משיכת ההצעה" takes it back to a draft.
6. **Notify.** A notification for every owner and designer in the studio (not crew). The bell counts it. The studio opens on a banner: "דנה ויואב הציעו 5 שינויים בסקיצה · לסקירה".
7. **Review.** The studio's review mode: the plan shows the drawing AS IT WOULD BE with the ticked changes, plus the delta:
   - a moved table shows a dashed ghost where it was, and an arrow to where it is now;
   - a new table has an accent halo and a "חדש" tag;
   - a removed table is a dashed alert ghost;
   - a changed seat count is a badge ("8 → 10").
   The side panel lists the changes, each with a checkbox (conflicts flagged and unticked), "אישור הכל", "אישור הנבחרים", "דחייה", and a reply to the client. Ticking and unticking re-renders the preview, so the designer sees the room both ways.
8. **Resolve.** Approve → the merged drawing enters the studio's history (one undo entry) and saves through the normal autosave. The proposal records which changes were accepted and the reply, and the client is notified ("המעצב אישר 4 מתוך 5 שינויים"). The client's next proposal forks from the new drawing.
9. **Quote.** An approved change is a change to the drawing, so the existing F-7.4 check already marks an issued quote "העיצוב השתנה". The designer re-issues; the client never sees a price move under their finger (§3, DECIDE 4).

**Drift.** If the designer edits while a draft is open, the client's editor rebases on open: non-conflicting changes are carried onto the new drawing, and a change to something the designer has since changed is dropped, with a line that says so ("המעצב עדכן את שולחן 12 מאז — השינוי שלכם בו לא נשמר"). A SUBMITTED proposal is never rebased: the designer reviews it against the base the client actually saw, and the merge reports the conflicts.

## 3. What a client may change (DECIDE 1)

**Recommended for phase 1: the tables, and nothing else.**

| May | May not |
| --- | --- |
| Move and turn a table | Design items (cloths, centrepieces, flowers, chandeliers), stages, drapes, rugs |
| Add a table: duplicate an existing one (with its dressing, as "one more like this") or pick one of the studio's table types — name and shape, never a price | Add anything else from the catalog: the client never browses it |
| Remove a table (its dressing goes with it) | The venue: walls, doors, fixed features |
| Seats per table, seated count, table number, "ללא מספור" | Chairs, colours, blocked sides, groups/blocks |

"And more" is built in, not bolted on: the allow-list is per change kind in `delta.ts`, so letting a client also move the bar, or swap a centrepiece for one of two options the designer offered, is a line in that list plus the editor's control for it.

## 4. Privacy (non-negotiable)

- The client reads **client-safe products** only: `clientProduct(p)` builds a NEW object from an allow-list (id, name, image, category, layer, dimensions, appearance, variants' name/swatch/image, resize, clearance). Price, cost, supplier, stock and provenance are never copied, so a field added to `Product` tomorrow does not leak by default. Only the rows the plan uses, plus the table types it offers, are sent: never the catalog.
- The venue is read for the event's own venue only, through `event_clients`. That covers the plan's walls, doors, features and zones, and never the venue's other events.
- Every client read and write starts from `event_clients` (a JOIN, like `fetchMyEvents`); every studio read starts from `currentOrg()`. `check:costs` already covers `lib/client-portal` and `app/client`; `lib/proposals` joins that list.
- No prices in the sketch editor (DECIDE 4).

## 5. Data (one migration)

```
event_clients        + role text not null default 'editor'   -- 'viewer' | 'editor' (DECIDE 3)
sketch_proposals     id, organization_id, event_id (cascade), status ('draft'|'submitted'|'resolved'|'withdrawn'),
                     base jsonb, base_version int, base_updated_at timestamptz,
                     content jsonb, revision int,                         -- optimistic concurrency: two phones, one couple
                     note text, created_by, submitted_by, submitted_at,
                     resolved_by, resolved_at, reply text, accepted text[], rejected text[],
                     created_at, updated_at
                     unique (event_id) where status in ('draft','submitted')   -- one open proposal per event (DECIDE 3)
notifications        id, user_id (cascade), event_id (cascade, null), kind text, payload jsonb, read_at, created_at
                     index (user_id, created_at desc)
```

A notification is a row per RECIPIENT, written when the thing happens. It is not computed from proposals on read: "has this person seen it" is a fact about the person, and there will be other kinds (quote approved, client joined, a comment) that have nothing to do with proposals. The bell polls on mount, on focus and every 60s. Real-time push is phase 4.

## 6. The client side, all of it: what else it needs

Ordered by value to a real couple, with what each costs here.

| # | Feature | Why it matters | Cost |
| --- | --- | --- | --- |
| 1 | **Sharing + join + sketch view** | Without it there is no client side | Small: tables exist |
| 2 | **Proposal editor + delta review + bell** | Ravid's ask | The bulk of phase 1 |
| 3 | **The quote as a page, and "אישור" is the client's button** | Writes `events.confirmedAt`, the one typed fact in production, from the person whose fact it is. `issued_quotes` gets `approved_at` / `approved_by`, so which quote they said yes to is on record | Medium: `QuoteDocument` in client view already exists |
| 4 | **Comments pinned on the plan** ("אפשר להזיז את הבר?") | Most clients would rather ASK than move. A pin on a table or a point, in a thread with the designer, and a notification both ways | Medium |
| 5 | **Seating chart (סידור הושבה)** | The biggest thing a couple does with a floor plan, and it is THEIR job, not the designer's. Guest list (paste/CSV), sides/groups, drag guests onto tables; `DesignTable.seated` becomes DERIVED from it (its comment says it is typed only because "there is no guest list in this app to reduce"). Prints the entrance list and the hall's seating sheet | Large: phase 3 |
| 6 | **Mood board from home** | Liking the gallery from the sofa, and uploading their own Pinterest photos into the event folder. `/present` without the designer's chrome | Small–medium |
| 7 | **What's next** | Upcoming meetings (`appointments`), the final-guest-count date, the sketch-freeze date ("נעילת סקיצה"), countdown | Small. The freeze date is a new typed fact (DECIDE 6) |
| 8 | **History** | Every proposal, what was accepted, every quote they were sent | Small: rows exist |
| 9 | **Email + push** | "Your designer answered" should reach a phone that is not looking at the app. Resend once a sending domain exists; web push needs no paid account | Blocked on a domain (email) |
| 10 | **Viewing link without an account** (F-9.2) | For the parents | Small, phase 4 |
| — | Payments, contracts, signatures | Billing is phase 3 in docs/01 | Out of scope |

## 7. DECIDE — the calls only Ravid makes (recommended answer first)

1. **What may a client change?** Tables only (§3) · tables + bars/lounges · anything they can see.
2. **Live or by approval?** By approval: the designer's drawing never changes without them · client edits live and the designer audits afterwards (rejected: the quote and procurement read the drawing).
3. **Who in the couple edits?** One shared proposal per event, both can edit (`revision` guards two phones), each person `editor` or `viewer` · one proposal per person.
4. **Does the client see the price change while editing?** No: the designer re-issues the quote after approving · a live total in the editor.
5. **Approval granularity?** Per change, with "אישור הכל" · all or nothing.
6. **A freeze date?** Yes, phase 2: a date after which the client's editor is read-only, typed by the designer on the event · no.
7. **Seating chart?** Yes, phase 3, and it makes `seated` derived · not in this app.

## Sequence

1. **Phase 1 (`feat/client-side`, now):** migration · `delta.ts` + `check:delta` · client-safe reads · sharing (studio) + client join · `/client/events/<id>` with the sketch · touch pan/pinch on `PlanCanvas` · the proposal editor · notifications + the bell · the studio's review mode.
2. **Phase 2:** quote page + client approval → `confirmedAt` · pinned comments · freeze date · history.
3. **Phase 3:** seating chart.
4. **Phase 4:** email (Resend), web push, account-less viewing link.

## Risks

- **R-11 A rebased draft drops a change the client cared about.** Mitigation: the line that says which one, and the change list they can redo from.
- **R-12 The canvas on a phone.** The studio canvas was built for a desktop. `NFR-2` already asks for tablet presentation; a phone editor needs bigger hit targets and a bar at the bottom, not the studio's inspector. Phase 1 uses the hall pass (furniture only), which is also the lightest drawing.
- **R-13 Merge correctness.** A three-way merge that is subtly wrong silently corrupts a plan. `check:delta` holds the cases: move/turn/seats/add/remove, a removed table's dressing, a duplicated table's dressing, a number clash on add, and every conflict kind.
