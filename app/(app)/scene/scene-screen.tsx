"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Lamp, Link2, Moon, Rotate3d, Route, Sun, Sunset, Utensils } from "lucide-react";
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
import { DEFAULT_SETTINGS, MAX_VIEWPOINTS, MOODS, MOOD_LABEL, type Mood, type Scene, type Viewpoint } from "@/lib/scene/types";
import { LazySceneViewer } from "@/components/scene/lazy";
import { SceneBar } from "@/components/scene/scene-bar";
import type { CameraPose } from "@/components/scene/camera-rules";
import { detectDevice } from "@/components/scene/device";
import { previewScene } from "@/components/scene/preview-scene";
import { Segmented } from "@/components/segmented";
import { SwitchRow } from "@/components/toggle";
import { EndPanel, PanelGroups, PanelGroupsHeader, openEndPanel, panelGroup as G } from "@/components/end-panel";
import { groupMemory } from "@/lib/studio/panel-groups";
import { ClientChip, CollapsedAction, FloatStrip, PanelFoot, PanelSkeleton, StripDivider, type FootAction } from "@/components/doc-shell";
import { fetchStageRules } from "@/lib/settings/actions";
import { useSceneSettings, type SceneSaveStatus } from "./use-scene-settings";
import { TourEditor, ViewpointsList, cameraWork, tourSummary } from "./viewpoints-panel";
import { ShareLink, linkStatus, useSceneLink } from "./share-panel";

// The 3D view of an event: the same document /studio edits and /outputs prints, built into a scene
// (lib/scene/build.ts) and drawn by the one viewer (components/scene/). Nothing here writes the
// document. What this screen owns is the CAMERA WORK — the viewpoints a client is shown, the guided
// tour, the mood — read and saved per event (./use-scene-settings.ts, lib/scene/actions.ts).
//
// THE SHELL (the "Outputs and 3D Drawers" board, 2026-11-11): the floating side card is gone — the
// screen wears the studio's END PANEL, its groups (תאורה · נקודות מבט · סיור מודרך · כלי שולחן ·
// קישור ללקוח) each reading its value back, and the client link pinned at its foot. Over the viewer,
// a strip: which camera, and "תצוגת לקוח". Under it, the bar: the designer's (viewpoints, ▶, "שמירת
// נקודת מבט" — saving moved out of the drawer, "the drawer only configures") or, in the client
// view, the client's own (viewpoints, ▶, moods, fullscreen) with the panel put away. Put away, the
// panel's 48px column keeps the three moods and the link.
//
// The meeting opens in the client view — the client sits beside the designer there — and has no
// link (it is sent from the studio, not with the client watching).
//
// The loading rule is /outputs' (outputs-screen.tsx): the scene is built only once BOTH the
// workspace and the catalog have landed, because an empty document read before its data is exactly
// the empty room this screen must never show as "the design".
const MOOD_ICON = { day: Sun, evening: Sunset, night: Moon } as const;
const MOOD_OPTIONS = MOODS.map((m) => [m, MOOD_LABEL[m], MOOD_ICON[m]] as const);
const KIND = "scene";
const DEFAULT_OPEN = ["views"] as const;

