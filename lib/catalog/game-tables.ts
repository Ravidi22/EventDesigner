// A BILLIARD TABLE (2026-11-20, the user: "I want to be able to add a pool table" — the game table,
// in a venue's lounge): category `game-tables` "שולחנות משחק" (lib/catalog/categories.ts), drawn as
// the `billiard` picture. ONE layout for the plan (components/item-symbol.tsx billiardSymbol) and the
// room (lib/scene/floor-kinds.ts billiardBody), read off the table's box: the rails round the cloth,
// the six pockets — a corner pocket at each corner of the cloth and a side pocket in the middle of
// each long rail — the sights along the rails, the head string a quarter of the way down the cloth
// and the foot spot three quarters of the way. The cloth is the row's shade (green when it has none);
// the rails are wood.
//
// `BILLIARD_TABLE` is the standard 8-foot table the /halls rail offers every business (a venue owner
// has no catalog — lib/venues/add-tools.ts): 254 × 142 cm, 79 cm to the rail. A studio makes its own
// rows in the category as any other. Pure. `npm run check:billiard`.
import type { Product } from "./types";
import { isMain } from "../self-check";

export const GAME_TABLES_CATEGORY = "game-tables";

/** Green baize — the cloth of a table whose shade says nothing. */
export const BILLIARD_CLOTH = "#2F6B4F";
/** The rails and the cabinet: dark polished wood. */
export const BILLIARD_WOOD = "#5B3A29";
/** Inside a pocket. */
export const BILLIARD_POCKET = "#15110E";

export const BILLIARD_TABLE: Product = {
  id: "standard:billiard-table",
  name: "שולחן ביליארד",
  category: GAME_TABLES_CATEGORY,
  layer: "floor",
  dimensions: { widthMm: 2540, depthMm: 1420, heightMm: 790 },
  categoryFields: {},
  styleTags: [],
  variants: [{ id: "standard:billiard-table:green", name: "ירוק", swatch: BILLIARD_CLOTH }],
  appearance: { shape: "rect", content: "none" },
};

export interface BilliardLayout {
  /** The long side runs along x (else along y). */
  alongX: boolean;
  /** The rail's width all round (the cabinet's wood between the edge and the cloth). */
  railMm: number;
  /** The cloth, centred. */
  cloth: { w: number; h: number };
  /** The six pockets' centres and radius. */
  pockets: { x: number; y: number }[];
  pocketMm: number;
  /** The sights (diamonds) on the rails' tops. */
  sights: { x: number; y: number }[];
  /** The head string, across the cloth a quarter of its length from one end: its two ends. */
  headString: [{ x: number; y: number }, { x: number; y: number }];
  /** The foot spot, where the rack is set. */
  footSpot: { x: number; y: number };
}

/** The table laid in a `w` × `h` box about its centre. */
export function billiardLayout(w: number, h: number): BilliardLayout {
  const alongX = w >= h;
  const L = alongX ? w : h; // the long side
  const S = alongX ? h : w; // the short side
  // An 8-foot table's rail is ~14 cm on 142 — a tenth of the short side, held to sense.
  const railMm = Math.max(20, Math.min(S * 0.1, 180));
  const cl = Math.max(1, L - 2 * railMm);
  const cs = Math.max(1, S - 2 * railMm);
  const pocketMm = Math.max(10, Math.min(railMm * 0.62, cs * 0.06));
  // In the table's own (long, short) frame, then turned to x/y.
  const at = (u: number, v: number) => (alongX ? { x: u, y: v } : { x: v, y: u });
  const pockets = [
    at(-cl / 2, -cs / 2), at(0, -cs / 2 - pocketMm * 0.25), at(cl / 2, -cs / 2),
    at(-cl / 2, cs / 2), at(0, cs / 2 + pocketMm * 0.25), at(cl / 2, cs / 2),
  ];
  // Three sights between each pair of pockets on a long rail, three on each short rail, on the
  // rail's middle line.
  const mid = cs / 2 + railMm / 2;
  const sights: { x: number; y: number }[] = [];
  for (const side of [-1, 1]) {
    for (const k of [1, 2, 3]) {
      sights.push(at(-cl / 2 + (k * cl) / 8, side * mid), at((k * cl) / 8, side * mid));
      sights.push(at(side * (cl / 2 + railMm / 2), -cs / 2 + (k * cs) / 4));
    }
  }
  return {
    alongX,
    railMm,
    cloth: alongX ? { w: cl, h: cs } : { w: cs, h: cl },
    pockets,
    pocketMm,
    sights,
    headString: [at(-cl / 4, -cs / 2), at(-cl / 4, cs / 2)],
    footSpot: at(cl / 4, 0),
  };
}

// ponytail: self-check. Run: npm run check:billiard
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const t = billiardLayout(2540, 1420);
  assert(t.alongX && t.railMm === 142 && t.cloth.w === 2540 - 284 && t.cloth.h === 1420 - 284, "an 8-foot table: 14.2 cm rails round a 2.26 × 1.14 m cloth");
  assert(t.pockets.length === 6 && t.pockets.filter((p) => Math.abs(p.x) < 1e-9).length === 2, "six pockets — two of them in the middle of the long rails");
  assert(t.pockets.every((p) => Math.abs(p.x) <= 2540 / 2 && Math.abs(p.y) <= 1420 / 2), "…all inside the table");
  assert(t.sights.length === 18, "three sights between each pair of pockets, three on each short rail");
  assert(t.headString[0].x < 0 && t.footSpot.x > 0 && t.footSpot.y === 0, "the head string at one end, the foot spot at the other, on the middle line");
  const up = billiardLayout(1420, 2540);
  assert(!up.alongX && up.cloth.h === t.cloth.w && up.pockets.filter((p) => Math.abs(p.y) < 1e-9).length === 2, "laid the long way down, the same table turned");
  assert(BILLIARD_TABLE.category === GAME_TABLES_CATEGORY && BILLIARD_TABLE.unitPrice === undefined, "the standard table carries no price");
  console.log("billiard ok");
}
