// npm run check:seat-count — the self-check of ./seat-count.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, Placement } from "./types";
import { type DeckLookup } from "./stage";
import { type BenchLookup } from "./bench";
import { type SofaLookup } from "@/lib/catalog/sofa";
import { besideTablesWords, seatCount, type SeatLookups } from "./seat-count";

// ponytail: self-check. Run: npm run check:seat-count
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const deckOf: DeckLookup = (id) => (id === "deck" ? { id: "deck", widthMm: 2000, depthMm: 1000, heightMm: 600 } : undefined);
const benchOf: BenchLookup = (p) => (p.variantId === "bench" ? (p.sizeMm ?? { widthMm: 3000, depthMm: 450 }) : null);
const sofaOf: SofaLookup = (p) => (p.variantId === "sofa" ? 3 : null);
const lookups: SeatLookups = { deckOf, benchOf, sofaOf };
const item = (id: string, variantId: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  variantId,
  layer: "floor",
  quantity: 1,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: 1,
  ...extra,
});
// A 6×4 stage, its front along y = +2000 (edge 2), a 3 m banquette on it: 5 chairs on the stage
// side, a 4-seat sofa on the room side.
const stage = (front: { kind: "sofa"; seats: number; notSeating?: true }): Placement =>
  item("s", "deck", {
    stage: {
      outline: [
        { x: -3000, y: -2000 },
        { x: 3000, y: -2000 },
        { x: 3000, y: 2000 },
        { x: -3000, y: 2000 },
      ],
      front: 2,
      decks: ["deck"],
      stairs: [{ id: "b", kind: "bench", edge: 2, t: 0.5, widthMm: 3000, bench: { back: { kind: "chairs", seats: 5 }, front } }],
    },
  });
const table = { id: "t", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0, seats: 10, seated: 8 };
const doc = (placements: Placement[]) => ({ tables: [table], placements }) as unknown as DesignDocumentContent;

const one = seatCount(doc([]), lookups);
assert(one.tables === 10 && one.total === 10 && one.seated === 8, "a table seats what it says");

const onStage = seatCount(doc([stage({ kind: "sofa", seats: 4 })]), lookups);
assert(onStage.benches === 9 && onStage.total === 19, "a stage banquette: its chairs side and its sofa side, each once");
assert(seatCount(doc([stage({ kind: "sofa", seats: 4, notSeating: true })]), lookups).benches === 5, "…its sofa side out when it is not seating");

const free = seatCount(doc([item("f", "bench", { bench: { back: { kind: "chairs" }, front: { kind: "sofa", seats: 2 }, seated: 3 } })]), lookups);
assert(free.benches === 7 && free.seated === 11, "a standalone banquette: five chairs along 3 m and its sofa — and its typed occupancy");

const sofas = seatCount(doc([item("a", "sofa", { quantity: 2 }), item("b", "sofa", { notSeating: true })]), lookups);
assert(sofas.sofas === 6 && sofas.total === 16, "a sofa ×2 seats twice; one that is not seating seats nobody");

const all = seatCount(doc([stage({ kind: "sofa", seats: 4 }), item("f", "bench"), item("a", "sofa")]), lookups);
assert(all.tables === 10 && all.benches === 14 && all.sofas === 3 && all.total === 27, "everything together, nothing twice");
assert(seatCount(doc([item("p", "sofa", { tableId: "t" })]), { ...lookups, sofaOf: (p) => (p.tableId ? null : sofaOf(p)) }).sofas === 0, "what the catalog says is no sofa counts nothing");

assert(besideTablesWords(all) === "על ספות ובנקטים" && besideTablesWords(onStage) === "על בנקטים" && besideTablesWords(sofas) === "על ספות" && besideTablesWords(one) === "", "where the rest sit, in words");
console.log("seat-count self-check passed");
