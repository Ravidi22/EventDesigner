"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, Sunset, View } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { loadProducts } from "@/lib/catalog/storage";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { useEventWorkspace } from "@/lib/events/use-workspace";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { emptyDocument, type DesignDocumentContent } from "@/lib/design-document/types";
import { arrangedStructure } from "@/lib/design-document/features";
import { loadScratch } from "@/lib/studio/storage";
import { buildScene } from "@/lib/scene/build";
import { defaultViewpoints, tourOf, viewpointsOf } from "@/lib/scene/viewpoints";
import { DEFAULT_SETTINGS, MOODS, MOOD_LABEL, type Mood, type Scene, type Viewpoint } from "@/lib/scene/types";
import { LazySceneViewer } from "@/components/scene/lazy";
import { SceneBar } from "@/components/scene/scene-bar";
import type { CameraPose } from "@/components/scene/camera-rules";
import { detectDevice } from "@/components/scene/device";
import { previewScene } from "@/components/scene/preview-scene";
import { Popover } from "@/components/popover";
import { SidePanel } from "@/components/side-panel";
import { fetchStageRules } from "@/lib/settings/actions";
import { useSceneSettings } from "./use-scene-settings";
import { ViewpointsPanel } from "./viewpoints-panel";
import { SharePanel } from "./share-panel";
import { Switch } from "@/components/toggle";

// The 3D view of an event: the same document /studio edits and /outputs prints, built into a scene
// (lib/scene/build.ts) and drawn by the one viewer (components/scene/). Nothing here writes the
// document. What this screen owns is the CAMERA WORK — the viewpoints a client is shown, the guided
// tour, the mood — read and saved per event (./use-scene-settings.ts, lib/scene/actions.ts).
//
// Two frames. STUDIO (/scene): the designer's orbit camera, and the side panel with the light, the
// viewpoints and the tour (./viewpoints-panel.tsx); "מצב לקוח" previews the client's camera and bar
// in place. MEETING (the "scene" stage): the client sits beside the designer, so it is the CURATED
// camera with the client's bar (components/scene/scene-bar.tsx); the side panel starts collapsed,
// and a "נקודות מבט" puck in the corner holds the same viewpoints panel so a view can still be
// saved mid-meeting.
//
// The loading rule is /outputs' (outputs-screen.tsx): the scene is built only once BOTH the
// workspace and the catalog have landed, because an empty document read before its data is exactly
// the empty room this screen must never show as "the design".
const MOOD_ICON = { day: Sun, evening: Sunset, night: Moon } as const;

