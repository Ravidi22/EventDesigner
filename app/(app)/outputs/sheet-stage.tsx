"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { ClientChip, FloatStrip, StripDivider, StripIcon } from "@/components/doc-shell";

// THE LIGHT TABLE of /outputs (the "Outputs and 3D Drawers" board, 2026-11-11): the sheets at their
// true trim size on the lavender plane, scaled to fit the column between the two drawers, with the
// strip floating over them — which page is at the top of the view, the zoom, "תצוגת לקוח".
//
// The zoom is a TRANSFORM on the column of pages, never CSS `zoom` and never a re-render at another
// size: the pages stay laid out in real millimetres, so the quote paginates (it divides its
// measurements back by the scale — quote-document.tsx), the PDF photographs the page boxes at their
// own size, and print drops the transform (the <style> below). A sizer outside the transform holds
// the scaled box, so the column scrolls as far as the pages reach.

const TOP_PX = 64; // clears the strip
const SIDE_PX = 24;
const STEP = 0.1;
const MIN = 0.25;
const MAX = 2;

export function SheetStage({
  pageSelector,
  client,
  onClient,
  contentRef,
  resetKey,
  children,
}: {
  /** What counts as a page in the column (`article.sheet`, `[data-quote-page]`). */
  pageSelector: string;
  client: boolean;
  onClient: (on: boolean) => void;
  /** The column of pages — the PDF builders query it. */
  contentRef?: RefObject<HTMLDivElement | null>;
  /** Changing it (another document) goes back to fit and to the first page. */
  resetKey: string;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const ownInner = useRef<HTMLDivElement>(null);
  const inner = contentRef ?? ownInner;
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [avail, setAvail] = useState(0);
  const [manual, setManual] = useState<number | null>(null);
  const [page, setPage] = useState({ at: 0, of: 0 });
  const [keyFrom, setKeyFrom] = useState(resetKey);
  if (keyFrom !== resetKey) {
    setKeyFrom(resetKey);
    setManual(null);
  }

  // The pages' own size, in layout px (a transform does not change offset sizes), and the room the
  // column has — both watched, so a drawer put away refits the sheets.
  useLayoutEffect(() => {
    const el = inner.current;
    const sc = scroller.current;
    if (!el || !sc) return;
    const read = () => {
      setNatural((p) => (p.w === el.offsetWidth && p.h === el.offsetHeight ? p : { w: el.offsetWidth, h: el.offsetHeight }));
      setAvail(sc.clientWidth);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [inner]);

  const fit = natural.w > 0 && avail > 0 ? Math.min(1, Math.floor(((avail - SIDE_PX * 2) / natural.w) * 100) / 100) : 1;
  const zoom = Math.max(MIN, manual ?? fit);

  // Which page is at the top of the view: the last one whose top has passed a third of the way down
  // — read on scroll (once a frame), and again when the pages, the zoom or the document change.
  useEffect(() => {
    const sc = scroller.current;
    const col = inner.current;
    if (!sc || !col) return;
    const read = () => {
      const list = col.querySelectorAll<HTMLElement>(pageSelector);
      const line = sc.getBoundingClientRect().top + sc.clientHeight / 3;
      let at = 0;
      list.forEach((p, i) => {
        if (p.getBoundingClientRect().top <= line) at = i;
      });
      setPage((prev) => (prev.at === at && prev.of === list.length ? prev : { at, of: list.length }));
    };
    let raf = requestAnimationFrame(read);
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener("scroll", onScroll);
    };
  }, [inner, pageSelector, natural, zoom, resetKey]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  const go = (i: number) => {
    const sc = scroller.current;
    const p = inner.current?.querySelectorAll<HTMLElement>(pageSelector)[i];
    if (!sc || !p) return;
    sc.scrollTo({ top: p.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - TOP_PX + 8, behavior: "smooth" });
  };
  const step = (by: number) => setManual(Math.min(MAX, Math.max(MIN, Math.round((zoom + by) * 100) / 100)));

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg print:block">
      <style>{`@media print { .sheet-sizer { width: auto !important; height: auto !important; padding: 0 !important; } .sheet-column { position: static !important; transform: none !important; width: auto !important; } }`}</style>
      <FloatStrip>
        <StripIcon icon={ChevronRight} label="העמוד הקודם" onClick={() => go(page.at - 1)} disabled={page.at <= 0} />
        <span className="nums whitespace-nowrap px-0.5 text-[13px] font-semibold text-ink-soft">
          עמוד <span dir="ltr">{page.of ? `${page.at + 1} / ${page.of}` : "–"}</span>
        </span>
        <StripIcon icon={ChevronLeft} label="העמוד הבא" onClick={() => go(page.at + 1)} disabled={page.at >= page.of - 1} />
        <StripDivider />
        <StripIcon icon={Minus} label="הקטנה" onClick={() => step(-STEP)} disabled={zoom <= MIN} />
        <button
          type="button"
          onClick={() => setManual(null)}
          title="התאמה לרוחב"
          dir="ltr"
          className="nums min-w-10 rounded-pill text-center text-[13px] font-semibold text-ink-soft transition-colors hover:text-accent"
        >
          {Math.round(zoom * 100)}%
        </button>
        <StripIcon icon={Plus} label="הגדלה" onClick={() => step(STEP)} disabled={zoom >= MAX} />
        <StripDivider />
        <ClientChip on={client} onChange={onClient} />
      </FloatStrip>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto print:overflow-visible">
        <div
          className="sheet-sizer relative"
          style={{ width: `max(100%, ${Math.ceil(natural.w * zoom) + SIDE_PX * 2}px)`, height: Math.ceil(natural.h * zoom) + TOP_PX + 32 }}
        >
          <div
            ref={inner}
            className="sheet-column absolute flex flex-col items-center gap-5 print:block"
            style={{ top: TOP_PX, left: "50%", width: "max-content", transform: `translateX(-50%) scale(${zoom})`, transformOrigin: "top center" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
