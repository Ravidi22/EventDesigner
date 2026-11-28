"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { signUp } from "@/lib/auth/actions";
import { TERMS_REQUIRED } from "@/lib/legal/acceptance";
import { legalPublished } from "@/lib/legal/status";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Opening a studio account: a person, three fields. The business itself (its name, its phone, the
// organisation and its base catalog) is set up on /welcome right after — so this form stays the
// shortest thing between the landing page and the product, and abandoning it halfway creates nothing.
//
// Event owners do not sign up here. They come in through their designer's invitation, which is what
// attaches them to their event (see signUp in lib/auth/actions.ts).
export function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  // The terms line (EVE-9): shown, and required, only once the legal texts are published
  // (lib/legal/status.ts). The server asks the same rule and refuses a missing tick on its own.
  const askTerms = legalPublished();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The address a verification mail went to — set when mail is configured and the account must be
  // confirmed before there is a session (lib/auth/auth.ts, requireEmailVerification).
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "יש להזין שם מלא";
    if (!EMAIL_RE.test(email.trim())) next.email = "כתובת אימייל לא תקינה";
    // The same rule the server enforces (passwordProblem), stated here so the answer is immediate.
    // It is repeated, not trusted: this check runs in a browser the person owns.
    if (password.length < 8) next.password = "הסיסמה חייבת להכיל לפחות 8 תווים";
    if (askTerms && !acceptTerms) next.terms = TERMS_REQUIRED;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const result = await signUp({ name, email, password, remember, acceptTerms });
      if (result.error) {
        if (result.field) setErrors({ [result.field]: result.error });
        else setFormError(result.error);
        setBusy(false);
        return;
      }
      if (result.verifyEmail) {
        setSentTo(email.trim().toLowerCase());
        setBusy(false);
        return;
      }
      router.replace(result.home ?? "/welcome");
      router.refresh();
    } catch {
      setFormError("לא ניתן לפתוח חשבון כרגע. נסו שוב.");
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell
        title="בדקו את תיבת המייל"
        lede="שלחנו קישור לאישור הכתובת. החשבון ייפתח אחרי הלחיצה עליו."
        footer={
          <Link href="/login" className="font-medium text-accent transition-colors hover:text-accent-hover">
            חזרה לכניסה
          </Link>
        }
      >
        <p className="mt-6 text-center text-sm leading-relaxed text-ink-soft">
          הקישור נשלח אל <span dir="ltr" className="font-semibold text-ink">{sentTo}</span> ותקף 24 שעות. לא הגיע? בדקו
          בתיקיית הספאם, או נסו להתחבר שוב ונשלח קישור חדש.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="פתיחת חשבון סטודיו"
      lede="שלושה פרטים, ובשלב הבא מספרים לנו על העסק."
      footer={
        <>
          כבר יש לכם חשבון?{" "}
          <Link href="/login" className="font-medium text-accent transition-colors hover:text-accent-hover">
            כניסה
          </Link>
          <span className="mt-1 block text-xs text-muted">בעלי אירוע נכנסים דרך ההזמנה שהמעצב שלהם שולח.</span>
        </>
      }
    >
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 short:mt-4 short:gap-3" noValidate>
        <FormError message={formError} />
        <Field
          id="name"
          label="שם מלא"
          type="text"
          autoComplete="name"
          value={name}
          onChange={setName}
          error={errors.name}
          autoFocus
        />
        <Field
          id="email"
          label="אימייל"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          placeholder="you@studio.co.il"
        />
        <Field
          id="password"
          label="סיסמה"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          hint="לפחות 8 תווים."
        />

        <label className="flex items-center gap-2.5 self-start text-sm text-ink">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          זכור אותי
        </label>

        {askTerms && (
          <TermsLine
            checked={acceptTerms}
            onChange={(v) => {
              setAcceptTerms(v);
              if (v) setErrors(({ terms: _, ...rest }) => rest);
            }}
            error={errors.terms}
          />
        )}

        <Button
          type="submit"
          size="lg"
          aria-busy={busy}
          icon={<ArrowLeft className={`h-[18px] w-[18px] ${busy ? "arrow-run" : "arrow-nudge"}`} strokeWidth={1.8} />}
          className="group mt-1 w-full"
        >
          {busy ? "פותחים…" : "פתיחת חשבון"}
        </Button>
      </form>
    </AuthShell>
  );
}

/**
 * "I agree" (Claude Design board ב1/ב2, approved 2026-11-27). First person past tense — the same word
 * for every reader, so no slash forms. Unticked by default; the button is never disabled, the error
 * says why. Both links open in a new tab so what was typed here survives reading them.
 */
function TermsLine({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  const link = "font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:text-accent-hover";
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "terms-error" : undefined}
          className={`mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)] ${error ? "rounded-[3px] outline-2 outline-offset-2 outline-alert" : ""}`}
        />
        <span>
          קראתי והסכמתי ל
          <Link href="/terms" target="_blank" className={link}>
            תנאי השימוש
          </Link>{" "}
          ול
          <Link href="/privacy" target="_blank" className={link}>
            מדיניות הפרטיות
          </Link>
        </span>
      </label>
      {error && (
        <p id="terms-error" className="inline-flex items-start gap-1.5 ps-[26px] text-caption text-alert-ink">
          <CircleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {error}
        </p>
      )}
    </div>
  );
}
