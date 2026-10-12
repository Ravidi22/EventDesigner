"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { KIND_ENTRY, type AccountKind } from "@/lib/auth/kinds";

const KINDS: AccountKind[] = ["studio", "client"];

// "כניסה" on the landing page, opened into its two doors: suppliers and designers, or the people
// whose event it is. The answer travels as `?kind=` so the sign-in screen can greet them by it and
// the sign-up form behind it already asks the right questions.
//
// A disclosure of two LINKS, not a menu of actions (components/menu.tsx): each row goes somewhere,
// so each is a real <a> — it can be opened in a new tab, and Tab walks them without a key contract
// to learn. Escape and a click outside close it, as they do everywhere else.
export function EntryMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm font-semibold text-canvas transition-colors hover:text-gold focus-visible:outline-canvas ${
          open ? "bg-white/15" : ""
        }`}
      >
        כניסה
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-30 mt-2 flex w-52 flex-col gap-0.5 rounded-md bg-surface p-1.5 shadow-lifted">
          {KINDS.map((k) => (
            <Link
              key={k}
              href={`/login?kind=${k}`}
              className="rounded-sm px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent-tint hover:text-accent"
            >
              {KIND_ENTRY[k]}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
