// THE חזית VIEW — the item's shapes seen from the front, each a box from its bottom to its top
// (the element model, docs/superpowers/specs/2026-11-07-element-model-design.md Stage 2): what a
// height typed on a shape does, shown while it is typed. The first shape stands on the floor as tall
// as the item; every other stands where its own z and height say, else as the first does. A round
// shape with a side profile (ShapePart.revolve) is drawn as its silhouette — the bowl, not its box.
// Looking along the plan's +y, so the plan's x is across and up is up.
//
// No "use client": a pure function of its props.
import type { ShapePart } from "@/lib/catalog/types";
import { revolveSilhouette } from "@/lib/element/revolve";
import { placedPartOutline, sampledBounds } from "@/lib/studio/footprint";

const W = 256;
const H = 120;
const PAD = 10;
/** Room after the widest shape for the selected one's top figure — a full-width item put it off the
 *  edge of the view (2026-11-09, in the editor's side panel). */
const PAD_END = 26;

export function ElevationView({ shapes, itemHeightMm, selectedId }: { shapes: readonly ShapePart[]; itemHeightMm: number; selectedId?: string }) {
  const boxes = shapes.map((s, i) => {
    const b = sampledBounds([placedPartOutline(s)]);
    const z = i === 0 ? 0 : (s.zMm ?? 0);
    const h = Math.max(10, i === 0 ? itemHeightMm : (s.heightMm ?? itemHeightMm));
    const round = (s.shape === "circle" || s.shape === "ellipse") && !s.hollow && s.revolve && s.revolve.length >= 2;
    return { id: s.id, minX: b.minX, maxX: b.maxX, z, h, top: z + h, revolve: round ? s.revolve : undefined, outline: s.body === "none" };
  });
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.minX));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const top = Math.max(...boxes.map((b) => b.top), 100);
  const spanX = Math.max(maxX - minX, 100);
  const k = Math.min((W - PAD - PAD_END) / spanX, (H - 2 * PAD) / top);
  const x = (mm: number) => PAD + (mm - minX) * k + ((W - PAD - PAD_END) - spanX * k) / 2;
  const y = (mm: number) => H - PAD - mm * k;
  // Drawn bottom-up so a raised shelf lies over the counter it stands above; the selected one last.
  const order = [...boxes].sort((a, b) => a.z - b.z || (a.id === selectedId ? 1 : b.id === selectedId ? -1 : 0));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[256px] rounded-sm bg-inset" aria-label="מבט חזית">
      <line x1={PAD / 2} x2={W - PAD / 2} y1={y(0) + 0.5} y2={y(0) + 0.5} className="stroke-border" strokeWidth={1} />
      {order.map((b) => {
        const sel = b.id === selectedId;
        const cls = sel ? "fill-accent-tint stroke-accent" : "fill-surface stroke-quiet";
        return (
          <g key={b.id}>
            {b.revolve ? (
              <polygon
                points={revolveSilhouette(b.revolve, (b.minX + b.maxX) / 2, (b.maxX - b.minX) / 2, b.z, b.h)
                  .map((p) => `${x(p.x)},${y(p.y)}`)
                  .join(" ")}
                className={cls}
                strokeWidth={sel ? 1.5 : 1}
                strokeLinejoin="round"
              />
            ) : (
              // An outline-only shape (ShapePart.body "none") has no body to show: its reach, dashed.
              <rect
                x={x(b.minX)}
                y={y(b.top)}
                width={Math.max(1, (b.maxX - b.minX) * k)}
                height={Math.max(1, b.h * k)}
                className={b.outline ? (sel ? "fill-none stroke-accent" : "fill-none stroke-quiet") : cls}
                strokeWidth={sel ? 1.5 : 1}
                strokeDasharray={b.outline ? "3 2" : undefined}
                rx={1}
              />
            )}
            {sel && (
              <text x={x(b.maxX) + 4} y={y(b.top) + 4} className="fill-accent" fontSize={10} dominantBaseline="hanging" direction="ltr">
                {Math.round(b.top / 10)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
