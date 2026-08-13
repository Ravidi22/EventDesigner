"use client";

import { Lock } from "lucide-react";

// "This event is booked into a property nobody shared with you."
//
// Two ladders meet here (see CLAUDE.md): an event belongs to the whole studio, a venue is granted
// per member. So a designer can legitimately hold an event whose hall they may not open — and until
// this existed, that arrived as an empty plane with no explanation, indistinguishable from a
// property nobody has drawn yet.
//
// It is not only a courtesy. A drape measures its metres off the wall it hangs on; with no wall it
// falls back to the product's catalog width, so a 14-metre run quotes as 3 metres of fabric. The
// screen looked merely empty and the PRICE was wrong. Anything that measures says so now — see
// `VenueGeometry.access`.
//
// One component for all three surfaces (studio, placement map, quote) so the sentence is the same
// wherever it appears, and so the fix for its wording is one edit.

/** What the person should do about it, which differs by screen. */
type Tone = "plan" | "measure";

const BODY: Record<Tone, string> = {
  plan: "האירוע משויך למתחם שלא שותף איתכם, ולכן התוכנית לא נטענת. אפשר להמשיך לעבוד על הפריטים — בעל הסטודיו יכול לשתף את המתחם מהגדרות › שיתוף מתחמים.",
  measure:
    "האירוע משויך למתחם שלא שותף איתכם. פריטים הנמכרים לפי מטר — וילונות, שטיחים — מחושבים לפי מידות הקטלוג ולא לפי הקירות בפועל, ולכן הסכום עלול להיות נמוך מהאמיתי.",
};

export function VenueAccessNotice({ tone = "plan", className = "" }: { tone?: Tone; className?: string }) {
  return (
    <div
      role="status"
      className={
        "flex max-w-md gap-3 rounded-md border border-border bg-surface px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft shadow-floating " +
        className
      }
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold text-ink">אין לכם גישה למתחם הזה</p>
        <p className="mt-1">{BODY[tone]}</p>
      </div>
    </div>
  );
}
