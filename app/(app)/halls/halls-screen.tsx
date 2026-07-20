"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { HallTemplate } from "@/lib/setup/types";
import { loadTemplates, saveTemplate, deleteTemplate } from "@/lib/setup/storage";
import { SEED_TEMPLATES } from "@/lib/setup/sample-data";
import { PlanPreview } from "@/components/plan-preview";
import { polygonAreaMm2 } from "@/lib/studio/geometry";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { HallEditor } from "./hall-editor";

// Hall shells (F-3.1): the halls the designer works in — geometry, entrances, obstacles,
// optional near-fixed elements, calibration. NO table layouts; those arrive per event from
// iPlan in the meeting flow. Events are opened from the meeting flow, not from here.
export function HallsScreen() {
  const [templates, setTemplates] = useState<HallTemplate[]>(SEED_TEMPLATES);
  const [editing, setEditing] = useState<HallTemplate | null>(null);

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  if (editing) {
    return (
      <HallEditor
        key={editing.id}
        draft={editing}
        onSave={(t) => {
          setTemplates(saveTemplate(t));
          setEditing(null);
        }}
        onDelete={(id) => {
          setTemplates(deleteTemplate(id));
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          שלד אולם — קווי מתאר, כניסות, גובה תקרה, במה ובר — מוגדר פעם אחת ומשמש כל אירוע באולם.
          פריסות השולחנות עצמן מגיעות פר אירוע מסקיצת ה-iPlan, בזרימת הפגישה.
        </p>
        <Button onClick={() => setEditing(newHall())}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          אולם חדש
        </Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const areaM2 = t.hall.outline?.length
            ? polygonAreaMm2(t.hall.outline) / 1_000_000
            : (t.hall.widthMm * t.hall.heightMm) / 1_000_000;
          const fixedElements = [t.hall.stage?.label, ...t.hall.bars.map((b) => b.label)].filter(Boolean);
          return (
            <article key={t.id} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:border-ink-soft/40 hover:shadow-floating">
              <div className="border-b border-border bg-canvas p-4">
                <PlanPreview hall={t.hall} tables={[]} />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span className="text-base font-bold text-ink">{t.name}</span>
                  <IconButton
                    label={`עריכת ${t.name}`}
                    onClick={() => setEditing(t)}
                    className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2} />
                  </IconButton>
                </div>
                <dl className="flex flex-col gap-2 text-sm text-ink-soft">
                  <div className="flex justify-between"><dt>שטח</dt><dd className="nums font-medium text-ink">{Math.round(areaM2)} מ״ר</dd></div>
                  <div className="flex justify-between"><dt>כניסות</dt><dd className="nums font-medium text-ink">{t.hall.entrances.length}</dd></div>
                  <div className="flex justify-between"><dt>גובה תקרה</dt><dd className="nums font-medium text-ink">{t.hall.ceilingHeightMm ? `${(t.hall.ceilingHeightMm / 1000).toFixed(1)} מ׳` : "ללא"}</dd></div>
                  <div className="flex justify-between"><dt>מכשולים</dt><dd className="font-medium text-ink">{t.hall.columns.length ? `${t.hall.columns.length} עמודים` : "ללא"}</dd></div>
                  <div className="flex justify-between"><dt>אלמנטים קבועים</dt><dd className="font-medium text-ink">{fixedElements.length ? fixedElements.join(", ") : "ללא"}</dd></div>
                  <div className="flex justify-between"><dt>כיול</dt><dd className="nums font-medium text-ink">{t.mmPerUnit} מ״מ/יח׳</dd></div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// Clean canvas — no outline yet. The editor opens straight into draw mode so the designer
// places the shell wall by wall instead of starting from a prefilled rectangle.
function newHall(): HallTemplate {
  return {
    id: crypto.randomUUID(),
    name: "",
    hall: {
      widthMm: 0,
      heightMm: 0,
      outline: [],
      edgeCurves: [],
      ceilingHeightMm: 4000,
      columns: [],
      entrances: [],
      bars: [],
    },
    mmPerUnit: 1,
    createdAt: Date.now(),
  };
}
