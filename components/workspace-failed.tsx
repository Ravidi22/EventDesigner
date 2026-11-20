"use client";

import { RotateCw } from "lucide-react";
import { Button } from "./button";

/** An event surface whose one read failed (lib/events/use-workspace.tsx `failed`): said, with a
 *  retry. Never the device's scratch drawing in its place — that one is only for a studio that
 *  has no event at all, which a failed read cannot tell (QA 2026-11-20, SK-2). */
export function WorkspaceFailed({ onRetry, body = "לא ניתן לטעון את האירוע. שום דבר לא צויר ושום דבר לא נשמר." }: { onRetry: () => void; body?: string }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-10 py-20 text-center">
      <p className="max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="h-4 w-4" strokeWidth={2} />
        נסו שוב
      </Button>
    </div>
  );
}
