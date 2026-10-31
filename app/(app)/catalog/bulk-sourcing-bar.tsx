"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { STOCK_KIND_LABEL, STOCK_KINDS, type Product, type StockKind } from "@/lib/catalog/types";
import { setSourcing, type SourcingPatch } from "@/lib/suppliers/actions";
import { useSupplierPicker } from "@/lib/suppliers/use-suppliers";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Select } from "@/components/select";
import { SupplierSelect } from "@/app/(app)/suppliers/supplier-select";

/** Change where a whole filtered set comes from, or who sells it, at once — "every chair we rent"
 *  is fourteen rows and one answer. It acts on the rows the filters left on screen (the same set
 *  the count in the filter bar reports and the CSV exports), never on a hidden one, and asks
 *  before writing: a Select is one slip from "every product is now rented".
 *
 *  Composites are skipped — they are no stock of their own (their parts are rows on the same
 *  screen). The write goes through lib/suppliers (cost side) and the screen reloads the catalog. */
export function BulkSourcingBar({ products, onDone }: { products: Product[]; onDone: () => Promise<void> | void }) {
  const rows = products.filter((p) => !p.composition);
  const { suppliers, add } = useSupplierPicker(rows.length > 0);
  const [pending, setPending] = useState<{ patch: SourcingPatch; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (rows.length === 0) return null;

  const apply = async () => {
    if (!pending) return;
    const { patch } = pending;
    setPending(null);
    setBusy(true);
    try {
      await setSourcing(rows.map((p) => p.id), patch);
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  const n = rows.length;
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent-line bg-accent-tint/60 px-4 py-2" aria-busy={busy}>
      <PackageCheck className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
      <span className="nums text-sm text-ink">
        {n} המוצרים המסוננים —
      </span>
      <Select
        aria-label="מאיפה מגיעים המוצרים המסוננים"
        value=""
        onChange={(v) => {
          if (!v) return;
          const kind = v as StockKind;
          setPending({ patch: { stockKind: kind }, title: `לסמן ${n} מוצרים כ"${STOCK_KIND_LABEL[kind]}"?` });
        }}
        options={[{ value: "", label: "מאיפה זה מגיע…" }, ...STOCK_KINDS.map((k) => ({ value: k, label: STOCK_KIND_LABEL[k] }))]}
        className="w-44 shrink-0"
      />
      <SupplierSelect
        aria-label="ספק למוצרים המסוננים"
        value=""
        suppliers={suppliers}
        noneLabel={null}
        placeholder="שיוך לספק…"
        onChange={(id) => {
          if (!id) return;
          setPending({ patch: { supplierId: id }, title: `לשייך ${n} מוצרים ל${supplierName(id)}?` });
        }}
        onCreate={add}
        className="w-56 shrink-0"
      />
      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ""}
        body="השינוי חל על כל המוצרים שהסינון משאיר על המסך. המחיר ללקוח לא משתנה."
        confirmLabel="כן, לשנות"
        onConfirm={() => void apply()}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
