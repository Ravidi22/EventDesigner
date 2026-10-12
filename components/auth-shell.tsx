"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { controlClassName } from "@/components/control";
import { Wordmark } from "@/components/wordmark";

// The chrome the account screens share: the mesh across the whole viewport, and ONE card in the
// middle of it holding the form. One file, because "כניסה" and "הרשמה" are the same screen with a
// different form in it — and two copies of a layout drift within a week.
//
// It was a split screen first — a brand panel beside a paper panel. Two halves gave the eye two
// places to go on a screen with one job, so the brand became the ground the form stands on.
//
// The ground is the SOFT mesh (.mesh-soft, globals.css): the brand's own blooms at a tenth of their
// strength, so the one saturated thing on the screen is the CTA and the card reads as the subject.
// The full mesh stood here first and out-shouted the form it was behind. Grained, as every gradient
// must be; no scrim, because nothing light is written on it — the ink here is the dark one.
//
// On its own that ground was too pale to be a place, so a WAVE crosses it behind the card: the
// lower part of the screen is a deeper lavender, and the wave's crest throws a soft shadow up onto
// the pale part — two tones and one edge, which is all the depth a sign-in screen needs. (A warm
// amber-and-rose wave with a gold wordmark was tried against it and lost: keep it lavender.)
export function AuthShell({
  title,
  lede,
  children,
  footer,
  wide = false,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  footer: ReactNode;
  /** A form with fields side by side (sign-up), which needs the card a step wider to do it. */
  wide?: boolean;
}) {
  return (
    // The screen is exactly one viewport and the PAGE never scrolls, at any size. Low (`short:`),
    // the card gives up its air, its lede and the line under it. Only when a form still cannot fit —
    // sign-up in a very low window — does the card's own area scroll, which is the one scrollbar
    // this screen can have.
    <main className="mesh-soft grain relative flex h-dvh flex-col overflow-hidden">
      <Wave />
      {/* In the corner and OUT of the flow from `md` up, so the card has the whole height to centre
          in; narrower, where the card would run under it, it takes its own row. */}
      <Link href="/" className="relative z-10 self-start px-6 py-5 sm:px-10 md:absolute md:start-0 md:top-0 short:py-3">
        <Wordmark tone="gradient" className="text-[32px]" />
      </Link>

      <section className="relative z-10 flex min-h-0 flex-1 overflow-y-auto px-4 md:py-4 short:md:py-2">
        <div
          className={`m-auto w-full rounded-lg bg-surface p-8 shadow-dialog sm:p-10 short:px-8 short:py-5 ${wide ? "max-w-[640px]" : "max-w-[560px]"}`}
        >
          <h1 className="text-center font-display text-h2 text-ink">{title}</h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-ink-soft short:hidden">{lede}</p>
          {children}
          <div className="mt-6 border-t border-border pt-4 text-sm text-ink-soft short:mt-4 short:pt-3">{footer}</div>
        </div>
      </section>

      {/* The brand's one sentence, under the card rather than beside it. */}
      <p className="relative z-10 hidden px-6 py-5 text-center text-sm font-medium text-ink sm:block short:hidden">
        כל אירוע מתחיל כאן. סקיצה אחת, שהופכת לתכנית עיצוב שלמה.
      </p>
    </main>
  );
}

/** The wave behind the card: two layers, the nearer one deeper, its crest shadowed onto the ground
 *  above it. Stretched to the viewport (preserveAspectRatio="none") — it is a horizon, not a
 *  picture, and has no proportions to keep. Decoration: hidden from assistive tech and from print
 *  with the rest of the mesh. */
function Wave() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 400"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[56%] w-full overflow-visible print:hidden"
    >
      <defs>
        <linearGradient id="wave-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9bdec" />
          <stop offset="1" stopColor="#ad9ce4" />
        </linearGradient>
        <filter id="wave-shadow" x="-5%" y="-40%" width="110%" height="180%">
          <feDropShadow dx="0" dy="-10" stdDeviation="14" floodColor="#46288a" floodOpacity="0.22" />
        </filter>
      </defs>
      <path d="M0,150 C200,60 420,40 700,96 C980,152 1210,120 1440,36 L1440,400 L0,400 Z" fill="#e0d8f6" />
      <path
        d="M0,96 C260,186 470,196 760,140 C1050,84 1250,110 1440,170 L1440,400 L0,400 Z"
        fill="url(#wave-fill)"
        filter="url(#wave-shadow)"
      />
    </svg>
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
  // Every password field can be read back. `type` stays the caller's — "this is a password" — and
  // only what the input is told changes, so the dir and the alignment below do not flip with it.
  const isPassword = type === "password";
  const [shown, setShown] = useState(false);
  const latin = type === "email" || isPassword;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {/* dir="ltr" on the wrapper too, so the eye sits at the END of what is typed (the right)
          rather than over its first characters. */}
      <div className="relative" dir={latin ? "ltr" : undefined}>
        <input
          id={id}
          // Named, so the field is in the body when the form posts itself (signInFromForm).
          name={id}
          type={isPassword && shown ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          // The email and the password are Latin even on a Hebrew page: dir="ltr" so the caret starts
          // where the characters do, and so an address doesn't render with its domain on the wrong end.
          dir={latin ? "ltr" : undefined}
          className={`${controlClassName} w-full px-3 placeholder:text-muted ${latin ? "text-start" : ""} ${
            isPassword ? "pe-11" : ""
          } ${error ? "border-alert" : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
            aria-pressed={shown}
            title={shown ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
            className={`absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-sm transition-colors hover:bg-accent-tint hover:text-accent ${
              shown ? "bg-accent-tint text-accent" : "text-muted"
            }`}
          >
            {shown ? <EyeOff className="h-4 w-4" strokeWidth={1.6} /> : <Eye className="h-4 w-4" strokeWidth={1.6} />}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted short:hidden">
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
