"use client";

import { useMemo, useState } from "react";
import type { DesignTable } from "@/lib/design-document/types";
import { PATTERN_HALVES, PATTERN_HINT, PATTERN_LABEL, patternTables, toggleHandPick, withHandPicks, type PatternTable, type TablePattern } from "@/lib/studio/table-patterns";
import { FootprintShape, tableBox, tableFootprint } from "@/components/footprint-shape";
import { MIRROR_TRANSFORM } from "@/lib/design-document/mirror";
import { Segmented, segmentClass } from "@/components/segmented";
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
  // Tables added or taken out BY HAND over the pattern (§6, QA PT-1) — by unit key. A new pattern or
  // the other half clears them: they were picked against the old one (DECIDE 5).
  const [handAdded, setHandAdded] = useState<Set<string>>(() => new Set());
  const [handRemoved, setHandRemoved] = useState<Set<string>>(() => new Set());
  const clearHand = () => {
    setHandAdded(new Set());
    setHandRemoved(new Set());
  };
  const choose = (p: TablePattern) => {
    setPattern(p);
    clearHand();
  };

  const rows: PatternTable[] = useMemo(() => patternUnits(units), [units]);
  const source = unitOf(units, sourceId);
  const sourceKey = source?.key ?? sourceId;
  const mates = source && isBlock(source) && !noBlockMates ? source.ids.filter((id) => id !== sourceId) : [];
  const inBlock = pattern === "block" && mates.length > 0;
  const patterns = mates.length > 0 ? [...PATTERNS, "block" as const] : PATTERNS;
  // Plain derivations — a few dozen tables, read once per render of a popover.
  const selectedKeys = [...new Set(selectedTableIds.map((id) => unitOf(units, id)?.key).filter((k): k is string => !!k))];
  const halves = PATTERN_HALVES[pattern];
  const byPattern = inBlock ? new Set(mates) : new Set(patternTables(rows, pattern, { sourceId: sourceKey, selectedIds: selectedKeys, invert: halves && invert }));
  const hand = !inBlock && (handAdded.size > 0 || handRemoved.size > 0);
  const picked = hand ? withHandPicks(byPattern, handAdded, handRemoved, sourceKey) : byPattern;
  const togglePick = (key: string) => {
    if (inBlock || key === sourceKey) return;
    const next = toggleHandPick(key, byPattern.has(key), handAdded, handRemoved);
    setHandAdded(next.added);
    setHandRemoved(next.removed);
  };
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
        {/* The board's segmented look (components/segmented.tsx — the user's note 4: every toggle in the
            panel), in two columns: a hairline frame, the chosen pattern in the accent wash. */}
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface p-0.5" role="group" aria-label="דפוס">
          {patterns.map((p) => {
            const disabled = p === "selected" && selectedKeys.filter((k) => k !== sourceKey).length === 0;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={pattern === p}
                disabled={disabled}
                onClick={() => choose(p)}
                className={segmentClass(pattern === p, false) + " disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-soft"}
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
          onChange={(v) => {
            setInvert(v === "other");
            clearHand();
          }}
        />
      )}

      {/* The room, with the tables it will land on lit. The source wears the accent fill — a whole
          block when the block is the source. */}
      {/* Every table is a toggle (§6): a click adds one the pattern left out, or takes out one it
          took. Each wears its number. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-muted">{hand ? `דפוס + בחירה ידנית · ${noun}` : inBlock ? noun : `${noun} · לחיצה על שולחן מוסיפה או מוציאה אותו`}</span>
        {hand && (
          <button type="button" onClick={clearHand} className="shrink-0 text-caption font-medium text-accent hover:text-accent-hover">
            איפוס
          </button>
        )}
      </div>
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="h-[220px] w-full rounded-md border border-border-soft bg-canvas"
        role="group"
        aria-label={`מפת השולחנות — ${noun} יקבלו את העיצוב`}
      >
        {tables.map((t) => {
          const key = keyOf(t.id);
          const isSource = inBlock ? t.id === sourceId : key === sourceKey;
          const on = picked.has(key);
          const label = t.unnumbered ? "" : String(t.number);
          return (
            <g
              key={t.id}
              role={inBlock || isSource ? undefined : "button"}
              aria-pressed={inBlock || isSource ? undefined : on}
              aria-label={inBlock || isSource ? undefined : `שולחן ${label}`.trim()}
              onClick={() => togglePick(key)}
              className={inBlock || isSource ? undefined : "cursor-pointer"}
            >
              <g transform={`translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}${t.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}`}>
                <FootprintShape
                  footprint={tableFootprint(t)}
                  fill={isSource && !shadeA ? "var(--color-accent)" : on || isSource ? fillFor(key) : "var(--color-canvas)"}
                  stroke={isSource || on ? "var(--color-accent)" : "var(--color-faint)"}
                  strokeWidth={isSource ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              {label && (
                <text
                  x={t.position.x}
                  y={t.position.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none nums"
                  fontSize={box.w / 24}
                  fontWeight={600}
                  fill={isSource && !shadeA ? "var(--color-canvas)" : "var(--color-ink-soft)"}
                >
                  {label}
                </text>
              )}
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
