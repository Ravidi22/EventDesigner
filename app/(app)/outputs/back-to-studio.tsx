"use client";

import Link from "next/link";

// Where an empty sheet sends the designer.
//
// From /outputs that is the studio, one route away. From the meeting's closing stage the studio IS
// the previous stage — one footer button away — and a link to /studio there walked the designer out
// of the stepper mid-meeting, onto the full studio with its whole catalog, with the client watching.
// The same sentence in both frames, pointing at the right door in each; the three sheets that print
// "nothing yet" share it so one of them cannot drift back to the link.
export function BackToStudio({ meeting = false, className = "" }: { meeting?: boolean; className?: string }) {
  if (meeting) return <span className={`text-ink-soft ${className}`}>חזרו לסקיצה — ״חזרה״ בתחתית המסך.</span>;
  return (
    <Link href="/studio" className={`font-medium text-accent hover:text-accent-hover ${className}`}>
      חזרה לסטודיו →
    </Link>
  );
}
