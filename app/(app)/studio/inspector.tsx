"use client";

import { Minus, Plus, Trash2, Copy, X, TriangleAlert, Layers, Maximize2 } from "lucide-react";
import type { DesignDocumentContent, WallSpan } from "@/lib/design-document/types";
import type { ElementStyle } from "@/lib/element-style";
import type { VenueStructure } from "@/lib/venues/structure";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { StyleFields } from "@/components/style-fields";
import { SwatchPicker } from "@/components/swatch-field";
import { LAYER_LABEL } from "@/lib/catalog/categories";
import { coverOn, resolve, shadesOf, tableUtilization } from "@/lib/studio/catalog-resolver";
import { resolveSpan, WHOLE_WALL } from "@/lib/studio/anchor";
import type { Selection } from "./canvas-stage";

export function Inspector({
  selection,
  doc,
  structure,
  onClose,
  onQuantity,
  onDelete,
  onSmartApply,
  onApplyToAllTables,
  onVariant,
  onSpan,
  onResize,
  onRenumber,
  onStyleTable,
  onDuplicateTable,
  onRemovePlacement,
}: {
  selection: Selection;
  doc: DesignDocumentContent;
  /** The venue's walls — a drape's length is a fact about the wall it hangs on, not about itself. */
  structure: VenueStructure;
  onClose: () => void;
  onQuantity: (id: string, delta: number) => void;
  onDelete: () => void;
  onSmartApply: () => void;
  onApplyToAllTables: (placementId: string) => void;
  onVariant: (id: string, variantId: string) => void;
  onSpan: (id: string, span: WallSpan) => void;
  onResize: (id: string, sizeMm: { widthMm: number; depthMm: number }) => void;
  onRenumber: (id: string, number: number) => void;
  onStyleTable: (id: string, style: ElementStyle | undefined) => void;
  onDuplicateTable: (id: string) => void;
  onRemovePlacement: (id: string) => void;
}) {
  if (!selection) return null;

  if (selection.kind === "placement") {
    const p = doc.placements.find((x) => x.id === selection.id);
    if (!p) return null;
    const r = resolve(p.variantId);
    const table = p.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    const shades = shadesOf(p.variantId);
    const drape = r?.anchor === "wall" ? p.span : undefined;
    const run = drape ? resolveSpan(structure, drape) : null;
    const stretch = r?.sizing === "stretch" && !drape;
    const size = p.sizeMm;

    return (
      <Panel title={r?.product.name ?? "פריט"} onClose={onClose}>
        <dl className="space-y-1.5 text-sm">
          {r?.variant && <Row label="גוון" value={r.variant.name} />}
          <Row label="שכבה" value={LAYER_LABEL[p.layer]} />
          {table && <Row label="שולחן" value={String(table.number)} />}
          {drape && <Row label="אורך על הקיר" value={run ? `${(run.lengthMm / 1000).toFixed(2)} מ׳` : "הקיר נמחק"} />}
        </dl>

        {shades.length > 0 && (
          <ShadeSection value={p.variantId} shades={shades} onChange={(v) => onVariant(p.id, v)} />
        )}

        {/* A drape covers its whole wall by default; this puts it back after it was shortened. */}
        {drape && (
          <Button
            variant="ghost"
            className="mt-3 w-full"
            disabled={!run || (drape.from === 0 && drape.to === 1)}
            onClick={() => onSpan(p.id, { ...drape, ...WHOLE_WALL })}
          >
            <Maximize2 className="h-4 w-4" strokeWidth={2} />
            על כל הקיר
          </Button>
        )}

        {/* A carpet is sized here as well as by its corners — a number is faster when the client
            says "three by two". */}
        {stretch && (
          <div className="mt-3">
            <span className="mb-1.5 block text-xs text-ink-soft">גודל (ס״מ)</span>
            <div className="flex items-center gap-2">
              <NumberField
                aria-label="רוחב"
                decimals={0}
                min={30}
                value={Math.round((size?.widthMm ?? 0) / 10)}
                onChange={(v) => onResize(p.id, { widthMm: v * 10, depthMm: size?.depthMm ?? v * 10 })}
                className="w-20"
              />
              <span className="text-sm text-muted">×</span>
              <NumberField
                aria-label="עומק"
                decimals={0}
                min={30}
                value={Math.round((size?.depthMm ?? 0) / 10)}
                onChange={(v) => onResize(p.id, { widthMm: size?.widthMm ?? v * 10, depthMm: v * 10 })}
                className="w-20"
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-ink-soft">כמות</span>
          <div className="flex items-center gap-2">
            <Stepper aria-label="הפחת" onClick={() => onQuantity(p.id, -1)} disabled={p.quantity <= 1}>
              <Minus className="h-4 w-4" strokeWidth={2} />
            </Stepper>
            <span className="nums w-6 text-center text-sm font-semibold text-ink">{p.quantity}</span>
            <Stepper aria-label="הוסף" onClick={() => onQuantity(p.id, 1)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
            </Stepper>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          {table && (
            <Button variant="ghost" onClick={onSmartApply}>
              <Copy className="h-4 w-4" strokeWidth={2} />
              החל על כל שולחנות {table.type}
            </Button>
          )}
          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            הסר פריט
          </Button>
        </div>
      </Panel>
    );
  }

  const t = doc.tables.find((x) => x.id === selection.id);
  if (!t) return null;
  const util = tableUtilization(doc, t);
  const count = doc.placements.filter((p) => p.layer === "table" && p.tableId === t.id).length;
  const overflow = util > 1;
  // The cloth is the table's surface, so it is edited from the table rather than selected as its
  // own object on the plan — there is nothing to click that isn't the table itself.
  const cloth = coverOn(doc, t.id);
  const clothShades = cloth ? shadesOf(cloth.variantId) : [];
  const clothName = cloth ? resolve(cloth.variantId)?.product.name : undefined;

  return (
    <Panel title={t.number > 0 ? `שולחן ${t.number}` : "שולחן ראש"} onClose={onClose}>
      <dl className="space-y-1.5 text-sm">
        <Row label="סוג" value={t.type} />
        {t.seats != null && <Row label="כסאות" value={String(t.seats)} />}
        <Row label="פריטים" value={String(count)} />
      </dl>

      {cloth && (
        <div className="mt-3 rounded-md border border-border-soft bg-inset p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">{clothName ?? "מפה"}</span>
            <IconButton label="הסרת המפה" onClick={() => onRemovePlacement(cloth.id)}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </IconButton>
          </div>
          {clothShades.length > 0 && (
            <SwatchPicker
              options={clothShades}
              value={cloth.variantId}
              onChange={(v) => onVariant(cloth.id, v)}
              label="גוון המפה"
            />
          )}
          <Button variant="ghost" className="mt-2 w-full" onClick={() => onApplyToAllTables(cloth.id)}>
            <Copy className="h-4 w-4" strokeWidth={2} />
            על כל השולחנות
          </Button>
        </div>
      )}

      {/* F-3.3: auto-running numbering, editable per table */}
      <div className="mt-3 flex items-center justify-between">
        <label htmlFor="table-number" className="text-sm text-ink-soft">מספר שולחן</label>
        <NumberField id="table-number" decimals={0} value={t.number} onChange={(v) => onRenumber(t.id, v)} className="w-16" />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1 text-ink-soft">
            <Layers className="h-3.5 w-3.5" strokeWidth={2} />
            ניצול שטח
          </span>
          <span className={"nums font-semibold " + (overflow ? "text-warn-ink" : "text-ink")}>{Math.round(util * 100)}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="ניצול שטח"
          aria-valuenow={Math.round(util * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className={"h-full rounded-full " + (overflow ? "bg-warn" : "bg-accent")}
            style={{ width: `${Math.min(100, Math.round(util * 100))}%` }}
          />
        </div>
        {overflow && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-warn-ink">
            <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
            הפריטים חורגים משטח השולחן
          </p>
        )}
      </div>

      <div className="mt-3">
        <span className="mb-1.5 block text-xs text-ink-soft">מראה</span>
        <div className="flex flex-wrap items-center gap-2">
          <StyleFields style={t.style} onChange={(style) => onStyleTable(t.id, style)} strokeWidthDefault={2.5} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <Button variant="ghost" onClick={() => onDuplicateTable(t.id)}>
          <Copy className="h-4 w-4" strokeWidth={2} />
          שכפול שולחן
        </Button>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          הסר שולחן
        </Button>
      </div>
    </Panel>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="w-64 rounded-lg border border-border bg-surface p-4 shadow-floating">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
        <IconButton label="סגור" onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </div>
      {children}
    </div>
  );
}

/** The shades this product comes in, as swatches. The chosen one's NAME is spelled out under them:
 *  colour never carries the meaning alone, and two of a designer's creams look identical at 18px. */
function ShadeSection({
  shades,
  value,
  onChange,
}: {
  shades: { id: string; name: string; swatch?: string }[];
  value: string;
  onChange: (variantId: string) => void;
}) {
  return (
    <div className="mt-3">
      <span className="mb-1.5 block text-xs text-ink-soft">גוון</span>
      <SwatchPicker options={shades} value={value} onChange={onChange} label="גוון הפריט" />
      <p className="mt-1.5 text-xs text-muted">{shades.find((s) => s.id === value)?.name ?? "ברירת מחדל"}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function Stepper({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-md border border-border p-1 text-ink-soft transition-colors hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
