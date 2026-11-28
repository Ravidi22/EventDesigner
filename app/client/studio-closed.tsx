import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { fetchMyEvents } from "@/lib/client-portal/actions";
import { named } from "@/lib/account/words";

// What a client's event page shows once the studio closed its business (EVE-22, spec §5.3): the
// sketch and the 3D answer as for an unknown event, so the page says why instead of a 404.

/** The client's event, when its studio closed — null for an event that is simply not theirs. */
export async function closedStudioEvent(eventId: string) {
  const mine = await fetchMyEvents();
  return mine.find((e) => e.id === eventId && e.studioClosed) ?? null;
}

export function StudioClosed({ studioName }: { studioName: string }) {
  return (
    <AuthShell
      tagline={false}
      title="הסטודיו סגר את החשבון"
      lede={`${studioName ? named(studioName) : "הסטודיו"} סגר את החשבון שלו ב־Eve, והסקיצה והתלת־ממד של האירוע כבר לא זמינים כאן.`}
      footer={<span>שאלות על האירוע — לסטודיו, ישירות.</span>}
    >
      <div className="mt-6 flex justify-center">
        <Link href="/client" className="text-sm font-semibold text-accent hover:underline">
          חזרה לאירועים שלי
        </Link>
      </div>
    </AuthShell>
  );
}
