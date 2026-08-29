// The one gutter a page's content sits in, so a screen and its loading skeleton cannot drift.
//
// They had drifted: the skeleton was `px-8 py-8` while catalog and suppliers were `px-8 pb-7 pt-3`,
// gallery `py-7` and production `pt-6 pb-8` — so the bars sat about 20px below where the real
// content then landed, and every navigation ended with a small upward jolt. Placement is the one
// thing a skeleton exists to get right; four values for it meant it could not.
//
// `pt-6` rather than the old `py-8`: the shell's top bar already carries the page title on its own
// floating card with a `gap-3` below it, so the content plane does not also need 32px of air to
// separate itself from the chrome. `pb-8` keeps the last card clear of the viewport edge.
//
// Full-bleed screens (studio, halls, outputs) do NOT use this — they are a canvas to the edges and
// carry their own padding, if any.
export const PAGE_GUTTER = "px-8 pt-6 pb-8";
