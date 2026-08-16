"use client";

import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { fileStorageBackend } from "@/lib/files/actions";
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
      hint="הנתונים של הסטודיו — קטלוג, מתחמים, אירועים, תוכניות, גלריה והצעות — שמורים בשרת ומגובים שם. מה שנשמר במכשיר הזה הוא רק המיקום שלכם בעבודה."
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
            <span className="text-[13px] font-semibold text-alert">לנקות את מה שהמכשיר הזה זוכר?</span>
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
            ניקוי נתוני המכשיר
          </Button>
        )}
      </div>

      {message && <p className="mt-3 text-[13px] text-ink-soft">{message}</p>}

      <div className="mt-5 space-y-3">
        <Note icon={<TriangleAlert className="h-4 w-4" strokeWidth={1.6} />}>
          הקובץ הזה אינו גיבוי של הסטודיו: הוא מכיל רק את מה שהמכשיר הזה זוכר — איזה אירוע ואיזה
          מתחם פתוחים, וסקיצה שנוצרה לפני שהיה אירוע לשייך אותה אליו. העבודה עצמה יושבת בשרת, ומעבר
          למחשב אחר אינו מוחק דבר.
        </Note>

        <StorageNote />
      </div>
    </Panel>
  );
}

/**
 * Where photographs actually go.
 *
 * `fileStorageBackend()` was written for this and then never called, which left the app unable to
 * answer its most consequential deployment question out loud. It matters in both directions: on the
 * local driver a designer's photographs live in one folder on one machine — and on a serverless
 * deployment that folder does not survive the instance, so an evening's uploads are already gone by
 * morning. Nobody should have to read an environment variable to find that out.
 *
 * It is also the cheapest possible confirmation that R2 is really on after the five variables are
 * set: if this still says "local" in production, one of them is missing and the seam has silently
 * fallen back rather than failed.
 */
function StorageNote() {
  const [backend, setBackend] = useState<"r2" | "local" | null>(null);

  useEffect(() => {
    let live = true;
    void fileStorageBackend()
      .then((b) => {
        if (live) setBackend(b);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!backend) return null;

  return (
    <Note icon={<HardDrive className="h-4 w-4" strokeWidth={1.6} />}>
      {backend === "r2" ? (
        <>
          תמונות ותוכניות רקע נשמרות ב־<span dir="ltr">Cloudflare R2</span> ומוגשות משם. זהו האחסון
          הקבוע.
        </>
      ) : (
        <>
          <span className="font-semibold text-ink">אחסון מקומי.</span> תמונות ותוכניות רקע נשמרות
          בתיקייה על המכונה שמריצה את האפליקציה. בפריסה בענן התיקייה הזו נעלמת עם השרת — כלומר
          העלאות לא ישרדו. מגדירים את חמשת המשתנים של <span dir="ltr">R2</span> כדי לעבור לאחסון
          קבוע.
        </>
      )}
    </Note>
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
