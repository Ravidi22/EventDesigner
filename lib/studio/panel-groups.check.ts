// npm run check:panel-groups — the self-check of ./panel-groups.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { createGroupMemory, orderGroups } from "./panel-groups";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error(`panel-groups: ${m}`);
};
const keys = (l: { key: string }[]) => l.map((g) => g.key).join(",");

assert(keys(orderGroups([{ key: "a" }, { key: "b", warn: true }, { key: "c" }, { key: "d", warn: true }])) === "b,d,a,c", "warn groups first, the rest in their order");
assert(orderGroups([]).length === 0, "nothing in, nothing out");

const m = createGroupMemory();
assert(JSON.stringify(m.get("table", ["cloth"])) === JSON.stringify({ cloth: true }), "a kind read the first time opens its defaults");
const after = m.toggle("table", "seats", ["cloth"]);
assert(after.cloth === true && after.seats === true, "a toggle opens a group beside the defaults");
assert(JSON.stringify(m.get("stage")) === "{}", "another kind starts closed");
assert(m.get("table").seats === true, "a kind keeps its own open groups");
assert(m.toggle("table", "cloth").cloth === false, "a toggle closes an open group");

let calls = 0;
const off = m.subscribe(() => calls++);
m.open("stage", "edges");
m.toggle("stage", "height");
assert(calls === 2, "open and toggle both notify");
assert(m.get("stage").edges === true, "open opens");
off();
m.toggle("stage", "height");
assert(calls === 2, "an unsubscribed listener is not called");
console.log("panel-groups: ok");
