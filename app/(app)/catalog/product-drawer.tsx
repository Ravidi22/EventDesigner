"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Amphora,
  Banknote,
  Check,
  ChevronDown,
  Circle,
  Combine,
  Eye,
  FileText,
  Flower2,
  Route,
  ImagePlus,
  Layers,
  PackageCheck,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  FRONT_THICK_MM,
  PRICE_UNIT_LABEL,
  ROUND_FIELD,
  SHAPE_LABEL,
  usesDiameter,
  STOCK_KIND_HINT,
  STOCK_KIND_LABEL,
  STOCK_KINDS,
  VISIBILITY_LABEL,
  VISIBILITY_HINT,
  type FlowerLine,
  type Product,
  type Variant,
  type MapAppearance,
  type MapShape,
  type PriceUnit,
  type StockKind,
} from "@/lib/catalog/types";
import { cleanFlowers, knownFlowersOf, stemCount, type KnownFlower } from "@/lib/catalog/flowers";
import { FLOWER_KIND_BY_ID, type FlowerKindId, type FlowerRole } from "@/lib/catalog/flower-kinds";
import { DEFAULT_SHADE } from "@/lib/catalog/flower-draw";
import { FlowerHead } from "@/components/flower-symbol";
import { ComboField, type ComboOption } from "@/components/combo-field";
import { costUnitLabel } from "@/lib/suppliers/procurement";
import { useSupplierPicker } from "@/lib/suppliers/use-suppliers";
import { SupplierSelect } from "@/app/(app)/suppliers/supplier-select";
import { catalogBox, frontFace, resolveContent, resolveFootprint, roundSizeMm, rowShapeDims } from "@/lib/studio/footprint";
import { RESIZE_DEFAULT_STEP_MM, type ResizeSpec } from "@/lib/catalog/types";
import { HANG_FIELD, HANG_MAX_MM } from "@/lib/studio/hang";
import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_GROUPS, LAYERS, PLACES, categoryNamed, styleTagsOf, type CategoryDef } from "@/lib/catalog/categories";
import { CANDLE_STYLE_LABEL, CHAIR_STYLE_LABEL, SYMBOL_STYLES, chairStyleOf, drawStyleOf, symbolOf } from "@/lib/catalog/symbols";
import { CHUPPAH_ROOF_LABEL, chuppahDrawOf, chuppahOf } from "@/lib/catalog/chuppah";
import { rescaleOutline } from "@/lib/catalog/shape-list";
import { isPlacedAnywhere, isStandardProduct } from "@/lib/catalog/actions";
import { acceptSourcePrice, fetchSourceStatus } from "@/lib/marketplace/actions";
import type { SourceStatus } from "@/lib/marketplace/types";
import { formatPrice } from "@/lib/catalog/format";
import { useIsSupplier } from "@/components/org-kind-context";
import { canDelete, offeredCategories } from "@/lib/catalog/built-in";
import { Button } from "@/components/button";
import { Drawer } from "@/components/drawer";
import { FoldRow } from "@/components/fold-row";
import { SearchInput } from "@/components/search-input";
import { TagToggle } from "@/components/tag-toggle";
import { SwitchRow } from "@/components/toggle";
import { Select } from "@/components/select";
import { loadProducts } from "@/lib/catalog/storage";
import { VESSEL_HOLDERS } from "@/lib/catalog/vessel";
import { AISLE_CATEGORY, AISLE_PIECE_FIELD, AISLE_SIZE_MM, aislePatch, aisleSpecOf, aisleWords } from "@/lib/catalog/aisle";
import { aisleViewOf } from "@/lib/studio/catalog-resolver";
import { AisleFields, AislePiecePicker, aislePieceChoices } from "./aisle-fields";
import { VesselPicker, vesselChoices } from "./vessel-picker";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { ImageField } from "@/components/image-field";
import { fieldLabelClassName } from "@/components/control";
import { Swatch, SwatchField } from "@/components/swatch-field";
import { Segmented } from "@/components/segmented";
import { AppearancePreview, PlanPreview } from "./appearance-preview";
import { AppearanceModal } from "./appearance-modal";
import { CompositeDrawer } from "./composite-drawer";
import { COMPOSITE_CATEGORY } from "@/lib/catalog/composition";

const uid = () => crypto.randomUUID();
/** The built-in vocabulary alone, made once — a default made per render would re-memo every row. */
const NO_KNOWN_FLOWERS: KnownFlower[] = knownFlowersOf([]);

/** What a new product of this category is drawn as. `CategoryDef.dims` used to pick which size
 *  fields the drawer showed; it seeds the SHAPE now, and the shape picks the fields — see the
 *  "מראה ומידות" section, and the note on `asksFootprint`. */
const defaultShape = (c: CategoryDef): MapShape => (c.dims === "round" ? "circle" : "rect");

// What the plan draws for a draft right now — the value a toggle shows as chosen, and the one any
// appearance patch has to preserve. A product from before `appearance` existed has no row to read
// and the resolvers answer for it: a diameter makes it a circle, and it draws its name.
const shapeOf = (p: Product): MapShape => p.appearance?.shape ?? (p.dimensions.diameterMm ? "circle" : "rect");
const contentOf = (p: Product): MapAppearance["content"] => p.appearance?.content ?? resolveContent(p).mode;

// What the tile says sits inside the footprint, so the drawer states the whole answer the modal
// gave without reopening it. Same three words the modal's "תוכן" toggle uses.
const CONTENT_LABEL: Record<MapAppearance["content"], string> = {
  none: "ריק",
  icon: "אייקון",
  name: "שם",
};

/** The one procurement question, in the chip's order (lib/catalog/types.ts STOCK_KINDS). */
const STOCK_OPTIONS: readonly (readonly [StockKind, string])[] = STOCK_KINDS.map((k) => [k, STOCK_KIND_LABEL[k]] as const);

/** A new, empty product seeded from `c` — the catalog's first category unless the caller is
 *  narrowed to a few (the meeting's drawing passes, which only show part of the catalog). */
