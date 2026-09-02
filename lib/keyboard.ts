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

// Which LETTER a Ctrl/⌘ shortcut was pressed on, on a keyboard that is very probably typing Hebrew.
//
// `e.key` is the character produced, so on a Hebrew layout Ctrl+C arrives as "ב" and Ctrl+V as "ה" —
// every letter shortcut in the app silently stops working the moment the designer switches layout
// to type a client's name, which is most of the time. `e.code` is the PHYSICAL key and is immune to
// that: an Israeli keyboard is a QWERTY board with Hebrew legends, so the C key reports "KeyC"
// whatever it prints.
//
// `e.key` is still accepted as a fallback, for a board whose physical arrangement genuinely differs
// (AZERTY, Dvorak) and whose user expects the shortcut where their letter is, not where QWERTY's is.
export function isShortcut(e: { code?: string; key: string }, letter: string): boolean {
  return e.code === `Key${letter.toUpperCase()}` || e.key.toLowerCase() === letter;
}

// Whether the user has actual TEXT selected on the page. A canvas shortcut that means "copy what is
// selected on the plan" must stand down when the answer to "what is selected" is a paragraph the
// designer highlighted — Ctrl+C there means the words, and the browser is already about to do the
// right thing with them.
export function hasTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const s = window.getSelection();
  return !!s && !s.isCollapsed && s.toString().trim().length > 0;
}
