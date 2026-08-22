"use client";

import { controlClassName, fieldLabelClassName } from "./control";

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  dir,
  placeholder,
  required,
  error,
  errorMessage,
  id,
  className = "",
  wrapperClassName = "",
  autoFocus,
  autoComplete,
  readOnly,
  multiline = false,
  rows = 3,
  "aria-label": ariaLabel,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** `password` is here for the settings screen's own change-password fields. The sign-in and
   *  sign-up pages use `Field` in components/auth-shell.tsx instead — that one is styled for the
   *  auth pages; this one matches every other field in the app.
   *
   *  No `time`, and no `date` in practice: both OS controls draw their own popup in the browser's
   *  locale and ignore our RTL layout, so they get hand-built siblings instead — components/
   *  date-field.tsx and components/time-field.tsx. `date` survives here only as a plain text-ish
   *  input for anything that needs one without a picker. */
  type?: "text" | "tel" | "email" | "date" | "password";
  dir?: "ltr" | "rtl";
  placeholder?: string;
  required?: boolean;
  error?: boolean;
  errorMessage?: string;
  id?: string;
  className?: string;
  /** Classes for the outer <label> — e.g. a grid col-span the input's own className can't reach. */
  wrapperClassName?: string;
  autoFocus?: boolean;
  /** Let the browser's password manager do its job — without it, a change-password form is three
   *  anonymous boxes it will offer to fill with the wrong thing. */
  autoComplete?: string;
  readOnly?: boolean;
  /** Renders a <textarea> instead of a single-line input. */
  multiline?: boolean;
  rows?: number;
  "aria-label"?: string;
}) {
  const inputClass = `${controlClassName} w-full px-2.5 placeholder:text-faint ${
    error ? "border-alert hover:border-alert" : ""
  } ${multiline ? "h-auto resize-y py-2" : ""} ${className}`;

  return (
    <label className={`block ${wrapperClassName}`}>
      {label && (
        <span className={fieldLabelClassName}>
          {label}
          {required && <span className="text-alert"> *</span>}
        </span>
      )}
      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          required={required}
          readOnly={readOnly}
          aria-label={ariaLabel}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          readOnly={readOnly}
          aria-readonly={readOnly}
          aria-label={ariaLabel}
          className={inputClass}
        />
      )}
      {error && errorMessage && <p className="mt-1 text-xs text-alert">{errorMessage}</p>}
    </label>
  );
}
