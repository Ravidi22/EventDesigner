// AN AISLE (שדרה) — the walk to the chuppah, lined with the same piece down both sides.
//
// 2026-11-13, the user (round 3 of the catalog push): "need to add new category שדרה" — the
// photographs' aisle of rose boxes, flower columns every two metres, lanterns along a white runner.
//
// One ROW of the catalog, one PLACEMENT on the plan. The row says WHICH PIECE lines it (another row
// of the same catalog: `categoryFields.piece`, a variant id — a vessel's pattern, lib/catalog/vessel.ts),
// how far apart the pieces stand, whether both sides are lined, and the runner down the middle
// (`MapAppearance.aisle`). The placement is a rectangle the designer stretches — its LENGTH along x,
// its width across — and may say otherwise for this plan (`Placement.aisle`). Everything else is
// DERIVED here, on every read: where each piece stands, how many there are, the runner's strip. The
// plan, the print and the room draw the piece as its own row draws it at every spot; the quote, the
// packing list and the florist's order count N of that piece (MeasureContext.aisleOf) — so a longer
// aisle is more boxes of roses on every surface at once, and nothing is typed twice.
//
// The aisle's own frame: the box about (0,0), length along x. A piece's FRONT is +y (every picture's
// convention), so the near side (−y) stands unturned looking across the walk and the far side is
// turned half round to look back at it.
//
// Pure — no catalog, no React. Self-checked: `npm run check:aisle`.
import type { Product } from "./types";
import { CATEGORY_BY_ID, anchorOf } from "./categories";
import { isMain } from "../self-check";

export const AISLE_CATEGORY = "aisles";
/** `categoryFields[AISLE_PIECE_FIELD]`: the variant id of the piece that lines the aisle. */
export const AISLE_PIECE_FIELD = "piece";

/** Centre to centre along a side when the row says nothing. */
export const AISLE_PITCH_MM = 1500;
export const AISLE_PITCH_MIN_MM = 100;
export const AISLE_PITCH_MAX_MM = 20000;
/** How far the runner stays off the pieces on either side when its width is not typed. */
export const AISLE_RUNNER_MARGIN_MM = 150;
export const AISLE_RUNNER_MIN_MM = 300;
export const AISLE_RUNNER_COLOUR = "#f4f1ea";
/** What a new aisle row is laid at before anyone measures it: 8 m long, 3 m across. */
export const AISLE_SIZE_MM = { widthMm: 8000, depthMm: 3000 } as const;
/** The spots a row with NO piece chosen is drawn with — a marker this big, so the aisle still reads. */
export const AISLE_GHOST_MM = { widthMm: 400, depthMm: 400 } as const;
/** No more pieces than this however long and tight (a typo of 1 cm apart on a 60 m aisle). */
export const AISLE_MAX_PIECES = 400;

export interface AisleRunner {
  /** Across the walk, mm. Absent = the walk less a margin either side. */
  widthMm?: number;
  /** Absent = AISLE_RUNNER_COLOUR. */
  colour?: string;
}

export interface AisleSpec {
  /** Centre to centre between pieces along a side, mm (absent = AISLE_PITCH_MM). A piece always
   *  stands at each end and the rest are spread evenly, as near this as a whole number comes; never
   *  closer than the piece is wide (touching = a hedge). */
  pitchMm?: number;
  /** `one` = a single row along the near side. Absent = both sides (`both` is stored only where it
   *  answers over a row's `one` — on a placement). */
  sides?: "one" | "both";
  /** The far side stands half a step along — pieces alternate across the walk. */
  stagger?: boolean;
  /** The strip down the walk. Absent = a runner in the default colour; `false` = bare floor. */
  runner?: AisleRunner | false;
}

/** What a placement may say for itself (Placement.aisle): any of the row's answers, and another piece
 *  (a variant id). Absent field = the row's. */
export interface AislePlacement extends AisleSpec {
  piece?: string;
}

export interface AisleSpot {
  x: number;
  y: number;
  /** Degrees on the plan, in the aisle's frame: 0 on the near side, 180 on the far. */
  rotation: number;
  side: -1 | 1;
}

