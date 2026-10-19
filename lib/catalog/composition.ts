// Composite catalog items: a catalog row made of other catalog rows, as they stand together
// (Product.composition — see the note on Composition in ./types.ts for why it is a fragment of a
// drawing and never a priced bundle).
//
// Two ways in, one shape out:
//
//   • fromSelection — the designer selects tables and items on a sketch and saves them. The pieces
//     are copied exactly as the clipboard copies them (copySelection), and moved so the item's
//     middle is its origin. The arrangement IS the item.
//   • layoutRecipe — the designer lists the parts in the catalog ("2 שולחנות מלבן 240, 2 מפות,
//     6 פמוטים, 24 כיסאות"). The list is laid out the way a designer would lay it: the tables pushed
//     into one block, a cloth on each, the items shared out between them, what hangs over them hung
//     over them, the chairs counted as the tables' seats and the rest set out in a row in front.
//
// Placing either on a plan is a paste (lib/studio/clipboard.ts pasteInto), done by the studio.
//
// Pure: no I/O, no React. `npm run check:composition`.
import type { DesignGroup, DesignTable, Placement, Point } from "../design-document/types";
import type { Clip } from "../studio/clipboard";
import type { Composition, CompositionLine, Product } from "./types";
import { anchorOf } from "./categories";
import { catalogBox } from "../studio/footprint";
import { isMain } from "../self-check";

/** The category every composite row is filed under (lib/catalog/categories.ts). */
export const COMPOSITE_CATEGORY = "composites";

export const isComposite = (p: Pick<Product, "category" | "composition">): boolean =>
  p.category === COMPOSITE_CATEGORY || !!p.composition;

/** What may be a part of a composite: an ordinary row that stands somewhere. Not another composite
 *  (a set inside a set is a set of its parts, and placing it is the same paste), not a drape (it is
 *  measured along one wall of one venue — the clipboard leaves it behind for the same reason). */
export function canBePart(p: Product): boolean {
  return !p.archived && !isComposite(p) && anchorOf(p) !== "wall";
}

/** The clip a composite pastes as. */
export const clipOf = (c: Composition): Clip => ({ tables: c.tables, placements: c.placements, groups: c.groups });

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A copied selection as a composite: moved so the middle of `box` (the turned boxes of what was
 * selected, measured by the caller) is the origin.
 *
 * What would dangle is let go rather than carried: an item standing on a table that was not part of
 * the selection has no table to stand on in the item (a centrepiece copied alone pastes back onto the
 * table it came from — a composite has no such table), and a pendant hung over a table left behind
 * hangs free. How many are seated, and where each thing stood in the old plan's stack, are facts
 * about that plan and not about the item.
 */
export function fromSelection(clip: Clip, box: Box): Composition {
  const tableIds = new Set(clip.tables.map((t) => t.id));
  const placementIds = new Set(clip.placements.map((p) => p.id));
  const cx = Math.round((box.minX + box.maxX) / 2);
  const cy = Math.round((box.minY + box.maxY) / 2);
  const tables: DesignTable[] = clip.tables.map(({ seated: _s, order: _o, ...t }) => {
    void _s;
    void _o;
    return { ...t, position: { x: t.position.x - cx, y: t.position.y - cy } };
  });
  const placements: Placement[] = clip.placements
    .filter((p) => (p.tableId === undefined || tableIds.has(p.tableId)) && (p.perch === undefined || placementIds.has(p.perch.stageId)))
    .map(({ order: _o, over, ...p }) => {
      void _o;
      return {
        ...p,
        ...(over !== undefined && tableIds.has(over) ? { over } : {}),
        // A table item's position is an offset in its table's own frame; everything else is a point
        // in the room, and moves with the origin.
        position: p.tableId === undefined ? { x: p.position.x - cx, y: p.position.y - cy } : p.position,
      };
    });
  const grouped = new Set([...tables, ...placements].map((x) => x.groupId).filter((g): g is string => !!g));
  const groups: DesignGroup[] = clip.groups.filter((g) => grouped.has(g.id)).map((g) => ({ id: g.id, ...(g.number !== undefined ? { number: g.number } : {}) }));
  return { tables, placements, groups };
}

