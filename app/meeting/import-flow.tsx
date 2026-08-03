"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, ArrowLeft, Info, Ruler } from "lucide-react";
import type { EventPlan } from "@/lib/events/plan";
import type { Point } from "@/lib/studio/hall";
import type { SketchRef } from "@/lib/design-document/types";
import { NumberField } from "@/components/number-field";
import { fieldLabelClassName } from "@/components/control";
import { Button } from "@/components/button";
import { ShapeCanvas, type CanvasLayerContext } from "@/components/shape-canvas";
import { ZoneRegions, StructureFeatures, StructureDoors } from "@/components/venue-plan";

// F-3.2 per-event sketch import: upload the iPlan PDF, align it manually (drag/scale) over the
// venue plan, calibrate once for a property that has never been measured (F-3.4). No auto-detection
// (phase 2/3 — F-9.4). Tables are then placed fast and manually in the studio (F-3.3). Small events
// skip the PDF.
//
// The alignment happens on the same canvas as everything else on a plan — pan, zoom and fit are the
// gestures the designer already knows, and the view opens framed on the event's zones without the
// rest of the property being hidden or unreachable. It used to be a static thumbnail with a <div>
// dragged over it, which could neither zoom nor show a neighbouring room.
//
// ponytail: the "PDF" is a named placeholder frame until file storage exists — alignment and
// calibration are real and persist on the design document.
export interface ImportResult {
  sketch: SketchRef | null;
  mmPerUnit?: number; // present only when this import measured the venue for the first time
}

const REF_DRAWN_MM = 1800; // the marked segment's length as drawn (document units)

export function ImportFlow({
  plan,
  hasCalibration,
  onDone,
  onCancel,
}: {
  plan: EventPlan;
  hasCalibration: boolean; // the venue plan is already measured → skip calibration (F-3.4)
  onDone: (r: ImportResult) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"upload" | "align" | "calibrate">("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  // Sketch placement, in venue millimetres.
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [refCm, setRefCm] = useState(180);

  const box = plan.bounds;
  // The frame starts the size of what it has to cover. A venue with nothing drawn yet has no box at
  // all, and a zero-sized sketch is one you can neither see nor grab — fall back to a room-sized
  // rectangle so the step still works while the plan is being figured out.
  const baseW = box.widthMm || 20000;
  const baseH = box.heightMm || 13000;
  const size = { widthMm: baseW * scale, heightMm: baseH * scale };
  const sketch = (): SketchRef | null => (fileName ? { fileName, x: pos.x, y: pos.y, ...size } : null);

  const finishAlign = () => {
    if (hasCalibration) onDone({ sketch: sketch() });
    else setStep("calibrate");
  };

  return (
    <div className="flex h-full flex-col">
      {step === "upload" && (
        <UploadStep
          onFile={(f) => {
            if (!f) return;
            setFileName(f.name);
            // Land the frame on the zones being designed rather than at the plane's origin, which
            // on a real site plan can be a hundred metres away from the room in question.
            setPos({ x: box.minX, y: box.minY });
            setStep("align");
          }}
          onSkip={() => onDone({ sketch: null })}
          onCancel={onCancel}
        />
      )}

      {step === "align" && fileName && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex items-start gap-2 rounded-md bg-accent-tint/50 p-3 text-xs leading-relaxed text-ink-soft">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
            <span>גררו את מסגרת הסקיצה כך שתתיישב על אזורי האירוע, וכוונו את הגודל במחוון. אפשר להתקרב ולהתרחק כמו בכל תוכנית. הדיוק המלא נעשה רגע אחר כך, כשמניחים את השולחנות מעל הרקע.</span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-canvas">
            <AlignStage plan={plan} fileName={fileName} pos={pos} size={size} onMove={setPos} />
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="sketch-scale" className="text-sm text-ink-soft">גודל הסקיצה</label>
            <input
              id="sketch-scale"
              type="range"
              min={0.4}
              max={1.8}
              step={0.02}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="max-w-56 flex-1 accent-[var(--color-accent)]"
            />
            <span className="nums w-12 text-sm text-muted">{Math.round(scale * 100)}%</span>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("upload")}>חזרה</Button>
            <Button onClick={finishAlign} className="py-2.5">
              {hasCalibration ? "סיום — להנחת השולחנות" : "המשך לכיול"}
              <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      )}

      {step === "calibrate" && (
        <CalibrateStep
          refCm={refCm}
          onRefCm={setRefCm}
          onBack={() => setStep("align")}
          onDone={() => onDone({ sketch: sketch(), mmPerUnit: (refCm * 10) / REF_DRAWN_MM || 1 })}
        />
      )}
    </div>
  );
}

// The venue plan with a draggable "sketch" frame over it, on the shared canvas: the whole property
// is drawn and reachable, the event's zones are tinted and framed, and the sketch is one more thing
// in the same world-space. No px↔mm arithmetic of its own — the canvas hands every layer the same
// pointer→world conversion its own handles use.
function AlignStage({
  plan,
  fileName,
  pos,
  size,
  onMove,
}: {
  plan: EventPlan;
  fileName: string;
  pos: Point;
  size: { widthMm: number; heightMm: number };
  onMove: (p: Point) => void;
}) {
  const selectedZoneIds = plan.zones.map((r) => r.zone.id);
  // Frame the event's zones once, when this step opens. `nonce` never changes after that, so the
  // designer's own panning is never yanked back mid-alignment.
  const focus = useRef({ ...plan.bounds, nonce: 1 }).current;

  return (
    <ShapeCanvas
      mode="edit"
      outline={[]}
      edgeCurves={[]}
      selected={[]}
      onSelect={() => {}}
      onAddVertex={() => {}}
      onCloseOutline={() => {}}
      onMoveVertex={() => {}}
      onMoveWallHandle={() => {}}
      graph={plan.structure}
      focus={focus}
      backdrop={({ mm }) => (
        <>
          <ZoneRegions zones={plan.all} selectedIds={selectedZoneIds} mm={mm} />
          <StructureFeatures structure={plan.structure} mm={mm} />
        </>
      )}
      overlay={(ctx) => (
        <>
          <StructureDoors structure={plan.structure} />
          <SketchFrame fileName={fileName} pos={pos} size={size} onMove={onMove} ctx={ctx} />
        </>
      )}
    />
  );
}

