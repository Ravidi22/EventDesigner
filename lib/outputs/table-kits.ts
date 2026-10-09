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
import { numberedUnits } from "../design-document/groups";
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
  units: { id: string; number: number; tableIds: string[] }[];
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
    const score = pieces + items.length + (block ? 3 : 0) + (shaped ? 2 : 0) + (arranged ? 2 : 0) + (unit.number === 0 ? 2 : 0);
    const kit = byKey.get(key) ?? { key, units: [], items, score: 0, recommended: false };
    kit.units.push(unit);
    kit.score = Math.max(kit.score, score);
    // A head table, a block, or anything scoring past a plain table with a centrepiece and a
    // runner (3 pieces, 3 items = 6) is worth a sheet of its own.
    kit.recommended = kit.recommended || block || unit.number === 0 || score >= 7;
    byKey.set(key, kit);
  }
  return [...byKey.values()]
    .map((k) => ({ ...k, units: k.units.sort((a, b) => a.number - b.number) }))
    .sort((a, b) => a.units[0].number - b.units[0].number)
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
  console.log("table-kits self-check passed");
}