/** A TABLE SET: a composite made only of what stands on a table (and what hangs over it) — a
 *  centrepiece with its candlesticks, saved without the table. Its parts' positions are offsets in
 *  a TABLE's frame about the set's middle; it is placed ONTO the table it is dropped on (the studio's
 *  dropTableSet), never onto the floor. */
export function isTableSet(c: Composition): boolean {
  return c.tables.length === 0 && c.placements.some((p) => p.layer === "table") && c.placements.every((p) => p.layer === "table" || p.layer === "ceiling");
}

/** What a composite is made of, counted: each catalog variant with how many of it, tables first,
 *  and the chairs its tables seat. The drawer's list and the card's line. */
export function compositionCounts(c: Composition): { lines: { variantId: string; quantity: number; table: boolean }[]; seats: number } {
  const order: string[] = [];
  const counts = new Map<string, { variantId: string; quantity: number; table: boolean }>();
  const add = (variantId: string, quantity: number, table: boolean) => {
    const hit = counts.get(variantId);
    if (hit) hit.quantity += quantity;
    else {
      counts.set(variantId, { variantId, quantity, table });
      order.push(variantId);
    }
  };
  for (const t of c.tables) if (t.variantId) add(t.variantId, 1, true);
  for (const p of c.placements) add(p.variantId, p.quantity, false);
  const lines = order.map((id) => counts.get(id)!);
  return { lines: [...lines.filter((l) => l.table), ...lines.filter((l) => !l.table)], seats: c.tables.reduce((n, t) => n + (t.seats ?? 0), 0) };
}

/** What the parts of a composite add up to, the way a quote prices them per unit: each table and
 *  each item by its price (`priceOf` — the shade's, else its row's), and the chairs its tables seat
 *  by the chair each names, else `defaultChair`. `partial` when anything in it has no price or is
 *  priced by the metre — a figure the item cannot know until it stands somewhere. NEVER stored: a
 *  composite has no price of its own (see Composition), and its parts' prices change. */
export function compositionPrice(
  c: Composition,
  priceOf: (variantId: string) => { price?: number; perUnit: boolean } | undefined,
  defaultChair?: string,
  /** The vase an arrangement stands in (lib/catalog/vessel.ts vesselOf) — priced with it, as the quote
   *  prices it once placed. */
  vesselOf?: (p: Placement) => string | undefined,
): { total: number; partial: boolean } {
  let total = 0;
  let partial = false;
  const add = (variantId: string | undefined, n: number) => {
    if (n <= 0) return;
    const p = variantId ? priceOf(variantId) : undefined;
    if (!p || p.price === undefined || !p.perUnit) partial = true;
    else total += p.price * n;
  };
  for (const t of c.tables) {
    add(t.variantId, 1);
    add(t.chairVariantId ?? defaultChair, t.seats ?? 0);
  }
  for (const p of c.placements) {
    add(p.variantId, p.quantity);
    const vessel = vesselOf?.(p);
    if (vessel) add(vessel, p.quantity);
  }
  return { total, partial };
}

// ── Laying out a list of parts ──────────────────────────────────────────────────────────────────

/** Round tables stand this far apart, edge to edge — room for two rows of chairs between them. */
const ROUND_GAP_MM = 1500;
/** Free-standing items in their row, edge to edge. */
const ITEM_GAP_MM = 300;
/** From the tables' edge to the row of free-standing items — past the chairs. */
const ROW_GAP_MM = 1100;
/** A table with no measurement of its own (a hand-typed row), drawn at this. */
const FALLBACK_TABLE_MM = 1800;

/** A line's catalog row and the variant it places. */
function partOf(line: CompositionLine, lookup: (productId: string) => Product | undefined) {
  const product = lookup(line.productId);
  if (!product || !canBePart(product)) return null;
  const live = product.variants.filter((v) => !v.archived);
  const variantId = line.variantId && (line.variantId === product.id || product.variants.some((v) => v.id === line.variantId)) ? line.variantId : (live[0]?.id ?? product.id);
  return { product, variantId, quantity: Math.max(0, Math.round(line.quantity)) };
}

