"use server";
// The production runway, assembled from rows the studio already produced by doing the work.
//
// runway.ts holds the logic and the argument for the screen; this file is the other half of that
// argument. If nothing on the runway may be a status somebody has to remember to set, then every
// checkpoint has to be READ from something that exists as a side effect of the work — zones chosen,
// a gallery pass, a drawing, an issued quote, an exported packing list. So this module gathers
// facts and does nothing else: a handful of set-based queries and one assembly pass, with no policy
// of its own beyond who is allowed to see what.
//
// ── ONE QUERY PER TABLE, NEVER ONE PER EVENT ───────────────────────────────────────────────────
//
// The obvious shape — for each event ask "does it have zones? a gallery pass? a drawing?" — is six
// round trips per row, and a studio with a season on screen would spend hundreds of them against a
// hosted database where the ROUND TRIP is the cost, not the query. Every read below is set-based
// and they all leave together, the same shape fetchEvents and fetchProcurement use.
//
// The two tables with no organizationId of their own (event_zones, event_liked_images) are scoped
// by a SUBQUERY over the events this caller may see rather than by ids taken from the first
// result — which is what keeps them inside the same Promise.all instead of behind a waterfall.
//
// ── VENUE SCOPE: DELIBERATELY NOT THE SIDEBAR'S VENUE ──────────────────────────────────────────
//
// This screen is NOT filtered to the property the sidebar has selected, and that is a fix rather
// than an omission. A designer's book of business spans properties: the Gantt this replaces filtered
// by the active venue, so "what is late" was silently answered as "what is late at חוות רונית", and
// an event at the hall you were not looking at could run out of runway unseen. Nothing here reads
// the active venue at all.
//
// It IS filtered by GRANT. A member who cannot open a property does not get its events here either —
// the clients, deadlines and quote totals of a hall nobody granted them are exactly the business
// data lib/venues/access.ts exists to withhold, and a venue query scoped by organizationId alone is
// the bug that rule was written against. Events with no venue yet are visible to everyone: there is
// no property to be denied, and a lead with no hall picked is the most open thing on the screen.
//
// ⚠ INTERNAL, AND IT CARRIES A PRICE. `Runway` includes each event's quote total, so this module
// must never be imported by /present, the client portal, /meeting or /outputs. It holds no COST, so
// `npm run check:costs` does not name it — but "no prices in a room with a client in it" is the
// same rule, and the crew role, whose entire line is "מפות הצבה ורשימות הובלה בלבד — בלי מחירים",
// is refused the total below rather than trusted to look away.
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { revalidateProduction } from "@/lib/db/revalidate";
import {
  designDocuments,
  eventCrew,
  eventLikedImages,
  eventZones,
  events,
  exports,
  issuedQuotes,
  orderLines,
  orders,
  sketchProposals,
  suppliers,
  users,
} from "@/lib/db/schema";
import { assertEventOwned } from "@/lib/events/ownership";
import { fetchCheckpointOffsets } from "@/lib/settings/actions";
import { ROLE_CAPABILITIES } from "@/lib/team/types";
import { grantedVenueIds } from "@/lib/venues/granted";
import { assembleDemands } from "@/lib/suppliers/demand";
import type { OrderStatus } from "@/lib/orders/types";
import { readiness, type OrderedLine, type Readiness } from "./readiness";
import { buildRunway, type EventFacts, type Runway } from "./runway";

/** Today, as the SERVER's calendar day. `toISOString().slice(0,10)` would be the UTC day, which is
 *  yesterday for anyone working after 9pm in Israel — and here that is not cosmetic: every
 *  checkpoint on this screen is due relative to this one string, so three hours of drift would
 *  report a whole studio as a day further behind every evening and quietly correct itself by
 *  morning. Same helper, same reason, as lib/venues/actions.ts and lib/auth/actions.ts. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join("-");
}

/** Postgres `numeric` arrives as a STRING — arbitrary precision, so the driver will not narrow it
 *  behind your back. Same converter and same reasoning as lib/quotes/actions.ts: these are shekels
 *  and a double holds them exactly at any total a quote reaches. An unparseable value becomes "no
 *  total" rather than 0, because a row that confidently reads ₪0 is worse than a blank one. */
