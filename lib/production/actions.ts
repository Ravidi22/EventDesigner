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
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import {
  designDocuments,
  eventLikedImages,
  eventZones,
  events,
  exports,
  issuedQuotes,
} from "@/lib/db/schema";
import { fetchCheckpointOffsets } from "@/lib/settings/actions";
import { ROLE_CAPABILITIES } from "@/lib/team/types";
import { grantedVenueIds } from "@/lib/venues/granted";
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

  const [eventRows, zoneRows, likedRows, docRows, packingRows, quoteRows, offsets] = await Promise.all([
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
  ]);

  const zoned = new Set(zoneRows.map((r) => r.eventId));
  const liked = new Set(likedRows.map((r) => r.eventId));
  const versionByEvent = new Map(docRows.map((r) => [r.eventId, r.version]));
  const packedByEvent = new Map(packingRows.map((r) => [r.eventId, r.createdAt]));
  const quoteByEvent = new Map(quoteRows.map((r) => [r.eventId, r]));

  // The crew role sees the work and never the money (ROLE_CAPABILITIES). Decided once, here, rather
  // than left to whichever component renders the column: a price withheld by a `hidden` class is a
  // price that already travelled to the browser.
  const showsMoney = ROLE_CAPABILITIES[actor.role].money;

  const facts: EventFacts[] = eventRows.map((e) => {
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
      // F-7.4, as two integers rather than a JSON comparison: issuing a quote SEALS the version it
      // names, so a current version above it means the drawing genuinely moved on afterwards and
      // never merely that a float rendered differently. An event with no quote has nothing to have
      // changed since, and alertFor() checks quoteSentAt again before it says anything.
      designChangedSinceQuote:
        quote !== undefined && version !== undefined && version > quote.documentVersion,
      quoteTotal: showsMoney && quote ? toMoney(quote.total) : undefined,
    };
  });

  return buildRunway(facts, offsets, today());
}
