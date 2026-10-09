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
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { byUnitOrder, numberedUnits, type NumberedUnit } from "../design-document/groups";
import { isMain } from "../self-check";

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

export function tableKits(doc: DesignDocumentContent): TableKit[] {
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

/** "24 שולחנות · 240 מקומות" — counted over numbered units (a block is one table) and the tables'
 *  own seat counts, which is what the chairs on the plan are drawn from. Empty when there are no
 *  tables, so a sheet with nothing to count prints no cell for it. */
export function seatingSummary(doc: DesignDocumentContent): string {
  const units = numberedUnits(doc).length;
  if (units === 0) return "";
  const seats = doc.tables.reduce((n, t) => n + (t.seats ?? 0), 0);
  return `${units} ${units === 1 ? "שולחן" : "שולחנות"}${seats ? ` · ${seats} מקומות` : ""}`;
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

// ponytail: self-check. Run: npm run check:table-kits
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const t = (id: string, number: number, extra: Partial<DesignTable> = {}) =>
    ({ id, type: "round", number, position: { x: 0, y: 0 }, rotation: 0, ...extra }) as DesignTable;
  const chip = (id: string, tableId: string, variantId: string, quantity = 1) =>
    ({ id, layer: "table", tableId, variantId, quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
  const doc = {
    calibration: { mmPerUnit: 1 },
    tables: [t("a", 1), t("b", 2), t("c", 3), t("h", 0, { type: "arc" }), t("bare", 4), t("g1", 5, { groupId: "G" }), t("g2", 6, { groupId: "G" })],
    groups: [{ id: "G", number: 5 }],
    placements: [
      chip("1", "a", "vase"), chip("2", "a", "candle", 3),
      chip("3", "b", "candle", 3), chip("4", "b", "vase"),
      chip("5", "c", "vase"),
      chip("6", "h", "vase"), chip("7", "h", "garland"),
      chip("8", "g1", "vase", 2),
    ],
  } as unknown as DesignDocumentContent;
  const kits = tableKits(doc);
  const head = kits.find((k) => k.units.some((u) => u.number === 0))!;
  assert(head.letter === "א" && head.recommended, "the head table (number 0) sorts first and is suggested for a detail");
  const pair = kits.find((k) => k.units.length === 2)!;
  assert(pair.units.map((u) => u.number).join() === "1,2", "tables with the same dressing, in any order, share a kit");
  assert(kits.every((k) => !k.units.some((u) => u.number === 4)), "an undressed table is in no kit");
  const block = kits.find((k) => k.units.some((u) => u.tableIds.length === 2))!;
  assert(block.recommended, "a block of pushed-together tables is suggested for a detail");
  assert(!kits.find((k) => k.units.length === 1 && k.units[0].number === 3)!.recommended, "a lone vase is not worth a sheet");
  const letters = kitLetters(kits);
  assert(letters.get("a") === letters.get("b") && letters.get("g2") === letters.get("g1"), "a kit's letter lands on every member table");
  assert(new Set(kits.map((k) => k.letter)).size === kits.length, "letters are unique");
  assert(seatingSummary(doc) === "6 שולחנות", "a block counts as one table");
  assert(seatingSummary({ ...doc, tables: [] }) === "", "no tables, no summary");

  // A table out of the numbering: still a table, in a kit, counted — never a head table, never a number.
  {
    const gift = { ...doc, tables: [...doc.tables, t("gift", 0, { unnumbered: true })], placements: [...doc.placements, chip("9", "gift", "vase")] } as DesignDocumentContent;
    const gk = tableKits(gift);
    const vaseKit = gk.find((k) => k.units.some((u) => u.tableIds.includes("gift")))!;
    assert(vaseKit.units[vaseKit.units.length - 1].unnumbered === true, "an unnumbered table joins the kit its dressing matches, listed last");
    assert(!gk.find((k) => k.letter === "א")!.units.some((u) => u.unnumbered), "…and its stored 0 does not make it the head table");
    assert(seatingSummary(gift) === "7 שולחנות", "…and it is counted as a table");
    assert(tablesPhrase(vaseKit.units) === "שולחן 3 ועוד אחד ללא מספר", "its phrase counts it rather than numbering it");
  }

  // ── printed table lists ───────────────────────────────────────────────────────────────────────
  const plain = (s: string) => s.replace(/[⁦⁩]/g, "");
  assert(plain(formatTables([1, 2, 3, 5])) === "1–3, 5", "consecutive numbers become a range");
  // BUG (was): 0 and 1 are consecutive integers, so the head table was folded into a range.
  assert(plain(formatTables([0, 1, 2, 3])) === "ראש, 1–3", "the head table is named, never the start of a range");
  assert(plain(formatTables([5, 3, 4, 1])) === "1, 3–5", "unsorted input is sorted first");
  assert(plain(formatTables([2, 2, 3])) === "2–3", "a repeated number is printed once");
  assert(tablesPhrase([{ number: 4 }]) === "שולחן 4", "one table");
  assert(plain(tablesPhrase([{ number: 2 }, { number: 1 }])) === "שולחנות 1–2", "several");
  assert(tablesPhrase([{ number: 9, unnumbered: true }]) === "שולחן ללא מספר", "one unnumbered table is named as such");
  assert(tablesPhrase([{ number: 9, unnumbered: true }, { number: 0, unnumbered: true }]) === "2 שולחנות ללא מספר", "…and several are counted");
  assert(tablesPhrase([{ number: 0 }]) === "שולחן ראש", "the head table");
  console.log("table-kits self-check passed");
}