function toMoney(v: string | null): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Every event this caller may see, with what the runway needs to know about each.
 *
 * ⚠ UNBOUNDED BY DESIGN — no date window, no limit. `closed` is a real lane with a real count in
 * the filter bar, so a window would make that number a lie about the studio's own history, and a
 * silent truncation is the failure mode this codebase argues against everywhere else (see the note
 * on EXPENSE_LIMIT). fetchEvents already ships the same set to the dashboard, so this is not a new
 * payload; the day a studio has enough history for it to hurt, the closed lane is the half to
 * window, and the screen will have to say that it did.
 */
export async function fetchRunway(): Promise<Runway> {
  const actor = await currentActor();
  const organizationId = actor.organizationId;
  const database = db();

  // null = "every property in the studio" (an owner). A list, possibly empty, for everyone else.
  const allowed = await grantedVenueIds(actor);
  const reachable =
    allowed === null
      ? undefined
      : allowed.length
        ? or(isNull(events.venueId), inArray(events.venueId, allowed))
        : // No grants at all: only the events that have not been placed anywhere yet. `inArray`
          // against an empty list is a needless "false" in the SQL, and saying the intent outright
          // is clearer than trusting the driver to fold it away.
          isNull(events.venueId);
  const scope = and(eq(events.organizationId, organizationId), reachable);

  // A FUNCTION rather than one shared builder: each `inArray` renders the query it is handed, and
  // passing the same object to four of them is a subtlety nobody should have to hold in their head.
  const scopedEventIds = () => database.select({ id: events.id }).from(events).where(scope);

  const [eventRows, zoneRows, likedRows, docRows, packingRows, mapRows, proposalRows, quoteRows, offsets, crewRows, orderRows] = await Promise.all([
    database
      .select({
        id: events.id,
        clientName: events.clientName,
        zonesLabel: events.zonesLabel,
        guests: events.guests,
        eventDate: events.eventDate,
        setupDate: events.setupDate,
        venueId: events.venueId,
        quoteSentAt: events.quoteSentAt,
        confirmedAt: events.confirmedAt,
        lostAt: events.lostAt,
        archived: events.archived,
      })
      .from(events)
      .where(scope),

    // "Has this event chosen its zones" — the row existing is the whole answer, so DISTINCT rather
    // than the ordered list fetchEvents needs. event_zones carries no organizationId; the subquery
    // is what scopes it, the same way packing_spares is scoped in fetchProcurement.
    database
      .selectDistinct({ eventId: eventZones.eventId })
      .from(eventZones)
      .where(inArray(eventZones.eventId, scopedEventIds())),

    // "Has a gallery pass happened" — one liked image is the evidence. Nobody likes a photo without
    // having sat through the rail with the client, which is exactly why this is derivable and the
    // "mark the stage as done" switch it replaces was not.
    database
      .selectDistinct({ eventId: eventLikedImages.eventId })
      .from(eventLikedImages)
      .where(inArray(eventLikedImages.eventId, scopedEventIds())),

    // The CURRENT drawing version per event — the highest, which is the one still being edited.
    // DISTINCT ON does it in one query; reading every version and picking in JS would ship every
    // sealed copy of every document in the studio to answer a boolean and an integer. Same idiom,
    // same reason, as fetchProcurement's document read.
    database
      .selectDistinctOn([designDocuments.eventId], {
        eventId: designDocuments.eventId,
        version: designDocuments.version,
      })
      .from(designDocuments)
      .where(
        and(
          eq(designDocuments.organizationId, organizationId),
          inArray(designDocuments.eventId, scopedEventIds()),
        ),
      )
      .orderBy(designDocuments.eventId, desc(designDocuments.version)),

    // The FIRST packing list exported for each event, not the most recent one.
    //
    // The checkpoint asks whether the list has been produced, and its stamp answers "when did this
    // stop being outstanding" — which is the earliest export, once and for all. A latest-wins stamp
    // would creep forward every time a designer reprints after moving a table, so an event whose
    // list was pulled three weeks early would report as having been done the day before the wedding.
    // Nothing here asks "is the sheet in the crew's hand current"; that is a different question and
    // `exports.number` on the outputs screen already answers it.
    database
      .selectDistinctOn([exports.eventId], {
        eventId: exports.eventId,
        createdAt: exports.createdAt,
      })
      .from(exports)
      .where(
        and(
          eq(exports.organizationId, organizationId),
          eq(exports.type, "packing_list"),
          inArray(exports.eventId, scopedEventIds()),
        ),
      )
      .orderBy(exports.eventId, asc(exports.createdAt)),

    // The first placement-map set, by the same reasoning.
    database
      .selectDistinctOn([exports.eventId], {
        eventId: exports.eventId,
        createdAt: exports.createdAt,
      })
      .from(exports)
      .where(
        and(
          eq(exports.organizationId, organizationId),
          eq(exports.type, "placement_map"),
          inArray(exports.eventId, scopedEventIds()),
        ),
      )
      .orderBy(exports.eventId, asc(exports.createdAt)),

    // The client's changes nobody has answered yet (lib/proposals): the EARLIEST submitted one per
    // event, since "how long have they been waiting" is what the designer wants to know.
    database
      .selectDistinctOn([sketchProposals.eventId], {
        eventId: sketchProposals.eventId,
        submittedAt: sketchProposals.submittedAt,
      })
      .from(sketchProposals)
      .where(
        and(
          eq(sketchProposals.organizationId, organizationId),
          eq(sketchProposals.status, "submitted"),
          inArray(sketchProposals.eventId, scopedEventIds()),
        ),
      )
      .orderBy(sketchProposals.eventId, asc(sketchProposals.submittedAt)),

    // One row per event — issued_quotes is keyed on eventId, because re-issuing overwrites.
    database
      .select({
        eventId: issuedQuotes.eventId,
        documentVersion: issuedQuotes.documentVersion,
        total: issuedQuotes.total,
      })
      .from(issuedQuotes)
      .where(
        and(
          eq(issuedQuotes.organizationId, organizationId),
          inArray(issuedQuotes.eventId, scopedEventIds()),
        ),
      ),

    fetchCheckpointOffsets(),

    // Who is on each truck — names joined here so the row and the collision band can say them.
    database
      .select({ eventId: eventCrew.eventId, userId: eventCrew.userId, name: users.name, email: users.email })
      .from(eventCrew)
      .innerJoin(users, eq(users.id, eventCrew.userId))
      .where(and(eq(eventCrew.organizationId, organizationId), inArray(eventCrew.eventId, scopedEventIds()))),

    // Every order the studio sent, with its window and the supplier's answer. Matched to events
    // by DATE below (an order covers a window, not an event), so one read serves every row.
    database
      .select({ windowFrom: orders.windowFrom, windowTo: orders.windowTo, status: orders.status })
      .from(orders)
      .where(eq(orders.organizationId, organizationId)),
  ]);

  const crewByEvent = new Map<string, { id: string; name: string }[]>();
  for (const r of crewRows) {
    const list = crewByEvent.get(r.eventId) ?? [];
    list.push({ id: r.userId, name: r.name?.trim() || r.email.split("@")[0] });
    crewByEvent.set(r.eventId, list);
  }
  const ordersFor = (date: string | null) => {
    if (!date) return undefined;
    const o = { confirmed: 0, open: 0, declined: 0 };
    for (const r of orderRows) {
      if (r.windowFrom > date || r.windowTo < date) continue;
      if (r.status === "declined") o.declined++;
      else if (r.status === "sent") o.open++;
      else o.confirmed++;
    }
    return o;
  };

  const zoned = new Set(zoneRows.map((r) => r.eventId));
  const liked = new Set(likedRows.map((r) => r.eventId));
  const versionByEvent = new Map(docRows.map((r) => [r.eventId, r.version]));
  const packedByEvent = new Map(packingRows.map((r) => [r.eventId, r.createdAt]));
  const mappedByEvent = new Map(mapRows.map((r) => [r.eventId, r.createdAt]));
  const askedByEvent = new Map(proposalRows.map((r) => [r.eventId, r.submittedAt]));
  const quoteByEvent = new Map(quoteRows.map((r) => [r.eventId, r]));

  // The crew role sees the work and never the money (ROLE_CAPABILITIES). Decided once, here, rather
  // than left to whichever component renders the column: a price withheld by a `hidden` class is a
  // price that already travelled to the browser.
  const showsMoney = ROLE_CAPABILITIES[actor.role].money;

  // A crew member's runway is the events they are on — the rest of the book is not their job, and
  // the money column was already withheld from them above.
  const mine = actor.role === "crew" && actor.userId ? actor.userId : null;
  const visibleRows = mine ? eventRows.filter((e) => crewByEvent.get(e.id)?.some((c) => c.id === mine)) : eventRows;

  const facts: EventFacts[] = visibleRows.map((e) => {
    const version = versionByEvent.get(e.id);
    const quote = quoteByEvent.get(e.id);
    return {
      id: e.id,
      clientName: e.clientName,
      zonesLabel: e.zonesLabel,
      guests: e.guests,
      // `event_date` is a Postgres `date` and arrives as a plain "yyyy-mm-dd"; it stays a string the
      // whole way through, and runway.ts does its day arithmetic on the parsed parts. Nothing here
      // builds a Date out of a calendar day — see the note at the top of lib/events/db-mapping.ts
      // for what that costs anyone west of Greenwich. "" is the app's "no date yet", which keeps an
      // event off the time axis without dropping it out of the list.
      date: e.eventDate ?? "",
      setupDate: e.setupDate ?? undefined,
      venueId: e.venueId ?? undefined,
      hasZones: zoned.has(e.id),
      hasGallery: liked.has(e.id),
      hasDesign: version !== undefined,
      // These three ARE instants, and the app carries instants as epoch ms because it compares and
      // sorts them and never formats them in another timezone.
      quoteSentAt: e.quoteSentAt?.getTime(),
      confirmedAt: e.confirmedAt?.getTime(),
      lostAt: e.lostAt?.getTime(),
      archived: e.archived,
      packingExportedAt: packedByEvent.get(e.id)?.getTime(),
      mapExportedAt: mappedByEvent.get(e.id)?.getTime(),
      proposalPendingSince: askedByEvent.get(e.id)?.getTime(),
      // F-7.4, as two integers rather than a JSON comparison: issuing a quote SEALS the version it
      // names, so a current version above it means the drawing genuinely moved on afterwards and
      // never merely that a float rendered differently. An event with no quote has nothing to have
      // changed since, and alertFor() checks quoteSentAt again before it says anything.
      designChangedSinceQuote:
        quote !== undefined && version !== undefined && version > quote.documentVersion,
      quoteTotal: showsMoney && quote ? toMoney(quote.total) : undefined,
      crew: crewByEvent.get(e.id),
      orders: ordersFor(e.eventDate),
    };
  });

  return buildRunway(facts, offsets, today());
}

