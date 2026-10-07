"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/button";
import { PRESENTATION_TEMPLATES, type PresentationTemplate } from "@/lib/gallery/templates";

// The first screen of "מצגת חדשה" (F-2.1): pick a skeleton to start from. Each card shows the
// named, ordered slots the builder will open with — the designer only attaches a photo to each.
// A skeleton is a starting point, not a lock: every slot can be renamed, reordered or removed
// afterwards, and "מצגת ריקה" skips it entirely.
export function TemplatePicker({
  onPick,
  onBlank,
  onCancel,
}: {
  onPick: (template: PresentationTemplate) => void;
  onBlank: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-8 py-7">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-h2 text-ink">מצגת חדשה</h1>
        <Button variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
      </div>
      <p className="mb-7 max-w-xl text-sm text-muted">
        בחרו שלד להתחיל ממנו — שקופיות מסומנות בשם ובסדר, ואתם רק מוסיפים תמונה לכל אחת. אפשר לשנות
        הכול אחר כך.
      </p>

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
      >
        {PRESENTATION_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t)}
            className="group flex flex-col rounded-xl border border-border bg-surface p-4 text-start transition-all duration-150 ease-fluid hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-floating focus-visible:shadow-floating"
          >
            <span className="text-sm font-semibold text-ink">{t.name}</span>
            <span className="mt-0.5 text-xs text-muted">{t.hint}</span>
            <ol className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
              {t.slides.map((slide, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-ink-soft">
                  <span className="nums flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-tint text-[10px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  {slide}
                </li>
              ))}
            </ol>
            <span className="nums mt-3 text-[11px] text-muted">{t.slides.length} שקופיות</span>
          </button>
        ))}

        <button
          type="button"
          onClick={onBlank}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface p-4 text-muted transition-colors hover:border-accent hover:bg-accent-tint hover:text-accent"
        >
          <Plus className="h-6 w-6" strokeWidth={1.6} />
          <span className="text-sm font-semibold">מצגת ריקה</span>
          <span className="text-xs">מתחילים משקופית אחת</span>
        </button>
      </div>
    </div>
  );
}
