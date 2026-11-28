// npm run check:table-kits — the self-check of ./table-kits.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { type SeatLookups } from "../design-document/seat-count";
import { formatTables, kitLetters, seatingSummary, tableKits, tablesPhrase } from "./table-kits";

// ponytail: self-check. Run: npm run check:table-kits
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
const NO_CATALOG: SeatLookups = { deckOf: () => undefined, benchOf: () => null, sofaOf: () => null };
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
assert(seatingSummary(doc, NO_CATALOG) === "6 שולחנות", "a block counts as one table");
assert(seatingSummary({ ...doc, tables: [] }, NO_CATALOG) === "", "no tables, no summary");

// Everyone who sits is counted — at the tables, on the banquettes, on the sofas (seat-count.ts), the
// same number as the studio's readout; a printed line may say where the rest sit.
{
  const seats: SeatLookups = {
    deckOf: () => undefined,
    benchOf: (p) => (p.variantId === "bench" ? { widthMm: 3000, depthMm: 450 } : null),
    sofaOf: (p) => (p.variantId === "sofa" ? 3 : null),
  };
  const floor = (id: string, variantId: string, extra = {}) => ({ id, layer: "floor", variantId, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, ...extra });
  const lounge = {
    ...doc,
    tables: [t("a", 1, { seats: 10 })],
    placements: [floor("b", "bench"), floor("s", "sofa", { quantity: 2 }), floor("x", "sofa", { notSeating: true })],
  } as unknown as DesignDocumentContent;
  assert(seatingSummary(lounge, seats) === "1 שולחן · 21 מקומות", "a table, a banquette and two sofas are 21 places");
  assert(seatingSummary(lounge, seats, { detail: true }) === "1 שולחן · 21 מקומות (מהם 11 על ספות ובנקטים)", "…and the detailed line says where 11 of them sit");
  assert(seatingSummary({ ...lounge, tables: [] }, seats) === "11 מקומות", "no tables but sofas: the places alone");
}

// A table out of the numbering: still a table, in a kit, counted — never a head table, never a number.
{
  const gift = { ...doc, tables: [...doc.tables, t("gift", 0, { unnumbered: true })], placements: [...doc.placements, chip("9", "gift", "vase")] } as DesignDocumentContent;
  const gk = tableKits(gift);
  const vaseKit = gk.find((k) => k.units.some((u) => u.tableIds.includes("gift")))!;
  assert(vaseKit.units[vaseKit.units.length - 1].unnumbered === true, "an unnumbered table joins the kit its dressing matches, listed last");
  assert(!gk.find((k) => k.letter === "א")!.units.some((u) => u.unnumbered), "…and its stored 0 does not make it the head table");
  assert(seatingSummary(gift, NO_CATALOG) === "7 שולחנות", "…and it is counted as a table");
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