/**
 * The arrangement a list of parts makes, laid the way a designer would lay it:
 *
 *   • TABLES side by side along the item's length — pushed together into ONE block when every one
 *     of them is square-cornered (a head table of two rectangles is one table), set a walkway apart
 *     and left loose when any is round (two rounds pushed together seat nobody in the seam);
 *   • CHAIRS are the tables' chairs, not things on the floor: the first chair line names what stands
 *     round them (DesignTable.chairVariantId) and the lines' total is shared out as their seats — a
 *     table keeps its catalog seat count when the list names no number;
 *   • a CLOTH on each table in turn (a table wears one — a second of the same goes on as quantity);
 *   • what stands ON a table shared out between them in turn, laid out automatically on each;
 *   • what HANGS shared out over them in turn, linked to its table (Placement.over) and spread along it;
 *   • everything else set out in a row in front of the tables, past their chairs, turned to face
 *     them (a sofa's back, like a chair's, is its −y side).
 *
 * With no table at all, everything that can stand on the floor stands in the row, and what can only
 * stand on a table is left out — there is nothing to put it on. Drapes and other composites are never
 * parts (canBePart). Returns the item and its size: the box of the tables and the row, without
 * chairs, which is how the plan measures tables.
 */
export function layoutRecipe(
  recipe: CompositionLine[],
  lookup: (productId: string) => Product | undefined,
  newId: () => string,
): { composition: Composition; widthMm: number; depthMm: number } {
  const parts = recipe.map((line) => partOf(line, lookup)).filter((p): p is NonNullable<ReturnType<typeof partOf>> => !!p && p.quantity > 0);
  const isTable = (p: Product) => p.category === "tables";
  const isChair = (p: Product) => p.category === "chairs";

  // ── tables ──
  const tables: DesignTable[] = [];
  for (const part of parts.filter((x) => isTable(x.product))) {
    const d = part.product.dimensions;
    const seats = Number(part.product.categoryFields?.seats);
    for (let i = 0; i < part.quantity; i++) {
      tables.push({
        id: newId(),
        type: part.product.name,
        number: tables.length + 1,
        position: { x: 0, y: 0 },
        rotation: 0,
        variantId: part.variantId,
        ...(d.diameterMm ? { diameterMm: d.diameterMm } : { widthMm: d.widthMm || FALLBACK_TABLE_MM, depthMm: d.depthMm || FALLBACK_TABLE_MM }),
        ...(seats > 0 ? { seats } : {}),
      });
    }
  }
  const across = (t: DesignTable) => t.diameterMm ?? t.widthMm ?? FALLBACK_TABLE_MM;
  const deep = (t: DesignTable) => t.diameterMm ?? t.depthMm ?? FALLBACK_TABLE_MM;
  const block = tables.length >= 2 && tables.every((t) => !t.diameterMm);
  const gap = block ? 0 : ROUND_GAP_MM;
  const run = tables.reduce((n, t) => n + across(t), 0) + gap * Math.max(0, tables.length - 1);
  let x = -run / 2;
  for (const t of tables) {
    t.position = { x: x + across(t) / 2, y: 0 };
    x += across(t) + gap;
  }
  const groups: DesignGroup[] = [];
  if (block) {
    const g = { id: newId() };
    groups.push(g);
    for (const t of tables) t.groupId = g.id;
  }

  // ── chairs: the tables' own ──
  const chairParts = parts.filter((x) => isChair(x.product));
  const loose = [...parts.filter((x) => !isTable(x.product) && !isChair(x.product))];
  if (tables.length && chairParts.length) {
    const chair = chairParts[0].variantId;
    const total = chairParts.reduce((n, p) => n + p.quantity, 0);
    const each = Math.floor(total / tables.length);
    const extra = total % tables.length;
    tables.forEach((t, i) => {
      t.chairVariantId = chair;
      t.seats = each + (i < extra ? 1 : 0);
    });
  } else loose.push(...chairParts);

  // ── on, over and beside the tables ──
  const placements: Placement[] = [];
  const base = (variantId: string, layer: Placement["layer"], position: Point): Placement => ({ id: newId(), variantId, layer, quantity: 1, position, rotation: 0, scale: 1 });
  const hung = new Map<string, Placement[]>();
  const row: { part: (typeof parts)[number]; box: { widthMm: number; depthMm: number } }[] = [];
  let turn = 0; // whose turn it is, shared by every kind so two kinds of item alternate tables evenly
  for (const part of loose) {
    const p = part.product;
    const cover = anchorOf(p) === "table";
    if (tables.length && (cover || p.layer === "table")) {
      for (let i = 0; i < part.quantity; i++) {
        const t = tables[cover ? i % tables.length : turn++ % tables.length];
        const same = cover ? placements.find((x) => x.tableId === t.id && x.variantId === part.variantId) : undefined;
        if (same) same.quantity += 1;
        else placements.push({ ...base(part.variantId, "table", { x: 0, y: 0 }), tableId: t.id });
      }
      continue;
    }
    if (tables.length && p.layer === "ceiling") {
      for (let i = 0; i < part.quantity; i++) {
        const t = tables[turn++ % tables.length];
        const item = { ...base(part.variantId, "ceiling", t.position), over: t.id };
        hung.set(t.id, [...(hung.get(t.id) ?? []), item]);
        placements.push(item);
      }
      continue;
    }
    if (p.layer === "table") continue; // nothing to stand it on
    for (let i = 0; i < part.quantity; i++) row.push({ part, box: catalogBox(p) });
  }
  // What hangs over one table is spread along it, the ends a share in from its edges.
  for (const t of tables) {
    const list = hung.get(t.id) ?? [];
    list.forEach((item, j) => {
      item.position = { x: Math.round(t.position.x - across(t) / 2 + (across(t) * (j + 1)) / (list.length + 1)), y: t.position.y };
    });
  }
  // The row, in front of the tables (+y — the item's front, as a stage's is).
  const tableDepth = tables.reduce((n, t) => Math.max(n, deep(t)), 0);
  const rowTop = tables.length ? tableDepth / 2 + ROW_GAP_MM : 0;
  const rowRun = row.reduce((n, r) => n + r.box.widthMm, 0) + ITEM_GAP_MM * Math.max(0, row.length - 1);
  let rx = -rowRun / 2;
  for (const r of row) {
    const item = base(r.part.variantId, r.part.product.layer, { x: Math.round(rx + r.box.widthMm / 2), y: Math.round(rowTop + r.box.depthMm / 2) });
    placements.push(tables.length ? { ...item, rotation: 180 } : item);
    rx += r.box.widthMm + ITEM_GAP_MM;
  }

  // ── centred on its own box ──
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const take = (cx: number, cy: number, w: number, h: number) => {
    box.minX = Math.min(box.minX, cx - w / 2);
    box.maxX = Math.max(box.maxX, cx + w / 2);
    box.minY = Math.min(box.minY, cy - h / 2);
    box.maxY = Math.max(box.maxY, cy + h / 2);
  };
  for (const t of tables) take(t.position.x, t.position.y, across(t), deep(t));
  row.forEach((r, i) => {
    const p = placements[placements.length - row.length + i];
    take(p.position.x, p.position.y, r.box.widthMm, r.box.depthMm);
  });
  if (!Number.isFinite(box.minX)) return { composition: { tables: [], placements: [], groups: [], recipe }, widthMm: 0, depthMm: 0 };
  const composition = fromSelection({ tables, placements, groups }, box);
  return { composition: { ...composition, recipe }, widthMm: Math.round(box.maxX - box.minX), depthMm: Math.round(box.maxY - box.minY) };
}

