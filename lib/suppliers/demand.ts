// The demand of events, as the procurement reduction wants it — assembled from the rows the
// studio already produced by doing the work.
//
// A PLAIN module, not "use server": the two callers are server actions themselves (fetchProcurement
// in ./actions.ts, which reduces a window of events into one order; fetchEventProduction in
// lib/production/actions.ts, which asks what ONE event's day needs), and a demand assembly that was
// an endpoint of its own would be a POST that hands a whole month of drawings to whoever asks.
//
// ⚠ COST SIDE. The item index carries `costPrice`, so this module is under lib/suppliers/ and
// `npm run check:costs` keeps it out of every client-facing surface.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/db/org";
import {
  designDocuments,
  events,
  packingSpares,
  productVariants,
  products,
  suppliers,
  venueStructures,
} from "@/lib/db/schema";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import type { Product } from "@/lib/catalog/types";
import { cleanFlowers } from "@/lib/catalog/flowers";
import { toProducts } from "@/lib/catalog/db-mapping";
import { measureTotals, type MeasureContext, type MeasureUnit } from "@/lib/design-document/measure";
import { nearestWall } from "@/lib/studio/anchor";
import { climbKindOf } from "@/lib/studio/climb-item";
import { vesselOf } from "@/lib/catalog/vessel";
import { deckTypeOf } from "@/lib/design-document/stage";
import { resolveFootprint, footprintBounds } from "@/lib/studio/footprint";
import { wallLengthMm as segmentLengthMm } from "@/lib/studio/geometry";
import { nodeMap, wallPoints, type VenueStructure } from "@/lib/venues/structure";
import { grantedVenueIds } from "@/lib/venues/granted";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { EventDemand, ProcurementItem, ProcurementLookup } from "./procurement";

/** What an event row has to carry to be reduced. The callers select exactly these. */
export interface DemandEventRow {
  id: string;
  clientName: string;
  eventDate: string | null;
  venueId: string | null;
  confirmedAt: Date | null;
}

/** The catalog, as the procurement reduction wants to see it — plus the derived consumables.
 *
 *  A 5-arm candlestick is an OWNED fixture that burns five candles per event (F-6.2, the packing
 *  list's `derived` row). The candle has no catalog row of its own, so it has no supplier and no
 *  cost — but leaving it out would mean the one screen whose job is "what do I need to buy" is
 *  silent about the most obviously consumable thing in the business. So it appears as a synthetic
 *  line under "ללא ספק", which is the honest state: a real quantity, an unanswered supplier.
 *
 *  The synthetic key is prefixed rather than a bare uuid so it can never collide with a variant id
 *  and can never be mistaken for one by anything downstream. */
const derivedKey = (variantId: string, field: string) => `derived:${variantId}:${field}`;

/** The item index, and — per variant id — the derived consumable keys a placement of it fans out
 *  to. Returned together so the demand assembly below and the index can never disagree about
 *  which synthetic rows exist. */
function buildItemIndex(
  catalog: Product[],
  supplierNames: Map<string, string>,
): { index: Map<string, ProcurementItem>; derived: Map<string, string[]> } {
  const index = new Map<string, ProcurementItem>();
  const derived = new Map<string, string[]>();

  for (const product of catalog) {
    const cat = CATEGORY_BY_ID[product.category];
    const categoryLabel = cat?.label ?? product.category;
    const base = {
      categoryLabel,
      stockKind: product.stockKind ?? ("owned" as const),
      supplierId: product.supplierId,
      supplierName: product.supplierId ? supplierNames.get(product.supplierId) : undefined,
      unit: (product.priceUnit ?? "unit") as MeasureUnit,
      orderUnit: product.orderUnit,
      orderFactor: product.orderFactor,
      // פחת: the row's own, else the category's (cut flowers 10%). Meaningful on a consumable only;
      // orderQuantity ignores it on anything else.
      spareRate: product.spareRate ?? cat?.defaultSpareRate,
      costPrice: product.costPrice,
      stockQty: product.stockQty,
    };

    // A placement references a VARIANT, except when the product has none — then the product's own
    // id is the variant id (defaultVariantId). Both keys resolve, exactly as everywhere else.
    index.set(product.id, { ...base, label: product.name });
    for (const v of product.variants) {
      index.set(v.id, { ...base, label: `${product.name} · ${v.name}` });
    }

    // The derived consumable, if this category has a count multiplier with a stated yield.
    const field = cat?.fields.find((f) => f.suffix);
    if (!field?.suffix) continue;
    const ids = [product.id, ...product.variants.map((v) => v.id)];
    const flowers = cat?.flowers ? cleanFlowers(product.flowers) : undefined;

    if (flowers) {
      // A flower spec fans out per FLOWER, not as one "stems" line: the florist is phoned for roses
      // and peonies. Under the arrangement's own supplier, who is the one selling them — and with no
      // cost of their own, because the arrangement's line above already carries what it costs; a
      // cost per rose would price the same flowers twice.
      for (const id of ids) {
        derived.set(
          id,
          flowers.map((f) => {
            const key = derivedKey(id, `flower:${f.id}`);
            index.set(key, {
              label: `${f.name} · ${product.name}`,
              categoryLabel,
              stockKind: "consumable",
              supplierId: base.supplierId,
              supplierName: base.supplierName,
              unit: "unit",
              orderUnit: field.suffix,
              orderFactor: f.qty,
              // The stems lose what the arrangement loses.
              spareRate: base.spareRate,
            });
            return key;
          }),
        );
      }
      continue;
    }

    const count = Number(product.categoryFields?.[field.key] ?? 0);
    if (count > 0) {
      for (const id of ids) {
        const key = derivedKey(id, field.key);
        index.set(key, {
          label: `${field.suffix} · ${product.name}`,
          categoryLabel,
          stockKind: "consumable",
          unit: "unit",
          orderFactor: count,
        });
        derived.set(id, [key]);
      }
    }
  }

  return { index, derived };
}

