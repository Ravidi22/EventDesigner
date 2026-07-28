"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import type { Product } from "@/lib/catalog/types";
import { loadProducts } from "@/lib/catalog/storage";
import { loadImages, saveImage, loadPresentations, savePresentation, deletePresentation } from "@/lib/gallery/storage";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Select } from "@/components/select";
import { controlClassName } from "@/components/control";

// v0.3 studio gallery (F-2.1–F-2.2): create, order, and edit designer-curated presentations.
// This is management only — client-facing browsing, liking a photo, and the per-event "תיק
// האירוע" folder are meeting concerns and live in meeting-gallery.tsx instead.
export function GalleryScreen() {
  const router = useRouter();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [editing, setEditing] = useState<Presentation | null>(null);

  // localStorage is client-only — hydrate after mount.
  useEffect(() => {
    setImages(loadImages());
    setPresentations(loadPresentations());
  }, []);

  const imageById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);

  if (editing) {
    return (
      <PresentationBuilder
        draft={editing}
        images={images}
        onImageCreated={(img) => setImages(saveImage(img))}
        onSave={(p) => {
          setPresentations(savePresentation(p));
          setEditing(null);
        }}
        onDelete={(id) => {
          setPresentations(deletePresentation(id));
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-h2 text-ink">תצוגות</h1>
        <Button
          onClick={() =>
            setEditing({ id: crypto.randomUUID(), name: "", imageIds: [], createdAt: Date.now() })
          }
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          תצוגה חדשה
        </Button>
      </div>

      {presentations.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">אין עדיין תצוגות. צרו את הראשונה.</p>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {presentations.map((p) => (
            <PresentationCard
              key={p.id}
              presentation={p}
              imageById={imageById}
              manage
              onOpen={() => router.push(`/present?p=${p.id}`)}
              onEdit={() => setEditing(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PresentationCard({
  presentation: p,
  imageById,
  manage,
  onOpen,
  onEdit,
}: {
  presentation: Presentation;
  imageById: Map<string, GalleryImage>;
  manage: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const tiles = p.imageIds.map((id) => imageById.get(id)).filter((i): i is GalleryImage => !!i);
  const cover = tiles.slice(0, 3);
  return (
    <article className="group relative flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`פתיחת התצוגה "${p.name}" במצב הצגה`}
        className="flex aspect-[4/3] w-full gap-1 overflow-hidden rounded-lg border border-border p-1 transition duration-150 ease-fluid group-hover:shadow-floating focus-visible:shadow-floating"
      >
        {cover.length === 0 ? (
          <span className="flex flex-1 items-center justify-center text-sm text-muted">ריקה</span>
        ) : (
          cover.map((img, i) => (
            <span key={img.id + i} className="h-full flex-1 rounded-[6px]" style={{ background: img.tone }} />
          ))
        )}
      </button>

      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-ink">{p.name || "ללא שם"}</h3>
          <p className="nums mt-0.5 text-xs text-muted">{p.imageIds.length} תמונות</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label={`הצגת "${p.name}"`} onClick={onOpen}>
            <Play className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          {manage && (
            <IconButton label={`עריכת "${p.name}"`} onClick={onEdit}>
              <Pencil className="h-4 w-4" strokeWidth={2} />
            </IconButton>
          )}
        </div>
      </div>
    </article>
  );
}

// F-2.1–F-2.2 builder: name + ordered photos; each photo carries name, description and ONE
// product link. New photos are placeholder tiles for now — real upload arrives with the
// backend (the storage seam already persists whatever the image carries).
function PresentationBuilder({
  draft,
  images,
  onImageCreated,
  onSave,
  onDelete,
  onCancel,
}: {
  draft: Presentation;
  images: GalleryImage[];
  onImageCreated: (img: GalleryImage) => void;
  onSave: (p: Presentation) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [imageIds, setImageIds] = useState<string[]>(draft.imageIds);
  const [adding, setAdding] = useState(false);

  const imageById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);
  const available = images.filter((i) => !imageIds.includes(i.id));
  const isNew = !loadPresentations().some((p) => p.id === draft.id);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= imageIds.length) return;
    const next = [...imageIds];
    [next[i], next[j]] = [next[j], next[i]];
    setImageIds(next);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-h2 text-ink">{isNew ? "תצוגה חדשה" : "עריכת תצוגה"}</h2>
        <IconButton label="סגירה ללא שמירה" onClick={onCancel}>
          <X className="h-5 w-5" strokeWidth={2} />
        </IconButton>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">שם התצוגה</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${controlClassName} px-3`} placeholder="חופה קלאסית" />
      </label>

      <h3 className="mb-2 mt-8 text-sm font-semibold text-ink">
        תמונות <span className="nums font-normal text-muted">({imageIds.length})</span> — הסדר הוא סדר ההצגה
      </h3>
      <ul className="flex flex-col gap-1.5">
        {imageIds.map((id, i) => {
          const img = imageById.get(id);
          if (!img) return null;
          return (
            <li key={id} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
              <span className="h-9 w-9 shrink-0 rounded-md border border-border" style={{ background: img.tone }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{img.name}</span>
                <span className="block truncate text-xs text-muted">
                  {img.productName}
                  {img.description ? ` · ${img.description}` : ""}
                </span>
              </span>
              <div className="flex items-center gap-0.5">
                <IconButton label="הזזה למעלה" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-4 w-4" strokeWidth={2} />
                </IconButton>
                <IconButton label="הזזה למטה" onClick={() => move(i, 1)} disabled={i === imageIds.length - 1}>
                  <ArrowDown className="h-4 w-4" strokeWidth={2} />
                </IconButton>
                <IconButton label={`הסרת "${img.name}" מהתצוגה`} onClick={() => setImageIds(imageIds.filter((x) => x !== id))}>
                  <X className="h-4 w-4" strokeWidth={2} />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {available.length > 0 && (
          <Select
            value=""
            onChange={(v) => v && setImageIds([...imageIds, v])}
            aria-label="הוספת תמונה מהספרייה"
            options={[
              { value: "", label: "הוספה מספריית התמונות…" },
              ...available.map((i) => ({ value: i.id, label: `${i.name} — ${i.productName}` })),
            ]}
            className="max-w-64"
          />
        )}
        <Button variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          תמונה חדשה
        </Button>
      </div>

      {adding && (
        <NewImageForm
          onCancel={() => setAdding(false)}
          onCreate={(img) => {
            onImageCreated(img);
            setImageIds((ids) => [...ids, img.id]);
            setAdding(false);
          }}
        />
      )}

      <div className="mt-10 flex items-center justify-between border-t border-border pt-5">
        {!isNew ? (
          <Button variant="danger" onClick={() => onDelete(draft.id)}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            מחיקת התצוגה
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>ביטול</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => onSave({ ...draft, name: name.trim(), imageIds })}
          >
            שמירת התצוגה
          </Button>
        </div>
      </div>
    </div>
  );
}

// ponytail: "upload" is a placeholder tone tile until the backend exists — the form still
// captures the real metadata (name, description, one product link) that F-2.2 requires.
const TONES = ["oklch(0.86 0.045 20)", "oklch(0.88 0.03 90)", "oklch(0.84 0.05 145)", "oklch(0.85 0.035 280)", "oklch(0.88 0.025 250)", "oklch(0.83 0.05 170)"];

function NewImageForm({ onCreate, onCancel }: { onCreate: (img: GalleryImage) => void; onCancel: () => void }) {
  const [products] = useState<Product[]>(() => loadProducts().filter((p) => !p.archived));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");

  const create = () => {
    const product = products.find((p) => p.id === productId);
    if (!product || !name.trim()) return;
    onCreate({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim() || undefined,
      productId: product.id,
      productName: product.name,
      tone: TONES[Math.floor(Math.random() * TONES.length)],
    });
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h4 className="mb-3 text-sm font-semibold text-ink">תמונה חדשה</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">שם התמונה</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${controlClassName} px-3`} placeholder="שנדליר מעל החופה" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">מוצר מקושר</span>
          <Select
            value={productId}
            onChange={setProductId}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-ink">תיאור</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={`${controlClassName} px-3`} placeholder="חתונת נועה ואיתי, אולם לה־וידה" />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>ביטול</Button>
        <Button onClick={create} disabled={!name.trim()}>הוספה</Button>
      </div>
    </div>
  );
}
