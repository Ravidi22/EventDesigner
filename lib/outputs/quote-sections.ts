// THE QUOTE IS READ BY AREA, NOT BY CATALOG CATEGORY — and in the client's words, not the catalog's.
//
// A client reads a quote the way the designer walks them through the event: the חופה, the path, the
// seventeen rectangular tables and what stands on each, the bar, the ceiling, the chairs. The first
// quote this app printed grouped everything by catalog category (מפות, פמוטים, כיסאות…) — an
// inventory, in which a client could not find "the round tables" anywhere. The studios' own Word
// quotes are organised the other way and always were.
//
// Every section is DERIVED from the drawing, so it cannot drift from the plan — which is the one
// thing a hand-typed quote always gets wrong (two entrance tables in the spec, four in the prices):
//
//   • a zone the event occupies other than its main room (the חופה, the path) → one section, all of it
//   • in the main room, one section per TABLE KIT — units carrying identical dressing on the same
//     kind of table (lib/outputs/table-kits.ts) — titled by count and shape ("17 שולחנות מלבניים"),
//     listing what ONE table carries, and naming the chairs round it
//   • the room's own floor items (bars, rugs, curtains) and its ceiling
//   • the chairs, one line per kind, summed over the whole event
//
// What a CLIENT does not read, and so is not here:
//   • the tables themselves — the venue's furniture, not the design. A table's catalog name is also
//     its size ("שולחן מלבן 240×120"), and sizes mean nothing to a couple.
//   • a stage's decks, stairs and skirt — a stage is ONE line, "תוספת במה", priced as the sum of
//     everything it is built from (lib/design-document/stage.ts), with what it includes in words.
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { broughtRodMm, measureTotals, type MeasureContext, type MeasureUnit } from "@/lib/design-document/measure";
import { layStage } from "@/lib/design-document/stage";
import type { NumberedUnit } from "@/lib/design-document/groups";
import { tableKits } from "./table-kits";
import type { QuoteLookup } from "./quote";

export type SectionKind = "zone" | "kit" | "floor" | "ceiling" | "chairs" | "extras";

export interface SectionLine {
  /** `${section}|${variant}` — what the designer's hide/gift choices name. */
  key: string;
  variantId: string;
  productId: string;
  label: string;
  /** The whole event's amount of it in this section. */
  quantity: number;
  /** In a kit: what ONE table carries. The bullet reads per table; the price multiplies the total. */
  perUnit?: number;
  priceUnit: MeasureUnit;
  unitPrice?: number;
  lineTotal: number;
  priced: boolean;
  /** Priced, but some of what it sums has no price (a stage whose skirt row has none). */
  partial?: boolean;
  /** Said after the label, in words: "כולל מדרגות וחצאית". */
  detail?: string;
  categoryOrder: number;
}

export interface QuoteSection {
  /** Stable across edits: zone:<id>, kit:<first table id>, floor, ceiling, chairs, extras. The
   *  designer's titles, notes and photos are keyed on it. */
  key: string;
  kind: SectionKind;
  title: string;
  lines: SectionLine[];
  /** A kit's lines are what ONE table carries ("על כל שולחן:"). */
  perTable?: boolean;
  /** A kit's chairs, by name — "נפוליאון · זהב". Said, not priced: the chairs section prices them. */
  seating?: string[];
}

export interface SectionZone {
  id: string;
  name: string;
  /** The event's document narrowed to what stands in this zone (lib/outputs/zone-sheets.ts). */
  doc: DesignDocumentContent;
}

