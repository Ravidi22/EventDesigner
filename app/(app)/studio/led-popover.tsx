"use client";
// A hired LED strip's rail on its bar (spec 2026-11-07 §7.1): where its light runs and how high. On a
// wall: the height above the floor (0 = the floor line, the skirting a new strip starts at), the whole
// wall again, and the wall's other face. On a side: the whole side again and the side of it the light
// is on. On a free run: its height. On any: a run of its own, drawn on the canvas (two clicks). The
// stretch itself is the grips on the plan; the colour is the shade, on the bar's own shade chip.
// `bare` is the fields alone, for the studio's end-panel group ״מסילה״ (components/end-panel.tsx); a
// run of its own is then the quick bar's verb, and the caller passes no `onDrawRun`.
import { Maximize2, Minus, Zap } from "lucide-react";
import type { Rail } from "@/lib/studio/rail";
import { Popover } from "@/components/popover";
import { Note, PanelRow, ltr } from "@/components/inspector-bar";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/button";

const cm = (mm: number) => Math.round(mm / 10);

export function LedRailPopover({
  bare = false,
  rail,
  lengthMm,
  onRail,
  onDrawRun,
}: {
  /** The fields alone, with no popover round them. */
  bare?: boolean;
  rail: Rail;
  /** Along the rail — the arc on a bowed wall. Undefined when what it ran along is gone. */
  lengthMm: number | undefined;
  onRail: (rail: Rail) => void;
  /** Draw it as a free run on the canvas. Absent = a host that only looks, or a pinned strip. */
  onDrawRun?: () => void;
}) {
  const where = rail.type === "wall" ? "על הקיר" : rail.type === "side" ? "על הצד" : "באוויר";
  const whole = (rail.type === "wall" || rail.type === "side") && Math.min(rail.from, rail.to) === 0 && Math.max(rail.from, rail.to) === 1;
  const body = (
    <>
      {rail.type === "wall" && (
        <PanelRow label="גובה מהרצפה (ס״מ)" htmlFor="led-height">
          <NumberField id="led-height" decimals={0} min={0} max={1500} step={5} commitOnBlur value={cm(rail.heightMm ?? 0)} onChange={(v) => onRail({ ...rail, heightMm: Math.max(0, Math.round(v * 10)) })} className="w-20" />
        </PanelRow>
      )}
      {rail.type === "run" && (
        <PanelRow label="גובה (ס״מ)" htmlFor="led-run-height">
          <NumberField id="led-run-height" decimals={0} min={0} max={1500} step={10} commitOnBlur value={cm(rail.heightMm)} onChange={(v) => onRail({ ...rail, heightMm: Math.max(0, Math.round(v * 10)) })} className="w-20" />
        </PanelRow>
      )}
      {(rail.type === "wall" || rail.type === "side") && (
        <div className="flex gap-2 py-1">
          <Button size="sm" variant="outline" className="flex-1" disabled={lengthMm === undefined || whole} onClick={() => onRail({ ...rail, from: 0, to: 1 })}>
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
            {rail.type === "wall" ? "כל הקיר" : "כל הצד"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={lengthMm === undefined}
            onClick={() => onRail(rail.type === "wall" ? { ...rail, side: rail.side === -1 ? 1 : -1 } : { ...rail, out: rail.out === 1 ? -1 : 1 })}
          >
            {rail.type === "wall" ? "לצד השני של הקיר" : rail.out === 1 ? "לצד הפנימי" : "לצד החיצוני"}
          </Button>
        </div>
      )}
      {onDrawRun && (
        <Button size="sm" variant="outline" className="w-full" onClick={onDrawRun}>
          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
          {rail.type === "run" ? "ציור הפס מחדש" : "פס חופשי — ציור על הקנבס"}
        </Button>
      )}
      <Note>
        {rail.type === "wall"
          ? "0 — קו הרצפה. לקיצור — הידיות שבקצוות הפס. הצבע הוא הגוון של הפס."
          : rail.type === "side"
            ? "הפס רץ לאורך שפת האלמנט, בגובה שלו. לקיצור — הידיות שבקצוות."
            : "פס בין שתי נקודות באוויר. גוררים את הקצוות כדי להזיז אותם."}
      </Note>
    </>
  );
  if (bare) return body;
  return (
    <Popover label={`פס לד ${where}`} icon={Zap} value={lengthMm !== undefined ? ltr(`${(lengthMm / 1000).toFixed(2)} מ׳`) : "—"} panelClassName="w-80">
      {body}
    </Popover>
  );
}
