"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import type { Product } from "@/lib/catalog/types";
import type { CategoryGroupId } from "@/lib/catalog/categories";
import { CATEGORY_BY_ID, CATEGORY_GROUPS } from "@/lib/catalog/categories";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { uploadFile } from "@/lib/files/upload";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { fieldLabelClassName } from "@/components/control";
import { Photo } from "@/components/photo";
import { ImageDropzone } from "@/components/image-dropzone";
import { Switch } from "@/components/toggle";
import { PresentationSlide } from "@/components/presentation-slide";

/** A slide the builder is holding that has no gallery row yet — a template slot, a product the
 *  designer added from the catalog, an upload, or a free product. Becomes a real (possibly
 *  photo-less) GalleryImage on save. */
export interface DraftSlide {
  /** The caption shown on the slide. For a free product this is the product's name; for a catalog
   *  product it defaults to the product name and can be overridden. */
  name: string;
  description: string;
  /** A catalog product id, or "" for a free product. */
  productId: string;
  /** A slide-specific photograph, uploaded here. Absent means the slide shows its linked product's
   *  photo instead, when it has one — see SlotPhoto. */
  imageUrl?: string;
  /** When this slot uploaded a photo AND its product has none, also write the photo onto the
   *  product on save. Absent counts as true; only an explicit uncheck turns it off. */
  syncProductImage?: boolean;
}

