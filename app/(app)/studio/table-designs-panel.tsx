"use client";

import { useState } from "react";
import { BookmarkPlus, Check, X } from "lucide-react";
import type { TableDesign } from "@/lib/design-document/types";
import { resolve } from "@/lib/studio/catalog-resolver";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { Swatch } from "@/components/swatch-field";
import { fieldLabelClassName } from "@/components/control";

// The studio's saved table designs — "גולד רומנטי", "לבן־ירוק כפרי": a table's whole dressing under a
// name (TableDesign), saved from a dressed table and put on any table of any event in one press. To
// lay one across the room, put it on one table and use that table's "which tables" pattern.

export function TableDesignsPanel({
  designs,
  canSave,
  onSave,
  onApply,
  onDelete,
}: {
  designs: TableDesign[];
  /** The table has something on it worth saving. */
  canSave: boolean;
  onSave: (name: string) => void;
  /** Put this design on the table — replacing what it wears. */
  onApply: (designId: string) => void;
  onDelete: (designId: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-3">
      {designs.length > 0 ? (
        <div>
          <span className={fieldLabelClassName}>על השולחן הזה</span>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {designs.map((d) => {
              const swatches = [...new Set(d.items.map((it) => resolve(it.variantId)?.swatch).filter((c): c is string => !!c))].slice(0, 4);
              const count = d.items.reduce((n, it) => n + it.quantity, 0);
              return (
                <li key={d.id} className="flex items-center gap-1 rounded-sm bg-inset ps-2">
                  <button
                    type="button"
                    onClick={() => onApply(d.id)}
                    title={`הלבשת השולחן ב״${d.name}״ — מחליף את מה שעליו`}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start text-xs font-semibold text-ink-soft transition-colors hover:text-accent"
                  >
                    <span className="flex shrink-0 -space-x-1 rtl:space-x-reverse">
                      {swatches.map((c) => (
                        <Swatch key={c} color={c} size={12} />
                      ))}
                    </span>
                    <span className="truncate">{d.name}</span>
                    <span className="nums shrink-0 font-normal text-muted">{`${count} פריטים`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(d.id)}
                    aria-label={`מחיקת העיצוב ״${d.name}״`}
                    title={`מחיקת העיצוב ״${d.name}״`}
                    className="rounded-sm p-1.5 text-muted transition-colors hover:bg-alert-tint hover:text-alert-ink"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted">עוד לא נשמרו עיצובי שולחן. עצבו שולחן אחד עד שהוא נכון — ושמרו אותו כאן.</p>
      )}

      <div className="border-t border-border-soft pt-3">
        <TextField label="שמירת השולחן הזה כעיצוב" value={name} onChange={setName} placeholder="גולד רומנטי" />
        <Button
          size="sm"
          className="mt-2 w-full"
          disabled={!canSave || !name.trim()}
          onClick={() => {
            onSave(name.trim());
            setName("");
          }}
        >
          {canSave ? <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={2} /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />}
          {canSave ? "שמירה" : "אין על השולחן מה לשמור"}
        </Button>
      </div>
    </div>
  );
}
