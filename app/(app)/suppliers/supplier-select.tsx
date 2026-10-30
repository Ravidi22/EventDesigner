"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { SupplierSummary } from "@/lib/suppliers/types";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { controlClassName } from "@/components/control";

/** The last option of the list — picking it turns the Select into a name box. */
const NEW = "__new__";

/** A supplier picker that can also MAKE one, by name, where it stands — the product drawer, the
 *  catalog's bulk bar and the forecast's "ללא ספק" group all ask "who sells this?", and the answer
 *  used to be "first go to /suppliers". The name is all it takes; the phone and what they stock
 *  wait for the supplier card. Nothing is created until the ✓ is pressed, and ⏎ in the box is that ✓
 *  (never the enclosing form's submit).
 *
 *  `value` is the supplier id, "" for none. An archived supplier stays listed while it is the one
 *  already chosen, so opening an old row never silently unlinks it. */
export function SupplierSelect({
  id,
  value,
  suppliers,
  onChange,
  onCreate,
  noneLabel = "ללא ספק",
  placeholder,
  className = "w-full",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  suppliers: SupplierSummary[];
  onChange: (supplierId: string) => void;
  /** Makes the supplier and hands it back; null when it could not be. */
  onCreate: (name: string) => Promise<SupplierSummary | null>;
  /** The empty option's words. Absent on a picker that only ASSIGNS ("בחירת ספק…"). */
  noneLabel?: string | null;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const options = [
    { value: "", label: noneLabel ?? placeholder ?? "בחירת ספק…" },
    ...suppliers
      .filter((s) => !s.archived || s.id === value)
      .map((s) => ({ value: s.id, label: s.archived ? `${s.name} (בארכיון)` : s.name })),
    { value: NEW, label: "+ ספק חדש…" },
  ];

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const made = await onCreate(name);
    setBusy(false);
    if (!made) return;
    setNaming(false);
    setName("");
    onChange(made.id);
  };

  if (naming) {
    return (
      <div
        className={"flex items-center gap-1.5 " + className}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void create();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setNaming(false);
          }
        }}
      >
        <input
          id={id}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם הספק"
          aria-label="שם הספק החדש"
          autoFocus
          className={`${controlClassName} min-w-0 flex-1 px-2.5 placeholder:text-faint`}
        />
        <Button size="sm" onClick={() => void create()} disabled={busy || !name.trim()} icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />}>
          הוספה
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNaming(false)}>
          ביטול
        </Button>
      </div>
    );
  }

  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(v) => {
        if (v === NEW) setNaming(true);
        else onChange(v);
      }}
      options={options}
      className={className}
    />
  );
}
