# הזמנה, חשבונית, קבלה: the billing documents — design

Version 1.0 | 2026-10-30 | **Phase 1 built** on the recommended answers (migration 0023, applied to `develop`; `npm run db:verify:billing` walks the chain in a throwaway organisation; `check:billing` holds the rules). Phase 2 — the signature, "מסמך ממוחשב" and consents, the allocation API, the uniform-format export, the client portal's "אישור" — is not built. A definition, written to be argued with. Each **DECIDE** is a product call only Ravid can make; each **VERIFY** is a point of Israeli bookkeeping law the studio's accountant should confirm before the first real document goes out — this document cites the regulations, it is not legal advice. Companion to [2026-10-16 client side](2026-10-16-client-side-design.md) §6 row 3 ("the quote as a page, and אישור is the client's button") and [2026-10-14 marketplace & production](2026-10-14-supplier-marketplace-and-production-design.md), whose `confirmedAt` this formalises.

Ravid, 2026-10-30: *"I want to add חשבונית and הזמנה — help me define and structure it, see what needs to be done and how it needs to work so it will be valid and legal."*

## 0. What exists

- **The quote** is a derived document over the drawing (`lib/outputs/quote-sections.ts`) with the designer's choices on top (`QuoteLayout`, `lib/quotes/layout.ts`), autosaved to `quote_drafts` and copied into `issued_quotes` on issue — ONE row per event, re-issuing overwrites, the drawing it was made from sealed as a `design_documents` version. It prints and shares as a browser-built PDF (`quote-pdf.ts`, ADR-9 amendment). The studio's letterhead, ע.מ/ח.פ, VAT rate (`0.18`), "prices include VAT", signature image, validity days and terms are `studio_settings` (`BusinessSettings`, `lib/settings/types.ts`).
- **"The client said yes"** is `events.confirmedAt` — the one typed fact on the production runway, written by `confirmEvent` with no document behind it. A sent quote is not a commitment (lib/suppliers learned that the hard way), and a confirmation today is a timestamp with no number, no signature and no terms frozen to it.
- **`lib/orders/` already means something else**: a PROCUREMENT order the studio sends a supplier (`orders` + `order_lines`, the רכש tab, the supplier's `/orders` inbox). The word "הזמנה" on screen is theirs. The client's הזמנה cannot share the module or the word without confusion — see DECIDE 1.
- **Expenses are "not bookkeeping"** (docs/roadmap.md: "No invoice numbers, no VAT, no receipts, no reconciliation") — two questions only, what did the job cost and what do I owe the supplier. That line was right for the cost side and stays. This document is the INCOME side, and the income side cannot avoid bookkeeping: the moment a חשבונית מס exists it is a fiscal record the law prescribes field by field.
- **Billing is phase 3** in docs/01 ("חיוב ותשלומים — עד שלב 3") — that meant charging STUDIOS for the SaaS. Invoicing the studio's CLIENTS is a different thing and was never scheduled.
- **The event knows its client by name and phone only** (`events.clientName`, `phone`, `contactName`, `contact2*`). A חשבונית מס needs the client's ADDRESS; one to a business needs its VAT number. Neither exists on the event.
- **`check:costs`** forbids cost-side imports (`lib/suppliers/`, `costPrice`, `lib/orders/`) in `/present`, `app/client`, `app/meeting` and `app/(app)/outputs`. Billing documents carry CLIENT prices only, so they are on the allowed side of that line — and must stay there: an invoice never mentions a cost.

## 1. The legal frame (Israel), as it bears on this app

The governing texts are הוראות מס הכנסה (ניהול פנקסי חשבונות), התשל"ג-1973 and תקנות מס ערך מוסף (ניהול פנקסי חשבונות), התשל"ו-1976, plus חוק מע"מ (allocation numbers, s.38(a1), s.47(a2)) and חוק לצמצום השימוש במזומן. Sources are listed at the end.

### 1.1 The chain of documents, and which are fiscal

| Document | Hebrew | What it records | Fiscal? | Rule |
| --- | --- | --- | --- | --- |
| Quote | הצעת מחיר | an offer | no | none (exists) |
| **Order** | **הזמנה** | the client's yes: what was agreed, at what price, for which date | **no VAT effect, but a BOOK** | ניהול ספרים s.15 (ספר הזמנות): serial number, date received, client name + address, description of the service. תוספת י"א s.2 requires the order book of every service provider whose service is not performed in the client's presence — that is an event studio — at every turnover tier; the entry may be skipped only where the invoice itself already carries the date, client and description at the time the order is received. **VERIFY** which תוספת the studio files under (י"א "נותני שירותים" is the obvious one; a hall is s.3 of the same, with "מספר המנות ותאריך האירוע"). |
| Payment request | חשבון עסקה / דרישת תשלום | "please pay X by date" | no | not a book document; must NOT be titled חשבונית מס and must carry no VAT line a client could deduct |
| **Tax invoice** | **חשבונית מס** | a VAT-bearing sale | **yes** | תקנות מע"מ s.9א + ניהול ספרים s.9 |
| **Receipt** | **קבלה** | money received | **yes** | ניהול ספרים s.5 |
| Tax invoice-receipt | חשבונית מס-קבלה | both, when paid on the spot | yes | 9א(ב): a receipt titled חשבונית מס with all of 9א's fields IS one |
| **Credit note** | **חשבונית זיכוי / הודעת זיכוי** | a reversal of an issued invoice, whole or part | yes | ניהול ספרים s.9(ה): the numbers and dates of the invoices it corrects, the reason, the amounts with and without VAT |

**Who may issue what.** A עוסק מורשה (and every חברה בע"מ) issues חשבונית מס. A **עוסק פטור may not** — they issue קבלה only (and a חשבונית/חשבון עסקה that carries no VAT). An app that lets a פטור print the words "חשבונית מס" prints an unlawful document. So the studio's VAT standing is a SETTING the documents read (§4), and the document kinds offered follow from it.

**When the tax point falls.** For a service, VAT is generally due on RECEIPT of payment (חוק מע"מ s.24), and in practice an event studio invoices each installment as it is paid: a חשבונית מס-קבלה per payment, or a חשבונית מס followed by a קבלה when a business client pays on terms. Hence the default flow in §3: the money arrives, the fiscal document follows, never the other way round. **VERIFY** the studio's own tax point with the accountant (a mixed service + rental business can be on an accrual basis).

### 1.2 What each document must carry

**Every document, printed (not typed in by hand):** the studio's name, address and number (ע.מ / ח.פ / ת.ז), a running serial number, the date. The client's name and address (ניהול ספרים s.9(א)(4), s.5(א)(4) — the address may be omitted only for cash retail sales, which an event is not). A description that identifies the goods/service, the unit, the quantity, the unit price and the total (s.9(א)(5)–(8)).

**חשבונית מס in addition (תקנות מע"מ 9א(א)):** the heading "חשבונית מס", the words "עוסק מורשה" and the VAT registration number, in print; the word **"מקור"** on the original ONLY — every other print says העתק; unit prices stated WITHOUT VAT, or the document stating that prices include it; the total before VAT, the VAT amount labelled "מס ערך מוסף" with its rate, and the total including VAT. A sale to a business client needs the client's VAT number (also what the allocation request sends).

**קבלה in addition (s.5(א)):** the amount, what it is for (or the account credited), and the MEANS of payment in detail — for a cheque: bank, branch, account, cheque number, its date; for a card: the card's type and last digits; for a transfer: the bank and reference — and the recipient's signature unless it goes out as a computerized document.

**הודעת זיכוי (s.9(ה)):** the invoices it corrects (numbers and dates), the reason, the amounts with and without VAT.

**Cash.** חוק לצמצום השימוש במזומן caps cash from a business at the lower of 6,000 ₪ or 10% of the transaction (above 6,000); a cheque must name its payee. A receipt that records "מזומן 20,000" records an offence; the app refuses it with the rule, not a warning.

### 1.3 Numbering, immutability, cancellation

- **One sequence per document kind, with no gaps and no reuse** (ניהול ספרים s.18 on computerized systems, and what every inspector checks first). A number is assigned at the moment of issue and never before — a preview has no number.
- **An issued document never changes.** Not the amount, not the client, not the date, not a typo. A mistake is corrected by a NEW document: a credit note against an invoice, a new order superseding an order.
- **Cancellation (s.23א):** an invoice may be marked "מבוטל" — number kept, original attached to the copies — ONLY if the original never left the studio and it was not yet reported in the periodic VAT return. The app cannot know what was reported, so its rule is narrower and safe: a document that was never sent (`sentAt` null) and was issued inside the current VAT period may be cancelled in place; anything else goes through a credit note.
- **Retention: seven years** from the end of the tax year (s.25(ג)). Nothing in `billing_documents` is ever deleted; an archived event keeps its documents (`on delete restrict`, not cascade).

### 1.4 Sending a document digitally (s.18ב) — the part most studios get wrong

A document emailed or WhatsApped as the ORIGINAL (not a courtesy copy of a paper original) is a **מסמך ממוחשב**, and that is lawful only when ALL of these hold:

1. The words **"מסמך ממוחשב"** appear prominently on it.
2. It is produced automatically from the stored record (no retyping) and signed with the issuer's **approved or secure electronic signature** (חתימה אלקטרונית מאושרת / מאובטחת) — the ISSUER's own, "ולא של גורם אחר". A certificate from a licensed CA (Comsign, PersonalID…), one per studio, renewed yearly.
3. The studio **notified the assessing officer by registered mail** before its first digital document.
4. The recipient **consented in advance**, in writing or electronically, to receive computerized documents from this sender, and the consent is kept.
5. With a SECURE (not CA-approved) signature, payment must be by card in the client's name, a crossed cheque to the studio only, or bank transfer — no cash.

Without these, the lawful path is paper: print **מקור** once, hand or post it, and keep the copy. A PDF of an unsigned invoice sent by WhatsApp is a copy, not an original — common, and not what the regulation permits. **VERIFY** with the accountant whether the studio prefers (a) a CA signature per studio inside this app or (b) a hosted signing arrangement; see DECIDE 2.

### 1.5 חשבוניות ישראל — the allocation number (מספר הקצאה)

- A חשבונית מס / חשבונית מס-קבלה whose amount BEFORE VAT exceeds the threshold must carry a 9-digit allocation number from the Tax Authority, or the BUYER may not deduct the input VAT (חוק מע"מ s.38(a1)). The threshold fell 25,000 (2024) → 20,000 (2025) → 10,000 (Jan–May 2026) → **5,000 ₪ from 1 June 2026**, now fixed in the law with no lower step legislated.
- It is obtained **at issue, before the document is handed over**, from the ITA's Invoices API (REST/JSON, OAuth2 "user restricted": the studio's owner authorises the app once in their Tax Authority account; the app holds a refresh token per studio). Document type codes: 305 tax invoice, 320 tax invoice-receipt, 330 credit invoice, 332 pro-forma (an "allocation APPROVAL" for a חשבון עסקה, which is not a number). The request carries the issuer's VAT number, the document number and dates, the client's VAT number when the client is a dealer, the amounts before discount / discount / net / VAT / gross, optional lines, and the software's ITA registration number (99999999 when none). The response is `Confirmation_number` (0 = failed; 432 wrong customer VAT number, 434 date older than two weeks) and the printed number is its 9 right-most digits. The ITA may REFUSE (from 2025 requests are assessed); the studio then cancels, issues without a number, or asks for a hearing.
- A credit invoice needs none today (recommended: print the cancelled invoice's number on it). A קבלה, a חשבון עסקה and an הזמנה never get one.
- **Private clients:** the rule protects a buyer's input-VAT deduction, which a private person has none of; sources disagree on whether the number is still formally required. The app requests it for EVERY qualifying invoice regardless of client — it costs one API call and removes the question. **VERIFY**.
- Sandbox: `openapi.taxes.gov.il/shaam/tsandbox/Invoices/v1/Approval` through the developer portal; production needs ITA approval of the registered organisation. Until that is wired, the number may be typed by hand (s.47(a2)(2) allows a handwritten number on a paper invoice) — the field exists from day one, the API is a phase.

### 1.6 Software registration (ניהול ספרים s.36, נספח ה')

A program that produces fiscal documents must be REGISTERED with the Tax Authority — unless the business wrote it itself for its own use, which is exactly this app's situation today and stops being so the day a second studio uses it (phase 3 SaaS). Registration requires the **uniform-format export** (קובץ במבנה אחיד, OPENFRMT 1.31: `INI.TXT` + `BKMVDATA.TXT`), checked through the ITA's simulator. So the export is designed in from the start (§4, `lib/billing/openfrmt.ts`): it is also what the accountant wants every month, and the ITA's allocation request fields map onto it one to one. **VERIFY** the "own use" exemption applies to a studio whose software is maintained by a contractor.

### 1.7 VAT

18% since 1 January 2025 and unchanged for 2026 (`studio_settings.vatRate` already says so). A document stores the RATE it was issued at — a rate change must not reprint history.

## 2. The one idea: a billing document is an immutable, numbered SNAPSHOT; the quote stays the thing that moves

The quote is mutable by design (re-issuing overwrites; the drawing changes under it; F-7.4 lights "העיצוב השתנה"). A billing document is the opposite kind of thing: the moment it has a number, nothing about it may move, for seven years. Keeping the two apart is the whole design:

- **`billing_documents` rows are written once.** Every figure, line, name and address is COPIED into the row at issue — from the issued quote, the event, the settings — never recomputed from them later. A Postgres trigger refuses an `UPDATE` to any frozen column (the same enforcement as `sealDocument`, one level lower), and the only columns that may change afterwards are the ones the law lets change after issue: `allocation_number`/`allocation_status` (obtained after the number, before hand-over), `sent_at`/`sent_to`, `cancelled_at`/`cancel_reason` (under §1.3's narrow rule), `pdf_url` (the sealed rendering, written once).
- **Numbers come from `document_counters`**, one row per (organisation, series), taken with `SELECT … FOR UPDATE` inside the same transaction that inserts the document — the only way "no gaps, no duplicates" survives two designers issuing at once. A failed issue rolls the counter back with the row; a document is never numbered and then not stored.
- **Every document names what it follows** (`follows_id`): a receipt its invoice, a credit note the invoice it reverses, an invoice the order it bills against, a superseding order the one it replaces. The chain is how the screen shows an event's money as one story, and how "how much of the order is paid" is derived — summed from receipts, never typed.
- **The drawing is sealed by the ORDER, not by every document.** An הזמנה seals the design version it was agreed on, as `issueQuote` does today (`document_version`), so "העיצוב השתנה מאז ההזמנה" is the same integer comparison the quote has. Invoices and receipts point at the order; they do not seal anything.

Everything typed on a billing document is typed because it is derivable from nothing: a payment that arrived (its means and amount), the client's legal address, the reason for a credit — the same bar `confirmedAt` and crew already pass.

## 3. The flow in the app

### 3.1 The order (הזמנה): the client's yes, written down

1. From the quote screen (client view's "אישור" — the client-side spec's row 3 — or the designer's "הפקת הזמנה") the designer opens **"אישור ההזמנה"**: the issued quote's sections and total as agreed, the client's legal details (name as on the invoice, address, ת.ז/ח.פ — asked here, saved on the event as `billing_name`/`billing_address`/`billing_number`, so the invoices need not ask again), the event date and venue, the **payment schedule** (installments: label, amount or %, due date — pre-filled from `quoteTerms`' "50% במעמד האישור, היתרה 7 ימים לפני" into real dates against `eventDate`; editable; must sum to the total), the cancellation terms, and the signature line.
2. **"הפקה"** (ConfirmDialog, ביטול first) → one transaction: the quote is issued if it is not or has changed (the existing `issueQuote`, so the drawing is sealed), the counter hands out the number, the row is written with every figure copied, `events.confirmedAt` is set (coalesce, as `confirmEvent` does), the PDF is rendered and stored, the runway flips the row to the production plan. A verbal yes still works through `confirmEvent`; the order is the written one.
3. **Sending:** the same share path as the quote (`navigator.share` / WhatsApp / mail when Resend is on), recorded as `sent_at`. An order needs no signature or consent — it is not a fiscal document — but the client's **signature on it is the contract**; DECIDE 4 covers how (print and sign, or an in-portal "אני מאשר/ת" with name, time and IP recorded on the row).
4. **A change after the order** (the client adds a zone, drops the chuppah): a NEW order, "הזמנה מתוקנת", `supersedes` the old one (status `superseded`, number kept, printed with that word); the payment schedule is re-stated with what was already paid shown. Never an edit.
5. **The runway** reads the order where it reads `confirmedAt` today, and gains the schedule: an installment past due with no receipt against it is a row alert ("תשלום שני באיחור — 12,000 ₪"), after the client's unanswered proposal and before a stale quote. Nothing else on the runway changes.

### 3.2 Payment requests (חשבון עסקה / דרישת תשלום) — optional, DECIDE 3

Each installment in the schedule can be sent as a דרישת תשלום a week before its date: the amount, what it is for, how to pay (the studio's bank details — a new setting), the due date. Not fiscal, not VAT-deductible, titled so it cannot be mistaken for an invoice. Some clients' accountants require one before transferring; private clients mostly do not. Recommended: build it, because the runway already knows the date and the amount and the document is the schedule's row printed.

### 3.3 Money in: receipts and invoices

1. **"התקבל תשלום"** on the event's billing section: amount, date, means (מזומן / שיק / העברה / כרטיס / ביט-פייבוקס — each with its s.5 fields: cheque bank-branch-account-number-date, card type + last 4, transfer bank + reference), against which installment, and which document to produce:
   - **חשבונית מס-קבלה** (the default for a עוסק מורשה paid now),
   - **קבלה** alone (a פטור; or a payment on an invoice issued earlier),
   - **חשבונית מס** alone first, קבלה later (business client on terms) — offered from the installment, not from a payment.
2. The cash rule is applied at entry (§1.2), split cash is summed per transaction, and a cheque with no payee name is refused.
3. **"הפקה"** → transaction: number from the kind's counter, the row with the payment's details, the VAT computed from the stored rate on the stored basis (`pricesIncludeVat` decides whether the installment amount is gross or net — the document always prints net, VAT and gross), the allocation number requested when the net exceeds the threshold (§1.5; on refusal the dialog offers the ITA's four options; on API absence, a field to type one), the PDF rendered with "מקור", signed (DECIDE 2), stored; `sent_at` when shared.
4. The event's billing section shows the chain: order total → installments with their requests → receipts/invoices → **balance**, all derived. "שולם במלואו" is a sum, not a checkbox.

### 3.4 Credit notes and cancellation

- "ביטול" on a document that was never sent and is inside the current VAT period marks it `cancelled` (number kept, printed מבוטל across it, s.23א). Anything else: **"חשבונית זיכוי"** against the invoice — the lines to reverse (all, or chosen, or a typed amount), the reason (required), the original's number and date and allocation number printed, the refund's means recorded when money goes back. A credit against a מס-קבלה also records the refund as a negative receipt line so the balance stays honest.

### 3.5 Where it lives

- **Per event:** a "חיוב" `DrawerSection` in the event drawer under "הצעת מחיר ואישור" (the order, the schedule, the balance, the documents, the three verbs), and the same section on /production's drawer. The quote screen's client view gets the "אישור" button (client-side spec row 3).
- **Across events: `/billing` ("הנהלת חשבונות")**, a designer/owner-only route behind `requireDesigner()` and `StudioRole` owner (crew never sees money): every document newest first, filters by month / kind / client / unsent / unpaid, the month's totals (net, VAT, received) for the accountant, **"ייצוא לרואה החשבון"** = the uniform-format file + a CSV for the period, and the counters/settings link. Not a dashboard; a ledger list in the sidebar's style, nothing scrolls sideways.
- **The client portal (phase 2):** the client's documents under their event — the order to approve, requests, the receipts they were sent — read through `lib/client-portal/reads.ts` with the same allow-list discipline as `clientProduct` (the document rows are already price-only, but `check:costs` scans the new folder anyway).

## 4. Data (one migration)

```
studio_settings      + vat_status text not null default 'licensed'   -- 'exempt' (עוסק פטור) | 'licensed' (עוסק מורשה) | 'company' (ח.פ)
                     + bank_details text default ''                   -- printed on a payment request
                     + billing_notice_sent_at timestamptz             -- the s.18ב registered-mail notice: the studio ticks it, with the date
                     + signature_cert jsonb                            -- DECIDE 2: certificate reference, never the key
                     + ita_connection jsonb                            -- refresh token for חשבוניות ישראל, encrypted at rest; null = type the number
events               + billing_name text, billing_address text, billing_number text   -- the client as the invoice names them; asked at the order, kept
document_counters    organization_id, series text, next int           -- pk (organization_id, series); series = kind, or kind+year if DECIDE 5 says so
billing_documents    id, organization_id, event_id (restrict), kind text ('order'|'payment_request'|'tax_invoice'|'receipt'|'tax_invoice_receipt'|'credit'),
                     series text, number int, unique (organization_id, series, number),
                     status text ('issued'|'sent'|'cancelled'|'superseded'),
                     issued_at timestamptz, issued_by uuid, document_date date,        -- date printed; ≤ 14 days old for an allocation
                     follows_id uuid (self),                                           -- the document this one is against
                     design_document_id, document_version int,                         -- orders only: the sealed drawing agreed on
                     customer jsonb  { name, address, number?, email?, phone? }        -- COPIED
                     lines jsonb     [{ key, label, quantity, unit, unitPrice, total, vatRate, gift? }]   -- COPIED from the quote sections / typed
                     totals jsonb    { beforeDiscount, discount, net, vatRate, vat, gross, currency, pricesIncludeVat }
                     schedule jsonb  [{ id, label, amount, dueDate }]                   -- orders and payment requests
                     payment jsonb   { means, amount, date, bank?, branch?, account?, chequeNumber?, chequeDate?, cardType?, last4?, reference? }   -- receipt kinds
                     credit jsonb    { reason, againstNumber, againstDate, againstAllocation }   -- credits
                     allocation_number text, allocation_status text ('n/a'|'pending'|'granted'|'refused'|'manual'), allocation_payload jsonb
                     signed_at timestamptz, signature jsonb,                           -- what was signed, with what, its hash
                     pdf_url text,                                                     -- the sealed rendering, lib/files kind 'document'
                     sent_at timestamptz, sent_to text, cancelled_at timestamptz, cancel_reason text, supersedes_id uuid
                     content_hash text                                                  -- sha256 of the frozen columns, printed small on the page
billing_consents     organization_id, event_id, contact (email/phone), consented_at, via text ('portal'|'paper'|'message'), evidence text
                     -- s.18ב(ד): who agreed to receive computerized documents, kept
```

- **A trigger** `billing_documents_frozen` raises on UPDATE of any column not in the after-issue list (§2). `npm run db:verify:billing` issues, tries to edit, expects the refusal, cancels one, credits one, and reads the counter back.
- **`lib/billing/`**: `types.ts`; `rules.ts` (PURE, `check:billing`: which kinds a `vat_status` may issue, the required fields per kind, VAT arithmetic on `numeric` strings rounded once at 2 decimals — never a float, the same discipline as `vat_rate`; the cash cap; the cancellation rule; the allocation threshold by date; the schedule must sum); `actions.ts` ("use server": `issueDocument`, `recordPayment`, `cancelDocument`, `creditDocument`, `fetchEventBilling`, `fetchLedger`); `number.ts` (the counter inside the transaction); `render.ts` (the document → the printed page's props); `openfrmt.ts` (`check:openfrmt`: INI.TXT + BKMVDATA.TXT per period, record types C100/D110/D120 for documents, lines and receipts, encoded as the spec says — Windows-1255, fixed width); `ita.ts` (the allocation client: OAuth2 refresh, the request from the row, the response onto the row; off until its env vars are set, the same seam shape as `lib/google/config.ts`); `sign.ts` (DECIDE 2).
- **`lib/orders/` is untouched** and keeps the supplier side. The new module is `billing`, never `invoices` or `orders2`.

## 5. The printed document

One component family, `app/(app)/billing/document-page.tsx`, A4, the quote's letterhead and footer (`QuoteDocument`'s cover facts and studio details reused, not copied), printed and photographed into a PDF by the quote's own pipeline (`quote-pdf.ts` generalised to `document-pdf.ts`): the title in words the law asks for ("חשבונית מס", "חשבונית מס / קבלה", "קבלה", "חשבונית זיכוי", "הזמנה", "דרישת תשלום"), **"מקור"** on the first rendering and **"העתק"** on every later print of a fiscal kind, "מסמך ממוחשב" when sent digitally, "מבוטל" across a cancelled one, the number, the dates, the client block, the lines (an order's are the quote's sections in the client's words — never catalog rows, never a deck size, the same rule the quote keeps), net / "מס ערך מוסף 18%" / gross, the payment block on a receipt, the allocation number under its own label, the content hash in the footer. Hebrew RTL, numbers LRI-wrapped (`formatTables`' trick), B&W legible (DESIGN.md), no gradient anywhere on a document an accountant files.

## 6. What this is NOT

- Not payment processing. No card charging, no Bit/PayBox API, no bank feed; a payment is typed by the designer when it arrives. Phase 3 at the earliest.
- Not accounting. No ledger, no double entry, no VAT return, no reconciliation: the uniform file and the monthly CSV go to the accountant, who does that. The expenses side stays "not bookkeeping".
- Not a CRM. The client's legal name and address live on the event, as every other client fact does (docs/01 §לא בונים).
- Not a document editor. A document is produced from the quote and the typed payment; the designer never lays out an invoice.

## 7. DECIDE — the calls only Ravid makes (recommended answer first)

1. **The word.** The client's document is "הזמנה" on screen and `kind: "order"` in `lib/billing/`; the supplier side keeps `lib/orders/` and its screens are relabelled "הזמנות רכש" (the supplier's own inbox stays "הזמנות" — a supplier sees nothing else) · keep both "הזמנות" and live with it · call the client's "אישור הזמנה".
2. **Signing the originals.** (a) A CA-approved signature certificate PER STUDIO (Comsign/PersonalID, a few hundred ₪ a year), uploaded in settings, the app signs each PDF (PAdES) at issue — the studio is the issuer, as s.18ב wants, and the app stays a tool · (b) hand the fiscal kinds (invoice, receipt, credit) to a registered provider's API (Morning / iCount / חשבונית ירוקה) and keep only the order and the requests in-house — least legal risk, least control, a subscription per studio, two numbering systems the accountant must reconcile · (c) paper originals only for now: print מקור, send a courtesy PDF marked העתק. Recommended: (a) for the studio today, with (c) as the lawful fallback until the certificate exists, and the data model identical either way.
3. **Payment requests.** Build them (§3.2) · skip them, the schedule alone.
4. **The client's yes on the order.** In the portal: "אני מאשר/ת את ההזמנה" with name, time, IP and the content hash recorded on the row, and a printed signature line for those who want ink · paper signature only.
5. **Numbering.** One series per kind, continuing forever, starting number typed once per series in settings (a studio moving from another program continues its sequence) · a series per kind per year.
6. **Who sees money.** Owner and designer; crew never (`/billing` and the drawer section hidden by role) · owner only.
7. **The allocation API now or later.** The field now, typed by hand; the API in the second phase, once the ITA developer registration is done (an owner's personal login at the Tax Authority is needed — only Ravid can do that) · the API in phase one.
8. **Private clients and the allocation number.** Request for every qualifying invoice (§1.5) · only when a client VAT number is on the document.

## 8. Sequence

1. **Phase 1 — the order and the money, on paper-grade documents:** migration · `lib/billing/rules.ts` + `check:billing` · counters + the frozen-row trigger + `db:verify:billing` · the client's legal details on the event · the order from the quote (seals the drawing, sets `confirmedAt`) with the schedule · receipts, invoices, invoice-receipts, credits · the printed documents and PDFs (מקור/העתק) · the event drawer's section · `/billing` with the month view and the CSV · the runway's late-installment alert · the allocation number typed by hand.
2. **Phase 2 — digital originals:** the signature (DECIDE 2) · "מסמך ממוחשב" + consents · the ITA allocation API · the uniform-format export + simulator pass · payment requests · the client portal's documents and the "אישור" button.
3. **Phase 3 — the SaaS line:** software registration (s.36) before a second studio issues anything · payments.

## Sources

Regulations (read on wikisource, verify against the current text on nevo / the Tax Authority): [הוראות מס הכנסה (ניהול פנקסי חשבונות), התשל"ג-1973](https://he.wikisource.org/wiki/הוראות_מס_הכנסה_(ניהול_פנקסי_חשבונות)) — s.5 (קבלה), s.9 (חשבונית, 9(ה) הודעת זיכוי), s.15 (ספר הזמנות), s.18ב (מסמך ממוחשב), s.23א (ביטול), s.25 (שמירה), s.36 (רישום תוכנה), תוספת י"א; [תקנות מס ערך מוסף (ניהול פנקסי חשבונות), התשל"ו-1976](https://he.wikisource.org/wiki/הוראות_מס_הכנסה_(ניהול_פנקסי_חשבונות)/מס_ערך_מוסף) — s.9א (חשבונית מס); [nevo copy](https://www.nevo.co.il/law_html/law01/271_019.htm). Computerized documents and the signature: [priority-guru on s.18(ב)](https://www.priority-guru.co.il/חשבוניות-דיגיטליות-ומסמכים-ממוחשבים/), [the 2004 Tax Authority note on electronic signatures](http://rivhit.info/guides/Digital/ElectronicSignatureIRS.pdf), [comsign on digital archiving](https://www.comsign.co.il/tax-regulations-digital-archiving/). Allocation numbers: [lookuptax — the API, codes and thresholds](https://lookuptax.com/docs/einvoicing/israel-invoices-allocation-number-einvoicing-israel), [Morning (Green Invoice) 2026 guide](https://www.greeninvoice.co.il/magazine/israel-invoice/), [Baker Tilly 2026](https://bakertilly.co.il/blog-invoices-2026.html), [Goldfarb on the 1.6.2026 step](https://www.goldfarb.com/he/מודל-חשבוניות-ישראל-מתקדם-שלב-חובת-מס/). Software registration: [gov.il — the software registry](https://www.gov.il/he/service/itc-software-registry-for-computerized-accounting-systems), [gov.il — registering a program](https://www.gov.il/he/service/registration-software-designed-managing-computerized-accounting-system), [the uniform-file simulator](https://www.gov.il/he/service/file-review-simulator). Cash: [Morning on the cash law](https://www.greeninvoice.co.il/magazine/no-cash-law/), [Tax Authority circular 06/2026](https://www.gov.il/BlobFolder/policy/inst-06-2026/he/IncomeTax_inst-06-2026.pdf). VAT rate: [Bizportal on the 2026 budget's 18%](https://www.bizportal.co.il/guides/news/article/20041450).
