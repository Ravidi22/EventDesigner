"use client";
// The designer's camera work (spec §5, plan C5): the viewpoints a client is shown and the guided tour
// through them. Since the "Outputs and 3D Drawers" board (2026-11-11) they are two GROUPS of the 3D
// screen's end panel — נקודות מבט and סיור מודרך — and saving the current view is the bar's, under
// the viewer: "the drawer only configures". This module edits a SceneSettings and hands the whole
// next one up (`onChange`); reading, debouncing and saving are the screen's (./use-scene-settings.ts).
//
// The list a client sees is the designer's saved viewpoints, or — until there are any — the
// generated defaults (lib/scene/viewpoints.ts viewpointsOf). Any edit to the list MATERIALISES the
// defaults first (saved under their own `default:…` ids, so a tour built on them keeps pointing at
// them), so nothing the client was already shown disappears when the first view is saved. The tour
// is the same: shown as `tourOf` (every viewpoint at the default timings when none is saved), and
// written as a real tour on its first edit.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { CameraPose } from "@/components/scene/camera-rules";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu } from "@/components/menu";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { SwitchRow } from "@/components/toggle";
import { DWELL_RANGE, MAX_NAME, MAX_TOUR_STOPS, TRAVEL_RANGE } from "@/lib/scene/clean";
import { tourOf, viewpointsOf } from "@/lib/scene/viewpoints";
import { DEFAULT_DWELL_MS, DEFAULT_TRAVEL_MS, MAX_VIEWPOINTS, type SceneSettings, type Tour, type Viewpoint } from "@/lib/scene/types";

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
export const seconds = (ms: number) => Math.round(ms / 100) / 10;

