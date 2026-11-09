import type { DesignDocumentContent as DesignDocument, Placement } from "../design-document/types";
import { tableLabel } from "../design-document/groups";
import { PLANES, type Plane } from "./planes";
import { isMain } from "../self-check";

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
  /** A venue feature (a bar, a pool) — the property's, not this event's. */
  venue?: boolean;
  swatch?: string;
}

export interface PlanListOptions {
  /** A placement's variant → its product's name and shade; undefined when the catalog lacks it. */
  resolve: (variantId: string) => { product: { id: string; name: string }; swatch?: string } | undefined;
  venueFeatures?: { id: string; label: string }[];
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
    row.refs.push({ kind: "placement", id: p.id });
    quantity.set(key, (quantity.get(key) ?? 0) + (p.quantity ?? 1));
  }
  for (const [key, row] of rows) {
    const q = quantity.get(key) ?? row.count;
    if (q !== row.count) row.meta = `×${q}`;
  }

  // ── the venue's own features, on the floor ────────────────────────────────────────────────────
  for (const f of opts.venueFeatures ?? []) {
    out.floor.push({ key: `feature:${f.id}`, plane: "floor", label: f.label, count: 1, refs: [{ kind: "feature", id: f.id }], venue: true });
  }
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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error(`plan-list: ${m}`);
  };
  const table = (id: string, extra: Partial<DesignDocument["tables"][number]> = {}): DesignDocument["tables"][number] => ({
    id,
    type: "עגול 180",
    number: Number(id.replace(/\D/g, "")) || 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    diameterMm: 1800,
    seats: 10,
    variantId: "v-round",
    ...extra,
  });
  const placement = (id: string, variantId: string, layer: Placement["layer"], extra: Partial<Placement> = {}): Placement => ({
    id,
    variantId,
    layer,
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    ...extra,
  });
  const doc: DesignDocument = {
    calibration: { mmPerUnit: 1 },
    tables: [
      table("t1"),
      table("t2"),
      table("t3"),
      table("b1", { type: "מלבן", variantId: "v-rect", groupId: "g", number: 4, seats: 8 }),
      table("b2", { type: "מלבן", variantId: "v-rect", groupId: "g", number: 5, seats: 8 }),
    ],
    groups: [{ id: "g", number: 4 }],
    placements: [
      placement("c1", "v-candle", "table", { tableId: "t1" }),
      placement("c2", "v-candle", "table", { tableId: "t2" }),
      placement("d1", "v-vase", "table", { tableId: "t3" }),
      placement("r1", "v-rug", "floor", { quantity: 3 }),
      placement("s1", "v-deck", "floor", {
        stage: {
          outline: [
            { x: -3000, y: -2000 },
            { x: 3000, y: -2000 },
            { x: 3000, y: 2000 },
            { x: -3000, y: 2000 },
          ],
          front: 2,
          decks: [],
        },
      }),
      placement("x1", "v-gone", "ceiling"),
    ],
  };
  const names: Record<string, string> = { "v-round": "שולחן עגול", "v-rect": "שולחן מלבני", "v-candle": "פמוט", "v-vase": "אגרטל", "v-rug": "שטיח", "v-deck": "פלטה" };
  const resolve: PlanListOptions["resolve"] = (v) => (names[v] ? { product: { id: "p-" + v, name: names[v] }, swatch: "#fff" } : undefined);
  const rows = planListRows(doc, { resolve, venueFeatures: [{ id: "f1", label: "בר" }] });

  assert(rows.tables.length === 2, "three lone tables of one variant and one block are two rows");
  assert(rows.tables[0].label === "שולחן עגול" && rows.tables[0].count === 3, "the lone tables are one row named by the product, counted");
  assert(rows.tables[0].meta === "30 מושבים", "…with their seats summed");
  assert(rows.tables[1].refs.length === 2 && rows.tables[1].meta === "2 שולחנות", "the block is one row holding both members");
  assert(rows.tables[1].label === "שולחן 4", "…named as the plan names it");

  assert(rows.table.length === 2, "candlesticks of one product and a vase are two rows on the table plane");
  assert(rows.table[0].count === 2 && rows.table[1].count === 1, "…counted per product");
  assert(rows.table[0].meta === undefined, "…and a count equal to the quantity needs no meta");

  const rug = rows.floor.find((r) => r.label === "שטיח");
  assert(rug?.count === 1 && rug.meta === "×3", "a rug of quantity 3 says so");
  const stage = rows.floor.find((r) => r.label === "במה");
  assert(!!stage && stage.meta!.includes("6") && stage.meta!.includes("4"), "a stage is a row of its own with its size in metres");
  assert(stage!.meta === "6 × 4 מ׳", "…6 × 4");
  const bar = rows.floor.find((r) => r.venue);
  assert(bar?.label === "בר" && bar.refs[0].kind === "feature" && bar.refs[0].id === "f1", "a venue feature is a floor row marked venue");
  assert(rows.ceiling.length === 1 && rows.ceiling[0].label === "פריט", "a variant that does not resolve is an 'פריט'");

  assert(listCrumb(rows, [{ kind: "placement", id: "c2" }]) === "עיצוב שולחן › פמוט", "the crumb names the plane and the row");
  assert(listCrumb(rows, [{ kind: "table", id: "b2" }]) === "שולחנות › שולחן 4", "…a block member finds its block");
  assert(listCrumb(rows, [{ kind: "placement", id: "nope" }]) === undefined, "…and a thing the list lacks has none");
  assert(listCrumb(rows, []) === undefined, "…nor does an empty selection");

  // A table with no catalog row is named by its type, and two types are two rows.
  const bare = planListRows({ calibration: { mmPerUnit: 1 }, tables: [table("a", { variantId: undefined }), table("b", { variantId: undefined, type: "מלבן" })], placements: [] }, { resolve });
  assert(bare.tables.length === 2 && bare.tables[0].label === "עגול 180", "an uncatalogued table is named by its type word");
  console.log("plan-list: ok");
}
