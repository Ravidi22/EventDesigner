"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Move, Trash2 } from "lucide-react";
import type { CompositionLine, Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, styleTagsOf } from "@/lib/catalog/categories";
import { canBePart, compositeShell, compositionCounts, isTableSet, layoutRecipe } from "@/lib/catalog/composition";
import { loadProducts, productById } from "@/lib/catalog/storage";
import { resolve } from "@/lib/studio/catalog-resolver";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { Drawer } from "@/components/drawer";
import { TagToggle } from "@/components/tag-toggle";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { ImageField } from "@/components/image-field";
import { ComboField, type ComboOption } from "@/components/combo-field";
import { fieldLabelClassName } from "@/components/control";
import { CompositionDrawing } from "@/components/composition-drawing";
import { compositeTotal } from "./composite-summary";
import type { CompositionEditorProps } from "./composition-editor";

// The canvas editor carries the studio's whole canvas — its own chunk, fetched when it is opened.
const CompositionEditor = dynamic<CompositionEditorProps>(() => import("./composition-editor"), { ssr: false });

const uid = () => crypto.randomUUID();

/** A new composite, put together from a list (layoutRecipe) — what /catalog's "פריט מורכב חדש"
 *  opens. Its id is empty until the first save, like blankProduct's. */
export function blankComposite(): Product {
  return { id: "", name: "", styleTags: [], ...compositeShell(0, 0), composition: { tables: [], placements: [], groups: [], recipe: [] } };
}

/**
 * The form for a COMPOSITE catalog item (lib/catalog/composition.ts) — the product drawer's shell
 * with a different body, because almost nothing the product form asks means anything here: a
 * composite has no shape of its own (it is its parts, drawn), no price (its parts are priced, and the
 * sum is shown, never stored), no shades, no supplier, no stock. What it does have is its name, its
 * photo and tags, and what it is made of.
 *
 * Made of — two cases. Put together from a LIST: the list is the item, each row a catalog row and
 * how many, and every edit lays the parts out again (layoutRecipe). ARRANGED — by hand on the
 * composition editor's canvas (composition-editor.tsx: the parts picked off the studio's catalog rail
 * and set out as they will stand), or saved off a sketch: the arrangement is the item, so the parts
 * are listed as they are and changed on that canvas — never through a list that would throw the
 * arrangement away. The canvas opens on whatever the item is now, a laid-out list included; saving it
 * there lets the list go.
 */
