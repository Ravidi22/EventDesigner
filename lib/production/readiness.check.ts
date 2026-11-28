// npm run check:readiness — the self-check of ./readiness.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type ProcurementItem } from "@/lib/suppliers/procurement";
import { readiness, stateOf } from "./readiness";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`readiness: ${message}`);
}

const items: Record<string, ProcurementItem> = {
  chair: { label: "כיסא", categoryLabel: "", stockKind: "owned", unit: "unit", stockQty: 100 },
  rug: { label: "שטיח", categoryLabel: "", stockKind: "owned", unit: "m2" },
  rose: { label: "ורד", categoryLabel: "", stockKind: "consumable", unit: "unit", orderUnit: "גבעולים", orderFactor: 7, supplierName: "בוקי" },
  tent: { label: "אוהל", categoryLabel: "", stockKind: "rented", unit: "unit" },
};
const lookup = (id: string) => items[id];

const r = readiness(
  [
    { variantId: "chair", quantity: 80 },
    { variantId: "rug", quantity: 12 },
    { variantId: "rose", quantity: 10 },
    { variantId: "tent", quantity: 1 },
  ],
  new Map([["chair", 40]]),
  lookup,
  new Map([
    ["rose", [{ variantId: "rose", quantity: 70, status: "confirmed" }]],
    ["tent", [{ variantId: "tent", quantity: 1, status: "declined" }]],
  ]),
);
const chair = r.owned.find((l) => l.variantId === "chair")!;
assert(chair.shortfall === 20, "80 here + 40 elsewhere against 100 owned is 20 short");
const rug = r.owned.find((l) => l.variantId === "rug")!;
assert(rug.stockQty === undefined && rug.shortfall === undefined, "an uncounted item claims no shortfall");
assert(r.owned[0].variantId === "chair", "the shortfall is listed first");
const rose = r.sourced.find((l) => l.variantId === "rose")!;
assert(rose.needed === 70 && rose.unitLabel === "גבעולים", "consumables are counted in order units");
assert(rose.state === "confirmed" && rose.ordered === 70, "a confirmed order covers it");
const tent = r.sourced.find((l) => l.variantId === "tent")!;
assert(tent.state === "declined" && tent.ordered === 0, "a declined order covers nothing");
assert(r.sourced[0].variantId === "tent", "the refused line is listed first");
assert(r.summary.ownedShort === 1 && r.summary.ownedUncounted === 1 && r.summary.ownedOk === 0, "owned counts");
assert(r.summary.sourcedCovered === 1 && r.summary.sourcedMissing === 1 && r.summary.sourcedOpen === 0, "sourced counts");

// A sent order is open; sent + confirmed is still open until every line is answered.
const mixed = stateOf([
  { variantId: "x", quantity: 5, status: "sent" },
  { variantId: "x", quantity: 5, status: "confirmed" },
]);
assert(mixed.state === "sent" && mixed.ordered === 10, "partly answered is still open");
assert(stateOf([]).state === "none", "nothing sent is nothing");

console.log("readiness: all checks passed");
