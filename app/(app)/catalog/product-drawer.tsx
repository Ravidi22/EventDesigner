"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  PRICE_UNIT_LABEL,
  ROUND_FIELD,
  SHAPE_LABEL,
  usesDiameter,
  STOCK_KIND_HINT,
  STOCK_KIND_LABEL,
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
import { FLOWER_NAMES, cleanFlowers, stemCount } from "@/lib/catalog/flowers";
import { costUnitLabel } from "@/lib/suppliers/procurement";
import { useSupplierList } from "@/lib/suppliers/use-suppliers";
import { catalogBox, footprintBounds, resolveContent, resolveFootprint, roundSizeMm } from "@/lib/studio/footprint";
import { RESIZE_DEFAULT_STEP_MM, type ResizeSpec } from "@/lib/catalog/types";
import { CATEGORIES, CATEGORY_BY_ID, LAYERS, styleTagsOf, type CategoryDef } from "@/lib/catalog/categories";
import { isPlacedAnywhere, isStandardProduct } from "@/lib/catalog/actions";
import { Button } from "@/components/button";
import { Drawer } from "@/components/drawer";
import { TagToggle } from "@/components/tag-toggle";
import { SwitchRow } from "@/components/toggle";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { ImageField } from "@/components/image-field";
import { fieldLabelClassName } from "@/components/control";
import { SwatchField } from "@/components/swatch-field";
import { Segmented } from "@/components/segmented";
import { AppearancePreview } from "./appearance-preview";
import { AppearanceModal } from "./appearance-modal";

const uid = () => crypto.randomUUID();

/** What a new product of this category is drawn as. `CategoryDef.dims` used to pick which size
 *  fields the drawer showed; it seeds the SHAPE now, and the shape picks the fields — see the
 *  "צורה ומידות" section, and the note on `asksFootprint`. */
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

const STOCK_OPTIONS: readonly (readonly [StockKind, string])[] = [
  ["owned", STOCK_KIND_LABEL.owned],
  ["consumable", STOCK_KIND_LABEL.consumable],
  ["rented", STOCK_KIND_LABEL.rented],
];

/** A new, empty product seeded from `c` — the catalog's first category unless the caller is
 *  narrowed to a few (the meeting's drawing passes, which only show part of the catalog). */
export function blankProduct(c: CategoryDef = CATEGORIES[0]): Product {
  return {
    id: "",
    name: "",
    category: c.id,
    layer: c.defaultLayer,
    dimensions: { heightMm: 0 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    // Seeded from the category, then owned by the product — see CategoryDef.defaultStock.
    stockKind: c.defaultStock,
    // Written out rather than left absent, because both halves of it are a decision:
    //   shape   — it is what the measurements below it are measurements OF (see `asksFootprint`).
    //   content — EMPTY. On a true-scale plan the outline already says what the item is; the name
    //             written across it is something a designer turns on for the few items that need
    //             it, not what every new product is born wearing. The base library has drawn this
    //             way from the start (lib/catalog/standard/) — a hand-added item now matches it.
    appearance: { shape: defaultShape(c), content: "none" },
  };
}

const mmToCm = (mm?: number) => (mm ?? 0) / 10;
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
          ready
            ? "פריט אחד שנמתח בסקיצה לגודל שהאירוע צריך — במה, בר ישר, ספה, שולחן אבירים — במקום שורה נפרדת לכל מידה."
            : "יש להשלים קודם את הצורה והמידות."
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

/** "מפרט פרחים" — what an arrangement is made of, as rows that multiply (Product.flowers): a flower
 *  and how many stems of it, per arrangement. The stem total every other surface reads is their sum,
 *  shown here and never typed while there are rows; an arrangement with no rows may still type a bare
 *  total, which is the designer saying "180 stems, don't ask me which". Names are offered from a
 *  datalist — the built-in vocabulary plus whatever this catalog already calls its flowers — and
 *  anything typed is taken. */
function FlowerSpecFields({
  lines,
  names,
  typedStems,
  onChange,
  onTypedStems,
}: {
  lines: FlowerLine[];
  names: string[];
  /** The bare total, used only while there are no rows. */
  typedStems: number;
  onChange: (lines: FlowerLine[]) => void;
  onTypedStems: (stems: number) => void;
}) {
  const listId = "p-flower-names";
  const setLine = (id: string, p: Partial<FlowerLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const add = () => onChange([...lines, { id: uid(), name: "", qty: 0 }]);
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));
  const total = stemCount(lines);
  const columns = "grid grid-cols-[1fr_5.5rem_2rem] items-center gap-2";

  return (
    <div className="space-y-2">
      <datalist id={listId}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted">
          אין מפרט. הוסיפו את הפרחים שמרכיבים את הסידור — סוג וכמות גבעולים לכל אחד. סך הגבעולים יחושב
          מהם, ורשימת הציוד והרכש יפרטו אותם פרח־פרח.
        </p>
      ) : (
        <div className="space-y-2">
          <div className={`${columns} px-0.5 text-[11px] font-semibold text-faint`}>
            <span>פרח</span>
            <span>גבעולים</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div key={l.id} className={columns}>
              <TextField
                value={l.name}
                onChange={(name) => setLine(l.id, { name })}
                placeholder="ורד, פיאוני, אקליפטוס…"
                list={listId}
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
      <div className="h-px flex-1 bg-border-soft" />
    </div>
  );
}

