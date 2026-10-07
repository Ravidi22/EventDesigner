"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { fileProblem, uploadFile } from "@/lib/files/upload";
import type { FileKind } from "@/lib/files/keys";
import { fieldLabelClassName } from "./control";

// A dashed drop target for ONE image. Drag a file onto it, click to browse, or focus it and
// paste (Ctrl+V). Uploads on drop/pick/paste (lib/files/) in the same "upload before the form is
// saved" order ImageField uses, and hands back the stored URL.
//
// Separate from ImageField, which is a small square control for a settings field; this one is a
// canvas-sized zone for the presentation builder, where the drop affordance is the point.
export function ImageDropzone({
  label,
  hint,
  value,
  onChange,
  kind,
  className = "",
}: {
  label?: string;
  hint?: string;
  /** The stored URL, or undefined for "no image". */
  value?: string;
  onChange: (url: string | undefined) => void;
  kind: FileKind;
  className?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const accept = async (file: File | null | undefined) => {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { url } = await uploadFile(file, kind);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const imageFromItems = (items: DataTransferItemList | undefined): File | null => {
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) return it.getAsFile();
    }
    return null;
  };

  return (
    <div className={className}>
      {label && <span className={fieldLabelClassName}>{label}</span>}
      <div
        role="button"
        tabIndex={0}
        aria-label={value ? "החלפת התמונה" : "העלאת תמונה"}
        onClick={() => picker.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            picker.current?.click();
          }
        }}
        onPaste={(e) => {
          const file = imageFromItems(e.clipboardData?.items);
          if (file) {
            e.preventDefault();
            void accept(file);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
        className={
          "relative mt-1 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
          (over
            ? "border-accent bg-accent-tint"
            : value
              ? "border-transparent"
              : "border-[#ddd6f0] bg-[#fcfbff] hover:border-accent hover:bg-[#f3effc]")
        }
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-4 text-center text-[#8f78d8]">
            <ImagePlus className="h-6 w-6" strokeWidth={1.6} />
            <span className="text-xs font-medium leading-relaxed">
              גררו לכאן, הדביקו (Ctrl+V) או בחרו קובץ
            </span>
          </div>
        )}

        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-canvas/70">
            <Loader2 className="h-5 w-5 animate-spin text-accent" strokeWidth={2} />
          </span>
        )}

        {value && !uploading && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
              onChange(undefined);
            }}
            aria-label="הסרת התמונה"
            className="absolute inset-inline-end-2 top-2 rounded-full border border-border bg-canvas p-1 text-muted shadow-floating transition-colors hover:bg-alert-tint hover:text-alert"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {(error || hint) && (
        <p className={"mt-1 text-[11px] leading-relaxed " + (error ? "text-alert" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