export interface AisleLayout {
  spots: AisleSpot[];
  /** The strip, centred on (0, y) in the aisle's frame — or null: switched off, or no walk to lay it in. */
  runner: { widthMm: number; lengthMm: number; y: number; colour: string } | null;
  /** The step actually laid, centre to centre (0 with one piece a side). */
  pitchMm: number;
  /** The clear walk between the two sides (or beside the one), mm. */
  walkMm: number;
  perSide: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
const whole = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined;

/** A stored spec as the layout may trust it: whole millimetres in range, a real colour, nothing else. */
export function cleanAisle(raw: unknown): AisleSpec {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: AisleSpec = {};
  const pitch = whole(s.pitchMm, AISLE_PITCH_MIN_MM, AISLE_PITCH_MAX_MM);
  if (pitch !== undefined) out.pitchMm = pitch;
  if (s.sides === "one" || s.sides === "both") out.sides = s.sides;
  if (typeof s.stagger === "boolean") out.stagger = s.stagger;
  if (s.runner === false) out.runner = false;
  else if (s.runner && typeof s.runner === "object") {
    const r = s.runner as Record<string, unknown>;
    const runner: AisleRunner = {};
    const w = whole(r.widthMm, AISLE_RUNNER_MIN_MM, 20000);
    if (w !== undefined) runner.widthMm = w;
    if (typeof r.colour === "string" && HEX.test(r.colour)) runner.colour = r.colour.toLowerCase();
    if (Object.keys(runner).length) out.runner = runner;
  }
  return out;
}

/** The row's spec (MapAppearance.aisle), cleaned. */
export const aisleSpecOf = (product: Pick<Product, "appearance"> | undefined): AisleSpec => cleanAisle(product?.appearance?.aisle);

/** The row's answers under the placement's own: a field the placement does not carry is the row's. */
export function mergedAisle(row: AisleSpec, own: AislePlacement | undefined): AisleSpec {
  if (!own) return row;
  const { piece: _piece, ...mine } = own;
  void _piece;
  return { ...row, ...cleanAisle(mine) };
}

/** `prev` with `patch` laid over it, keeping only what differs from the defaults — an aisle that is
 *  all defaults stores nothing (undefined). For the ROW's spec. */
export function aislePatch(prev: AisleSpec | undefined, patch: Partial<AisleSpec>): AisleSpec | undefined {
  const next = cleanAisle({ ...prev, ...patch });
  if (next.pitchMm === AISLE_PITCH_MM) delete next.pitchMm;
  if (next.sides === "both") delete next.sides;
  if (next.stagger === false) delete next.stagger;
  return Object.keys(next).length ? next : undefined;
}

/** May this row line an aisle? A thing of a size that stands on something — a flower box, a column, a
 *  lantern, a tree — never a table, a stage part, a cloth, a drape, a hung piece, a composite or
 *  another aisle. */
export function canBeAislePiece(p: Pick<Product, "category" | "layer" | "name" | "dimensions" | "archived" | "composition"> | undefined): boolean {
  if (!p || p.archived || p.composition) return false;
  const cat = CATEGORY_BY_ID[p.category];
  if (!cat || cat.sizing === "stretch" || cat.id === AISLE_CATEGORY || cat.id === "composites") return false;
  if (cat.group === "grp-stages" || cat.group === "grp-seating" || cat.group === "grp-chuppahs") return cat.id === "chairs" || cat.id === "sofas";
  if (p.layer === "ceiling") return false;
  return anchorOf(p) === "free";
}

/** Where everything stands, in the aisle's own frame. `piece` is the lining piece's box as its row
 *  draws it (width along the aisle, depth across); null = none chosen yet, and the spots are markers. */
export function aisleLayout(box: { widthMm: number; depthMm: number }, piece: { widthMm: number; depthMm: number } | null, spec: AisleSpec): AisleLayout {
  const L = Math.max(0, box.widthMm);
  const W = Math.max(0, box.depthMm);
  const pw = Math.max(1, (piece ?? AISLE_GHOST_MM).widthMm);
  const pd = Math.max(1, (piece ?? AISLE_GHOST_MM).depthMm);
  const one = spec.sides === "one";
  // Along: a piece flush at each end, the rest spread evenly at the nearest whole count to the
  // pitch asked for — and never overlapping.
  const usable = L - pw;
  const want = Math.max(spec.pitchMm ?? AISLE_PITCH_MM, pw);
  let n = usable <= 0 ? 1 : Math.max(2, Math.round(usable / want) + 1);
  while (n > 2 && usable / (n - 1) < pw - 0.5) n--;
  n = Math.min(n, Math.floor(AISLE_MAX_PIECES / (one ? 1 : 2)) || 1);
  const pitch = n > 1 ? usable / (n - 1) : 0;
  const xs = n > 1 ? Array.from({ length: n }, (_, i) => -usable / 2 + i * pitch) : [0];
  // Across: each side's pieces stand inside the box's long edge.
  const off = Math.max(pd / 2, W / 2 - pd / 2);
  const spots: AisleSpot[] = xs.map((x) => ({ x, y: -off, rotation: 0, side: -1 as const }));
  if (!one) {
    const far = spec.stagger && n > 1 ? xs.slice(0, -1).map((x) => x + pitch / 2) : xs;
    for (const x of far) spots.push({ x, y: off, rotation: 180, side: 1 });
  }
  const walk = Math.max(0, one ? W - pd : W - 2 * pd);
  // The runner: down the middle of the walk (beside the one row, when only one side is lined).
  let runner: AisleLayout["runner"] = null;
  if (spec.runner !== false && walk >= AISLE_RUNNER_MIN_MM && L > 0) {
    const asked = spec.runner?.widthMm;
    const widthMm = Math.min(walk, asked ?? Math.max(AISLE_RUNNER_MIN_MM, walk - 2 * AISLE_RUNNER_MARGIN_MM));
    runner = { widthMm, lengthMm: L, y: one ? pd / 2 : 0, colour: spec.runner?.colour ?? AISLE_RUNNER_COLOUR };
  }
  return { spots, runner, pitchMm: Math.round(pitch), walkMm: Math.round(walk), perSide: n };
}

/** The size an aisle row is laid at before a plan stretches it: its own typed size, else AISLE_SIZE_MM. */
export function aisleRowBox(row: Pick<Product, "dimensions">): { widthMm: number; depthMm: number } {
  const { widthMm, depthMm } = row.dimensions;
  return widthMm && depthMm ? { widthMm, depthMm } : { ...AISLE_SIZE_MM };
}

/** What an aisle placement BRINGS beside its own row: N of the piece that lines it — for a caller with
 *  no catalog cache (the server's procurement: `productOf` is its own map). Undefined for anything
 *  that is not an aisle, or an aisle with no live piece. */
export function aisleBringsOf(
  p: { variantId: string; sizeMm?: { widthMm: number; depthMm: number }; aisle?: AislePlacement },
  productOf: (variantId: string) => Product | undefined,
  boxOf: (product: Product) => { widthMm: number; depthMm: number },
): { variantId: string; count: number } | undefined {
  const row = productOf(p.variantId);
  if (!row || row.category !== AISLE_CATEGORY) return undefined;
  const named = p.aisle?.piece ?? row.categoryFields[AISLE_PIECE_FIELD];
  if (typeof named !== "string" || !named) return undefined;
  const piece = productOf(named);
  if (!piece || !canBeAislePiece(piece)) return undefined;
  const layout = aisleLayout(p.sizeMm ?? aisleRowBox(row), boxOf(piece), mergedAisle(aisleSpecOf(row), p.aisle));
  return { variantId: named, count: layout.spots.length };
}

/** "14 פריטים · כל 1.45 מ׳" — what the bar and the drawer read back. */
export function aisleWords(l: AisleLayout): string {
  const n = l.spots.length;
  const count = n === 1 ? "פריט אחד" : `${n} פריטים`;
  if (l.pitchMm <= 0) return count;
  const m = l.pitchMm / 1000;
  return `${count} · כל ${m.toFixed(m % 1 === 0 ? 0 : 2).replace(/0$/, "")} מ׳`;
}

if (isMain(import.meta.url)) {
  let n = 0;
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
    n++;
  };
  const box = { widthMm: 8000, depthMm: 3000 };
  const rose = { widthMm: 600, depthMm: 500 };

