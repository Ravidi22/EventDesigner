// DESIGN KITS — the link between the placement map and the table details.
//
// A crew lays a room table by table, and the question at every table is "what goes on this one?".
// The plan used to answer it on a separate page (the legend, by table number), so every table was a
// trip to the back of the set. A kit is every numbered unit carrying the SAME dressing; it gets a
// letter, the letter is printed on the plan beside the table's number, and a detail sheet draws
// that kit once at a scale you can set a table from. Forty tables in three kits is three detail
// sheets, not forty — the crew needs to see each arrangement once and know where it repeats.
//
// Over numbered units, like placementLegend: a block of four pushed-together tables is one unit
// with one number and one kit. Letters are assigned over the WHOLE event, never per zone, so kit ב
// is kit ב on every sheet of the set.
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { byUnitOrder, numberedUnits, type NumberedUnit } from "../design-document/groups";
import { besideTablesWords, seatCount, type SeatLookups } from "../design-document/seat-count";

export const KIT_LETTERS = "אבגדהוזחטיכלמנסעפצקרשת";

export interface KitItem {
  variantId: string;
  /** Per unit — what one table of this kit carries. */
  quantity: number;
}

export interface TableKit {
  /** The dressing's signature — a stable id for "which kits get a detail sheet" across renders. */
  key: string;
  letter: string;
  units: NumberedUnit[];
  items: KitItem[];
  /** How much a crew gains from seeing this kit drawn large. */
  score: number;
  /** Suggested for a detail sheet: an arrangement too involved to set from a list. */
  recommended: boolean;
}

/** Shapes a crew sets without thinking about orientation. Anything else — a crescent head table, a
 *  serpentine, a ח — has a front and a back, and its dressing has to be read off a drawing. */
const PLAIN_TYPES = new Set(["round", "rectangle", "square"]);

/** `vesselOf` (lib/catalog/vessel.ts): the vase an arrangement stands in, which the kit carries as an
 *  item of its own — the same flowers in a gold jug and in a glass one are two kits, and the detail
 *  sheet lists the jug. Absent = only what each placement names (`Placement.vessel`). */
export function tableKits(doc: DesignDocumentContent, vesselOf?: (p: Placement) => string | undefined): TableKit[] {
  const byKey = new Map<string, Omit<TableKit, "letter">>();
  const tableById = new Map(doc.tables.map((t) => [t.id, t]));
  for (const unit of numberedUnits(doc)) {
    const ids = new Set(unit.tableIds);
    const counts = new Map<string, number>();
    let pieces = 0;
    for (const p of doc.placements) {
      if (p.layer !== "table" || !p.tableId || !ids.has(p.tableId)) continue;
      counts.set(p.variantId, (counts.get(p.variantId) ?? 0) + p.quantity);
      pieces += 1;
      const vessel = vesselOf ? vesselOf(p) : (p.vessel ?? undefined);
      if (vessel) counts.set(vessel, (counts.get(vessel) ?? 0) + p.quantity);
    }
    if (counts.size === 0) continue; // an undressed table belongs to no kit and wears no letter
    const items = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([variantId, quantity]) => ({ variantId, quantity }));
    const key = items.map((i) => `${i.variantId}×${i.quantity}`).join("|");
    const members = unit.tableIds.map((id) => tableById.get(id)).filter((t): t is DesignTable => !!t);
    const block = members.length > 1;
    const shaped = members.some((t) => !PLAIN_TYPES.has(t.type));
    const arranged = members.some((t) => t.arranged);
    // An unnumbered table's stored number is not its name — it is no head table for being 0.
    const head = !unit.unnumbered && unit.number === 0;
    const score = pieces + items.length + (block ? 3 : 0) + (shaped ? 2 : 0) + (arranged ? 2 : 0) + (head ? 2 : 0);
    const kit = byKey.get(key) ?? { key, units: [], items, score: 0, recommended: false };
    kit.units.push(unit);
    kit.score = Math.max(kit.score, score);
    // A head table, a block, or anything scoring past a plain table with a centrepiece and a
    // runner (3 pieces, 3 items = 6) is worth a sheet of its own.
    kit.recommended = kit.recommended || block || head || score >= 7;
    byKey.set(key, kit);
  }
  return [...byKey.values()]
    .map((k) => ({ ...k, units: k.units.sort(byUnitOrder) }))
    .sort((a, b) => byUnitOrder(a.units[0], b.units[0]))
    .map((k, i) => ({
      ...k,
      letter: i < KIT_LETTERS.length ? KIT_LETTERS[i] : `${KIT_LETTERS[i % KIT_LETTERS.length]}${Math.floor(i / KIT_LETTERS.length) + 1}`,
    }));
}

