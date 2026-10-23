"use client";
// The designer's camera work (spec §5, plan C5): the viewpoints a client is shown, the guided tour
// through them, and a preview of the client's own camera. Rendered in the scene tab's side panel
// and, in the meeting, in the "נקודות מבט" popover — the same component, so a view saved
// mid-meeting is saved the same way. It edits a SceneSettings and hands the whole next one up
// (`onChange`); reading, debouncing and saving are the screen's (./use-scene-settings.ts).
//
// The list a client sees is the designer's saved viewpoints, or — until there are any — the
// generated defaults (lib/scene/viewpoints.ts viewpointsOf). Any edit to the list MATERIALISES the
// defaults first (saved under their own `default:…` ids, so a tour built on them keeps pointing at
// them), so nothing the client was already shown disappears when the first view is saved. The tour
// is the same: shown as `tourOf` (every viewpoint at the default timings when none is saved), and
// written as a real tour on its first edit.
//
// Sections are hairline `bg-inset` wells, as everything inside a side panel is (CLAUDE.md).
import { useEffect, useId, useRef, useState } from "react";
import { Camera, ChevronDown, ChevronUp, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { CameraPose } from "@/components/scene/camera-rules";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { Switch } from "@/components/toggle";
import { DWELL_RANGE, MAX_NAME, MAX_TOUR_STOPS, TRAVEL_RANGE } from "@/lib/scene/clean";
import { tourOf, viewpointsOf } from "@/lib/scene/viewpoints";
import { DEFAULT_DWELL_MS, DEFAULT_TRAVEL_MS, MAX_VIEWPOINTS, type SceneSettings, type Tour, type Viewpoint } from "@/lib/scene/types";
import type { SceneSaveStatus } from "./use-scene-settings";

export interface ViewpointsPanelProps {
  settings: SceneSettings;
  /** The generated defaults for this plan (lib/scene/viewpoints.ts defaultViewpoints). */
  defaults: Viewpoint[];
  onChange: (next: SceneSettings) => void;
  /** The camera's pose now — the viewer's last `onCamera` report — or null before the first. */
  currentPose: () => CameraPose | null;
  activeId: string | null;
  /** A row's name chosen: the camera flies there. */
  onActive: (id: string) => void;
  playing: boolean;
  onPlay: () => void;
  status: SceneSaveStatus;
  onRetry: () => void;
  /** The scene tab only: preview the client's camera and bar in place of the designer's. */
  clientMode?: { on: boolean; onChange: (on: boolean) => void };
}

const WELL = "flex flex-col gap-2.5 rounded-md border border-border bg-inset p-[11px]";

const rowIcon = (danger = false) =>
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted " +
  (danger ? "hover:bg-alert-tint hover:text-alert" : "hover:bg-accent-tint hover:text-accent-hover");

/** A fresh id. `crypto.randomUUID` exists only in a secure context, and the studio is also opened
 *  from a tablet over the LAN (http://192.168.x.x — next.config's allowedDevOrigins). */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const mm = (p: { x: number; y: number; z: number }) => ({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) });
const shot = (pose: CameraPose) => ({ eye: mm(pose.eye), look: mm(pose.look), fovDeg: Math.round(pose.fovDeg * 10) / 10 });
const seconds = (ms: number) => Math.round(ms / 100) / 10;

/** "נקודת מבט N" for the first N from the list's next position that no viewpoint is called. */
function nextName(list: Viewpoint[]): string {
  const taken = new Set(list.map((v) => v.name));
  for (let n = list.length + 1; ; n++) {
    const name = `נקודת מבט ${n}`;
    if (!taken.has(name)) return name;
  }
}

type Confirm = { kind: "delete"; id: string; name: string; last: boolean } | { kind: "reset" } | null;

