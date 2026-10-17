"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { resetPassword } from "@/lib/auth/actions";

export function ResetScreen({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // The same rule the server enforces (passwordProblem), stated here so the answer is immediate.
    if (password.length < 8) return setError("הסיסמה חייבת להכיל לפחות 8 תווים");
    setError(null);
    setBusy(true);
    try {
      const result = await resetPassword({ token, password });
      if (result.error) {
        setError(result.error);
        setBusy(false);
        return;
      }
      // Every session of the account just ended, this browser's included: sign in afresh.
      router.replace(result.home ?? "/login?reset=done");
    } catch {
      setError("לא ניתן לעדכן כרגע. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="בחירת סיסמה חדשה"
      lede="אחרי השמירה כל המכשירים שמחוברים לחשבון יתנתקו."
      footer={
        <Link href="/login" className="font-medium text-accent transition-colors hover:text-accent-hover">
          חזרה לכניסה
        </Link>
      }
    >
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 short:mt-4 short:gap-3" noValidate>
        <FormError message={error} />
        <Field
          id="password"
          label="סיסמה חדשה"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          autoFocus
        />
        <Button
          type="submit"
          size="lg"
          aria-busy={busy}
          icon={<ArrowLeft className={`h-[18px] w-[18px] ${busy ? "arrow-run" : "arrow-nudge"}`} strokeWidth={1.8} />}
          className="group mt-1 w-full"
        >
          {busy ? "שומרים…" : "שמירת הסיסמה"}
        </Button>
      </form>
    </AuthShell>
  );
}
