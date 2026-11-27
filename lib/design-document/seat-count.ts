// HOW MANY PEOPLE SIT IN THIS DRAWING — the one count every surface reads (2026-11-20, the user: "the
// outputs and the quote must count sofa and banquette seats, the same way the studio does").
//
// Three kinds of place, never one counted twice:
//   · at the TABLES — every table's own seat count (`DesignTable.seats`, what its chairs are drawn
//     from); a block of tables seats what its members seat between them (groups.ts `groupSeats`), so
//     summing the tables is summing the blocks;
//   · on the BANQUETTES — a stage's edge banquettes (stage.ts `benchSeats`) and the ones standing on
//     their own (bench.ts `standaloneBenchSeats`), each banquette's two sides once: a chairs side's
//     chairs and a sofa side's sitters (`BenchLayout.countedSeats`), a sofa side that is "not seating"
//     (BenchSide.notSeating) left out;
//   · on the SOFAS standing on the plan (lib/catalog/sofa.ts `sofaSeats`), a placement's quantity
//     multiplying, one that is "not seating" (Placement.notSeating) counting nobody.
// A banquette row is not a sofa and a sofa is not a banquette (each lookup asks the row's CATEGORY), a
// row perched on a banquette or standing on a table is neither, and the chairs of a block of chairs in
// rows (Placement.rows) are ceremony seats, not counted here — the same as the studio's readout always
// did.
//
// What the count is NOT: the chairs to pack (a sofa packs none — measure.ts), the quote's chairs line
// (it bills chairs, not places), or procurement. Those read their own facts.
//
// Pure, no DOM: the catalog comes in through the three lookups (lib/studio/catalog-resolver.ts
// `seatLookups`). Self-checked: `npm run check:seat-count`.
import type { DesignDocumentContent } from "./types";
import { benchSeats, type DeckLookup } from "./stage";
import { standaloneBench, standaloneBenchSeats, type BenchLookup } from "./bench";
import { sofaSeats, type SofaLookup } from "@/lib/catalog/sofa";

/** What the count needs to know of the catalog: a stage's decks (to lay its edge banquettes), which
 *  placements are standalone banquettes, which are sofas and how many sit on each. */
export interface SeatLookups {
  deckOf: DeckLookup;
  benchOf: BenchLookup;
  sofaOf: SofaLookup;
}

export interface SeatCount {
  /** At the tables. */
  tables: number;
  /** On the banquettes — the stages' and the standalone ones. */
  benches: number;
  /** On the sofas. */
  sofas: number;
  /** Everyone: tables + benches + sofas. */
  total: number;
  /** How many of the places are spoken for — the tables' typed occupancy and a standalone banquette's. */
  seated: number;
}

export function seatCount(doc: Pick<DesignDocumentContent, "tables" | "placements">, lookups: SeatLookups): SeatCount {
  let tables = 0;
  let seated = 0;
  for (const t of doc.tables) {
    tables += t.seats ?? 0;
    seated += t.seated ?? 0;
  }
  // A standalone banquette's own typed note (BenchSpec.seated) — its places are counted below, so its
  // people are in `seated` too. (A stage's edge banquette carries no such note.)
  for (const p of doc.placements) if (p.bench?.seated && standaloneBench(p, lookups.benchOf)) seated += p.bench.seated;
  const benches = benchSeats(doc.placements, lookups.deckOf) + standaloneBenchSeats(doc.placements, lookups.benchOf);
  const sofas = sofaSeats(doc.placements, lookups.sofaOf);
  return { tables, benches, sofas, total: tables + benches + sofas, seated };
}

/** "על ספות ובנקטים" — where the places that are not at a table are, for a printed line's "מהם …";
 *  empty when every place is at a table. */
export function besideTablesWords(c: Pick<SeatCount, "benches" | "sofas">): string {
  if (c.benches > 0 && c.sofas > 0) return "על ספות ובנקטים";
  if (c.benches > 0) return "על בנקטים";
  if (c.sofas > 0) return "על ספות";
  return "";
}
