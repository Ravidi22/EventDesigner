"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import { activeEvent } from "@/lib/events/storage";
import { loadFolder, toggleLike, loadImages, loadPresentations } from "@/lib/gallery/storage";
import { IconButton } from "@/components/icon-button";

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
    const all = loadPresentations();
    const p = (presentationId && all.find((x) => x.id === presentationId)) || all[0] || null;
    setPresentation(p);
    setImages(loadImages());
    if (meeting) {
      const ev = activeEvent();
      if (ev) {
        setEvent({ id: ev.id, clientName: ev.clientName });
        setFolder(loadFolder(ev.id));
      }
    }
    setReady(true);
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
    if (event && current) {
      setFolder(toggleLike(event.id, current.id));
      setPulse(true);
    }
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

        <figure
          key={current.id}
          className="present-in relative aspect-[16/9] w-[min(88vw,135vh)] shrink overflow-hidden rounded-xl border border-border shadow-dialog"
        >
          <div className="absolute inset-0" style={{ background: current.tone }} />

          {/* Name + description overlay the photo's lower edge, over an ink scrim for legibility. */}
          <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent px-5 pb-4 pt-14">
            <p className="nums text-xs tracking-wide text-canvas/70">
              {index + 1} מתוך {total}
            </p>
            <h2 className="mt-0.5 font-display text-2xl text-canvas sm:text-3xl">{current.name}</h2>
            {current.description && <p className="mt-0.5 text-sm text-canvas/80">{current.description}</p>}
          </figcaption>

          {/* Like — pinned to the opposite corner, a small pop confirms the toggle. Meeting-only. */}
          {meeting && (
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
          )}
        </figure>

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
                "relative h-14 w-11 shrink-0 rounded-md border transition-[outline,border] " +
                (i === index ? "border-accent outline outline-2 outline-accent" : "border-border opacity-70 hover:opacity-100")
              }
              style={{ background: img.tone }}
            >
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