// F-2.1–F-2.2 presentation editor, laid out like Canva:
//   • gradient header — the presentation NAME is edited inline here, plus the glass save action
//   • right rail  — how to add (upload / catalog), then the selected slide's fields, then delete
//   • main canvas — the active slide, whole and large, through the same <PresentationSlide> /present uses
//   • bottom strip — draggable thumbnails at slide proportions, and a prominent "+"
//
// Slides come in two kinds and the list holds a plain id array over both: an id that resolves in
// `images` is a saved gallery photo; anything else is a key into `drafts`. Drafts are written to
// the gallery only on save (saveImagesBatch), so cancelling a template leaves nothing behind.
export function PresentationBuilder({
  draft,
  images,
  isNew,
  initialDrafts,
  onSave,
  onDelete,
  onCancel,
}: {
  draft: Presentation;
  images: GalleryImage[];
  isNew: boolean;
  /** Seeds `drafts` — the named, photo-less slots a template produced. */
  initialDrafts?: Record<string, DraftSlide>;
  onSave: (p: Presentation, drafts: Record<string, DraftSlide>) => void | Promise<void>;
  /** Ask the screen to delete this presentation — it owns the confirm dialog. */
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const { products: allProducts, save: saveProduct } = useCatalog();
  const products = useMemo(() => allProducts.filter((p) => !p.archived), [allProducts]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  const [name, setName] = useState(draft.name);
  const [entries, setEntries] = useState<string[]>(draft.imageIds);
  const [drafts, setDrafts] = useState<Record<string, DraftSlide>>(initialDrafts ?? {});
  const [selected, setSelected] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const imageById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);

  const draftAsImage = (id: string, d: DraftSlide): GalleryImage => {
    const product = d.productId ? productById.get(d.productId) : undefined;
    return {
      id,
      name: d.name,
      description: d.description || undefined,
      productId: d.productId,
      productName: product?.name ?? "",
      productImageUrl: product?.imageUrl,
      imageUrl: d.imageUrl,
    };
  };
  const slideOf = (id: string): GalleryImage | null =>
    imageById.get(id) ?? (drafts[id] ? draftAsImage(id, drafts[id]) : null);

  const total = entries.length;
  const safeIndex = total ? Math.min(selected, total - 1) : 0;
  const slides = entries.map(slideOf).filter((s): s is GalleryImage => !!s);
  const selectedId = total ? entries[safeIndex] : null;
  const selectedDraft = selectedId ? drafts[selectedId] : undefined;
  const current = selectedId ? slideOf(selectedId) : null;

  // Every catalog product this presentation already shows — for the "✓ selected" marks in the picker.
  const usedProductIds = useMemo(
    () => new Set(entries.map((id) => slideOf(id)?.productId).filter((x): x is string => !!x)),
    // slideOf closes over drafts + imageById; entries covers the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, drafts, imageById, productById],
  );

  const emptyNames = entries.filter((id) => drafts[id] !== undefined && !drafts[id].name.trim()).length;
  const noPhoto = slides.filter((s) => !s.imageUrl && !s.productImageUrl).length;
  const readiness =
    emptyNames > 0
      ? `⚠ ${emptyNames} שקופיות בלי שם`
      : total > 0
        ? `${total} שקופיות` + (noPhoto > 0 ? ` · ${noPhoto} בלי תמונה` : "")
        : "";

  const updateDraft = (id: string, patch: Partial<DraftSlide>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  // Paste (Ctrl+V) an image anywhere that is not a text field → it lands on the selected slide.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || !selectedId || !drafts[selectedId]) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (!file) return;
          e.preventDefault();
          const id = selectedId;
          void uploadFile(file, "gallery")
            .then((r) => setDrafts((d) => (d[id] ? { ...d, [id]: { ...d[id], imageUrl: r.url } } : d)))
            .catch(() => {});
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedId, drafts]);

  const nudge = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    next.splice(j, 0, next.splice(i, 1)[0]);
    setEntries(next);
    setSelected(j);
  };

  // Live reorder as a card is dragged over another — the "sortable" feel, no library.
  const reorderTo = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = entries.indexOf(dragId);
    const to = entries.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...entries];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setEntries(next);
    setSelected(to);
  };

  const remove = (id: string) => {
    setEntries((e) => e.filter((x) => x !== id));
    setDrafts((d) => {
      if (!d[id]) return d;
      const next = { ...d };
      delete next[id];
      return next;
    });
  };

  const addSlide = (slide: DraftSlide) => {
    const id = crypto.randomUUID();
    setDrafts((d) => ({ ...d, [id]: slide }));
    setEntries((e) => [...e, id]);
    setSelected(entries.length);
  };

  const addBlankSlide = () =>
    addSlide({ name: `שקופית ${entries.length + 1}`, description: "", productId: "" });

  const addSlideForProduct = (p: Product) =>
    addSlide({ name: p.name, description: "", productId: p.id });

  // Picking a product from the catalog applies it to the SLIDE THE DESIGNER IS ON — it does not
  // append a slide. A new slide only when there is none to apply it to.
  const applyProductToSlide = (p: Product) => {
    if (selectedId && selectedDraft) {
      updateDraft(selectedId, {
        productId: p.id,
        name: selectedDraft.name.trim() || p.name,
      });
    } else {
      addSlideForProduct(p);
    }
  };

  const selectSlideForProduct = (pid: string) => {
    const i = entries.findIndex((id) => slideOf(id)?.productId === pid);
    if (i >= 0) setSelected(i);
  };

  const canSave = name.trim().length > 0 && emptyNames === 0 && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      // A slot that uploaded a photo for a product that had none also becomes that product's photo —
      // one upload, both places. Skipped when unchecked, when the product already has a photo, or
      // when the slot has no photo of its own.
      for (const id of entries) {
        const d = drafts[id];
        if (!d?.imageUrl || !d.productId || d.syncProductImage === false) continue;
        const product = productById.get(d.productId);
        if (product && !product.imageUrl) {
          await saveProduct({ ...product, imageUrl: d.imageUrl });
        }
      }
      await onSave({ ...draft, name: name.trim(), imageIds: entries }, drafts);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full p-3">
      {/* A floating card on the plane — rounded-xl, a soft lift, its own surface. */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-surface shadow-floating">
        {/* Header — the design system's PALE lavender gradient (`.grad-soft`, the soft-button fill:
            #efeafb → #e7e0f7). A whisper of the accent, not a saturated bar. A soft violet-cast
            shadow lifts it off the white body. Dark ink on it, since it is nearly white. */}
        <div className="grad-soft relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3 shadow-[0_8px_20px_-10px_rgb(75_58_140_/_0.25)]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isNew ? "מצגת חדשה" : "שם המצגת"}
            aria-label="שם המצגת"
            className="min-w-0 max-w-[46ch] flex-1 rounded-lg bg-transparent px-2.5 py-1.5 text-lg font-semibold text-ink outline-none transition-colors placeholder:text-muted hover:bg-white/60 focus:bg-canvas focus-visible:ring-1 focus-visible:ring-accent-line"
          />

          <div className="flex shrink-0 items-center gap-2">
            {readiness && (
              <span className="me-1 hidden text-xs text-muted lg:inline">{readiness}</span>
            )}
            {/* PowerPoint's "start the show" — up here, not an expand icon on the canvas. */}
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              disabled={total === 0}
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-white/60 hover:text-accent disabled:opacity-40"
            >
              <Play className="h-4 w-4 text-accent" strokeWidth={2} fill="currentColor" />
              הצגה
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-pill px-3.5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-white/60 disabled:opacity-50"
            >
              ביטול
            </button>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              {saving ? "שומר…" : "שמירת המצגת"}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* RIGHT rail (flow-start in RTL) — how to add, then the selected slide. */}
          <aside className="flex w-[368px] shrink-0 flex-col gap-5 overflow-y-auto border-e border-border bg-surface p-5">
            {/* A presentation is built from the product catalog — that is the one add path. */}
            <CatalogList
              products={products}
              used={usedProductIds}
              onAdd={applyProductToSlide}
              onSelect={selectSlideForProduct}
            />

            {current && selectedId && (
              <div>
                {selectedDraft ? (
                  <SlotInspector
                    key={selectedId}
                    draft={selectedDraft}
                    product={selectedDraft.productId ? productById.get(selectedDraft.productId) : undefined}
                    products={products}
                    onChange={(patch) => updateDraft(selectedId, patch)}
                  />
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-inset p-3">
                    <Photo
                      image={current}
                      className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{current.name}</p>
                      <p className="truncate text-xs text-muted">
                        {current.productName || "בלי מוצר"} · תמונה מהספרייה
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isNew && (
              <button
                type="button"
                onClick={() => onDelete(draft.id)}
                className="mt-auto flex items-center gap-1.5 self-start pt-2 text-xs font-medium text-muted transition-colors hover:text-alert"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                מחיקת המצגת
              </button>
            )}
          </aside>

          {/* MAIN — the canvas, with the filmstrip beneath it. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col bg-bg">
              {current ? (
                <>
                  {/* The slide takes as much of the canvas as it can while staying WHOLE — bounded
                      by the area's height (`h-full`) and width (`max-w-full`). Tight padding so it
                      reads big; the filmstrip below is kept small to leave it the room. */}
                  {/* Arrows flank the slide — right = previous, left = next (RTL). */}
                  <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-3 py-3 sm:gap-4">
                    <NavArrow
                      label="הקודם"
                      onClick={() => setSelected(Math.max(0, safeIndex - 1))}
                      disabled={safeIndex === 0}
                    >
                      <ChevronRight className="h-6 w-6" strokeWidth={1.75} />
                    </NavArrow>
                    <div className="flex h-full min-w-0 flex-1 items-center justify-center">
                      <PresentationSlide
                        key={current.id}
                        image={current}
                        index={safeIndex}
                        total={total}
                        showIndex={false}
                        className="h-full max-w-full"
                      />
                    </div>
                    <NavArrow
                      label="הבא"
                      onClick={() => setSelected(Math.min(total - 1, safeIndex + 1))}
                      disabled={safeIndex >= total - 1}
                    >
                      <ChevronLeft className="h-6 w-6" strokeWidth={1.75} />
                    </NavArrow>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6">
                  <p className="max-w-xs text-center text-sm text-muted">
                    בחרו מוצרים מהקטלוג מימין — כאן תראו בדיוק איך המצגת תיראה ללקוח.
                  </p>
                </div>
              )}
            </div>

            {/* Filmstrip — the slide sequence at slide proportions (16:9), kept compact so the
                canvas above it stays large. Drag to reorder. */}
            <div className="shrink-0 border-t border-border bg-surface px-3 pb-1.5 pt-1.5">
              <p className="mb-1 text-[11px] font-medium text-muted">
                שקופיות <span className="nums">({total})</span>
                {total > 1 ? " — גררו לשינוי הסדר" : ""}
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {entries.map((id, i) => {
                  const slide = slideOf(id);
                  if (!slide) return null;
                  return (
                    <FilmstripCard
                      key={id}
                      slide={slide}
                      index={i}
                      total={total}
                      selected={i === safeIndex}
                      dragging={dragId === id}
                      onSelect={() => setSelected(i)}
                      onRemove={() => remove(id)}
                      onDragStart={() => {
                        setDragId(id);
                        setSelected(i);
                      }}
                      onDragEnter={() => reorderTo(id)}
                      onDragEnd={() => setDragId(null)}
                      onNudge={(dir) => nudge(i, dir)}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={addBlankSlide}
                  aria-label="הוספת שקופית"
                  className="flex aspect-video w-[104px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-border text-muted transition-colors hover:border-accent hover:bg-accent-tint hover:text-accent"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  <span className="text-[10px] font-semibold">שקופית</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {fullscreen && current && (
        <FullscreenPreview
          slides={slides}
          index={Math.min(safeIndex, slides.length - 1)}
          onIndex={setSelected}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}

// The catalog list — filter by department (chuppahs, seating…) and by name; the products already
// in this presentation are ticked. Click an unticked one to put it on the current slide; click a
// ticked one to jump to its slide.
function CatalogList({
  products,
  used,
  onAdd,
  onSelect,
}: {
  products: Product[];
  used: Set<string>;
  onAdd: (p: Product) => void;
  onSelect: (pid: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CategoryGroupId | "all">("all");

  const groupsPresent = useMemo(() => {
    const s = new Set<CategoryGroupId>();
    for (const p of products) {
      const g = CATEGORY_BY_ID[p.category]?.group;
      if (g) s.add(g);
    }
    return CATEGORY_GROUPS.filter((cg) => s.has(cg.id));
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (group !== "all" && CATEGORY_BY_ID[p.category]?.group !== group) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, group]);

  return (
    <div>
      <span className={fieldLabelClassName}>מוצרים מהקטלוג</span>

      {products.length > 6 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש מוצר…"
          className="mb-1.5 h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
        />
      )}

      {groupsPresent.length > 1 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          <GroupChip active={group === "all"} onClick={() => setGroup("all")}>
            הכל
          </GroupChip>
          {groupsPresent.map((cg) => (
            <GroupChip key={cg.id} active={group === cg.id} onClick={() => setGroup(cg.id)}>
              {cg.label}
            </GroupChip>
          ))}
        </div>
      )}

      <ul className="max-h-[38vh] space-y-0.5 overflow-y-auto rounded-xl border border-border bg-inset p-1.5">
        {filtered.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-muted">אין מוצרים תואמים</li>
        )}
        {filtered.map((p) => {
          const isUsed = used.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => (isUsed ? onSelect(p.id) : onAdd(p))}
                className={
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm transition-colors " +
                  (isUsed
                    ? "bg-accent-tint font-medium text-accent"
                    : "text-ink-soft hover:bg-surface")
                }
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
                  <img src={p.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-md bg-inset-border" />
                )}
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {isUsed && <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors " +
        (active ? "bg-accent-tint font-semibold text-accent" : "text-muted hover:text-accent")
      }
    >
      {children}
    </button>
  );
}

// The big circular arrows that flank the slide (right = previous in RTL), matching /present.
function NavArrow({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      {children}
    </button>
  );
}

// One slide in the filmstrip, at slide proportions (aspect-video). Draggable (native HTML5 DnD —
// the studio is a desktop tool and this keeps a library out); Ctrl/⌘ + ←/→ moves it (RTL: ← is
// toward the end).
function FilmstripCard({
  slide,
  index,
  total,
  selected,
  dragging,
  onSelect,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onNudge,
}: {
  slide: GalleryImage;
  index: number;
  total: number;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onNudge: (dir: -1 | 1) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDrop={(e) => e.preventDefault()}
      className={
        "group relative aspect-video w-[104px] shrink-0 cursor-grab overflow-hidden rounded-md border-2 bg-inset transition-all duration-150 ease-fluid active:cursor-grabbing " +
        (dragging ? "opacity-40 " : "hover:-translate-y-0.5 hover:shadow-floating ") +
        (selected ? "border-accent shadow-floating" : "border-transparent hover:border-accent/40")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onNudge(1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onNudge(-1);
          }
        }}
        aria-label={`שקופית ${index + 1} מתוך ${total}: ${slide.name || "בלי שם"}`}
        aria-current={selected ? "true" : undefined}
        className="absolute inset-0"
      >
        <Photo image={slide} className="h-full w-full" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-1 bg-gradient-to-t from-ink/80 to-transparent px-1.5 pb-0.5 pt-4">
          <span className="nums text-[10px] font-semibold text-canvas/90">{index + 1}</span>
          <span className="truncate text-[10px] text-canvas/85">{slide.name || "בלי שם"}</span>
        </span>
      </button>

      <GripVertical
        className="pointer-events-none absolute inset-inline-start-0.5 top-1/2 h-4 w-4 -translate-y-1/2 text-canvas/70 opacity-0 transition-opacity group-hover:opacity-100"
        strokeWidth={2}
        aria-hidden
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`הסרת "${slide.name}" מהמצגת`}
        className="absolute inset-inline-end-1 top-1 rounded-full bg-canvas/85 p-1 text-muted opacity-0 transition-opacity hover:text-alert focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// The selected slide's fields. Mounted with key={slotId}, so the local override state in SlotPhoto
// resets when the designer moves to another slide.
function SlotInspector({
  draft,
  product,
  products,
  onChange,
}: {
  draft: DraftSlide;
  product?: Product;
  products: Product[];
  onChange: (patch: Partial<DraftSlide>) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-inset p-3">
      {product ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-pill bg-accent-tint px-2.5 py-1 text-[11px] font-semibold text-accent">
          <Check className="h-3 w-3" strokeWidth={3} />
          מקושר לקטלוג
        </span>
      ) : (
        <span className="inline-flex w-fit items-center rounded-pill bg-inset-border px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
          מוצר חופשי
        </span>
      )}

      <SlotPhoto draft={draft} product={product} onChange={onChange} />

      <TextField
        label={product ? "כותרת לשקופית" : "שם המוצר"}
        value={draft.name}
        onChange={(v) => onChange({ name: v })}
        placeholder={product ? product.name : "שם המוצר"}
      />
      <TextField
        label="תיאור"
        value={draft.description}
        onChange={(v) => onChange({ description: v })}
        placeholder="חתונת נועה ואיתי"
      />
      <div>
        <span className={fieldLabelClassName}>מוצר מקושר</span>
        <Select
          value={draft.productId}
          onChange={(v) => onChange({ productId: v })}
          options={[
            { value: "", label: "ללא — מוצר חופשי" },
            ...products.map((p) => ({ value: p.id, label: p.name })),
          ]}
          className="w-full"
        />
      </div>
    </div>
  );
}

// The slide's photograph, adapted to the designer's two scenarios:
//
//   A. a CATALOG product that already has a photo → show it, no dropzone. One tap opens a
//      slide-specific override.
//   B. a FREE product, or a catalog product with no photo → a dashed dropzone (drag / click /
//      paste). When there is a product, the same upload also becomes the product's photo.
function SlotPhoto({
  draft,
  product,
  onChange,
}: {
  draft: DraftSlide;
  product?: Product;
  onChange: (patch: Partial<DraftSlide>) => void;
}) {
  const productImage = product?.imageUrl;
  const [override, setOverride] = useState(false);

  if (productImage && !draft.imageUrl && !override) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-canvas p-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx */}
        <img
          src={productImage}
          alt=""
          className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">התמונה מגיעה מהמוצר</p>
          <p className="truncate text-xs text-muted">«{product.name}» — אין צורך להעלות שוב</p>
          <button
            type="button"
            onClick={() => setOverride(true)}
            className="mt-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            החלפת תמונה לשקופית זו בלבד
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ImageDropzone
        label="תמונת השקופית"
        value={draft.imageUrl}
        onChange={(url) => onChange({ imageUrl: url })}
        kind="gallery"
      />

      {!draft.imageUrl && <HqImageTip />}

      {productImage && (
        <button
          type="button"
          onClick={() => {
            onChange({ imageUrl: undefined });
            setOverride(false);
          }}
          className="self-start text-xs font-medium text-accent transition-colors hover:text-accent-hover"
        >
          חזרה לתמונת המוצר «{product.name}»
        </button>
      )}

      {product && !productImage && draft.imageUrl && (
        <div className="flex items-start gap-2.5">
          <Switch
            className="mt-0.5"
            checked={draft.syncProductImage ?? true}
            onChange={(next) => onChange({ syncProductImage: next })}
            label={`עדכון תמונת המוצר «${product.name}»`}
          />
          <span className="text-xs leading-tight text-ink-soft">
            עדכנו גם את תמונת המוצר «{product.name}» — כך אין צורך להעלות שוב בקטלוג
          </span>
        </div>
      )}
    </div>
  );
}

// A one-time nudge, the first time someone reaches for the uploader: the presentation is what a
// client sees on a big screen, so the source files should be good. Dismissed = a flag on this
// device (lib/studio/storage.ts territory — per-device UI, not studio data).
const HQ_TIP_KEY = "eve.hq-image-tip";

function HqImageTip() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(HQ_TIP_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-accent-line bg-accent-tint/60 p-2.5 text-[11px] leading-relaxed text-ink-soft">
      <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
      <p className="flex-1">
        כדאי להעלות תמונות באיכות גבוהה — המצגת מוצגת ללקוח על מסך גדול. אפשר לבקש מצלמי האירוע את
        הקבצים המקוריים.
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(HQ_TIP_KEY, "1");
          } catch {
            // a device that refuses storage just sees the tip again next time — harmless
          }
          setDismissed(true);
        }}
        aria-label="הבנתי"
        className="shrink-0 text-muted transition-colors hover:text-ink"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// A stripped /present, inside the builder — the designer walks the whole thing before there is
// anything saved to open the real /present against. Takes the browser to true fullscreen so the
// slide is on THE WHOLE SCREEN, OS chrome and all.
function FullscreenPreview({
  slides,
  index,
  onIndex,
  onClose,
}: {
  slides: GalleryImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const last = slides.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndex(Math.min(last, index + 1));
      else if (e.key === "ArrowRight") onIndex(Math.max(0, index - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, onIndex, onClose]);

  // Enter real fullscreen on open, leave on close. If the viewer drops out of fullscreen by any
  // other route (F11, the browser's own control), close the overlay too so the two never disagree.
  useEffect(() => {
    document.documentElement.requestFullscreen().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const current = slides[index];
  if (!current) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <span className="text-sm text-muted">תצוגה מקדימה</span>
        <IconButton label="יציאה מהתצוגה" onClick={onClose} size="md">
          <X className="h-5 w-5" strokeWidth={2} />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 sm:gap-6 sm:px-6">
        <IconButton
          label="הקודם"
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          size="md"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={1.75} />
        </IconButton>
        <PresentationSlide
          key={current.id}
          image={current}
          index={index}
          total={slides.length}
          showIndex={false}
          className="w-[min(92vw,150vh)] shrink"
        />
        <IconButton
          label="הבא"
          onClick={() => onIndex(Math.min(last, index + 1))}
          disabled={index >= last}
          size="md"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
