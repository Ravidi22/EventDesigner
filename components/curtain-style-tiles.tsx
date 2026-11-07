"use client";
// How a curtain's cloth is gathered — SYMBOL_STYLES.curtain ("סוג הווילון", spec 2026-11-07 §6.5) —
// as tiles, each drawing a stretch of that style's pleats in the curtain's own colour, so the designer
// picks by looking. Shared by the catalog's appearance editor (a hired curtain's row) and /halls'
// "קטע" panel (the venue's own curtain). The first tile is what every curtain always drew, and
// picking it stores no style at all. Drawing and 3D only: the quote bills the rail's length whatever
// the style.
import { SYMBOL_STYLES, type CurtainStyle } from "@/lib/catalog/symbols";
import { isDark } from "@/lib/element-style";
import { pleatsAlongD } from "@/components/curtain-cloth";

const SAMPLE_MM = 2400;
const DEPTH_MM = 320;

export function CurtainStyleTiles({ value, tone, onPick, labelClassName }: { value?: CurtainStyle; tone?: string; onPick: (style: CurtainStyle | undefined) => void; labelClassName?: string }) {
  const set = SYMBOL_STYLES.curtain;
  if (!set) return null;
  const chosen = value ?? (set.styles[0] as CurtainStyle);
  const fill = tone ?? "#efe9df";
  const ink = isDark(fill) ? "#ffffff" : "var(--color-ink)";
  return (
    <div>
      <span className={labelClassName ?? "mb-1 block text-xs font-medium text-ink-soft"}>{set.title}</span>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={set.title}>
        {(set.styles as readonly CurtainStyle[]).map((st, i) => {
          const on = chosen === st;
          return (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={on}
              title={set.hint?.[st] ?? set.label[st]}
              onClick={() => onPick(i === 0 ? undefined : st)}
              className={
                "flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " +
                (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")
              }
            >
              <svg viewBox={`${-SAMPLE_MM / 2 - 60} ${-DEPTH_MM} ${SAMPLE_MM + 120} ${DEPTH_MM * 2}`} className="h-8 w-full" aria-hidden>
                <rect x={-SAMPLE_MM / 2} y={-DEPTH_MM / 2} width={SAMPLE_MM} height={DEPTH_MM} fill={fill} />
                <path
                  d={pleatsAlongD([{ x: -SAMPLE_MM / 2, y: 0 }, { x: SAMPLE_MM / 2, y: 0 }], DEPTH_MM, st)}
                  fill="none"
                  stroke={ink}
                  strokeOpacity={0.55}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{set.label[st]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
