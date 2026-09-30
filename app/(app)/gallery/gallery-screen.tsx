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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PresentationBuilder, type DraftSlide } from "./presentation-builder";
import { TemplatePicker } from "./template-picker";

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
    <div className="px-8 py-7">
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
