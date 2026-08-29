"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  MAP_SHAPES,
  PRICE_UNIT_LABEL,
  SHAPE_LABEL,
  STOCK_KIND_HINT,
  STOCK_KIND_LABEL,
  VISIBILITY_LABEL,
  VISIBILITY_HINT,
  type Product,
  type Variant,
  type MapAppearance,
  type MapShape,
  type PriceUnit,
  type StockKind,
} from "@/lib/catalog/types";
import { costUnitLabel } from "@/lib/suppliers/procurement";
import { useSupplierList } from "@/lib/suppliers/use-suppliers";
import { footprintBounds, resolveContent, resolveFootprint } from "@/lib/studio/footprint";
import { CATEGORIES, CATEGORY_BY_ID, LAYERS, STYLE_TAGS, type CategoryDef } from "@/lib/catalog/categories";
import { isPlacedAnywhere, isStandardProduct } from "@/lib/catalog/actions";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { TagToggle } from "@/components/tag-toggle";
import { SwitchRow } from "@/components/toggle";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { ImageField } from "@/components/image-field";
import { StyleFields } from "@/components/style-fields";
import { fieldLabelClassName } from "@/components/control";
import { SwatchField } from "@/components/swatch-field";
import { AppearancePreview } from "./appearance-preview";
import { ShapeEditorModal } from "./shape-editor-modal";
import { IconPicker } from "./icon-picker";

const uid = () => crypto.randomUUID();

/** What a new product of this category is drawn as. `CategoryDef.dims` used to pick which size
 *  fields the drawer showed; it seeds the SHAPE now, and the shape picks the fields — see the
 *  "צורה ומידות" section, and the note on `asksFootprint`. */
const defaultShape = (c: CategoryDef): MapShape => (c.dims === "round" ? "circle" : "rect");

// What the plan draws for a draft right now — the value a toggle shows as chosen, and the one any
// appearance patch has to preserve. A product from before `appearance` existed has no row to read
// and the resolvers answer for it: a diameter makes it a circle, and it draws its name.
const shapeOf = (p: Product): MapShape => p.appearance?.shape ?? resolveFootprint(p).kind;
const contentOf = (p: Product): MapAppearance["content"] => p.appearance?.content ?? resolveContent(p).mode;

const SHAPE_OPTIONS = MAP_SHAPES.map((s) => ({ value: s, label: SHAPE_LABEL[s] }));

const CONTENT_OPTIONS = [
  ["none", "ריק"],
  ["icon", "אייקון"],
  ["name", "שם"],
] as const;

const STOCK_OPTIONS: readonly (readonly [StockKind, string])[] = [
  ["owned", STOCK_KIND_LABEL.owned],
  ["consumable", STOCK_KIND_LABEL.consumable],
  ["rented", STOCK_KIND_LABEL.rented],
];