/** A MeasureContext built from product ROWS rather than the browser's primed catalog cache
 *  (lib/studio/catalog-resolver.ts is client-only). Same three questions, same fallbacks. */
function serverMeasureContext(byVariant: Map<string, Product>, structure?: VenueStructure): MeasureContext {
  const nodes = structure ? nodeMap(structure) : null;
  return {
    unitOf: (variantId) => (byVariant.get(variantId)?.priceUnit ?? "unit") as MeasureUnit,
    wallLengthMm:
      structure && nodes
        ? (wallId) => {
            const wall = structure.walls.find((w) => w.id === wallId);
            const pts = wall ? wallPoints(structure, wall, nodes) : null;
            return pts ? segmentLengthMm(pts.a, pts.b) : undefined;
          }
        : undefined,
    footprintMm: (variantId) => {
      const product = byVariant.get(variantId);
      if (!product) return undefined;
      const b = footprintBounds(resolveFootprint(product));
      return { widthMm: b.w, depthMm: b.h };
    },
    // A stage counts as its decks (lib/design-document/stage.ts) — laid by the same lookup the
    // studio draws them with, so the quote bills the build the designer saw.
    deckOf: (variantId) => {
      const product = byVariant.get(variantId);
      return product ? deckTypeOf(variantId, product) : undefined;
    },
    stagePart: (kind) => {
      const category = ({ stairs: "stage-stairs", bench: "stage-benches", barrier: "stage-barriers", backdrop: "stage-backdrops", ramp: "stage-ramps", skirt: "stage-skirts", chair: "chairs" })[kind];
      for (const [variantId, p] of byVariant) if (p.category === category && !p.archived) return variantId;
      return undefined;
    },
    wallDistance: structure ? (p) => nearestWall(structure, p)?.distanceMm ?? Infinity : undefined,
    climbOf: (variantId) => climbKindOf(byVariant.get(variantId)),
    // An arrangement's vase is stock on the day it stands in (lib/catalog/vessel.ts).
    vesselOf: (p) => vesselOf(p, (id) => byVariant.get(id)),
  };
}

/**
 * One `EventDemand` per event row — its current drawing measured against its venue's real walls,
 * its spares, its derived consumables — plus the item index the demands are read through.
 *
 * Venue access is honoured: a designer who cannot open a property does not get its wall graph, so
 * a drape at that venue falls back to its catalog width. That is a real, quiet mispricing, so the
 * events it happened to are flagged (`measured: false`) and every screen says so.
 */
