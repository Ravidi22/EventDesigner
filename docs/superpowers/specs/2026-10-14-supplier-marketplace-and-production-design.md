# Supplier marketplace, production, and the road to the client side

Version 2 | 2026-10-14 | **Built, on the recommended answers** (DECIDE 1–4 as recommended; DECIDE 5: equipment readiness and crew assignment). Migration 0016. What shipped against each section is in CLAUDE.md ("A supplier is an organisation…", "Orders are a procurement group…", "The runway reads orders and crew…"). Not built: the load-in sheet, the packed checklist, an expense from a delivered order, the client side (§6). Companion to [2026-08-16 suppliers & procurement](2026-08-16-suppliers-procurement-design.md) (built) and [docs/roadmap.md](../../roadmap.md).

This document takes three ideas Ravid raised on 2026-10-14 and turns them into something buildable, in the order that unblocks the client side (בעל האירוע): suppliers get accounts and publish products; designers pull those into their own catalog and send orders from procurement; the production screen learns the facts those orders create. Each section ends with the decisions only Ravid can make, marked **DECIDE**.

## What exists today, and what the ideas are really asking for

- **A supplier is a row in the designer's own directory** (`suppliers`, per studio): name, phone, what they supply. Nothing on the other side of it: a supplier has no account, no catalog, no way to see an order.
- **Procurement already derives the order.** `lib/suppliers/procurement.ts` reduces the drawings in a date window into lines per supplier, with the three stock reductions (summed / peaked / per event). It ends at a screen. Nothing is *sent*.
- **The catalog is per studio and copied, never shared.** The base library (`lib/catalog/standard/`) proves the pattern: a library seeds a catalog, and afterwards the studio owns its rows, its prices, its drawings. Any marketplace has to keep that rule, or a supplier editing a price would silently change a quote the designer already sent.
- **Cost is not price**, and `npm run check:costs` enforces that the client never sees a cost. A supplier's price is a cost. It must enter the system on the `costPrice` side only.
- **Production (`/production`) is derived, never typed**, from six checkpoints that are rows which already exist. The one typed fact is `events.confirmedAt`, which earns it because "the client said yes" is derivable from nothing.

So "a marketplace where suppliers upload products and designers add them to their catalog" is, in this codebase's terms: **a second organisation kind, a published flag on products, one cross-organisation read seam, a copy-with-provenance into the designer's catalog, and a way to turn a procurement line into an order the supplier sees.** Everything else (storefront, ratings, payments) is out of scope and stays out.

## 1. Supplier accounts

**A supplier is an organisation, not a role.** `organizations.kind` becomes `studio | supplier` (new column, default `studio`). A supplier signs up on the same form with "ספק" picked, gets an organisation of kind `supplier`, and their people are `users` rows exactly like a studio's — `currentOrg()` and the tenant seam do not change. `users.kind` stays `studio` (a business account) and `client`; the session comment already says "studio = a designer or supplier".

Why not a role inside a studio: a supplier serves many studios. One organisation per supplier is the only shape in which "their products" has one owner and "their orders" has one inbox.

What a supplier org gets:

- **Its own catalog**, through the existing `/catalog` screen and `products` table. Same drawer, same variants, same appearance editor, same photo upload. A supplier's product is a real catalog row in the supplier's own organisation; nothing about the catalog code changes except one switch.
- **One new switch per product: `published`** (boolean, default false). Off = private draft. On = visible to every studio in the marketplace.
- **A wholesale price**: the supplier fills `unitPrice` as their selling price. When a designer copies the row, that number lands in the designer's `costPrice`, never in `unitPrice`. The designer types their own client price.
- **An orders inbox** (section 3).

What a supplier org does NOT get: events, venues, the studio, gallery, outputs, the meeting flow. The `(app)` layout hides those routes for a supplier org, and every action behind them already throws for the wrong organisation. `npm run check:access` gains a line: a supplier org reaches no event, no venue, no quote.

**Guest supplier (not an account).** Today's manual `suppliers` rows stay. A directory row with no linked organisation is a supplier who has not signed up; an order to them is printed or sent by WhatsApp, as the quote is. The directory becomes the union of both kinds with one column, `suppliers.linkedOrgId` (nullable, references `organizations`).

**DECIDE 1.** Supplier = separate organisation kind (recommended) — or a supplier is a member role inside a studio (cheaper, but one supplier cannot serve two studios).

**DECIDE 2.** Can anyone sign up as a supplier, or does a studio invite its suppliers by link first? Recommended: open sign-up, because the first suppliers will be onboarded by Ravid anyway, and an invite flow is Task 5 of the auth guide — it can come later without changing the model.

## 2. The marketplace: browse, add to catalog, stay in sync

