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
