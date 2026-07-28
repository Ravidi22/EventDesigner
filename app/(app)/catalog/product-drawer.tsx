"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Product, Variant, MapAppearance } from "@/lib/catalog/types";
import { resolveFootprint } from "@/lib/studio/footprint";
import { CATEGORIES, CATEGORY_BY_ID, LAYERS } from "@/lib/catalog/categories";
import { STYLE_TAGS } from "@/lib/catalog/sample-data";
import { isPlacedAnywhere } from "@/lib/catalog/storage";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { TagToggle } from "@/components/tag-toggle";
import { controlClassName } from "@/components/control";
import { AppearancePreview } from "./appearance-preview";
import { ShapeEditorModal } from "./shape-editor-modal";
import { IconPicker } from "./icon-picker";

const uid = () => crypto.randomUUID();

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
  };
}

const mmToCm = (mm?: number) => (mm == null || mm === 0 ? "" : String(mm / 10));
const cmToMm = (v: string) => (v === "" ? undefined : Math.round(parseFloat(v) * 10));

const fieldLabel = "mb-1 block text-xs font-medium text-ink-soft";
const fieldInput = `${controlClassName} w-full px-2.5 placeholder:text-muted`;

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

  useEffect(() => {
    if (product) {
      setDraft(product);
      setSubmitted(false);
      setPickingIcon(false);
      setShapeModalOpen(false);
    }
  }, [product]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (product && !d.open) d.showModal();
    if (!product && d.open) d.close();
  }, [product]);

  if (!product) return null;

  const category = CATEGORY_BY_ID[draft.category];
  const isEdit = draft.id !== "";
  const nameError = submitted && draft.name.trim() === "";
  const heightError = submitted && !draft.dimensions.heightMm;

  const patch = (p: Partial<Product>) => setDraft((d) => ({ ...d, ...p }));
  const setDim = (key: keyof Product["dimensions"], v: string) =>
    setDraft((d) => ({ ...d, dimensions: { ...d.dimensions, [key]: cmToMm(v) ?? 0 } }));
  const setField = (key: string, v: string | number) =>
    setDraft((d) => ({ ...d, categoryFields: { ...d.categoryFields, [key]: v } }));

  const changeCategory = (id: string) =>
    setDraft((d) => ({ ...d, category: id, layer: CATEGORY_BY_ID[id].defaultLayer, categoryFields: {} }));

  const toggleTag = (t: string) =>
    setDraft((d) => ({
      ...d,
      styleTags: d.styleTags.includes(t) ? d.styleTags.filter((x) => x !== t) : [...d.styleTags, t],
    }));

  // Current shape/content, falling back to what the resolver would derive when appearance is unset.
  const currentShape = draft.appearance?.shape ?? resolveFootprint(draft).kind;
  const currentContent = draft.appearance?.content ?? "name";

  // Patch appearance, always keeping the required fields present.
  const setAppearance = (patch: Partial<MapAppearance>) =>
    setDraft((d) => ({
      ...d,
      appearance: { shape: "rect", content: "name", ...d.appearance, ...patch },
    }));

  const setVariant = (id: string, p: Partial<Variant>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...p } : v)) }));
  const addVariant = () => setDraft((d) => ({ ...d, variants: [...d.variants, { id: uid(), name: "" }] }));
  // F-4.5: a variant that's placed in any event is archived (kept resolvable), not deleted.
  const removeVariant = (id: string) =>
    setDraft((d) =>
      isPlacedAnywhere([id])
        ? { ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, archived: true } : v)) }
        : { ...d, variants: d.variants.filter((v) => v.id !== id) },
    );

  const save = () => {
    setSubmitted(true);
    if (draft.name.trim() === "" || !draft.dimensions.heightMm) return;
    if (draft.appearance?.shape === "custom" && (draft.appearance.outline?.length ?? 0) < 3) {
      setSubmitted(true);
      return;
    }
    const variants = draft.variants
      .map((v) => ({ ...v, id: v.id || uid(), name: v.name.trim() }))
      .filter((v) => v.name !== "" || v.archived);
    onSave({ ...draft, id: draft.id || uid(), name: draft.name.trim(), variants });
    onClose();
  };

  const showDiameter = category.dims === "round" || category.dims === "both";
  const showBox = category.dims === "box" || category.dims === "both";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="drawer fixed inset-y-0 inset-inline-end-0 m-0 h-dvh w-full max-w-md bg-bg text-ink shadow-dialog"
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
          <h2 className="text-base font-semibold">{isEdit ? "עריכת מוצר" : "מוצר חדש"}</h2>
          <IconButton label="סגור" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2} />
          </IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <label htmlFor="p-name" className={fieldLabel}>
              שם המוצר
            </label>
            <input
              id="p-name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="לדוגמה: מפת שולחן קטיפה"
              className={fieldInput + (nameError ? " border-warn hover:border-warn" : "")}
              autoFocus
            />
            {nameError && <p className="mt-1 text-xs text-warn">יש להזין שם מוצר.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="p-cat" className={fieldLabel}>
                קטגוריה
              </label>
              <select id="p-cat" value={draft.category} onChange={(e) => changeCategory(e.target.value)} className={fieldInput}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-layer" className={fieldLabel}>
                שכבה
              </label>
              <select
                id="p-layer"
                value={draft.layer}
                onChange={(e) => patch({ layer: e.target.value as Product["layer"] })}
                className={fieldInput}
              >
                {LAYERS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset>
            <legend className={fieldLabel}>מידות (ס״מ)</legend>
            <div className="grid grid-cols-3 gap-3">
              {showDiameter && (
                <DimInput label="קוטר" value={mmToCm(draft.dimensions.diameterMm)} onChange={(v) => setDim("diameterMm", v)} />
              )}
              {showBox && (
                <>
                  <DimInput label="רוחב" value={mmToCm(draft.dimensions.widthMm)} onChange={(v) => setDim("widthMm", v)} />
                  <DimInput label="עומק" value={mmToCm(draft.dimensions.depthMm)} onChange={(v) => setDim("depthMm", v)} />
                </>
              )}
              <DimInput
                label="גובה"
                required
                error={heightError}
                value={mmToCm(draft.dimensions.heightMm)}
                onChange={(v) => setDim("heightMm", v)}
              />
            </div>
            {heightError && <p className="mt-1 text-xs text-warn">גובה נדרש (לטובת ההדמיה התלת־ממדית).</p>}
          </fieldset>

          {/* F-4.3: only count-multiplier fields are structured (arms, seats) */}
          {category.fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {category.fields.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`f-${f.key}`} className={fieldLabel}>
                    {f.label}
                    {f.suffix && <span className="text-muted"> (מכפיל {f.suffix})</span>}
                  </label>
                  <input
                    id={`f-${f.key}`}
                    type="number"
                    min={0}
                    value={String(draft.categoryFields[f.key] ?? "")}
                    onChange={(e) => setField(f.key, Number(e.target.value))}
                    className={fieldInput + " nums"}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="p-spec" className={fieldLabel}>
              מפרט חופשי
            </label>
            <textarea
              id="p-spec"
              rows={2}
              value={draft.spec ?? ""}
              onChange={(e) => patch({ spec: e.target.value || undefined })}
              placeholder="כל מאפיין אחר: חומר, צבע, מודולים…"
              className={fieldInput + " h-auto resize-y py-2"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="p-price" className={fieldLabel}>
                מחיר ליחידה (₪)
              </label>
              <input
                id="p-price"
                type="number"
                min={0}
                value={draft.unitPrice ?? ""}
                onChange={(e) => patch({ unitPrice: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="0"
                className={fieldInput + " nums"}
              />
            </div>
            <div>
              <label htmlFor="p-img" className={fieldLabel}>
                קישור תמונה
              </label>
              <input
                id="p-img"
                value={draft.imageUrl ?? ""}
                onChange={(e) => patch({ imageUrl: e.target.value || undefined })}
                placeholder="https://…"
                dir="ltr"
                className={fieldInput + " text-start"}
              />
            </div>
          </div>

          <div>
            <span className={fieldLabel}>מראה על התוכנית</span>
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
                <div>
                  <span className="mb-1 block text-xs text-muted">צורה</span>
                  <div className="flex flex-wrap gap-1 rounded-md border border-border p-0.5">
                    {([["rect", "מלבן"], ["circle", "עיגול"], ["ellipse", "אליפסה"], ["custom", "מותאם"]] as const).map(([s, label]) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          if (s === "custom") { setAppearance({ shape: "custom", outline: draft.appearance?.outline ?? [] }); setShapeModalOpen(true); }
                          else setAppearance({ shape: s });
                        }}
                        className={"rounded px-2 py-1 text-xs transition-colors " + (currentShape === s ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1 block text-xs text-muted">תוכן</span>
                  <div className="flex flex-wrap gap-1 rounded-md border border-border p-0.5">
                    {([["icon", "אייקון"], ["name", "שם"], ["none", "ריק"]] as const).map(([c, label]) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setAppearance({ content: c }); setPickingIcon(c === "icon"); }}
                        className={"rounded px-2 py-1 text-xs transition-colors " + (currentContent === c ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {currentShape === "custom" && (
              <button
                type="button"
                onClick={() => setShapeModalOpen(true)}
                className="mt-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                {(draft.appearance?.outline?.length ?? 0) >= 3 ? "עריכת הצורה" : "עריכת הצורה…"}
              </button>
            )}
            {submitted && draft.appearance?.shape === "custom" && (draft.appearance.outline?.length ?? 0) < 3 && (
              <p className="mt-1 text-xs text-warn">יש לסמן צורה סגורה (לפחות 3 נקודות).</p>
            )}

            <ShapeEditorModal
              open={shapeModalOpen}
              outline={draft.appearance?.outline ?? []}
              edgeCurves={draft.appearance?.edgeCurves}
              onSave={(outline, edgeCurves) => setAppearance({ shape: "custom", outline, edgeCurves })}
              onClose={() => setShapeModalOpen(false)}
            />

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
            <span className={fieldLabel}>תגיות סטייל</span>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_TAGS.map((t) => (
                <TagToggle key={t} active={draft.styleTags.includes(t)} onClick={() => toggleTag(t)}>
                  {t}
                </TagToggle>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={fieldLabel + " mb-0"}>וריאנטים (גוונים / גרסאות)</span>
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
                אין וריאנטים. הוסף גוונים כדי שרשימת הציוד תפריד ביניהם.
              </p>
            ) : (
              <div className="space-y-2">
                {draft.variants.filter((v) => !v.archived).map((v) => (
                  <div key={v.id} className="flex items-center gap-2">
                    <input
                      value={v.name}
                      onChange={(e) => setVariant(v.id, { name: e.target.value })}
                      placeholder="שם הגוון (זהב…)"
                      className={fieldInput + " flex-1"}
                    />
                    <input
                      type="number"
                      min={0}
                      value={v.unitPrice ?? ""}
                      onChange={(e) => setVariant(v.id, { unitPrice: e.target.value === "" ? undefined : Number(e.target.value) })}
                      placeholder="מחיר"
                      className={fieldInput + " nums w-24"}
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(v.id)}
                      aria-label="הסר וריאנט"
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-warn-tint hover:text-warn"
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

function DimInput({
  label,
  value,
  onChange,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">
        {label}
        {required && <span className="text-warn"> *</span>}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInput + " nums" + (error ? " border-warn hover:border-warn" : "")}
      />
    </label>
  );
}
