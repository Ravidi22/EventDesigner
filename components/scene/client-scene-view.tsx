"use client";

// The client's 3D view — the same on the client portal's scene page and on the no-login link
// (spec §6.3–6.4): the scene built from what the server handed over (lib/scene/client.ts —
// allow-listed products, the live drawing, the designer's camera work), the CURATED camera, and the
// bar. A client never gets a free camera: the designer's viewpoints (or the plan's defaults), the
// guided tour between them, a turn of the head at each.
//
// `?vp=<viewpoint id>` opens on that viewpoint — a link that lands on "the chuppah" rather than the
// first view. No three here: the viewer is lazy (./lazy.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientScene } from "@/lib/scene/client";
import { primeCatalog } from "@/lib/catalog/storage";
import { eventPlan } from "@/lib/events/plan";
import { arrangedStructure } from "@/lib/design-document/features";
import { buildScene } from "@/lib/scene/build";
import { defaultViewpoints, tourOf, viewpointsOf } from "@/lib/scene/viewpoints";
import type { Mood } from "@/lib/scene/types";
import { LazySceneViewer } from "./lazy";
import { SceneBar } from "./scene-bar";
import { detectDevice } from "./device";

export function ClientSceneView({ scene: given }: { scene: ClientScene }) {
  // The rows the builder resolves every placement against, primed before anything is built (the
  // client sketch's rule — lib/catalog/storage.ts).
  useState(() => {
    primeCatalog(given.products);
    return true;
  });
  const plan = useMemo(() => eventPlan({ venueId: given.venueId ?? undefined, zoneIds: given.zoneIds }, given.geometry), [given]);
  const structure = useMemo(() => arrangedStructure(plan.structure, given.document), [plan, given.document]);
  const scene = useMemo(
    () => buildScene({ doc: given.document, plan, structure, settings: given.settings, author: false }),
    [given.document, given.settings, plan, structure],
  );
  const defaults = useMemo(
    () => defaultViewpoints({ doc: given.document, structure, zones: plan.zones, bounds: plan.bounds }),
    [given.document, structure, plan],
  );
  const viewpoints = useMemo(() => viewpointsOf(given.settings, defaults), [given.settings, defaults]);
  const tour = useMemo(() => tourOf(given.settings, viewpoints), [given.settings, viewpoints]);

  const [mood, setMood] = useState<Mood>(given.settings.mood);
  const [activeId, setActiveId] = useState<string | null>(() => viewpoints[0]?.id ?? null);
  const [recentre, setRecentre] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [device] = useState(() => (typeof window !== "undefined" ? detectDevice() : undefined));
  const box = useRef<HTMLDivElement>(null);

  // A deep link to one viewpoint: read once, on the client.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("vp");
    if (want && viewpoints.some((v) => v.id === want)) setActiveId(want);
    // Only on mount: a later change of the list must not yank the camera back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settings = useMemo(() => ({ ...given.settings, mood }), [given.settings, mood]);

  return (
    <div ref={box} className="relative h-full w-full bg-surface">
      <LazySceneViewer
        scene={scene}
        settings={settings}
        mode="curated"
        author={false}
        device={device}
        viewpoints={viewpoints}
        zones={plan.all}
        activeId={activeId}
        recentre={recentre}
        tour={tour}
        playing={playing}
        onTourStep={(_, id) => setActiveId(id)}
        onTourEnd={() => setPlaying(false)}
        className="h-full w-full"
      />
      <SceneBar
        viewpoints={viewpoints}
        activeId={activeId}
        onActive={(id) => {
          setPlaying(false);
          if (id === activeId) setRecentre((n) => n + 1);
          setActiveId(id);
        }}
        playing={playing}
        onPlay={() => setPlaying((p) => !p)}
        canPlay={tour.stops.length > 1}
        mood={mood}
        onMood={setMood}
        fullscreenTarget={box}
      />
    </div>
  );
}