/** "24 שולחנות · 240 מקומות" — the tables counted over numbered units (a block is one table), the
 *  places as everyone who sits in the drawing (lib/design-document/seat-count.ts: the tables, the
 *  banquettes and the sofas — the studio's readout's number). `detail` adds where the places that are
 *  not at a table are, "(מהם 20 על ספות ובנקטים)" — for a sheet with room for it, never a title-block
 *  cell. Empty when nobody sits and there are no tables, so a sheet with nothing to count prints no
 *  cell for it. */
export function seatingSummary(doc: DesignDocumentContent, lookups: SeatLookups, opts: { detail?: boolean } = {}): string {
  const units = numberedUnits(doc).length;
  const c = seatCount(doc, lookups);
  if (units === 0 && c.total === 0) return "";
  const rest = c.benches + c.sofas;
  const places = c.total ? `${c.total} מקומות${opts.detail && rest > 0 ? ` (מהם ${rest} ${besideTablesWords(c)})` : ""}` : "";
  return [units ? `${units} ${units === 1 ? "שולחן" : "שולחנות"}` : "", places].filter(Boolean).join(" · ");
}

const num = (n: number) => (n === 0 ? "ראש" : String(n));

/** Compress table numbers into ranges: [1,2,3,5] → "1–3, 5".
 *
 *  Sorted and de-duplicated here rather than trusted to arrive that way, and the head table (0) is
 *  never part of a range: it is a NAME, and 0 sitting next to 1 used to print "ראש–3". A range is
 *  isolated left-to-right (LRI … PDI): in a Hebrew line the bidi algorithm otherwise reads the dash
 *  between two numbers as right-to-left and prints "1–5" as "5–1". */
export function formatTables(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = sorted.includes(0) ? [num(0)] : [];
  const seq = sorted.filter((n) => n !== 0);
  for (let i = 0; i < seq.length; ) {
    let j = i;
    while (j + 1 < seq.length && seq[j + 1] === seq[j] + 1) j++;
    parts.push(i === j ? num(seq[i]) : `⁦${num(seq[i])}–${num(seq[j])}⁩`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** "שולחן 4", "שולחנות 1–3, 5", "שולחנות 1–3 ועוד 2 ללא מספר" — a set of table units in words,
 *  for every printed line that says which tables something applies to. A table out of the numbering
 *  (DesignTable.unnumbered) has no number to print and is COUNTED instead, so it is never silently
 *  missing from the line, and never printed under a number it does not wear on the plan. */
export function tablesPhrase(units: readonly { number: number; unnumbered?: boolean }[]): string {
  const numbered = [...new Set(units.filter((u) => !u.unnumbered).map((u) => u.number))];
  const loose = units.filter((u) => u.unnumbered).length;
  const base = numbered.length === 0 ? "" : numbered.length === 1 ? `שולחן ${num(numbered[0])}` : `שולחנות ${formatTables(numbered)}`;
  if (!loose) return base;
  const tail = `${loose === 1 ? "שולחן" : `${loose} שולחנות`} ללא מספר`;
  return base ? `${base} ועוד ${loose === 1 ? "אחד" : loose} ללא מספר` : tail;
}

/** Table id → its kit's letter, for the plan. */
export function kitLetters(kits: TableKit[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of kits) for (const u of k.units) for (const id of u.tableIds) out.set(id, k.letter);
  return out;
}