/**
 * Who is on this event's truck. Replaces the list wholesale — the dialog edits it as a unit.
 *
 * Owner or designer only: a crew member does not assign crew. Every id is checked against the
 * studio's own members (kind = studio, same organisation) — a foreign key proves a user EXISTS,
 * never that they work here.
 */
export async function setEventCrew(eventId: string, userIds: string[]): Promise<void> {
  const actor = await currentActor();
  if (actor.role === "crew") throw new Error("crew cannot assign crew");
  if (!Array.isArray(userIds) || userIds.length > 50) throw new Error("bad userIds");
  const organizationId = actor.organizationId;
  await assertEventOwned(organizationId, eventId);
  const database = db();
  const members = userIds.length
    ? await database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.organizationId, organizationId), eq(users.kind, "studio"), inArray(users.id, userIds)))
    : [];
  await database.transaction(async (tx) => {
    await tx.delete(eventCrew).where(and(eq(eventCrew.eventId, eventId), eq(eventCrew.organizationId, organizationId)));
    if (members.length) {
      await tx.insert(eventCrew).values(members.map((m) => ({ eventId, userId: m.id, organizationId })));
    }
  });
  revalidateProduction();
}

// ── One event's production ─────────────────────────────────────────────────────────────────────

export interface ExportStamp {
  number: number;
  documentVersion: number;
  /** Epoch ms. */
  at: number;
}

