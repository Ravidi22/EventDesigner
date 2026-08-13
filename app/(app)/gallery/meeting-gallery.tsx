"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import { activeEvent } from "@/lib/events/storage";
import { fetchFolder, toggleLike, fetchImages, fetchPresentations } from "@/lib/gallery/actions";
import { PresentationCard } from "./gallery-screen";
import { Photo } from "@/components/photo";

type View = "presentations" | "folder";

// F-2.3–F-2.4 meeting-mode gallery: the client-facing counterpart to the studio gallery
// (gallery-screen.tsx). The designer flips through presentations with the client, likes land
// in "תיק האירוע" (the per-event folder) — no create/edit here, that stays in the studio.
//
// One pass, opening on the presentations: the meeting used to run the gallery twice, once for
// inspiration before the hall layout arrived and once to choose after it, and the second visit only
// ever needed the folder tab this one already has.
export function MeetingGalleryScreen() {
  const router = useRouter();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [folder, setFolder] = useState<string[]>([]);
  const [view, setView] = useState<View>("presentations");

  // Hydrate after mount. All of it is a server read now — which is the point for the folder: the
  // client is liking photos on a tablet while the designer draws on a laptop, and a like that lands
  // in one browser's storage is a like the other device never sees.
  useEffect(() => {
    let live = true;
    void (async () => {
      const [loadedImages, loadedPresentations] = await Promise.all([
        fetchImages(),
        fetchPresentations(),
      ]);
      if (!live) return;
      setImages(loadedImages);
      setPresentations(loadedPresentations);
    })();
    void activeEvent().then(async (ev) => {
      if (!live) return;
      setEventId(ev?.id ?? null);
      setClientName(ev?.clientName ?? "");
      if (!ev) return;
      const liked = await fetchFolder(ev.id);
      if (live) setFolder(liked);
    });
    return () => {
      live = false;
    };
  }, []);

  const imageById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <div className="mb-7 inline-flex rounded-md border border-border p-0.5 text-sm">
        <SegBtn active={view === "presentations"} onClick={() => setView("presentations")}>
          תצוגות
        </SegBtn>
        <SegBtn active={view === "folder"} onClick={() => setView("folder")}>
          תיק האירוע
          <span className="nums ms-1.5 text-xs text-muted">{folder.length}</span>
        </SegBtn>
      </div>

      {view === "presentations" ? (
        presentations.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">אין עדיין תצוגות.</p>
        ) : (
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {presentations.map((p) => (
              <PresentationCard
                key={p.id}
                presentation={p}
                imageById={imageById}
                manage={false}
                onOpen={() => router.push(`/present?p=${p.id}&meeting=1`)}
                onEdit={() => {}}
              />
            ))}
          </div>
        )
      ) : (
        <FolderView
          folder={folder}
          imageById={imageById}
          clientName={clientName}
          onUnlike={(imageId) => {
            if (!eventId) return;
            // Optimistic: the heart clears under the finger, and the server answer replaces the
            // list a moment later. A like is one row either way, so the two cannot drift far.
            setFolder((prev) => prev.filter((x) => x !== imageId));
            void toggleLike(eventId, imageId)
              .then(setFolder)
              .catch(() => {
                // Put it back rather than lie about what the client chose.
                void fetchFolder(eventId).then(setFolder);
              });
          }}
        />
      )}
    </div>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center rounded-[6px] px-3 py-1.5 font-medium transition-colors " +
        (active ? "bg-accent-tint text-ink" : "text-ink-soft hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

function FolderView({
  folder,
  imageById,
  clientName,
  onUnlike,
}: {
  folder: string[];
  imageById: Map<string, GalleryImage>;
  clientName: string;
  onUnlike: (imageId: string) => void;
}) {
  const items = folder.map((id) => imageById.get(id)).filter((i): i is GalleryImage => !!i);
  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
        <Heart className="mb-4 h-8 w-8 text-muted" strokeWidth={1.5} />
        <h2 className="font-display text-h2 text-ink">תיק האירוע עדיין ריק</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          עברו עם {clientName || "הלקוח"} על התצוגות וסמנו ♥ את מה שאהב — התמונות ייאספו לכאן, והמוצרים
          המקושרים יחכו לכם בראש מסילת הסטודיו.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
      {items.map((img) => (
        <article key={img.id} className="group flex flex-col">
          <div className="relative">
            <Photo image={img} className="aspect-[4/5] w-full rounded-lg border border-border object-cover" />
            <button
              type="button"
              onClick={() => onUnlike(img.id)}
              aria-label={`הסרת "${img.name}" מתיק האירוע`}
              title="הסרה מהתיק"
              className="absolute inset-inline-start-2.5 top-2.5 rounded-full bg-canvas/85 p-2 transition-colors hover:bg-canvas"
            >
              <Heart className="h-4 w-4 text-accent" strokeWidth={2} fill="currentColor" />
            </button>
          </div>
          <h3 className="mt-2 truncate text-sm font-medium text-ink">{img.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted">{img.productName}</p>
        </article>
      ))}
    </div>
  );
}
