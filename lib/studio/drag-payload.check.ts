// npm run check:drag-payload — the self-check of ./drag-payload.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import { TABLE_SOLID } from "./catalog-resolver";
import { FLOOR_COVER } from "./collide";
import { carriedOf } from "./drag-payload";

// Self-check. Run: npm run check:drag-payload
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const row = (category: string) =>
  ({ id: "p", name: "x", category, layer: "floor", dimensions: { widthMm: 1800, depthMm: 900, heightMm: 750 }, categoryFields: {}, styleTags: [], variants: [], appearance: { shape: "rect" } }) as unknown as Product;
// The rail's drop pushes what it carries off anything solid OF THE SAME KEY (lib/studio/collide.ts),
// and the plan boxes every table under TABLE_SOLID: a table row carried under its category's name
// ("tables") matched nothing, and a table let go half on another landed overlapping it (QA MG-8).
assert(carriedOf(row("tables")).solid === TABLE_SOLID, "a table carried off the rail is solid as the plan's tables are");
assert(carriedOf(row("stage-decks")).solid === "stage" && carriedOf(row("stages")).solid === "stage", "a deck and a stage are one kind of solid");
assert(carriedOf(row("sofas")).solid === "sofas", "every other floor category is solid against its own");
const round = { ...row("tables"), dimensions: { diameterMm: 1800, heightMm: 750 }, appearance: { shape: "circle" } } as unknown as Product;
assert(carriedOf(round).round === true && !carriedOf(row("tables")).round, "a round table is carried as round — held off the others as a circle");
// A rug lies under everything but is still held by a wall (collide.ts FLOOR_COVER).
assert(carriedOf(row("rugs")).solid === FLOOR_COVER && carriedOf(row("dance-floors")).solid === FLOOR_COVER, "a rug or a dance floor is carried as a floor cover");
// A composite lands as its parts, pasted about the point: its box holds nothing off.
assert(carriedOf({ ...row("composites"), composition: { tables: [], placements: [] } } as unknown as Product).solid === undefined, "a composite carries no hold of its own");
// A table with its chairs is held off the others by its seat ring (QA MG-16).
const seated = { ...row("tables"), categoryFields: { seats: 10 } } as unknown as Product;
const ring = carriedOf(seated).ring;
assert(!!ring && ring.widthMm > 1800 && ring.depthMm > 900, "a table with its catalog chairs is carried with the ring they make");
assert(!carriedOf(row("tables")).ring, "…a table with none has no ring but its top");
const roundSeated = carriedOf({ ...round, categoryFields: { seats: 10 } } as unknown as Product).ring;
assert(!!roundSeated?.round && roundSeated.widthMm > 1800, "…and a round one a round ring");
console.log("drag-payload self-check passed");
