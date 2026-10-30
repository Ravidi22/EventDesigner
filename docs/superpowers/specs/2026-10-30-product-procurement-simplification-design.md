# Where does it come from? — the product's procurement facts, asked once and simply

Version 2 | 2026-10-30 | **Built, on the recommended answers to every DECIDE** (the designer's three words; no rented default by category; רכש first; `products.spare_rate` with a 10% category default on the flowers group — migration 0024; the chip on every card, informational (the card opens the drawer, the bulk bar changes a filtered set); inline new supplier by name through `SupplierSelect`). The studio's chairs were moved to a "ספק כיסאות" supplier as rented, כיסא נפוליאון kept owned (`scripts/chairs-rented.ts`). Companion to [2026-08-16 suppliers & procurement](2026-08-16-suppliers-procurement-design.md) (built) and [2026-10-14 marketplace & production](2026-10-14-supplier-marketplace-and-production-design.md) (built). No schema change in the recommended shape except DECIDE 4.

Ravid, 2026-10-30: the whole `/suppliers` screen "does nothing… because the products we added do not connect to suppliers and to the waste or something — all of this because the product card is not easy to use and complex in that area." This document traces why a studio with a real catalog and real events sees an empty or useless רכש, and proposes the fewest questions a product has to answer for the screen to fill itself.

## What exists, and why the screen is empty

The reduction is right and self-checked (`lib/suppliers/procurement.ts`). The screen is empty because of what it is FED. Traced:

**1. Every row is "owned", and an owned row never becomes an order.**
`CategoryDef.defaultStock` is set on 5 of 44 categories (`lib/catalog/categories.ts:175,182,193–195` — centrepieces, arrangements, the three cut-flower kinds); the other 39 seed `owned` (`product-drawer.tsx:101` `blankProduct`), the base library writes nothing and lands as `owned` (`lib/catalog/db-mapping.ts:129`), and a marketplace copy takes the category default (`lib/marketplace/actions.ts:194`). An owned row reaches only the מלאי table (`procurement.ts:255–275`): peak demand, "לא נספר" when `stockQty` is absent, no supplier, no cost, no "שליחת הזמנה" (`procurement-tab.tsx:330` sends only `order`/`rentals` groups with a `supplierId`). So the typical catalog — chairs, tables, cloths, chandeliers, stage, drapes, all owned by default, none counted — produces a table of numbers with "לא נספר" in every row and nothing to send. The screen is "in use" and says nothing.

**2. A consumable without a supplier sinks into "ללא ספק", which cannot be sent.**
`group()` sorts the unsourced group last (`procurement.ts:178–188`); the tab offers a per-LINE Select (`SupplierPick`, `procurement-tab.tsx:120`) and no send. A derived candle line (`derived:…`, `demand.ts:137`) never gets a Select. The drawer's supplier field is a Select of suppliers that already exist (`product-drawer.tsx:566`) — a new supplier is made only on `/suppliers`, so the first product is saved before the first supplier exists, with "ללא ספק".

**3. The event gate is five steps, and the screen still names the old one.**
Only `events.confirmedAt` feeds the order (`demand.ts:245`); `confirmEvent` refuses before a quote has been issued (`event-booking-card.tsx:27`). So per event: a date, a drawing, an issued quote, the "הלקוח אישר" button, AND a date inside the window — whose default is the current calendar month (`procurement-tab.tsx:31,136`), while a confirmed wedding is usually months out. The empty state (`procurement-tab.tsx:303`) still says "הצעת מחיר חתומה", which is no longer the gate.

**4. The other two tabs fill only from the first.** הזמנות is empty until a group was sent (`orders-tab.tsx:57`); הוצאות is typed by hand (the "expense from a delivered order" of the 10-14 spec §4 was not built).

**5. Nothing outside the drawer shows the state.** No card chip, no catalog filter, no count of "rows without a supplier"; the CSV export is the only place the kinds are seen together (`lib/catalog/csv.ts:183`).

**Preconditions per product today** for a line to land in a sendable group with a real total: kind ≠ owned, a supplier, a cost — and `orderUnit`+`orderFactor` when the supplier sells otherwise (5 fields). For an owned row to say anything: `stockQty` (1 field, on every chair and cloth). Per event: 4 facts + the window.

### The drawer's רכש ועלות block, audited (`product-drawer.tsx:1057–1190`)

Seven controls: ספק (Select), עלות, סוג המלאי (3-way), כמה יש במחסן (owned only), the "איך הספק מוכר את זה?" box (two fields, shown to everyone), plus the marketplace source line. The section hint and the three `STOCK_KIND_HINT`s (`lib/catalog/types.ts:339`) explain the REDUCTION ("ברכש נבדק השיא — כמה צריך ביום העמוס ביותר") rather than ask the designer's question; "בבעלות / מתכלה / בהשכרה" are accounting words. The order-unit box is for florists and fabric sellers, and sits open under every lamp and sofa. In the meeting the block is hidden with "מחיר, ספק ומלאי משלימים אחר כך" (`:973`) — and afterwards nothing reminds anyone.

### "Waste"

No פחת exists anywhere in the code. What exists is `packing_spares` (event × variant, typed on the packing list, `lib/outputs/actions.ts:26`), which procurement adds to demand (`demand.ts:268`). A flower spec's stems are derived from rows (`lib/catalog/flowers.ts`). So "waste" today is a number typed per event, per row, on the day of packing — too late for an order and never remembered for the next event.

## The one idea

**A product answers one question: מאיפה זה מגיע לאירוע? — and nothing else is required.** The three answers are the three `StockKind`s already in the schema, re-worded as the designer thinks them:

| chip | stored | what it does downstream (unchanged reduction) |
| --- | --- | --- |
| **מהמחסן שלי** | `owned` | the busiest day against "כמה יש" (מלאי); counts "לא נספר" until a count is typed; equipment readiness per event |
| **שוכרים לאירוע** | `rented` | one order line per event under its supplier (השכרות); sendable |
| **קונים לכל אירוע** | `consumable` | summed over the window under its supplier (להזמין); sendable; spares and derived candles ride along |

Everything else is CONDITIONAL on that chip, so the block is two rows for most of the catalog:

- מהמחסן שלי → **כמה יש** (optional; "לא נספר" is a real answer and stays one).
- שוכרים / קונים → **ספק** (Select with an inline **"+ ספק חדש"** that asks a name only, saves through `saveSupplier`, selects it) and **עלות** beside it.
- Under the supplier, one disclosure link: **"הספק מוכר ביחידה אחרת"** → the two order fields. Opened by default only where `category.flowers` or `priceUnit !== "unit"`. (Labels as they are now — they were rewritten once and read well.)
- `costPrice` stays what the STUDIO pays, two sections from `unitPrice`, inside `check:costs`' boundary. Nothing moves across it.

No field is required. No migration. The three `STOCK_KIND_LABEL`/`HINT`s are rewritten (hint = the consequence in the designer's words: "ברכש תראו כמה חסר ביום עמוס", "יופיע בהזמנה לספק לכל אירוע", "יסוכם להזמנה אחת לטווח"), and the section hint says the question, not the two-numbers warning.

### Defaults by category — so the chip is right before anyone touches it

| default | categories | why |
| --- | --- | --- |
| קונים לכל אירוע | flowers, greenery, dried-flowers, centerpieces, flower-arrangements (as today) | used up |
| שוכרים לאירוע | **none** | which categories a studio rents is the studio's, not the category's (a chuppah is owned by one, rented by the next); guessing wrong is worse than owned, because a rental line without a supplier is a "ללא ספק" row forever |
| מהמחסן שלי | everything else (as today) | and `stockQty` stays optional |

The marketplace copy keeps setting the category default (`addToCatalog`) and already links the supplier; the base library stays uncounted owned. What changes is not the default but how cheaply it is corrected — the next two sections.

## The catalog shows and fixes the state in bulk

- **A chip on every card** (title row, muted): מחסן · שוכרים · קונים, plus "ללא ספק" in alert ink on a rented/consumable row without one. Clicking it opens the same three-way as a `Popover`, nothing else.
- **A catalog filter** "רכש": ללא ספק · ללא ספירה · לפי מקור. (`filters.tsx` already carries category/layer filters.)
- **Bulk on a selection**: the catalog's multi-select (exists for export) gains a bar: "סמנו כ…" (the three chips) and "שייכו ספק" (Select + "+ ספק חדש"). One `saveProducts` batch. This is how a studio that rents its chairs says so once for 14 rows.

## The suppliers screen is never blank

**רכש opens with a SETUP strip, derived from the catalog, before the forecast** — the forecast's honesty lines (`notices`, `procurement-tab.tsx:166`) extended to the catalog side, each one a button:

- "12 פריטים שקונים או שוכרים — בלי ספק · שייכו ספק" → the catalog filtered to them, bulk bar open.
- "38 פריטים מהמחסן שלא נספרו" (quiet; "לא נספר" is allowed) → the catalog filtered.
- "7 אירועים עם הצעת מחיר, ממתינים לאישור הלקוח · 2 מאושרים בטווח" → `/production`.
- The empty state's text says the real gate: "אירוע מאושר (הלקוח אישר) ומצויר". "הצעת מחיר חתומה" goes.

**The "ללא ספק" group gets a GROUP-level Select** ("שייכו את כל השורות ל…", with "+ ספק חדש") beside the per-line one, so one phone call's worth of rows is one click. Derived candle lines keep "נגזר" until "נר" is a real product (still the open item of the 08-16 spec; offer "הוסיפו נר לקטלוג" on that line later).

**The window default becomes "30 הימים הקרובים"** (`presetRange("next30")`), and the strip says how many confirmed events lie beyond it ("עוד 5 אירועים מאושרים אחרי הטווח").

**Tabs.** Recommended: **רכש · הזמנות · ספקים · הוצאות**, רכש the default — the derived tab first, the typed ledger last. Not merging הזמנות into רכש: an order is a snapshot with a supplier's answer, the forecast keeps moving under it; two lists, two tenses. הוצאות fills itself one notch more when a delivered order offers "רישום הוצאה" with amount and supplier prefilled (10-14 spec §4, small).

## Waste: a rule on the product, never a log

**Recommended: `Product.spareRate` (פחת, a percentage) on consumables only.** "Order 10% more roses than the plan counts" is a fact about the product like `orderFactor`, not a record of what was used — procurement multiplies `orderQuantity` by `1 + spareRate` and prints "+10% פחת" on the line; readiness and the packing list's derived rows see the same number. It is derived-friendly, remembered across events, and lives where the florist already set the stems. Default absent (= 0); a category default for the flowers group (DECIDE 4). `packing_spares` stays what it is — the crew's per-event extras, typed on the day — and the two add, never replace. No "how much did I use" anywhere, as CLAUDE.md requires.

Not recommended: a spare percentage per event (typed again every time), or deriving waste from past orders vs plans (an order is edited by hand before sending; the delta is not waste).

## DECIDE

1. **The three words.** מהמחסן שלי / שוכרים לאירוע / קונים לכל אירוע (recommended) — or keep בבעלות / בהשכרה / מתכלה with new hints only.
2. **Rented defaults.** None by category (recommended) — or a studio-level "we rent: chairs, drapes, chandeliers" setting that seeds new rows (one more place to configure; worth it only if Ravid's own studio rents most furniture).
3. **Tab order and default.** רכש first (recommended) — or keep ספקים first.
4. **פחת.** Per-product percent on consumables, with a flowers-group default of 10% (recommended) — or absent by default, typed per product — or not at all (keep per-event spares only).
5. **The catalog chip.** On every card (recommended) — or only in the "רכש" filter view, to keep the card quiet.
6. **Inline supplier.** Name only in the drawer (recommended; phone and "what they supply" on `/suppliers` later) — or the full `SupplierDrawer` stacked over the product drawer.

## Sequence and size

1. **Drawer block** — re-word the three kinds and hints, make supplier/cost/count conditional, fold the order-unit box behind a disclosure, inline "+ ספק חדש". Small; no migration. `check:costs` unchanged.
2. **Procurement tab** — setup strip (one server read: counts by kind × supplier × stockQty, plus confirmed/pending events), group-level assign, next-30 default, the empty-state wording, tab order. Medium.
3. **Catalog** — card chip, "רכש" filter, bulk bar (kind + supplier). Medium.
4. **פחת** — `products.spare_rate numeric(5,2)`, one migration; `ProcurementItem.spareRate`; `orderQuantity` and readiness read it; the drawer field under the flowers spec. Small, after DECIDE 4.
5. **Expense from a delivered order** — `OrdersTab` menu → `ExpenseDrawer` prefilled. Small.
6. Later: "נר" as a real product for the derived line; a supplier's `supplies` text used to suggest a supplier per category.

Checks touched: `check:procurement` (spare rate case), `check:readiness`, `check:costs` (nothing crosses), `typecheck`.
