"use client";
// Pick an image, upload it, keep the URL. The control behind every "picture of a thing" field in
// the app that isn't the gallery's own composer.
//
// It exists because three screens were about to grow the same forty lines: the catalog's product
// image, the studio letterhead, and whatever comes next. Before this they were `TextField`s asking
// for a URL — a stopgap from before lib/files/ was wired, which asked a designer to go and host a
// photograph somewhere else first.
//
// ⚠ THE UPLOAD HAPPENS HERE, BEFORE THE FORM IS SAVED. That is deliberate and it is the same order
// the gallery uses: the row must never be written pointing at a file that failed to upload. The
// cost is an orphaned object if the designer picks an image and then abandons the form — which the
// server's replace-cleanup cannot see, because no row ever named it. That is the cheaper of the two
// mistakes: an orphan costs storage, a broken link costs a designer's trust in the screen.
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { fileProblem, uploadFile } from "@/lib/files/upload";
import type { FileKind } from "@/lib/files/keys";
import { fieldLabelClassName } from "./control";

export function ImageField({
  label,
  hint,
  value,
  onChange,
  kind,
  className = "h-20 w-20",
  wrapperClassName = "",
}: {
  label?: string;
  hint?: string;
  /** The stored URL, or undefined for "no image". */
  value?: string;
  onChange: (url: string | undefined) => void;
  kind: FileKind;
  /** Sizes the picker box. Square by default; a letterhead wants something wider. */
  className?: string;
  wrapperClassName?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A local blob: URL, shown the instant a file is chosen so the box never sits empty while a
  // 8MB photograph crosses hall wifi.
  const [preview, setPreview] = useState<string | null>(null);

  // Blob URLs are held by the document until revoked — without this, an evening of picking images
  // leaks every one of them.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const local = URL.createObjectURL(file);
    setPreview(local);
    setUploading(true);
    try {
      const { url } = await uploadFile(file, kind);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההעלאה נכשלה");
      setPreview(null);
      URL.revokeObjectURL(local);
    } finally {
      setUploading(false);
    }
  };

  const shown = preview ?? value;

  return (
    <div className={wrapperClassName}>
      {label && <span className={fieldLabelClassName}>{label}</span>}

      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          // Cleared so picking the SAME file again still fires a change event.
          e.target.value = "";
        }}
      />

      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={uploading}
            aria-label={shown ? "החלפת התמונה" : "בחירת תמונה"}
            className={`flex items-center justify-center overflow-hidden rounded-md border bg-inset text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-wait ${
              shown ? "border-border" : "border-dashed border-border"
            } ${className}`}
          >
            {shown ? (
              // A blob: URL, or an object already served with immutable cache headers — next/image
              // would add a proxy hop and buy nothing. Same call as components/photo.tsx.
              // eslint-disable-next-line @next/next/no-img-element -- see above
              <img src={shown} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-6 w-6" strokeWidth={1.6} />
            )}
          </button>

          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-canvas/70">
              <Loader2 className="h-5 w-5 animate-spin text-accent" strokeWidth={2} />
            </span>
          )}

          {shown && !uploading && (
            <button
              type="button"
              onClick={() => {
                if (preview) URL.revokeObjectURL(preview);
                setPreview(null);
                setError(null);
                onChange(undefined);
              }}
              aria-label="הסרת התמונה"
              className="absolute -end-1.5 -top-1.5 rounded-full border border-border bg-canvas p-1 text-muted shadow-floating transition-colors hover:bg-alert-tint hover:text-alert"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="min-w-0 text-[13px] leading-relaxed">
          {error ? (
            <p className="text-alert">{error}</p>
          ) : uploading ? (
            <p className="text-ink-soft">מעלה…</p>
          ) : (
            <p className="text-muted">{hint ?? "JPG, PNG, WebP או AVIF — עד 25MB."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
