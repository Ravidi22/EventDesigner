// Shared base for text inputs / selects. Consumers append padding/width as needed.
export const controlClassName =
  "h-10 rounded-sm border border-border bg-canvas text-sm text-ink transition-colors hover:border-accent-line focus-visible:border-accent";

// Shared label style for a field with its input stacked below it (TextField, NumberField, and the
// ad hoc labeled inputs across the app before them).
export const fieldLabelClassName = "mb-1 block text-xs font-medium text-ink-soft";

// The same label, beside its input instead of above it (a toolbar or inspector row). Identical
// size, weight and ink — only the margin differs, since the gap comes from the flex row. Every
// label in the component library goes through one of these two: they used to disagree about the
// weight (`font-medium` or not) and the colour (`text-ink-soft` or `text-muted`), so two controls
// standing side by side looked like two different systems.
export const inlineLabelClassName = "text-xs font-medium text-ink-soft";