export function SceneScreen({ frame = "studio", initialProducts }: { frame?: "studio" | "meeting"; initialProducts?: Product[] }) {
  const { workspace, ready } = useEventWorkspace();
  const [warm] = useState(() => (typeof window !== "undefined" && loadProducts().length > 0 ? loadProducts() : undefined));
  const catalog = useCatalog(initialProducts ?? warm);
  const loading = !ready || !catalog.ready;
  const event = workspace?.event ?? null;
  const meeting = frame === "meeting";

  const store = useSceneSettings(event?.id ?? null);
  const { settings, setSettings } = store;
  const [panelCollapsed, setPanelCollapsed] = useState(meeting);
  // The studio's railing rule (settings → במות), as /outputs reads it: off until read, and off if
  // the read fails — a stage then simply wears no railing, which is what an unset rule means.
  const [railingAboveMm, setRailingAboveMm] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetchStageRules()
      .then((r) => live && setRailingAboveMm(r.railingAboveMm))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const [device] = useState(() => (typeof window !== "undefined" ? detectDevice() : { shadows: true, maxDpr: 1.5, touch: false }));

  const doc: DesignDocumentContent = useMemo(() => {
    if (!ready) return emptyDocument();
    return (event ? workspace?.document?.content : loadScratch()) ?? emptyDocument();
  }, [ready, event, workspace]);
  const plan: EventPlan = useMemo(() => (workspace ? eventPlan(event, workspace.geometry) : EMPTY_PLAN), [workspace, event]);
  const structure = useMemo(() => arrangedStructure(plan.structure, doc), [plan, doc]);

  // The client's camera — the meeting, or the designer's "מצב לקוח" preview. It also builds the
  // scene without the designer's marks (labels, missing stage pieces): the client sits beside the
  // screen in a meeting, and the preview is meant to show exactly what they see.
  const [clientPreview, setClientPreview] = useState(false);
  const curated = meeting || clientPreview;

  const empty = doc.tables.length === 0 && doc.placements.length === 0 && plan.structure.walls.length === 0;
  const scene: Scene | null = useMemo(() => {
    if (loading) return null;
    if (empty) return previewScene();
    // The catalog is primed (useCatalog primes it in its state initialiser), so the builder's
    // synchronous resolves see this studio's rows — catalog.products is the dependency that
    // rebuilds the scene when a row changes under the plan.
    // The builder takes no mood (that is the viewer's), so a mood switch rebuilds nothing.
    // Only the place-settings switch reaches the builder; the mood and the camera work are the viewer's.
    return buildScene({ doc, plan, structure, settings: { ...DEFAULT_SETTINGS, tableware: settings.tableware }, author: !curated, railingAboveMm });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, empty, doc, plan, structure, railingAboveMm, curated, catalog.products, settings.tableware]);

  // The viewpoints a client is shown when the designer has saved none — generated from the plan
  // (the example room frames its own bounds). Built only once the data is here, like the scene.
  const defaultsBounds = empty && scene ? scene.bounds : plan.bounds;
  const defaults: Viewpoint[] = useMemo(
    () => (loading ? [] : defaultViewpoints({ doc, structure, zones: plan.zones, bounds: defaultsBounds })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, doc, structure, plan, defaultsBounds, catalog.products],
  );
  const viewpoints = useMemo(() => viewpointsOf(settings, defaults), [settings, defaults]);
  const tour = useMemo(() => tourOf(settings, viewpoints), [settings, viewpoints]);

  // --- the camera's choices: which viewpoint, whether the tour plays ------------------------------
  const [chosen, setChosen] = useState<string | null>(null);
  const [recentre, setRecentre] = useState(0);
  const [playing, setPlaying] = useState(false);
  // The curated camera always stands somewhere: the chosen viewpoint, else the first. The designer's
  // camera may stand nowhere in particular (it opens on the overview and orbits freely).
  const activeId = chosen && viewpoints.some((v) => v.id === chosen) ? chosen : curated ? (viewpoints[0]?.id ?? null) : null;

  const choose = useCallback(
    (id: string) => {
      setPlaying(false);
      if (id === activeId) setRecentre((n) => n + 1);
      else setChosen(id);
    },
    [activeId],
  );
  const togglePlay = useCallback(() => setPlaying((p) => !p && tour.stops.length > 0), [tour.stops.length]);
  const onTourStep = useCallback((_index: number, viewpointId: string) => setChosen(viewpointId), []);
  const onTourEnd = useCallback(() => setPlaying(false), []);
  const onLeave = useCallback(() => setChosen(null), []);
  // The camera's pose, as the viewer reports it — a ref, never state: it changes every frame the
  // camera moves, and only "save the current view" ever reads it.
  const pose = useRef<CameraPose | null>(null);
  const onCamera = useCallback((p: CameraPose) => {
    pose.current = p;
  }, []);
  const currentPose = useCallback(() => pose.current, []);
  const setMood = useCallback((mood: Mood) => setSettings((s) => (s.mood === mood ? s : { ...s, mood })), [setSettings]);
  const setClientMode = useCallback((on: boolean) => {
    setPlaying(false);
    setClientPreview(on);
  }, []);

  const box = useRef<HTMLDivElement>(null);

  const panel = (
    <ViewpointsPanel
      settings={settings}
      defaults={defaults}
      onChange={setSettings}
      currentPose={currentPose}
      activeId={activeId}
      onActive={choose}
      playing={playing}
      onPlay={togglePlay}
      status={ready ? store.status : "loading"}
      onRetry={store.retry}
      clientMode={meeting ? undefined : { on: clientPreview, onChange: setClientMode }}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <div ref={box} className="relative min-w-0 flex-1 bg-surface">
        {scene ? (
          <LazySceneViewer
            scene={scene}
            settings={settings}
            mode={curated ? "curated" : "author"}
            author={!curated}
            device={device}
            viewpoints={viewpoints}
            zones={plan.all}
            activeId={activeId}
            recentre={recentre}
            tour={tour}
            playing={playing}
            onTourStep={onTourStep}
            onTourEnd={onTourEnd}
            onLeave={onLeave}
            onCamera={onCamera}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">טוען את הסקיצה…</div>
        )}
        {scene && empty && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-pill bg-surface/90 px-3 py-1 text-xs text-muted shadow-lifted">אין עדיין סקיצה לאירוע — זו דוגמה</span>
          </div>
        )}
        {scene && curated && (
          <SceneBar
            viewpoints={viewpoints}
            activeId={activeId}
            onActive={choose}
            playing={playing}
            onPlay={togglePlay}
            canPlay={tour.stops.length > 0}
            mood={settings.mood}
            onMood={setMood}
            fullscreenTarget={box}
          />
        )}
        {scene && meeting && (
          <div className="absolute end-3 top-3 z-20 rounded-pill bg-inset p-0.5 shadow-lifted">
            <Popover trigger="icon" icon={View} label="נקודות מבט" side="bottom" panelClassName="w-80">
              {panel}
            </Popover>
          </div>
        )}
      </div>

      <SidePanel
        collapsed={panelCollapsed}
        onToggle={() => setPanelCollapsed((c) => !c)}
        label="הגדרות התצוגה"
        edge="start"
        className="h-full shrink-0 p-3"
        expandedClassName="w-[300px]"
        collapsedClassName="w-[96px]"
        scrolls
        rail={<MoodRail mood={settings.mood} onMood={setMood} compact />}
      >
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h2 className="font-label text-[10px] font-medium tracking-[3px] text-muted" dir="ltr">
              LIGHT
            </h2>
            <MoodRail mood={settings.mood} onMood={setMood} />
          </section>
          {/* In the meeting the same panel is also in the corner puck; here it is only for the
              designer who opens the side panel. */}
          {panel}
          <section className="rounded-md border border-border bg-inset p-[11px]">
            <Switch
              checked={settings.tableware !== false}
              onChange={(on) => setSettings((s) => ({ ...s, tableware: on ? undefined : false }))}
              label="כלי שולחן להמחשה"
            />
            <p className="mt-1 text-[12px] text-muted">צלחות, כוסות וסכו״ם בכל מקום ישיבה — להמחשה בלבד, לא נספרים ולא נכנסים להצעה.</p>
          </section>
          {event && !meeting && <SharePanel eventId={event.id} clientName={event.clientName} phone={event.phone} />}
          {scene && !meeting && (
            <section className="rounded-md border border-border bg-inset p-[11px] text-xs text-muted" dir="ltr">
              {scene.stats.bodies} bodies · {scene.stats.instances} instances · {scene.stats.emitters} emitters
            </section>
          )}
        </div>
      </SidePanel>
    </div>
  );
}

/** The three moods as the event rail's chips — the same three the client's bar offers. */
function MoodRail({ mood, onMood, compact = false }: { mood: Mood; onMood: (m: Mood) => void; compact?: boolean }) {
  return (
    <div className={"flex items-center gap-0.5 rounded-pill bg-inset p-1 " + (compact ? "flex-col" : "")} role="radiogroup" aria-label="תאורה">
      {MOODS.map((m) => {
        const Icon = MOOD_ICON[m];
        const active = m === mood;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            title={MOOD_LABEL[m]}
            onClick={() => onMood(m)}
            className={
              "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-caption transition-colors " +
              (active ? "bg-accent-tint font-bold text-accent" : "font-semibold text-ink-soft hover:bg-surface hover:text-ink")
            }
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {!compact && MOOD_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}
