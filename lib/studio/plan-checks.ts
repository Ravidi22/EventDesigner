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
