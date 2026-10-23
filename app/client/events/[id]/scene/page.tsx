import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireClient } from "@/lib/auth/guard";
import { fetchClientScene } from "@/lib/client-portal/actions";
import { formatEventDate } from "@/lib/events/types";
import { Wordmark } from "@/components/wordmark";
import { NotificationBell } from "@/components/notification-bell";
import { ClientSceneView } from "@/components/scene/client-scene-view";

export const metadata: Metadata = { title: "האירוע בתלת-ממד · Eve" };

// The client's event in 3D (spec §6.3): the same view the no-login link shows (one component, one
// server assembly — lib/scene/reads.ts), behind the portal's own login. Read on the server; the
// event_clients join in fetchClientScene is the permission check, and an event not shared with
// this person is a 404.
export default async function ClientScenePage({ params }: { params: Promise<{ id: string }> }) {
  await requireClient();
  const { id } = await params;
  const scene = await fetchClientScene(id).catch(() => null);
  if (!scene) notFound();
  const { event, studio } = scene;

  return (
    <div dir="rtl" className="flex h-dvh flex-col gap-3 bg-bg p-3">
      <header className="flex min-h-14 shrink-0 items-center gap-3 rounded-md bg-surface px-4 py-2 shadow-floating">
        <Link
          href={`/client/events/${event.id}`}
          title="חזרה לסקיצה"
          aria-label="חזרה לסקיצה"
          className="-ms-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
        >
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Link>
        <Wordmark tone="mono" className="hidden text-[22px] sm:block" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-bold text-ink">{event.venueName ?? "האירוע שלכם"} · תלת-ממד</h1>
          <p className="truncate text-[13px] text-muted">{[event.date ? formatEventDate(event.date) : "", event.where].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="hidden text-end leading-tight md:block">
          <span className="block text-[13px] font-semibold text-ink">{studio.name}</span>
          {studio.phone && (
            <a href={`tel:${studio.phone}`} dir="ltr" className="block text-xs text-muted hover:text-accent">
              {studio.phone}
            </a>
          )}
        </span>
        <NotificationBell />
      </header>
      <main className="min-h-0 flex-1 overflow-hidden rounded-md bg-surface shadow-floating">
        <ClientSceneView scene={scene} />
      </main>
    </div>
  );
}
