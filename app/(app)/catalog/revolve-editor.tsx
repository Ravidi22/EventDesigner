"use client";
// A ROUND SHAPE'S BODY — the "גוף" panel of the shape editor's bar (the element model, docs/
// superpowers/specs/2026-11-07-element-model-design.md Stage 2 `revolve`): a cylinder, or a body
// turned from a side profile — the presets as tiles, then the profile itself, dragged point by point.
// The profile is fractions of the shape's radius and height (lib/element/revolve.ts), so the tiles
// and the editor draw a unit body and the shape's own numbers scale it.
//
// The editor shows the whole silhouette about its axis and puts the handles on the right half: a
// handle drags (startPointerGesture — every drag in this app), a click on the outline adds a point
// there, a double-click on a handle takes it out. The first and last points slide only sideways —
// the foot stays at the foot and the top at the top; the shape's height field says how high that is.
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { RevolvePoint } from "@/lib/catalog/types";
import { REVOLVE_FORMS, REVOLVE_LABEL, REVOLVE_PRESETS, addedPoint, cleanRevolve, movedPoint, removedPoint, revolveSilhouette } from "@/lib/element/revolve";
import { startPointerGesture } from "@/lib/studio/gesture";
import { Note } from "@/components/inspector-bar";
import { Button } from "@/components/button";

const fieldLabelClassName = "mb-1 block text-xs font-medium text-muted";

/** A unit body's silhouette as an SVG path in a box `w` × `h` with `pad` round it: the axis at the
 *  middle, the foot at the bottom. */
