"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { signUp } from "@/lib/auth/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Opening a studio, not "creating a user": the account and the business are the same act here. One
// form creates the organisation, its settings row, and its owner — so the designer lands on a
// dashboard that already knows what the business is called, instead of an onboarding wizard.
export function SignupScreen() {
  const router = useRouter();
  const [studioName, setStudioName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const next: Record<string, string> = {};
    if (!studioName.trim()) next.studioName = "יש להזין שם עסק";
    if (!name.trim()) next.name = "יש להזין שם מלא";
    if (!EMAIL_RE.test(email.trim())) next.email = "כתובת אימייל לא תקינה";
    // The same rule the server enforces (passwordProblem), stated here so the answer is immediate.
    // It is repeated, not trusted: this check runs in a browser the person owns.
    if (password.length < 8) next.password = "הסיסמה חייבת להכיל לפחות 8 תווים";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const result = await signUp({ studioName, name, email, password });
      if (result.error) {
        if (result.field) setErrors({ [result.field]: result.error });
        else setFormError(result.error);
        setBusy(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setFormError("לא ניתן לפתוח חשבון כרגע. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="פתיחת סטודיו"
      lede="חשבון אחד לעסק — האירועים, הקטלוג והמתחמים נשמרים תחתיו."
      footer={
        <>
          כבר יש לכם חשבון?{" "}
          <Link href="/login" className="font-medium text-accent transition-colors hover:text-accent-hover">
            כניסה
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field
          id="studioName"
          label="שם העסק"
          type="text"
          autoComplete="organization"
          value={studioName}
          onChange={setStudioName}
          error={errors.studioName}
          placeholder="סטודיו לעיצוב אירועים"
          hint="מופיע על הצעות המחיר ועל הפלטים שהצוות מקבל."
          autoFocus
        />
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
        <Field
          id="password"
          label="סיסמה"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          hint="לפחות 8 תווים. אורך שווה יותר מסימנים מיוחדים."
        />

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          icon={<ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          className="mt-1 w-full"
        >
          {busy ? "פותחים סטודיו…" : "פתיחת הסטודיו"}
        </Button>
      </form>
    </AuthShell>
  );
}
