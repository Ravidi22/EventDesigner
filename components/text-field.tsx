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
  readOnly,
  multiline = false,
  rows = 3,
  "aria-label": ariaLabel,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "tel" | "email" | "date";
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
  readOnly?: boolean;
  /** Renders a <textarea> instead of a single-line input. */
  multiline?: boolean;
  rows?: number;
  "aria-label"?: string;
}) {
  const inputClass = `${controlClassName} w-full px-2.5 placeholder:text-muted ${
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
