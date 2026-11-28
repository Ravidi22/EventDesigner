// npm run check:isolation-judge — when an action called by studio B with studio A's ids counts as refused.
import { judge, newRefs, refsOf, stable } from "./judge";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

const A_EVENT = "11111111-1111-4111-8111-111111111111";
const aIds = [A_EVENT, "22222222-2222-4222-8222-222222222222"];

assert(judge(new Error("not found"), aIds).refused, "a throw is a refusal");
assert(judge({ error: "אין גישה" }, aIds).refused, "an { error } answer is a refusal");
assert(judge(null, aIds).refused && judge(undefined, aIds).refused, "null and nothing are refusals");
assert(judge([], aIds).refused, "an empty list is a refusal");
assert(judge({ rows: [{ id: "other" }] }, aIds).refused, "an answer with none of A's ids is a refusal");
const leak = judge({ rows: [{ id: A_EVENT }] }, aIds);
assert(!leak.refused, "an answer carrying one of A's ids is NOT");
assert(leak.why.includes(A_EVENT), "…and the verdict names the id that came back");
assert(!judge(`see ${A_EVENT}`, aIds).refused, "…in a plain string too");
assert(!judge({ error: "x", data: [A_EVENT] }, aIds).refused, "an { error } that still carries A's data is NOT a refusal");

// B's rows that point at A: every A id a row outside A's side mentions, and which of them are NEW.
const refs = refsOf("expenses", { id: "e1", organization_id: "B", variant_id: A_EVENT, note: "x" }, aIds);
assert(JSON.stringify(refs) === JSON.stringify([`expenses e1 → ${A_EVENT}`]), "a B row naming one of A's ids is a reference");
assert(refsOf("expenses", { id: "e2", organization_id: "B" }, aIds).length === 0, "a B row naming none is not");
assert(refsOf("event_zones", { event_id: "b-event", zone_id: A_EVENT }, aIds)[0]?.startsWith("event_zones {"), "a row with no id is named by its content");
const before = new Set([`venue_grants g1 → ${A_EVENT}`]);
const after = new Set([...before, `expenses e1 → ${A_EVENT}`, `sketch_templates s1 → 22222222-2222-4222-8222-222222222222`]);
assert(
  JSON.stringify(newRefs(before, after, new Set(["22222222-2222-4222-8222-222222222222"]))) === JSON.stringify([`expenses e1 → ${A_EVENT}`]),
  "only NEW references count, minus the ids the case allows",
);

// The row fingerprint: key order never matters, a change at any depth always does.
const row = { id: "x", content: { tables: [{ n: 1 }], calibration: { mmPerUnit: 1 } } };
assert(stable(row) === stable({ content: { calibration: { mmPerUnit: 1 }, tables: [{ n: 1 }] }, id: "x" }), "key order does not change a fingerprint");
assert(stable(row) !== stable({ ...row, content: { ...row.content, tables: [{ n: 2 }] } }), "a change inside a jsonb column does");
assert(stable({ at: new Date(0) }) === JSON.stringify({ at: new Date(0) }), "a date is written as itself");

console.log("isolation judge self-check passed");