/** "נקודת מבט N" for the first N from the list's next position that no viewpoint is called. */
function nextName(list: Viewpoint[]): string {
  const taken = new Set(list.map((v) => v.name));
  for (let n = list.length + 1; ; n++) {
    const name = `נקודת מבט ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** The camera work as values and verbs — one object for the bar (save) and both groups. */
export function cameraWork({
  settings,
  defaults,
  onChange,
  currentPose,
  onActive,
}: {
  settings: SceneSettings;
  defaults: Viewpoint[];
  onChange: (next: SceneSettings) => void;
  currentPose: () => CameraPose | null;
  onActive: (id: string) => void;
}) {
  const viewpoints = viewpointsOf(settings, defaults);
  const tour = tourOf(settings, viewpoints);
  const full = viewpoints.length >= MAX_VIEWPOINTS;

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
  const setTour = (next: Tour) => onChange({ ...settings, tour: next });

  return {
    viewpoints,
    tour,
    full,
    usingDefaults: settings.viewpoints.length === 0,
    nameOf: (id: string) => viewpoints.find((v) => v.id === id)?.name ?? "",
    saveCurrent: () => {
      const pose = currentPose();
      if (!pose || full) return;
      const v: Viewpoint = { id: newId(), name: nextName(viewpoints), ...shot(pose) };
      onChange(withViewpoints([...viewpoints, v]));
      onActive(v.id);
    },
    reshoot: (id: string) => {
      const pose = currentPose();
      if (!pose) return;
      onChange(withViewpoints(viewpoints.map((v) => (v.id === id ? { ...v, ...shot(pose) } : v))));
      onActive(id);
    },
    move: (index: number, by: -1 | 1) => {
      const to = index + by;
      if (to < 0 || to >= viewpoints.length) return;
      const list = [...viewpoints];
      [list[index], list[to]] = [list[to], list[index]];
      onChange(withViewpoints(list));
    },
    rename: (id: string, name: string) => onChange(withViewpoints(viewpoints.map((v) => (v.id === id ? { ...v, name } : v)))),
    remove: (id: string) => onChange(withViewpoints(viewpoints.filter((v) => v.id !== id))),
    reset: () => onChange({ ...settings, viewpoints: [], tour: null }),
    // Every tour edit starts from the tour as shown — which is how a default tour becomes a real one.
    setTour,
    setStop: (index: number, patch: { dwellMs?: number; travelMs?: number }) =>
      setTour({ ...tour, stops: tour.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)) }),
    removeStop: (index: number) => setTour({ ...tour, stops: tour.stops.filter((_, i) => i !== index) }),
    addStop: (viewpointId: string) => {
      if (!viewpointId || tour.stops.length >= MAX_TOUR_STOPS) return;
      setTour({ ...tour, stops: [...tour.stops, { viewpointId, dwellMs: DEFAULT_DWELL_MS, travelMs: DEFAULT_TRAVEL_MS }] });
    },
  };
}
export type CameraWork = ReturnType<typeof cameraWork>;

type Confirm = { kind: "delete"; id: string; name: string; last: boolean } | { kind: "reset" } | null;

/** The "נקודות מבט" group: one line per viewpoint — its number, its name (a press flies there), and
 *  while it is the camera's, "צילום מחדש"; rename, order and delete behind its "…". */
export function ViewpointsList({ work, activeId, onActive, editable }: { work: CameraWork; activeId: string | null; onActive: (id: string) => void; editable: boolean }) {
  const { viewpoints, usingDefaults } = work;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);

  // Rename inline: Enter or a click away keeps it, Escape drops it.
  const input = useRef<HTMLInputElement>(null);
  const commit = () => {
    if (!editing) return;
    const name = editing.draft.trim().slice(0, MAX_NAME);
    setEditing(null);
    if (name && name !== work.nameOf(editing.id)) work.rename(editing.id, name);
  };
  const renaming = editing?.id ?? null;
  useEffect(() => {
    if (!renaming) return;
    input.current?.focus();
    input.current?.select();
    // Escape is caught on the WINDOW in the capture phase, ahead of anything that closes around it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setEditing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [renaming]);

  return (
    <div className="-mx-1.5 flex flex-col gap-px">
      {usingDefaults && <p className="mx-1.5 mb-1.5 text-xs leading-relaxed text-muted">נוצרו מהתוכנית. שמירת נקודה (בסרגל שמתחת לתצוגה) תחליף אותן.</p>}
      {viewpoints.length === 0 && <p className="mx-1.5 text-xs text-muted">אין עדיין נקודות מבט.</p>}
      {viewpoints.map((v, i) => {
        const active = v.id === activeId;
        if (renaming === v.id && editing)
          return (
            <input
              key={v.id}
              ref={input}
              value={editing.draft}
              maxLength={MAX_NAME}
              aria-label="שם נקודת המבט"
              onChange={(e) => setEditing({ id: v.id, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
              onBlur={commit}
              className="mx-1.5 h-[34px] min-w-0 rounded-sm border border-border bg-canvas px-2 text-[13px] text-ink transition-colors focus-visible:border-accent focus-visible:outline-none"
            />
          );
        return (
          <div key={v.id} className={"flex min-h-[34px] items-center gap-0.5 rounded-sm px-1.5 " + (active ? "bg-accent-tint text-accent-hover" : "text-ink")}>
            <button
              type="button"
              onClick={() => onActive(v.id)}
              aria-current={active ? "true" : undefined}
              title={`מעבר אל ${v.name}`}
              className="flex min-w-0 flex-1 items-center gap-2 text-start"
            >
              <span className={"nums flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm text-xs font-bold " + (active ? "bg-surface text-accent" : "bg-inset text-muted")}>{i + 1}</span>
              <span className={"min-w-0 flex-1 truncate text-[13px] " + (active ? "font-bold" : "font-semibold")}>{v.name}</span>
            </button>
            {active && editable && (
              <button
                type="button"
                onClick={() => work.reshoot(v.id)}
                title="צילום מחדש מהמצלמה הנוכחית"
                aria-label={`צילום מחדש של ${v.name}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-accent-hover transition-colors hover:bg-surface"
              >
                <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
            {editable && (
              <Menu
                label={`שינוי שם, סדר ומחיקה של ${v.name}`}
                align="end"
                items={[
                  { label: "שינוי שם", icon: Pencil, onSelect: () => setEditing({ id: v.id, draft: v.name }) },
                  { label: "צילום מחדש מהמצלמה", icon: Camera, onSelect: () => work.reshoot(v.id) },
                  ...(i > 0 ? [{ label: "למעלה ברשימה", icon: ArrowUp, onSelect: () => work.move(i, -1), separated: true }] : []),
                  ...(i < viewpoints.length - 1 ? [{ label: "למטה ברשימה", icon: ArrowDown, onSelect: () => work.move(i, 1), separated: i === 0 }] : []),
                  { label: "מחיקה", icon: Trash2, danger: true, separated: true, onSelect: () => setConfirm({ kind: "delete", id: v.id, name: v.name, last: viewpoints.length === 1 }) },
                ]}
              />
            )}
          </div>
        );
      })}
      {work.full && <p className="mx-1.5 mt-1 text-xs text-muted">אפשר לשמור עד {MAX_VIEWPOINTS} נקודות מבט.</p>}
      {!usingDefaults && editable && (
        <button type="button" onClick={() => setConfirm({ kind: "reset" })} className="mx-1.5 mt-1.5 inline-flex items-center gap-1.5 self-start text-xs font-semibold text-accent hover:text-accent-hover">
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          חזרה לברירת המחדל
        </button>
      )}
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
          if (confirm?.kind === "reset") work.reset();
          else if (confirm?.kind === "delete") work.remove(confirm.id);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

