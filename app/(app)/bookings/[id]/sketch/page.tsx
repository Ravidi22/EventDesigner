import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireOrgKind } from "@/lib/auth/guard";
import { fetchDesignerSketch } from "@/lib/event-links/actions";
import { HallSketchView } from "./hall-sketch-view";

export const metadata: Metadata = { title: "סקיצת האולם · Eve" };

// The linked designer's plain hall sketch for one of the venue's bookings. Read on the server: the
// action proves the booking is this venue's and the link is active, and an evening without one is a
// 404 rather than a page that admits it exists.
export default async function BookingSketchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrgKind(["venue"]);
  const { id } = await params;
  const sketch = await fetchDesignerSketch(id).catch(() => null);
  if (!sketch) notFound();
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pb-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/bookings?event=${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover">
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
          חזרה לאירוע
        </Link>
        <p className="text-sm text-ink-soft">
          סקיצת האולם של <span className="font-semibold text-ink">{sketch.studioName}</span>
          {sketch.updatedAt && <span className="text-muted"> · עודכנה {new Date(sketch.updatedAt).toLocaleDateString("he-IL")}</span>}
        </p>
      </div>
      <HallSketchView sketch={sketch} />
    </div>
  );
}