export interface SectionOptions {
  lookup: QuoteLookup;
  ctx?: MeasureContext;
  /** One per zone with something in it. Absent or one → the whole event is one room. */
  zones?: SectionZone[];
  /** The chair round a table (lib/catalog/chairs.ts) — injected so this file stays catalog-free. */
  chairOf?: (table: DesignTable) => string | undefined;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Category id of the hung items that read as part of the ROOM, not the ceiling: a curtain is
 *  drawn on the ceiling layer because it hangs, but a client thinks of it beside the bar and rug. */
const ROOM_ON_CEILING = new Set(["curtains"]);
// An LED strip rides a rail as a curtain does (spec 2026-11-07 §7.1) and lights the room's walls and
// edges — the client reads it with the room, by the metre of its lines.
ROOM_ON_CEILING.add("led-strips");

/** What a stage includes, said in words, by the catalog category of its parts. */
const STAGE_PARTS: Record<string, string> = {
  "stage-stairs": "מדרגות",
  "stage-skirts": "חצאית",
  "stage-benches": "בנקט",
  "stage-barriers": "מעקה",
  "stage-backdrops": "קיר רקע",
  "stage-ramps": "רמפה",
  "stage-surfaces": "ציפוי",
};

// ── Table words ────────────────────────────────────────────────────────────────────────────────

/** Singular and plural adjective for a table's shape. Keys are what is left of a table type or name
 *  once its size and the word "שולחן" are taken off. */
const SHAPES: Record<string, [string, string]> = {
  round: ["עגול", "עגולים"],
  rectangle: ["מלבני", "מלבניים"],
  square: ["מרובע", "מרובעים"],
  עגול: ["עגול", "עגולים"],
  מלבן: ["מלבני", "מלבניים"],
  מלבני: ["מלבני", "מלבניים"],
  מרובע: ["מרובע", "מרובעים"],
  ריבועי: ["מרובע", "מרובעים"],
  מעוגל: ["מעוגל", "מעוגלים"],
  "מעוגל צד": ["מעוגל צד", "מעוגלי צד"],
  אובלי: ["אובלי", "אובליים"],
  אליפסה: ["אליפסה", "אליפסה"],
};

/** "שולחן מלבן 240×120" → ["מלבני", "מלבניים"]; an unknown word is kept as it is, size removed. */
export function tableShapeWords(type: string): [string, string] {
  const bare = type
    .replace(/[\d.,]+\s*[×xX*/]\s*[\d.,]+/g, " ")
    .replace(/\d+([.,]\d+)?\s*(ס["״]?מ|מ["׳']|cm|m)?/gi, " ")
    .replace(/^\s*(שולחן|שולחנות)(?=\s|$)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!bare) return ["", ""];
  return SHAPES[bare] ?? SHAPES[bare.toLowerCase()] ?? [bare, bare];
}

/** "17 שולחנות מלבניים", "שולחן אביר", "שולחן ראש", "שולחן עגול". */
export function kitName(units: readonly NumberedUnit[], tables: readonly DesignTable[]): string {
  const n = units.length;
  // A head table first: two tables pushed together for the couple are their head table, not a
  // knights' table.
  if (n === 1 && !units[0].unnumbered && units[0].number === 0) return "שולחן ראש";
  if (units.every((u) => u.tableIds.length > 1)) return n === 1 ? "שולחן אביר" : `${n} שולחנות אביר`;
  const [one, many] = tableShapeWords(tables[0]?.type ?? "");
  if (n === 1) return one ? `שולחן ${one}` : "שולחן";
  return many ? `${n} שולחנות ${many}` : `${n} שולחנות`;
}

// ── Lines ──────────────────────────────────────────────────────────────────────────────────────

function linesOf(sectionKey: string, totals: Map<string, number>, opts: SectionOptions, units = 1): SectionLine[] {
  const out: SectionLine[] = [];
  for (const [variantId, quantity] of totals) {
    if (quantity <= 0) continue;
    const info = opts.lookup(variantId);
    if (!info) continue;
    out.push({
      key: `${sectionKey}|${variantId}`,
      variantId,
      productId: info.productId,
      label: info.label,
      quantity,
      perUnit: units > 1 ? round2(quantity / units) : undefined,
      priceUnit: info.priceUnit ?? "unit",
      unitPrice: info.unitPrice,
      lineTotal: round2((info.unitPrice ?? 0) * quantity),
      priced: typeof info.unitPrice === "number",
      categoryOrder: info.categoryOrder,
    });
  }
  return out.sort((a, b) => a.categoryOrder - b.categoryOrder || a.label.localeCompare(b.label, "he"));
}

function addTo(map: Map<string, number>, variantId: string, amount: number) {
  map.set(variantId, round2((map.get(variantId) ?? 0) + amount));
}

const ctxOf = (opts: SectionOptions): MeasureContext => opts.ctx ?? { unitOf: (v) => opts.lookup(v)?.priceUnit ?? "unit" };

/** Every stage among `placements` as ONE line: "תוספת במה", priced as the sum of the decks, stairs,
 *  skirt and finishes it is built from, saying what it includes. */
function stagesLine(sectionKey: string, doc: DesignDocumentContent, stages: Placement[], opts: SectionOptions): SectionLine | null {
  if (stages.length === 0) return null;
  const parts = measureTotals({ ...doc, tables: [], placements: stages }, ctxOf(opts));
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  const includes = new Set<string>();
  for (const [variantId, quantity] of parts) {
    const info = opts.lookup(variantId);
    if (!info) continue;
    const word = STAGE_PARTS[info.categoryId];
    if (word) includes.add(word);
    if (typeof info.unitPrice === "number") {
      total += info.unitPrice * quantity;
      priced++;
    } else unpriced++;
  }
  // A rim piece the studio does not have yet (a quarter-round, a curved deck) has no price either:
  // the line is a partial sum until the piece is in the catalog.
  const deckOf = ctxOf(opts).deckOf;
  if (deckOf && stages.some((p) => p.stage && layStage(p.stage, deckOf).missing.length > 0)) unpriced++;
  const n = stages.reduce((s, p) => s + p.quantity, 0);
  const words = [...includes];
  const detail = words.length ? `כולל ${words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} ו${words[words.length - 1]}`}` : undefined;
  return {
    key: `${sectionKey}|stages`,
    variantId: stages[0].variantId,
    productId: opts.lookup(stages[0].variantId)?.productId ?? "",
    label: n === 1 ? "תוספת במה" : "תוספת במות",
    quantity: n,
    priceUnit: "unit",
    unitPrice: priced ? round2(total / n) : undefined,
    lineTotal: round2(total),
    priced: priced > 0,
    partial: priced > 0 && unpriced > 0,
    detail,
    categoryOrder: -1,
  };
}

/** Lines for loose things standing in a place (not on a table): stages folded into one line. */
function placeLines(sectionKey: string, doc: DesignDocumentContent, placements: Placement[], opts: SectionOptions): SectionLine[] {
  const stages = placements.filter((p) => p.stage);
  const rest = placements.filter((p) => !p.stage);
  const lines = withAisles(withRods(linesOf(sectionKey, measureTotals({ ...doc, tables: [], placements: rest }, ctxOf(opts)), opts), rest, opts), rest, opts);
  const stage = stagesLine(sectionKey, doc, stages, opts);
  return stage ? [stage, ...lines] : lines;
}

/** A curtain on a free-standing ROD brings its rod (spec 2026-11-07 §6.2, the stage's skirt
 *  pattern): measureTotals billed the rod's metres to the studio's rod row; here they are folded into
 *  the CURTAIN's line — its total, and "כולל מוט 6 מ׳" in words — and the rod row's own line goes.
 *  With no rod row (or one with no price) the curtain's line says it is partial. */
function withRods(lines: SectionLine[], placements: Placement[], opts: SectionOptions): SectionLine[] {
  const ctx = ctxOf(opts);
  // What each curtain BRINGS — a bare rod (a placement of the rod's own row) is its own line.
  const rodMm = new Map<string, number>();
  for (const p of placements) {
    const mm = broughtRodMm(p, ctx) * p.quantity;
    if (mm > 0) rodMm.set(p.variantId, (rodMm.get(p.variantId) ?? 0) + mm);
  }
  if (rodMm.size === 0) return lines;
  const rod = ctx.rodOf?.();
  const rodInfo = rod ? opts.lookup(rod) : undefined;
  const rodUnit = rod ? ctx.unitOf(rod) : "m";
  const price = typeof rodInfo?.unitPrice === "number" ? rodInfo.unitPrice : undefined;
  let folded = 0;
  const out = lines.map((l) => {
    const mm = rodMm.get(l.variantId);
    if (!mm || l.variantId === rod) return l;
    const count = placements.filter((p) => p.variantId === l.variantId && broughtRodMm(p, ctx) > 0).reduce((n, p) => n + p.quantity, 0);
    const amount = rodUnit === "unit" ? count : round2(mm / 1000);
    if (rod) folded += amount;
    const metres = (mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1);
    return {
      ...l,
      lineTotal: round2(l.lineTotal + (price ?? 0) * (rod ? amount : 0)),
      partial: l.partial || !rod || price === undefined,
      detail: [l.detail, `כולל מוט ${metres} מ׳`].filter(Boolean).join(" · "),
    };
  });
  // The rod row's own line keeps only what was NOT folded (a rod someone placed on its own).
  return out.flatMap((l) => {
    if (!rod || l.variantId !== rod || folded <= 0) return [l];
    const quantity = round2(l.quantity - folded);
    return quantity > 0 ? [{ ...l, quantity, lineTotal: round2((l.unitPrice ?? 0) * quantity) }] : [];
  });
}

/** AN AISLE is one line (lib/catalog/aisle.ts — the stage's pattern, and the rod's): measureTotals
 *  counted N of the piece that lines it (and of that piece's vase) under those rows; here they are
 *  folded into the AISLE's line — its total, and "14 × קופסת ורדים" in words — and the piece's own line
 *  keeps only what stands on the plan by itself. An aisle whose row has no price of its own is priced
 *  by what lines it; a piece with no price leaves the line partial. */
function withAisles(lines: SectionLine[], placements: Placement[], opts: SectionOptions): SectionLine[] {
  const ctx = ctxOf(opts);
  if (!ctx.aisleOf) return lines;
  // Per aisle row: what its placements bring, by the row brought.
  const brought = new Map<string, Map<string, number>>();
  for (const p of placements) {
    for (const part of ctx.aisleOf(p) ?? []) {
      const mine = brought.get(p.variantId) ?? new Map<string, number>();
      mine.set(part.variantId, (mine.get(part.variantId) ?? 0) + part.count * p.quantity);
      brought.set(p.variantId, mine);
    }
  }
  if (brought.size === 0) return lines;
  const folded = new Map<string, number>();
  const out = lines.map((l) => {
    const parts = brought.get(l.variantId);
    if (!parts) return l;
    let extra = 0;
    let unpriced = 0;
    const words: string[] = [];
    for (const [variantId, count] of parts) {
      const info = opts.lookup(variantId);
      folded.set(variantId, (folded.get(variantId) ?? 0) + count);
      if (typeof info?.unitPrice === "number") extra += info.unitPrice * count;
      else unpriced++;
      if (info) words.push(`${count} × ${info.label}`);
    }
    const lineTotal = round2(l.lineTotal + extra);
    const priced = l.priced || unpriced < parts.size;
    return {
      ...l,
      lineTotal,
      priced,
      // The price of one (or of a metre) is the whole of it over its amount — what an itemised quote prints.
      unitPrice: priced && l.quantity > 0 ? round2(lineTotal / l.quantity) : l.unitPrice,
      partial: l.partial || (priced && unpriced > 0) || undefined,
      detail: [l.detail, ...words].filter(Boolean).join(" · "),
    };
  });
  // A piece's own line keeps only what was NOT folded into an aisle.
  return out.flatMap((l) => {
    const taken = brought.has(l.variantId) ? 0 : (folded.get(l.variantId) ?? 0);
    if (taken <= 0) return [l];
    const quantity = round2(l.quantity - taken);
    return quantity > 0 ? [{ ...l, quantity, lineTotal: round2((l.unitPrice ?? 0) * quantity) }] : [];
  });
}

/** The sections of one ROOM: kits, floor, ceiling — and its chairs, returned apart so the caller
 *  can gather every room's chairs into one section. */
function roomSections(doc: DesignDocumentContent, opts: SectionOptions, chairs: Map<string, number>): QuoteSection[] {
  const sections: QuoteSection[] = [];
  const tableById = new Map(doc.tables.map((t) => [t.id, t]));
  const seat = (tables: readonly DesignTable[]) => {
    const kinds = new Set<string>();
    if (!opts.chairOf) return kinds;
    for (const t of tables) {
      const seats = t.seats ?? 0;
      const chair = seats > 0 ? opts.chairOf(t) : undefined;
      if (!chair) continue;
      addTo(chairs, chair, seats);
      kinds.add(chair);
    }
    return kinds;
  };

  // Kits, split once more by the KIND of table: tableKits compares dressing only, and a round and a
  // rectangular table carrying the same centrepiece are two different things to a client. Split by
  // the shape WORD, not the catalog row — a 240 and a 480 rectangle are both "מלבניים" to a couple.
  const dressed = new Set<string>();
  for (const kit of tableKits(doc, opts.ctx?.vesselOf)) {
    const byShape = new Map<string, NumberedUnit[]>();
    for (const u of kit.units) {
      const members = u.tableIds.map((id) => tableById.get(id)).filter((t): t is DesignTable => !!t);
      const shape = u.tableIds.length > 1 ? "block" : tableShapeWords(members[0]?.type ?? "")[1];
      byShape.set(shape, [...(byShape.get(shape) ?? []), u]);
    }
    for (const group of byShape.values()) {
      const ids = new Set(group.flatMap((u) => u.tableIds));
      for (const id of ids) dressed.add(id);
      const tables = doc.tables.filter((t) => ids.has(t.id));
      const key = `kit:${group[0].tableIds[0]}`;
      // tables: [] — the tables themselves are the venue's furniture, not part of the design.
      const sub: DesignDocumentContent = {
        ...doc,
        tables: [],
        placements: doc.placements.filter((p) => p.layer === "table" && p.tableId && ids.has(p.tableId)),
      };
      const lines = linesOf(key, measureTotals(sub, ctxOf(opts)), opts, group.length);
      const kinds = seat(tables);
      if (lines.length === 0) continue;
      sections.push({
        key,
        kind: "kit",
        title: `עיצוב ${kitName(group, tables)}`,
        lines,
        perTable: group.length > 1,
        seating: [...kinds].map((c) => opts.lookup(c)?.label ?? "").filter(Boolean),
      });
    }
  }
  // Undressed tables seat people too.
  seat(doc.tables.filter((t) => !dressed.has(t.id)));

  // Everything that is not on a dressed table. A table item whose table is gone is still billed —
  // in the room, never dropped.
  const rest = doc.placements.filter((p) => !(p.layer === "table" && p.tableId && dressed.has(p.tableId)));
  const ceilingOf = (p: Placement) => p.layer === "ceiling" && !ROOM_ON_CEILING.has(opts.lookup(p.variantId)?.categoryId ?? "");
  const floor = placeLines("floor", doc, rest.filter((p) => !ceilingOf(p)), opts);
  if (floor.length) sections.push({ key: "floor", kind: "floor", title: "עיצוב האולם", lines: floor });
  const ceiling = placeLines("ceiling", doc, rest.filter(ceilingOf), opts);
  if (ceiling.length) sections.push({ key: "ceiling", kind: "ceiling", title: "עיצוב תקרה", lines: ceiling });
  return sections;
}

/** The quote's sections, in reading order: the event's other zones first (a ceremony comes before
 *  dinner), then the main room, then the chairs. */
export function quoteSections(doc: DesignDocumentContent, opts: SectionOptions): QuoteSection[] {
  const zones = opts.zones && opts.zones.length > 1 ? opts.zones : null;
  // The main room is the zone with the most tables. With no tables anywhere every zone is a
  // section of its own — there is no room to break down.
  let hall: SectionZone | null = null;
  if (zones) for (const z of zones) if (z.doc.tables.length > 0 && (!hall || z.doc.tables.length > hall.doc.tables.length)) hall = z;

  const sections: QuoteSection[] = [];
  const chairs = new Map<string, number>();
  if (zones) {
    for (const z of zones) {
      if (z === hall) continue;
      const key = `zone:${z.id}`;
      // A zone's own tables seat people; their chairs join the event's chairs.
      if (opts.chairOf) for (const t of z.doc.tables) {
        const chair = (t.seats ?? 0) > 0 ? opts.chairOf(t) : undefined;
        if (chair) addTo(chairs, chair, t.seats!);
      }
      const lines = placeLines(key, z.doc, z.doc.placements, opts);
      if (lines.length) sections.push({ key, kind: "zone", title: `עיצוב ${z.name || "אזור"}`, lines });
    }
  }
  const room = hall ? hall.doc : zones ? null : doc;
  if (room) sections.push(...roomSections(room, opts, chairs));
  const chairLines = linesOf("chairs", chairs, opts);
  if (chairLines.length) sections.push({ key: "chairs", kind: "chairs", title: "כסאות", lines: chairLines });
  return sections;
}