/** A composite's catalog fields that follow from what it is made of: its size (the box its pieces
 *  stand in — what the rail's drag and the armed ghost measure guides against), and a drawing that
 *  is that box, written nothing inside — the pieces are what the card and the rail draw. */
export function compositeShell(widthMm: number, depthMm: number): Pick<Product, "category" | "layer" | "dimensions" | "appearance" | "categoryFields" | "variants" | "visibility"> {
  return {
    category: COMPOSITE_CATEGORY,
    layer: "floor",
    dimensions: { widthMm: Math.max(100, widthMm), depthMm: Math.max(100, depthMm), heightMm: 0 },
    appearance: { shape: "rect", content: "none", symbol: false },
    categoryFields: {},
    variants: [],
    // Its parts are this studio's own rows; another studio could place nothing it names.
    visibility: undefined,
  };
}

// ponytail: self-check. Run: npm run check:composition
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const product = (id: string, category: string, layer: Product["layer"], dims: Product["dimensions"], extra: Partial<Product> = {}): Product => ({
    id,
    name: id,
    category,
    layer,
    dimensions: dims,
    categoryFields: {},
    styleTags: [],
    variants: [],
    ...extra,
  });
  const catalog = new Map<string, Product>([
    ["rect", product("rect", "tables", "floor", { widthMm: 2400, depthMm: 1200, heightMm: 750 }, { categoryFields: { seats: 10 } })],
    ["round", product("round", "tables", "floor", { diameterMm: 1800, heightMm: 750 }, { categoryFields: { seats: 12 } })],
    ["cloth", product("cloth", "tablecloths", "table", { widthMm: 3000, depthMm: 1800, heightMm: 0 }, { variants: [{ id: "cloth-gold", name: "זהב" }] })],
    ["candle", product("candle", "candlesticks", "table", { diameterMm: 200, heightMm: 600 })],
    ["chandelier", product("chandelier", "chandeliers", "ceiling", { diameterMm: 900, heightMm: 800 })],
    ["chair", product("chair", "chairs", "floor", { widthMm: 450, depthMm: 500, heightMm: 900 })],
    ["sofa", product("sofa", "sofas", "floor", { widthMm: 2000, depthMm: 900, heightMm: 800 })],
    ["drape", product("drape", "curtains", "ceiling", { heightMm: 3000 })],
  ]);
  let seq = 0;
  const newId = () => `id${++seq}`;
  const lookup = (id: string) => catalog.get(id);
  const line = (productId: string, quantity: number, variantId?: string): CompositionLine => ({ id: `l-${productId}`, productId, quantity, ...(variantId ? { variantId } : {}) });

  // A head table: two rectangles, a cloth each, six candlesticks, a chandelier, 24 chairs.
  const head = layoutRecipe([line("rect", 2), line("cloth", 2), line("candle", 6), line("chandelier", 1), line("chair", 24)], lookup, newId);
  const hc = head.composition;
  assert(hc.tables.length === 2 && hc.groups.length === 1 && hc.tables.every((t) => t.groupId === hc.groups[0].id), "two rectangles are pushed into one block");
  assert(Math.abs(hc.tables[1].position.x - hc.tables[0].position.x) === 2400 && hc.tables[0].position.y === 0, "…touching, end to end");
  assert(hc.tables[0].position.x === -1200 && hc.tables[1].position.x === 1200, "…centred on the item's middle");
  assert(head.widthMm === 4800 && head.depthMm === 1200, `the item measures its tables (${head.widthMm}×${head.depthMm})`);
  assert(hc.tables.every((t) => t.seats === 12 && t.chairVariantId === "chair"), "24 chairs are the tables' 12 seats each, of that chair");
  const clothOn = (id: string) => hc.placements.filter((p) => p.tableId === id && p.variantId === "cloth-gold");
  assert(hc.tables.every((t) => clothOn(t.id).length === 1 && clothOn(t.id)[0].quantity === 1), "a cloth on each table, in the row's first shade");
  assert(hc.tables.every((t) => hc.placements.filter((p) => p.tableId === t.id && p.variantId === "candle").length === 3), "six candlesticks, three a table");
  const hungItem = hc.placements.find((p) => p.variantId === "chandelier");
  assert(!!hungItem && hungItem.layer === "ceiling" && hungItem.over === hc.tables[0].id && hungItem.position.x === hc.tables[0].position.x, "the chandelier hangs over a table's middle, linked to it");
  assert(!hc.placements.some((p) => p.variantId === "chair"), "chairs are seats, not floor items");
  assert(hc.recipe?.length === 5, "the list is kept, to be edited and laid out again");

  // Rounds are not pushed together; the row of floor items stands in front.
  const lounge = layoutRecipe([line("round", 2), line("sofa", 2), line("drape", 1)], lookup, newId);
  const lc = lounge.composition;
  assert(lc.groups.length === 0 && lc.tables.every((t) => !t.groupId), "round tables stay loose");
  assert(Math.abs(lc.tables[1].position.x - lc.tables[0].position.x) === 1800 + 1500, "…a walkway apart");
  const sofas = lc.placements.filter((p) => p.variantId === "sofa");
  assert(sofas.length === 2 && sofas.every((s) => s.position.y > lc.tables[0].position.y + 900), "the sofas stand in a row in front of the tables");
  assert(sofas.every((s) => s.rotation === 180), "…turned to face them");
  assert(!lc.placements.some((p) => p.variantId === "drape"), "a drape is never a part");
  assert(lc.tables.every((t) => t.seats === 12 && !t.chairVariantId), "with no chair line, a table keeps its catalog seats and the studio's chair");

  // No table: table items are left out, floor items still stand.
  const bare = layoutRecipe([line("candle", 3), line("sofa", 1)], lookup, newId);
  assert(bare.composition.placements.length === 1 && bare.composition.placements[0].variantId === "sofa", "a candlestick with no table to stand on is left out");
  assert(bare.composition.placements[0].position.x === 0 && bare.composition.placements[0].position.y === 0 && bare.composition.placements[0].rotation === 0, "…and the one sofa is the item's middle, as the catalog draws it");

  // Saved off a sketch: centred, what dangles let go.
  const clip: Clip = {
    tables: [{ id: "t1", type: "x", number: 4, position: { x: 5000, y: 3000 }, rotation: 0, widthMm: 2000, depthMm: 1000, seated: 8, order: 3, groupId: "g1" }],
    placements: [
      { id: "p1", variantId: "candle", layer: "table", quantity: 1, tableId: "t1", position: { x: 100, y: 0 }, rotation: 0, scale: 1 },
      { id: "p2", variantId: "candle", layer: "table", quantity: 1, tableId: "elsewhere", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "p3", variantId: "chandelier", layer: "ceiling", quantity: 1, over: "elsewhere", position: { x: 5500, y: 3000 }, rotation: 0, scale: 1 },
      { id: "p4", variantId: "sofa", layer: "floor", quantity: 1, position: { x: 5000, y: 4500 }, rotation: 0, scale: 1 },
    ],
    groups: [{ id: "g1", number: 4 }, { id: "unused" }],
  };
  const saved = fromSelection(clip, { minX: 4000, minY: 2500, maxX: 6000, maxY: 5000 });
  assert(saved.tables[0].position.x === 0 && saved.tables[0].position.y === -750, "the table is moved to the item's frame");
  assert(saved.tables[0].seated === undefined && saved.tables[0].order === undefined, "who sat there and the old stack stay behind");
  assert(saved.placements.some((p) => p.id === "p1" && p.position.x === 100), "a table item keeps its place on its table");
  assert(!saved.placements.some((p) => p.id === "p2"), "an item on a table left behind is let go");
  const freed = saved.placements.find((p) => p.id === "p3");
  assert(!!freed && freed.over === undefined && freed.position.x === 500, "a pendant over a table left behind hangs free, moved with the rest");
  assert(saved.placements.find((p) => p.id === "p4")!.position.y === 750, "a floor item moves with the origin");
  assert(saved.groups.length === 1 && saved.groups[0].id === "g1", "only the groups something still belongs to");

  const counted = compositionCounts(hc);
  assert(counted.lines[0].table && counted.lines[0].quantity === 2 && counted.seats === 24, "counted: two tables first, 24 seats");
  assert(counted.lines.find((l) => l.variantId === "candle")?.quantity === 6, "…and six candlesticks");
  const prices = new Map([["rect", 400], ["cloth-gold", 150], ["candle", 30], ["chandelier", 900], ["chair", 20]]);
  const priced = compositionPrice(hc, (id) => (prices.has(id) ? { price: prices.get(id), perUnit: true } : undefined));
  assert(!priced.partial && priced.total === 2 * 400 + 24 * 20 + 2 * 150 + 6 * 30 + 900, `the parts add up, chairs included (${priced.total})`);
  assert(compositionPrice(lc, (id) => (prices.has(id) ? { price: prices.get(id), perUnit: true } : undefined)).partial, "a part with no price makes the sum partial");
  // A set of what stands on a table, without it, is a TABLE SET — laid onto a table, not the floor.
  const chip = (id: string, layer: Placement["layer"]): Placement => ({ id, variantId: id, layer, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
  assert(isTableSet({ tables: [], placements: [chip("vase", "table"), chip("candle", "table")], groups: [] }), "a centrepiece and its candlesticks are a table set");
  assert(isTableSet({ tables: [], placements: [chip("vase", "table"), chip("pendant", "ceiling")], groups: [] }), "…with what hangs over them");
  assert(!isTableSet({ tables: [], placements: [chip("sofa", "floor"), chip("vase", "table")], groups: [] }), "a set with a sofa in it stands on the floor");
  assert(!isTableSet({ tables: [], placements: [chip("pendant", "ceiling")], groups: [] }), "nothing on a table, no table set");
  console.log("composition: ok");
}