  const a = aisleLayout(box, rose, {});
  // usable 7400 / 1500 → 4.93 → 5 steps → 6 a side.
  assert(a.perSide === 6 && a.spots.length === 12, `both sides are lined, a piece every ~1.5 m (${a.perSide}, ${a.spots.length})`);
  assert(a.spots[0].x === -3700 && a.spots[5].x === 3700, "a piece stands flush at each end");
  assert(a.pitchMm === 1480, `…the rest spread evenly (${a.pitchMm})`);
  assert(a.spots[0].y === -1250 && a.spots[6].y === 1250, "each side stands inside the box's long edge");
  assert(a.spots[0].rotation === 0 && a.spots[6].rotation === 180, "the near side looks across the walk, the far side looks back");
  assert(a.walkMm === 2000 && a.runner?.widthMm === 1700 && a.runner.lengthMm === 8000 && a.runner.y === 0, "the runner lies down the middle of the walk, a margin off the pieces");
  assert(a.runner?.colour === AISLE_RUNNER_COLOUR, "…in the default colour");

  // Longer aisle, more pieces — the ends still flush.
  const long = aisleLayout({ widthMm: 12500, depthMm: 3000 }, rose, {});
  assert(long.perSide === 9 && long.spots[0].x === -5950, `stretched, it gains pieces (${long.perSide})`);

