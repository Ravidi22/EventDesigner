import type { DesignDocumentContent as DesignDocument, Placement } from "../design-document/types";
import { tableLabel } from "../design-document/groups";
import { PLANES, type Plane } from "./planes";

// What is on the plan, as the end panel's list shows it (components/end-panel.tsx, nothing selected
// or above the selection's groups): per plane, one row per KIND of thing — the tables by type, a
// block of tables as one, the placements by product — each with how many there are and the refs to
// select them all. Pure: the catalog is reached only through the `resolve` the caller passes in, so
// this file imports no product table and the check below needs no database.
//
// Counts are what the plan HOLDS, never what it costs or what is on hand — no price comes in or
// goes out (the panel is on /meeting, a client-facing frame).

/** Structurally the studio's SelectionRef. */
export type ListRef = { kind: "table" | "placement" | "feature"; id: string };

export interface PlanListRow {
  key: string;
  plane: Plane;
  label: string;
  count: number;
  meta?: string;
  /** Everything a click on the row selects. */
  refs: ListRef[];
  swatch?: string;
}

export interface PlanListOptions {
  /** A placement's variant → its product's name and shade, and where it goes (`anchor` "table" = a
   *  table's cloth — its surface); undefined when the catalog lacks it. */
  resolve: (variantId: string) => { product: { id: string; name: string }; swatch?: string; anchor?: string } | undefined;
}

/** Whole metres to one decimal at most: 6 → "6", 4.5 → "4.5". */
const metres = (mm: number) => String(Math.round(mm / 100) / 10);

/** The width × depth a stage placement stands as, mm — its outline's box, else its sized box. */
function stageBox(p: Placement): { w: number; d: number } | undefined {
  const o = p.stage?.outline;
  if (o && o.length > 0) {
    const xs = o.map((q) => q.x);
    const ys = o.map((q) => q.y);
    return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
  }
  return p.sizeMm ? { w: p.sizeMm.widthMm, d: p.sizeMm.depthMm } : undefined;
}

export function planListRows(doc: DesignDocument, opts: PlanListOptions): Record<Plane, PlanListRow[]> {
  const out: Record<Plane, PlanListRow[]> = { tables: [], table: [], floor: [], ceiling: [] };

  // ── tables: lone ones by type, every block as one row, in first-appearance order ──────────────
  const seen = new Map<string, PlanListRow>();
  for (const t of doc.tables) {
    if (t.groupId) {
      const key = `block:${t.groupId}`;
      let row = seen.get(key);
      if (!row) {
        row = { key, plane: "tables", label: tableLabel(doc, t), count: 0, refs: [] };
        seen.set(key, row);
        out.tables.push(row);
      }
      row.count++;
      row.refs.push({ kind: "table", id: t.id });
      continue;
    }
    const key = `tables:${t.variantId ?? "type:" + t.type}`;
    let row = seen.get(key);
    if (!row) {
      // A table with no catalog row is named by its type word, as stored ("עגול 180").
      const found = t.variantId ? opts.resolve(t.variantId) : undefined;
      row = { key, plane: "tables", label: found?.product.name ?? t.type, count: 0, refs: [], ...(found?.swatch ? { swatch: found.swatch } : {}) };
      seen.set(key, row);
      out.tables.push(row);
    }
    row.count++;
    row.refs.push({ kind: "table", id: t.id });
  }
  for (const row of out.tables) {
    if (row.key.startsWith("block:")) {
      row.meta = `${row.count} שולחנות`;
    } else {
      const seats = row.refs.reduce((n, r) => n + (doc.tables.find((t) => t.id === r.id)?.seats ?? 0), 0);
      if (seats > 0) row.meta = `${seats} מושבים`;
    }
  }

  // ── placements: by (plane, product); a stage is a row of its own ──────────────────────────────
  const quantity = new Map<string, number>();
  const rows = new Map<string, PlanListRow>();
  for (const p of doc.placements) {
    const plane: Plane = p.layer ?? "floor";
    if (p.stage) {
      const box = stageBox(p);
      const key = `stage:${p.id}`;
      out[plane].push({
        key,
        plane,
        label: "במה",
        count: 1,
        refs: [{ kind: "placement", id: p.id }],
        ...(box ? { meta: `${metres(box.w)} × ${metres(box.d)} מ׳` } : {}),
      });
      continue;
    }
    const found = opts.resolve(p.variantId);
    const key = `${plane}:${found ? found.product.id : "unknown"}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, plane, label: found?.product.name ?? "פריט", count: 0, refs: [], ...(found?.swatch ? { swatch: found.swatch } : {}) };
      rows.set(key, row);
      out[plane].push(row);
    }
    row.count++;
    // A table's cloth is its SURFACE, never selected on its own (the canvas cannot select one, and
    // an item bar on a cloth offers a % and an angle it ignores): its row selects the tables wearing
    // it — one cloth per table, so no table is listed twice.
    if (p.tableId && found?.anchor === "table") row.refs.push({ kind: "table", id: p.tableId });
    else row.refs.push({ kind: "placement", id: p.id });
    quantity.set(key, (quantity.get(key) ?? 0) + (p.quantity ?? 1));
  }
  for (const [key, row] of rows) {
    const q = quantity.get(key) ?? row.count;
    if (q !== row.count) row.meta = `×${q}`;
  }

  // The venue's own features (its bars, pools, stages) are NOT listed: the list is what this event
  // put on the plan (the user, 2026-11-10: "filter the elements של המקום — not relevant").
  return out;
}

/** "<plane> › <row>" for the row holding the selection's first ref — the panel's breadcrumb. */
export function listCrumb(rows: Record<Plane, PlanListRow[]>, sel: ListRef[]): string | undefined {
  const first = sel[0];
  if (!first) return undefined;
  for (const { id, label } of PLANES) {
    const row = rows[id].find((r) => r.refs.some((x) => x.kind === first.kind && x.id === first.id));
    if (row) return `${label} › ${row.label}`;
  }
  return undefined;
}
