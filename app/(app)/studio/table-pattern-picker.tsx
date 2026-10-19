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
import { isBlock, patternUnits, unitOf, type DressUnit } from "./dressing-units";

// "Which tables" — the panel behind every "apply to tables" in the studio: one item from a table's
// bar, or a whole table's dressing from its bar or its focus mode. A pattern (lib/studio/table-patterns.ts),
// which half of it, and a small map of the room that lights the tables it will land on BEFORE the
// button is pressed — a zig-zag described in words is a guess, drawn it is a decision.
//
// It picks UNITS (./dressing-units.ts): a block of grouped tables is one table to every pattern and
// to the count on the button, and it lights whole. The one exception is "שאר הבלוק", offered when the
// source is one member of a block — the block's other tables, each to get what this one has.

const PATTERNS: TablePattern[] = ["all", "type", "checker", "alternate", "rows", "columns", "selected"];
/** How two shades alternate across the tables picked: the patterns that HAVE two halves. */
type Split = "checker" | "alternate" | "rows" | "columns";

/** Who gets what: a set of units (their keys) — or, inside the source's block, of tables — and, when
 *  shades alternate, the shade they get. */
export interface PatternGroup {
  keys: string[];
  variantId?: string;
}

/** The tables as the patterns read them, one per TABLE — what a run along a row is strung through
 *  when a block's members are not the question (kept for callers that want tables, not units). */
export function patternTablesOf(tables: readonly DesignTable[]): PatternTable[] {
  return tables.map((t) => {
    const b = tableBox(t);
    // A table out of the numbering alternates after the numbered ones, by where it stands.
    return { id: t.id, position: t.position, number: t.unnumbered ? Number.MAX_SAFE_INTEGER : t.number, type: t.type, sizeMm: Math.max(b.widthMm, b.depthMm) };
  });
}

