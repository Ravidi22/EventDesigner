import type { Metadata } from "next";
import { sceneByToken } from "@/lib/scene/share-read";
import { formatEventDate } from "@/lib/events/types";
import { Wordmark } from "@/components/wordmark";
import { ClientSceneView } from "@/components/scene/client-scene-view";

export const metadata: Metadata = { title: "האירוע בתלת-ממד · Eve", robots: { index: false, follow: false } };

// The 3D view a client forwards to family (spec §6.4, F-9.2): no account, no shell — the room, the
// event's name and date, and the studio that designed it. PUBLIC in proxy.ts; the token is the
// whole permission, checked here on the server by sceneByToken (lib/scene/share-read.ts — hashed,
// unexpired, unrevoked, the event not archived) before anything is read. A dead link says so in one
// quiet sentence, the same sentence for every reason, so a guesser learns nothing.
export default async function SharedScenePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scene = await sceneByToken(token);

  if (!scene) {
    return (
      <div dir="rtl" className="flex min-h-dvh items-center justify-center bg-bg p-4">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-md bg-surface p-6 text-center shadow-floating">
          <Wordmark tone="mono" className="text-[26px]" />
          <p className="text-sm text-ink">הקישור אינו פעיל.</p>
          <p className="text-[13px] text-muted">אם קיבלתם אותו מהסטודיו, בקשו קישור חדש.</p>
        </div>
      </div>
    );
  }

  const { event, studio } = scene;
  return (
    <div dir="rtl" className="flex h-dvh flex-col gap-3 bg-bg p-3">
      <header className="flex min-h-14 shrink-0 items-center gap-3 rounded-md bg-surface px-4 py-2 shadow-floating">
        <Wordmark tone="mono" className="hidden text-[22px] sm:block" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-bold text-ink">{event.title}</h1>
          <p className="truncate text-[13px] text-muted">
            {[event.date ? formatEventDate(event.date) : "", event.venueName, event.where].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="text-end leading-tight">
          <span className="block text-[13px] font-semibold text-ink">{studio.name}</span>
          {studio.phone && (
            <a href={`tel:${studio.phone}`} className="block text-[12px] text-muted hover:text-accent" dir="ltr">
              {studio.phone}
            </a>
          )}
        </span>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden rounded-md bg-surface shadow-floating">
        <ClientSceneView scene={scene} />
      </main>
    </div>
  );
}
