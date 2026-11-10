"use client";
// A SAIL's and a CEILING DRAPE's chip on the item bar (spec 2026-11-07 §6.3/§6.4; lib/studio/
// ceiling-cloth.ts) — what the rail holds, typed: a sail's tie heights and its sag; a run's height,
// width, sag and scallops; a canopy's height, width, spacing, direction and sag — and "ציור מחדש".
// Where each tie IS, where a run ends and the area's corners are, is the grips on the plan.
//
// One Popover (components/popover.tsx brings its own frame): PanelRow per field, a width on every
// NumberField, the actions outline. Every edit is the host's one setPlacementRail. Absent field =
// the default, shown as the placeholder — a blank box says "as the cloth would be". `bare` is the
// fields alone, for the studio's end-panel group ״מסילה״ (components/end-panel.tsx).
import type { Rail, RailSheet, SailRail, CanopyRail, RunRail } from "@/lib/studio/rail";
import { clothRuns, CLOTH_WIDTH_MM, RUN_SAG_MM, sailTieHeight } from "@/lib/studio/ceiling-cloth";
import { Popover } from "@/components/popover";
import { Note, PanelRow, ltr } from "@/components/inspector-bar";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/button";
import { SwitchRow } from "@/components/toggle";
import { LayoutGrid, PenLine, Sailboat, Waves } from "lucide-react";

const cm = (mm: number) => Math.round(mm / 10);

/** A field that is the rail's own when typed and the default when blank (0 = blank). */
function own<T extends object>(rail: T, key: keyof T & string, v: number): T {
  const next = { ...rail } as Record<string, unknown>;
  if (v > 0) next[key] = v;
  else delete next[key];
  return next as T;
}

export function CeilingClothPopover({
  bare = false,
  rail,
  sheet,
  onRail,
  onRedraw,
}: {
  /** The fields alone, with no popover round them. */
  bare?: boolean;
  rail: Rail;
  /** A sail as it hangs (lib/studio/ceiling-cloth.ts sailSheet) — its area and its own posts. */
  sheet?: RailSheet | null;
  onRail: (rail: Rail) => void;
  /** Draw it again on the canvas — a sail tie by tie, a drape as a run or as an area. */
  onRedraw?: (kind: "sail" | "run" | "canopy") => void;
}) {
  if (rail.type === "sail") return <SailPanel bare={bare} rail={rail} sheet={sheet} onRail={onRail} onRedraw={onRedraw} />;
  if (rail.type === "run" || rail.type === "canopy") return <DrapePanel bare={bare} rail={rail} onRail={onRail} onRedraw={onRedraw} />;
  return null;
}

function SailPanel({ bare, rail, sheet, onRail, onRedraw }: { bare: boolean; rail: SailRail; sheet?: RailSheet | null; onRail: (rail: Rail) => void; onRedraw?: (kind: "sail") => void }) {
  const area = sheet ? sheet.areaMm2 / 1e6 : null;
  const body = (
    <>
      {rail.ties.map((t, i) => {
        const what = t.to?.kind === "wall" ? "על קיר" : t.to?.kind === "feature" ? "על פינה" : "עמוד";
        return (
          <PanelRow key={i} label={`קשירה ${i + 1} — ${what} (ס״מ)`} htmlFor={`sail-tie-${i}`}>
            <NumberField id={`sail-tie-${i}`} decimals={0} min={50} max={1500} step={10} commitOnBlur value={cm(t.heightMm)} onChange={(v) => onRail(sailTieHeight(rail, i, v * 10))} className="w-24" />
          </PanelRow>
        );
      })}
      <PanelRow label="שקיעה באמצע (ס״מ)" htmlFor="sail-sag">
        <NumberField
          id="sail-sag"
          decimals={0}
          min={0}
          max={500}
          hideZero
          placeholder={sheet ? `${cm(sheet.sagMm)}` : "אוטו׳"}
          value={rail.sagMm ? cm(rail.sagMm) : 0}
          onChange={(v) => onRail(own(rail, "sagMm", v * 10))}
          className="w-24"
        />
      </PanelRow>
      {onRedraw && (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onRedraw("sail")}>
          <PenLine className="h-3.5 w-3.5" strokeWidth={2} />
          ציור מחדש
        </Button>
      )}
      <Note>
        הגובה של כל קשירה מהרצפה. ריק בשקיעה — 8% מהאלכסון הארוך. גוררים קשירה על התוכנית: ליד קיר או פינה של מבנה היא נקשרת אליהם, אחרת עמוד (Alt — תמיד עמוד). המפרש מתומחר לפי שטחו
        {sheet && sheet.posts.length > 0 ? ` · ${sheet.posts.length} עמודים` : ""}.
      </Note>
    </>
  );
  if (bare) return body;
  return (
    <Popover label="מפרש" icon={Sailboat} value={area !== null ? ltr(`${area.toFixed(1)} מ״ר`) : "—"} panelClassName="w-80">
      {body}
    </Popover>
  );
}

