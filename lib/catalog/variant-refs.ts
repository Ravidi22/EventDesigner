// WHERE A DRAWING NAMES A CATALOG ROW — every JSON path, in one place (QA 2026-11-20, PR-1).
//
// A row may be deleted only while nothing names it; a row something names is archived instead, so
// no drawing ever points at nothing (F-4.5, lib/catalog/actions.ts removeProduct / isPlacedAnywhere,
// and the drawer's shade bin). A drawing names a row by VARIANT id — a row without shades by its own
// id — in far more places than `placements[].variantId`: a table's own row and the chair round it, a
// placement's vase and an aisle's piece, a stage's decks, its whole pieces and the rows its edges and
// floor are finished with. The delete used to ask the first three only, so a row used as a TABLE, a
// table's CHAIR or a stage DECK was hard-deleted, and every plan's table then resolved to nothing —
// the packing list and procurement dropped it.
//
// So the paths are listed HERE, once, and both halves read them: the delete's SQL (`namesAny` —
// over the design documents, the saved sketches, a client's proposals, a composite's arrangement and
// the studio's saved stages) and the JS reader the self-check holds the list to (`variantIdsIn`).
// A path is the small subset of SQL/JSON path the two share — `$` the value, `.key` a member, `[*]`
// every element of an array — so one string is the SQL's jsonpath and the JS walker's route.
//
// A NEW FIELD THAT NAMES A ROW GOES HERE. The type checks at the end of the list fail the build when
// one of the drawing's types grows a `variantId` / `…VariantId` / `…Variant` field this file does not
// name; a field named otherwise (a vessel, a piece, a stage's decks) has to be added by hand.
//
// Pure apart from drizzle's `sql` tag (no database, no connection): imported by the catalog's server
// actions and run on its own as a self-check — `npm run check:variant-refs`.
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { DesignTable, Placement, StageBuild, StagePiece, StageStair, StageLevel, StageTemplate } from "../design-document/types";
import type { CompositionLine } from "./types";

/** A path into a JSON value: `$`, then `.key` members, each optionally followed by `[*]`. */
export type VariantPath = `$${string}`;

const PATH = /^\$(\[\*\])?(\.[A-Za-z]+(\[\*\])?)*$/;

/** A TABLE's own row (DesignTable.variantId) and the chair round it (chairVariantId). */
export const TABLE_VARIANT_FIELDS = ["variantId", "chairVariantId"] as const satisfies readonly (keyof DesignTable)[];

/** The rows a STAGE's edges and floor are finished with (StageBuild) — one variant id each. */
export const STAGE_FINISH_FIELDS = [
  "stairsVariant",
  "skirtVariant",
  "benchVariant",
  "barrierVariant",
  "backdropVariant",
  "rampVariant",
  "surfaceVariant",
] as const satisfies readonly (keyof StageBuild)[];

/** The paths in a STAGE, relative to it: the decks it may be built from, its whole pieces (a hole
 *  names the deck whose box it leaves bare), and its finishes. */
const STAGE_PATHS: readonly string[] = ["decks[*]", "pieces[*].variantId", ...STAGE_FINISH_FIELDS];

/** The paths in a PLACEMENT, relative to it: its row, the vase it stands in, the piece that lines an
 *  aisle, and — on a stage — the stage's. */
const PLACEMENT_PATHS: readonly string[] = ["variantId", "vessel", "aisle.piece", ...STAGE_PATHS.map((p) => `stage.${p}`)];

/** Every path in a DRAWING — a design document, a saved sketch, a client's proposal (the drawing it
 *  forked and the one it sent back) — and in a composite's arrangement, which is the same `tables`
 *  and `placements` (lib/catalog/composition.ts — a Clip). */
export const DRAWING_VARIANT_PATHS: readonly VariantPath[] = [
  ...TABLE_VARIANT_FIELDS.map((f) => `$.tables[*].${f}` as const),
  ...PLACEMENT_PATHS.map((p) => `$.placements[*].${p}` as const),
];

/** …a composite's, which also keeps the list it was laid out from (Composition.recipe): a row there
 *  by its own id, and the shade it was picked in. */
export const COMPOSITION_VARIANT_PATHS: readonly VariantPath[] = [
  ...DRAWING_VARIANT_PATHS,
  "$.recipe[*].productId",
  "$.recipe[*].variantId",
];