/** The sketch, as a world-space rectangle you drag onto the plan. Keyboard-movable too: the whole
 *  step is unusable by keyboard otherwise, and a nudge is often what the last 20cm needs. */
function SketchFrame({
  fileName,
  pos,
  size,
  onMove,
  ctx,
}: {
  fileName: string;
  pos: Point;
  size: { widthMm: number; heightMm: number };
  onMove: (p: Point) => void;
  ctx: CanvasLayerContext;
}) {
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  return (
    <g
      role="slider"
      aria-label="מיקום הסקיצה על התוכנית — גרירה להזזה"
      aria-valuetext={`x ${Math.round(pos.x)} מ״מ, y ${Math.round(pos.y)} מ״מ`}
      tabIndex={0}
      className="cursor-move touch-none focus:outline-none"
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const at = ctx.clientToMm(e.clientX, e.clientY);
        // Remember where inside the frame it was grabbed, so it doesn't jump its corner to the cursor.
        grab.current = { dx: at.x - pos.x, dy: at.y - pos.y };
      }}
      onPointerMove={(e) => {
        if (!grab.current || e.buttons !== 1) return;
        const at = ctx.clientToMm(e.clientX, e.clientY);
        onMove({ x: at.x - grab.current.dx, y: at.y - grab.current.dy });
      }}
      onPointerUp={(e) => {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        grab.current = null;
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 1000 : 250;
        // RTL: → moves the sketch towards the start edge, matching how the plan reads.
        if (e.key === "ArrowLeft") onMove({ x: pos.x - step, y: pos.y });
        else if (e.key === "ArrowRight") onMove({ x: pos.x + step, y: pos.y });
        else if (e.key === "ArrowUp") onMove({ x: pos.x, y: pos.y - step });
        else if (e.key === "ArrowDown") onMove({ x: pos.x, y: pos.y + step });
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <rect
        x={pos.x}
        y={pos.y}
        width={size.widthMm}
        height={size.heightMm}
        fill="var(--color-accent-tint)"
        fillOpacity={0.35}
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeDasharray="8 5"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={pos.x + size.widthMm / 2}
        y={pos.y + size.heightMm - ctx.mm(10)}
        textAnchor="middle"
        fill="var(--color-ink-soft)"
        style={{ fontSize: ctx.mm(12) }}
        className="pointer-events-none"
      >
        {fileName}
      </text>
    </g>
  );
}

function UploadStep({ onFile, onSkip, onCancel }: { onFile: (f: File | undefined) => void; onSkip: () => void; onCancel: () => void }) {
  const [over, setOver] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors " +
          (over ? "border-accent bg-accent-tint/40" : "border-border bg-surface hover:border-ink-soft")
        }
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint text-accent">
          <UploadCloud className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <span className="font-semibold text-ink">גררו לכאן את סקיצת ה-iPlan של האירוע</span>
        <span className="text-sm text-muted">או לחצו לבחירת קובץ PDF מהמחשב</span>
        <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel}>ביטול</Button>
        <button type="button" onClick={onSkip} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover">
          <FileText className="h-4 w-4" strokeWidth={2} />
          אירוע קטן? דילוג על ה-PDF והנחה ישירה על השלד
        </button>
      </div>
    </div>
  );
}

// F-3.4 one-time calibration for a venue that has never been measured: a known-length segment
// derives mm-per-unit for the whole plane, and the caller saves it onto the VENUE plan — scale is a
// property of the property, so every zone on it stays honest to every other, and no later event at
// the same place is asked again.
function CalibrateStep({
  refCm,
  onRefCm,
  onBack,
  onDone,
}: {
  refCm: number;
  onRefCm: (v: number) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const mmPerUnit = (refCm * 10) / REF_DRAWN_MM || 1;
  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-canvas text-accent">
          <Ruler className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h3 className="font-semibold text-ink">כיול קנה מידה — פעם אחת למתחם חדש</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            סמנו קטע שאורכו ידוע — קוטר שולחן עגול הוא הנוח ביותר. מהמידה האמיתית נגזר מ״מ־ליחידה
            לכל תוכנית המתחם, והכיול נשמר למתחם — כל אירוע הבא כאן כבר לא יישאל.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-end gap-3">
        <div>
          <span className={fieldLabelClassName}>האורך במציאות</span>
          <div className="flex items-center gap-2">
            <NumberField min={0} value={refCm} onChange={onRefCm} className="w-32" />
            <span className="text-sm text-muted">ס״מ</span>
          </div>
        </div>
      </div>

      <p className="nums mt-4 rounded-md border border-border bg-surface px-4 py-3 text-sm text-ink-soft">
        קנה מידה: <span className="font-semibold text-ink">{mmPerUnit.toFixed(3)}</span> מ״מ לכל יחידת שרטוט
      </p>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>חזרה</Button>
        <Button onClick={onDone} className="py-2.5">
          סיום — להנחת השולחנות
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  );
}
