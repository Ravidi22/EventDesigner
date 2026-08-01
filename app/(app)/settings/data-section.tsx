"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import {
  exportSnapshot,
  importSnapshot,
  resetAll,
  snapshotFileName,
  snapshotStats,
  type SnapshotStats,
} from "@/lib/settings/data";
import { Button } from "@/components/button";
import { Note, Panel } from "./ui";

// While everything lives in localStorage, this browser profile *is* the database. Export is the
// only backup that exists, so it gets a real place in settings rather than a dev-tools trick.
export function DataSection() {
  const [stats, setStats] = useState<SnapshotStats>({ keys: 0, bytes: 0 });
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setStats(snapshotStats()), []);

  const download = () => {
    const blob = new Blob([exportSnapshot()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = snapshotFileName();
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    try {
      const count = importSnapshot(await file.text());
      setMessage(`יובאו ${count} רשומות. רענון…`);
      window.location.reload();
    } catch {
      setMessage("הקובץ אינו גיבוי תקין של Eve.");
    }
  };

  return (
    <Panel
      title="נתונים וגיבוי"
      hint="כל הנתונים של הסטודיו — קטלוג, מתחמים, אירועים ותוכניות — שמורים כרגע בדפדפן הזה בלבד."
    >
      <div className="mb-5 flex items-center gap-6 rounded-md border border-inset-border bg-inset px-4 py-3.5">
        <Stat label="רשומות" value={String(stats.keys)} />
        <Stat label="נפח" value={`${(stats.bytes / 1024).toFixed(1)} KB`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="h-4 w-4" strokeWidth={1.8} />
          ייצוא גיבוי
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="h-4 w-4" strokeWidth={1.8} />
          ייבוא מגיבוי
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />

        <span className="flex-1" />

        {confirming ? (
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-alert">למחוק הכול ולחזור לנתוני הדוגמה?</span>
            {/* Outline geometry with the alert stroke, written out: passing border-alert to the
                outline Button would collide with its own border colour. */}
            <button
              type="button"
              onClick={() => {
                resetAll();
                window.location.reload();
              }}
              className="inline-flex h-9 items-center justify-center rounded-pill border-[1.5px] border-alert px-4 text-[13px] font-bold text-alert transition-colors hover:bg-alert-tint"
            >
              אישור
            </button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              ביטול
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
            איפוס לנתוני דוגמה
          </Button>
        )}
      </div>

      {message && <p className="mt-3 text-[13px] text-ink-soft">{message}</p>}

      <div className="mt-5">
        <Note icon={<TriangleAlert className="h-4 w-4" strokeWidth={1.6} />}>
          ניקוי נתוני הדפדפן, מחיקת ההיסטוריה או מעבר למחשב אחר — כל אחד מהם מוחק את העבודה. עד
          שהנתונים יעברו לשרת, כדאי לייצא גיבוי אחרי כל ערב עבודה משמעותי.
        </Note>
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="nums text-[19px] font-bold leading-tight text-ink">{value}</span>
      <span className="text-caption text-muted">{label}</span>
    </span>
  );
}