export function blankProduct(): Product {
  const c = CATEGORIES[0];
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

// One row of mutually exclusive choices, filling its container. Every option gets the SAME width:
// with intrinsic widths the row spread itself unevenly at whatever length the Hebrew words happened
// to be ("אליפסה" three times "שם"), which reads as a broken control rather than as one question
// with four answers. flex-1 + no wrapping is the whole fix, and all three groups in this drawer
// share it now instead of each re-declaring the same markup.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  labelClassName = "mb-1 block text-xs text-muted",
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  labelClassName?: string;
}) {
  return (
    <div>
      <span className={labelClassName}>{label}</span>
      <div role="group" aria-label={label} className="flex gap-1 rounded-md border border-border p-0.5">
        {options.map(([v, optionLabel]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={
              "flex-1 rounded-sm px-2 py-1 text-xs transition-colors " +
              (value === v ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")
            }
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

const mmToCm = (mm?: number) => (mm ?? 0) / 10;

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
}: {
  product: Product | null;
  onSave: (p: Product) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Product>(blankProduct);
  const [submitted, setSubmitted] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [shapeModalOpen, setShapeModalOpen] = useState(false);
  // Whether the app installed this row or the designer wrote it — see isStandardProduct. Asked of
  // the server, because deriving the answer needs node:crypto. What is stored is the id the answer
  // was about, not a bare boolean: a drawer that goes straight from a base table to a new product
  // would otherwise carry the previous row's answer until the next one came back.
  const [libraryId, setLibraryId] = useState<string | null>(null);
  // Loaded once, the first time the drawer opens — the catalog's first paint owes nothing to it.
  const suppliers = useSupplierList(product !== null);

  useEffect(() => {
    if (product) {
      setDraft(product);
      setSubmitted(false);
      setPickingIcon(false);
      setShapeModalOpen(false);
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

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (product && !d.open) d.showModal();
    if (!product && d.open) d.close();
  }, [product]);

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

  // ── Which measurements this item is made of — THE SHAPE PICKS THEM ─────────────────────────
  //
  // The category used to: `dims: "both"` asked for a diameter AND a width AND a depth, and then
  // resolveFootprint read whichever pair the shape happened to want. Type a diameter, leave the
  // shape on מלבן, and the plan drew MIN_FOOTPRINT_MM — a 60×60 box that ignored every number in
  // the form. The measurements were never wrong; they were answers to a question nobody had asked.
  //
  // So the shape is asked first and the fields follow from it: a circle has a diameter, a rectangle
  // and an ellipse have a width and a depth, and a custom outline IS its own measurement. What the
  // shape asks for is then required (below) — a footprint with no numbers can only fall back to
  // that same 60cm box. `CategoryDef.dims` still seeds the shape (defaultShape), which is the
  // opinion it always really held.
  const asksFootprint = !stretch && currentShape !== "custom";
  const asksDiameter = asksFootprint && currentShape === "circle";
  const asksBox = asksFootprint && currentShape !== "circle";
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
    diameter: asksDiameter && !draft.dimensions.diameterMm,
    width: asksBox && !draft.dimensions.widthMm,
    depth: asksBox && !draft.dimensions.depthMm,
    outline: currentShape === "custom" && (draft.appearance?.outline?.length ?? 0) < 3,
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

  // Patch appearance, always keeping the required fields present — and seeding them from what the
  // plan already draws, so changing only the style of a product that never had an appearance row
  // cannot quietly change its shape or blank its name.
  const setAppearance = (patch: Partial<MapAppearance>) =>
    setDraft((d) => ({
      ...d,
      appearance: { shape: shapeOf(d), content: contentOf(d), ...d.appearance, ...patch },
    }));

  // Changing the shape carries the size across instead of dropping it: a 180cm round table that
  // becomes a rectangle is still 180cm wide, and the field says so rather than sitting empty while
  // the footprint quietly falls back to 60cm. It only ever FILLS a blank — a measurement the
  // designer typed is never overwritten by one derived from another shape.
  const changeShape = (shape: MapShape) => {
    if (shape === "custom") {
      setAppearance({ shape: "custom", outline: draft.appearance?.outline ?? [] });
      setShapeModalOpen(true);
      return;
    }
    setDraft((d) => {
      const dim = d.dimensions;
      return {
        ...d,
        dimensions:
          shape === "circle"
            ? { ...dim, diameterMm: dim.diameterMm || dim.widthMm || dim.depthMm || undefined }
            : {
                ...dim,
                widthMm: dim.widthMm || dim.diameterMm || undefined,
                depthMm: dim.depthMm || dim.diameterMm || undefined,
              },
        appearance: { content: contentOf(d), ...d.appearance, shape },
      };
    });
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
    onSave({ ...draft, id: draft.id || uid(), name: draft.name.trim(), variants });
    onClose();
  };

  // What the drawn outline measures, in cm — the answer to "how big will this be?" for the one
  // shape with no number fields of its own.
  const customSize =
    currentShape === "custom" && !missing.outline
      ? (() => {
          const b = footprintBounds(resolveFootprint(draft));
          return `${Math.round(b.w / 10)}×${Math.round(b.h / 10)} ס״מ`;
        })()
      : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="drawer fixed inset-y-0 inset-inline-end-0 m-0 h-dvh w-full max-w-md bg-bg text-ink shadow-[-24px_0_60px_-30px_rgba(70,40,130,0.4)]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex h-full flex-col"
      >
        <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3.5">
          <h2 className="font-display text-base">{isEdit ? "עריכת מוצר" : "מוצר חדש"}</h2>
          <IconButton label="סגור" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2} />
          </IconButton>
        </header>

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
                options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
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

          <SectionDivider label="צורה ומידות (ס״מ)" />

          <fieldset className="space-y-3">
            {/* The shape first, then the measurements it is made of — see `asksFootprint`.
                A Select and not a row of buttons: the vocabulary is a dozen shapes now (MAP_SHAPES),
                and twelve segments in a drawer this wide is a row of unreadable slivers. */}
            <div>
              <label htmlFor="p-shape" className={fieldLabelClassName}>
                צורה
              </label>
              <Select
                id="p-shape"
                value={currentShape}
                onChange={(v) => changeShape(v as MapShape)}
                options={SHAPE_OPTIONS}
                className="w-full"
              />
            </div>

            {stretch && (
              <p className="rounded-md border border-inset-border bg-inset px-3 py-2 text-xs leading-relaxed text-ink-soft">
                {category.label} נמדדים על התוכנית, לא כאן — הגודל נקבע כשמותחים אותם באירוע, והמחיר
                מחושב לפי מה שנפרש בפועל.
              </p>
            )}

            {currentShape === "custom" && (
              <div className="rounded-md border border-inset-border bg-inset px-3 py-2 text-xs leading-relaxed text-ink-soft">
                הצורה עצמה היא המידה{customSize ? ` — ${customSize}` : ""}. מה שתשרטטו הוא מה שיצויר על התוכנית.
                <button
                  type="button"
                  onClick={() => setShapeModalOpen(true)}
                  className="ms-1.5 font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  {missing.outline ? "שרטוט הצורה…" : "עריכת הצורה"}
                </button>
              </div>
            )}
            {submitted && missing.outline && (
              <p className="text-xs text-alert">יש לסמן צורה סגורה (לפחות 3 נקודות).</p>
            )}

            {(asksFootprint || showHeight) && (
              <div className="grid grid-cols-3 gap-3">
                {asksDiameter && (
                  <NumberField
                    label="קוטר"
                    required
                    hideZero
                    min={0}
                    error={submitted && missing.diameter}
                    errorMessage="קוטר נדרש — לפיו מצויר הפריט."
                    value={mmToCm(draft.dimensions.diameterMm)}
                    onChange={(v) => setDim("diameterMm", v)}
                  />
                )}
                {asksBox && (
                  <>
                    <NumberField
                      label="רוחב"
                      required
                      hideZero
                      min={0}
                      error={submitted && missing.width}
                      errorMessage="רוחב נדרש — לפיו מצויר הפריט."
                      value={mmToCm(draft.dimensions.widthMm)}
                      onChange={(v) => setDim("widthMm", v)}
                    />
                    <NumberField
                      label="עומק"
                      required
                      hideZero
                      min={0}
                      error={submitted && missing.depth}
                      errorMessage="עומק נדרש — לפיו מצויר הפריט."
                      value={mmToCm(draft.dimensions.depthMm)}
                      onChange={(v) => setDim("depthMm", v)}
                    />
                  </>
                )}
                {showHeight && (
                  <NumberField
                    label="גובה"
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

            <ShapeEditorModal
              open={shapeModalOpen}
              outline={draft.appearance?.outline ?? []}
              edgeCurves={draft.appearance?.edgeCurves}
              onSave={(outline, edgeCurves) => setAppearance({ shape: "custom", outline, edgeCurves })}
              onClose={() => setShapeModalOpen(false)}
            />
          </fieldset>

          {/* F-4.3: only count-multiplier fields are structured (arms, seats) */}
          {category.fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {category.fields.map((f) => (
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
            <span className={fieldLabelClassName}>מראה על התוכנית</span>
            <div className="flex gap-3">
              {currentShape === "custom" ? (
                <button
                  type="button"
                  onClick={() => setShapeModalOpen(true)}
                  aria-label="עריכת צורת הפריט"
                  className="group flex h-28 w-28 shrink-0 items-center justify-center rounded-md border border-border bg-bg p-2 transition-colors hover:border-accent"
                >
                  {(draft.appearance?.outline?.length ?? 0) >= 3 ? (
                    <AppearancePreview product={draft} className="h-full w-full" />
                  ) : (
                    <span className="text-center text-xs leading-snug text-muted group-hover:text-accent">
                      לחצו
                      <br />
                      לעריכת הצורה
                    </span>
                  )}
                </button>
              ) : (
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-md border border-border bg-bg p-2">
                  <AppearancePreview product={draft} className="h-full w-full" />
                </div>
              )}

              <div className="flex-1 space-y-2">
                {/* The shape lives up in "צורה ומידות" now: it is the question the measurements
                    under it are answers to, and asking it in two places let the two disagree. */}
                <Segmented
                  label="תוכן"
                  value={currentContent}
                  options={CONTENT_OPTIONS}
                  onChange={(c) => { setAppearance({ content: c }); setPickingIcon(c === "icon"); }}
                />

                <div>
                  <span className="mb-1 block text-xs text-muted">עיצוב</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <StyleFields style={draft.appearance?.style} onChange={(style) => setAppearance({ style })} strokeWidthDefault={2} />
                  </div>
                </div>
              </div>
            </div>

            {currentContent === "icon" && pickingIcon && (
              <div className="mt-2">
                <IconPicker
                  value={draft.appearance?.icon}
                  onPick={(icon) => { setAppearance({ content: "icon", icon }); setPickingIcon(false); }}
                />
              </div>
            )}
          </div>

          <div>
            <span className={fieldLabelClassName}>תגיות סטייל</span>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_TAGS.map((t) => (
                <TagToggle key={t} active={draft.styleTags.includes(t)} onClick={() => toggleTag(t)}>
                  {t}
                </TagToggle>
              ))}
            </div>
          </div>

          {/* ── Procurement (lib/suppliers/) ─────────────────────────────────────────────────
              Kept AFTER the price and clearly apart from it, because the two numbers on this
              screen are opposites: `unitPrice` above is what the client pays and appears on a
              quote; `costPrice` here is what the studio pays and appears nowhere a client can
              see. Same field styling, different half of the form, so they are never confused. */}
          <SectionDivider label="רכש ועלות" />

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
              labelClassName={fieldLabelClassName}
              value={draft.stockKind ?? "owned"}
              options={STOCK_OPTIONS}
              onChange={(k) => patch({ stockKind: k === "owned" ? undefined : k })}
            />
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {STOCK_KIND_HINT[draft.stockKind ?? "owned"]}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Only the owned kind has a count worth keeping: a consumable's stock is gone after
                the event, and a rental is never yours. Showing the field for those would be
                inviting a number that means nothing. */}
            {(draft.stockKind ?? "owned") === "owned" && (
              <NumberField
                id="p-stock"
                label="כמה יש לך"
                min={0}
                hideZero
                placeholder="—"
                value={draft.stockQty ?? 0}
                onChange={(v) => patch({ stockQty: v || undefined })}
              />
            )}
            <TextField
              id="p-order-unit"
              label="יחידת הזמנה"
              value={draft.orderUnit ?? ""}
              onChange={(v) => patch({ orderUnit: v.trim() || undefined })}
              placeholder="גבעולים"
            />
            <NumberField
              id="p-order-factor"
              label="כמה ליחידה"
              min={0}
              hideZero
              placeholder="1"
              value={draft.orderFactor ?? 0}
              onChange={(v) => patch({ orderFactor: v || undefined })}
            />
          </div>
          <p className="-mt-2 text-xs leading-relaxed text-muted">
            {draft.orderUnit
              ? `מסך הרכש יזמין ב${draft.orderUnit} — ${draft.orderFactor || 1} לכל ${
                  draft.name.trim() || "פריט"
                } שמוצב על התוכנית.`
              : "יחידת הזמנה היא מה שהספק מוכר בו, כשזה לא מה שמוצב על התוכנית: פרחים נמכרים בגבעולים ולא במרכזי שולחן."}
          </p>

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
                    <NumberField
                      hideZero
                      min={0}
                      value={v.unitPrice ?? 0}
                      onChange={(p) => setVariant(v.id, { unitPrice: p || undefined })}
                      placeholder="מחיר"
                      className="w-24"
                    />
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
    </dialog>
  );
}