/** The "סיור מודרך" group: the stops one line each (number, name, its seconds); only the OPEN stop
 *  shows its timing fields and its bin. Then a stop to add, and the loop. ▶ is the bar's. */
export function TourEditor({ work, playing, activeId, editable }: { work: CameraWork; playing: boolean; activeId: string | null; editable: boolean }) {
  const { tour, viewpoints } = work;
  const [openStop, setOpenStop] = useState<number>(-1);
  const [pick, setPick] = useState("");
  const picked = viewpoints.some((v) => v.id === pick) ? pick : (viewpoints[0]?.id ?? "");
  return (
    <div className="flex flex-col gap-2.5">
      {tour.stops.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {tour.stops.map((s, i) => {
            const isOpen = i === openStop;
            const lit = playing && s.viewpointId === activeId;
            return (
              <li key={`${i}-${s.viewpointId}`} className={"rounded-sm border px-2 py-[7px] " + (isOpen ? "border-border bg-inset" : "border-border-soft bg-surface")}>
                <button type="button" onClick={() => setOpenStop(isOpen ? -1 : i)} aria-expanded={isOpen} className="flex w-full items-center gap-2 text-start">
                  <span className="nums w-3.5 shrink-0 text-xs text-muted">{i + 1}</span>
                  <span className={"min-w-0 flex-1 truncate text-[13px] " + (lit ? "font-bold text-accent" : "font-semibold text-ink")}>{work.nameOf(s.viewpointId)}</span>
                  <span className="nums shrink-0 text-xs text-muted" dir="rtl">
                    {seconds(s.dwellMs)} + {seconds(s.travelMs)} ש׳
                  </span>
                </button>
                {isOpen && (
                  <div className="flex items-center gap-3 ps-[22px] pt-2">
                    <NumberField
                      layout="inline"
                      size="sm"
                      label="שהייה"
                      value={seconds(s.dwellMs)}
                      min={DWELL_RANGE.min / 1000}
                      max={DWELL_RANGE.max / 1000}
                      step={0.5}
                      disabled={!editable}
                      className="w-14"
                      onChange={(sec) => work.setStop(i, { dwellMs: Math.round(sec * 1000) })}
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
                      className="w-14"
                      onChange={(sec) => work.setStop(i, { travelMs: Math.round(sec * 1000) })}
                    />
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() => {
                        work.removeStop(i);
                        setOpenStop(-1);
                      }}
                      disabled={!editable || tour.stops.length <= 1}
                      aria-label={`הסרת ${work.nameOf(s.viewpointId)} מהסיור`}
                      title="הסרה מהסיור"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-pill text-muted transition-colors hover:bg-alert-tint hover:text-alert disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
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
          <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2} />} onClick={() => work.addStop(picked)} disabled={tour.stops.length >= MAX_TOUR_STOPS}>
            עצירה
          </Button>
        </div>
      )}
      <SwitchRow checked={tour.loop} onChange={(loop) => work.setTour({ ...tour, loop })} label="חזרה בלולאה" disabled={!editable} />
    </div>
  );
}

/** The tour in a few words: "5 עצירות · 27.5 ש׳ · בלולאה". */
export function tourSummary(tour: Tour): string {
  if (!tour.stops.length) return "אין עצירות";
  const total = tour.stops.reduce((n, s) => n + s.dwellMs + s.travelMs, 0);
  return `${tour.stops.length} ${tour.stops.length === 1 ? "עצירה" : "עצירות"} · ${seconds(total)} ש׳${tour.loop ? " · בלולאה" : ""}`;
}
