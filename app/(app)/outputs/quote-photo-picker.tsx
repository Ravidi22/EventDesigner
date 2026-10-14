"use client";

import { useState } from "react";
import { MAX_SECTION_PHOTOS } from "@/lib/quotes/layout";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/button";
import type { QuotePhoto } from "./quote-document";

// The photographs one section of the quote shows — the body of the "תמונות" popover in the page
// margin (./quote-document.tsx).
//
// Offered in the order a designer reaches for them: photos of what is IN this section (the
// products placed there), then the event's own folder (what the client liked in the meeting), then
// the whole gallery, searchable. Up to MAX_SECTION_PHOTOS, in the order picked. "ברירת מחדל" hands the
// choice back to the derivation, so a section the designer never touched keeps following the drawing.

export function QuotePhotoPicker({
  chosen,
  isDefault,
  related,
  liked,
  all,
  onChange,
}: {
  /** What the section shows now (the default pick, or the designer's). */
  chosen: QuotePhoto[];
  isDefault: boolean;
  related: QuotePhoto[];
  liked: QuotePhoto[];
  all: QuotePhoto[];
  /** undefined = back to the default pick. */
  onChange: (ids: string[] | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const ids = chosen.map((c) => c.id);
  const toggle = (id: string) => {
    if (ids.includes(id)) onChange(ids.filter((x) => x !== id));
    else if (ids.length < MAX_SECTION_PHOTOS) onChange([...ids, id]);
  };
  const shown = new Set([...related, ...liked].map((p) => p.id));
  const q = query.trim().toLocaleLowerCase();
  const rest = all.filter((p) => !shown.has(p.id) && (!q || p.name.toLocaleLowerCase().includes(q)));

  const grid = (photos: QuotePhoto[]) => (
    <div className="grid grid-cols-4 gap-1.5">
      {photos.map((p) => {
        const at = ids.indexOf(p.id);
        const full = at < 0 && ids.length >= MAX_SECTION_PHOTOS;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            disabled={full}
            aria-pressed={at >= 0}
            title={p.name}
            className={
              "relative aspect-square overflow-hidden rounded-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
              (at >= 0 ? "border-accent ring-2 ring-accent" : "border-border hover:border-accent-line")
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx */}
            <img src={p.src} alt={p.name} loading="lazy" className="h-full w-full bg-inset object-cover" />
            {at >= 0 && (
              <span className="nums absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-canvas">
                {at + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        עד {MAX_SECTION_PHOTOS} תמונות, לפי סדר הבחירה.
        {isDefault && " כרגע מוצגת בחירה אוטומטית מהפריטים שבאזור."}
      </p>
      {related.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-soft">מהפריטים באזור</p>
          {grid(related)}
        </div>
      )}
      {liked.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-soft">תיק האירוע</p>
          {grid(liked)}
        </div>
      )}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink-soft">כל הגלריה</p>
        <SearchInput value={query} onChange={setQuery} placeholder="חיפוש לפי שם" aria-label="חיפוש תמונה" className="mb-2" />
        <div className="max-h-56 overflow-y-auto">{rest.length ? grid(rest) : <p className="text-[13px] text-muted">לא נמצאו תמונות.</p>}</div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={() => onChange([])} disabled={ids.length === 0}>
          ללא תמונות
        </Button>
        <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={() => onChange(undefined)} disabled={isDefault}>
          בחירה אוטומטית
        </Button>
      </div>
    </div>
  );
}