export function TablePatternPicker({
  tables,
  units,
  sourceId,
  noBlockMates = false,
  selectedTableIds,
  whole,
  item,
  onApply,
}: {
  tables: DesignTable[];
  /** Every lone table and block on the plan (unitsOf). */
  units: DressUnit[];
  /** The TABLE being copied from — every pattern is read relative to its unit. */
  sourceId: string;
  /** The source is its whole block (the block's own bar), so "שאר הבלוק" means nothing. */
  noBlockMates?: boolean;
  /** Tables selected on the plan now, for "השולחנות שנבחרו". */
  selectedTableIds: string[];
  /** A whole table's dressing rather than one item: offers replace-or-add. */
  whole: boolean;
  /** One item being applied: its shade now and the shades it comes in — what lets two of them
   *  alternate across the room (pink, white, pink…). Absent for a whole table's dressing. */
  item?: { variantId: string; shades: { id: string; name: string; swatch?: string }[] };
  /** `inBlock`: the keys are the source's block-mates (table ids), not units. */
  onApply: (groups: PatternGroup[], mode: "add" | "replace", inBlock: boolean) => void;
}) {
  const [pattern, setPattern] = useState<TablePattern>("all");
  const [invert, setInvert] = useState(false);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const canAlternate = !!item && item.shades.length >= 2;
  const [alternating, setAlternating] = useState(false);
  const [second, setSecond] = useState(() => item?.shades.find((sh) => sh.id !== item.variantId)?.id ?? "");
  const [split, setSplit] = useState<Split>("checker");

  const rows: PatternTable[] = useMemo(() => patternUnits(units), [units]);
  const source = unitOf(units, sourceId);
  const sourceKey = source?.key ?? sourceId;
  const mates = source && isBlock(source) && !noBlockMates ? source.ids.filter((id) => id !== sourceId) : [];
  const inBlock = pattern === "block" && mates.length > 0;
  const patterns = mates.length > 0 ? [...PATTERNS, "block" as const] : PATTERNS;
  // Plain derivations — a few dozen tables, read once per render of a popover.
  const selectedKeys = [...new Set(selectedTableIds.map((id) => unitOf(units, id)?.key).filter((k): k is string => !!k))];
  const halves = PATTERN_HALVES[pattern];
  const picked = inBlock ? new Set(mates) : new Set(patternTables(rows, pattern, { sourceId: sourceKey, selectedIds: selectedKeys, invert: halves && invert }));
  // The source is never counted as a target: it already wears what is being applied.
  const targets = inBlock ? [...picked] : [...picked].filter((k) => k !== sourceKey);

  // Two shades in alternation: the source's half of the split keeps its shade, the other half gets
  // the second one — read relative to the source, like every pattern here. Not inside a block.
  const shadeA = alternating && canAlternate && !inBlock ? new Set(patternTables(rows, split, { sourceId: sourceKey })) : null;
  const groups: PatternGroup[] = shadeA
    ? [
        { keys: targets.filter((k) => shadeA.has(k)), variantId: item!.variantId },
        { keys: targets.filter((k) => !shadeA.has(k)), variantId: second },
      ].filter((g) => g.keys.length > 0)
    : [{ keys: targets }];
  const swatchOf = (id: string) => item?.shades.find((sh) => sh.id === id)?.swatch;
  const keyOf = (tableId: string) => (inBlock ? tableId : (unitOf(units, tableId)?.key ?? tableId));
  const fillFor = (key: string) =>
    shadeA ? (swatchOf(shadeA.has(key) ? item!.variantId : second) ?? "var(--color-accent-wash)") : "var(--color-accent-wash)";

  // The room's box, padded, for the little map.
  const box = useMemo(() => {
    if (tables.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
    const half = (t: DesignTable) => {
      const b = tableBox(t);
      return Math.max(b.widthMm, b.depthMm) / 2;
    };
    const minX = Math.min(...tables.map((t) => t.position.x - half(t)));
    const maxX = Math.max(...tables.map((t) => t.position.x + half(t)));
    const minY = Math.min(...tables.map((t) => t.position.y - half(t)));
    const maxY = Math.max(...tables.map((t) => t.position.y + half(t)));
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06 + 200;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [tables]);

  const noun = inBlock ? (targets.length === 1 ? "שולחן אחד בבלוק" : `${targets.length} שולחנות בבלוק`) : targets.length === 1 ? "שולחן אחד" : `${targets.length} שולחנות`;

  return (
    <div className="space-y-3">
      <div>
        <span className={fieldLabelClassName}>על אילו שולחנות</span>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="דפוס">
          {patterns.map((p) => {
            const disabled = p === "selected" && selectedKeys.filter((k) => k !== sourceKey).length === 0;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={pattern === p}
                disabled={disabled}
                onClick={() => setPattern(p)}
                className={
                  "rounded-sm px-2 py-1.5 text-xs font-semibold leading-snug transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
                  (pattern === p ? "bg-accent text-canvas" : "bg-inset text-ink-soft hover:bg-accent-tint hover:text-accent")
                }
              >
                {PATTERN_LABEL[p]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-caption leading-relaxed text-muted">{PATTERN_HINT[pattern]}</p>
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

      {/* The room, with the tables it will land on lit. The source wears the accent fill — a whole
          block when the block is the source. */}
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="h-36 w-full rounded-md border border-border-soft bg-canvas"
        role="img"
        aria-label={`מפת השולחנות — ${noun} יקבלו את העיצוב`}
      >
        {tables.map((t) => {
          const key = keyOf(t.id);
          const isSource = inBlock ? t.id === sourceId : key === sourceKey;
          const on = picked.has(key);
          return (
            <g
              key={t.id}
              transform={`translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}${t.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}`}
            >
              <FootprintShape
                footprint={tableFootprint(t)}
                fill={isSource && !shadeA ? "var(--color-accent)" : on || isSource ? fillFor(key) : "var(--color-canvas)"}
                stroke={isSource || on ? "var(--color-accent)" : "var(--color-faint)"}
                strokeWidth={isSource ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      {canAlternate && !inBlock && (
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
                <p className="mt-1 text-caption text-muted">
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

      <Button size="sm" className="w-full" disabled={targets.length === 0 || (!!shadeA && !second)} onClick={() => onApply(groups, mode, inBlock)}>
        {targets.length === 0 ? "אין שולחנות בדפוס הזה" : `החלה על ${noun}`}
      </Button>
    </div>
  );
}
