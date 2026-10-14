"use client";

import { useState } from "react";
import { BookmarkPlus, Check, Trash2 } from "lucide-react";
import type { TableDesign } from "@/lib/design-document/types";
import { resolve } from "@/lib/studio/catalog-resolver";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { Swatch } from "@/components/swatch-field";
import { fieldLabelClassName } from "@/components/control";
import { BarButton } from "@/components/inspector-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  // A saved design is a studio-wide settings row with no undo, so the bin asks first — the same
  // question every delete in the app asks (ConfirmDialog), as the toolbar's sketch list does.
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className="space-y-3">
      {designs.length > 0 ? (
        <div>
          <span className={fieldLabelClassName}>על השולחן הזה</span>
          <ul className="scroll-slim max-h-56 space-y-1 overflow-y-auto">
            {designs.map((d) => {
              const swatches = [...new Set(d.items.map((it) => resolve(it.variantId)?.swatch).filter((c): c is string => !!c))].slice(0, 4);
              const count = d.items.reduce((n, it) => n + it.quantity, 0);
              return (
                <li key={d.id} className="flex items-center gap-1 rounded-sm border border-inset-border bg-inset ps-2.5 transition-colors hover:border-accent-line">
                  <button
                    type="button"
                    onClick={() => onApply(d.id)}
                    title={`הלבשת השולחן ב״${d.name}״ — מחליף את מה שעליו`}
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
                  {/* A bin, not an ✕: in a popup an ✕ means "close this", and here it deleted a design. */}
                  <BarButton icon={Trash2} tone="danger" label={`מחיקת העיצוב ״${d.name}״`} onClick={() => setConfirm({ id: d.id, name: d.name })} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-caption leading-relaxed text-muted">עוד לא נשמרו עיצובי שולחן. עצבו שולחן אחד עד שהוא נכון — ושמרו אותו כאן.</p>
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
          {canSave ? "שמירה" : "אין על השולחן מה לשמור"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={`למחוק את העיצוב ״${confirm?.name ?? ""}״?`}
        body="העיצוב נמחק מהסטודיו — שולחנות שכבר לובשים אותו נשארים כמו שהם."
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
