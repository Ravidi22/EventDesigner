"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GalleryVerticalEnd, Pencil, Play, Plus } from "lucide-react";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import type { PresentationTemplate } from "@/lib/gallery/templates";
// Reads live in page.tsx now; what is left here are the writes, which return the fresh list.
import { saveImagesBatch, savePresentation, deletePresentation } from "@/lib/gallery/actions";
import { Button } from "@/components/button";
import { Photo } from "@/components/photo";
import { EmptyState } from "@/components/empty-state";
<<<<<<< Updated upstream
import { PAGE_GUTTER } from "@/components/page-gutter";
import { fileProblem, uploadFile } from "@/lib/files/upload";
import { ALLOWED_TYPES } from "@/lib/files/keys";
=======
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PresentationBuilder, type DraftSlide } from "./presentation-builder";
import { TemplatePicker } from "./template-picker";
>>>>>>> Stashed changes

// v0.3 studio gallery (F-2.1–F-2.2): create, order, and edit designer-curated presentations.
// This is management only — client-facing browsing, liking a photo, and the per-event "תיק
// האירוע" folder are meeting concerns and live in meeting-gallery.tsx instead.
export function GalleryScreen({
  initialImages,
  initialPresentations,
}: {
  initialImages: GalleryImage[];
  initialPresentations: Presentation[];
}) {
  const router = useRouter();
  const [images, setImages] = useState<GalleryImage[]>(initialImages);
  const [presentations, setPresentations] = useState<Presentation[]>(initialPresentations);
  const [editing, setEditing] = useState<Presentation | null>(null);
  // The named, photo-less slots a template seeded the builder with — merged into the gallery on
  // save (saveImagesBatch), discarded on cancel.
  const [editingDrafts, setEditingDrafts] = useState<Record<string, DraftSlide>>({});
  // "מצגת חדשה" opens the template chooser first; picking one (or "ריקה") opens the builder.
  const [choosing, setChoosing] = useState(false);
  // The builder asks to delete; the screen owns the confirm (design system: one dialog per surface).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Which presentations exist on the server, so the builder can tell a new one from an edit without
  // asking again mid-render (it used to call loadPresentations() during its own render — free
  // against localStorage, a round trip now).
  const [knownIds, setKnownIds] = useState<Set<string>>(
    () => new Set(initialPresentations.map((p) => p.id)),
  );

  // Both lists arrive from page.tsx's server-side read, so there is no "not loaded yet" window left
  // to distinguish: `ready` was here because "no presentations" and "not fetched yet" are the same
  // empty array and mean opposite things, and a designer with twenty presentations was told the
  // gallery was empty for the length of one round trip. That round trip no longer happens on this
  // screen, so the empty state below is now always the true one.
  const ready = true;

  // Newer lists on a later navigation replace what this component was holding — adjusted during
  // render rather than in an effect, which is React's own pattern for state derived from a prop.
  const [seed, setSeed] = useState({ initialImages, initialPresentations });
  if (seed.initialImages !== initialImages || seed.initialPresentations !== initialPresentations) {
    setSeed({ initialImages, initialPresentations });
    setImages(initialImages);
    setPresentations(initialPresentations);
    setKnownIds(new Set(initialPresentations.map((p) => p.id)));
  }

  const imageById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);

  const closeBuilder = () => {
    setEditing(null);
    setEditingDrafts({});
  };

  const startFromTemplate = (t: PresentationTemplate) => {
    const slots = t.slides.map((slideName) => ({ id: crypto.randomUUID(), name: slideName }));
    setEditingDrafts(
      Object.fromEntries(slots.map((s) => [s.id, { name: s.name, description: "", productId: "" }])),
    );
    setEditing({
      id: crypto.randomUUID(),
      name: t.name,
      imageIds: slots.map((s) => s.id),
      createdAt: Date.now(),
    });
    setChoosing(false);
  };

  const startBlank = () => {
    setEditingDrafts({});
    setEditing({ id: crypto.randomUUID(), name: "", imageIds: [], createdAt: Date.now() });
    setChoosing(false);
  };

  const confirmDelete = async () => {
    const id = pendingDelete;
    setPendingDelete(null);
    if (!id) return;
    const next = await deletePresentation(id);
    setPresentations(next);
    setKnownIds(new Set(next.map((x) => x.id)));
    closeBuilder();
  };

  if (editing) {
    return (
      <>
        <PresentationBuilder
          key={editing.id}
          draft={editing}
          images={images}
          initialDrafts={editingDrafts}
          isNew={!knownIds.has(editing.id)}
          onSave={async (p, drafts) => {
            // Persist every draft slot as a (possibly photo-less) library row FIRST —
            // savePresentation rejects an image id it cannot find, so the batch lands before it.
            const draftItems: GalleryImage[] = p.imageIds
              .filter((id) => drafts[id])
              .map((id) => ({
                id,
                name: drafts[id].name.trim(),
                description: drafts[id].description.trim() || undefined,
                productId: drafts[id].productId || "",
                productName: "",
                imageUrl: drafts[id].imageUrl,
              }));
            if (draftItems.length) setImages(await saveImagesBatch(draftItems));

            const next = await savePresentation(p);
            setPresentations(next);
            setKnownIds(new Set(next.map((x) => x.id)));
            closeBuilder();
          }}
          onDelete={(id) => setPendingDelete(id)}
          onCancel={closeBuilder}
        />
        <ConfirmDialog
          open={!!pendingDelete}
          title={`למחוק את המצגת "${editing.name || "ללא שם"}"?`}
          body="הסדר של השקופיות יימחק. התמונות עצמן נשארות בספרייה."
          confirmLabel="מחיקת המצגת"
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      </>
    );
  }

  if (choosing) {
    return (
      <TemplatePicker
        onPick={startFromTemplate}
        onBlank={startBlank}
        onCancel={() => setChoosing(false)}
      />
    );
  }

  return (
    <div className={PAGE_GUTTER}>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-h2 text-ink">מצגות</h1>
        {/* Hidden on first run: the empty state carries the one action, and two "new presentation"
            buttons on an otherwise blank screen is one too many. */}
        {(!ready || presentations.length > 0) && (
          <Button onClick={() => setChoosing(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            הוספת מצגת חדשה
          </Button>
        )}
      </div>

      {!ready ? (
        <p className="py-20 text-center text-sm text-muted" aria-busy="true">
          טוען את המצגות…
        </p>
      ) : presentations.length === 0 ? (
        <EmptyState
          icon={GalleryVerticalEnd}
          title="אין עדיין מצגות"
          body="מצגת היא רצף שקופיות שעוברים עליו מול הלקוח בפגישה — חופה, שולחן אירוח, מרכזי שולחן. כל שקופית נושאת מוצר מהקטלוג, כך שמה שהלקוח מסמן ♥ נאסף לתיק האירוע ומחכה לכם בסטודיו."
          action={
            <Button onClick={() => setChoosing(true)}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              צור מצגת ראשונה
            </Button>
          }
        />
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
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all duration-150 ease-fluid hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-floating">
      {/* Cover — a background for the card, at slide proportions. Play + edit ride on top of it. */}
      <div className="relative aspect-video w-full overflow-hidden bg-inset">
        <div className="flex h-full w-full">
          {cover.length === 0 ? (
            <span className="flex flex-1 items-center justify-center text-xs text-muted">ריקה</span>
          ) : (
            cover.map((img, i) => (
              <Photo key={img.id + i} image={img} className="h-full flex-1 object-cover" />
            ))
          )}
        </div>

        {/* A full-cover target so clicking the image opens the show; the buttons above win. */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`פתיחת המצגת "${p.name}" במצב הצגה`}
          className="absolute inset-0"
        />

        {/* The controls — over a scrim, revealed on hover / keyboard focus. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 bg-ink/0 opacity-0 transition-all duration-150 group-hover:bg-ink/30 group-hover:opacity-100 group-focus-within:bg-ink/30 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`הצגת המצגת "${p.name}"`}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-accent shadow-floating transition-transform hover:scale-105 focus-visible:scale-105"
          >
            <Play className="h-5 w-5" strokeWidth={2} fill="currentColor" />
          </button>
          {manage && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`עריכת המצגת "${p.name}"`}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-canvas/90 text-ink-soft shadow-floating transition-transform hover:scale-105 focus-visible:scale-105"
            >
              <Pencil className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0 p-3">
        <h3 className="truncate text-sm font-semibold text-ink">{p.name || "ללא שם"}</h3>
        <p className="nums mt-0.5 text-xs text-muted">{p.imageIds.length} שקופיות</p>
      </div>
    </article>
  );
}
<<<<<<< Updated upstream

// F-2.1–F-2.2 builder: name + ordered photos; each photo carries name, description, ONE product
// link and — since file storage landed (lib/files/) — an actual photograph. A photo-less row is
// still a real state and renders as its `tone` tile, because a designer adding a series should not
// have to find the file before they can name the thing.
function PresentationBuilder({
  draft,
  images,
  isNew,
  onImageCreated,
  onSave,
  onDelete,
  onCancel,
}: {
  draft: Presentation;
  images: GalleryImage[];
  isNew: boolean;
  onImageCreated: (img: GalleryImage) => void | Promise<void>;
  onSave: (p: Presentation) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [imageIds, setImageIds] = useState<string[]>(draft.imageIds);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const imageById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);
  const available = images.filter((i) => !imageIds.includes(i.id));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= imageIds.length) return;
    const next = [...imageIds];
    [next[i], next[j]] = [next[j], next[i]];
    setImageIds(next);
  };

  return (
    <div className={`mx-auto max-w-3xl ${PAGE_GUTTER}`}>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-h2 text-ink">{isNew ? "תצוגה חדשה" : "עריכת תצוגה"}</h2>
        <IconButton label="סגירה ללא שמירה" onClick={onCancel}>
          <X className="h-5 w-5" strokeWidth={2} />
        </IconButton>
      </div>

      <TextField label="שם התצוגה" value={name} onChange={setName} placeholder="חופה קלאסית" />

      <h3 className="mb-2 mt-8 text-sm font-semibold text-ink">
        תמונות <span className="nums font-normal text-muted">({imageIds.length})</span> — הסדר הוא סדר ההצגה
      </h3>
      <ul className="flex flex-col gap-1.5">
        {imageIds.map((id, i) => {
          const img = imageById.get(id);
          if (!img) return null;
          return (
            <li key={id} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
              <Photo image={img} className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
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
          onCreate={async (img) => {
            // Awaited: the photo has to EXIST before this presentation claims to contain it, or
            // saving the presentation would be rejected for naming an image nobody has.
            await onImageCreated(img);
            setImageIds((ids) => [...ids, img.id]);
            setAdding(false);
          }}
        />
      )}

      <div className="mt-10 flex items-center justify-between border-t border-border pt-5">
        {!isNew ? (
          <Button variant="danger" onClick={() => void onDelete(draft.id)}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            מחיקת התצוגה
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>ביטול</Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({ ...draft, name: name.trim(), imageIds });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "שומר…" : "שמירת התצוגה"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ponytail: "upload" is a placeholder tone tile until the backend exists — the form still
// captures the real metadata (name, description, one product link) that F-2.2 requires.
/** What the file picker offers. Built from the same allowlist the server enforces, so the two
 *  can never drift into a dialog that offers a type the upload will refuse. */
const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");

const TONES = ["oklch(0.86 0.045 20)", "oklch(0.88 0.03 90)", "oklch(0.84 0.05 145)", "oklch(0.85 0.035 280)", "oklch(0.88 0.025 250)", "oklch(0.83 0.05 170)"];

function NewImageForm({
  onCreate,
  onCancel,
}: {
  onCreate: (img: GalleryImage) => void | Promise<void>;
  onCancel: () => void;
}) {
  // Its own fetch: this form is opened on demand, long after the gallery screen mounted, and it is
  // the only thing here that needs the catalog.
  const { products: all } = useCatalog();
  const products = useMemo(() => all.filter((p) => !p.archived), [all]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  // A local object URL, so the designer sees the photograph they picked before it goes anywhere.
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  // Revoke on unmount or replacement: an object URL pins its blob in memory until it is released,
  // and a designer adding twenty photographs in one sitting would pin all twenty.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (chosen: File | null) => {
    setError(null);
    if (!chosen) {
      setFile(null);
      return;
    }
    // Checked before anything is sent, so a wrong file is refused instantly rather than after an
    // upload. The server checks the same things again — a browser check is never the control.
    const problem = fileProblem(chosen);
    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setFile(chosen);
  };

  const create = async () => {
    const product = products.find((p) => p.id === productId);
    if (!product || !name.trim() || uploading) return;
    setError(null);
    setUploading(true);
    try {
      // The photograph goes to storage FIRST, so the row is never written pointing at a file that
      // failed to upload. A photo-less row is a real state (the tile stands in for it); a row whose
      // photograph is a broken link is not.
      const uploaded = file ? await uploadFile(file, "gallery") : null;
      await onCreate({
        id: crypto.randomUUID(),
        name: name.trim(),
        description: description.trim() || undefined,
        productId: product.id,
        // Sent for the local render; the server answers with the name JOINED from the catalog, so
        // this copy never becomes the stale caption it used to be after a product was renamed.
        productName: product.name,
        imageUrl: uploaded?.url,
        // Still minted, still used: it is the tile shown wherever there is no photograph, and it is
        // what a photo-less row renders as.
        tone: TONES[Math.floor(Math.random() * TONES.length)],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h4 className="mb-3 text-sm font-semibold text-ink">תמונה חדשה</h4>

      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => filePicker.current?.click()}
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-inset text-muted transition-colors hover:border-accent hover:text-accent"
          aria-label={file ? `החלפת התמונה (${file.name})` : "בחירת קובץ תמונה"}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, never optimised
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6" strokeWidth={1.6} />
          )}
        </button>
        <div className="min-w-0 text-[13px] leading-relaxed">
          {file ? (
            <>
              <p className="truncate font-medium text-ink">{file.name}</p>
              <button
                type="button"
                onClick={() => pick(null)}
                className="mt-0.5 text-muted transition-colors hover:text-ink"
              >
                הסרת התמונה
              </button>
            </>
          ) : (
            <p className="text-muted">
              אפשר להוסיף תמונה — JPG, PNG, WebP או AVIF, עד 25MB. גם בלי תמונה התצוגה עובדת.
            </p>
          )}
        </div>
        <input
          ref={filePicker}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            // Cleared so picking the SAME file again still fires a change event.
            e.target.value = "";
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="שם התמונה" value={name} onChange={setName} placeholder="שנדליר מעל החופה" />
        <div>
          <span className={fieldLabelClassName}>מוצר מקושר</span>
          <Select
            value={productId}
            onChange={setProductId}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            className="w-full"
          />
        </div>
        <TextField
          label="תיאור"
          value={description}
          onChange={setDescription}
          placeholder="חתונת נועה ואיתי, אולם לה־וידה"
          wrapperClassName="sm:col-span-2"
        />
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        {error && <p className="me-auto text-[13px] font-medium text-alert">{error}</p>}
        <Button variant="ghost" onClick={onCancel} disabled={uploading}>ביטול</Button>
        <Button onClick={create} disabled={!name.trim() || uploading}>
          {uploading ? "מעלה…" : "הוספה"}
        </Button>
      </div>
    </div>
  );
}
=======
>>>>>>> Stashed changes
