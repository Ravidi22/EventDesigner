# Venue owners (בעלי אולם): what the app is for them, and how it is built

Version 2 | 2026-10-30 | Status: **phase 1 and the core of phase 2 built** (see "Decided and built" below). The calls in §9 are Ravid's (recommended answer first).

## Decided and built (v2, 2026-10-30)

Ravid's answers to v1, and where they changed the model:

- **"Do your recommendation."** A separate `venue` organisation kind (§9.1), the venue owns its plan (§9.2), two linked events (§9.3).
- **"Everybody sees the same venue — the one who created it defines who can edit."** This replaces §3.2's guest-grant-to-read model. Every signed-in business may OPEN every venue's plan; editing and managing come only from a grant (`resolveVenueRole` in lib/venues/access.ts, `check:access`). The plan's rows are read by venue id and written under the OWNER's organisation, whoever holds the pen. `assertPlacement` accepts any existing venue. A viewer's /halls is read-only. The switcher's "מתחם קיים מהמאגר" adds another business's venue to the list (`followVenue`, a viewer guest grant to the organisation). A guest grant to an address with an account becomes an org grant at once; one without waits for /welcome (`adoptVenueGrants`).
- **"The בעל האולם sees the sketch — not the design one, the plain sketch the designer did."** This replaces §3.5. The DESIGNER owns the hall pass. The venue sees it read-only at `/bookings/<id>/sketch` (`hallPassOf`: tables, chairs, stages, bars; every design item, and any row it cannot classify, is dropped; products go through the client allow-list). The venue draws no sketch of its own (yet).
- **"The designer can see all the details in the event card."** The hall's card reaches the designer's event drawer (`VenueHostingSection`): times, run of show, counts, special meals, the chosen menu by dish name, the vendors, floor notes, the hall's manager. NOT the money (package prices, documents) and not the kitchen's own notes. That line is held by `check:event-links` (no money table or price column in lib/event-links/) and asserted by `db:verify:venue`.
- **"What is shared facts?"** The facts BOTH cards hold: date, start time, venue, rooms (zones), guests. Decided: the venue is the authority. While linked, the designer's event FOLLOWS them automatically on every booking save (`followBooking`), with a "link.updated" notification naming what moved. This replaces §3.4's copy-and-banner rule. The designer's drawing, quote, palette and load-in day are never touched.
- **"Wait with those, keep them for later."** Guest list, seating chart and hostess check-in stay in phase 3.

Built: the `venue` org kind and sign-up card, per-kind guards (`requireOrgKind`, `requireHost`) and nav, the occupancy calendar (/dashboard for a venue), bookings (/bookings, `events` + `event_hosting`), menus and packages (/menus), the package figure (`packageLines`), venue orders from the package (`issueOrder` without a drawing quote for a venue org, the shared billing section), the venue ↔ designer link (invite by email, accept onto a new or existing event, follow, unlink, the hall card, the plain hall sketch), notifications, and dish photos (file kind `dish`). Migration 0025, applied to develop. Checks: `check:menus`, `check:hosting`, `check:event-links`, `check:access`; `db:verify:venue` walks the whole round trip against develop in throwaway organisations.

Not built yet: the kitchen / floor / event sheets (§4.5), the venue runway (§4.8), seasonal prices, transferring a designer-drawn venue to its owner (a grant does the job for now), the gallery's dish link (photos upload; the product picker is empty for a venue), the venue drawing its own hall sketch, contract signature. אמרה was backed up to `backups/develop-2026-10-30-before-venue-owners.json` (gitignored; every table) and is unchanged.

### Round 2 (same day): Ravid's notes on the built screens

