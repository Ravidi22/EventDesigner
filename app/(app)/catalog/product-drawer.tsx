"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
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
const shapeOf = (p: Product): MapShape => p.appearance?.shape ?? resolveFootprint(p).kind;
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

const mmToCm = (mm?: number) => (mm ?? 0) / 10;

// A quiet group header for the drawer's longer form — Assistant, no letter-spacing (Space
// Grotesk / tracked overlines are reserved for Latin kickers elsewhere in the system, never for
// Hebrew body copy), just small size + faint color + a hairline to read as "a new group starts here".
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-faint">{label}</span>
      <div className="h-px flex-1 bg-[#ebe8f5]" />
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
  const suppliers = useSupplierList(product !== null);

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
    appearance:
      (asksDiameter && !draft.dimensions.diameterMm) ||
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
    onSave({ ...draft, id: draft.id || uid(), name: draft.name.trim(), variants });
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
              <p className="text-sm font-medium text-ink">{SHAPE_LABEL[currentShape]}</p>
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
              {submitted && missing.appearance && (
                <p className="text-xs text-alert">יש להשלים את הצורה והמידות — לפיהן מצויר הפריט.</p>
              )}
            </div>
          </div>

          {showHeight && (
            <div className="grid grid-cols-3 gap-3">
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
            </div>
          )}

          {appearanceOpen && (
            <AppearanceModal product={draft} onSave={(p) => patch(p)} onClose={() => setAppearanceOpen(false)} />
          )}

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
              <p className="rounded-md border-[1.5px] border-dashed border-[#ddd6f0] px-3 py-2.5 text-xs text-[#a29eb2]">
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

        <footer className="flex items-center gap-2 border-t border-[#ebe8f5] bg-surface px-5 py-3.5">
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