**One cross-organisation read, in one module.** `lib/marketplace/actions.ts` is the only place in the codebase that reads another organisation's rows: `fetchMarketplace(filter)` returns `products` where `organizations.kind = 'supplier' AND published = true AND archived = false`, joined to the supplier's public profile (name, phone, logo, what they supply). It returns `unitPrice` under the name `wholesalePrice` and nothing else of the supplier's. `npm run check:marketplace` scans `lib/marketplace/` for any join to `events`, `venues`, `quotes`, or `expenses` and fails if one appears — the same shape as `check:costs`.

**A screen: `/marketplace`** (sidebar entry under the catalog). The catalog's own card grid, filtered by category and supplier, searching by name, each card showing the supplier, the wholesale price, and one button: **הוספה לקטלוג שלי**. A card already in the designer's catalog says so and offers "פתיחה בקטלוג" instead.

**Adding = copying with provenance.** The button copies the product row and its variants into the designer's organisation — exactly what `lib/team/join-studio.ts` does for a designer moving studios, lifted into a shared `copyProduct(from, intoOrg, patch)` in `lib/catalog/`. The copy:

- gets a new id, the designer's `organizationId`, `costPrice = wholesalePrice`, `unitPrice = null` (the drawer asks for it before the product can be quoted — a product with no client price shows the existing "חסר מחיר" state),
- carries `sourceProductId` (new nullable column on `products`, the supplier's row id) and `sourceOrgId`,
- carries the supplier's photos as the SAME file URLs (no re-upload: the bucket is one, keys are per organisation, and a public-read URL is a public-read URL),
- creates, if missing, a `suppliers` row in the designer's directory with `linkedOrgId` = the supplier org and the supplier's name and phone, and sets `products.supplierId` to it. The procurement screen needs nothing new to group this product under its supplier.

**Staying in sync without overwriting.** The supplier will change prices and retire products. The designer's copy is theirs (their drawing size, their variants, their client price), so the system never writes into it. Instead `fetchCatalog` reports, per sourced product, whether the source row is newer (`updatedAt` later than the copy's `syncedAt`, new column) or gone (archived or unpublished). The drawer shows one line — "הספק עדכן את הפריט: מחיר 180 ₪ (היה 160)" — with "עדכון המחיר" and "התעלמות". Price only; appearance and dimensions are the designer's. `catalog:standard --redraw` already draws the line between "install" and "overwrite"; this is the same line.

**What is deliberately not here:** no storefront page per supplier, no ratings, no messaging, no payment, no stock reservation. A designer who wants to talk to a supplier has the phone number on the card.

**DECIDE 3.** Copy with provenance (recommended; matches the base library and keeps quotes stable) — or reference the supplier's row directly from placements (no copy, always current, but a price change rewrites every unsent quote and a supplier edit redraws every plan).

**DECIDE 4.** Is the wholesale price shown on the marketplace card to every studio, or only after adding? Recommended: shown. It is the reason to browse.

## 3. Orders: procurement becomes a message

Procurement already produces, per supplier, the lines to order in a date window. The missing verb is **send**.

**One table, `orders`:** `id`, `organizationId` (the studio), `supplierId` (the directory row), `supplierOrgId` (nullable — set when the supplier has an account), `eventId` (nullable — a window order covers several events), `windowFrom`, `windowTo`, `status`, `sentAt`, `note`, plus `order_lines` (`orderId`, `variantId`, `description`, `qty`, `unit`, `wholesalePrice`). An order is a **snapshot** of the procurement lines at the moment it was sent, so the forecast can keep moving under it and the supplier sees what was actually asked.

**Status is typed by the supplier, and that is right.** `status` ∈ `sent | confirmed | partial | delivered | declined`. The rule "derived, never typed" is about facts the studio could forget to set about its own work. "The supplier said yes" is the other party's answer — the same reasoning that made `confirmedAt` the one typed column on events. A supplier with no account cannot answer in-app; those orders stay `sent` and the designer marks them by hand (one exception, stated on screen).

On the studio side: the procurement tab gets **שליחת הזמנה** per supplier group, which opens a drawer listing the lines (editable quantities, a note), and on send writes the order and, when the supplier has an account, puts it in their inbox; otherwise it offers the same share sheet the quote uses (WhatsApp / print). An **הזמנות** tab lists sent orders with their status.

On the supplier side: `/orders` shows incoming orders newest first, each with the studio's name, the window, the lines, and four buttons. No prices other than their own.

**What this gives production:** the "ציוד" checkpoint today is "an export exists". With orders it can also say, per event, which rented and consumable lines have a confirmed order and which have none — derived from `orders` × the event's procurement lines, nothing typed by the designer.

## 4. The suppliers screen (ספקים), improved

The current screen stays and grows into the studio-side half of the above:

- **ספקים** — one list: linked suppliers (with the marketplace badge, their catalog count, "N פריטים בקטלוג שלי") and manual ones, each card showing open expenses and the last order. "הוספה מהמרקטפלייס" beside "ספק חדש".
- **הוצאות** — unchanged, plus a line can be created from a delivered order in one click (amount prefilled from the order's lines).
- **רכש** — unchanged reduction, plus שליחת הזמנה per supplier group, and the "ללא ספק" group gets a per-line "בחירת ספק" that writes `products.supplierId` — the open item from the previous spec (a derived consumable with no row of its own) is answered by letting the designer name who sells the candles once.
- **הזמנות** — new, section 3.

## 5. Production (הפקה): what is missing

Ravid said there is work to do here without naming it. From the requirements (F-10) and the runway as built, these are the gaps, each one a fact the screen cannot show today:

| Gap | What would become visible | Typed or derived |
| --- | --- | --- |
| **Who is on the truck.** The collision band says "ציוד וצוות משותפים" but no crew is assigned to any event. | `event_crew` (event × user). A crew member's `/production` shows only their events; a collision between two events is only real when a person or an owned item is on both. | Typed, by the owner — an assignment is a decision, not a fact derivable from anything. |
| **Equipment readiness.** "ציוד" means "an export exists". | Per event: owned items vs stock on that day (already in procurement), rented and consumable lines with a confirmed order (section 3). | Derived. |
| **The day itself.** `setupDate` is a date; the truck has an hour, the hall has access hours, the stage has a crew. | A load-in sheet per event: time, venue contact and hours (new fields on `venues`), crew, the packing list's totals, the placement-map set link. Printed with the set. | Mostly venue facts typed once per property (like its walls); the rest derived. |
| **Packed / loaded.** F-6.2's "נארז ✓" is a printed column. | A phone-sized checklist for the crew on the packing list, ticks saved per export version. | Typed — a physical act nobody can derive. It earns an exception the way `confirmedAt` does, and it is per export version so a re-export starts clean. |

Recommended order: equipment readiness (free once orders exist), crew assignment (small table, big gain on collisions), load-in sheet, then the packed checklist.

**DECIDE 5.** Which of the four did you mean by "work in production"? If none, say what the screen fails to tell you on a real week.

## 6. The road to the client side (בעל האירוע)

A client account and `/client` already exist (`event_clients`, `requireClient`). Before building the client surface, these must be true, or the first real client will meet a dead end:

1. **Email** (auth guide, Task 1) — a client is invited by mail, not by a link pasted into a designer's WhatsApp.
2. **The quote reaches the client as a page, not only a PDF** — `issued_quotes` already holds the layout; a client-facing render of it on `/client` is the same `QuoteDocument` in client view.
3. **"אישור" is the client's button.** `events.confirmedAt` is written by the client pressing approve on the quote page (today the designer types it on the event). The production screen then moves the event into בהפקה by itself. This is the single most valuable client feature and it is one action plus one column that already exists.
4. **Likes from the client's own phone** — the gallery folder is per event already; the client view needs the presentation mode without the designer's chrome, which `/present` is.
5. **A viewing link without an account** (F-9.2, phase 2) — an expiring token on an event, read-only. Not needed for the first client; needed before the tenth.

Nothing in sections 1–5 blocks this list, and section 3 is what makes the client's "אישור" meaningful: a confirmed event with sent orders is a produced event.

## Sequence

1. Auth guide Tasks 1–2 (Ravid's sister) — email and reset, in parallel with everything below.
2. **Supplier org kind + published flag + marketplace read seam + `/marketplace` + copy with provenance** (section 1–2). One migration: `organizations.kind`, `products.published`, `products.sourceProductId`, `products.sourceOrgId`, `products.syncedAt`, `suppliers.linkedOrgId`. `check:marketplace`, `check:access` extended.
3. **Orders** (section 3) and the suppliers screen changes (section 4). One migration: `orders`, `order_lines`.
4. **Production**: equipment readiness from orders, then whichever of the rest DECIDE 5 names.
5. **Client side** (section 6), once email exists.

## Risks

- **R-8 Two organisations share a photo URL.** A copied product points at the supplier's file. If the supplier deletes it, the designer's card goes blank. Mitigation: `copyProduct` copies the object in the bucket (server-side copy, same driver) into the designer's prefix. Small, and it keeps the tenant boundary on files true.
- **R-9 A supplier publishes a product with no drawing size.** The catalog already requires dimensions (F-4.1); the publish switch refuses a row without them, with the same sentence the drawer shows.
- **R-10 Price drift.** The designer's `costPrice` is a snapshot. The sync line in the drawer is the mitigation; the margin per event stays honest because expenses, not `costPrice`, are what margin reads.
