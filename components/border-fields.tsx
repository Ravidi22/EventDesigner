"use client";

// A CONTOUR's fields (lib/catalog/border.ts) — the band's width and colour, a second band inside a
// gap, the fringe and its colour — one set for the appearance editor (the catalog row's contour) and
// the studio's rug and cloth panels (this plan's). `BorderPanel` is the studio's: the same fields
// over whichever contour is in force, and the two ways back — "כמו בקטלוג" (the row's again) and
// "ללא קונטור" (none on this plan, the vessel's null).
import { RotateCcw, Trash2 } from "lucide-react";
import { fringeOf, newBorder, newInner, type Border } from "@/lib/catalog/border";
import { Button } from "./button";
import { Note, PanelRow } from "./inspector-bar";
import { NumberField } from "./number-field";
import { Swatch, SwatchField } from "./swatch-field";
import { SwitchRow } from "./toggle";

/** A colour that is never "none": SwatchField's swatch-as-button, without its clear. */
function ColourSwatch({ value, onChange, label }: { value: string; onChange: (colour: string) => void; label: string }) {
  return (
    <label
      className="relative inline-flex shrink-0 cursor-pointer rounded-md border border-border p-1 transition-colors hover:border-accent-line focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint"
      title={label}
    >
      <Swatch color={value} size={20} />
      <input
        type="color"
        // A named or token colour cannot seed the native picker; it opens on black and the pick replaces it.
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

/** Centimetres in the fields, millimetres in the store — a contour is measured like everything else. */
const toCm = (mm: number) => Math.round(mm) / 10;
const toMm = (cm: number) => Math.round(Math.max(0, cm) * 10);

/** The fields of one contour. Every change hands back the whole contour, so a caller writes it in
 *  one entry. `category` decides the fringe's default (a rug has one, a cloth does not). */
export function BorderFields({ border, category, onChange, idPrefix }: { border: Border; category: string; onChange: (border: Border) => void; idPrefix: string }) {
  const fringe = fringeOf(border, category);
  const set = (patch: Partial<Border>) => onChange({ ...border, ...patch });
  const withoutInner = (): Border => {
    const { inner: _inner, ...rest } = border;
    void _inner;
    return rest;
  };
  return (
    <div>
      <PanelRow label="רוחב (ס״מ)" htmlFor={`${idPrefix}-width`}>
        <NumberField id={`${idPrefix}-width`} decimals={1} min={0} max={300} step={0.5} value={toCm(border.widthMm)} onChange={(v) => set({ widthMm: toMm(v) })} className="w-20" />
      </PanelRow>
      <PanelRow label="צבע">
        <ColourSwatch value={border.colour} onChange={(colour) => set({ colour })} label="צבע הקונטור" />
      </PanelRow>
      <div className="mt-2 space-y-2">
        <SwitchRow
          checked={!!border.inner}
          onChange={(on) => onChange(on ? { ...border, inner: newInner(border) } : withoutInner())}
          label="קונטור כפול"
          hint="פס שני בתוך הראשון, במרווח ממנו."
        />
        {border.inner && (
          <div>
            <PanelRow label="רוחב הפס הפנימי (ס״מ)" htmlFor={`${idPrefix}-inner`}>
              <NumberField
                id={`${idPrefix}-inner`}
                decimals={1}
                min={0.5}
                max={300}
                step={0.5}
                value={toCm(border.inner.widthMm)}
                onChange={(v) => set({ inner: { ...border.inner!, widthMm: Math.max(5, toMm(v)) } })}
                className="w-20"
              />
            </PanelRow>
            <PanelRow label="מרווח (ס״מ)" htmlFor={`${idPrefix}-gap`}>
              <NumberField
                id={`${idPrefix}-gap`}
                decimals={1}
                min={0}
                max={300}
                step={0.5}
                value={toCm(border.inner.gapMm)}
                onChange={(v) => set({ inner: { ...border.inner!, gapMm: toMm(v) } })}
                className="w-20"
              />
            </PanelRow>
            <PanelRow label="צבע הפס הפנימי">
              <ColourSwatch value={border.inner.colour} onChange={(colour) => set({ inner: { ...border.inner!, colour } })} label="צבע הפס הפנימי" />
            </PanelRow>
          </div>
        )}
        <SwitchRow
          checked={fringe.on}
          onChange={(on) => set({ fringe: on })}
          label="פרנזים"
          hint={category === "rugs" ? "בשני הקצוות הקצרים של השטיח." : "סביב שולי המפה."}
        />
        {fringe.on && (
          <PanelRow label="צבע הפרנזים">
            <SwatchField
              value={border.fringeColour}
              onChange={(c) => {
                if (c) set({ fringeColour: c });
                else {
                  const { fringeColour: _f, ...rest } = border;
                  void _f;
                  onChange(rest);
                }
              }}
              label="צבע הפרנזים"
            />
          </PanelRow>
        )}
        {fringe.on && !border.fringeColour && <Note>בלי צבע משלהם — בצבע הקונטור.</Note>}
      </div>
    </div>
  );
}

/** The studio's contour panel for one placement (or a block's cloths): the contour in force — this
 *  plan's own, else its row's — its fields (any change makes it this plan's own), and the way back to
 *  the row's or to none here. `own` is Placement.border, `row` the catalog row's (cleaned). */
export function BorderPanel({
  own,
  row,
  category,
  onBorder,
  idPrefix,
}: {
  own: Border | null | undefined;
  row: Border | undefined;
  category: string;
  onBorder: (border: Border | null | undefined) => void;
  idPrefix: string;
}) {
  const current = own === null ? undefined : (own ?? row);
  const status =
    own === undefined ? (row ? "כמו בקטלוג." : "בקטלוג אין לו קונטור.") : own === null ? "ללא קונטור בתוכנית הזו." : "קונטור משלו בתוכנית הזו.";
  return (
    <div>
      <Note>{status}</Note>
      {current ? (
        <div className="mt-2">
          <BorderFields border={current} category={category} onChange={(b) => onBorder(b)} idPrefix={idPrefix} />
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onBorder(newBorder(category))}>
          הוספת קונטור
        </Button>
      )}
      {(own !== undefined || current) && (
        <div className="mt-3 flex gap-2">
          {own !== undefined && (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onBorder(undefined)}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
              כמו בקטלוג
            </Button>
          )}
          {current && (
            <Button size="sm" variant="danger" className="flex-1" onClick={() => onBorder(null)}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              ללא קונטור
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
