"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { Select } from "@/components/select";
import { signUp } from "@/lib/auth/actions";
import { KIND_LABEL, isAccountKind, type AccountKind } from "@/lib/auth/kinds";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const KIND_OPTIONS = (["studio", "client"] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }));

// Two kinds of account start here, and the choice is the FIRST thing on the form rather than a
// checkbox near the button — it changes what the rest of the form asks for, and a question that
// rewrites the fields below it cannot sit underneath them. It usually arrives already answered:
// the landing page's entry menu and the sign-in screen both carry `?kind=`.
//
// For a designer or supplier this opens the business too: one form creates the organisation, its
// settings row and its owner, so they land on a dashboard that already knows what the business is
// called. For a client it is the fewest fields that can identify a person — no business to name.
export function SignupScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("kind");
  const [kind, setKind] = useState<AccountKind>(isAccountKind(asked) ? asked : "studio");
  const [studioName, setStudioName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    const next: Record<string, string> = {};
    if (kind === "studio" && !studioName.trim()) next.studioName = "יש להזין שם עסק";
    if (!name.trim()) next.name = "יש להזין שם מלא";
    if (!EMAIL_RE.test(email.trim())) next.email = "כתובת אימייל לא תקינה";
    // The same rule the server enforces (passwordProblem), stated here so the answer is immediate.
    // It is repeated, not trusted: this check runs in a browser the person owns.
    if (password.length < 8) next.password = "הסיסמה חייבת להכיל לפחות 8 תווים";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const result = await signUp({ kind, studioName, name, email, password, remember });
      if (result.error) {
        if (result.field) setErrors({ [result.field]: result.error });
        else setFormError(result.error);
        setBusy(false);
        return;
      }

      // The server says where this account belongs — the two kinds land in different halves of the
      // app, and guessing here would bounce the person through a guard on arrival.
      router.replace(result.home ?? "/dashboard");
      router.refresh();
    } catch {
      setFormError("לא ניתן לפתוח חשבון כרגע. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      wide
      title="יצירת חשבון חדש!"
      lede="פותחים חשבון ויוצרים את תכנית העיצוב שלכם לאירוע תוך דקות."
      footer={
        <>
          כבר יש לכם חשבון?{" "}
          <Link
            href={`/login?kind=${kind}`}
            className="font-medium text-accent transition-colors hover:text-accent-hover"
          >
            כניסה
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 short:mt-4 short:gap-3" noValidate>
        <FormError message={formError} />

        {/* Two columns, read across. With a studio's two extra fields one column is taller than a
            laptop's window, and this screen does not scroll. A client's four fields make a square;
            a studio's five leave the password the full width. */}
        <div className="grid gap-4 sm:grid-cols-2 short:gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="kind" className="text-sm font-medium text-ink">
              סוג החשבון
            </label>
            <Select
              id="kind"
              value={kind}
              onChange={(v) => isAccountKind(v) && setKind(v)}
              options={KIND_OPTIONS}
              className="w-full"
            />
          </div>

          {kind === "studio" && (
            <Field
              id="studioName"
              label="שם העסק"
              type="text"
              autoComplete="organization"
              value={studioName}
              onChange={setStudioName}
              error={errors.studioName}
              placeholder="סטודיו לעיצוב אירועים"
            />
          )}

          <Field
            id="name"
            label="שם מלא"
            type="text"
            autoComplete="name"
            value={name}
            onChange={setName}
            error={errors.name}
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
          <div className={kind === "studio" ? "sm:col-span-2" : ""}>
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
          </div>
        </div>

        <label className="flex items-center gap-2.5 self-start text-sm text-ink">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          זכור אותי
        </label>

        <Button
          type="submit"
          size="lg"
          aria-busy={busy}
          icon={<ArrowLeft className={`h-[18px] w-[18px] ${busy ? "arrow-run" : "arrow-nudge"}`} strokeWidth={1.8} />}
          className="group mt-1 w-full"
        >
          {busy ? "פותחים חשבון…" : "פתיחת חשבון"}
        </Button>
      </form>
    </AuthShell>
  );
}