function silhouettePath(points: readonly RevolvePoint[], w: number, h: number, pad: number): string {
  const R = (w - 2 * pad) / 2;
  const H = h - 2 * pad;
  const cx = w / 2;
  return (
    revolveSilhouette(points, cx, R, 0, H)
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${(h - pad - p.y).toFixed(1)}`)
      .join(" ") + " Z"
  );
}

/** A cylinder's silhouette — the "no profile" tile. */
const CYLINDER: RevolvePoint[] = [
  { r: 1, z: 0 },
  { r: 1, z: 1 },
];

const EW = 256;
const EH = 150;
const EPAD = 14;

/** A set of profile tiles other than the vessels' — a chandelier's silhouettes. */
export interface RevolveTiles {
  title: string;
  /** The "no profile" tile's name — what the item is without one — and its picture (absent = a
   *  cylinder). */
  none: string;
  nonePoints?: RevolvePoint[];
  forms: { key: string; label: string; points: RevolvePoint[] }[];
  note: string;
}

export function RevolveFields({
  value,
  onChange,
  tiles,
  onEditInView,
}: {
  value: RevolvePoint[] | undefined;
  onChange: (revolve: RevolvePoint[] | undefined) => void;
  tiles?: RevolveTiles;
  /** When given, the profile is dragged at full size on the editor's חזית view: the small point
   *  editor gives way to a button that goes there. The preset tiles stay. */
  onEditInView?: () => void;
}) {
  const forms = tiles?.forms ?? REVOLVE_FORMS.map((f) => ({ key: f, label: REVOLVE_LABEL[f], points: REVOLVE_PRESETS[f] }));
  const same = (a: readonly RevolvePoint[], b: readonly RevolvePoint[]) => a.length === b.length && a.every((q, i) => Math.abs(q.r - b[i].r) < 1e-6 && Math.abs(q.z - b[i].z) < 1e-6);
  const form = value ? (forms.find((f) => same(f.points, value))?.key ?? null) : null;
  const formLabel = forms.find((f) => f.key === form)?.label;
  const svg = useRef<SVGSVGElement>(null);
  const points = value ? cleanRevolve(value) : null;

  /** A pointer position as (r, z) fractions — r off the axis either way, so a drag that crosses to
   *  the left still reads a radius. */
  const at = (e: { clientX: number; clientY: number }) => {
    const el = svg.current;
    if (!el) return { r: 1, z: 0.5 };
    const box = el.getBoundingClientRect();
    const sx = EW / box.width;
    const sy = EH / box.height;
    const px = (e.clientX - box.left) * sx;
    const py = (e.clientY - box.top) * sy;
    const R = (EW - 2 * EPAD) / 2;
    const H = EH - 2 * EPAD;
    return { r: Math.abs(px - EW / 2) / R, z: (EH - EPAD - py) / H };
  };
  const drag = (e: ReactPointerEvent<SVGElement>, i: number) => {
    if (e.button !== 0 || !points) return;
    e.preventDefault();
    e.stopPropagation();
    const from = points;
    startPointerGesture(e, {
      onMove: (m) => {
        const q = at(m);
        onChange(movedPoint(from, i, q.r, q.z));
      },
    });
  };
  const add = (e: { clientX: number; clientY: number }) => {
    if (!points) return;
    const q = at(e);
    onChange(addedPoint(points, q.r, q.z));
  };

  const R = (EW - 2 * EPAD) / 2;
  const H = EH - 2 * EPAD;
  return (
    <div className="space-y-3">
      <div>
        <span className={fieldLabelClassName}>{tiles?.title ?? "צורת הגוף"}</span>
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={tiles?.title ?? "צורת הגוף"}>
          {[null, ...forms].map((f) => {
            const on = f === null ? !value : form === f.key;
            const pts = f === null ? (tiles?.nonePoints ?? CYLINDER) : f.points;
            return (
              <button
                key={f?.key ?? "__none"}
                type="button"
                role="radio"
                aria-checked={on}
                title={f?.label ?? tiles?.none ?? "גליל"}
                onClick={() => onChange(f === null ? undefined : f.points.map((p) => ({ ...p })))}
                className={"flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " + (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")}
              >
                <svg viewBox="0 0 40 40" className="h-10 w-full" aria-hidden>
                  <path d={silhouettePath(pts, 40, 40, 5)} className={on ? "fill-accent/20 stroke-accent" : "fill-surface stroke-ink-soft"} strokeWidth={1.2} strokeLinejoin="round" />
                </svg>
                <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{f === null ? (tiles?.none ?? "גליל") : f.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {points && onEditInView && (
        <div className="space-y-1.5">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={onEditInView}>
            עריכת הגוף בחזית
          </Button>
          <Note>גררו את הנקודות על הצללית בחזית; לחיצה על הקו מוסיפה נקודה, לחיצה כפולה על נקודה מוחקת.</Note>
        </div>
      )}
      {points && !onEditInView && (
        <div>
          <span className={fieldLabelClassName}>{formLabel ? `${formLabel} — אפשר לגרור את הנקודות` : "פרופיל מותאם"}</span>
          <svg ref={svg} viewBox={`0 0 ${EW} ${EH}`} width={EW} height={EH} className="block touch-none rounded-sm bg-inset" aria-label="פרופיל הגוף">
            <line x1={EW / 2} x2={EW / 2} y1={EPAD / 2} y2={EH - EPAD / 2} className="stroke-border" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={EPAD / 2} x2={EW - EPAD / 2} y1={EH - EPAD + 0.5} y2={EH - EPAD + 0.5} className="stroke-border" strokeWidth={1} />
            {/* The body; a click on its outline adds a point where it lands. */}
            <path d={silhouettePath(points, EW, EH, EPAD)} className="fill-accent-tint stroke-accent" strokeWidth={1.5} strokeLinejoin="round" onClick={add} style={{ cursor: "copy" }} />
            {points.map((p, i) => {
              const x = EW / 2 + p.r * R;
              const y = EH - EPAD - p.z * H;
              const end = i === 0 || i === points.length - 1;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={5}
                  className="fill-surface stroke-accent hover:fill-accent-wash"
                  strokeWidth={1.5}
                  style={{ cursor: end ? "ew-resize" : "move" }}
                  onPointerDown={(e) => drag(e, i)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    if (!end) onChange(removedPoint(points, i));
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              );
            })}
          </svg>
          <Note>{tiles?.note ?? "הקוטר על התוכנית הוא הנקודה הרחבה ביותר; הגובה — שדה הגובה של הצורה."} לחיצה על הקו מוסיפה נקודה, לחיצה כפולה על נקודה מוחקת.</Note>
        </div>
      )}
    </div>
  );
}