export function blankProduct(c: CategoryDef = CATEGORIES[0]): Product {
  return {
    id: "",
    name: "",
    category: c.id,
    layer: c.defaultLayer,
    // A table starts at 75cm (CategoryDef.defaultHeightMm); everything else starts empty and asks. A
    // front category's row (CategoryDef.front — a backdrop) starts as a panel FRONT_THICK_MM thick: its
    // depth is its thickness, its height its face's.
    dimensions: c.front ? { heightMm: c.defaultHeightMm ?? 0, depthMm: FRONT_THICK_MM } : { heightMm: c.defaultHeightMm ?? 0 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    // Seeded from the category, then owned by the product — see CategoryDef.defaultStock.
    stockKind: c.defaultStock,
    // …and what it is priced per (CategoryDef.defaultPriceUnit): a sail by the m², a drape by the metre.
    ...(c.defaultPriceUnit && c.defaultPriceUnit !== "unit" ? { priceUnit: c.defaultPriceUnit } : {}),
    // Written out rather than left absent, because both halves of it are a decision:
    //   shape   — it is what the measurements below it are measurements OF (see `asksFootprint`).
    //   content — EMPTY. On a true-scale plan the outline already says what the item is; the name
    //             written across it is something a designer turns on for the few items that need
    //             it, not what every new product is born wearing. The base library has drawn this
    //             way from the start (lib/catalog/standard/) — a hand-added item now matches it.
    //   plane   — a front category's first shape is drawn on the FRONT plane, a face width × height
    //             (lib/studio/footprint.ts rowShapeDims), not a footprint seen from above.
    appearance: c.front ? { shape: "rect", content: "none", plane: "front" } : { shape: defaultShape(c), content: "none" },
  };
}

const cmOf = (mm?: number) => Math.round((mm ?? 0) / 10);

type ResizeSide = "width" | "depth" | "both";

/** "גודל גמיש" — one row that the plan stretches to the size each event needs, instead of one row
 *  per size (see ResizeSpec). Everything is in centimetres here, like the rest of the drawer; the
 *  range starts from the size the item is drawn at, so switching it on never changes what is drawn. */
function ResizeFields({
  draft,
  round,
  ready,
  internal,
  onChange,
}: {
  draft: Product;
  /** Whether the price note below the ranges may be shown — see ProductDrawer's `internal`. */
  internal: boolean;
  /** A round shape has one measurement — its diameter — and no side to choose. */
  round: boolean;
  /** Whether the shape and its measurements are filled in; there is nothing to stretch before. */
  ready: boolean;
  onChange: (resize: ResizeSpec | undefined) => void;
}) {
  const spec = draft.resize;
  const box = ready ? catalogBox(draft) : { widthMm: 0, depthMm: 0 };
  const side: ResizeSide = round ? "width" : spec?.width && spec?.depth ? "both" : spec?.depth ? "depth" : "width";
  const defaultRange = (mm: number) => ({ minMm: Math.max(RESIZE_DEFAULT_STEP_MM, Math.round(mm / 2 / 100) * 100), maxMm: Math.round((mm * 3) / 100) * 100 || 1000 });

  const setSide = (s: ResizeSide) => {
    if (!spec) return;
    onChange({
      stepMm: spec.stepMm,
      ...(s !== "depth" ? { width: spec.width ?? defaultRange(box.widthMm) } : {}),
      ...(s !== "width" ? { depth: spec.depth ?? defaultRange(box.depthMm) } : {}),
    });
  };
  const setRange = (axis: "width" | "depth", end: "minMm" | "maxMm", v: number) => {
    if (!spec) return;
    const cur = spec[axis] ?? defaultRange(axis === "width" ? box.widthMm : box.depthMm);
    onChange({ ...spec, [axis]: { ...cur, [end]: Math.round(v * 10) } });
  };

  const rangeRow = (axis: "width" | "depth", label: string) => {
    const r = spec?.[axis];
    if (!r) return null;
    return (
      <div className="grid grid-cols-2 gap-3">
        <NumberField id={`p-rz-${axis}-min`} label={`${label} — מינימום (ס״מ)`} min={1} value={cmOf(r.minMm)} commitOnBlur onChange={(v) => setRange(axis, "minMm", v)} />
        <NumberField id={`p-rz-${axis}-max`} label={`${label} — מקסימום (ס״מ)`} min={1} value={cmOf(r.maxMm)} commitOnBlur onChange={(v) => setRange(axis, "maxMm", v)} />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <SwitchRow
        checked={!!spec}
        disabled={!ready}
        onChange={(on) =>
          onChange(on ? { stepMm: RESIZE_DEFAULT_STEP_MM, width: defaultRange(box.widthMm) } : undefined)
        }
        label="גודל גמיש על התוכנית"
        hint={
          !ready
            ? "יש להשלים קודם את הצורה והמידות."
            : // The category stretches its rows by default (CategoryDef.defaultResize) — a banquette is
              // laid to length — and the switch here is for a row that wants its own module and range.
              !spec && CATEGORY_BY_ID[draft.category]?.defaultResize
              ? "פריטי הקטגוריה הזו נמתחים לאורכם בסקיצה כברירת מחדל. הפעלה כאן קובעת לשורה הזו קפיצות וטווח משלה."
              : "פריט אחד שנמתח בסקיצה לגודל שהאירוע צריך — במה, בר ישר, ספה, שולחן אבירים — במקום שורה נפרדת לכל מידה."
        }
      />
      {spec && (
        <div className="space-y-3 rounded-md border border-inset-border bg-inset p-3">
          {!round && (
            <Segmented
              label="מה נמתח"
              value={side}
              options={[
                ["width", "רוחב"],
                ["depth", "עומק"],
                ["both", "שניהם"],
              ] as const}
              onChange={setSide}
            />
          )}
          {rangeRow("width", round ? "קוטר" : "רוחב")}
          {!round && rangeRow("depth", "עומק")}
          <NumberField
            id="p-rz-step"
            label="קפיצות — גודל המודול (ס״מ)"
            className="w-44"
            min={1}
            value={cmOf(spec.stepMm)}
            commitOnBlur
            onChange={(v) => onChange({ ...spec, stepMm: Math.max(10, Math.round(v * 10)) })}
          />
          {internal && (
          <p className="text-xs leading-relaxed text-muted">
            {(draft.priceUnit ?? "unit") === "unit"
              ? "המחיר ליחידה לא משתנה עם הגודל. כדי שהצעת המחיר תגדל עם הפריט, בחרו מחיר למ״ר (במה, רחבה) או למטר (בר, ספה)."
              : `הצעת המחיר תחושב לפי הגודל שנמתח בסקיצה (${draft.priceUnit === "m2" ? "מ״ר" : "מטר רוחב"}).`}
          </p>
          )}
        </div>
      )}
    </div>
  );
}

const ROLE_LABEL: Record<FlowerRole, string> = { head: "ראש פרח", fill: "מילוי", trail: "נשפך מהשפה", green: "ירק" };

/** The row's small picture of a known flower — the head the plan will draw, in the colour it comes
 *  in, else the blush an unpinned flower defaults to (a green in its own). */
function FlowerIcon({ kind, colour }: { kind: FlowerKindId; colour?: string }) {
  return (
    <svg viewBox="-44 -44 88 88" className="h-5 w-5" aria-hidden>
      <FlowerHead kind={kind} r={40} colour={colour ?? FLOWER_KIND_BY_ID[kind].natural ?? DEFAULT_SHADE} />
    </svg>
  );
}

/** "כלי" — the vase or jug an arrangement is made in: one of the catalog's vessels (`vases`), each
 *  shade its own choice, or none. */
function VesselField({ value, onChange, untitled }: { value: string; onChange: (variantId: string) => void; untitled?: boolean }) {
  const options = vesselChoices(loadProducts());
  const chosen = value ? options.find((o) => o.value === value)?.label : undefined;
  return (
    <div>
      {/* Under the "כלי" section of its own (a centrepiece) the heading already says it; under the
          flower spec it is one field among them and names itself. Either way the pick is read back. */}
      <span className={fieldLabelClassName}>{untitled ? (chosen ?? "ללא כלי") : `כלי${chosen ? ` — ${chosen}` : ""}`}</span>
      <VesselPicker value={value} onChange={onChange} choices={options} lead={[{ value: "", label: "ללא כלי" }]} listClassName="max-h-44" />
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {options.length === 0
          ? "אין עדיין כלים בקטלוג — מוסיפים אותם בקטגוריה ״אגרטלים וכלים״."
          : "האגרטל או הכד שהפריט עומד בו: מצויר מתחתיו בסקיצה, נספר ונארז איתו. בסקיצה אפשר להחליף אותו לכל פריט מוצב."}
      </p>
    </div>
  );
}

/** "מפרט פרחים" — what an arrangement is made of, as rows that multiply (Product.flowers): a flower
 *  and how many stems of it, per arrangement. The stem total every other surface reads is their sum,
 *  shown here and never typed while there are rows; an arrangement with no rows may still type a bare
 *  total, which is the designer saying "180 stems, don't ask me which". Names are offered from the
 *  known flowers (lib/catalog/flowers.ts: the built-in vocabulary, this catalog's own names, the
 *  marketplace's stems) in a ComboField, and anything typed is taken; a pick also records what the
 *  flower is DRAWN as and the colour it comes in. Each row may pin its own colour — absent, it
 *  follows the arrangement's shade (a green or gypsophila its own). */
function FlowerSpecFields({
  lines,
  known,
  typedStems,
  onChange,
  onTypedStems,
}: {
  lines: FlowerLine[];
  known: KnownFlower[];
  /** The bare total, used only while there are no rows. */
  typedStems: number;
  onChange: (lines: FlowerLine[]) => void;
  onTypedStems: (stems: number) => void;
}) {
  const setLine = (id: string, p: Partial<FlowerLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const add = () => onChange([...lines, { id: uid(), name: "", qty: 0 }]);
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));
  const total = stemCount(lines);
  const columns = "grid grid-cols-[1fr_5.5rem_auto_2rem] items-center gap-2";
  const options = useMemo<ComboOption[]>(
    () =>
      known.map((k) => ({
        value: k.name,
        hint: k.source ?? ROLE_LABEL[FLOWER_KIND_BY_ID[k.kind].role],
        icon: <FlowerIcon kind={k.kind} colour={k.colour} />,
      })),
    [known],
  );
  const byName = useMemo(() => new Map(known.map((k) => [k.name, k])), [known]);

  return (
    <div className="space-y-2">
      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted">
          אין מפרט. הוסיפו את הפרחים שמרכיבים את הסידור — סוג וכמות גבעולים לכל אחד. סך הגבעולים יחושב
          מהם, רשימת הציוד והרכש יפרטו אותם פרח־פרח, והתוכנית תצייר את הסידור מהם.
        </p>
      ) : (
        <div className="space-y-2">
          <div className={`${columns} px-0.5 text-[11px] font-semibold text-faint`}>
            <span>פרח</span>
            <span>גבעולים</span>
            <span>צבע</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div key={l.id} className={columns}>
              <ComboField
                value={l.name}
                // Typing drops the picked kind: the name decides again (kindOfName) until the
                // designer picks a suggestion, which records what it is drawn as.
                onChange={(name) => setLine(l.id, { name, kind: undefined })}
                onPick={(opt) => {
                  const k = byName.get(opt.value);
                  if (k) setLine(l.id, { name: k.name, kind: k.kind, colour: k.colour ?? l.colour });
                }}
                options={options}
                placeholder="ורד, פיאוני, אקליפטוס…"
                aria-label={`פרח ${i + 1}`}
                // A row that mounts empty was just added — put the cursor where the designer is
                // about to type. Saved rows never mount empty (cleanFlowers drops them).
                autoFocus={l.name === ""}
              />
              <NumberField
                hideZero
                min={0}
                value={l.qty}
                onChange={(qty) => setLine(l.id, { qty })}
                placeholder="כמות"
                aria-label={`כמות גבעולים — ${l.name || `פרח ${i + 1}`}`}
              />
              <SwatchField value={l.colour} onChange={(colour) => setLine(l.id, { colour })} label={`צבע — ${l.name || `פרח ${i + 1}`} (ריק = לפי הגוון)`} />
              <button
                type="button"
                onClick={() => remove(l.id)}
                aria-label={`הסר ${l.name || "פרח"}`}
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-alert-tint hover:text-alert"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          ))}
          <p className="text-xs leading-relaxed text-muted">
            צבע ריק = הפרח נצבע לפי גוון הסידור שנבחר באירוע; ירק וגיבסנית בצבעם הטבעי. צבע שנקבע כאן
            נשאר בכל גוון.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          הוספת פרח
        </button>
        {lines.length > 0 && (
          <p className="nums text-xs text-ink-soft">
            סה״כ <span className="font-semibold text-ink">{total}</span> גבעולים בסידור
          </p>
        )}
      </div>

      {lines.length === 0 && (
        <NumberField
          id="f-stems"
          label="…או רק סך הגבעולים בסידור (מכפיל גבעולים)"
          className="w-44"
          min={0}
          hideZero
          value={typedStems}
          onChange={onTypedStems}
        />
      )}
    </div>
  );
}

// A quiet group header for the drawer's longer form — Assistant, no letter-spacing (Space
// Grotesk / tracked overlines are reserved for Latin kickers elsewhere in the system, never for
// Hebrew body copy), just small size + faint color + a hairline to read as "a new group starts here".
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-faint">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Whether the drawer opens on the category picker: a new row nobody has started yet. A duplicate
 *  (it carries a name), a row the studio seeded (a rug named for what it covers) and every saved row
 *  open on the form. */
const startsAtPicker = (p: Product) => !p.id && !p.name.trim() && !p.composition;

/** What a tile in the picker says the category seeds — the shape it starts as and its height, or that
 *  it is measured on the plan. */
function seedOf(c: CategoryDef): string {
  if (c.sizing === "stretch") return "נמדד על התוכנית";
  const height = c.defaultHeightMm ? ` · גובה ${c.defaultHeightMm / 10}` : "";
  return `${c.front ? "פאנל חזית" : SHAPE_LABEL[defaultShape(c)]}${height}`;
}

/** The name field's example, in the category's own words. */
const NAME_EXAMPLE: Record<string, string> = {
  tables: "שולחן עגול 180",
  chairs: "כיסא נפוליאון שקוף",
  sofas: "ספת קטיפה תלת־מושבית",
  "game-tables": "שולחן ביליארד 8 רגל",
  stages: "במה 4×6",
  "stage-decks": "פלטת במה 244×122",
  bars: "בר ישר לבן",
  chuppahs: "חופת בד לבנה",
  tablecloths: "מפת שולחן קטיפה",
  centerpieces: "מרכז שולחן ורדים",
  "flower-arrangements": "סידור ורדים ופיאוני",
  vases: "אגרטל זכוכית גבוה",
  candlesticks: "פמוט זהב 5 קנים",
  lamps: "מנורת שולחן פליז",
  chandeliers: "שנדליר קריסטל",
  rugs: "שטיח פרסי",
  aisles: "שדרת ורדים לחופה",
  curtains: "וילון שיפון לבן",
  arches: "קשת פרחים",
  backdrops: "קיר רקע קשתות לבן",
  gates: "שער עץ מקושת",
  columns: "עמוד יווני",
  fountains: "מזרקת אבן",
  trees: "עץ זית בעציץ",
};

/** …and for a category whose rows stand anywhere (CategoryDef.places), by where this one stands. */
const PLACE_NAME_EXAMPLE: Record<string, Partial<Record<Product["layer"], string>>> = {
  "flower-arrangements": { floor: "קיר פרחים 3×2.4", ceiling: "ענן פרחים תלוי" },
};

/** One line under the preview naming the category's PICTURE as it is set — "4 עמודים וגגון · גג: בד",
 *  "כיסא קרוס־בק" — so what the editor's ציור panel decided reads without opening it. Nothing for an
 *  item drawn as its outline. */
function pictureLine(p: Product): string | null {
  const kind = symbolOf(p, resolveFootprint(p));
  if (!kind) return null;
  if (kind === "chair") return CHAIR_STYLE_LABEL[chairStyleOf(p) ?? "dining"];
  const style = drawStyleOf(p);
  if (kind === "candlestick") return style ? (CANDLE_STYLE_LABEL[style as keyof typeof CANDLE_STYLE_LABEL] ?? null) : null;
  const set = SYMBOL_STYLES[kind];
  const label = set?.label[style ?? set.styles[0]];
  if (!label) return null;
  if (kind === "chuppah" && style !== "rotunda" && p.appearance?.chuppah) {
    return `${label} · גג: ${CHUPPAH_ROOF_LABEL[chuppahOf(chuppahDrawOf(p.appearance)).roof]}`;
  }
  return label;
}

type RowKey = "img" | "flowers" | "aisle" | "shades" | "price" | "plan" | "spec" | "stock" | "vis";
type RequiredKey = "name" | "shape" | "dims" | "height";

/** "מוצר חדש" / "עריכת מוצר" — the catalog's product drawer (2026-11-09, the user's redesign from
 *  claude.ai/design, "Create Product.dc.html"):
 *
 *  A NEW row starts by picking its CATEGORY (a tile grid by department): it seeds the shape, the
 *  height, the layer, the stock kind and the count fields, so it is asked first. The header's pill
 *  goes back to it.
 *
 *  Then the form, in two parts:
 *   • "הבסיס · נדרש לשמירה" — the four things a row cannot be saved without (name, shape, size,
 *     height), with a chip per answer that ticks as it is given; the plan preview at full width,
 *     drawn to scale with its figures; and the SAME width / depth / height the shape editor edits
 *     (the first shape's), typed right under it.
 *   • "אפשר להשלים אחר כך" — one card of folded rows, each reading back what it holds on its end.
 *
 *  Nothing the old form asked is gone; it is folded: the flower spec and the vessel are a row of their
 *  own (the user's call), the counts (seats, arms) moved beside the layer they place, the procurement
 *  block and the publish switch are rows. */
export function ProductDrawer({
  product,
  onSave,
  onDelete,
  onClose,
  onComposite,
  internal = true,
  categories = CATEGORIES,
  knownFlowers = NO_KNOWN_FLOWERS,
}: {
  product: Product | null;
  onSave: (p: Product) => void;
  /** Absent = no delete in this drawer — the studio opens it to add or edit a row mid-sketch, and a
   *  row placed on that very plan is a question for /catalog, not for the bar it was opened from. */
  onDelete?: (id: string) => void;
  onClose: () => void;
  /** Offered on the category picker as "פריט מורכב" — the catalog passes it (a composite is its own
   *  form); the studio makes composites from the sketch's selection and passes none. */
  onComposite?: () => void;
  /** The flowers to suggest in the spec rows — the catalog passes knownFlowersOf(its products, the
   *  marketplace's stems) so one studio spells "ורד" one way and a supplier's stem brings its
   *  colour; the default is the built-in vocabulary alone. */
  knownFlowers?: KnownFlower[];
  /** False when the drawer opens in a room with a client in it — the meeting's drawing passes add
   *  to the catalog from the studio's rail. Everything the client must not see goes: the price and
   *  its unit, the shades' prices, the whole procurement half (supplier, cost, stock, order unit)
   *  and the publish switch. The item is saved without them and the designer completes it later on
   *  /catalog, where this same drawer shows them again. */
  internal?: boolean;
  /** The categories offered. The meeting passes only what its rail shows, so an item added mid-pass
   *  lands somewhere it can be dragged from instead of vanishing into a department that is hidden. */
  categories?: CategoryDef[];
}) {
  const [draft, setDraft] = useState<Product>(blankProduct);
  const [submitted, setSubmitted] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  // "picker": the category tiles; "form": the form. A new row starts on the tiles.
  const [stage, setStage] = useState<"picker" | "form">("form");
  // The picker was opened from the form (the header's pill) — it shows which category is current and
  // the way back without changing it.
  const [fromForm, setFromForm] = useState(false);
  const [query, setQuery] = useState("");
  // Which "אפשר להשלים אחר כך" rows are open. Every row starts folded: they read back on their ends.
  // An aisle's row opens with its make-up out: the piece that lines it is the first thing asked of it.
  const [rows, setRows] = useState<ReadonlySet<RowKey>>(() => new Set<RowKey>(product?.category === AISLE_CATEGORY ? ["aisle"] : []));
  // "המראה עודכן" on the preview for a moment after the editor saves — the answer to "did it take?".
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  // The style vocabulary is a seed, not a closed list (styleTagsOf) — this is the box for a word
  // the studio uses that the seed never heard of.
  const [newTag, setNewTag] = useState("");
  // Whether the app installed this row or the designer wrote it — see isStandardProduct. Asked of
  // the server, because deriving the answer needs node:crypto. What is stored is the id the answer
  // was about, not a bare boolean: a drawer that goes straight from a base table to a new product
  // would otherwise carry the previous row's answer until the next one came back.
  const [libraryId, setLibraryId] = useState<string | null>(null);
  // A supplier publishes; a designer buys. The same drawer, worded for whichever is holding it.
  const supplierOrg = useIsSupplier();
  // The source of a copied row (lib/marketplace/): asked of the server when the drawer opens one,
  // keyed on the id the answer was about, like `libraryId`.
  const [source, setSource] = useState<{ id: string; status: SourceStatus | null } | null>(null);
  // Loaded once, the first time the drawer opens — the catalog's first paint owes nothing to it.
  // Never in the meeting: the supplier list is cost-side data and nothing there would show it.
  const { suppliers, add: addSupplier } = useSupplierPicker(product !== null && internal);
  // "הספק מוכר ביחידה אחרת" — the two order fields stay folded on a sofa and open on their own under
  // a flower or anything priced by the metre, where the supplier's unit really does differ.
  const [orderUnitOpen, setOrderUnitOpen] = useState(false);

  // A new row opened → its form (or its picker), reset WHILE RENDERING rather than in an effect, so
  // no frame ever shows the previous row's form under the new row's title.
  const [shown, setShown] = useState<Product | null>(null);
  if (product !== shown) {
    setShown(product);
    if (product) {
      setDraft(product);
      setSubmitted(false);
      setAppearanceOpen(false);
      setStage(startsAtPicker(product) ? "picker" : "form");
      setFromForm(false);
      setQuery("");
      setRows(new Set());
      setFlash(false);
    }
  }
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const productId = product?.id;
  useEffect(() => {
    if (!productId) return;
    let current = true;
    isStandardProduct(productId).then((yes) => {
      if (current && yes) setLibraryId(productId);
    });
    return () => {
      current = false;
    };
  }, [productId]);
  const sourceProductId = product?.sourceProductId;
  useEffect(() => {
    if (!productId || !sourceProductId) return;
    let current = true;
    fetchSourceStatus(productId)
      .then((status) => {
        if (current) setSource({ id: productId, status });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [productId, sourceProductId]);
  const sourceStatus = source && source.id === productId ? source.status : null;

  if (!product) return null;
  // A composite is its parts, not a thing with a shape, a price and shades: its own form, in the same
  // drawer shell (lib/catalog/composition.ts). Mounted fresh per opening — the drawer is unmounted
  // between them (product null) — so its draft is always the row it was opened on.
  if (product.composition) {
    return <CompositeDrawer product={product} onSave={onSave} onDelete={onDelete} onClose={onClose} internal={internal} />;
  }

  const category = CATEGORY_BY_ID[draft.category];
  const isEdit = draft.id !== "";
  // Unknown until the server answers, and false the moment the drawer is showing a different row.
  const fromLibrary = !!productId && libraryId === productId;
  const CategoryIcon = category.icon;

  // Current shape, falling back to what the resolver would derive when appearance is unset.
  const currentShape = shapeOf(draft);
  const currentContent = contentOf(draft);

  // A stretch category (a drape, a rug) is cut or laid to whatever it has to cover, so it has no
  // width or depth here — those are drawn per placement in the studio.
  const stretch = category.sizing === "stretch";
  const custom = currentShape === "custom";
  const round = !stretch && usesDiameter(currentShape);
  // A FRONT base (a backdrop — MapAppearance.plane): its width and height are its FACE, across and up;
  // its depth is how thick the panel is (lib/studio/footprint.ts rowShapeDims).
  const front = draft.appearance?.plane === "front";
  // Most categories keep asking for height regardless of `stretch` — a drape's height is its DROP,
  // the one dimension that still tells two rolls of the same curtain apart. needsHeight is the
  // explicit opt-out for the categories where height isn't a dimension of the item at all: see the
  // comment on CategoryDef.
  const showHeight = category.needsHeight !== false;

  // ── What is still missing ─────────────────────────────────────────────────────────────────────
  // Checked once and read four times: the chips, the fields' errors, the footer's status and `save`.
  // A circle needs a diameter, everything else a width and a depth, and a hand-drawn outline at least
  // three points — whose size IS its drawing. Without them the footprint can only fall back to
  // MIN_FOOTPRINT_MM, a 60×60 box that ignores every number in the form.
  const drawnByHand = custom && (draft.appearance?.outline?.length ?? 0) >= 3;
  // A front base's face is its width × its height (asked on its own); its thickness has a default
  // (FRONT_THICK_MM), so it is never what is missing.
  const measured =
    stretch ||
    (custom ? drawnByHand : round ? !!roundSizeMm(currentShape, draft.dimensions) : !!draft.dimensions.widthMm && (front || !!draft.dimensions.depthMm));
  const missing: Record<RequiredKey, boolean> = {
    name: draft.name.trim() === "",
    shape: custom && !drawnByHand,
    dims: !measured,
    height: showHeight && !draft.dimensions.heightMm,
  };
  const required: { key: RequiredKey; label: string }[] = [
    { key: "name", label: "שם" },
    { key: "shape", label: "צורה" },
    ...(stretch ? [] : [{ key: "dims" as const, label: "מידות" }]),
    ...(showHeight ? [{ key: "height" as const, label: "גובה" }] : []),
  ];
  const missingLabels = required.filter((r) => missing[r.key]).map((r) => r.label);
  const incomplete = missingLabels.length > 0;

  const patch = (p: Partial<Product>) => setDraft((d) => ({ ...d, ...p }));
  const setDim = (key: keyof Product["dimensions"], cm: number) =>
    setDraft((d) => ({ ...d, dimensions: { ...d.dimensions, [key]: Math.round(cm * 10) } }));
  const setField = (key: string, v: number) => setDraft((d) => ({ ...d, categoryFields: { ...d.categoryFields, [key]: v } }));
  /** The first shape's width or depth — the numbers the editor's item bar edits too. A hand-drawn
   *  outline is RESCALED to them (its points, not its two numbers, are what draws it). A FRONT base's
   *  outline is its face, so it is rescaled to its width × HEIGHT, and its depth — the panel's
   *  thickness — never touches it. */
  const setBox = (p: { widthMm?: number; depthMm?: number; heightMm?: number }) =>
    setDraft((d) => {
      const a = d.appearance;
      if (shapeOf(d) === "custom" && a?.outline && a.outline.length >= 3) {
        if (a.plane === "front") {
          if (p.widthMm === undefined && p.heightMm === undefined) return { ...d, dimensions: { ...d.dimensions, ...p } };
          const r = rescaleOutline(a.outline, a.edgeCurves, p.widthMm ?? d.dimensions.widthMm ?? 0, p.heightMm ?? d.dimensions.heightMm ?? 0);
          return { ...d, dimensions: { ...d.dimensions, ...p, widthMm: r.widthMm, heightMm: r.depthMm }, appearance: { ...a, outline: r.outline, edgeCurves: r.edgeCurves } };
        }
        const r = rescaleOutline(a.outline, a.edgeCurves, p.widthMm ?? d.dimensions.widthMm ?? 0, p.depthMm ?? d.dimensions.depthMm ?? 0);
        return { ...d, dimensions: { ...d.dimensions, widthMm: r.widthMm, depthMm: r.depthMm }, appearance: { ...a, outline: r.outline, edgeCurves: r.edgeCurves } };
      }
      return { ...d, dimensions: { ...d.dimensions, ...p } };
    });
  /** A ROUND front base: its face's height IS its size (a circle's diameter, a half circle's radius),
   *  so the diameter and the height move together — as the shape editor stores them (lib/catalog/
   *  shape-list.ts frontLookOf). `to` is whichever was typed. */
  const setFrontRound = (to: { diameterMm?: number; heightMm?: number }) =>
    setDraft((d) => {
      const { shape, dims } = rowShapeDims(d);
      const per = frontFace(shape, { ...dims, diameterMm: 1000 }).h / 1000; // face height per mm of diameter
      if (!(per > 0)) return { ...d, dimensions: { ...d.dimensions, ...to } };
      const diameterMm = to.diameterMm ?? Math.round((to.heightMm ?? 0) / per);
      return { ...d, dimensions: { ...d.dimensions, diameterMm, heightMm: to.heightMm ?? Math.round(diameterMm * per) } };
    });

  /** Where the first missing answer is given: its field, or — for a shape — the editor. */
  const goTo = (key: RequiredKey) => {
    const field = key === "name" ? "p-name" : key === "height" ? "p-height" : key === "dims" && !custom ? (round ? "p-diameter" : "p-width") : null;
    if (field) document.getElementById(field)?.focus();
    else if (!stretch) setAppearanceOpen(true);
  };
  const goToMissing = () => {
    setSubmitted(true);
    const first = required.find((r) => missing[r.key]);
    if (first) goTo(first.key);
  };

  const changeCategory = (id: string) =>
    setDraft((d) => {
      const c = CATEGORY_BY_ID[id];
      // A NEW product's height re-seeds with the category while it is still the old category's seed
      // (or empty) — a fresh row starts as a table at 75cm, and turning it into a chair must not
      // leave it 75cm tall. A saved product's height is a measurement and is never touched.
      const seededHeight = CATEGORY_BY_ID[d.category]?.defaultHeightMm ?? 0;
      const reseedHeight = !d.id && (d.dimensions.heightMm === 0 || d.dimensions.heightMm === seededHeight);
      // A NEW row's PLANE follows the category's seed too (CategoryDef.front): picked as a backdrop it
      // becomes a front panel FRONT_THICK_MM thick (a plan depth is no thickness), and picked away from
      // one while still its front seed it is a plan shape again (a thickness is no plan depth). A saved
      // row's plane, and a hand-drawn one, are the designer's drawing and are never touched.
      const handDrawn = d.appearance?.shape === "custom";
      const fromFront = !!CATEGORY_BY_ID[d.category]?.front;
      const enterFront = !d.id && !handDrawn && !!c.front && !fromFront && d.appearance?.plane !== "front";
      const leaveFront = !d.id && !handDrawn && !c.front && fromFront && d.appearance?.plane === "front";
      const reseeded = reseedHeight ? { ...d.dimensions, heightMm: c.defaultHeightMm ?? 0 } : d.dimensions;
      const planeSeed: Partial<MapAppearance> = enterFront
        ? { plane: "front" }
        : leaveFront
          ? { plane: undefined, bendDeg: undefined, faceTurnDeg: undefined }
          : {};
      // A NEW aisle starts at a size (8 × 3 m — lib/catalog/aisle.ts): its two numbers are its length
      // and its width across, and an unmeasured one would draw nothing to line.
      const aisleSeed = !d.id && id === AISLE_CATEGORY && !d.dimensions.widthMm && !d.dimensions.depthMm && !handDrawn;
      return {
        ...d,
        dimensions: aisleSeed ? { ...reseeded, ...AISLE_SIZE_MM, diameterMm: undefined } : enterFront ? { ...reseeded, depthMm: FRONT_THICK_MM } : leaveFront ? { ...reseeded, depthMm: undefined } : reseeded,
        category: id,
        layer: c.defaultLayer,
        categoryFields: {},
        // The spec follows the category: a product that stops being an arrangement has no flowers.
        flowers: c.flowers ? d.flowers : undefined,
        // Re-seeded with the layer and the category fields, for the same reason: the new category's
        // opinion is a better starting point than the old one's, and it stays editable.
        stockKind: c.defaultStock,
        // A NEW product's price unit follows the category while it is still the old category's seed —
        // the height's rule: a sail is sold by the m² until the designer says otherwise.
        ...(!d.id && (d.priceUnit ?? "unit") === (CATEGORY_BY_ID[d.category]?.defaultPriceUnit ?? "unit")
          ? { priceUnit: c.defaultPriceUnit && c.defaultPriceUnit !== "unit" ? c.defaultPriceUnit : undefined }
          : {}),
        // The shape re-seeds with them — a centrepiece is round, a stage is a box — except when the
        // designer has drawn one by hand, which a category change must never throw away. Content is
        // carried across as whatever the plan already draws, so changing category cannot silently
        // blank the name off an older product.
        appearance: handDrawn ? d.appearance : { ...d.appearance, shape: defaultShape(c), content: contentOf(d), ...planeSeed },
      };
    });
  /** `layer`: the place picked with the category, for one whose rows stand anywhere (PLACES). */
  const pickCategory = (id: string, layer?: Product["layer"]) => {
    if (id !== draft.category) changeCategory(id);
    if (layer) setDraft((d) => (d.layer === layer ? d : { ...d, layer }));
    // An aisle's make-up is the first thing asked of it: its row opens with that fold out.
    if (id === AISLE_CATEGORY) setRows((cur) => new Set([...cur, "aisle"]));
    setStage("form");
    setQuery("");
  };

  const toggleRow = (k: RowKey) =>
    setRows((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleTag = (t: string) =>
    setDraft((d) => ({
      ...d,
      styleTags: d.styleTags.includes(t) ? d.styleTags.filter((x) => x !== t) : [...d.styleTags, t],
    }));

  // A tag the designer types is a tag they mean, so it is added AND selected in one step. It is
  // stored on the product and nowhere else — that is what makes it appear in the catalog's and the
  // studio rail's filters (styleTagsOf), and also why unselecting the last product that carries it
  // makes it disappear from the row. Retyping it is the undo.
  const addTag = () => {
    const t = newTag.trim();
    setNewTag("");
    if (t && !draft.styleTags.includes(t)) setDraft((d) => ({ ...d, styleTags: [...d.styleTags, t] }));
  };

  const setVariant = (id: string, p: Partial<Variant>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...p } : v)) }));
  const addVariant = () => setDraft((d) => ({ ...d, variants: [...d.variants, { id: uid(), name: "" }] }));
  // F-4.5: a variant that's placed in any event is archived (kept resolvable), not deleted.
  //
  // The "is it placed?" question is a database query now, so it is asked BEFORE the state update
  // rather than inside it — a setState updater must stay synchronous and pure, and awaiting inside
  // one would make React run it with a promise instead of a draft.
  const removeVariant = async (id: string) => {
    const placed = await isPlacedAnywhere([id]);
    setDraft((d) =>
      placed
        ? { ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, archived: true } : v)) }
        : { ...d, variants: d.variants.filter((v) => v.id !== id) },
    );
  };

  const save = () => {
    if (incomplete) {
      goToMissing();
      return;
    }
    const variants = draft.variants
      .map((v) => ({ ...v, id: v.id || uid(), name: v.name.trim() }))
      .filter((v) => v.name !== "" || v.archived);
    // The flower spec is saved clean, and when it has rows their sum is written INTO the stems
    // field — so the one number every other surface multiplies by can never disagree with the rows
    // beside it (lib/catalog/flowers.ts).
    const flowers = category.flowers ? cleanFlowers(draft.flowers) : undefined;
    const categoryFields = flowers ? { ...draft.categoryFields, stems: stemCount(flowers) } : draft.categoryFields;
    onSave({ ...draft, id: draft.id || uid(), name: draft.name.trim(), variants, flowers, categoryFields });
    onClose();
  };

  // The category's count-multipliers (seats, arms) — F-4.3: only these are structured. A flower
  // category's `stems` is filled by the spec's rows (FlowerSpecFields owns it), so it is not asked.
  const countFields = category.fields.filter((f) => !(category.flowers && f.key === "stems"));
  const vesselHolder = VESSEL_HOLDERS.has(draft.category);
  const vesselValue = typeof draft.categoryFields.vessel === "string" ? draft.categoryFields.vessel : "";
  const setVessel = (v: string) =>
    setDraft((d) => {
      const { vessel: _old, ...rest } = d.categoryFields;
      void _old;
      return { ...d, categoryFields: v ? { ...rest, vessel: v } : rest };
    });
  const liveVariants = draft.variants.filter((v) => !v.archived);
  // AN AISLE (lib/catalog/aisle.ts): the piece that lines it — another row of this catalog, by variant
  // — and how it is laid. Read back through the same view the plan draws.
  const isAisle = draft.category === AISLE_CATEGORY;
  const pieceValue = typeof draft.categoryFields[AISLE_PIECE_FIELD] === "string" ? (draft.categoryFields[AISLE_PIECE_FIELD] as string) : "";
  const setPiece = (v: string) =>
    setDraft((d) => {
      const { [AISLE_PIECE_FIELD]: _old, ...rest } = d.categoryFields;
      void _old;
      return { ...d, categoryFields: v ? { ...rest, [AISLE_PIECE_FIELD]: v } : rest };
    });
  const pieceChoices = isAisle ? aislePieceChoices(loadProducts()) : [];
  const pieceLabel = pieceValue ? pieceChoices.find((o) => o.value === pieceValue)?.label : undefined;
  const aisleView = isAisle ? aisleViewOf(draft) : null;

  // ── The header's pill: the category, and the way back to the tiles ─────────────────────────────
  const categoryPill =
    stage === "form" ? (
      <button
        type="button"
        onClick={() => {
          setFromForm(true);
          setStage("picker");
        }}
        title="החלפת קטגוריה"
        className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-pill border border-border bg-inset pe-2 ps-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-accent-line hover:bg-accent-tint hover:text-accent-hover"
      >
        <CategoryIcon className="h-[15px] w-[15px] text-accent" strokeWidth={1.75} />
        {category.label}
        <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2} />
      </button>
    ) : null;

  // ── Step A: the category tiles ────────────────────────────────────────────────────────────────
  if (stage === "picker") {
    // A composite is made in its own form, never by re-filing an ordinary row; and a studio never
    // files a NEW row under a built-in-only category (lib/catalog/built-in.ts): its one built-in is
    // that category. A row already in one keeps it; a built-in is offered its own alone.
    const offered = offeredCategories(categories, { isSupplier: supplierOrg, product }).filter((c) => c.id !== COMPOSITE_CATEGORY);
    const q = query.trim();
    // A category whose rows stand anywhere (CategoryDef.places — flowers) is offered once per PLACE:
    // "where does it stand" is the first thing that tells a centrepiece from a flower wall.
    const tiles = (c: CategoryDef) =>
      c.places
        ? PLACES.map((p) => ({ c, key: `${c.id}:${p.layer}`, layer: p.layer as Product["layer"] | undefined, label: `${c.label} · ${p.label}`, hint: p.kinds }))
        : [{ c, key: c.id, layer: undefined as Product["layer"] | undefined, label: c.label, hint: seedOf(c) }];
    const groups = CATEGORY_GROUPS.map((g) => ({ g, items: offered.filter((c) => c.group === g.id && (!q || categoryNamed(c, q))).flatMap(tiles) })).filter((x) => x.items.length > 0);
    return (
      <Drawer title={isEdit ? "עריכת מוצר" : "מוצר חדש"} onClose={onClose}>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className="text-[17px] font-bold text-ink">{isEdit ? "לאיזו קטגוריה הפריט שייך?" : "מה מוסיפים לקטלוג?"}</p>
            <p className="mt-1 text-pretty text-[13px] leading-relaxed text-ink-soft">
              הקטגוריה קובעת את הצורה שהפריט מתחיל בה ואת השדות שבטופס. אפשר להחליף אותה אחר כך.
            </p>
            {fromForm && (
              <button
                type="button"
                onClick={() => setStage("form")}
                className="mt-2 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                חזרה לטופס בלי לשנות — {category.label}
              </button>
            )}
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="חיפוש קטגוריה…" aria-label="חיפוש קטגוריה" />
          {groups.map(({ g, items }) => (
            <div key={g.id} className="space-y-2">
              <SectionDivider label={g.label} />
              <div className="grid grid-cols-3 gap-2">
                {items.map(({ c, key, layer, label, hint }) => {
                  const Icon = c.icon;
                  const current = fromForm && c.id === draft.category && (!layer || layer === draft.layer);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pickCategory(c.id, layer)}
                      aria-pressed={current}
                      className={`relative flex min-w-0 flex-col items-start gap-2 rounded-md border bg-surface p-2.5 text-start transition-colors hover:border-accent-line hover:bg-inset ${
                        current ? "border-accent" : "border-border"
                      }`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent-tint text-accent">
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-tight text-ink">{label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>
                      </span>
                      {current && (
                        <span className="absolute end-2 top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-canvas">
                          <Check className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted">
              אין קטגוריה בשם הזה. ״אחר״ מתאים לכל פריט שאין לו קטגוריה משלו.
            </p>
          )}
          {onComposite && !isEdit && (
            <button
              type="button"
              onClick={onComposite}
              className="flex w-full items-center gap-2.5 rounded-md border border-inset-border bg-inset px-3 py-2.5 text-start transition-colors hover:border-accent-line hover:bg-accent-tint"
            >
              <Combine className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
              <span className="flex-1 text-[13px] text-ink-soft">פריט מורכב — כמה מוצרים שמוצבים יחד</span>
              <span className="text-xs font-semibold text-accent">טופס נפרד</span>
            </button>
          )}
        </div>
      </Drawer>
    );
  }

  // ── Step B: the form ──────────────────────────────────────────────────────────────────────────
  const done = required.length - missingLabels.length;
  const partsCount = draft.appearance?.parts?.length ?? 0;
  const shapeSummary = stretch
    ? ""
    : `${SHAPE_LABEL[currentShape]}${partsCount ? ` + ${partsCount === 1 ? "צורה נוספת" : `${partsCount} צורות נוספות`}` : ""}`;
  const picLine = measured && !stretch ? pictureLine(draft) : null;
  // What is written inside the outline is said only for an item drawn AS an outline — a chair or an
  // arrangement is drawn as its picture, and the editor hides that question for it too.
  const drawnAsSymbol = measured && !stretch && symbolOf(draft, resolveFootprint(draft)) !== null;
  const roundField = ROUND_FIELD[currentShape] ?? { label: "קוטר", factor: 1 };
  const line = currentShape === "line";
  const cm = (mm?: number) => Math.round((mm ?? 0) / 10);
  const openEditor = () => setAppearanceOpen(true);

  // What each folded row holds, on its end.
  const tagCount = draft.styleTags.length;
  const stems = category.flowers ? stemCount(draft.flowers ?? []) : 0;
  const flowerRows = (draft.flowers ?? []).filter((l) => l.name.trim()).length;
  const vesselLabel = vesselValue ? vesselChoices(loadProducts()).find((o) => o.value === vesselValue)?.label : undefined;
  const kind: StockKind = draft.stockKind ?? "owned";
  const supplierName = draft.supplierId ? suppliers.find((s) => s.id === draft.supplierId)?.name : undefined;
  const counted = countFields
    .map((f) => ({ f, v: Number(draft.categoryFields[f.key] ?? 0) }))
    .filter(({ v }) => v > 0)
    .map(({ f, v }) => `${v} ${f.suffix ?? f.label}`);
  const sum: Record<RowKey, string> = {
    img: `${draft.imageUrl ? "תמונה" : "ללא תמונה"} · ${tagCount === 0 ? "ללא תגיות" : tagCount === 1 ? "תגית אחת" : `${tagCount} תגיות`}`,
    flowers: category.flowers
      ? [flowerRows ? `${flowerRows === 1 ? "פרח אחד" : `${flowerRows} פרחים`} · ${stems} גבעולים` : stems ? `${stems} גבעולים` : "אין מפרט", vesselLabel].filter(Boolean).join(" · ")
      : (vesselLabel ?? "ללא כלי"),
    aisle: aisleView ? (pieceLabel ? `${pieceLabel} · ${aisleWords(aisleView.layout)}` : "לא נבחר פריט") : "",
    shades: liveVariants.length === 0 ? "אין גוונים" : liveVariants.length === 1 ? "גוון אחד" : `${liveVariants.length} גוונים`,
    price: draft.unitPrice ? `${formatPrice(draft.unitPrice)} ${PRICE_UNIT_LABEL[draft.priceUnit ?? "unit"]}` : "לא נקבע",
    plan: [
      LAYERS.find((l) => l.id === draft.layer)?.label ?? "",
      ...counted,
      draft.resize ? "גודל גמיש" : "",
      draft.clearanceMm ? `מרחק ${cm(draft.clearanceMm)} ס״מ` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    spec: draft.spec?.trim() ? `${draft.spec.trim().slice(0, 30)}${draft.spec.trim().length > 30 ? "…" : ""}` : "ריק",
    stock: [STOCK_KIND_LABEL[kind], kind === "owned" && draft.stockQty ? `${draft.stockQty} במלאי` : "", kind !== "owned" ? (supplierName ?? "ללא ספק") : ""]
      .filter(Boolean)
      .join(" · "),
    vis: fromLibrary
      ? "ספרייה בסיסית"
      : supplierOrg
        ? draft.visibility === "public"
          ? "מפורסם"
          : "טיוטה"
        : draft.visibility === "public"
          ? VISIBILITY_LABEL.public
          : "פרטי",
  };

  return (
    // The shell — geometry, header, close button and the single scrollbar — is the app's shared
    // drawer (components/drawer.tsx), the same one the dashboard's event detail opens. This screen
    // owns only the form inside it.
    <Drawer title={isEdit ? "עריכת מוצר" : "מוצר חדש"} titleAside={categoryPill} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* ── הבסיס: the four answers a row cannot be saved without ── */}
          <section className="rounded-md border border-border bg-surface">
            <div className="space-y-2 border-b border-border-soft px-4 pb-2.5 pt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-ink">הבסיס</span>
                <span className="text-xs text-muted">נדרש לשמירה</span>
                <span className="nums ms-auto text-xs font-semibold text-ink-soft">
                  {done} מתוך {required.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {required.map((r) => {
                  const ok = !missing[r.key];
                  const bad = !ok && submitted;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => goTo(r.key)}
                      className={`inline-flex h-6 items-center gap-1 rounded-pill border px-2.5 text-xs font-semibold transition-colors ${
                        ok
                          ? "border-success-tint bg-success-tint text-success-ink"
                          : bad
                            ? "border-alert-tint bg-alert-tint text-alert-ink"
                            : "border-border bg-surface text-muted hover:border-accent-line"
                      }`}
                    >
                      {ok ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Circle className="h-3 w-3" strokeWidth={2} />}
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 p-4">
              <TextField
                id="p-name"
                label="שם המוצר"
                value={draft.name}
                onChange={(v) => patch({ name: v })}
                placeholder={`לדוגמה: ${PLACE_NAME_EXAMPLE[draft.category]?.[draft.layer] ?? NAME_EXAMPLE[draft.category] ?? "מפת שולחן קטיפה"}`}
                error={submitted && missing.name}
                errorMessage="יש להזין שם מוצר."
                autoFocus
              />

              {/* Where it stands — asked here, beside the name, for a category whose rows stand
                  anywhere (flowers: a table, the floor, the ceiling). It IS the row's layer: where a
                  drop lands, which plane lists it, which section of the quote it is read under. */}
              {category.places && (
                <Segmented
                  label="איפה זה עומד?"
                  value={draft.layer}
                  options={PLACES.map((p) => [p.layer, p.label] as const)}
                  onChange={(v) => patch({ layer: v })}
                />
              )}

              <div className="space-y-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-ink-soft">מראה ומידות</span>
                  {shapeSummary && <span className="ms-auto min-w-0 truncate text-xs text-muted">{shapeSummary}</span>}
                </div>

                {stretch && (
                  <p className="rounded-md border border-inset-border bg-inset px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
                    {category.label} נמדדים על התוכנית — הגודל נקבע כשמותחים אותם באירוע.
                  </p>
                )}

                {/* The plan, drawn to scale with its figures — a click (or the pencil) opens the shape
                    editor. Before anything is measured, the shape the category seeds is drawn dashed.
                    A stretch category has no size to figure: it previews as a length of itself, still
                    the way into its style, contour and colour (the user kept those, 2026-11-09). */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={openEditor}
                    aria-label="עריכת המראה על התוכנית"
                    className={`group relative block w-full overflow-hidden rounded-md border bg-canvas transition-colors hover:border-accent-line ${stretch ? "h-32" : "h-[200px]"} ${
                      submitted && missing.dims ? "border-alert" : "border-border"
                    }`}
                  >
                    {stretch ? (
                      <AppearancePreview product={draft} className="absolute inset-0 h-full w-full p-4" />
                    ) : (
                      <PlanPreview
                        product={draft}
                        ghost={measured ? undefined : round ? "round" : "box"}
                        tone={measured ? "ink" : submitted ? "alert" : "muted"}
                        className="absolute inset-0 h-full w-full"
                      />
                    )}
                    <span className="absolute bottom-2.5 end-2.5 inline-flex h-8 items-center gap-1.5 rounded-pill border-[1.5px] border-accent-line bg-surface px-3 text-[13px] font-bold text-accent transition-colors group-hover:bg-accent-tint">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      עריכת המראה
                    </span>
                  </button>
                  {flash && (
                    <span className="pointer-events-none absolute start-2.5 top-2.5 inline-flex items-center gap-1 rounded-pill bg-success-tint px-2.5 py-1 text-xs font-semibold text-success-ink">
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                      המראה עודכן
                    </span>
                  )}
                </div>
                {picLine && (
                  <p className="-mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <Sparkles className="h-[13px] w-[13px] text-accent" strokeWidth={1.75} />
                    {picLine}
                  </p>
                )}
                {!stretch && measured && !drawnAsSymbol && currentContent !== "none" && (
                  <p className="-mt-0.5 text-xs text-muted">בתוך הצורה: {CONTENT_LABEL[currentContent]}</p>
                )}

                {appearanceOpen && (
                  <AppearanceModal
                    product={draft}
                    onSave={(p) => {
                      patch(p);
                      setFlash(true);
                      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
                      flashTimer.current = window.setTimeout(() => setFlash(false), 2600);
                    }}
                    onClose={() => setAppearanceOpen(false)}
                  />
                )}

                {/* The first shape's numbers — the very ones the editor's bar edits. A box asks width,
                    depth and height; a round shape its one measurement and height; a line its length
                    and thickness; a stretch category its height (a drape's drop) alone. A FRONT base
                    (a backdrop) asks its face's width and height and the panel's thickness — and a
                    hand-drawn face is rescaled by its width and height, never by its thickness. */}
                {(() => {
                  const heightField = showHeight && (
                    <NumberField
                      id="p-height"
                      label={stretch ? "גובה / נפילה (ס״מ)" : "גובה (ס״מ)"}
                      required
                      hideZero
                      min={0}
                      placeholder="—"
                      commitOnBlur={front && custom}
                      error={submitted && missing.height}
                      errorMessage="גובה נדרש (לטובת ההדמיה התלת־ממדית)."
                      value={cm(draft.dimensions.heightMm)}
                      onChange={(v) =>
                        front && custom
                          ? setBox({ heightMm: Math.round(v * 10) })
                          : front && round
                            ? setFrontRound({ heightMm: Math.round(v * 10) })
                            : setDim("heightMm", v)
                      }
                    />
                  );
                  // A panel's thickness: millimetres matter (a 2cm board, a 2.5cm one), so one decimal.
                  const thicknessField = front && (
                    <NumberField
                      id="p-depth"
                      label="עובי (ס״מ)"
                      hideZero
                      min={0}
                      placeholder="—"
                      decimals={1}
                      value={(draft.dimensions.depthMm ?? 0) / 10}
                      onChange={(v) => setDim("depthMm", v)}
                    />
                  );
                  if (stretch) return heightField ? <div className="grid grid-cols-3 gap-2.5">{heightField}</div> : null;
                  if (custom && !drawnByHand)
                    return (
                      <>
                        <p className="text-xs leading-relaxed text-muted">צורה חופשית — מציירים אותה בעורך המראה, ומשם נגזרות המידות.</p>
                        {heightField && <div className="grid grid-cols-3 gap-2.5">{heightField}</div>}
                      </>
                    );
                  return (
                    <div className="grid grid-cols-3 gap-2.5">
                      {round ? (
                        <NumberField
                          id="p-diameter"
                          label={`${roundField.label} (ס״מ)`}
                          required
                          hideZero
                          min={0}
                          placeholder="—"
                          error={submitted && missing.dims}
                          value={(roundSizeMm(currentShape, draft.dimensions) ?? 0) / roundField.factor / 10}
                          onChange={(v) =>
                            front ? setFrontRound({ diameterMm: Math.round(v * roundField.factor * 10) }) : setDim("diameterMm", v * roundField.factor)
                          }
                        />
                      ) : (
                        <>
                          {/* A hand-drawn outline is rescaled to these, so it waits for the whole
                              number — rescaled at "1", then "12", it would lose its shape. */}
                          <NumberField
                            id="p-width"
                            label={line || isAisle ? "אורך (ס״מ)" : "רוחב (ס״מ)"}
                            required
                            hideZero
                            min={0}
                            placeholder="—"
                            commitOnBlur={custom}
                            error={submitted && missing.dims && !draft.dimensions.widthMm}
                            value={cm(draft.dimensions.widthMm)}
                            onChange={(v) => setBox({ widthMm: Math.round(v * 10) })}
                          />
                          {thicknessField || (
                            <NumberField
                              id="p-depth"
                              label={line ? "עובי (ס״מ)" : isAisle ? "רוחב (ס״מ)" : "עומק (ס״מ)"}
                              required
                              hideZero
                              min={0}
                              placeholder="—"
                              decimals={line ? 1 : undefined}
                              commitOnBlur={custom}
                              error={submitted && missing.dims && !draft.dimensions.depthMm}
                              value={line ? (draft.dimensions.depthMm ?? 0) / 10 : cm(draft.dimensions.depthMm)}
                              onChange={(v) => setBox({ depthMm: Math.round(v * 10) })}
                            />
                          )}
                        </>
                      )}
                      {round && thicknessField}
                      {heightField}
                    </div>
                  );
                })()}
                {submitted && missing.dims && !stretch && <p className="text-xs text-alert-ink">יש להשלים את המידות — לפיהן מצויר הפריט.</p>}
                {!stretch && !(submitted && missing.dims) && (
                  <p className="text-xs leading-relaxed text-muted">אותן מידות כמו בעורך המראה — שינוי באחד מעדכן את השני.</p>
                )}
              </div>
            </div>
          </section>

          <SectionDivider label="אפשר להשלים אחר כך" />

          {/* ── Everything else, folded: each row reads back what it holds on its end ── */}
          <section className="overflow-hidden rounded-md border border-border bg-surface">
            <FoldRow icon={ImagePlus} title="תמונה ותגיות" summary={sum.img} open={rows.has("img")} onToggle={() => toggleRow("img")}>
              <div className="space-y-3.5">
                {/* Was a "קישור תמונה" text field — a stopgap from before lib/files/ was wired, which
                    asked a designer to go and host the photograph somewhere else first. An existing URL
                    still renders here, so nothing typed under the old field is lost. */}
                <ImageField
                  hint="התמונה שמופיעה בכרטיס בקטלוג וברשימת הגרירה בסטודיו."
                  value={draft.imageUrl}
                  onChange={(imageUrl) => patch({ imageUrl })}
                  kind="product"
                />
                <div>
                  <span className={fieldLabelClassName}>תגיות סטייל</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {styleTagsOf([draft]).map((t) => (
                      <TagToggle key={t} active={draft.styleTags.includes(t)} onClick={() => toggleTag(t)}>
                        {t}
                      </TagToggle>
                    ))}
                    {/* Same pill geometry as the tags it sits among, dashed so it reads as "one more,
                        yours" rather than as a tag that happens to be unselected. */}
                    <input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onBlur={addTag}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                        if (e.key === "Escape") setNewTag("");
                      }}
                      placeholder="+ תגית משלכם"
                      aria-label="הוספת תגית סטייל"
                      className="w-32 rounded-pill border border-dashed border-border bg-canvas px-4 py-1.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-solid focus:border-accent-line"
                    />
                  </div>
                </div>
              </div>
            </FoldRow>

            {/* What an arrangement is made of, and the vase or jug it stands in (lib/catalog/vessel.ts)
                — drawn under it on the plan, packed and counted with it. A placement may set it in
                another, or in none. A centrepiece has no flower rows, only the vessel. A row of its
                own (the user's call, 2026-11-09): not required, so not in הבסיס. */}
            {/* What an AISLE is made of: the piece that lines it (any floor-standing row of this
                catalog) and how it is laid — a piece every so far, one side or both, the runner. The
                preview above draws it as it will land; the count is the plan's, from its length. */}
            {isAisle && (
              <FoldRow icon={Route} title="הרכב השדרה" summary={sum.aisle} open={rows.has("aisle")} onToggle={() => toggleRow("aisle")}>
                <div className="space-y-4">
                  <div>
                    <span className={fieldLabelClassName}>{pieceLabel ? `הפריט שלאורך השדרה — ${pieceLabel}` : "הפריט שלאורך השדרה"}</span>
                    <AislePiecePicker value={pieceValue} onChange={setPiece} choices={pieceChoices} lead={[{ value: "", label: "בלי פריט" }]} listClassName="max-h-44" />
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {pieceChoices.length === 0
                        ? "אין עדיין בקטלוג פריט שיכול לעמוד לאורך שדרה — מוסיפים קודם קופסת פרחים, עמוד, פנס או עץ."
                        : "כל פריט מהקטלוג שעומד במקום — קופסת פרחים, עמוד, פנס, עץ. הוא מצויר בכל נקודה לאורך השדרה, ונספר, נארז ומתומחר לפי השורה שלו."}
                    </p>
                  </div>
                  <AisleFields
                    spec={aisleSpecOf(draft)}
                    layout={aisleView?.layout}
                    onChange={(p) => setDraft((d) => ({ ...d, appearance: { shape: "rect" as const, content: "none" as const, ...d.appearance, aisle: aislePatch(d.appearance?.aisle, p) } }))}
                    idPrefix="aisle"
                  />
                </div>
              </FoldRow>
            )}
            {(category.flowers || vesselHolder) && (
              <FoldRow
                icon={category.flowers ? Flower2 : Amphora}
                title={category.flowers ? "מפרט פרחים" : "כלי"}
                summary={sum.flowers}
                open={rows.has("flowers")}
                onToggle={() => toggleRow("flowers")}
              >
                {category.flowers ? (
                  <div className="space-y-4">
                    <FlowerSpecFields
                      lines={draft.flowers ?? []}
                      known={knownFlowers}
                      typedStems={Number(draft.categoryFields.stems ?? 0)}
                      onChange={(flowers) => patch({ flowers })}
                      onTypedStems={(v) => setField("stems", v)}
                    />
                    {vesselHolder && draft.layer !== "ceiling" && <VesselField value={vesselValue} onChange={setVessel} />}
                  </div>
                ) : (
                  <VesselField value={vesselValue} onChange={setVessel} untitled />
                )}
              </FoldRow>
            )}

            {/* The shades it comes in. They paint the item on the plan and part the packing list; a
                shade may carry its own price, which is why the price row comes right after them. */}
            <FoldRow
              icon={Palette}
              title="גוונים וצבעים"
              summary={
                <>
                  {liveVariants.slice(0, 4).map((v) => (
                    <Swatch key={v.id} color={v.swatch} size={10} />
                  ))}
                  <span className="truncate">{sum.shades}</span>
                </>
              }
              open={rows.has("shades")}
              onToggle={() => toggleRow("shades")}
            >
              <div className="space-y-2">
                {liveVariants.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted">
                    אין גוונים. הוסיפו את הצבעים שיש לכם — הם אלה שייבחרו על התוכנית ויופרדו ברשימת הציוד.
                  </p>
                ) : (
                  liveVariants.map((v) => (
                    <div key={v.id} className="flex items-center gap-2">
                      {/* The shade itself. A swatch is optional — a variant can be a size or a finish
                          rather than a colour — but when it is set, this is the colour the studio
                          paints the item on the plan and the colour the picker shows the client. */}
                      <SwatchField value={v.swatch} onChange={(swatch) => setVariant(v.id, { swatch })} label={`צבע הגוון ${v.name || ""}`.trim()} />
                      <TextField value={v.name} onChange={(name) => setVariant(v.id, { name })} placeholder="שם הגוון (זהב…)" aria-label="שם הגוון" className="flex-1" />
                      {/* Empty = the item's price; the placeholder says which number that is. */}
                      {internal && (
                        <NumberField
                          hideZero
                          min={0}
                          value={v.unitPrice ?? 0}
                          onChange={(p) => setVariant(v.id, { unitPrice: p || undefined })}
                          placeholder={draft.unitPrice ? `₪${draft.unitPrice}` : "מחיר"}
                          aria-label={`מחיר לגוון ${v.name || ""} (ריק = מחיר המוצר)`.trim()}
                          className="w-24"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeVariant(v.id)}
                        aria-label={`הסרת הגוון ${v.name || ""}`.trim()}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-alert-tint hover:text-alert"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={addVariant}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  הוספת גוון
                </button>
              </div>
            </FoldRow>

            {/* The client's price — never in front of the client (see `internal`). In the meeting,
                this is where the designer is told what is left for later, in words a client reading
                over their shoulder learns nothing from. */}
            {internal ? (
              <FoldRow icon={Banknote} title="מחיר" summary={sum.price} open={rows.has("price")} onToggle={() => toggleRow("price")}>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    id="p-price"
                    label={`מחיר ${PRICE_UNIT_LABEL[draft.priceUnit ?? "unit"]} (₪)`}
                    min={0}
                    hideZero
                    placeholder="0"
                    value={draft.unitPrice ?? 0}
                    onChange={(v) => patch({ unitPrice: v || undefined })}
                  />
                  <div>
                    <label htmlFor="p-price-unit" className={fieldLabelClassName}>
                      המחיר הוא
                    </label>
                    <Select
                      id="p-price-unit"
                      value={draft.priceUnit ?? "unit"}
                      onChange={(v) => patch({ priceUnit: v === "unit" ? undefined : (v as PriceUnit) })}
                      options={[
                        { value: "unit", label: PRICE_UNIT_LABEL.unit },
                        { value: "m", label: PRICE_UNIT_LABEL.m },
                        { value: "m2", label: PRICE_UNIT_LABEL.m2 },
                      ]}
                      className="w-full"
                    />
                  </div>
                </div>
              </FoldRow>
            ) : (
              <p className="border-t border-border-soft px-4 py-3 text-xs leading-relaxed text-ink-soft">מחיר, ספק ומלאי משלימים אחר כך במסך הקטלוג.</p>
            )}

            {/* What the plan may do with it beyond drawing it: which layer it lives in, the counts it
                places (a table's seats, a candlestick's arms), stretching it, keeping room round it,
                hanging it. Questions about the item, answered once here rather than every time it is
                placed. */}
            <FoldRow icon={Layers} title="על התוכנית" summary={sum.plan} open={rows.has("plan")} onToggle={() => toggleRow("plan")}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="p-layer" className={fieldLabelClassName}>
                      שכבה
                    </label>
                    <Select
                      id="p-layer"
                      value={draft.layer}
                      onChange={(v) => patch({ layer: v as Product["layer"] })}
                      options={LAYERS.map((l) => ({ value: l.id, label: l.label }))}
                      className="w-full"
                    />
                  </div>
                  {/* How high a ceiling item hangs — the default every placed one starts from,
                      overridden per item in the studio. In categoryFields (lib/studio/hang.ts's
                      HANG_FIELD): a rigging fact, printed on the ceiling plan, and never a multiplier
                      the quote or the order reads. Beside the layer that switches it on. */}
                  {draft.layer === "ceiling" && category.anchor !== "wall" && (
                    <NumberField
                      id="p-hang"
                      label="גובה תלייה מהרצפה (ס״מ)"
                      min={0}
                      max={HANG_MAX_MM / 10}
                      hideZero
                      placeholder="—"
                      value={cm(Number(draft.categoryFields[HANG_FIELD]) || 0)}
                      onChange={(v) =>
                        setDraft((d) => {
                          const { [HANG_FIELD]: _old, ...rest } = d.categoryFields;
                          void _old;
                          return { ...d, categoryFields: v > 0 ? { ...rest, [HANG_FIELD]: Math.round(Math.min(v * 10, HANG_MAX_MM)) } : rest };
                        })
                      }
                    />
                  )}
                  {countFields.map((f) => (
                    <NumberField
                      key={f.key}
                      id={`f-${f.key}`}
                      label={f.label}
                      min={0}
                      hideZero
                      placeholder="0"
                      value={Number(draft.categoryFields[f.key] ?? 0)}
                      onChange={(v) => setField(f.key, v)}
                    />
                  ))}
                </div>

                {!stretch && (
                  <ResizeFields draft={draft} round={usesDiameter(currentShape)} ready={measured} internal={internal} onChange={(resize) => patch({ resize })} />
                )}

                <div>
                  <NumberField
                    id="p-clearance"
                    label="מרחק ביטחון מסביב (ס״מ)"
                    className="w-44"
                    min={0}
                    hideZero
                    placeholder="—"
                    value={cm(draft.clearanceMm)}
                    onChange={(v) => patch({ clearanceMm: v > 0 ? Math.round(v * 10) : undefined })}
                  />
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    כמה מקום פנוי הפריט צריך סביבו — מעבר מאחורי הכסאות, מרחק של וילון מנרות. בסקיצה הפריט
                    יקבל הילה, ואזהרה כשמשהו מתקרב אליו יותר מזה. ריק = בלי כלל.
                  </p>
                </div>
              </div>
            </FoldRow>

            <FoldRow icon={FileText} title="מפרט" summary={sum.spec} open={rows.has("spec")} onToggle={() => toggleRow("spec")}>
              <TextField
                id="p-spec"
                multiline
                rows={3}
                value={draft.spec ?? ""}
                onChange={(v) => patch({ spec: v || undefined })}
                placeholder="כל מאפיין אחר: חומר, צבע, מודולים…"
                aria-label="מפרט חופשי"
              />
            </FoldRow>

            {/* ── Procurement (lib/suppliers/) — kept apart from the price, because the two numbers
                are opposites: `unitPrice` is what the client pays and appears on a quote; `costPrice`
                here is what the studio pays and appears nowhere a client can see. ── */}
            {internal && !supplierOrg && (
              <FoldRow icon={PackageCheck} title="רכש ועלות" summary={sum.stock} open={rows.has("stock")} onToggle={() => toggleRow("stock")}>
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-muted">פנימי: לא מופיע בהצעת המחיר ולא במסכי הלקוח.</p>

                  {/* A row copied from the marketplace says where it came from, and the ONE thing the
                      source may ever do to it: offer its current price. Nothing is written without the
                      button — the cost is the designer's, like everything else on this row. */}
                  {sourceStatus && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-inset-border bg-inset px-3 py-2 text-xs leading-relaxed text-ink-soft">
                      <span>
                        {sourceStatus.gone
                          ? `הפריט כבר לא מפורסם אצל ${sourceStatus.supplierName || "הספק"} — העותק שלכם נשאר.`
                          : sourceStatus.updated
                            ? `${sourceStatus.supplierName || "הספק"} עדכן את המחיר: ${formatPrice(sourceStatus.wholesalePrice)}`
                            : `מהשוק — ${sourceStatus.supplierName || "ספק"}, מחיר ספק ${formatPrice(sourceStatus.wholesalePrice)}`}
                      </span>
                      {sourceStatus.updated && !sourceStatus.gone && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void acceptSourcePrice(draft.id).then(() => {
                              patch({ costPrice: sourceStatus.wholesalePrice });
                              setSource({ id: draft.id, status: { ...sourceStatus, updated: false } });
                            });
                          }}
                        >
                          עדכון העלות
                        </Button>
                      )}
                    </div>
                  )}

                  {/* THE ONE QUESTION (2026-10-30): where does it come from for an event. The three
                      answers are the three StockKinds; everything under them is conditional, so most
                      of the catalog sees this chip and one more field. Nothing here is required. */}
                  {(() => {
                    const sourced = kind !== "owned";
                    // A row from the store shows its supplier/cost only when it already HAS them (a
                    // vase copied off the marketplace, say): nothing is hidden, nothing is asked.
                    const showSource = sourced || !!draft.supplierId || !!draft.costPrice;
                    const orderUnitShown = sourced && (orderUnitOpen || !!draft.orderUnit || !!category.flowers || (draft.priceUnit ?? "unit") !== "unit");
                    return (
                      <>
                        <div>
                          <Segmented
                            label="מאיפה זה מגיע לאירוע?"
                            value={kind}
                            options={STOCK_OPTIONS}
                            onChange={(k) => patch({ stockKind: k === "owned" ? undefined : k })}
                          />
                          <p className="mt-1 text-xs leading-relaxed text-muted">{STOCK_KIND_HINT[kind]}</p>
                        </div>

                        {/* Only the owned kind has a count worth keeping: a consumable's stock is gone
                            after the event, and a rental is never yours. "לא נספר" is a real answer. */}
                        {kind === "owned" && (
                          <NumberField
                            id="p-stock"
                            label="כמה יש לכם"
                            className="w-44"
                            min={0}
                            hideZero
                            placeholder="לא נספר"
                            value={draft.stockQty ?? 0}
                            onChange={(v) => patch({ stockQty: v || undefined })}
                          />
                        )}

                        {showSource && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="p-supplier" className={fieldLabelClassName}>
                                ספק
                              </label>
                              <SupplierSelect
                                id="p-supplier"
                                value={draft.supplierId ?? ""}
                                suppliers={suppliers}
                                onChange={(v) => patch({ supplierId: v || undefined })}
                                onCreate={addSupplier}
                              />
                            </div>
                            <NumberField
                              id="p-cost"
                              label={`עלות ${costUnitLabel(draft.priceUnit ?? "unit", draft.orderUnit)} (₪)`}
                              min={0}
                              hideZero
                              placeholder="0"
                              value={draft.costPrice ?? 0}
                              onChange={(v) => patch({ costPrice: v || undefined })}
                            />
                          </div>
                        )}

                        {/* פחת — a rule about the product (Product.spareRate), never a usage figure:
                            the order is this much over what the plan counts. The category's default
                            shows as the placeholder, so a blank field still means 10% on a rose. */}
                        {kind === "consumable" && (
                          <NumberField
                            id="p-spare"
                            label="פחת — כמה אחוז מזמינים מעבר לספירה"
                            className="w-44"
                            min={0}
                            max={100}
                            hideZero
                            placeholder={String(category.defaultSpareRate ?? 0)}
                            value={draft.spareRate ?? 0}
                            onChange={(v) => patch({ spareRate: v || undefined })}
                          />
                        )}

                        {/* The two order fields, folded: a florist sells stems and a fabric house
                            metres, but a lamp is a lamp. Their labels read back each other, as before. */}
                        {sourced && !orderUnitShown && (
                          <button
                            type="button"
                            onClick={() => setOrderUnitOpen(true)}
                            className="self-start text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                          >
                            הספק מוכר ביחידה אחרת (מארז, גליל, גבעולים)…
                          </button>
                        )}
                        {orderUnitShown && (
                          <div className="rounded-md border border-inset-border bg-inset p-3">
                            <p className="mb-2.5 text-xs font-semibold text-ink-soft">איך הספק מוכר את זה?</p>
                            <div className="grid grid-cols-2 gap-3">
                              <TextField
                                id="p-order-unit"
                                label="יחידת ההזמנה אצל הספק"
                                value={draft.orderUnit ?? ""}
                                onChange={(v) => patch({ orderUnit: v.trim() || undefined })}
                                placeholder={category.flowers ? "גבעולים" : "מארז"}
                              />
                              <NumberField
                                id="p-order-factor"
                                label={`כמה ${draft.orderUnit?.trim() || "יחידות"} בפריט אחד`}
                                min={0}
                                hideZero
                                placeholder="1"
                                value={draft.orderFactor ?? 0}
                                onChange={(v) => patch({ orderFactor: v || undefined })}
                              />
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-muted">
                              {draft.orderUnit
                                ? `מסך הרכש יזמין ${draft.orderFactor || 1} ${draft.orderUnit} לכל ${draft.name.trim() || "פריט"} שמוצב על התוכנית.`
                                : category.flowers
                                  ? "הגבעולים כבר נגזרים ממפרט הפרחים ומופיעים ברכש פרח־פרח. מלאו רק אם הספק מוכר את הסידור עצמו ביחידה אחרת. אחרת השאירו ריק."
                                  : "מלאו רק אם הספק מוכר ביחידה אחרת ממה שמוצב על התוכנית — מארז של 12, גליל, קרטון. אחרת השאירו ריק."}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </FoldRow>
            )}

            {/* Who else sees it. Its own row, outside procurement: a SUPPLIER has no cost half, but
                publishing is the one decision its catalog exists for ("published" IS public). */}
            {internal && (
              <FoldRow icon={Eye} title={supplierOrg ? "פרסום בשוק הספקים" : "נראות"} summary={sum.vis} open={rows.has("vis")} onToggle={() => toggleRow("vis")}>
                {/* A base-library item is public because it is nobody's design — it is the 1.80m round
                    table every hall in the country owns, and the app installed it, flagged public, into
                    every studio (lib/catalog/standard/). "Should other designers see this?" is not a
                    question about that row, so the switch that asks it is not shown: publishing is a
                    decision about your OWN work. */}
                {fromLibrary ? (
                  <p className="rounded-md border border-inset-border bg-inset px-3 py-2 text-xs leading-relaxed text-ink-soft">
                    פריט מהספרייה הבסיסית — הוא ציבורי אצל כולם, ולכן אין כאן מה להחליט. המחיר, הכמות
                    והמראה על התוכנית הם שלכם ונשארים לעריכה.
                  </p>
                ) : (
                  /* The switch is worded as the thing being turned ON — "פריט ציבורי" — so that "off"
                     reads as the private default rather than as the absence of an unnamed state. Off
                     stores `undefined`, not the string "private": absent IS private (see Visibility), and
                     keeping one spelling is what makes the save/reload round-trip lossless. */
                  <SwitchRow
                    checked={draft.visibility === "public"}
                    onChange={(on) => patch({ visibility: on ? "public" : undefined })}
                    label={supplierOrg ? `מפורסם בשוק הספקים — ${draft.name.trim() || "הפריט"}` : `${VISIBILITY_LABEL.public} — ${draft.name.trim() || "הפריט"}`}
                    hint={
                      supplierOrg
                        ? draft.visibility === "public"
                          ? "כל מעצב ב-Eve רואה את הפריט ואת המחיר, ויכול להוסיף אותו לקטלוג שלו."
                          : "טיוטה — רק אתם רואים את הפריט. הדליקו כדי לפרסם אותו למעצבים."
                        : VISIBILITY_HINT[draft.visibility ?? "private"]
                    }
                  />
                )}
              </FoldRow>
            )}
          </section>
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-surface px-5 py-3.5">
          <Button type="submit">שמירה</Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <div className="ms-auto flex min-w-0 items-center gap-3">
            {incomplete ? (
              <button
                type="button"
                onClick={goToMissing}
                className={`inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold transition-colors ${submitted ? "text-alert-ink" : "text-muted hover:text-ink-soft"}`}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                <span className="truncate">חסרים: {missingLabels.join(", ")}</span>
              </button>
            ) : (
              !isEdit && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success-ink">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  מוכן לשמירה
                </span>
              )
            )}
            {isEdit && onDelete && canDelete(product) && (
              <Button
                variant="danger"
                onClick={() => {
                  onDelete(draft.id);
                  onClose();
                }}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                מחיקה
              </Button>
            )}
          </div>
        </footer>
      </form>
    </Drawer>
  );
}
