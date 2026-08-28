// Every window-level keydown handler in the app (the shape canvas, the hall editor, the studio)
// has to stand down while the user is typing, or Backspace/Delete/Ctrl+Z eat geometry instead of
// characters. One predicate for all of them, so the copies can't drift apart.
export function isTypingTarget(): boolean {
  const el = typeof document === "undefined" ? null : document.activeElement;
  return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

// Multi-select modifier for every clickable thing on a plan (walls, corners, zones, features,
// doors, the marquee): Shift, this app's original convention, plus Ctrl/Cmd — the one most people
// already reach for from a file manager or another design tool — so either habit adds to the
// selection instead of replacing it.
export function isAdditiveClick(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.shiftKey || e.ctrlKey || e.metaKey;
}