  // Touching: a hedge.
  const hedge = aisleLayout(box, rose, { pitchMm: 100 });
  assert(hedge.perSide === 13 && hedge.pitchMm >= 600, `pieces never overlap — a pitch under the piece's width is a hedge (${hedge.perSide}, ${hedge.pitchMm})`);

  const one = aisleLayout(box, rose, { sides: "one" });
  assert(one.spots.length === 6 && one.spots.every((s) => s.side === -1), "one side only");
  assert(one.walkMm === 2500 && one.runner?.y === 250, "…the walk and its runner beside the row");

  const stag = aisleLayout(box, rose, { stagger: true });
  assert(stag.spots.length === 11 && stag.spots[6].x === -3700 + stag.pitchMm / 2, "staggered: the far side stands half a step along, one fewer");

  assert(aisleLayout(box, rose, { runner: false }).runner === null, "no runner when switched off");
  assert(aisleLayout({ widthMm: 8000, depthMm: 1100 }, rose, {}).runner === null, "…nor where the pieces leave no walk");
  const red = aisleLayout(box, rose, { runner: { widthMm: 5000, colour: "#aa0000" } });
  assert(red.runner?.widthMm === 2000 && red.runner.colour === "#aa0000", "a typed runner is held to the walk, in its own colour");

  const short = aisleLayout({ widthMm: 500, depthMm: 3000 }, rose, {});
  assert(short.perSide === 1 && short.spots[0].x === 0 && short.pitchMm === 0, "an aisle shorter than its piece holds one a side, in the middle");
  const ghost = aisleLayout(box, null, {});
  assert(ghost.spots.length === 12, "no piece chosen: the spots are still laid, as markers");
  assert(aisleLayout({ widthMm: 60000, depthMm: 3000 }, { widthMm: 10, depthMm: 10 }, { pitchMm: 100 }).spots.length <= AISLE_MAX_PIECES, "never more than the cap");