export async function assembleDemands(
  actor: Actor,
  eventRows: readonly DemandEventRow[],
): Promise<{ demands: EventDemand[]; lookup: ProcurementLookup; byVariant: Map<string, Product> }> {
  const organizationId = actor.organizationId;
  const database = db();

  // The catalog is needed whether or not any event is drawn — an empty report still has to be a
  // valid one — but everything else can be skipped when the window is empty.
  const [productRows, variantRows, supplierRows] = await Promise.all([
    database.select().from(products).where(eq(products.organizationId, organizationId)),
    database.select().from(productVariants).where(eq(productVariants.organizationId, organizationId)),
    database.select().from(suppliers).where(eq(suppliers.organizationId, organizationId)),
  ]);
  const catalog = toProducts(productRows, variantRows);
  const supplierNames = new Map(supplierRows.map((s) => [s.id, s.name]));
  const { index: itemIndex, derived: derivedOf } = buildItemIndex(catalog, supplierNames);
  const lookup = (variantId: string) => itemIndex.get(variantId);

  const byVariant = new Map<string, Product>();
  for (const p of catalog) {
    byVariant.set(p.id, p);
    for (const v of p.variants) byVariant.set(v.id, p);
  }

  if (eventRows.length === 0) return { demands: [], lookup, byVariant };

  const eventIds = eventRows.map((e) => e.id);

  // The CURRENT drawing per event — the highest version, which is the only one the studio is still
  // editing. DISTINCT ON does it in one query; fetching every version and picking in JS would ship
  // every sealed copy of every document in the window.
  const docRows = await database
    .selectDistinctOn([designDocuments.eventId], {
      eventId: designDocuments.eventId,
      content: designDocuments.content,
    })
    .from(designDocuments)
    .where(
      and(eq(designDocuments.organizationId, organizationId), inArray(designDocuments.eventId, eventIds)),
    )
    .orderBy(designDocuments.eventId, desc(designDocuments.version));

  // ⚠ THIS USED TO READ issued_quotes, AND THAT WAS A REAL BUG, not a simplification.
  //
  // `committed` decides what the studio is told to BUY. It was set from "an issued_quotes row
  // exists" — i.e. from a price having left the studio — which is not the same fact as the client
  // agreeing to it, and never was. The comment at the top of procurement.ts argues the point
  // exactly right ("a first meeting is not a reason to buy flowers") and then drew the line one
  // step too early: a sent quote is not a reason to buy flowers either. Until events.confirmed_at
  // existed there was nothing better to read, so this ordered stock against work nobody had booked.
  //
  // It reads the confirmation now. An event with a quote out but no answer stays in `potential`,
  // where the screen renders it greyed and totals it as exposure — which is what it is.
  const [spareRows] = await Promise.all([
    // packing_spares carries no organizationId — it is a leaf of one event, and the join is what
    // scopes it. Same reason as fetchSpares in lib/outputs/actions.ts.
    database
      .select({
        eventId: packingSpares.eventId,
        variantId: packingSpares.variantId,
        quantity: packingSpares.quantity,
      })
      .from(packingSpares)
      .innerJoin(events, eq(events.id, packingSpares.eventId))
      .where(and(inArray(packingSpares.eventId, eventIds), eq(events.organizationId, organizationId))),
  ]);

  // Wall graphs, for the venues this person may actually open.
  const allowed = await grantedVenueIds(actor);
  const wantedVenues = [...new Set(eventRows.map((e) => e.venueId).filter((v): v is string => !!v))].filter(
    (v) => allowed === null || allowed.includes(v),
  );
  const structureRows = wantedVenues.length
    ? await database
        .select({ venueId: venueStructures.venueId, structure: venueStructures.structure })
        .from(venueStructures)
        .where(
          and(
            eq(venueStructures.organizationId, organizationId),
            inArray(venueStructures.venueId, wantedVenues),
          ),
        )
    : [];

  const structureByVenue = new Map(structureRows.map((r) => [r.venueId, r.structure]));
  const docByEvent = new Map(docRows.map((r) => [r.eventId, r.content as DesignDocumentContent]));
  const committedEvents = new Set(eventRows.filter((e) => e.confirmedAt).map((e) => e.id));
  const sparesByEvent = new Map<string, { variantId: string; quantity: number }[]>();
  for (const s of spareRows) {
    const list = sparesByEvent.get(s.eventId) ?? [];
    list.push({ variantId: s.variantId, quantity: s.quantity });
    sparesByEvent.set(s.eventId, list);
  }

  const demands: EventDemand[] = eventRows
    // An event with no date cannot be in a window; the SQL filter already excluded nulls, and this
    // narrows the type for the rest of the function.
    .filter((e): e is typeof e & { eventDate: string } => !!e.eventDate)
    .map((e) => {
      const doc = docByEvent.get(e.id);
      const structure = e.venueId ? structureByVenue.get(e.venueId) : undefined;
      const rows: { variantId: string; quantity: number }[] = [];

      if (doc) {
        const ctx = serverMeasureContext(byVariant, structure);
        const totals = measureTotals(doc, ctx);
        for (const [variantId, quantity] of totals) rows.push({ variantId, quantity });
      }

      // Spares are what the crew brings on top of the plan, and they get bought too.
      for (const spare of sparesByEvent.get(e.id) ?? []) {
        const existing = rows.find((r) => r.variantId === spare.variantId);
        if (existing) existing.quantity += spare.quantity;
        else rows.push({ variantId: spare.variantId, quantity: spare.quantity });
      }

      // Fan the count-multipliers out into their own consumable rows (candles off candlesticks, one
      // row per flower off an arrangement with a spec).
      for (const row of [...rows]) {
        for (const key of derivedOf.get(row.variantId) ?? []) rows.push({ variantId: key, quantity: row.quantity });
      }

      // "Measured" only matters where something is measured rather than counted. An event with no
      // stretch items is fully measured whether or not its plan was reachable.
      const stretched = rows.some((r) => (byVariant.get(r.variantId)?.priceUnit ?? "unit") !== "unit");

      return {
        eventId: e.id,
        label: e.clientName,
        date: e.eventDate,
        committed: committedEvents.has(e.id),
        drawn: !!doc,
        measured: !stretched || !!structure,
        rows,
      };
    });

  return { demands, lookup, byVariant };
}
