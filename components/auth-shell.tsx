import Link from "next/link";
import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { controlClassName } from "@/components/control";
import { Wordmark } from "@/components/wordmark";

// The chrome both account screens share: the brand panel on one side, a paper panel holding the
// form on the other. One file, because "כניסה" and "הרשמה" are the same screen with a different
// form in it — and two copies of a split layout drift within a week.
//
// DESIGN.md's mesh rule, honoured here: this is the app's brand moment, so it gets the one
// saturated surface (grained, as every gradient must be) and the one filled CTA. Nothing sits on
// the mesh without the scrim behind it.
export function AuthShell({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <aside className="mesh grain relative flex flex-col justify-between px-6 py-10 sm:px-10 sm:py-14">
        <div className="mesh-scrim" />
        <Link href="/" className="relative z-10">
          <Wordmark tone="on-dark" className="text-[32px] drop-shadow-[0_8px_22px_rgba(50,25,90,0.35)]" />
        </Link>
        <div className="relative z-10 max-w-md">
          <span className="mb-5 inline-flex items-center gap-3 text-sm font-semibold text-gold">
            <span className="inline-block h-px w-10 bg-gold" />
            הסטודיו שלכם
          </span>
          <p className="font-display text-h1 text-canvas text-balance">
            כל אירוע מתחיל כאן — סקיצה אחת, שנעשית לתוכנית שלמה.
          </p>
        </div>
        <p className="relative z-10 text-sm text-canvas/85">עיצוב אירועים, ממקור אמת אחד.</p>
      </aside>

      <section className="flex items-center justify-center bg-bg px-6 py-14">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-h2 text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lede}</p>
          {children}
          <div className="mt-8 border-t border-border pt-5 text-sm text-ink-soft">{footer}</div>
        </div>
      </section>
    </main>
  );
}

/** A labelled input with its error message underneath.
 *
 *  `aria-invalid` and `aria-describedby` are not decoration: without them the red border and the
 *  line of Hebrew below the field are invisible to a screen reader, and the person is told their
 *  sign-in failed with no way to find out which field did it. */
export function Field({
  id,
  label,
  type,
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
  hint,
  autoFocus,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const described = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        // The email and the password are Latin even on a Hebrew page: dir="ltr" so the caret starts
        // where the characters do, and so an address doesn't render with its domain on the wrong end.
        dir={type === "email" || type === "password" ? "ltr" : undefined}
        className={`${controlClassName} px-3 placeholder:text-muted ${
          type === "email" || type === "password" ? "text-start" : ""
        } ${error ? "border-alert" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="inline-flex items-center gap-1.5 text-xs text-alert">
          <CircleAlert className="h-3.5 w-3.5" strokeWidth={2} />
          {error}
        </p>
      )}
    </div>
  );
}

/** The one error that belongs to the whole form rather than to a field — "the email or the password
 *  is wrong" names no single input, because saying which one would say which emails are accounts. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-alert/30 bg-alert/5 px-3 py-2.5 text-sm text-alert"
    >
      <CircleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
      {message}
    </p>
  );
}
