"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, ArrowLeft, Info, Ruler } from "lucide-react";
import type { Hall } from "@/lib/studio/hall";
import type { SketchRef } from "@/lib/design-document/types";
import { NumberField } from "@/components/number-field";
import { fieldLabelClassName } from "@/components/control";
import { Button } from "@/components/button";
import { PlanPreview } from "@/components/plan-preview";

// F-3.2 per-event sketch import: upload the iPlan PDF, align it manually (drag/scale) over the
// hall shell, calibrate once for a new hall (F-3.4). No auto-detection (phase 2/3 — F-9.4).
// Tables are then placed fast and manually in the studio (F-3.3). Small events skip the PDF.
// ponytail: the "PDF" is a named placeholder frame until file storage exists — alignment and
// calibration are real and persist on the design document.
export interface ImportResult {
  sketch: SketchRef | null;
  mmPerUnit?: number; // present only when this import calibrated a new hall
}

const REF_DRAWN_MM = 1800; // the marked segment's length as drawn (document units)

export function ImportFlow({
  hall,
  hasCalibration,
  onDone,
  onCancel,
}: {
  hall: Hall;
  hasCalibration: boolean; // known hall → skip calibration (it lives on the template)
  onDone: (r: ImportResult) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"upload" | "align" | "calibrate">("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  // Sketch placement in document units (mm). Starts covering the hall.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [refCm, setRefCm] = useState(180);

  const sketch = (): SketchRef | null =>
    fileName
      ? { fileName, x: pos.x, y: pos.y, widthMm: hall.widthMm * scale, heightMm: hall.heightMm * scale }
      : null;

  const finishAlign = () => {
    if (hasCalibration) onDone({ sketch: sketch() });
    else setStep("calibrate");
  };

  return (
    <div>
      {step === "upload" && (
        <UploadStep
          onFile={(f) => {
            if (!f) return;
            setFileName(f.name);
            setStep("align");
          }}
          onSkip={() => onDone({ sketch: null })}
          onCancel={onCancel}
        />
      )}

      {step === "align" && fileName && (
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-start gap-2 rounded-md bg-accent-tint/50 p-3 text-xs leading-relaxed text-ink-soft">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
            <span>גררו את מסגרת הסקיצה כך שתתיישב על שלד האולם, וכוונו את הגודל במחוון. הדיוק המלא נעשה רגע אחר כך, כשמניחים את השולחנות מעל הרקע.</span>
          </div>

          <AlignStage hall={hall} fileName={fileName} pos={pos} scale={scale} onMove={setPos} />

          <div className="mt-4 flex items-center gap-3">
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

          <div className="mt-6 flex items-center justify-between">
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

// The hall shell with a draggable "sketch" frame over it. Pointer drag moves it; px↔mm via
// the rendered width of the shell.
function AlignStage({
  hall,
  fileName,
  pos,
  scale,
  onMove,
}: {
  hall: Hall;
  fileName: string;
  pos: { x: number; y: number };
  scale: number;
  onMove: (p: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const pxPerMm = () => (ref.current ? ref.current.clientWidth / (hall.widthMm * 1.09) : 0.01); // 1.09 ≈ PlanPreview padding

  return (
    <div ref={ref} className="relative overflow-hidden rounded-lg border border-border bg-canvas p-2">
      <PlanPreview hall={hall} tables={[]} />
      <div
        role="slider"
        aria-label="מיקום הסקיצה על השלד — גרירה להזזה"
        aria-valuetext={`x ${Math.round(pos.x)} מ״מ, y ${Math.round(pos.y)} מ״מ`}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = pxPerMm();
          onMove({
            x: drag.current.origX + (e.clientX - drag.current.startX) / k,
            y: drag.current.origY + (e.clientY - drag.current.startY) / k,
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1000 : 250;
          if (e.key === "ArrowLeft") onMove({ x: pos.x - step, y: pos.y });
          else if (e.key === "ArrowRight") onMove({ x: pos.x + step, y: pos.y });
          else if (e.key === "ArrowUp") onMove({ x: pos.x, y: pos.y - step });
          else if (e.key === "ArrowDown") onMove({ x: pos.x, y: pos.y + step });
          else return;
          e.preventDefault();
        }}
        className="absolute cursor-move touch-none rounded-md border-2 border-dashed border-accent bg-accent-tint/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        style={{
          left: `${((pos.x + hall.widthMm * 0.045) * pxPerMm())}px`,
          top: `${((pos.y + hall.heightMm * 0.045) * pxPerMm())}px`,
          width: `${hall.widthMm * scale * pxPerMm()}px`,
          height: `${hall.heightMm * scale * pxPerMm()}px`,
        }}
      >
        <span className="absolute inset-x-0 bottom-1.5 truncate px-2 text-center text-xs text-ink-soft">{fileName}</span>
      </div>
    </div>
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

// F-3.4 one-time calibration for a new hall: a known-length segment derives mm-per-unit for
// the whole map, and is saved back to the hall template by the caller.
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
          <h3 className="font-semibold text-ink">כיול קנה מידה — פעם אחת לאולם חדש</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            סמנו קטע שאורכו ידוע — קוטר שולחן עגול הוא הנוח ביותר. מהמידה האמיתית נגזר מ״מ־ליחידה
            לכל המפה, והכיול נשמר לאולם.
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
