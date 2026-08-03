// Every window-level keydown handler in the app (the shape canvas, the hall editor, the studio)
// has to stand down while the user is typing, or Backspace/Delete/Ctrl+Z eat geometry instead of
// characters. One predicate for all of them, so the copies can't drift apart.
export function isTypingTarget(): boolean {
  const el = typeof document === "undefined" ? null : document.activeElement;
  return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
