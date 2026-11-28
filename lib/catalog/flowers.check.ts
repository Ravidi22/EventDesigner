// npm run check:flowers — the self-check of ./flowers.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { FlowerLine } from "./types";
import { FLOWER_VOCABULARY, normalizeFlowerName } from "./flower-kinds";
import { cleanFlowers, FLOWER_NAMES, flowerNamesOf, flowerSummary, knownFlowerOfProduct, knownFlowersOf, stemCount, stemsOf } from "./flowers";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const lines: FlowerLine[] = [
  { id: "a", name: " ורד ", qty: 12 },
  { id: "b", name: "פיאוני", qty: 5.4 },
  { id: "c", name: "", qty: 9 },
  { id: "d", name: "אקליפטוס", qty: 0 },
];
const clean = cleanFlowers(lines)!;
assert(clean.length === 2, "a nameless row and a zero row are dropped");
assert(clean[0].name === "ורד" && clean[1].qty === 5, "names trimmed, quantities whole");
assert(cleanFlowers([]) === undefined && cleanFlowers(undefined) === undefined, "no rows is absent, not []");
assert(cleanFlowers([{ id: "x", name: "ורד", qty: -3 }]) === undefined, "a negative quantity is no row");

assert(stemCount(clean) === 17, "12 + 5 = 17 stems");
assert(stemsOf({ flowers: clean, categoryFields: { stems: 180 } }) === 17, "lines win over the typed total");
assert(stemsOf({ flowers: undefined, categoryFields: { stems: 180 } }) === 180, "no lines: the typed total");
assert(stemsOf({ flowers: [], categoryFields: {} }) === 0, "nothing at all is 0");
assert(stemsOf({ categoryFields: { stems: "abc" } }) === 0, "garbage in the field is 0, not NaN");

assert(flowerSummary(clean) === "ורד ×12 · פיאוני ×5", "the summary reads name × count");
assert(flowerSummary(undefined) === "", "no lines, no summary");

const names = flowerNamesOf([{ flowers: clean }, { flowers: [{ id: "z", name: "פרוטאה", qty: 2 }] }]);
assert(names[0] === FLOWER_NAMES[0], "the built-ins come first");
assert(names.includes("פרוטאה"), "a name the catalog uses is offered");
assert(names.filter((n) => n === "ורד").length === 1, "no duplicates");

const pinned = cleanFlowers([
  { id: "a", name: "ורד", qty: 3, kind: "rose", colour: "#E8A0B4" },
  { id: "b", name: "משהו", qty: 2, kind: "bogus", colour: "pinkish" },
])!;
assert(pinned[0].kind === "rose" && pinned[0].colour === "#e8a0b4", "a known kind and a hex colour are kept");
assert(pinned[1].kind === undefined && pinned[1].colour === undefined, "an unknown kind and a non-colour are dropped");

const known = knownFlowersOf([{ flowers: [{ id: "q", name: "ורד", qty: 1, colour: "#ff0000" }, { id: "r", name: "פרוטאה", qty: 1 }] }], [
  { name: "ורד אוולנש 60 ס״מ", kind: "rose", colour: "#FFFFFF", source: "בוקי פרחים" },
  { name: "ורד", kind: "rose", colour: "#000000", source: "בוקי פרחים" },
]);
assert(known[0].name === FLOWER_VOCABULARY[0].name && known[0].colour === undefined, "the vocabulary comes first and keeps its kind, not the catalog's colour");
assert(known.some((k) => k.name === "פרוטאה" && k.kind === "filler"), "a name the catalog uses is offered, read to a kind");
assert(known.some((k) => k.source === "בוקי פרחים" && k.colour === "#FFFFFF"), "a marketplace stem is offered with its colour");
assert(known.filter((k) => normalizeFlowerName(k.name) === "ורד").length === 1, "one entry per name");
const stem = knownFlowerOfProduct({ name: "ליזיאנטוס 80 ס״מ ורוד", category: "flowers", variants: [] }, "בוקי", "filler");
assert(stem.kind === "lisianthus" && stem.colour === "#E8A0B4", "a stem's kind and colour are read from its name");
console.log("catalog/flowers self-check passed");
