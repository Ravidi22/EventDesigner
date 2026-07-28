import { PackagePlus, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/button";

// First run (F-2.3): an empty catalog is the adoption blocker, so this teaches what the
// catalog is for and makes adding the first product the obvious next move.
export function FirstRunEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-canvas">
        <PackagePlus className="h-7 w-7 text-accent" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-h2 text-ink">הקטלוג עדיין ריק</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        הקטלוג הוא מאגר הפריטים שאיתו תלביש כל אירוע — מפות, כיסאות, שנדליירים ועוד. כל פריט שתוסיף
        כאן יהיה זמין לגרירה על מפת האולם, ויזין אוטומטית את רשימת הציוד ואת הצעת המחיר.
      </p>
      <Button onClick={onAdd} className="mt-6">
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        הוסף מוצר ראשון
      </Button>
    </div>
  );
}

export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <SearchX className="mb-4 h-8 w-8 text-muted" strokeWidth={1.5} />
      <h2 className="text-base font-semibold text-ink">לא נמצאו מוצרים</h2>
      <p className="mt-1 text-sm text-ink-soft">נסה לשנות את החיפוש או להסיר חלק מהסינון.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-soft"
      >
        נקה סינון
      </button>
    </div>
  );
}
