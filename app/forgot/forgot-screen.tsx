"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { requestPasswordReset } from "@/lib/auth/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "שכחתי סיסמה": one field, and the SAME answer whether or not the address has an account — the
// mail is the only place the difference shows. Saying "no such account" here would turn this screen
// into a way to test which addresses are customers of the studio.
export function ForgotScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL_RE.test(email.trim())) return setError("כתובת אימייל לא תקינה");
    setError(null);
    setBusy(true);
    try {
      const result = await requestPasswordReset({ email });
      if ("error" in result) setError(result.error);
      else setSent(true);
    } catch {
      setError("לא ניתן לשלוח כרגע. נסו שוב.");
    }
    setBusy(false);
  };

  return (
    <AuthShell
      title={sent ? "בדקו את תיבת המייל" : "שכחתי סיסמה"}
      lede={
        sent
          ? "אם קיים חשבון עם הכתובת הזו, שלחנו אליה קישור לבחירת סיסמה חדשה. הקישור תקף שעה."
          : "הזינו את כתובת האימייל של החשבון, ונשלח אליה קישור לבחירת סיסמה חדשה."
      }
      footer={
        <Link href="/login" className="font-medium text-accent transition-colors hover:text-accent-hover">
          חזרה לכניסה
        </Link>
      }
    >
      {!sent && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4 short:mt-4 short:gap-3" noValidate>
          <FormError message={error} />
          <Field
            id="email"
            label="אימייל"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@studio.co.il"
            autoFocus
          />
          <Button
            type="submit"
            size="lg"
            aria-busy={busy}
            icon={<ArrowLeft className={`h-[18px] w-[18px] ${busy ? "arrow-run" : "arrow-nudge"}`} strokeWidth={1.8} />}
            className="group mt-1 w-full"
          >
            {busy ? "שולחים…" : "שליחת קישור"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
