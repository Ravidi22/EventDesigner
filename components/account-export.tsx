"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import { Button } from "@/components/button";
import type { ExportData } from "@/lib/account/export-types";

// Downloading the whole business (EVE-51, spec §5.8): the JSON from the route, the photos one at a
// time through /api/files, the zip built here in the browser (lib/account/export-zip.ts — loaded
// with `import()` on the press, so fflate is never in a page's first load) and saved through an
// <a download>. One hook, held by whoever owns the page: settings (so switching sections does not
// stop a download) and the closed page.

export type ExportState =
  | { phase: "idle" }
  /** `total` is 0 until the data has arrived — the photos are counted from it. */
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; fileName: string; bytes: number; missing: number }
  | { phase: "failed"; message: string };

export interface AccountExport {
  state: ExportState;
  start: () => void;
  cancel: () => void;
  /** Save the finished file again. */
  save: () => void;
}

/** "eve-irit-design-2026-11-28.zip" — ASCII only: a Hebrew name in a file name reads scrambled in a
 *  left-to-right file list (and some programs read it as Latin-1). A name with no Latin letters is
 *  "eve-export-<date>". */
function fileNameOf(business: string, at: Date): string {
  const name = business
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const day = at.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  return `eve-${name || "export"}-${day}.zip`;
}

function keyUrl(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function useAccountExport(): AccountExport {
  const [state, setState] = useState<ExportState>({ phase: "idle" });
  const controller = useRef<AbortController | null>(null);
  const file = useRef<{ url: string; name: string } | null>(null);

  const save = useCallback(() => {
    if (!file.current) return;
    const a = document.createElement("a");
    a.href = file.current.url;
    a.download = file.current.name;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
  }, []);

  const start = useCallback(() => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState({ phase: "running", done: 0, total: 0 });
    void (async () => {
      try {
        const response = await fetch("/api/account/export/data", { cache: "no-store", signal: ctrl.signal });
        if (!response.ok) throw new Error(response.status === 403 ? "רק הבעלים יכולים להוריד את הנתונים" : "לא ניתן לקרוא את הנתונים כרגע");
        const data = (await response.json()) as ExportData;
        const { buildExportZip } = await import("@/lib/account/export-zip");
        let missing = 0;
        const fetchFile = async (key: string) => {
          try {
            const r = await fetch(keyUrl(key), { signal: ctrl.signal });
            if (!r.ok) throw new Error(`${r.status}`);
            return new Uint8Array(await r.arrayBuffer());
          } catch (e) {
            missing++;
            throw e;
          }
        };
        const blob = await buildExportZip(data, fetchFile, (done, total) => setState({ phase: "running", done, total }), ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (file.current) URL.revokeObjectURL(file.current.url);
        file.current = { url: URL.createObjectURL(blob), name: fileNameOf(data.meta.business, new Date()) };
        setState({ phase: "done", fileName: file.current.name, bytes: blob.size, missing });
        save();
      } catch (e) {
        if (ctrl.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        setState({ phase: "failed", message: e instanceof Error && /[\u0590-\u05FF]/.test(e.message) ? e.message : "ההורדה נעצרה. אפשר לנסות שוב." });
      }
    })();
  }, [save]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ phase: "idle" });
  }, []);

  // Leaving the page stops the download and lets the file go.
  useEffect(
    () => () => {
      controller.current?.abort();
      if (file.current) URL.revokeObjectURL(file.current.url);
    },
    [],
  );

  return { state, start, cancel, save };
}

/** "182 מ״ב", "640 ק״ב". */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} מ״ב`;
  return `${Math.max(1, Math.round(bytes / 1024))} ק״ב`;
}

/** What the progress line says: the data first, then the photos. */
export function progressLabel(state: Extract<ExportState, { phase: "running" }>): string {
  return state.total ? `תמונות ${state.done} מתוך ${state.total}` : "קוראים את הנתונים…";
}

/** The one-button form, where the export is a side door (the close section, the close question, the
 *  closed page): the button, then its progress or its result on the same line. */
export function ExportButton({
  exporter,
  size = "sm",
  className = "",
}: {
  exporter: AccountExport;
  size?: "sm" | "md";
  className?: string;
}) {
  const { state, start, cancel, save } = exporter;
  if (state.phase === "running") {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <span role="status" className="nums text-[13px] text-ink-soft">
          מכינים את הקובץ… {progressLabel(state)}
        </span>
        <Button size="sm" variant="ghost" onClick={cancel}>
          ביטול
        </Button>
      </div>
    );
  }
  if (state.phase === "done") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-success-ink">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          ירד
        </span>
        <Button size="sm" variant="ghost" onClick={save}>
          הורדה שוב
        </Button>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Button
        size={size}
        variant="outline"
        onClick={start}
        icon={<Download className="h-4 w-4" strokeWidth={1.75} />}
        className={size === "md" ? "w-full" : ""}
      >
        הורדת כל הנתונים
      </Button>
      {state.phase === "failed" && (
        <p role="alert" className="text-[13px] font-medium text-alert-ink">
          {state.message}
        </p>
      )}
    </div>
  );
}
