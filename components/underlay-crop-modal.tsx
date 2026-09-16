"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

// Crop a photo/scan before it ever reaches lib/files/ — free-form (no fixed ratio), so a designer
// can trim a phone photo's margins or a scanned sheet's borders however the shot actually needs it.
// Runs entirely on the local file: nothing is uploaded until "לסיום" hands back the cropped bytes,
// so a cancelled crop never touched storage at all.
//
// The rect lives in DISPLAY pixels (the fitted, on-screen size); confirm() divides by `scale` to
// read the crop back in the image's own natural pixels before drawing it to the export canvas.

type Rect = { x: number; y: number; w: number; h: number };
type HandleId = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN_PX = 24; // smallest a crop rect may shrink to, in display px — below this it's not a crop, it's a slip

const HANDLES: { id: HandleId; cls: string }[] = [
  { id: "nw", cls: "-top-1.5 -start-1.5 cursor-nwse-resize" },
  { id: "n", cls: "-top-1.5 start-1/2 -translate-x-1/2 cursor-ns-resize" },
  { id: "ne", cls: "-top-1.5 -end-1.5 cursor-nesw-resize" },
  { id: "e", cls: "top-1/2 -end-1.5 -translate-y-1/2 cursor-ew-resize" },
  { id: "se", cls: "-bottom-1.5 -end-1.5 cursor-nwse-resize" },
  { id: "s", cls: "-bottom-1.5 start-1/2 -translate-x-1/2 cursor-ns-resize" },
  { id: "sw", cls: "-bottom-1.5 -start-1.5 cursor-nesw-resize" },
  { id: "w", cls: "top-1/2 -start-1.5 -translate-y-1/2 cursor-ew-resize" },
];

export function UnderlayCropModal({
  file,
  onConfirm,
  onCancel,
}: {
  /** The freshly-picked file, or null when the modal should be closed. */
  file: File | null;
  onConfirm: (cropped: File) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number; scale: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ id: HandleId; startX: number; startY: number; start: Rect } | null>(null);

  // A fresh object URL per file, revoked the moment it stops being the one on screen — otherwise
  // every crop attempt (including a cancelled one, re-opened on the same file) leaks a blob.
  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      setDisplay(null);
      setRect(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (file && !d.open) d.showModal();
    if (!file && d.open) d.close();
  }, [file]);

  const onImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const maxW = Math.min(window.innerWidth * 0.8, 900);
    const maxH = Math.min(window.innerHeight * 0.7, 600);
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    setDisplay({ w, h, scale });
    // A centred 90% inset — never starts full-bleed, so there's visibly something TO crop away.
    setRect({ x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.9 });
  };

  const onHandleDown = (id: HandleId) => (e: React.PointerEvent) => {
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id, startX: e.clientX, startY: e.clientY, start: rect };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || !display) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const { x: sx, y: sy, w: sw, h: sh } = g.start;
    let next: Rect = g.start;

    if (g.id === "move") {
      next = {
        ...g.start,
        x: Math.min(Math.max(sx + dx, 0), display.w - sw),
        y: Math.min(Math.max(sy + dy, 0), display.h - sh),
      };
    } else {
      let { x, y, w, h } = g.start;
      if (g.id.includes("e")) w = Math.min(Math.max(sw + dx, MIN_PX), display.w - sx);
      if (g.id.includes("s")) h = Math.min(Math.max(sh + dy, MIN_PX), display.h - sy);
      if (g.id.includes("w")) {
        const newX = Math.min(Math.max(sx + dx, 0), sx + sw - MIN_PX);
        w = sx + sw - newX;
        x = newX;
      }
      if (g.id.includes("n")) {
        const newY = Math.min(Math.max(sy + dy, 0), sy + sh - MIN_PX);
        h = sy + sh - newY;
        y = newY;
      }
      next = { x, y, w, h };
    }
    setRect(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !display || !rect || !file) return;
    const sx = rect.x / display.scale;
    const sy = rect.y / display.scale;
    const sw = rect.w / display.scale;
    const sh = rect.h / display.scale;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], file.name, { type: "image/png" }));
    }, "image/png");
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onCancel={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" && display && rect) {
          e.preventDefault();
          confirm();
        }
      }}
      className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog"
    >
      <div className="flex max-w-[95vw] flex-col">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-ink">חיתוך התוכנית</span>
          <span className="hidden text-xs text-muted md:inline">
            גררו את הפינות או הצלעות לחיתוך חופשי · גררו בתוך המסגרת להזזה · Enter לסיום
          </span>
        </header>

        <div className="flex items-center justify-center bg-canvas p-5">
          {objectUrl && (
            <div
              className="relative touch-none select-none"
              style={display ? { width: display.w, height: display.h } : undefined}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not a stored asset */}
              <img
                ref={imgRef}
                src={objectUrl}
                onLoad={onImageLoad}
                alt=""
                className="pointer-events-none block max-w-none"
                style={display ? { width: display.w, height: display.h } : { visibility: "hidden" }}
              />
              {rect && display && (
                <div
                  role="presentation"
                  onPointerDown={onHandleDown("move")}
                  className="absolute cursor-move border-2 border-accent"
                  style={{
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    boxShadow: "0 0 0 9999px rgba(40,26,74,.55)",
                  }}
                >
                  {HANDLES.map((h) => (
                    <div
                      key={h.id}
                      onPointerDown={onHandleDown(h.id)}
                      className={`absolute h-3.5 w-3.5 rounded-full border-2 border-accent bg-canvas ${h.cls}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            ביטול
          </Button>
          <Button size="sm" variant="primary" className="ms-auto" disabled={!rect} onClick={confirm}>
            לסיום
          </Button>
        </div>
      </div>
    </dialog>
  );
}