export function CompositeDrawer({
  product,
  onSave,
  onDelete,
  onClose,
  internal = true,
}: {
  product: Product;
  onSave: (p: Product) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  /** False in front of a client (the meeting): the parts' total is not shown. */
  internal?: boolean;
}) {
  const [draft, setDraft] = useState<Product>(product);
  const [submitted, setSubmitted] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [query, setQuery] = useState("");
  const [arranging, setArranging] = useState(false);
  const composition = draft.composition ?? { tables: [], placements: [], groups: [] };
  const recipe = composition.recipe;
  const isEdit = draft.id !== "";

  // The rows a part may be: everything that stands somewhere, archived and composites aside.
  const options: ComboOption[] = useMemo(
    () =>
      loadProducts()
        .filter(canBePart)
        .map((p) => ({ value: p.id, label: p.name, hint: CATEGORY_BY_ID[p.category]?.label })),
    [],
  );

  /** A new list, laid out again, the item's size following it. */
  const setRecipe = (next: CompositionLine[]) => {
    const laid = layoutRecipe(next, productById, uid);
    setDraft((d) => ({
      ...d,
      composition: laid.composition,
      dimensions: { ...d.dimensions, ...compositeShell(laid.widthMm, laid.depthMm).dimensions },
    }));
  };
  const setLine = (id: string, patch: Partial<CompositionLine>) => recipe && setRecipe(recipe.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = (productId: string) => {
    if (!recipe) return;
    const same = recipe.find((l) => l.productId === productId);
    setRecipe(same ? recipe.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l)) : [...recipe, { id: uid(), productId, quantity: 1 }]);
  };

  const empty = composition.tables.length + composition.placements.length === 0;
  const missingName = draft.name.trim() === "";
  const save = () => {
    setSubmitted(true);
    if (missingName || empty) return;
    onSave({ ...draft, id: draft.id || uid(), name: draft.name.trim() });
    onClose();
  };

  const counted = compositionCounts(composition);
  // A TABLE SET — "עיצוב שולחן" (lib/catalog/composition.ts): worn by a table already on the plan,
  // never placed on the floor; named as what it is.
  const tableSet = isTableSet(composition);
  const total = internal ? compositeTotal(composition) : null;
  const toggleTag = (t: string) => setDraft((d) => ({ ...d, styleTags: d.styleTags.includes(t) ? d.styleTags.filter((x) => x !== t) : [...d.styleTags, t] }));
  const addTag = () => {
    const t = newTag.trim();
    setNewTag("");
    if (t && !draft.styleTags.includes(t)) setDraft((d) => ({ ...d, styleTags: [...d.styleTags, t] }));
  };

  return (
    <Drawer title={tableSet ? (isEdit ? "עריכת עיצוב שולחן" : "עיצוב שולחן חדש") : isEdit ? "עריכת פריט מורכב" : "פריט מורכב חדש"} onClose={onClose}>
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
            id="c-name"
            label="שם הפריט"
            value={draft.name}
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
            placeholder="לדוגמה: שולחן אבירים מעוצב"
            error={submitted && missingName}
            errorMessage="יש להזין שם."
            autoFocus
          />

          {/* What it looks like placed — the same drawing the card and the rail show — and the way
              onto the canvas where it is put together by hand. A table design is worn by a table on a
              sketch, so it is changed there, not here. */}
          <div className="space-y-2">
            <div
              className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-canvas p-[6%]"
              style={{ backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)", backgroundSize: "10px 10px" }}
            >
              {empty ? (
                <p className="text-center text-sm text-muted">
                  {recipe ? "בחרו רכיבים מהקטלוג וסדרו אותם על הקנבס — או הוסיפו אותם לרשימה למטה, והם יסודרו כאן כמו שיונחו בסקיצה." : "אין בפריט רכיבים."}
                </p>
              ) : (
                <CompositionDrawing composition={composition} className="h-full w-full" />
              )}
            </div>
            {!tableSet && (
              <Button type="button" variant="outline" size="sm" onClick={() => setArranging(true)}>
                <Move className="h-3.5 w-3.5" strokeWidth={2} />
                {empty ? "בחירה וסידור על הקנבס" : "עריכת הסידור על הקנבס"}
              </Button>
            )}
          </div>


          <div>
            <span className={fieldLabelClassName}>ממה הוא עשוי</span>
            {recipe ? (
              <div className="space-y-2">
                {recipe.map((line) => {
                  const p = productById(line.productId);
                  const shades = p?.variants.filter((v) => !v.archived) ?? [];
                  return (
                    <div key={line.id} className="flex items-center gap-2 rounded-md border border-inset-border bg-inset px-2.5 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{p?.name ?? "פריט שהוסר מהקטלוג"}</span>
                      {shades.length > 1 && (
                        <Select
                          value={line.variantId ?? shades[0].id}
                          onChange={(variantId) => setLine(line.id, { variantId })}
                          options={shades.map((v) => ({ value: v.id, label: v.name }))}
                          aria-label={`הגוון של ${p?.name ?? "הרכיב"}`}
                          className="w-28"
                        />
                      )}
                      <NumberField
                        aria-label={`כמה ${p?.name ?? ""}`.trim()}
                        decimals={0}
                        min={1}
                        value={line.quantity}
                        onChange={(quantity) => setLine(line.id, { quantity: Math.max(1, quantity) })}
                        className="w-16"
                      />
                      <button
                        type="button"
                        onClick={() => setRecipe(recipe.filter((l) => l.id !== line.id))}
                        aria-label={`הסרת ${p?.name ?? "הרכיב"}`}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-alert-tint hover:text-alert"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
                <ComboField
                  value={query}
                  onChange={setQuery}
                  onPick={(o) => {
                    addLine(o.value);
                    setQuery("");
                  }}
                  options={options}
                  placeholder="+ הוספת רכיב מהקטלוג — שולחן, מפה, פמוט…"
                  aria-label="הוספת רכיב מהקטלוג"
                />
                <p className="text-[13px] leading-relaxed text-muted">
                  השולחנות נצמדים לשולחן אחד (עגולים — במרחק), מפה על כל שולחן, פריטי שולחן מתחלקים ביניהם, פריטי תקרה נתלים מעליהם, כיסאות הם הכיסאות סביבם, והשאר בשורה לפניהם. רוצים לסדר בעצמכם? ״עריכת הסידור על הקנבס״ — ומשם הסידור הוא הפריט. בסקיצה הכול נשאר שולחנות ופריטים רגילים.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <ul className="divide-y divide-inset-border rounded-md border border-inset-border bg-inset">
                  {counted.lines.map((l) => (
                    <li key={l.variantId} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span className="min-w-0 truncate text-ink">{resolve(l.variantId)?.label ?? "פריט שהוסר מהקטלוג"}</span>
                      <span className="nums shrink-0 text-ink-soft">×{l.quantity}</span>
                    </li>
                  ))}
                  {counted.seats > 0 && (
                    <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span className="text-ink">כיסאות סביב השולחנות</span>
                      <span className="nums shrink-0 text-ink-soft">×{counted.seats}</span>
                    </li>
                  )}
                </ul>
                <p className="text-[13px] leading-relaxed text-muted">
                  {tableSet
                    ? "עיצוב שולחן מלביש שולחן שכבר בסקיצה: גוררים אותו מהקטלוג אל שולחן, או בוחרים אותו ב״עיצובי שולחן״ שבסרגל השולחן. כדי לשנות אותו — מלבישים בו שולחן, משנים ושומרים שוב."
                    : "הסידור הוא הפריט, בדיוק כפי שהוא עומד. כדי לשנות אותו — ״עריכת הסידור על הקנבס״: מוסיפים פריטים מהקטלוג, מזיזים, מסובבים ומסדרים את מה שעל השולחנות."}
                </p>
              </div>
            )}
            {submitted && empty && <p className="mt-1 text-sm text-alert-ink">יש להוסיף לפחות רכיב אחד.</p>}
          </div>

          {total && !empty && (
            <div className="flex items-baseline justify-between rounded-md border border-inset-border bg-inset px-3 py-2">
              <span className="text-sm text-ink-soft">{total.partial ? "סכום הרכיבים (לחלקם אין מחיר ליחידה)" : "סכום הרכיבים"}</span>
              <span className="nums text-lg font-bold text-ink">{formatPrice(total.total)}</span>
            </div>
          )}

          <ImageField
            label="תמונה"
            hint="אם יש — צילום של הפריט המוכן. בלי תמונה הכרטיס מציג את הסידור."
            value={draft.imageUrl}
            onChange={(imageUrl) => setDraft((d) => ({ ...d, imageUrl }))}
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

          <TextField
            id="c-spec"
            label="הערות"
            value={draft.spec ?? ""}
            onChange={(spec) => setDraft((d) => ({ ...d, spec: spec || undefined }))}
            placeholder="לדוגמה: לשולחן הכלה, עד 14 איש"
          />
        </div>

        <footer className="flex items-center gap-2 border-t border-[#ebe8f5] bg-surface px-5 py-3.5">
          <Button type="submit">שמירה</Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          {isEdit && onDelete && (
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
      {/* Outside the form: an Enter in the editor's search box or a number field would otherwise
          submit — save and close — the drawer behind it. */}
      {arranging && (
        <CompositionEditor
          composition={composition}
          selfId={draft.id || undefined}
          internal={internal}
          onSave={({ composition: arranged, widthMm, depthMm }) =>
            setDraft((d) => ({ ...d, composition: arranged, dimensions: { ...d.dimensions, ...compositeShell(widthMm, depthMm).dimensions } }))
          }
          onClose={() => setArranging(false)}
        />
      )}
    </Drawer>
  );
}