/** …and the studio's saved stages (studio_settings.stage_templates — a list of StageTemplate): the
 *  stage, and what stood on its banquettes. */
export const STAGE_TEMPLATE_VARIANT_PATHS: readonly VariantPath[] = [
  ...STAGE_PATHS.map((p) => `$[*].stage.${p}` as const),
  "$[*].dressing[*].variantId",
];

// The guard. A key whose NAME says it holds a variant id — `variantId`, `chairVariantId`,
// `stairsVariant` — must be one this file reads; a type that grows one fails the build right here.
type VariantKey<T> = { [K in keyof T]-?: K extends "variantId" | `${string}VariantId` | `${string}Variant` ? K : never }[keyof T];
type Covers<T, Listed> = [Exclude<VariantKey<T>, Listed>] extends [never] ? true : false;
const complete: [
  Covers<DesignTable, (typeof TABLE_VARIANT_FIELDS)[number]>,
  Covers<Placement, "variantId">,
  Covers<StageBuild, (typeof STAGE_FINISH_FIELDS)[number]>,
  Covers<StagePiece, "variantId">,
  Covers<StageStair, never>,
  Covers<StageLevel, never>,
  Covers<NonNullable<StageTemplate["dressing"]>[number], "variantId">,
  Covers<CompositionLine, "variantId">,
] = [true, true, true, true, true, true, true, true];
void complete;

// ── The JS half ────────────────────────────────────────────────────────────────────────────────

type Step = { key: string; each: boolean } | { key: null; each: true };

function stepsOf(path: VariantPath): Step[] {
  if (!PATH.test(path)) throw new Error(`variant path "${path}" is not $ / .key / [*]`);
  const steps: Step[] = [];
  if (path.startsWith("$[*]")) steps.push({ key: null, each: true });
  for (const m of path.matchAll(/\.([A-Za-z]+)(\[\*\])?/g)) steps.push({ key: m[1], each: !!m[2] });
  return steps;
}

/** Every string at `path` in `value`, read the way the SQL's lax jsonpath reads it: a missing key,
 *  or a value of the wrong kind there, is simply nothing — never an error. (Lax also lets `.key`
 *  reach into the elements of an array, which is mirrored here, and `[*]` take a lone value as a list
 *  of one.) */
export function valuesAt(value: unknown, path: VariantPath): string[] {
  let at: unknown[] = [value];
  const spread = (list: unknown[]) => list.flatMap((v) => (Array.isArray(v) ? v : [v]));
  for (const step of stepsOf(path)) {
    if (step.key !== null) {
      at = spread(at).flatMap((v) => (v !== null && typeof v === "object" && !Array.isArray(v) && step.key in v ? [(v as Record<string, unknown>)[step.key]] : []));
    }
    if (step.each) at = spread(at);
  }
  return at.filter((v): v is string => typeof v === "string");
}

/** Every variant id `value` names at any of `paths`. */
export function variantIdsIn(value: unknown, paths: readonly VariantPath[]): Set<string> {
  return new Set(paths.flatMap((p) => valuesAt(value, p)));
}

// ── The SQL half ───────────────────────────────────────────────────────────────────────────────

/** SQL: does the jsonb `value` name any of `ids` at any of `paths`? One `exists` per path over
 *  `jsonb_path_query` in LAX mode, so a document missing a key, or holding the wrong kind of value
 *  there, is no match rather than an error that would fail every delete. Every id is its own bound
 *  parameter (the note in isPlacedAnywhere says why not `= any(array)`); a path is one of this file's
 *  constants, checked against PATH (no quote can reach the text), and written in as a jsonpath
 *  literal. `#>> '{}'` is the jsonb string's text, unquoted. */
export function namesAny(value: SQLWrapper, paths: readonly VariantPath[], ids: readonly string[]): SQL {
  if (paths.length === 0 || ids.length === 0) return sql`false`;
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const one = (path: VariantPath) => {
    stepsOf(path);
    return sql`exists (select 1 from jsonb_path_query(${value}, ${sql.raw(`'${path}'`)}::jsonpath) as vid where vid #>> '{}' in (${list}))`;
  };
  return sql`(${sql.join(paths.map(one), sql` or `)})`;
}