export function SceneScreen({ frame = "studio", initialProducts }: { frame?: "studio" | "meeting"; initialProducts?: Product[] }) {
  const { workspace, ready } = useEventWorkspace();
  const [warm] = useState(() => (typeof window !== "undefined" && loadProducts().length > 0 ? loadProducts() : undefined));
  const catalog = useCatalog(initialProducts ?? warm);
  // The studio's railing rule (settings → במות), as /outputs reads it: off if the read fails — a
  // stage then simply wears no railing, which is what an unset rule means. The scene waits for the
  // answer (`undefined` = not read yet): built before it, a studio WITH a rule had every open built
  // twice — railings off, then on — and the build is the page's longest task (plan A: ~340 ms).
  // (In dev the build still shows twice: Strict Mode runs every useMemo calculation twice.)
  const [railingAboveMm, setRailingAboveMm] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchStageRules()
      .then((r) => live && setRailingAboveMm(r.railingAboveMm))
      .catch(() => live && setRailingAboveMm(null));
    return () => {
      live = false;
    };
  }, []);
  const loading = !ready || !catalog.ready || railingAboveMm === undefined;
  const event = workspace?.event ?? null;
  const meeting = frame === "meeting";

  const store = useSceneSettings(event?.id ?? null);
  const { settings, setSettings } = store;
  const [device] = useState(() => (typeof window !== "undefined" ? detectDevice() : { shadows: true, maxDpr: 1.5, touch: false }));

  const doc: DesignDocumentContent = useMemo(() => {
    if (!ready) return emptyDocument();
    return (event ? workspace?.document?.content : loadScratch()) ?? emptyDocument();
  }, [ready, event, workspace]);
  const plan: EventPlan = useMemo(() => (workspace ? eventPlan(event, workspace.geometry) : EMPTY_PLAN), [workspace, event]);
  const structure = useMemo(() => arrangedStructure(plan.structure, doc), [plan, doc]);

  // THE CLIENT VIEW — the client's curated camera and bar, the panel put away. It also builds the
  // scene without the designer's marks (labels, missing stage pieces): it is meant to show exactly
  // what the client sees.
  const [client, setClient] = useState(meeting);
  const curated = client;

  const empty = doc.tables.length === 0 && doc.placements.length === 0 && plan.structure.walls.length === 0;
  const scene: Scene | null = useMemo(() => {
    if (loading) return null;
    if (empty) return previewScene();
    // The catalog is primed (useCatalog primes it in its state initialiser), so the builder's
    // synchronous resolves see this studio's rows — catalog.products is the dependency that
    // rebuilds the scene when a row changes under the plan.
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
  const setClientView = useCallback((on: boolean) => {
    setPlaying(false);
    setClient(on);
  }, []);
  const leaveClient = useMemo(() => ({ onOpen: () => setClientView(false) }), [setClientView]);

  const status: SceneSaveStatus = ready ? store.status : "loading";
  const editable = status !== "loading" && status !== "load-error";
  // eslint-disable-next-line react-hooks/refs -- `currentPose` is read by the save and reshoot handlers, on a press
  const work = cameraWork({ settings, defaults, onChange: setSettings, currentPose, onActive: choose });

  // --- the client link: its group, and the foot's CTA ------------------------------------------
  const link = useSceneLink(meeting ? null : (event?.id ?? null));
  const openShare = () => {
    setClientView(false);
    openEndPanel(KIND);
    groupMemory.open(KIND, "share");
  };
  const shareAction: FootAction | undefined =
    meeting || !event
      ? undefined
      : link.current || link.fresh
        ? { label: "שיתוף עם הלקוח", icon: Link2, onClick: openShare, disabled: !link.ready }
        : {
            label: "יצירת קישור ללקוח",
            icon: Link2,
            onClick: () => {
              openShare();
              void link.mint();
            },
            disabled: !link.ready || link.busy,
          };

  const box = useRef<HTMLDivElement>(null);
  const saveLine =
    status === "saving" ? "שומר…" : status === "saved" ? "נשמר ✓" : status === "error" ? "השמירה נכשלה" : status === "load-error" ? "הטעינה נכשלה" : status === "local" ? "לא נשמר" : "";

  const groups = [
    G(
      "light",
      Lamp,
      "תאורה",
      (() => {
        const Icon = MOOD_ICON[settings.mood];
        return (
          <>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {MOOD_LABEL[settings.mood]}
          </>
        );
      })(),
      <Segmented label="תאורה" hideLabel value={settings.mood} options={MOOD_OPTIONS} onChange={setMood} />,
    ),
    G(
      "views",
      Camera,
      "נקודות מבט",
      <span className="nums">{`${work.viewpoints.length}${work.usingDefaults ? " · ברירת מחדל" : ""}`}</span>,
      <ViewpointsList work={work} activeId={activeId} onActive={choose} editable={editable} />,
    ),
    G("tour", Route, "סיור מודרך", <span className="nums">{tourSummary(tour)}</span>, <TourEditor work={work} playing={playing} activeId={activeId} editable={editable} />),
    G(
      "table",
      Utensils,
      "כלי שולחן",
      settings.tableware !== false ? "מוצגים להמחשה" : "מוסתרים",
      <SwitchRow
        checked={settings.tableware !== false}
        onChange={(on) => setSettings((s) => ({ ...s, tableware: on ? undefined : false }))}
        label="כלי שולחן להמחשה"
        hint="צלחות, כוסות וסכו״ם בכל מקום ישיבה — להמחשה בלבד, לא נספרים ולא נכנסים להצעה."
      />,
    ),
    ...(event && !meeting
      ? [G("share", Link2, "קישור ללקוח", <span className="nums">{linkStatus(link).replace("קישור פעיל · ", "פעיל · ")}</span>, <ShareLink link={link} clientName={event.clientName} phone={event.phone} />)]
      : []),
  ];

  const saveView = (
    <button
      type="button"
      onClick={work.saveCurrent}
      disabled={!editable || work.full}
      title={work.full ? `אפשר לשמור עד ${MAX_VIEWPOINTS} נקודות מבט` : "שומר את מה שהמצלמה רואה עכשיו"}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5 text-[13px] font-bold text-accent transition-colors hover:bg-accent-tint disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
      שמירת נקודת מבט
    </button>
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
            // The controls are told by the strip's "מצלמה חופשית" (its title) — the viewer's own pill
            // sat under the designer's bar once the bar was there for both cameras.
            compact
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">טוען את הסקיצה…</div>
        )}
        <FloatStrip
          under={
            scene && empty ? <span className="rounded-pill bg-surface/90 px-3 py-1 text-xs text-muted shadow-lifted">אין עדיין סקיצה לאירוע — זו דוגמה</span> : undefined
          }
        >
          <span
            title={curated ? "הלקוח עובר בין נקודות המבט שהכנתם" : "גרירה: סיבוב · לחצן ימני: הזזה · גלגלת: זום לנקודה · לחיצה כפולה: מיקוד · W A S D: תנועה"}
            className="inline-flex cursor-help items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] font-semibold text-muted"
          >
            <Rotate3d className="h-3.5 w-3.5" strokeWidth={1.75} />
            {curated ? "מצלמה מודרכת" : "מצלמה חופשית"}
          </span>
          <StripDivider />
          <ClientChip on={client} onChange={setClientView} />
        </FloatStrip>
        {scene && (
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
            author={!curated}
            trailing={curated ? undefined : saveView}
          />
        )}
      </div>

      <EndPanel
        screen="scene"
        collapsible
        forcedClosed={client ? leaveClient : undefined}
        collapsedTools={
          <div className="flex flex-col gap-[3px]" role="radiogroup" aria-label="תאורה">
            {MOODS.map((m) => {
              const Icon = MOOD_ICON[m];
              const active = m === settings.mood;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={MOOD_LABEL[m]}
                  title={MOOD_LABEL[m]}
                  onClick={() => setMood(m)}
                  className={"flex h-10 w-9 items-center justify-center rounded-md transition-colors " + (active ? "bg-accent-tint text-accent" : "text-muted hover:bg-accent-tint hover:text-accent-hover")}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.4} />
                </button>
              );
            })}
          </div>
        }
        collapsedFoot={shareAction ? <CollapsedAction action={shareAction} /> : undefined}
        foot={
          <PanelFoot
            info={meeting || !event ? (event ? "מה שהלקוח יראה" : "אין אירוע פתוח") : link.error ?? linkStatus(link)}
            warn={!!link.error}
            side={saveLine}
            action={shareAction}
            below={scene && !client && !meeting ? <span dir="ltr">{`${scene.stats.bodies} bodies · ${scene.stats.instances} instances · ${scene.stats.emitters} emitters`}</span> : undefined}
          />
        }
      >
        {loading ? (
          <>
            <PanelGroupsHeader title="תצוגת תלת-ממד" sub="מה שהלקוח יראה" />
            <PanelSkeleton />
          </>
        ) : (
          <PanelGroups kind={KIND} title="תצוגת תלת-ממד" sub="מה שהלקוח יראה" groups={groups} defaultOpen={DEFAULT_OPEN} first />
        )}
        {status === "load-error" || status === "error" ? (
          <p role="status" className="border-t border-border-soft px-4 py-3 text-xs text-alert-ink">
            {status === "load-error" ? "טעינת נקודות המבט נכשלה." : "השמירה נכשלה."}
            <button type="button" onClick={store.retry} className="ms-1 font-semibold text-accent hover:text-accent-hover">
              ניסיון חוזר
            </button>
          </p>
        ) : null}
      </EndPanel>
    </div>
  );
}