function DrapePanel({ bare, rail, onRail, onRedraw }: { bare: boolean; rail: RunRail | CanopyRail; onRail: (rail: Rail) => void; onRedraw?: (kind: "run" | "canopy") => void }) {
  const runs = clothRuns(rail);
  const lengthMm = runs.reduce((n, r) => n + r.lengthMm, 0);
  const autoWaves = runs[0]?.waves ?? 1;
  const canopy = rail.type === "canopy" ? rail : null;
  const body = (
    <>
      <PanelRow label="גובה (ס״מ)" htmlFor="drape-h">
        <NumberField id="drape-h" decimals={0} min={100} max={1500} step={10} commitOnBlur value={cm(rail.heightMm)} onChange={(v) => onRail({ ...rail, heightMm: v * 10 })} className="w-24" />
      </PanelRow>
      <PanelRow label="רוחב הבד (ס״מ)" htmlFor="drape-w">
        <NumberField id="drape-w" decimals={0} min={10} max={600} hideZero placeholder={`${cm(CLOTH_WIDTH_MM)}`} value={rail.widthMm ? cm(rail.widthMm) : 0} onChange={(v) => onRail(own(rail, "widthMm", v * 10))} className="w-24" />
      </PanelRow>
      {canopy && (
        <>
          <PanelRow label="מרווח בין הרצועות (ס״מ)" htmlFor="drape-gap">
            <NumberField id="drape-gap" decimals={0} min={10} max={1000} commitOnBlur value={cm(canopy.spacingMm)} onChange={(v) => onRail({ ...canopy, spacingMm: Math.max(100, v * 10) })} className="w-24" />
          </PanelRow>
          <PanelRow label="כיוון (°)" htmlFor="drape-dir">
            <NumberField id="drape-dir" decimals={0} min={0} max={179} commitOnBlur value={Math.round(canopy.directionDeg)} onChange={(v) => onRail({ ...canopy, directionDeg: ((v % 180) + 180) % 180 })} className="w-20" />
            <Button size="sm" variant="outline" onClick={() => onRail({ ...canopy, directionDeg: (canopy.directionDeg + 90) % 180 })}>
              90°
            </Button>
          </PanelRow>
        </>
      )}
      <PanelRow label="שקיעה באמצע (ס״מ)" htmlFor="drape-sag">
        <NumberField id="drape-sag" decimals={0} min={0} max={300} hideZero placeholder={`${cm(RUN_SAG_MM)}`} value={rail.sagMm ? cm(rail.sagMm) : 0} onChange={(v) => onRail(own(rail, "sagMm", v * 10))} className="w-24" />
      </PanelRow>
      <PanelRow label={canopy ? "גלים בכל רצועה" : "גלים לאורך"} htmlFor="drape-waves">
        <NumberField id="drape-waves" decimals={0} min={0} max={40} hideZero placeholder={`${autoWaves}`} value={rail.waves ?? 0} onChange={(v) => onRail(own(rail, "waves", v))} className="w-20" />
      </PanelRow>
      {/* Fairy lights woven in (RunRail.lights — the user's photograph of אמרה's dance floor): a
          drawing fact for the plan and the room, never counted. */}
      <SwitchRow
        checked={rail.lights === true}
        onChange={(on) => {
          const { lights: _off, ...rest } = rail;
          void _off;
          onRail(on ? { ...rail, lights: true } : (rest as Rail));
        }}
        label="אורות שזורים בבד"
        hint="נקודות אור קטנות לאורך כל רצועה, על התוכנית ובחדר. ציור בלבד — לא נספר ולא מתומחר."
      />
      {onRedraw && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onRedraw("run")}>
            <PenLine className="h-3.5 w-3.5" strokeWidth={2} />
            {canopy ? "קו אחד" : "ציור מחדש"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onRedraw("canopy")}>
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} />
            {canopy ? "ציור השטח מחדש" : "פריסה על שטח"}
          </Button>
        </div>
      )}
      <Note>
        {canopy
          ? "רצועות מקבילות לכל רוחב השטח, בכיוון ובמרווח שנבחרו — גוררים פינה על התוכנית כדי לשנות את השטח."
          : "בד בין שתי נקודות, נאסף בכל גל ושוקע באמצעו — גוררים את הקצוות על התוכנית."}{" "}
        ריק — ברירת המחדל. מתומחר לפי אורך הבד.
      </Note>
    </>
  );
  if (bare) return body;
  return (
    <Popover
      label={canopy ? "בד תקרה — שטח" : "בד תקרה"}
      icon={canopy ? LayoutGrid : Waves}
      value={ltr(`${canopy ? `${runs.length}× ` : ""}${(lengthMm / 1000).toFixed(1)} מ׳`)}
      panelClassName="w-80"
    >
      {body}
    </Popover>
  );
}
