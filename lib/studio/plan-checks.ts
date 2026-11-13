import { isMain } from "../self-check";
import type { ListRef } from "./plan-list";

// The end panel's "checks" group as rows: a breach of clearance and a stage piece the catalog lacks,
// each worded for the panel and carrying the refs a click selects. Pure — the issues and the
// stages are computed by the studio (the clearance check, layStage) and handed in; this only
// words them.

export interface CheckRow {
  key: string;
  kind: "clearance" | "missing";
  text: string;
  refs: ListRef[];
}

/** A clearance subject key — "table:<id>", "placement:<id>", "feature:<id>" — as a selection ref. */
export function refOfSubject(key: string): ListRef | null {
  const i = key.indexOf(":");
  if (i < 0) return null;
  const kind = key.slice(0, i);
  const id = key.slice(i + 1);
  if ((kind !== "table" && kind !== "placement" && kind !== "feature") || !id) return null;
  return { kind, id };
}

const cm = (mm: number) => Math.round(mm / 10);

export function clearanceRows(
  issues: readonly { a: string; b: string; distance: number; required: number }[],
  labelOf: (subjectKey: string) => string | undefined,
): CheckRow[] {
  return issues.map((i) => ({
    key: `clearance:${i.a}|${i.b}`,
    kind: "clearance" as const,
    text: `${labelOf(i.a) ?? "פריט"} ↔ ${labelOf(i.b) ?? "פריט"} · ${cm(i.distance)} ס״מ · נדרש ${cm(i.required)}`,
    refs: [refOfSubject(i.a), refOfSubject(i.b)].filter((r): r is ListRef => r !== null),
  }));
}

export function missingRows(
  stages: readonly { id: string; label: string; missing: readonly { name: string; count: number }[] }[],
): CheckRow[] {
  return stages
    .filter((s) => s.missing.length > 0)
    .map((s) => ({
      key: `missing:${s.id}`,
      kind: "missing" as const,
      text: `${s.label} · חסר בקטלוג: ${s.missing.map((m) => (m.count > 1 ? `${m.name} ×${m.count}` : m.name)).join(", ")}`,
      refs: [{ kind: "placement" as const, id: s.id }],
    }));
}

if (isMain(import.meta.url)) {
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
}
