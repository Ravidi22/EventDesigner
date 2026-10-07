"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import { activeEvent } from "@/lib/events/storage";
import { fetchFolder, toggleLike, fetchImages, fetchPresentations } from "@/lib/gallery/actions";
import { IconButton } from "@/components/icon-button";
import { Photo } from "@/components/photo";
import { PresentationSlide } from "@/components/presentation-slide";

// F-2.4 present mode: fullscreen flip through ONE presentation. `meeting` gates the client-only
// bits — like / "תיק האירוע" — so a studio preview of the same presentation stays a plain
// viewer with no event to save into. Client-safe: photo name + description only, no prices.
export function PresentScreen({ presentationId, meeting }: { presentationId: string | null; meeting: boolean }) {
  const router = useRouter();

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [index, setIndex] = useState(0);
  const [event, setEvent] = useState<{ id: string; clientName: string } | null>(null);
  const [folder, setFolder] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [all, loadedImages] = await Promise.all([fetchPresentations(), fetchImages()]);
      if (!live) return;
      const p = (presentationId && all.find((x) => x.id === presentationId)) || all[0] || null;
      setPresentation(p);
      setImages(loadedImages);
      // A studio preview has no event to save likes into, so it stops here.
      if (!meeting) {
        setReady(true);
        return;
      }
      try {
        const ev = await activeEvent();
        if (live && ev) {
          setEvent({ id: ev.id, clientName: ev.clientName });
          const liked = await fetchFolder(ev.id);
          if (live) setFolder(liked);
        }
      } catch {
        // Swallowed on purpose: a failed lookup still has to open the presentation. The client is
        // sitting in front of this screen; losing the like button is a nuisance, a blank one is not.
      }
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [presentationId, meeting]);

  const ordered = useMemo(() => {
    if (!presentation) return [];
    const byId = new Map(images.map((i) => [i.id, i]));
    return presentation.imageIds.map((id) => byId.get(id)).filter((i): i is GalleryImage => !!i);
  }, [presentation, images]);

  const total = ordered.length;
  const current = ordered[Math.min(index, Math.max(total - 1, 0))];
  const liked = !!(event && current && folder.includes(current.id));

  const go = useCallback((delta: number) => setIndex((i) => (total ? (i + delta + total) % total : 0)), [total]);
  const close = useCallback(() => router.back(), [router]);
  const like = useCallback(() => {
    if (!event || !current) return;
    const imageId = current.id;
    // Optimistic, and here it is not a nicety: the heart animates under a client's finger, and a
    // round trip's worth of nothing-happening in front of them reads as a broken screen.
    setFolder((prev) => (prev.includes(imageId) ? prev.filter((x) => x !== imageId) : [imageId, ...prev]));
    setPulse(true);
    void toggleLike(event.id, imageId)
      .then(setFolder)
      .catch(() => {
        // The server is the record of what the client actually chose — ask it again rather than
        // leave a heart lit over a like that never landed.
        void fetchFolder(event.id).then(setFolder).catch(() => {});
      });
  }, [event, current]);

  // Keyboard: RTL arrows (right = previous, left = next), Escape closes, Enter/L likes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
      else if (e.key === "Escape") close();
      else if (e.key === "Enter" || e.key === "l" || e.key === "L") like();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, close, like]);

  if (!ready) return null;

  if (!presentation || total === 0) {
    return (
      <div dir="rtl" className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-bg">
        <p className="text-sm text-muted">אין תצוגה להצגה.</p>
        <button type="button" onClick={close} className="text-sm font-medium text-accent hover:text-accent-hover">
          חזרה
        </button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 flex flex-col bg-bg">
      {/* Minimal top chrome — the client is watching. The name lives on the photo itself. */}
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        {meeting && event ? (
          <span className="text-sm text-muted">
            תיק האירוע <span className="nums">{folder.length}</span>
          </span>
        ) : (
          <span />
        )}
        <IconButton label="סגירת מצב הצגה" onClick={close} size="md">
          <X className="h-5 w-5" strokeWidth={2} />
        </IconButton>
      </header>

      {/* Stage — the photo runs 80–90% of the viewport width, arrows flank it. */}
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 sm:gap-6 sm:px-6">
        <NavArrow label="הקודם" onClick={() => go(-1)}>
          <ChevronRight className="h-6 w-6" strokeWidth={1.75} />
        </NavArrow>

        <PresentationSlide
          key={current.id}
          image={current}
          index={index}
          total={total}
          className="w-[min(88vw,135vh)] shrink"
          action={
            /* Like — pinned to the opposite corner, a small pop confirms the toggle. Meeting-only. */
            meeting ? (
              <button
                type="button"
                onClick={like}
                disabled={!event}
                aria-pressed={liked}
                aria-label={liked ? `הסרת "${current.name}" מתיק האירוע` : `שמירת "${current.name}" לתיק האירוע`}
                title={liked ? "הסרה מתיק האירוע" : "שמירה לתיק האירוע"}
                onAnimationEnd={() => setPulse(false)}
                className="absolute inset-inline-end-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-canvas/85 transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Heart
                  className={(pulse ? "animate-like-pop " : "") + "h-5 w-5 " + (liked ? "text-accent" : "text-muted")}
                  strokeWidth={2}
                  fill={liked ? "currentColor" : "none"}
                />
              </button>
            ) : undefined
          }
        />

        <NavArrow label="הבא" onClick={() => go(1)}>
          <ChevronLeft className="h-6 w-6" strokeWidth={1.75} />
        </NavArrow>
      </div>

      {/* Thumbnail strip — the presentation's manual order */}
      <div className="shrink-0 overflow-x-auto px-6 py-4">
        <div className="mx-auto flex w-max gap-2">
          {ordered.map((img, i) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setIndex(i)}
              aria-label={`מעבר אל ${img.name}`}
              aria-current={i === index ? "true" : undefined}
              className={
                "relative h-14 w-11 shrink-0 overflow-hidden rounded-md border transition-[outline,border] " +
                (i === index ? "border-accent outline outline-2 outline-accent" : "border-border opacity-70 hover:opacity-100")
              }
            >
              <Photo image={img} className="h-full w-full object-cover" />
              {event && folder.includes(img.id) && (
                <Heart
                  className="absolute -end-1 -top-1 h-3.5 w-3.5 text-accent"
                  strokeWidth={2}
                  fill="currentColor"
                  aria-hidden
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NavArrow({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
    >
      {children}
    </button>
  );
}
