"use client";

import { useMemo, useState } from "react";
import { Moon, Sun, Sunset } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { loadProducts } from "@/lib/catalog/storage";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { useEventWorkspace } from "@/lib/events/use-workspace";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { emptyDocument, type DesignDocumentContent } from "@/lib/design-document/types";
import { arrangedStructure } from "@/lib/design-document/features";
import { loadScratch } from "@/lib/studio/storage";
import { buildScene } from "@/lib/scene/build";
import { DEFAULT_SETTINGS, MOODS, MOOD_LABEL, type Mood, type Scene, type SceneSettings } from "@/lib/scene/types";
import { LazySceneViewer } from "@/components/scene/lazy";
import { detectDevice } from "@/components/scene/device";
import { previewScene } from "@/components/scene/preview-scene";
import { SidePanel } from "@/components/side-panel";

// The designer's 3D tab: the same document /studio edits and /outputs prints, built into a scene
// (lib/scene/build.ts) and drawn by the one viewer (components/scene/). Nothing here writes the
// document; what this screen will own is the camera work (viewpoints, the tour, the mood —
// phase C, event_scenes) and until then the mood is a local switch.
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

  const [settings, setSettings] = useState<SceneSettings>(DEFAULT_SETTINGS);
  const [panelCollapsed, setPanelCollapsed] = useState(frame === "meeting");
  const [device] = useState(() => (typeof window !== "undefined" ? detectDevice() : { shadows: true, maxDpr: 1.5, touch: false }));

  const doc: DesignDocumentContent = useMemo(() => {
    if (!ready) return emptyDocument();
    return (event ? workspace?.document?.content : loadScratch()) ?? emptyDocument();
  }, [ready, event, workspace]);
  const plan: EventPlan = useMemo(() => (workspace ? eventPlan(event, workspace.geometry) : EMPTY_PLAN), [workspace, event]);
  const structure = useMemo(() => arrangedStructure(plan.structure, doc), [plan, doc]);

  const empty = doc.tables.length === 0 && doc.placements.length === 0 && plan.structure.walls.length === 0;
  const scene: Scene | null = useMemo(() => {
    if (loading) return null;
    if (empty) return previewScene();
    // The catalog is primed (useCatalog primes it in its state initialiser), so the builder's
    // synchronous resolves see this studio's rows — catalog.products is the dependency that
    // rebuilds the scene when a row changes under the plan.
    // The builder takes no mood (that is the viewer's), so a mood switch rebuilds nothing.
    return buildScene({ doc, plan, structure, settings: DEFAULT_SETTINGS, author: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, empty, doc, plan, structure, catalog.products]);

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        {scene ? (
          <LazySceneViewer scene={scene} settings={settings} mode="author" author device={device} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">טוען את הסקיצה…</div>
        )}
        {scene && empty && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-pill bg-surface/90 px-3 py-1 text-xs text-muted shadow-lifted">אין עדיין סקיצה לאירוע — זו דוגמה</span>
          </div>
        )}
      </div>

      <SidePanel
        collapsed={panelCollapsed}
        onToggle={() => setPanelCollapsed((c) => !c)}
        label="הגדרות התצוגה"
        edge="start"
        className="h-full shrink-0 p-3"
        expandedClassName="w-[258px]"
        collapsedClassName="w-[96px]"
        rail={<MoodRail mood={settings.mood} onMood={(mood) => setSettings((s) => ({ ...s, mood }))} compact />}
      >
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h2 className="font-label text-[10px] font-medium tracking-[3px] text-muted" dir="ltr">
              LIGHT
            </h2>
            <MoodRail mood={settings.mood} onMood={(mood) => setSettings((s) => ({ ...s, mood }))} />
          </section>
          {scene && (
            <section className="rounded-md border border-border bg-inset p-[11px] text-xs text-muted" dir="ltr">
              {scene.stats.bodies} bodies · {scene.stats.instances} instances · {scene.stats.emitters} emitters
            </section>
          )}
          <p className="text-xs text-muted">נקודות מבט וסיור מודרך יתווספו בשלב הבא; לעת עתה המצלמה חופשית.</p>
        </div>
      </SidePanel>
    </div>
  );
}

/** The three moods as the event rail's chips: one look here, in the meeting and on the client's
 *  bar (phase C). */
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
