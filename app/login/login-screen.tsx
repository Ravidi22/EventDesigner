"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Button } from "@/components/button";
import { controlClassName } from "@/components/control";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Front-end shell only. ADR-2 defers real auth (signup/billing/sessions) to phase 3, and the
// architecture prescribes a managed provider (Supabase Auth / Clerk) rather than a hand-rolled
// one — so this validates and routes, but establishes no session. The seam is here.
export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "כתובת אימייל לא תקינה";
    if (password.length < 1) next.password = "יש להזין סיסמה";
    setErrors(next);
    if (Object.keys(next).length === 0) router.push("/dashboard");
  };

  return (
    <main className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      {/* Editorial panel — light, quiet, a hairline from the form. */}
      <aside className="flex flex-col justify-between border-e border-border bg-surface px-6 py-10 sm:px-10 sm:py-14">
        <Link href="/" className="font-display text-xl text-ink">
          iDesign
        </Link>
        <div className="max-w-md">
          <span className="mb-5 inline-flex items-center gap-3 text-sm font-medium text-accent">
            <span className="inline-block h-px w-10 bg-accent" />
            הסטודיו שלכם
          </span>
          <p className="font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.15] text-ink text-balance">
            כל אירוע מתחיל כאן — סקיצה אחת, שנעשית לתוכנית שלמה.
          </p>
        </div>
        <p className="text-sm text-muted">עיצוב אירועים, ממקור אמת אחד.</p>
      </aside>

      {/* Form panel — canvas paper. */}
      <section className="flex items-center justify-center bg-bg px-6 py-14">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-ink">כניסה לחשבון</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            הזינו את פרטי החשבון כדי להמשיך לסטודיו.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
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
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              error={errors.password}
            />

            <Button type="submit" className="mt-1 w-full justify-center py-2.5">
              כניסה
              <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
            </Button>
          </form>

          <p className="mt-8 border-t border-border pt-5 text-xs leading-relaxed text-muted">
            זהו מסך כניסה ראשוני. חיבור לחשבון אמיתי (הרשמה, סיסמאות, חיוב) נכנס בשלב ה־SaaS — עד אז
            הכניסה מובילה ישירות לסטודיו.
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
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
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${controlClassName} px-3 placeholder:text-muted ${error ? "border-warn" : ""}`}
      />
      {error && (
        <p id={`${id}-error`} className="inline-flex items-center gap-1.5 text-xs text-warn">
          <CircleAlert className="h-3.5 w-3.5" strokeWidth={2} />
          {error}
        </p>
      )}
    </div>
  );
}
