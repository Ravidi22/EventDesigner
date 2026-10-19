"use client";

import { useState } from "react";
import { BookmarkPlus, Check, Trash2 } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { resolve } from "@/lib/studio/catalog-resolver";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { Swatch } from "@/components/swatch-field";
import { Segmented } from "@/components/segmented";
import { fieldLabelClassName } from "@/components/control";
import { BarButton, Note } from "@/components/inspector-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";

// עיצובי שולחן — "גולד רומנטי", "לבן־ירוק כפרי": a table's whole dressing under a name, worn by any
// table of any event in one press. They are TABLE SETS in the catalog (lib/catalog/composition.ts
// isTableSet): saved from here they are rows in "פריטים מורכבים", and the same rows are dragged off
// the rail onto a table. Before 2026-10-19 they were a studio setting of their own beside the
// catalog's table sets — two features doing halves of one job. To lay one across the room, wear it
// on one table and use that table's "which tables" pattern.

export type WearMode = "replace" | "add";

export function TableDesignsPanel({
  sets,
  canSave,
  onSave,
  onApply,
  onDelete,
}: {
  /** The catalog's table sets, newest last. */
  sets: Product[];
  /** The table has something on it worth saving. */
  canSave: boolean;
  onSave: (name: string) => void;
  /** Put this set on the table — in place of what it wears, or beside it. */
  onApply: (productId: string, mode: WearMode) => void;
  onDelete: (productId: string) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<WearMode>("replace");
  // A catalog row has no undo, so the bin asks first — the same question every delete in the app asks.
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className="space-y-3">
      {sets.length > 0 ? (
        <div className="space-y-2">
          <Segmented
            label="הלבשת השולחן"
            value={mode}
            options={[
              ["replace", "במקום מה שעליו"],
              ["add", "בנוסף למה שעליו"],
            ] as const}
            onChange={setMode}
          />
          <span className={fieldLabelClassName}>מהקטלוג</span>
          <ul className="scroll-slim max-h-56 space-y-1 overflow-y-auto">
            {sets.map((d) => {
              const parts = d.composition?.placements ?? [];
              const swatches = [...new Set(parts.map((it) => resolve(it.variantId)?.swatch).filter((c): c is string => !!c))].slice(0, 4);
              const count = parts.reduce((n, it) => n + it.quantity, 0);
              return (
                <li key={d.id} className="flex items-center gap-1 rounded-sm border border-inset-border bg-inset ps-2.5 transition-colors hover:border-accent-line">
                  <button
                    type="button"
                    onClick={() => onApply(d.id, mode)}
                    title={mode === "replace" ? `הלבשת השולחן ב״${d.name}״ — במקום מה שעליו` : `הוספת ״${d.name}״ למה שעל השולחן`}
                    className="flex min-w-0 flex-1 items-center gap-2 py-2 text-start text-sm font-medium text-ink transition-colors hover:text-accent"
                  >
                    <span className="flex shrink-0 -space-x-1 rtl:space-x-reverse">
                      {swatches.map((c) => (
                        <Swatch key={c} color={c} size={12} />
                      ))}
                    </span>
                    <span className="truncate">{d.name}</span>
                    <span className="nums ms-auto shrink-0 text-caption font-normal text-muted">{`${count} פריטים`}</span>
                  </button>
                  {/* A bin, not an ✕: in a popup an ✕ means "close this", and here it deletes a row. */}
                  <BarButton icon={Trash2} tone="danger" label={`מחיקת ״${d.name}״ מהקטלוג`} onClick={() => setConfirm({ id: d.id, name: d.name })} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-caption leading-relaxed text-muted">עוד אין עיצובי שולחן בקטלוג. עצבו שולחן אחד עד שהוא נכון — ושמרו אותו כאן.</p>
      )}

      <div className="border-t border-border-soft pt-4">
        <TextField label="שמירת השולחן הזה כעיצוב" value={name} onChange={setName} placeholder="גולד רומנטי" />
        <Button
          size="sm"
          className="mt-3 w-full"
          disabled={!canSave || !name.trim()}
          onClick={() => {
            onSave(name.trim());
            setName("");
          }}
        >
          {canSave ? <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={2} /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />}
          {canSave ? "שמירה בקטלוג" : "אין על השולחן מה לשמור"}
        </Button>
        <Note>נשמר בקטלוג כעיצוב שולחן — עם מה שתלוי מעליו. אפשר גם לגרור אותו משם אל כל שולחן.</Note>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={`למחוק את ״${confirm?.name ?? ""}״ מהקטלוג?`}
        body="העיצוב נמחק מהקטלוג — שולחנות שכבר לובשים אותו נשארים כמו שהם."
        confirmLabel="מחיקה"
        onConfirm={() => {
          if (confirm) onDelete(confirm.id);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
