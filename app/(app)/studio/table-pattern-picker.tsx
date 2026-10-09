"use client";

import { useMemo, useState } from "react";
import type { DesignTable } from "@/lib/design-document/types";
import { PATTERN_HALVES, PATTERN_HINT, PATTERN_LABEL, patternTables, type PatternTable, type TablePattern } from "@/lib/studio/table-patterns";
import { FootprintShape, tableBox, tableFootprint } from "@/components/footprint-shape";
import { MIRROR_TRANSFORM } from "@/lib/design-document/mirror";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/button";
import { fieldLabelClassName } from "@/components/control";
import { SwatchPicker } from "@/components/swatch-field";

// "Which tables" — the panel behind every "apply to tables" in the studio: one item from a table's
// bar, or a whole table's dressing from its focus mode. A pattern (lib/studio/table-patterns.ts),
// which half of it, and a small map of the room that lights the tables it will land on BEFORE the
// button is pressed — a zig-zag described in words is a guess, drawn it is a decision.

const PATTERNS: TablePattern[] = ["all", "type", "checker", "alternate", "rows", "columns", "selected"];
/** How two shades alternate across the tables picked: the patterns that HAVE two halves. */
type Split = "checker" | "alternate" | "rows" | "columns";

/** Who gets what: a set of tables, and — when shades alternate — the shade they get. */
export interface PatternGroup {
  tableIds: string[];
  variantId?: string;
}

