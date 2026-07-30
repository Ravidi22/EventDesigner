import { CalendarDays } from "lucide-react";

// Placeholder landing for the new sidebar entry — the timeline view itself isn't built yet.
export function GanttScreen() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-canvas">
        <CalendarDays className="h-7 w-7 text-accent" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-h2 text-ink">גאנט אירועים בדרך</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        כאן יופיע ציר זמן של כל האירועים הפעילים לצד האולם שנבחר — בהמתנה לבנייה.
      </p>
    </div>
  );
}
