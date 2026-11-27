// The flower spec of an arrangement — what it is MADE of, as rows, not as a note.
//
// A סידור פרחים used to carry one number (categoryFields.stems) and whatever the designer typed in
// the free spec: "12 ורדים, 5 פיאוניות, אקליפטוס". The number fed the packing list and the florist
// order; the text fed nobody. These helpers are the seam between the structured list a drawer edits
// (Product.flowers) and the two things downstream actually need from it: the stem total, which
// stays the count-multiplier every other surface already reads, and the per-flower breakdown the
// florist is phoned with.
//
// THE TOTAL IS DERIVED. When an arrangement has lines, `categoryFields.stems` is their sum and the
// drawer will not let it be typed — the one place a typed total still lives is an arrangement with
// no lines at all, which is the designer saying "180 stems, don't ask me which". Pure, no React, no
// catalog registry: `npm run check:flowers`.
import type { FlowerLine, Product } from "./types";
import { FLOWER_VOCABULARY, colourOfName, isFlowerKindId, kindOfName, normalizeFlowerName, type FlowerKindId } from "./flower-kinds";

/** A starting vocabulary for the name field, the way STYLE_TAGS is for tags: the flowers an Israeli
 *  event florist is asked for most, singular, as a spec would list them — the kinds the plan can
 *  draw (lib/catalog/flower-kinds.ts). The drawer offers them as suggestions and takes anything
 *  typed — see knownFlowersOf. */
export const FLOWER_NAMES: string[] = FLOWER_VOCABULARY.map((v) => v.name);

/** The names to suggest: the built-ins first, then every name this catalog already uses — so an
 *  arrangement's "ורד" and the next one's are spelt the same way, and a flower the list never heard
 *  of appears once it has been typed once. */
export const flowerNamesOf = (products: readonly { flowers?: FlowerLine[] }[]): string[] => [
  ...new Set([...FLOWER_NAMES, ...products.flatMap((p) => (p.flowers ?? []).map((f) => f.name))]),
];

/** One flower the drawer can offer by name: what it draws as, the colour it comes in when it is a
 *  real product of one colour, and where it is from (a supplier's name, for the row's hint). */
export interface KnownFlower {
  name: string;
  kind: FlowerKindId;
  colour?: string;
  /** "בוקי פרחים" for a marketplace row, absent for the built-in vocabulary and the studio's own. */
  source?: string;
}

/**
 * Everything the drawer offers in a flower row: the built-in vocabulary, then the names this
 * catalog's arrangements already use (so one studio spells "ורד" one way), then the stems the
 * marketplace sells (`market` — fetched by the catalog page from lib/marketplace/actions.ts).
 * One entry per name; the first wins, so a built-in keeps its kind and a marketplace flower keeps
 * its colour.
 */
export function knownFlowersOf(products: readonly { flowers?: FlowerLine[] }[], market: readonly KnownFlower[] = []): KnownFlower[] {
  const out: KnownFlower[] = [];
  const seen = new Set<string>();
  const add = (k: KnownFlower) => {
    const key = normalizeFlowerName(k.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(k);
  };
  for (const v of FLOWER_VOCABULARY) add({ name: v.name, kind: v.kind });
  for (const p of products) for (const f of p.flowers ?? []) add({ name: f.name.trim(), kind: isFlowerKindId(f.kind) ? f.kind : kindOfName(f.name), colour: f.colour });
  for (const m of market) add(m);
  return out;
}

/** A marketplace stem as a known flower: its kind by its name (with the category's fallback — an
 *  unrecognised green is still green), its colour from its one shade, else from its name. */
export function knownFlowerOfProduct(p: Pick<Product, "name" | "category" | "variants">, source: string | undefined, fallback: FlowerKindId): KnownFlower {
  const swatches = p.variants.filter((v) => !v.archived && v.swatch);
  return {
    name: p.name.trim(),
    kind: kindOfName(p.name, fallback),
    colour: swatches.length === 1 ? swatches[0].swatch : colourOfName(p.name),
    source,
  };
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** What is kept on save: trimmed names, whole positive quantities, and no row without both; a kind
 *  only when it is one the plan knows, a colour only when it is a colour. An empty list is
 *  `undefined` — absent IS "no spec", the same way an absent variant list is "no shades", and
 *  keeping one spelling is what makes save → reload lossless. */
export function cleanFlowers(lines: readonly FlowerLine[] | undefined): FlowerLine[] | undefined {
  const kept = (lines ?? [])
    .map((l): FlowerLine => {
      const { kind, colour, ...rest } = l;
      const out: FlowerLine = { ...rest, name: l.name.trim(), qty: Math.max(0, Math.round(l.qty)) };
      if (isFlowerKindId(kind)) out.kind = kind;
      if (typeof colour === "string" && HEX.test(colour.trim())) out.colour = colour.trim().toLowerCase();
      return out;
    })
    .filter((l) => l.name !== "" && l.qty > 0);
  return kept.length ? kept : undefined;
}

/** Stems in one arrangement, from its lines. 0 for no lines — callers that want the typed fallback
 *  use stemsOf. */
export const stemCount = (lines: readonly FlowerLine[] | undefined): number =>
  (lines ?? []).reduce((n, l) => n + (l.qty > 0 ? l.qty : 0), 0);

/** The stem count every surface multiplies by: the lines' sum when there are lines, else whatever
 *  was typed into the category field. One answer, so the drawer, the packing list and procurement
 *  cannot disagree about how many stems an arrangement is. */
export function stemsOf(p: Pick<Product, "flowers" | "categoryFields">): number {
  if (p.flowers?.length) return stemCount(p.flowers);
  const typed = Number(p.categoryFields?.stems ?? 0);
  return Number.isFinite(typed) && typed > 0 ? typed : 0;
}

/** "ורד ×12 · פיאוני ×5 · אקליפטוס ×8" — one line for a card or a sheet. Name × count rather than
 *  a Hebrew plural, which no list of flower names can supply for every entry. */
export const flowerSummary = (lines: readonly FlowerLine[] | undefined): string =>
  (lines ?? [])
    .filter((l) => l.name.trim() !== "" && l.qty > 0)
    .map((l) => `${l.name.trim()} ×${l.qty}`)
    .join(" · ");