export function TablePatternPicker({
  tables,
  sourceId,
  selectedTableIds,
  whole,
  item,
  onApply,
}: {
  tables: DesignTable[];
  /** The table being copied from — what every pattern is read relative to. */
  sourceId: string;
  /** Tables selected on the plan now, for "השולחנות שנבחרו". */
  selectedTableIds: string[];
  /** A whole table's dressing rather than one item: offers replace-or-add. */
  whole: boolean;
  /** One item being applied: its shade now and the shades it comes in — what lets two of them
   *  alternate across the room (pink, white, pink…). Absent for a whole table's dressing. */
  item?: { variantId: string; shades: { id: string; name: string; swatch?: string }[] };
  onApply: (groups: PatternGroup[], mode: "add" | "replace") => void;
}) {
  const [pattern, setPattern] = useState<TablePattern>("all");
  const [invert, setInvert] = useState(false);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const canAlternate = !!item && item.shades.length >= 2;
  const [alternating, setAlternating] = useState(false);
  const [second, setSecond] = useState(() => item?.shades.find((sh) => sh.id !== item.variantId)?.id ?? "");
  const [split, setSplit] = useState<Split>("checker");

  const rows: PatternTable[] = useMemo(
    () =>
      tables.map((t) => {
        const b = tableBox(t);
        return { id: t.id, position: t.position, number: t.number, type: t.type, sizeMm: Math.max(b.widthMm, b.depthMm) };
      }),
    [tables],
  );
  const halves = PATTERN_HALVES[pattern];
  const picked = useMemo(
    () => new Set(patternTables(rows, pattern, { sourceId, selectedIds: selectedTableIds, invert: halves && invert })),
    [rows, pattern, sourceId, selectedTableIds, invert, halves],
  );
  // The source is never counted as a target: it already wears what is being applied.
  const targets = [...picked].filter((id) => id !== sourceId);

  // Two shades in alternation: the source's half of the split keeps its shade, the other half gets
  // the second one — read relative to the source, like every pattern here.
  const shadeA = useMemo(
    () => (alternating && canAlternate ? new Set(patternTables(rows, split, { sourceId })) : null),
    [alternating, canAlternate, rows, split, sourceId],
  );
  const groups: PatternGroup[] = shadeA
    ? [
        { tableIds: targets.filter((id) => shadeA.has(id)), variantId: item!.variantId },
        { tableIds: targets.filter((id) => !shadeA.has(id)), variantId: second },
      ].filter((g) => g.tableIds.length > 0)
    : [{ tableIds: targets }];
  const swatchOf = (id: string) => item?.shades.find((sh) => sh.id === id)?.swatch;
  const fillFor = (tableId: string) =>
    shadeA ? (swatchOf(shadeA.has(tableId) ? item!.variantId : second) ?? "var(--color-accent-wash)") : "var(--color-accent-wash)";

  // The room's box, padded, for the little map.
  const box = useMemo(() => {
    if (rows.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
    const minX = Math.min(...rows.map((r) => r.position.x - r.sizeMm / 2));
    const maxX = Math.max(...rows.map((r) => r.position.x + r.sizeMm / 2));
    const minY = Math.min(...rows.map((r) => r.position.y - r.sizeMm / 2));
    const maxY = Math.max(...rows.map((r) => r.position.y + r.sizeMm / 2));
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06 + 200;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div>
        <span className={fieldLabelClassName}>על אילו שולחנות</span>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="דפוס">
          {PATTERNS.map((p) => {
            const disabled = p === "selected" && selectedTableIds.length === 0;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={pattern === p}
                disabled={disabled}
                onClick={() => setPattern(p)}
                className={
                  "rounded-sm px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
                  (pattern === p ? "bg-accent text-canvas" : "bg-inset text-ink-soft hover:bg-accent-tint hover:text-accent")
                }
              >
                {PATTERN_LABEL[p]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">{PATTERN_HINT[pattern]}</p>
      </div>

      {halves && (
        <Segmented
          label="איזה חצי"
          value={invert ? "other" : "same"}
          options={[
            ["same", "כמו השולחן הזה"],
            ["other", "החצי השני"],
          ]}
          onChange={(v) => setInvert(v === "other")}
        />
      )}

      {/* The room, with the tables it will land on lit. The source wears the accent ring. */}
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="h-36 w-full rounded-md border border-border-soft bg-canvas"
        role="img"
        aria-label={`מפת השולחנות — ${targets.length} יקבלו את העיצוב`}
      >
        {tables.map((t) => {
          const isSource = t.id === sourceId;
          const on = picked.has(t.id);
          return (
            <g
              key={t.id}
              transform={`translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}${t.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}`}
            >
              <FootprintShape
                footprint={tableFootprint(t)}
                fill={isSource && !shadeA ? "var(--color-accent)" : on || isSource ? fillFor(t.id) : "var(--color-canvas)"}
                stroke={isSource || on ? "var(--color-accent)" : "var(--color-faint)"}
                strokeWidth={isSource ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      {canAlternate && (
        <div className="space-y-2">
          <Segmented
            label="גוונים"
            value={alternating ? "two" : "one"}
            options={[
              ["one", "גוון אחד"],
              ["two", "שני גוונים לסירוגין"],
            ]}
            onChange={(v) => setAlternating(v === "two")}
          />
          {alternating && (
            <>
              <div>
                <span className={fieldLabelClassName}>הגוון השני</span>
                <SwatchPicker options={item!.shades.filter((sh) => sh.id !== item!.variantId)} value={second} onChange={setSecond} label="הגוון השני" />
                <p className="mt-1 text-xs text-muted">
                  {`${item!.shades.find((sh) => sh.id === item!.variantId)?.name ?? ""} ו${item!.shades.find((sh) => sh.id === second)?.name ?? "—"}`}
                </p>
              </div>
              <Segmented
                label="לסירוגין לפי"
                value={split}
                options={[
                  ["checker", "זיגזג"],
                  ["alternate", "מספר"],
                  ["rows", "שורות"],
                  ["columns", "טורים"],
                ]}
                onChange={setSplit}
              />
            </>
          )}
        </div>
      )}

      {whole && (
        <Segmented
          label="מה קורה לעיצוב שכבר עליהם"
          value={mode}
          options={[
            ["replace", "מחליפים"],
            ["add", "מוסיפים"],
          ]}
          onChange={setMode}
        />
      )}

      <Button size="sm" className="w-full" disabled={targets.length === 0 || (!!shadeA && !second)} onClick={() => onApply(groups, mode)}>
        {targets.length === 0 ? "אין שולחנות בדפוס הזה" : `החלה על ${targets.length} שולחנות`}
      </Button>
    </div>
  );
}
