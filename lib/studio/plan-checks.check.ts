// npm run check:plan-checks — the self-check of ./plan-checks.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { clearanceRows, missingRows, refOfSubject } from "./plan-checks";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error(`plan-checks: ${m}`);
};
const labels: Record<string, string> = { "table:t1": "שולחן 1", "placement:p1": "בר" };
const rows = clearanceRows([{ a: "table:t1", b: "placement:p1", distance: 102, required: 800 }], (k) => labels[k]);
assert(rows.length === 1, "one issue is one row");
assert(rows[0].text === "שולחן 1 ↔ בר · 10 ס״מ · נדרש 80", `the clearance text, got "${rows[0].text}"`);
assert(
  JSON.stringify(rows[0].refs) === JSON.stringify([{ kind: "table", id: "t1" }, { kind: "placement", id: "p1" }]),
  "…carrying both subjects as refs",
);
assert(rows[0].kind === "clearance", "…of the clearance kind");
const unnamed = clearanceRows([{ a: "table:t1", b: "feature:f2", distance: 0, required: 500 }], () => undefined);
assert(unnamed[0].text === "פריט ↔ פריט · 0 ס״מ · נדרש 50", "a subject with no label is 'פריט'");

const f = refOfSubject("feature:f9");
assert(f?.kind === "feature" && f.id === "f9", "a feature subject is a feature ref");
assert(refOfSubject("x") === null, "a key that is not a subject is null");
assert(refOfSubject("wall:w1") === null, "…and so is a kind the panel cannot select");

const m = missingRows([
  { id: "s1", label: "במה", missing: [{ name: "רבע עיגול R180", count: 2 }] },
  { id: "s2", label: "במה", missing: [] },
  { id: "s3", label: "במה 2", missing: [{ name: "חצי עיגול", count: 1 }, { name: "משולש", count: 3 }] },
]);
assert(m.length === 2, "a stage with nothing missing has no row");
assert(m[0].text === "במה · חסר בקטלוג: רבע עיגול R180 ×2", `the missing text, got "${m[0].text}"`);
assert(JSON.stringify(m[0].refs) === JSON.stringify([{ kind: "placement", id: "s1" }]), "…selecting the stage's placement");
assert(m[1].text === "במה 2 · חסר בקטלוג: חצי עיגול, משולש ×3", "×N only when N is more than one");
assert(m[0].kind === "missing", "…of the missing kind");
console.log("plan-checks: ok");