  // Cleaning and patching.
  assert(JSON.stringify(cleanAisle({ pitchMm: 1234.4, sides: "two", stagger: 1, runner: { colour: "red", widthMm: 10 } })) === '{"pitchMm":1234,"runner":{"widthMm":300}}', "a stored spec is cleaned");
  assert(aislePatch({ sides: "one" }, { sides: "both", stagger: false }) === undefined, "both sides and no stagger are the defaults — a row stores neither");
  assert(aislePatch(undefined, { pitchMm: AISLE_PITCH_MM }) === undefined, "the defaults store nothing");
  assert(JSON.stringify(aislePatch({ pitchMm: 900 }, { sides: "one" })) === '{"pitchMm":900,"sides":"one"}', "a patch keeps what was set");
  assert(aislePatch({ sides: "one", stagger: true }, { sides: undefined, stagger: false }) === undefined, "…and lets go of what went back to the default");
  const merged = mergedAisle({ pitchMm: 900, sides: "one", stagger: true }, { piece: "v1", stagger: false, runner: false });
  assert(merged.pitchMm === 900 && merged.sides === "one" && merged.stagger === false && merged.runner === false, "a placement's own answers lie over its row's");
  assert(mergedAisle({ sides: "one" }, { sides: "both" }).sides === "both", "…both sides again on one plan");

  // Which rows may line an aisle.
  const row = (category: string, layer: Product["layer"] = "floor", extra: Partial<Product> = {}) => ({ category, layer, name: "x", dimensions: { heightMm: 100 }, ...extra });
  assert(canBeAislePiece(row("flower-arrangements", "table")) && canBeAislePiece(row("columns")) && canBeAislePiece(row("candlesticks", "table")) && canBeAislePiece(row("trees")), "flowers, columns, candlesticks and trees line an aisle");
  assert(canBeAislePiece(row("chairs")), "…and so does a row of chairs");
  assert(!canBeAislePiece(row("tables")) && !canBeAislePiece(row("stages")) && !canBeAislePiece(row("rugs")) && !canBeAislePiece(row("curtains", "ceiling")), "a table, a stage, a rug and a drape do not");
  assert(!canBeAislePiece(row("chandeliers", "ceiling")) && !canBeAislePiece(row(AISLE_CATEGORY)) && !canBeAislePiece(row("columns", "floor", { archived: true })), "nor a hung piece, another aisle, an archived row");
  assert(!canBeAislePiece(row("tablecloths", "table")), "a cloth does not");

  // The count a caller with its own catalog map reads.
  const cat: Record<string, Product> = {
    walk: { id: "walk", name: "שדרה", category: AISLE_CATEGORY, layer: "floor", dimensions: { widthMm: 8000, depthMm: 3000, heightMm: 0 }, categoryFields: { [AISLE_PIECE_FIELD]: "rose" }, styleTags: [], variants: [] },
    rose: { id: "rose", name: "קופסת ורדים", category: "flower-arrangements", layer: "floor", dimensions: { widthMm: 600, depthMm: 500, heightMm: 700 }, categoryFields: {}, styleTags: [], variants: [] },
    col: { id: "col", name: "עמוד", category: "columns", layer: "floor", dimensions: { diameterMm: 400, heightMm: 2000 }, categoryFields: {}, styleTags: [], variants: [] },
  };
  const boxOf = (x: Product) => ({ widthMm: x.dimensions.widthMm ?? x.dimensions.diameterMm ?? 0, depthMm: x.dimensions.depthMm ?? x.dimensions.diameterMm ?? 0 });
  const brings = (p: Parameters<typeof aisleBringsOf>[0]) => aisleBringsOf(p, (id) => cat[id], boxOf);
  assert(brings({ variantId: "walk" })?.count === 12 && brings({ variantId: "walk" })?.variantId === "rose", "an aisle brings N of its row's piece");
  assert(brings({ variantId: "walk", sizeMm: { widthMm: 12500, depthMm: 3000 } })?.count === 18, "…more when the plan stretched it");
  assert(brings({ variantId: "walk", aisle: { piece: "col", sides: "one" } })?.variantId === "col" && brings({ variantId: "walk", aisle: { piece: "col", sides: "one" } })?.count === 6, "…and a placement's own piece and sides");
  assert(brings({ variantId: "rose" }) === undefined && brings({ variantId: "walk", aisle: { piece: "gone" } }) === undefined, "nothing for another row, or a piece that is gone");

  assert(aisleWords(a) === "12 פריטים · כל 1.48 מ׳" && aisleWords(short) === "2 פריטים", `read back in words (${aisleWords(a)})`);
  console.log(`aisle self-check passed (${n})`);
}
