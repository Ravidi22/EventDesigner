"use client";

import { useState } from "react";
import { MAP_ICONS } from "@/lib/catalog/map-icons";
import { controlClassName } from "@/components/control";

export function IconPicker({ value, onPick }: { value: string | undefined; onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const items = term ? MAP_ICONS.filter((i) => i.label.includes(term) || i.name.includes(term.toLowerCase())) : MAP_ICONS;

  return (
    <div className="rounded-md border border-border bg-surface p-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש אייקון…"
        className={controlClassName + " mb-2 w-full px-2.5 placeholder:text-muted"}
      />
      <div className="grid grid-cols-6 gap-1">
        {items.map(({ name, label, Icon }) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            title={label}
            aria-label={label}
            aria-pressed={value === name}
            className={
              "flex aspect-square items-center justify-center rounded transition-colors " +
              (value === name ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")
            }
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </button>
        ))}
        {items.length === 0 && <p className="col-span-6 px-1 py-2 text-xs text-muted">לא נמצאו אייקונים.</p>}
      </div>
    </div>
  );
}