export function ViewpointsPanel({ settings, defaults, onChange, currentPose, activeId, onActive, playing, onPlay, status, onRetry, clientMode }: ViewpointsPanelProps) {
  const viewpoints = viewpointsOf(settings, defaults);
  const usingDefaults = settings.viewpoints.length === 0;
  const tour = tourOf(settings, viewpoints);
  const editable = status !== "loading" && status !== "load-error";
  const full = viewpoints.length >= MAX_VIEWPOINTS;
  const nameOf = (id: string) => viewpoints.find((v) => v.id === id)?.name ?? "";

  const uid = useId();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [pick, setPick] = useState("");
  const picked = viewpoints.some((v) => v.id === pick) ? pick : (viewpoints[0]?.id ?? "");

  // --- the list ---------------------------------------------------------------------------------

  /** A new list, with the tour's stops kept only where they still name one of its viewpoints (a
   *  tour that empties goes back to the default one). */
  const withViewpoints = (list: Viewpoint[]): SceneSettings => {
    const ids = new Set(list.map((v) => v.id));
    let t = settings.tour;
    if (t) {
      const stops = t.stops.filter((s) => ids.has(s.viewpointId));
      t = stops.length ? { ...t, stops } : null;
    }
    return { ...settings, viewpoints: list, tour: t };
  };

  const saveCurrent = () => {
    const pose = currentPose();
    if (!pose || full) return;
    const v: Viewpoint = { id: newId(), name: nextName(viewpoints), ...shot(pose) };
    onChange(withViewpoints([...viewpoints, v]));
    onActive(v.id);
  };

  const reshoot = (id: string) => {
    const pose = currentPose();
    if (!pose) return;
    onChange(withViewpoints(viewpoints.map((v) => (v.id === id ? { ...v, ...shot(pose) } : v))));
    onActive(id);
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= viewpoints.length) return;
    const list = [...viewpoints];
    [list[index], list[to]] = [list[to], list[index]];
    onChange(withViewpoints(list));
  };

  const remove = (id: string) => onChange(withViewpoints(viewpoints.filter((v) => v.id !== id)));
  const reset = () => onChange({ ...settings, viewpoints: [], tour: null });

  // --- rename: inline, Enter or a click away keeps it, Escape drops it --------------------------

  const input = useRef<HTMLInputElement>(null);
  const editingId = useRef<string | null>(null);
  const startRename = (v: Viewpoint) => {
    editingId.current = v.id;
    setEditing({ id: v.id, draft: v.name });
  };
  const commitRename = () => {
    const id = editingId.current;
    if (!id || !editing) return;
    editingId.current = null;
    const name = editing.draft.trim().slice(0, MAX_NAME);
    setEditing(null);
    if (name && name !== nameOf(id)) onChange(withViewpoints(viewpoints.map((v) => (v.id === id ? { ...v, name } : v))));
  };
  const cancelRename = () => {
    editingId.current = null;
    setEditing(null);
  };
  const renaming = editing?.id ?? null;
  useEffect(() => {
    if (!renaming) return;
    input.current?.focus();
    input.current?.select();
    // Escape is caught on the WINDOW in the capture phase — ahead of the meeting popover's own
    // document-level Escape, which would otherwise close the whole panel around the field.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancelRename();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [renaming]);

  // --- the tour ---------------------------------------------------------------------------------

  /** Every tour edit starts from the tour as shown — which is how a default tour becomes a real one. */
  const setTour = (next: Tour) => onChange({ ...settings, tour: next });
  const setStop = (index: number, patch: { dwellMs?: number; travelMs?: number }) =>
    setTour({ ...tour, stops: tour.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const removeStop = (index: number) => setTour({ ...tour, stops: tour.stops.filter((_, i) => i !== index) });
  const addStop = () => {
    if (!picked || tour.stops.length >= MAX_TOUR_STOPS) return;
    setTour({ ...tour, stops: [...tour.stops, { viewpointId: picked, dwellMs: DEFAULT_DWELL_MS, travelMs: DEFAULT_TRAVEL_MS }] });
  };

  return (
    <div className="flex flex-col gap-3">
      <section className={WELL} aria-labelledby={`${uid}-viewpoints`}>
        <h3 id={`${uid}-viewpoints`} className="text-sm font-bold text-ink">
          נקודות מבט
        </h3>
        <Button size="sm" className="w-full" onClick={saveCurrent} disabled={!editable || full}>
          שמירת נקודת המבט הנוכחית
        </Button>
        {full && <p className="text-xs text-muted">אפשר לשמור עד {MAX_VIEWPOINTS} נקודות מבט.</p>}
        {usingDefaults && <p className="text-xs leading-relaxed text-muted">נקודות ברירת מחדל — שמירה של נקודה תחליף אותן</p>}
        {viewpoints.length > 0 ? (
          <ul className="flex flex-col gap-[3px]">
            {viewpoints.map((v, i) => {
              const active = v.id === activeId;
              if (renaming === v.id && editing) {
                return (
                  <li key={v.id} className="flex items-center gap-1">
                    <input
                      ref={input}
                      value={editing.draft}
                      maxLength={MAX_NAME}
                      aria-label="שם נקודת המבט"
                      onChange={(e) => setEditing({ id: v.id, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename();
                        }
                      }}
                      onBlur={commitRename}
                      className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-canvas px-2 text-sm text-ink transition-colors hover:border-accent-line focus-visible:border-accent focus-visible:outline-none"
                    />
                  </li>
                );
              }
              return (
                <li key={v.id} className={"flex items-center gap-0.5 rounded-sm ps-2 pe-0.5 " + (active ? "bg-accent-tint" : "")}>
                  <button
                    type="button"
                    onClick={() => onActive(v.id)}
                    aria-current={active ? "true" : undefined}
                    title={`מעבר אל ${v.name}`}
                    className={"min-w-0 flex-1 truncate py-1.5 text-start text-sm " + (active ? "font-bold text-accent" : "font-semibold text-ink-soft hover:text-ink")}
                  >
                    {v.name}
                  </button>
                  <button type="button" className={rowIcon()} onClick={() => startRename(v)} disabled={!editable} aria-label={`שינוי השם של ${v.name}`} title="שינוי שם">
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className={rowIcon()} onClick={() => reshoot(v.id)} disabled={!editable} aria-label={`צילום מחדש של ${v.name}`} title="צילום מחדש מהמצלמה הנוכחית">
                    <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className={rowIcon()} onClick={() => move(i, -1)} disabled={!editable || i === 0} aria-label={`הזזת ${v.name} למעלה`} title="למעלה">
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button type="button" className={rowIcon()} onClick={() => move(i, 1)} disabled={!editable || i === viewpoints.length - 1} aria-label={`הזזת ${v.name} למטה`} title="למטה">
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={rowIcon(true)}
                    onClick={() => setConfirm({ kind: "delete", id: v.id, name: v.name, last: viewpoints.length === 1 })}
                    disabled={!editable}
                    aria-label={`מחיקת ${v.name}`}
                    title="מחיקה"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted">אין עדיין נקודות מבט.</p>
        )}
        {!usingDefaults && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setConfirm({ kind: "reset" })} disabled={!editable}>
            חזרה לברירת המחדל
          </Button>
        )}
      </section>

      <section className={WELL} aria-labelledby={`${uid}-tour`}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 id={`${uid}-tour`} className="text-sm font-bold text-ink">
            סיור מודרך
          </h3>
          <span className="text-xs text-muted">זמנים בשניות</span>
        </div>
        {tour.stops.length > 0 ? (
          <ol className="flex flex-col gap-1.5">
            {tour.stops.map((s, i) => {
              const lit = playing && s.viewpointId === activeId;
              return (
                <li key={`${i}-${s.viewpointId}`} className="flex flex-col gap-1.5 rounded-sm border border-border-soft bg-surface px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="nums w-4 shrink-0 text-xs text-muted">{i + 1}</span>
                    <span className={"min-w-0 flex-1 truncate text-sm " + (lit ? "font-bold text-accent" : "font-semibold text-ink-soft")}>{nameOf(s.viewpointId)}</span>
                    <button
                      type="button"
                      className={rowIcon(true)}
                      onClick={() => removeStop(i)}
                      disabled={!editable || tour.stops.length <= 1}
                      aria-label={`הסרת ${nameOf(s.viewpointId)} מהסיור`}
                      title="הסרה מהסיור"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-5">
                    <NumberField
                      layout="inline"
                      size="sm"
                      label="שהייה"
                      value={seconds(s.dwellMs)}
                      min={DWELL_RANGE.min / 1000}
                      max={DWELL_RANGE.max / 1000}
                      step={0.5}
                      disabled={!editable}
                      className="w-16"
                      onChange={(sec) => setStop(i, { dwellMs: Math.round(sec * 1000) })}
                    />
                    <NumberField
                      layout="inline"
                      size="sm"
                      label="מעבר"
                      value={seconds(s.travelMs)}
                      min={TRAVEL_RANGE.min / 1000}
                      max={TRAVEL_RANGE.max / 1000}
                      step={0.5}
                      disabled={!editable}
                      className="w-16"
                      onChange={(sec) => setStop(i, { travelMs: Math.round(sec * 1000) })}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-xs text-muted">אין עצירות — שמרו נקודת מבט כדי להתחיל.</p>
        )}
        {editable && viewpoints.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={picked} onChange={setPick} options={viewpoints.map((v) => ({ value: v.id, label: v.name }))} aria-label="נקודת מבט לעצירה" className="min-w-0 flex-1" />
            <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2} />} onClick={addStop} disabled={tour.stops.length >= MAX_TOUR_STOPS}>
              הוספת עצירה
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-ink-soft">חזרה בלולאה</span>
          <Switch checked={tour.loop} onChange={(loop) => setTour({ ...tour, loop })} label="חזרה בלולאה" disabled={!editable} />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          icon={playing ? <Pause className="h-3.5 w-3.5" strokeWidth={2} /> : <Play className="h-3.5 w-3.5" strokeWidth={2} />}
          onClick={onPlay}
          disabled={!playing && tour.stops.length === 0}
        >
          {playing ? "עצירה" : "נגינה"}
        </Button>
      </section>

      {clientMode && (
        <section className={WELL}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">מצב לקוח</h3>
            <Switch checked={clientMode.on} onChange={clientMode.onChange} label="מצב לקוח" />
          </div>
          <p className="text-xs leading-relaxed text-muted">התצוגה כפי שהלקוח רואה אותה: נקודות המבט, הסיור והתאורה — בלי מצלמה חופשית.</p>
        </section>
      )}

      <StatusLine status={status} onRetry={onRetry} />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "reset" ? "לחזור לנקודות ברירת המחדל?" : confirm ? `למחוק את ${confirm.name}?` : ""}
        body={
          confirm?.kind === "reset"
            ? "כל נקודות המבט השמורות והסיור יימחקו, ונקודות ברירת המחדל יחזרו."
            : confirm?.kind === "delete"
              ? confirm.last
                ? "זו נקודת המבט האחרונה — אחרי המחיקה יחזרו נקודות ברירת המחדל."
                : "הנקודה תוסר גם מהסיור המודרך."
              : undefined
        }
        confirmLabel={confirm?.kind === "reset" ? "חזרה לברירת המחדל" : "מחיקה"}
        onConfirm={() => {
          if (confirm?.kind === "reset") reset();
          else if (confirm?.kind === "delete") remove(confirm.id);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function StatusLine({ status, onRetry }: { status: SceneSaveStatus; onRetry: () => void }) {
  const retry = (
    <button type="button" onClick={onRetry} className="ms-1 font-semibold text-accent hover:text-accent-hover">
      ניסיון חוזר
    </button>
  );
  const line =
    status === "local" ? (
      "שמירה תתאפשר אחרי פתיחת אירוע"
    ) : status === "loading" ? (
      "טוען את נקודות המבט…"
    ) : status === "load-error" ? (
      <span className="text-alert-ink">
        טעינת נקודות המבט נכשלה.{retry}
      </span>
    ) : status === "saving" ? (
      "שומר…"
    ) : status === "saved" ? (
      "נשמר"
    ) : status === "error" ? (
      <span className="text-alert-ink">
        השמירה נכשלה.{retry}
      </span>
    ) : null;
  if (!line) return null;
  return (
    <p role="status" className="px-1 text-xs text-muted">
      {line}
    </p>
  );
}
