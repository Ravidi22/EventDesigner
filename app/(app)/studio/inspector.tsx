"use client";

import { Minus, Plus, Trash2, Copy, X, TriangleAlert, Layers } from "lucide-react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { LAYER_LABEL } from "@/lib/catalog/categories";
import { resolve, tableUtilization } from "@/lib/studio/catalog-resolver";
import type { Selection } from "./canvas-stage";

export function Inspector({
  selection,
  doc,
  onClose,
  onQuantity,
  onDelete,
  onSmartApply,
  onRenumber,
  onDuplicateTable,
}: {
  selection: Selection;
  doc: DesignDocumentContent;
  onClose: () => void;
  onQuantity: (id: string, delta: number) => void;
  onDelete: () => void;
  onSmartApply: () => void;
  onRenumber: (id: string, number: number) => void;
  onDuplicateTable: (id: string) => void;
}) {
  if (!selection) return null;

  if (selection.kind === "placement") {
    const p = doc.placements.find((x) => x.id === selection.id);
    if (!p) return null;
    const r = resolve(p.variantId);
    const table = p.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    return (
      <Panel title={r?.product.name ?? "פריט"} onClose={onClose}>
        <dl className="space-y-1.5 text-sm">
          {r?.variant && <Row label="גוון" value={r.variant.name} />}
          <Row label="שכבה" value={LAYER_LABEL[p.layer]} />
          {table && <Row label="שולחן" value={String(table.number)} />}
        </dl>

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
  return (
    <Panel title={t.number > 0 ? `שולחן ${t.number}` : "שולחן ראש"} onClose={onClose}>
      <dl className="space-y-1.5 text-sm">
        <Row label="סוג" value={t.type} />
        {t.seats != null && <Row label="כסאות" value={String(t.seats)} />}
        <Row label="פריטים" value={String(count)} />
      </dl>

      {/* F-3.3: auto-running numbering, editable per table */}
      <div className="mt-3 flex items-center justify-between">
        <label htmlFor="table-number" className="text-sm text-ink-soft">מספר שולחן</label>
        <input
          id="table-number"
          type="number"
          inputMode="numeric"
          value={t.number}
          onChange={(e) => onRenumber(t.id, Number(e.target.value) || 0)}
          className="nums h-8 w-16 rounded-md border border-border bg-canvas px-2 text-end text-sm text-ink"
        />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1 text-ink-soft">
            <Layers className="h-3.5 w-3.5" strokeWidth={2} />
            ניצול שטח
          </span>
          <span className={"nums font-semibold " + (overflow ? "text-warn" : "text-ink")}>{Math.round(util * 100)}%</span>
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
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-warn">
            <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
            הפריטים חורגים משטח השולחן
          </p>
        )}
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
