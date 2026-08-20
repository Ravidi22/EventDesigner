import { Archive, Boxes, Phone, User } from "lucide-react";
import type { SupplierSummary } from "@/lib/suppliers/types";
import { formatPrice } from "@/lib/catalog/format";

// Same construction as ProductCard: the whole card is one click target (a cover <button> behind
// pointer-events-none content), because nesting a button inside a button is not valid HTML.
export function SupplierCard({
  supplier,
  onEdit,
}: {
  supplier: SupplierSummary;
  onEdit: (s: SupplierSummary) => void;
}) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-surface p-4 text-right transition duration-150 ease-fluid hover:-translate-y-0.5 hover:shadow-floating">
      <button
        type="button"
        onClick={() => onEdit(supplier)}
        aria-label={`עריכת ${supplier.name}`}
        className="absolute inset-0 z-0 rounded-lg"
      />

      <div className="pointer-events-none relative flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base leading-tight text-ink">{supplier.name}</h3>
          {supplier.archived && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-xs text-muted">
              <Archive className="h-3 w-3" strokeWidth={2} />
              בארכיון
            </span>
          )}
        </div>

        {supplier.supplies && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{supplier.supplies}</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {supplier.contactName && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" strokeWidth={2} />
              {supplier.contactName}
            </span>
          )}
          {supplier.phone && (
            <span className="nums inline-flex items-center gap-1" dir="ltr">
              <Phone className="h-3.5 w-3.5" strokeWidth={2} />
              {supplier.phone}
            </span>
          )}
        </div>

        <div className="-mx-4 mt-auto flex items-end justify-between gap-2 border-t border-border px-4 pb-0.5 pt-3">
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Boxes className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="nums">{supplier.productCount}</span> מוצרים
          </span>
          {/* Outstanding is the number that changes what you do today, so it takes the emphasis and
              the alert tint; the all-time total is context and stays quiet underneath. */}
          <span className="flex flex-col items-end">
            {supplier.outstanding > 0 ? (
              <span className="nums text-lg font-bold text-alert">{formatPrice(supplier.outstanding)}</span>
            ) : (
              <span className="nums text-lg font-bold text-ink">{formatPrice(supplier.spent)}</span>
            )}
            <span className="text-xs text-muted">
              {supplier.outstanding > 0 ? "לתשלום" : supplier.spent > 0 ? "שולם עד היום" : "אין הוצאות"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
