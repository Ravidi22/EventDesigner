# Suppliers & Procurement — who I buy from, what it cost, what to order

Version 2 | 2026-08-16 | **Built.** Scope: a new `/suppliers` surface, six new columns on `products`, two new tables. No change to the quote, the packing list, or anything client-facing.

> **v2 records what shipped.** Three things moved between the spec and the build, each marked ⟳ below: the two domain modules became one; the margin card went to the event drawer instead of the outputs screen; and the derived-consumable question was answered rather than deferred.

## Goal

The studio knows what every event *sells* and nothing about what it *costs*. Add:

1. **ספקים** — a directory of who the studio buys from.
2. **הוצאות** — what was paid, to whom, for which event. Which yields **margin per event**, the first number in the product that says whether a job was worth doing.
3. **רכש** — a date-window rollup answering "what do I need to order, and from whom", derived from the drawings rather than typed.

## Current state (from codebase survey)

- **Usage is already computed.** `packingList()` ([lib/outputs/aggregate.ts:36](../../../lib/outputs/aggregate.ts#L36)) reduces a `DesignDocumentContent` to quantity-per-variant, correctly measured per `priceUnit` — a count for a chair, metres for a drape, m² for a carpet ([lib/design-document/measure.ts](../../../lib/design-document/measure.ts)). `quoteGroups()` is the same reduction × a price column.
- **Events carry dates** (`events.event_date`) and an org scope. `packing_spares` holds the crew's extras, per event and variant.
- **Commitment has one honest marker**: an `issued_quotes` row, which also seals the design-document version it was made from.
- **`products.unit_price` is the CLIENT price.** There is no cost column anywhere in [lib/db/schema.ts](../../../lib/db/schema.ts); `grep -i cost` over `lib/` returns only prose. Cost is genuinely new, and it is the first internal money number that could leak to `/present` or the client portal.
- **A derived-quantity mechanism already exists**: `CategoryField` ([lib/catalog/categories.ts](../../../lib/catalog/categories.ts)) multiplies fixtures into consumables — a 5-arm candlestick yields 5 candles, surfaced as `PackRow.derived`.

## Decisions taken before writing this

| Question | Decision |
| --- | --- |
| Which events feed the forecast | **Only events with an `issued_quotes` row.** Everything earlier is shown as a separate, greyed "פוטנציאלי" total — visible, never ordered against |
| Does the studio own stock | **Mixed.** Full three-way `stockKind`, and the studio maintains counts of what it owns |
| How far do expenses go | **Per-event costing only.** No overheads, no bookkeeping |

## The modelling decision that drives everything: `stockKind`

A monthly *sum* is the right report for flowers and the wrong report for a carpet. The same 30m roll laid at four events is 30m of asset, not 120m of purchasing — summing it tells a designer to buy four chuppahs. So every product declares what kind of thing it is, and the forecast splits three ways:

| kind | the question it answers | the reduction |
| --- | --- | --- |
| `owned` | do I own enough for the busiest day? | **peak concurrent demand** across events whose dates overlap, compared to `stockQty` → shortfall |
| `consumable` | how much to buy? | **sum** over the window |
| `rented` | what to order from whom, for when? | **per-event lines**, grouped by supplier and date |

Defaults per category, so nobody fills this in 200 times: `centerpieces` → `consumable`; everything else in `CATEGORIES` → `owned`. The default is a starting value written on create, not a lookup at read time — a studio that rents its chairs must be able to say so without the category disagreeing.

### The ordering unit is not the planning unit

A florist sells stems; the plan places centerpieces. A fabric supplier sells metres; the plan hangs drapes on walls. Two columns generalise the `arms` mechanism:

- `orderUnit` — free text, what the supplier sells in ("גבעולים", "מטרים", "יחידות")
- `orderFactor` — how many order-units per placed unit (7 stems per centerpiece)

The רכש list then reads **3,400 גבעולים**, not 480 of something no florist can price. Absent factor = 1 and the placed unit is used, which is right for most of the catalog.

## Data model

```ts
// lib/suppliers/types.ts
export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  supplies?: string;   // free text — what they supply
  note?: string;
  archived?: boolean;
}

export type StockKind = "owned" | "consumable" | "rented";

export interface Expense {
  id: string;
  supplierId: string;
  eventId?: string;      // nullable ON PURPOSE — see below
  variantId?: string;    // plain uuid, product OR variant, same as packing_spares
  description: string;
  amount: number;
  spentAt: string;       // date
  paid: boolean;
}
```

```sql
-- suppliers
id, organization_id, name NOT NULL, contact_name, phone, supplies, note,
archived NOT NULL DEFAULT false, created_at, updated_at
INDEX (organization_id)

-- products: four new columns
supplier_id   uuid REFERENCES suppliers(id) ON DELETE SET NULL
cost_price    numeric(12,2)              -- what the STUDIO pays. Never rendered client-side.
stock_kind    stock_kind NOT NULL DEFAULT 'owned'
stock_qty     integer                    -- how many are owned; meaningful only when stock_kind='owned'
order_unit    text
order_factor  numeric(10,3)              -- order-units per placed unit; NULL = 1

-- expenses
id, organization_id,
supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
event_id    uuid REFERENCES events(id) ON DELETE SET NULL,
variant_id  uuid,                        -- no FK, deliberately (see below)
description text NOT NULL DEFAULT '',
amount      numeric(12,2) NOT NULL,
spent_at    date NOT NULL,
paid        boolean NOT NULL DEFAULT false,
created_at
INDEX (organization_id, spent_at), INDEX (supplier_id), INDEX (event_id)
```

Three notes the schema should carry in prose:

- **`expenses.event_id` is nullable on purpose.** A bulk purchase of 500 candles belongs to no event. Same reasoning as `appointments.event_id`.
- **`expenses.variant_id` has no foreign key**, for the reason already written on `packing_spares`: a "variantId" is a *product's* id whenever that product has no variants, so a key into `product_variants` would reject an expense against most of a real catalog.
- **`suppliers` deletion is `RESTRICT` from expenses** — a paid expense must not lose who it was paid to. Archive, don't delete.

**One supplier per product, not a join table.** A `supplier_products` many-to-many with a price per supplier is the "correct" model and it buys exactly one thing nobody asked for: supplier comparison. A nullable `supplier_id` on the product plus expense lines that may name any supplier covers the real workflow. Revisit the day someone wants to compare two florists.

## The three screens

Route `/suppliers`, nav label **"ספקים ורכש"**, three tabs. No `db()` in a component.

⟳ **One module, not two.** The spec said `lib/suppliers/actions.ts` and `lib/expenses/actions.ts`. Everything went into `lib/suppliers/` instead: `expenses.supplier_id` is `NOT NULL`, so an expense cannot exist without a supplier, and two modules would have meant `lib/expenses/` importing `lib/suppliers/` for every ownership check while sharing one screen and one hook. The domain is "suppliers and what they cost". `procurement.ts` sits beside them, pure and self-checked.

### ספקים
Cards: name, what they supply, contact + phone, the count of products sourced from them, and the running unpaid total. A drawer to add/edit. Archive, never delete.

### הוצאות
A table filtered by supplier / event / date range, and an add form: supplier, amount, date, description, optionally an event, optionally a product, paid ✓. Totals per supplier and per event.

The payoff lands elsewhere: an **event margin card** — `issued_quotes.total` minus the sum of that event's expenses — on the dashboard's event drawer, with a link that opens this ledger already filtered to that event.

⟳ **Not on the outputs screen.** The spec named it too. `app/(app)/outputs` is a PRINTING surface: its three views become paper that goes to a crew and to a client, and a cost column one keystroke from a quote is exactly the accident `check:costs` exists to prevent. The event drawer is never printed and never shown in a meeting, and it is where "was this job worth it" actually gets asked.

### רכש
A window picker (השבוע · החודש · טווח) → three sections, each grouped by supplier:

- **להזמין** — consumables, summed, in order units.
- **השכרות** — rented items, per event, per date.
- **מלאי** — owned items whose peak concurrent demand exceeds `stockQty`, with the date of the peak and the shortfall.

`packing_spares` counts into all three: the crew's extras get bought too.

### Two honesty lines that are not optional

The forecast is a reduction over drawings, and drawings do not exist for every booked event. Silence here is worse than no screen:

1. **"N מתוך M אירועים בטווח עדיין לא תוכננו"** — an event with no design document contributes zero and must say so, the same standard as the unpriced-quote-line flag and the venue-access notice on the packing list.
2. **The פוטנציאלי line** — events without an issued quote, totalled separately and greyed, so the designer sees the exposure without ordering against it.

## Out of scope — explicitly, so it does not grow

- **Manual usage logging.** Usage is derived from the drawings. A screen where the designer types "I used 40m of carpet" is a second source of truth that drifts inside a month.
- **Bookkeeping.** No invoice numbers, no מע"מ reporting, no receipt scanning, no payment reconciliation, no supplier statements, no aged-debt report. A designer has a bookkeeper; this answers "what did the job cost" and "what do I owe", nothing else.
- **Overheads** — rent, the van, salaries. They have no event, they go stale here, and they already live in the bookkeeper's system.
- **Purchase orders.** Nothing is sent to a supplier from this product. The רכש list is read, then WhatsApped — the same call the venue-invitation flow already makes (docs/02 §"ספק דיוור").
- **Supplier price comparison / tenders.** See the one-supplier-per-product note.
- **Stock movements.** `stockQty` is a number the designer maintains, not a ledger of ins and outs. An inventory system is a different product.

## Risks

- **R-7 — the cost of maintaining stock counts.** `stockQty` has the same shape as R-1 (drawing the halls) and R-6 (curating the gallery): a number that is only useful while someone keeps it true. A stale count produces confident, wrong shortfall alerts. Mitigation: `stockQty` is optional; an owned product without one appears in the מלאי section as demand-only, with no shortfall claimed. Verify on the second month of real use whether the counts survive.
- **Cost leaking client-side.** `cost_price`, margin and expenses must never reach `/present`, `/client`, a quote or a packing list. Worth an assertion in a self-check next to the guest-scope one in `check:access` rather than trusting review.

## ⟳ The derived consumable — answered, not deferred

`PackRow.derived` already computes "נרות: 10" from a 5-arm candlestick: an *owned* fixture yielding a *consumable* that has no catalog row, and therefore no supplier, no cost and no order unit. The spec listed three ways out and deferred the choice. The cheapest one shipped, because leaving it out would have made the one screen whose job is "what do I need to buy" silent about the most obviously consumable thing in the business.

`buildItemIndex` ([lib/suppliers/actions.ts](../../../lib/suppliers/actions.ts)) fans every count-multiplier out into a synthetic line keyed `derived:<variantId>:<field>` — prefixed so it can never collide with a variant id or be mistaken for one downstream — with `stockKind: "consumable"` and `orderFactor` set to the arm count. It lands under **ללא ספק** with a real quantity and no cost, which is the honest state: the number is known, the supplier is not.

**Still open:** making "נר" a real catalog product that `categoryFields.arms` points at. That is the correct model — the candle would get a supplier, a cost and its own order unit — and it is a larger change than this one deserved.

## What shipped

Both passes, together. Everything in this spec is built except the item above.

| | |
| --- | --- |
| Domain | `lib/suppliers/` — `types`, `db-mapping`, `actions`, `procurement` (pure), `cost-boundary`, `use-suppliers` |
| Schema | `drizzle/0002_suppliers.sql` — two tables, six columns on `products`, one enum |
| Screens | `app/(app)/suppliers/` — three tabs, two drawers, a card; plus `dashboard/event-margin-card.tsx` |
| Also moved | `grantedVenueIds` → `lib/venues/granted.ts`, so procurement can honour venue access without a `"use server"` module exporting a helper that takes an `Actor` (which over HTTP is an impersonation endpoint) |
| Gates | `check:procurement`, `check:costs`, and a `verifySuppliers()` block in `db:verify` |

Schema changes are generated migrations: edit `schema.ts` → `npm run db:generate` → `npm run db:migrate`, commit the `.sql`, its snapshot and `_journal.json` together. **Neon has not had this applied** — deploying does not run migrations.