export function ProductDrawer({
  product,
  onSave,
  onDelete,
  onClose,
  internal = true,
  categories = CATEGORIES,
  flowerNames = FLOWER_NAMES,
}: {
  product: Product | null;
  onSave: (p: Product) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** Flower names to suggest in the spec rows — the catalog passes flowerNamesOf(its products) so
   *  one studio spells "ורד" one way; the default is the built-in vocabulary alone. */
  flowerNames?: string[];
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
  // The style vocabulary is a seed, not a closed list (styleTagsOf) — this is the box for a word
  // the studio uses that the seed never heard of.
  const [newTag, setNewTag] = useState("");
  // Whether the app installed this row or the designer wrote it — see isStandardProduct. Asked of
  // the server, because deriving the answer needs node:crypto. What is stored is the id the answer
  // was about, not a bare boolean: a drawer that goes straight from a base table to a new product
  // would otherwise carry the previous row's answer until the next one came back.
  const [libraryId, setLibraryId] = useState<string | null>(null);
  // Loaded once, the first time the drawer opens — the catalog's first paint owes nothing to it.
  // Never in the meeting: the supplier list is cost-side data and nothing there would show it.
  const suppliers = useSupplierList(product !== null && internal);

  useEffect(() => {
    if (product) {
      setDraft(product);
      setSubmitted(false);
      setAppearanceOpen(false);
    }
  }, [product]);

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

  if (!product) return null;

  const category = CATEGORY_BY_ID[draft.category];
  const isEdit = draft.id !== "";
  // Unknown until the server answers, and false the moment the drawer is showing a different row.
  const fromLibrary = !!productId && libraryId === productId;

  // Current shape/content, falling back to what the resolver would derive when appearance is unset.
  const currentShape = shapeOf(draft);
  const currentContent = contentOf(draft);

  // A stretch category (a drape, a rug) is cut or laid to whatever it has to cover, so it has no
  // width or depth here — those are drawn per placement in the studio.
  const stretch = category.sizing === "stretch";

  // ── Is the appearance finished? ────────────────────────────────────────────────────────────
  //
  // The shape and the measurements it is made of are the appearance modal's question now, not this
  // drawer's — but "did anyone answer it" is still this form's business, because a product can be
  // saved without ever opening the modal. So the same rule is checked here and stated once, on the
  // preview tile, instead of as three errors under three fields that no longer live here:
  // a circle needs a diameter, everything else a width and a depth, and a custom outline needs at
  // least three points. Without them the footprint can only fall back to MIN_FOOTPRINT_MM — a 60×60
  // box that ignores every number in the form.
  const asksFootprint = !stretch && currentShape !== "custom";
  const asksDiameter = asksFootprint && usesDiameter(currentShape);
  const asksBox = asksFootprint && !usesDiameter(currentShape);
  // Most categories keep asking for height regardless of `stretch` — a drape's height is its DROP,
  // the one dimension that still tells two rolls of the same curtain apart. needsHeight is the
  // explicit opt-out for the categories where height isn't a dimension of the item at all: see the
  // comment on CategoryDef.
  const showHeight = category.needsHeight !== false;

  // Everything the form is still missing, checked once and read twice: `save` refuses on it, and
  // each field marks itself only after a submit has been attempted.
  const missing = {
    name: draft.name.trim() === "",
    height: showHeight && !draft.dimensions.heightMm,
    appearance:
      (asksDiameter && !roundSizeMm(currentShape, draft.dimensions)) ||
      (asksBox && (!draft.dimensions.widthMm || !draft.dimensions.depthMm)) ||
      (currentShape === "custom" && (draft.appearance?.outline?.length ?? 0) < 3),
  };
  const incomplete = Object.values(missing).some(Boolean);

  const patch = (p: Partial<Product>) => setDraft((d) => ({ ...d, ...p }));
  const setDim = (key: keyof Product["dimensions"], cm: number) =>
    setDraft((d) => ({ ...d, dimensions: { ...d.dimensions, [key]: Math.round(cm * 10) } }));
  const setField = (key: string, v: number) => setDraft((d) => ({ ...d, categoryFields: { ...d.categoryFields, [key]: v } }));

  const changeCategory = (id: string) =>
    setDraft((d) => {
      const c = CATEGORY_BY_ID[id];
      return {
        ...d,
        category: id,
        layer: c.defaultLayer,
        categoryFields: {},
        // The spec follows the category: a product that stops being an arrangement has no flowers.
        flowers: c.flowers ? d.flowers : undefined,
        // Re-seeded with the layer and the category fields, for the same reason: the new category's
        // opinion is a better starting point than the old one's, and it stays editable.
        stockKind: c.defaultStock,
        // The shape re-seeds with them — a centrepiece is round, a stage is a box — except when the
        // designer has drawn one by hand, which a category change must never throw away. Content is
        // carried across as whatever the plan already draws, so changing category cannot silently
        // blank the name off an older product.
        appearance:
          d.appearance?.shape === "custom"
            ? d.appearance
            : { ...d.appearance, shape: defaultShape(c), content: contentOf(d) },
      };
    });

  // An archived supplier stays selectable while it is the one this product already names —
  // otherwise opening an old product would silently unlink it and saving would make that real.
  const supplierOptions = [
    { value: "", label: "ללא ספק" },
    ...suppliers
      .filter((s) => !s.archived || s.id === draft.supplierId)
      .map((s) => ({ value: s.id, label: s.archived ? `${s.name} (בארכיון)` : s.name })),
  ];

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
    setSubmitted(true);
    if (incomplete) return;
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

  // "עיגול · ⌀180 ס״מ" — what the tile says the plan will draw, so the answer to "how big is it"
  // survives the move into the modal and stays readable without opening it. Derived from the
  // resolved footprint rather than from the raw fields, which is the only way a custom outline
  // (whose measurement IS its drawing) reports the same way as a shape with number fields.
  const sizeSummary = (() => {
    if (stretch || missing.appearance) return null;
    const f = resolveFootprint(draft);
    if (f.kind === "circle") return `⌀${Math.round(f.diameterMm / 10)} ס״מ`;
    const b = footprintBounds(f);
    return `${Math.round(b.w / 10)}×${Math.round(b.h / 10)} ס״מ`;
  })();

  return (
    // The shell — geometry, header, close button and the single scrollbar — is the app's shared
    // drawer (components/drawer.tsx), the same one the dashboard's event detail opens. This screen
    // owns only the form inside it.
    <Drawer title={isEdit ? "עריכת מוצר" : "מוצר חדש"} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <TextField
            id="p-name"
            label="שם המוצר"
            value={draft.name}
            onChange={(v) => patch({ name: v })}
            placeholder="לדוגמה: מפת שולחן קטיפה"
            error={submitted && missing.name}
            errorMessage="יש להזין שם מוצר."
            autoFocus
          />

          <SectionDivider label="קטגוריה" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="p-cat" className={fieldLabelClassName}>
                קטגוריה
              </label>
              <Select
                id="p-cat"
                value={draft.category}
                onChange={changeCategory}
                options={categories.map((c) => ({ value: c.id, label: c.label }))}
                className="w-full"
              />
            </div>
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
          </div>

          <SectionDivider label="מראה על התוכנית" />

          {/* Everything that decides what the plan draws — the shape, the measurements it is made
              of, the outline, the content and the style — is one modal away (./appearance-modal).
              What stays here is the answer, not the controls: a tile showing exactly what will be
              drawn, and the size it will be drawn at. The height sits below it because it is NOT a
              footprint: nothing on a 2D plan reads it, and it is asked for the 3D view and for
              telling two drops of the same drape apart. */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setAppearanceOpen(true)}
              aria-label="עריכת המראה על התוכנית"
              className="group flex h-28 w-28 shrink-0 items-center justify-center rounded-md border border-border bg-bg p-2 transition-colors hover:border-accent"
            >
              {missing.appearance ? (
                <span className="text-center text-xs leading-snug text-muted group-hover:text-accent">
                  לחצו
                  <br />
                  לעריכת המראה
                </span>
              ) : (
                <AppearancePreview product={draft} className="h-full w-full" />
              )}
            </button>

            <div className="flex flex-1 flex-col items-start gap-1.5">
              <p className="text-sm font-medium text-ink">
                {SHAPE_LABEL[currentShape]}
                {!!draft.appearance?.parts?.length && ` + ${draft.appearance.parts.length === 1 ? "צורה נוספת" : `${draft.appearance.parts.length} צורות נוספות`}`}
              </p>
              <p className="text-xs text-muted">
                {stretch
                  ? `${category.label} נמדדים על התוכנית — הגודל נקבע כשמותחים אותם באירוע.`
                  : (sizeSummary ?? "ללא מידות")}
                {!stretch && sizeSummary && <> · {CONTENT_LABEL[currentContent]}</>}
              </p>
              {/* An outline button, not a ghost one: at this size, on a white card, a ghost label
                  beside a tile that is itself clickable read as a caption — nobody could see it
                  was the way in. The border and the pencil say it takes a click. */}
              <Button type="button" variant="outline" size="sm" className="mt-auto" onClick={() => setAppearanceOpen(true)}>
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                עריכת המראה
              </Button>
              {/* A round shape's one measurement is asked below, beside the height, and carries its
                  own error there; this line is for the shapes whose measurements live in the modal. */}
              {submitted && missing.appearance && !asksDiameter && (
                <p className="text-xs text-alert">יש להשלים את הצורה והמידות — לפיהן מצויר הפריט.</p>
              )}
            </div>
          </div>

          {(asksDiameter || showHeight) && (
            <div className="grid grid-cols-3 gap-3">
              {/* The ONE measurement a round item has, asked here as well as in the modal — the two
                  edit the same number. A centrepiece or an arrangement is "⌀40, 70 high" and nothing
                  else, and sending the designer into the shape editor for the first of those made the
                  commonest item in the catalog the one with the longest form. Only for the diameter
                  shapes: a box's width and depth stay with the shape they are measurements of, where
                  the modal's note about "a diameter typed under a מלבן" still holds. */}
              {asksDiameter &&
                (() => {
                  const field = ROUND_FIELD[currentShape] ?? { label: "קוטר", factor: 1 };
                  const D = roundSizeMm(currentShape, draft.dimensions) ?? 0;
                  return (
                    <NumberField
                      id="p-diameter"
                      label={`${field.label} (ס״מ)`}
                      required
                      hideZero
                      min={0}
                      error={submitted && missing.appearance}
                      errorMessage={`${field.label} נדרש — לפיו מצויר הפריט.`}
                      value={D / field.factor / 10}
                      onChange={(v) => setDim("diameterMm", v * field.factor)}
                    />
                  );
                })()}
              {showHeight && (
                <NumberField
                  label="גובה (ס״מ)"
                  required
                  hideZero
                  min={0}
                  error={submitted && missing.height}
                  errorMessage="גובה נדרש (לטובת ההדמיה התלת־ממדית)."
                  value={mmToCm(draft.dimensions.heightMm)}
                  onChange={(v) => setDim("heightMm", v)}
                />
              )}
            </div>
          )}

          {appearanceOpen && (
            <AppearanceModal product={draft} onSave={(p) => patch(p)} onClose={() => setAppearanceOpen(false)} />
          )}

          {/* F-4.3: only count-multiplier fields are structured (arms, seats). A flower category's
              `stems` is the exception that proves it — it is still the one multiplier, but it is
              filled by the spec's rows (FlowerSpecFields owns it), so it is not asked here. */}
          {category.fields.some((f) => !(category.flowers && f.key === "stems")) && (
            <div className="grid grid-cols-2 gap-3">
              {category.fields
                .filter((f) => !(category.flowers && f.key === "stems"))
                .map((f) => (
                  <NumberField
                    key={f.key}
                    id={`f-${f.key}`}
                    label={f.suffix ? `${f.label} (מכפיל ${f.suffix})` : f.label}
                    min={0}
                    value={Number(draft.categoryFields[f.key] ?? 0)}
                    onChange={(v) => setField(f.key, v)}
                  />
                ))}
            </div>
          )}

          {category.flowers && (
            <>
              <SectionDivider label="מפרט פרחים" />
              <FlowerSpecFields
                lines={draft.flowers ?? []}
                names={flowerNames}
                typedStems={Number(draft.categoryFields.stems ?? 0)}
                onChange={(flowers) => patch({ flowers })}
                onTypedStems={(v) => setField("stems", v)}
              />
            </>
          )}

          {/* What the plan may do with it beyond drawing it: stretch it, and keep room round it.
              Both are questions about the item, so they are answered once, here, rather than every
              time it is placed. */}
          <SectionDivider label="על התוכנית" />

          {!stretch && (
            <ResizeFields
              draft={draft}
              round={usesDiameter(currentShape)}
              ready={!missing.appearance}
              internal={internal}
              onChange={(resize) => patch({ resize })}
            />
          )}

          <div>
            <NumberField
              id="p-clearance"
              label="מרחק ביטחון מסביב (ס״מ)"
              className="w-44"
              min={0}
              hideZero
              placeholder="—"
              value={cmOf(draft.clearanceMm)}
              onChange={(v) => patch({ clearanceMm: v > 0 ? Math.round(v * 10) : undefined })}
            />
            <p className="mt-1 text-xs leading-relaxed text-muted">
              כמה מקום פנוי הפריט צריך סביבו — מעבר מאחורי הכסאות, מרחק של וילון מנרות. בסקיצה הפריט
              יקבל הילה, ואזהרה כשמשהו מתקרב אליו יותר מזה. ריק = בלי כלל.
            </p>
          </div>

          <SectionDivider label="מפרט" />

          <TextField
            id="p-spec"
            label="מפרט חופשי"
            multiline
            rows={2}
            value={draft.spec ?? ""}
            onChange={(v) => patch({ spec: v || undefined })}
            placeholder="כל מאפיין אחר: חומר, צבע, מודולים…"
          />

          {/* The client's price — never in front of the client (see `internal`). */}
          {internal && (
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
                <span className={fieldLabelClassName}>המחיר הוא</span>
                <Select
                  value={draft.priceUnit ?? "unit"}
                  onChange={(v) => patch({ priceUnit: v === "unit" ? undefined : (v as PriceUnit) })}
                  aria-label="יחידת המחיר"
                  options={[
                    { value: "unit", label: PRICE_UNIT_LABEL.unit },
                    { value: "m", label: PRICE_UNIT_LABEL.m },
                    { value: "m2", label: PRICE_UNIT_LABEL.m2 },
                  ]}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Was a "קישור תמונה" text field — a stopgap from before lib/files/ was wired, which
              asked a designer to go and host the photograph somewhere else first. An existing URL
              still renders here, so nothing typed under the old field is lost. */}
          <ImageField
            label="תמונת המוצר"
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

          {internal && (
            <>
              {/* ── Procurement (lib/suppliers/) ─────────────────────────────────────────────────
                  Kept AFTER the price and clearly apart from it, because the two numbers on this
                  screen are opposites: `unitPrice` above is what the client pays and appears on a
                  quote; `costPrice` here is what the studio pays and appears nowhere a client can
                  see. Same field styling, different half of the form, so they are never confused. */}
              <SectionDivider label="רכש ועלות" />

              {/* Said once, at the top of the section, instead of left for the designer to infer from
                  two fields called "מחיר" and "עלות" sitting a few rows apart. */}
              <p className="text-xs leading-relaxed text-muted">
                מה שאתם משלמים על הפריט וכמה מהם צריך להזמין. פנימי — לא מופיע בהצעת המחיר ולא במסכי
                הלקוח.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="p-supplier" className={fieldLabelClassName}>
                    ספק
                  </label>
                  <Select
                    id="p-supplier"
                    value={draft.supplierId ?? ""}
                    onChange={(v) => patch({ supplierId: v || undefined })}
                    options={supplierOptions}
                    className="w-full"
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

              <div>
                <Segmented
                  label="סוג המלאי"
                  value={draft.stockKind ?? "owned"}
                  options={STOCK_OPTIONS}
                  onChange={(k) => patch({ stockKind: k === "owned" ? undefined : k })}
                />
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {STOCK_KIND_HINT[draft.stockKind ?? "owned"]}
                </p>
              </div>

              {/* Only the owned kind has a count worth keeping: a consumable's stock is gone after
                  the event, and a rental is never yours. Showing the field for those would be
                  inviting a number that means nothing.

                  It stands on its own line rather than in a three-column row with the two order
                  fields below: those two are one sentence about the SUPPLIER, this is a count of what
                  is in your storeroom, and a grid that drops its first cell for two of the three
                  stock kinds made the remaining pair jump sideways every time the toggle moved. */}
              {(draft.stockKind ?? "owned") === "owned" && (
                <NumberField
                  id="p-stock"
                  label="כמה יש לכם במחסן"
                  className="w-44"
                  min={0}
                  hideZero
                  placeholder="—"
                  value={draft.stockQty ?? 0}
                  onChange={(v) => patch({ stockQty: v || undefined })}
                />
              )}

              {/* The two order fields, boxed and titled with the question they answer together. Their
                  labels used to be "יחידת הזמנה" and "כמה ליחידה" — two nouns that only make sense
                  once you already know the answer. The second one reads back the first now. */}
              <div className="rounded-md border border-inset-border bg-inset p-3">
                <p className="mb-2.5 text-xs font-semibold text-ink-soft">איך הספק מוכר את זה?</p>
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    id="p-order-unit"
                    label="יחידת ההזמנה אצל הספק"
                    value={draft.orderUnit ?? ""}
                    onChange={(v) => patch({ orderUnit: v.trim() || undefined })}
                    placeholder="גבעולים"
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
                    ? `מסך הרכש יזמין ${draft.orderFactor || 1} ${draft.orderUnit} לכל ${
                        draft.name.trim() || "פריט"
                      } שמוצב על התוכנית.`
                    : category.flowers
                      ? "הגבעולים כבר נגזרים ממפרט הפרחים ומופיעים ברכש פרח־פרח. מלאו רק אם הספק מוכר את הסידור עצמו ביחידה אחרת. אחרת השאירו ריק."
                      : "מלאו רק אם הספק מוכר ביחידה אחרת ממה שמוצב על התוכנית — פרחים נמכרים בגבעולים ולא במרכזי שולחן. אחרת השאירו ריק."}
                </p>
              </div>

              <SectionDivider label="נראות" />

              {/* A base-library item is public because it is nobody's design — it is the 1.80m round
                  table every hall in the country owns, and the app installed it, flagged public, into
                  every studio (lib/catalog/standard/). "Should other designers see this?" is not a
                  question about that row, so the switch that asks it is not shown: publishing is a
                  decision about your OWN work. Everything else on this screen — the price, the stock
                  count, the shape, the name — is still this studio's and stays editable. */}
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
                  label={`${VISIBILITY_LABEL.public} — ${draft.name.trim() || "הפריט"}`}
                  hint={VISIBILITY_HINT[draft.visibility ?? "private"]}
                />
              )}
            </>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={fieldLabelClassName + " mb-0"}>גוונים וצבעים</span>
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                הוסף
              </button>
            </div>
            {draft.variants.filter((v) => !v.archived).length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted">
                אין גוונים. הוסיפו את הצבעים שיש לכם — הם אלה שייבחרו על התוכנית ויופרדו ברשימת הציוד.
              </p>
            ) : (
              <div className="space-y-2">
                {draft.variants.filter((v) => !v.archived).map((v) => (
                  <div key={v.id} className="flex items-center gap-2">
                    {/* The shade itself. A swatch is optional — a variant can be a size or a finish
                        rather than a colour — but when it is set, this is the colour the studio
                        paints the item on the plan and the colour the picker shows the client. */}
                    <SwatchField
                      value={v.swatch}
                      onChange={(swatch) => setVariant(v.id, { swatch })}
                      label={`צבע הגוון ${v.name || ""}`.trim()}
                    />
                    <TextField
                      value={v.name}
                      onChange={(name) => setVariant(v.id, { name })}
                      placeholder="שם הגוון (זהב…)"
                      className="flex-1"
                    />
                    {internal && (
                      <NumberField
                        hideZero
                        min={0}
                        value={v.unitPrice ?? 0}
                        onChange={(p) => setVariant(v.id, { unitPrice: p || undefined })}
                        placeholder="מחיר"
                        className="w-24"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeVariant(v.id)}
                      aria-label="הסר וריאנט"
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-alert-tint hover:text-alert"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Says where the hidden half went, so the designer knows the item is not finished — and
              says it in words a client reading over their shoulder learns nothing from. */}
          {!internal && (
            <p className="rounded-md border border-inset-border bg-inset px-3 py-2 text-xs leading-relaxed text-ink-soft">
              מחיר, ספק ומלאי משלימים אחר כך במסך הקטלוג.
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-surface px-5 py-3.5">
          <Button type="submit">שמירה</Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          {isEdit && (
            <Button
              variant="danger"
              className="ms-auto"
              onClick={() => {
                onDelete(draft.id);
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              מחיקה
            </Button>
          )}
        </footer>
      </form>
    </Drawer>
  );
}