- **Sign-up:** the hall owner's card leads and is selected. The name a hall gives becomes its first venue's, open and selected on arrival (`openFirstVenue` in lib/venues/granted.ts, from `completeOnboarding`; the switcher deletes it like any owned venue). An account made before this owns no venue.
- **"Why are the calendars different?"** There is now ONE calendar (`CalendarCard`) for both businesses. It takes the hall grid's clean parts: weekdays named once over their columns, days joined by hairlines, the month's figures, and the "+" beside the date. It keeps the designer's parts: week mode, the Hebrew calendar's period bands and holidays, Google busy blocks, and "היום". A hall passes `look` (its booking status), `summary` (evenings taken, held, lapsed) and `addItems` (the day's "+" offers an evening or a meeting).
- **"The owner also has meetings."** The hall's dashboard is the designer's layout: a greeting, today's events and today's meetings as two tiles, the calendar, and the diary's own `AppointmentDialog`. The booking drawer gained פגישות. The header's "+ יצירת אירוע חדש" and the bell show for a hall; the CTA opens the page's booking dialog (components/new-event-request.tsx).
- **Padding and design language.** /bookings and /menus sit in `PAGE_GUTTER` with no centred max width. /bookings takes the production list's shape: page tabs with counts (`PageTabs`), a search, sticky month headers, and one card per evening with its date and how far off. /menus takes the catalog's shape: photo-top cards with the "…" beside the title, and editing in the side `Drawer` made of `DrawerSection`s.
- **The new-event modal** is steps (app/(app)/bookings/booking-form.tsx): פרטי האירוע · תפריט · לו״ז וספקים · הערות לצוות. Every field is labelled. The footer has "מצב פגישה".
- **The hall's meeting mode:** `/meeting?event=<id>` for a venue org (app/meeting/hall-meeting-screen.tsx). It is the same steps full-screen in the designer's meeting frame: the menu is chosen from dish photographs, it closes on a summary with the package figure, and every step forward is saved. The kitchen notes are not a step there.
- **Round 3 (Ravid, same day), for both businesses:** the statistics card is gone, and today is two tiles (events, meetings) in its place. The calendar has no title: the month sits between its arrows as on /billing, with the range's figures under it. The event and meeting cards are back to the designer's original four-line ones, because the one-line pass was not liked. The designer's dashboard, week view, new-event dialog, meeting flow, production list and gallery were walked headless with a throwaway account.
- **Presentation skeletons for a hall** (`VENUE_PRESENTATION_TEMPLATES`): תפריט, מרכזי שולחן, האולם, ערב באולם.
- **A viewer on /halls** cannot select, drag, resize, place, or open a zone's dialog. There is no toolbar and no underlay panel, and the keyboard is inert. A drag pans the view.

Open: Amare (the venue) is still owned by the designer studio (org …0001). Ravid's hall account "Amare" follows it as a viewer, so its bookings have no room to pick until ownership moves or the hall is given a grant.

## 0. In one paragraph

Every organisation on the app today is a designer's studio or a supplier, and a venue is a drawing that some studio made. This spec adds the people who own the room. A venue owner sells dates, charges per guest, closes a final guest count, feeds the kitchen and staffs the floor, and gets paid. None of that is décor. So they get a third kind of organisation, `venue`, with its own half of the app:

- an occupancy calendar
- a booking file per event (guests, times, menu, vendors)
- menus and packages
- billing (already built)
- the hall plan (already built, and they become its natural owner)
- the sheets the kitchen and the floor work from

Then comes what no competitor has. The venue and the designer working the same evening are **linked**. They keep two records in two tenants, joined by one row. A short allow-list of facts crosses between them (date, halls, guests, times, the table layout), and neither side's prices ever cross.

## 1. Who they are, next to the designer

| | Designer (`studio`) | Venue owner (`venue`) |
| --- | --- | --- |
| Sells | a look | a date, and a price per guest |
| Unit of work | a design document | a booking: a date and one or more halls |
| Counts | items, decks, stems | guests, meals, special meals |
| Hands off to | the setup crew (packing list, placement map) | the kitchen and the floor (kitchen sheet, hall map) |
| Paid for | a quote derived from the drawing | guests × package + extras, with a guaranteed minimum |
| Owns in the hall | nothing: brings it and takes it away | the room, tables, chairs, stage, bars |

Inside a venue there are three kinds of people:

- the owner
- sales: tours, tastings, quotes, contracts
- operations: the event manager on the night, the chef, the floor

The existing `StudioRole` ladder (owner / designer / crew, lib/team/types.ts) already fits this as owner / מכירות / תפעול. Only the labels change by org kind. Crew already sees its own events and no money (`fetchLedger` refuses the role), which is exactly what a chef should see.

## 2. What the market offers

**iPlan** (Giv'atayim, since 2010) sells to two sides. Its vendor/venue toolbox ("ארגז כלים לעסק") lists:

- CRM
- a combined events-and-meetings calendar
- digitally signed orders, receipts and invoices sent by email
- SMS and email from inside the system, logged on the client record
- a menu builder: dish tags, photos, notes, print
- coloured seating sketches with table numbering, synced across vendors, with guest-count limits
- reception stations on iPads with a phone app
- tasks, reports, testimonials, a forms interface and a mobile app

Its couples' side has guest list, seating, RSVP, digital invitations, gifts by credit card, a minisite and reception management. The hostess app shows how the pieces fit: *the venue creates the floor plan, the couple seats guests on it, and the hostess finds each guest's table from it at the door*. The public pages say nothing about price quotes, contracts or kitchen orders.

**10comm (טנקום)** is built for halls and gardens. It offers:

- event and meeting calendars
- digital quotes from templates
- contracts with digital signature
- payments, receipts and invoices on the event file
- custom and digital menus
- guest management, RSVP and invitations
- staff, weekly shifts and hours reports
- seating sketches
- reports on sales, payments and occupancy
- leads with call transcription and WhatsApp

| Capability | iPlan | 10comm | This app today |
| --- | --- | --- | --- |
| Occupancy calendar per hall, holds, blocked dates | calendar | ✓ | ✗ The diary has `walkthrough` and `constraint` entries, but there is no occupancy and no holds. Guest availability "has no surface" (roadmap §6) |
| Leads / CRM | ✓ | ✓ + calls | ~ Prospect `appointments` with a nullable event; no pipeline |
| Quote | — | ✓ templates | ~ Derived from the drawing (designer). No per-guest package quote |
| Contract + signature | (testimonial) | ✓ | ✗ Billing phase 2 |
| Invoices, receipts, payment tracking | ✓ | ✓ | ✓ `lib/billing`: numbered, frozen, VAT-aware, allocation numbers, ledger, late installments |
| Menu builder | ✓ | ✓ | ✗ |
| Guest list, RSVP, invitations | ✓ (couple) | ✓ | ✗ Seating chart is phase 3 in the client-side spec |
| Seating sketch, table numbers | ✓ | ✓ | ✓✓ True-scale venue plan, hall pass, numbering, seats, printed sets, 3D |
| Hostess check-in | ✓ iPad | — | ✗ |
| Kitchen / work orders | — | — | ✗ |
| Staff shifts | — | ✓ | ~ `event_crew` assignment only |
| Shared view for every vendor on the event | ✓ | — | ~ Client proposals, marketplace; nothing between venue and designer |
| Reports | ✓ | ✓ | ~ Billing ledger only |

Three takeaways:

1. **Calendar, quotes, invoices and menus are table stakes.** A venue needs them before it will move. They are not a reason to choose this app.
2. **iPlan's hub is the seating plan**, and through it a network: venue → couple → hostess → every vendor. The plan is what holds the parties together.
3. **Nobody else has a true-scale plan of the venue that a designer dresses, quotes and prints from.** We have it. Linking the venue to the designer working in it is the reason a venue would pick this app, and the reason designers gain when venues join. The plan gets drawn and kept current by the people who own the walls, so R-1 (the cost of drawing halls) finally falls on the right party.

## 3. The model: five decisions everything else follows from

### 3.1 A third kind of organisation: `venue`

`OrgKind` becomes `"studio" | "supplier" | "venue"`, with the same sign-in and the same tenant seam as a supplier. The sign-up gets a fourth card, "בעל אולם / מתחם אירועים", hinted "יש לי אולם או גן אירועים: היומן, ההזמנות, התפריטים והחשבונות של המקום מנוהלים כאן". /welcome asks for the venue's name and opens the org. `ORG_HOME.venue` is `/dashboard`, the occupancy calendar.

Today there is one guard, `requireDesigner()`, which means "not a supplier". It becomes a kind check per page:

- **studio only:** catalog, studio, outputs, meeting, present, marketplace, procurement
- **venue only:** bookings, menus
- **both:** halls, billing, gallery, settings, dashboard (a different screen per kind)

`components/org-kind-context.tsx` gains `useIsVenue` for wording only. As with suppliers, which rows a query returns is decided on the server.

A venue org gets the base library's furniture installed at sign-up (`lib/catalog/standard`: tables, chairs, stage decks, bars), because it owns real tables and the hall sketch needs them. It gets no décor catalog (see §4.4).

### 3.2 The venue owns its plan

A venue row belongs to the org that drew it (`venues.organizationId`), and that stays true. Two ways in:

- **The venue draws its own** at /halls, exactly as a designer does today. The bookable units are its zones of kind `hall`, `canopy` and `open` ("אולם ורדה", "הקוליסאום", "הגן").
- **A designer hands over a plan they already drew** ("העברת המתחם לבעליו"). `venues`, `venue_structures` and `zones` move to the venue org in one transaction. The designer keeps an `editor` guest grant, now with `grantee_org_id` filled in, until the owner changes it. אמרה is the obvious pilot: the most detailed plan in the app is already drawn.

This needs the cross-studio booking decision that roadmap §6 left open. **An event may stand on a venue its org owns OR holds an active grant to.** `assertPlacement` (lib/events/actions.ts) gains the grant branch. Zones follow their venue, and `grantee_org_id` gets written when a guest accepts. Once a property can belong to someone else, guest "availability, dates only" also gets its surface: the venue's occupancy calendar, read-only, where a guest is already allowed to stand.

### 3.3 Two events, one evening

"חתונת כהן–לוי, 14.3, אמרה, אולם ורדה, 350 איש" is **two business records**:

- **the venue's booking:** menu, price per guest, contract, deposits, kitchen sheet
- **the designer's event:** drawing, quote, orders, packing list

They live in **two `events` rows in two organisations**, joined by one `event_links` row. It is never one row with two owners: every table keyed on `organization_id` (billing documents, issued quotes, design documents, notifications) would need two, and the tenant seam is the safety net under the whole app.

The venue's booking **is an `events` row**, not a new table. Most of its columns already mean the same thing for a venue:

- client and contacts, billing name/address/number
- date, start time, venue, zones, guests, event type
- `confirmedAt`, `lostAt`, archived

So billing (`event_id` foreign keys), appointments, notifications and the client portal (`event_clients`) all work for a venue without changes. The designer-only columns (`step`, `shades`, `quoteSentAt`) are simply unused. Venue-only facts go in a 1:1 side table, `event_hosting` (§6).

A link is made one of two ways, and **the venue always confirms**, because the date is its authority:

- the venue names the event's designer on the booking (a studio on the app, or an email that becomes an invitation)
- the designer asks from their own event "לקשר לאירוע באולם", offered when the event's venue belongs to a `venue` org

### 3.4 What crosses, and what never does

| Direction | Crosses (allow-list) | Never |
| --- | --- | --- |
| Venue → designer | date, setup window and **access hours**, run of show (times), zones, guests (expected / final), event type, client name, the venue's **on-site manager** and phone, the hall layout (§3.5) | menu prices, package, deposits, payments, the client's billing details, the venue's other events |
| Designer → venue | the design: read-only design pass and 3D; load-in / load-out times, crew size and crew lead; proposed table changes | the designer's quote, catalog prices, costs, orders, suppliers, the designer's other events |

The load-in sheet (`/outputs` → דף הקמה) lists "venue access hours/contact" as *deliberately absent* because nobody could type it truthfully. Now it comes from the people whose fact it is.

**Sync rule: copy and show the drift, never write silently.** This is the marketplace's rule (`fetchSourceStatus` / `acceptSourcePrice`). On link, the designer's row takes the venue's facts. After that, a change at the venue appears on the designer's event drawer as "האולם עדכן: 320 → 350 מוזמנים · עדכון", with a notification. Every designer reader (runway, procurement, readiness) keeps reading its own row. On the runway, a date change at the venue is an alert above everything else.

**Enforced like the marketplace.** One module, `lib/event-links/`, is the only place that reads the other org's rows, and it selects named columns only. `npm run check:event-links` scans it for imports of billing, quotes, orders, suppliers, menus and `costPrice`, the way `check:marketplace` does. `check:access` gains the link's scope.

### 3.5 Who owns the tables

The split already exists in the code. The hall pass draws `HALL_PASS_GROUPS` (seating, stages, bars, composites). The design pass draws the rest. The quote says the tables themselves are not quoted because they are venue furniture. In an Israeli hall, the room, tables, chairs, stage and bar are the venue's, and the table layout is settled between the venue and the couple. That is what iPlan sells as "סקיצות הושבה".

So **once linked, the venue owns the hall pass and the designer owns the design pass.**

- The venue's booking has its own design document holding only the hall pass, drawn in the existing canvas with `mode="hall"`.
- On link, the designer's document is **forked** from it, with the base kept, the way a client proposal keeps `base`.
- Later venue edits reach the designer as a review banner through `lib/design-document/delta.ts`'s three-way `mergeChanges`. This is the client-proposal engine with the roles reversed.
- A designer's table change goes back to the venue as a proposal.

One detail makes the fork cheap. A placement must point at a product in its own org. Base-library ids are UUIDv5 over (organisation, item key), so a venue's standard table maps to the designer's same-key row **by recomputing the id**. A venue's custom table that is not in the library is copied into the designer's catalog the way `addToCatalog` copies a marketplace row: no price, with provenance.

Before phase 3 the hall pass is not shared. The designer sees the venue's layout read-only and draws their own.

## 4. The venue's app, screen by screen

| Nav | Screen | Status |
| --- | --- | --- |
| לוח בקרה | Occupancy calendar | new |
| הזמנות | Bookings: list, pipeline, booking file | new (on `events`) |
| תפריטים | Dishes and packages | new |
| תוכנית המתחם | /halls | built |
| דפי עבודה | Kitchen, floor and event sheets | new (pattern of /outputs) |
| חשבונות | /billing | built; package quote is new |
| גלריה | Dishes, the hall dressed, tasting presentations | built; photo link generalised |
| הגדרות | + venue operations | small |
| *hidden* | קטלוג, הפקה (designer's), ספקים ורכש, שוק הספקים, סטודיו, פלטים | |

### 4.1 לוח בקרה: the occupancy calendar

A month grid of days × bookable zones. Each cell is one of:

- free
- **אופציה**: a hold, with "שמור עד 5.11"
- **הוזמן**: an order was issued
- **כמות סגורה**: the final count is closed
- **התקיים**
- blocked (a `constraint` diary entry with a venue and zone)

The diary's entries sit on the same grid: tours (`walkthrough`), meetings, and a new **`tasting`** kind (טעימה), appended to the enum because it is append-only.

Everything in a cell is derived from bookings except the **hold**. A hold is a promise to a prospect that nothing else records, so it is typed, like `confirmedAt`. An expired hold frees the date and alerts sales; it is never deleted.

The Hebrew calendar annotations the dashboard already draws (lib/calendar/hebrew.ts) are where price seasons and the periods many couples will not marry in (ספירת העומר, בין המצרים) become visible.

### 4.2 הזמנות: the booking file (תיק אירוע)

It is ordered the way a booking happens, using `DrawerSection` like the event drawer:

1. **Status**, derived: lead → hold → ordered (order + deposit) → count closed → held → settled. `lostAt` covers "didn't close".
2. **Who:** client, contacts, event type.
3. **When:** date, slot (ערב / צהריים, §9.7), and the **run of show**: an ordered list of time and step (קבלת פנים 19:00 · חופה 20:15 · כניסה לאולם 20:45 · מנה ראשונה · ריקודים · עיקרית · קינוח · סיום).
4. **Where:** zones, for example the garden for the reception, the canopy, the hall.
5. **How many:**
   - expected guests
   - **guaranteed minimum** (in the contract)
   - **final count** and the date it closes (D-N, a venue setting)
   - adults / children
   - **vendor meals (מנות ספקים)**
   - **special meals**: vegetarian, vegan, gluten-free, allergies, as counts now and per table once seating exists
6. **Menu:** package, choices per course, extras (sushi station, dessert table, bar upgrade), service style (served / buffet / stations).
7. **Vendors at the event:** the designer (the link, §3.3), DJ/band, photographer, others. Each has a name, phone, arrival time and meals.
8. **Notes** for the kitchen and for the floor.
9. **Money:** quote, order, payment schedule, receipts. This is the event drawer's existing billing section.
10. **Hall sketch:** opens the canvas in hall mode on this booking's document.

### 4.3 תפריטים: dishes and packages

- **Dish (מנה).** Name, course (קבלת פנים / ראשונה / ביניים / עיקרית / תוספת / קינוח / בר), description, photos, and tags: טבעוני, צמחוני, ללא גלוטן, מכיל אגוזים, חריף, and בשרי / חלבי / פרווה, because kashrut is a property of the dish.
- **Package (חבילה).** Price per adult, per child and per vendor meal; minimum guests; courses as "choose N of these dishes"; included bar; priced extras.
- **Event menu.** The package, the choices and the extras, frozen into the quote when it is issued.

The printed outputs are the client's menu (with photos, for the tasting and for approval) and the kitchen sheet (§4.5). Prices by day of week or season are phase 2 (§9.11).

### 4.4 תוכנית המתחם and the hall sketch

/halls is unchanged, and the venue is now its owner. Each booking has a hall-pass sketch: tables, numbers, seats, stage, bars, dance floor, drawn from the venue's own furniture.

That furniture is the installed base library plus the venue's own rows. The **counts** matter: "do I have 500 chairs for this evening, with the garden event the same day?" is `lib/production/readiness.ts` restricted to owned stock. The venue does not get the décor catalog or the design pass. A venue whose standard package includes basic dressing (a tablecloth and napkins) gets the tablecloth categories as well (§9.9).

### 4.5 דפי עבודה: sheets derived from the booking, never typed twice

This is the packing-list principle applied to food. The booking is the one source, and these are views of it:

- **Kitchen sheet:** meals per dish per course, split adults / children / vendors / special; serving times from the run of show; kitchen notes.
- **Floor sheet:** the hall map with table numbers and seats (special meals per table once seating exists); waiters from a ratio set in settings; the bar sheet.
- **Event sheet (BEO):** one page for the event manager with times, the couple, the designer and their crew lead, the DJ, counts, vendor arrivals and notes.

These print through the existing pipeline (A4 boxes, B&W-legible), the same way the load-in sheet does.

### 4.6 חשבונות

`lib/billing` is reused whole: VAT status, numbered series, order, payment requests, receipts, credit notes, allocation numbers, the cash-law cap, the ledger and the accountant's CSV. Three changes:

- **An order without a drawing.** `issueOrder` refuses today unless an `issued_quotes` row exists, and that row is sealed from a drawing. The venue's quote is a **package quote**: `max(final, minimum) × adult price + children + vendor meals + extras − discount`. Either `issued_quotes` gains a `source` (drawing | package), or a sibling table holds package quotes. The order names whichever it was made from.
- **The final count settles the balance.** Closing the count re-figures the total. The remaining installments are re-cut, and a credit note covers a count that fell below an amount already invoiced.
- **Contract terms** (cancellation, final-count rule, kashrut, hours) are printed on the order. A signature waits for billing's own phase 2.

A real local detail: the balance is often paid on the night, out of the gift envelopes. That is a scheduled installment dated the event day, and `cashCap` already guards it.

### 4.7 גלריה

The user's instinct is right. `GalleryImage` links exactly one catalog product today. That link becomes a subject: a product, a dish or nothing. A venue's gallery holds:

- dish photos, used by the menus and by a tasting presentation
- the hall dressed at past events, the presentation shown on a tour

The presentation player (/present) is reused as it is. Later, a linked designer's photos of an evening in this hall can be offered to the venue with the designer's consent.

### 4.8 Not for a venue, and why

- **Décor catalog / design pass / outputs / meeting flow:** the designer's job.
- **שוק הספקים:** agreed. It sells décor to designers.
- **The designer's production runway:** its checkpoints (gallery, design, packing, supplier orders) are the wrong ones. A **venue runway** is the same pure engine (`lib/production/runway.ts` already runs two plans) with a third set of checkpoints, phase 2:
  - before the yes: tour held, quote sent, hold expiring
  - after it: deposit received, tasting held, menu chosen, count closed by D-N, hall sketch settled, balance scheduled, designer's load-in known
  
  Every checkpoint is a row that already exists.
- **ספקים ורכש:** "suppliers" means two things for a venue.
  - *The event's vendors* (designer, DJ, photographer) are part of the booking file (§4.2).
  - *The venue's own suppliers* (food, drink, laundry) fit the existing directory and expenses tabs, in phase 2, as bookkeeping. **Procurement from menus** (ingredients per dish × count) is a food-costing product of its own and out of scope. The drawing-derived רכש tab never applies.

## 5. Your list, answered

| You said | Answer |
| --- | --- |
| Schedule events in high detail (guests, menu…) | **Yes, the heart:** the booking file (§4.2) on top of the occupancy calendar (§4.1) |
| No catalog | **No décor catalog.** They do need their furniture (tables, chairs, stage) and its counts for the hall sketch, installed from the base library (§4.4) |
| Production? | **Not the designer's.** The same engine with the venue's own checkpoints, in phase 2 (§4.8) |
| Suppliers maybe | **Phase 2:** directory and expenses only. The event's vendors live in the booking file |
| חשבונות yes | **Yes, already built.** Package quote and final-count settlement are the new parts (§4.6) |
| Marketplace no | **Agreed**, hidden |
| Gallery for menus | **Yes:** dishes, the hall dressed, tasting and tour presentations (§4.7) |
| *(not on the list)* | **Menus and packages** (§4.3), **kitchen / floor / event sheets** (§4.5), **the designer link** (§3.3–3.5), and later the **guest list, seating chart and hostess check-in**, which are iPlan's core (§8, phase 3) |

## 6. Data model (sketch)

- `organization_kind` enum gains `venue` (migration).
- `events`: reused for bookings, no new columns.
- `event_hosting` (1:1 on `events.id`):
  - `slot`, `hold_until`
  - `guaranteed_min`, `final_guests`, `final_closed_at`, `children`, `vendor_meals`
  - `special_meals jsonb` (kind → count)
  - `service_style`, `run_of_show jsonb` (`{ time, label }[]`)
  - `package_id`, `menu_choices jsonb` (course → dish ids), `extras jsonb`
  - `kitchen_notes`, `floor_notes`
  - `vendors jsonb` (name, role, phone, arrival, meals). The linked designer is in `event_links`, not here.
- `menu_items` (org, name, course, description, tags text[], photo, position, archived)
- `menu_packages` (org, name, price_adult / child / vendor, min_guests, `courses jsonb` `{ course, choose, itemIds }[]`, `extras jsonb`, archived)
- `event_links` (`venue_event_id`, `studio_event_id`, `venue_org_id`, `studio_org_id`, `state` pending / active / ended, `invited_email`, `accepted_at`; unique per pair). A venue event may have one designer per pass; a designer event has at most one venue.
- `appointment_kind` enum: append `tasting`.
- `studio_settings` (or a `venue_ops jsonb`): access hours, loading notes, on-site manager, final-count days before the event, waiter ratio, kashrut, contract terms.
- `gallery_images`: `product_id` nullable + `dish_id`.
- Package quotes: `issued_quotes.source` or a sibling table (§4.6).

## 7. Existing code that changes

| File | Change |
| --- | --- |
| lib/auth/kinds.ts | `OrgKind` + `venue`, `SignupChoice`, `CHOICE_*`, `ORG_HOME` |
| lib/db/schema.ts | enum value; the tables in §6 |
| lib/auth/guard.ts | `requireDesigner` means studio only; a per-kind guard for venue and shared pages |
| components/app-shell.tsx | `for` on every nav row; הזמנות, תפריטים, דפי עבודה; titles |
| components/org-kind-context.tsx | `useIsVenue` |
| lib/events/actions.ts | `assertPlacement`: owned **or** granted |
| lib/venues/actions.ts | `transferVenue`; `grantee_org_id` written on accept |
| lib/venues/access.ts | the link's scope beside `grantScope`; `check:access` |
| lib/billing/actions.ts | `issueOrder` from a package quote; final-count settlement |
| lib/gallery/ | the photo's subject |
| lib/production/runway.ts | `VENUE_CHECKPOINTS` (phase 2) |
| app/(app)/outputs/load-in-sheet.tsx | access hours and the on-site contact from the link (phase 2) |
| lib/design-document/delta.ts | the venue ↔ designer hall-pass review (phase 3); the engine as is |

## 8. Sequence

**Phase 1: the venue runs its own book.** This has to be worth it with no designer on the app.
- org kind, sign-up, nav, guards
- occupancy calendar with holds and blocks
- the booking file
- menus and packages
- package quote → order → payments (billing)
- kitchen sheet and event sheet
- the hall-pass sketch per booking
- dish photos in the gallery
- pilot: אמרה

**Phase 2: the venue and the designer meet.**
- `event_links`: invite, accept, the allow-list, drift banners, `check:event-links`
- venue transfer; `assertPlacement` through a grant; guest availability on the calendar
- the designer's design read-only at the venue, and 3D
- access hours and the on-site manager in the designer's load-in sheet
- the venue runway; suppliers directory and expenses; seasonal prices
- floor sheet with a waiter ratio

**Phase 3: one table plan between them, and the guests.**
- hall-pass fork and delta review both ways (§3.5)
- guest list, then the seating chart (the couple's job through the client portal, which the client-side spec already places in phase 3), then hostess check-in
- the final count read off RSVPs instead of typed
- contracts with signature (billing phase 2)

**Later:** lead pipeline, staff shifts, SMS and WhatsApp, occupancy and sales reports, a 3D tour of the dressed hall for prospects (`/v/<token>` as a sales tool), online booking.

## 9. DECIDE

1. **One kind per org?** A separate `venue` kind · a studio with a "venue mode" switch. A venue with an in-house designer runs a studio org beside it (two orgs, one person may belong to both) until capabilities per org are worth building.
2. **A plan a designer already drew:** transferred to the owner, the designer keeping an editor grant · the venue gets a copy · it stays the designer's.
3. **Two linked events** · one event row with two organisations (rejected: every org-keyed table).
4. **Shared facts:** copy and show the drift, accepted with one click (the marketplace's rule) · the designer's row reads the venue's live.
5. **Who owns the table layout once linked:** the venue owns the hall pass and the designer proposes · the designer · whoever edits last.
6. **Does the venue see the design?** Read-only design pass and 3D · nothing · only the printed set.
7. **The day's slots:** one booking per bookable zone per day, plus an optional צהריים slot · free time ranges.
8. **Holds:** a typed hold with an expiry · no holds.
9. **Furniture:** the base library's furniture plus a slim furniture list with counts · the full catalog. Tablecloths are included only for a venue whose package includes them.
10. **Guest list, seating, hostess:** phase 3, shared with the client-side seating chart · phase 1 (it is iPlan's core, but it is the couple's job and a large one).
11. **Pricing:** per-guest packages with a guaranteed minimum, and seasons in phase 2 · hall rental and catering priced apart. A "dry hire" venue with an outside caterer treats the caterer as a vendor on the booking.

## 10. Risks

- **Scope.** Hall management is a whole product, and iPlan and 10comm are mature. The way to lose is a thin CRM. Phase 1 builds only what the plan and the booking can feed, and leads with what nobody else has.
- **A cross-tenant leak**, the worst failure here. Mitigated by one reading module, named columns, a scanning check, and copies instead of joins (§3.4).
- **Chicken and egg.** Designers want venues on the app and venues want designers. Phase 1 must stand alone for the venue, and a designer's plan can be handed over. אמרה is both.
- **R-8: menus and counts kept true.** A menu, like stock counts (R-7) and the gallery (R-6), is useful only while someone maintains it. Quick entry (paste a menu as lines), and nothing required to issue a quote except a package.
- **Legal.** Invoices are handled. A contract with no signature is a document, not a signed contract, and the page must not claim otherwise, as billing already does with "מקור".

## Sources

- [iPlan: מתחמי אירועים וספקים (vendor toolbox, Hebrew)](https://iplan.co.il/he-IL/front/vendor/home)
- [iPlan: A toolbox for the event professional (English)](https://iplan.co.il/en-US/front/vendor/home)
- [iPlan: about](https://iplan.co.il/en-US/front/about)
- [iPlan: reception / hostess](https://staging2.iplan.co.il/en-US/front/client/reception)
- [iPlan hostess app (App Store)](https://apps.apple.com/us/app/id576216400)
- [iPlan company profile (Startupim)](https://startupim.com/company/iplan)
- [10comm: מערכת לניהול אירועים מקצה לקצה](https://10comm.com/articles.php?id=179)
- [ActiveMind: תוכנות לניהול אולמות](https://activemind.co.il/event-hall-management-software/)
