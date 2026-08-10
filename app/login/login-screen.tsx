"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { signIn } from "@/lib/auth/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A real sign-in: the action sets an httpOnly session cookie and this screen navigates. The
// front-end shell that used to route straight to /dashboard without establishing anything is gone.
export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Shape only. Whether the account exists is the server's to answer, and it answers with one
    // message for both halves on purpose — see signIn().
    const next: typeof fieldErrors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "כתובת אימייל לא תקינה";
    if (!password) next.password = "יש להזין סיסמה";
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const result = await signIn({ email, password });
      if (result.error) {
        setFormError(result.error);
        setBusy(false);
        return;
      }
      // Where the guard sent them from, if anywhere. Only ever a PATH — the guard writes one and
      // this refuses anything else, so `?next=https://elsewhere` cannot turn a sign-in into a
      // redirect off this site.
      const requested = params.get("next");
      const destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
      // refresh() so the shell re-renders as the signed-in user rather than from the cache it built
      // a moment ago, when nobody was.
      router.replace(destination);
      router.refresh();
    } catch {
      setFormError("לא ניתן להתחבר כרגע. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="כניסה לחשבון"
      lede="הזינו את פרטי החשבון כדי להמשיך לסטודיו."
      footer={
        <>
          עדיין אין לכם חשבון?{" "}
          <Link href="/signup" className="font-medium text-accent transition-colors hover:text-accent-hover">
            פתיחת סטודיו חדש
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field
          id="email"
          label="אימייל"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          placeholder="you@studio.co.il"
          autoFocus
        />
        <Field
          id="password"
          label="סיסמה"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
        />

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          icon={<ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          className="mt-1 w-full"
        >
          {busy ? "מתחברים…" : "כניסה"}
        </Button>
      </form>
    </AuthShell>
  );
}