/** What the event drawer's production section shows — every line derived, none typed, no price. */
export interface EventProduction {
  crew: { id: string; name: string }[];
  /** The orders whose window covers the event's day, by supplier. Counts and answers only: the
   *  lines' cost stays in lib/orders. */
  orders: { id: string; supplierName: string; status: OrderStatus; lines: number; reply: string; sentAt: number }[];
  /** Null when there is no date or no drawing to count from. */
  readiness: Readiness | null;
  /** A drape fell back to its catalog width because the venue's walls could not be read. */
  measured: boolean;
  outputs: {
    currentVersion?: number;
    packing?: ExportStamp;
    map?: ExportStamp;
    quote?: ExportStamp;
  };
  /** Epoch ms since the client's unanswered changes were sent. */
  proposalSince?: number;
}

/**
 * The production facts of one event, read when its drawer opens.
 *
 * Heavier than a runway row on purpose — it reduces the event's drawing (and the drawings of the
 * other events standing on the same day, for the stock peak) through the same demand assembly the
 * procurement forecast uses (lib/suppliers/demand.ts) — and read for one event at a time, which is
 * what makes that affordable.
 */
export async function fetchEventProduction(eventId: string): Promise<EventProduction> {
  const actor = await currentActor();
  const organizationId = actor.organizationId;
  await assertEventOwned(organizationId, eventId);
  const database = db();

  const [event] = await database
    .select({ id: events.id, clientName: events.clientName, eventDate: events.eventDate, venueId: events.venueId, confirmedAt: events.confirmedAt })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizationId, organizationId)));
  if (!event) throw new Error("event not found");
  const date = event.eventDate;

  const [crewRows, orderRows, exportRows, docRows, proposalRows, dayRows] = await Promise.all([
    database
      .select({ userId: eventCrew.userId, name: users.name, email: users.email })
      .from(eventCrew)
      .innerJoin(users, eq(users.id, eventCrew.userId))
      .where(and(eq(eventCrew.organizationId, organizationId), eq(eventCrew.eventId, eventId))),

    date
      ? database
          .select({ id: orders.id, supplierName: suppliers.name, status: orders.status, reply: orders.reply, sentAt: orders.sentAt })
          .from(orders)
          .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
          .where(and(eq(orders.organizationId, organizationId), lte(orders.windowFrom, date), gte(orders.windowTo, date)))
          .orderBy(desc(orders.sentAt))
      : Promise.resolve([]),

    // The LATEST sheet of each kind — "is the paper in the crew's hand current" is this question,
    // the opposite of the runway's "was it ever produced" (which reads the first).
    database
      .selectDistinctOn([exports.type], { type: exports.type, number: exports.number, documentVersion: exports.documentVersion, createdAt: exports.createdAt })
      .from(exports)
      .where(and(eq(exports.organizationId, organizationId), eq(exports.eventId, eventId)))
      .orderBy(exports.type, desc(exports.number)),

    database
      .select({ version: designDocuments.version })
      .from(designDocuments)
      .where(and(eq(designDocuments.organizationId, organizationId), eq(designDocuments.eventId, eventId)))
      .orderBy(desc(designDocuments.version))
      .limit(1),

    database
      .select({ submittedAt: sketchProposals.submittedAt })
      .from(sketchProposals)
      .where(and(eq(sketchProposals.organizationId, organizationId), eq(sketchProposals.eventId, eventId), eq(sketchProposals.status, "submitted")))
      .orderBy(asc(sketchProposals.submittedAt))
      .limit(1),

    // Everything standing on the same day: this event, and the others the client has booked —
    // the stock has to cover all of them at once.
    date
      ? database
          .select({ id: events.id, clientName: events.clientName, eventDate: events.eventDate, venueId: events.venueId, confirmedAt: events.confirmedAt })
          .from(events)
          .where(and(eq(events.organizationId, organizationId), eq(events.eventDate, date), eq(events.archived, false), isNull(events.lostAt)))
      : Promise.resolve([]),
  ]);

  const lineRows = orderRows.length
    ? await database
        .select({ orderId: orderLines.orderId, variantId: orderLines.variantId, quantity: orderLines.quantity })
        .from(orderLines)
        .where(inArray(orderLines.orderId, orderRows.map((o) => o.id)))
    : [];
  const linesPerOrder = new Map<string, number>();
  const statusOf = new Map(orderRows.map((o) => [o.id, o.status]));
  const ordered = new Map<string, OrderedLine[]>();
  for (const l of lineRows) {
    linesPerOrder.set(l.orderId, (linesPerOrder.get(l.orderId) ?? 0) + 1);
    const list = ordered.get(l.variantId) ?? [];
    list.push({ variantId: l.variantId, quantity: Number(l.quantity), status: statusOf.get(l.orderId) ?? "sent" });
    ordered.set(l.variantId, list);
  }

  // The day's demand. This event is reduced whatever its state (the drawer is asking about IT);
  // the others count against the stock only once the client has booked them, as procurement does.
  let readinessOf: Readiness | null = null;
  let measured = true;
  if (date) {
    const rows = dayRows.some((r) => r.id === eventId) ? dayRows : [event, ...dayRows];
    const { demands, lookup } = await assembleDemands(actor, rows);
    const mine = demands.find((d) => d.eventId === eventId);
    if (mine?.drawn) {
      measured = mine.measured;
      const elsewhere = new Map<string, number>();
      for (const d of demands) {
        if (d.eventId === eventId || !d.committed) continue;
        for (const r of d.rows) elsewhere.set(r.variantId, (elsewhere.get(r.variantId) ?? 0) + r.quantity);
      }
      readinessOf = readiness(mine.rows, elsewhere, lookup, ordered);
    }
  }

  const stamp = (type: "packing_list" | "placement_map" | "quote"): ExportStamp | undefined => {
    const r = exportRows.find((x) => x.type === type);
    return r ? { number: r.number, documentVersion: r.documentVersion, at: r.createdAt.getTime() } : undefined;
  };

  return {
    crew: crewRows.map((r) => ({ id: r.userId, name: r.name?.trim() || r.email.split("@")[0] })),
    orders: orderRows.map((o) => ({
      id: o.id,
      supplierName: o.supplierName,
      status: o.status,
      lines: linesPerOrder.get(o.id) ?? 0,
      reply: o.reply,
      sentAt: o.sentAt.getTime(),
    })),
    readiness: readinessOf,
    measured,
    outputs: {
      currentVersion: docRows[0]?.version,
      packing: stamp("packing_list"),
      map: stamp("placement_map"),
      quote: stamp("quote"),
    },
    proposalSince: proposalRows[0]?.submittedAt?.getTime(),
  };
}
