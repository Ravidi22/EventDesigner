// Shared base for text inputs / selects. Consumers append padding/width as needed.
export const controlClassName =
  "h-10 rounded-sm border border-border bg-canvas text-sm text-ink transition-colors hover:border-accent-line focus-visible:border-accent";

// Shared label style for a field with its input stacked below it (TextField, NumberField, and the
// ad hoc labeled inputs across the app before them).
export const fieldLabelClassName = "mb-1 block text-xs font-medium text-ink-soft";
