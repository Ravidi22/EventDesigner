"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { signUp } from "@/lib/auth/actions";
import { KIND_HINT, KIND_LABEL, type AccountKind } from "@/lib/auth/kinds";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Two kinds of account start here, and the choice is the FIRST thing on the form rather than a
// checkbox near the button — it changes what the rest of the form asks for, and a question that
// rewrites the fields below it cannot sit underneath them.
//
// For a designer this is opening a studio, not "creating a user": one form creates the
// organisation, its settings row and its owner, so they land on a dashboard that already knows what
// the business is called instead of an onboarding wizard. For a client it is the opposite — the
// fewest fields that can identify a person, because they are not setting anything up. They were
// invited to look at their own event.
export function SignupScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<AccountKind>("studio");
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
      const result = await signUp({ kind, studioName, name, email, password });
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
      title={kind === "studio" ? "פתיחת סטודיו" : "פתיחת חשבון"}
      lede={
        kind === "studio"
          ? "חשבון אחד לעסק — האירועים, הקטלוג והמתחמים נשמרים תחתיו."
          : "חשבון לצפייה באירוע שלכם — הסקיצה והתוכנית שהמעצב הכין."
      }
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

        <KindChooser value={kind} onChange={setKind} />

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
            hint="מופיע על הצעות המחיר ועל הפלטים שהצוות מקבל."
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
          {busy
            ? kind === "studio"
              ? "פותחים סטודיו…"
              : "פותחים חשבון…"
            : kind === "studio"
              ? "פתיחת הסטודיו"
              : "פתיחת החשבון"}
        </Button>
      </form>
    </AuthShell>
  );
}

/** The one question that changes the rest of the form.
 *
 *  A radiogroup of two cards rather than a <select> or a pair of pills: the difference between the
 *  two is a sentence, not a word, and someone arriving from an invitation link needs to recognise
 *  which one is them without guessing. Cards have room for that sentence.
 *
 *  Keyboard and screen-reader semantics come from role="radio" on the buttons inside a
 *  role="radiogroup" — the arrow keys then move within the group and Tab leaves it, which is what a
 *  choice of two behaves like. A pair of unrelated buttons would announce as two controls where
 *  either, both or neither could be pressed.
 */
function KindChooser({ value, onChange }: { value: AccountKind; onChange: (k: AccountKind) => void }) {
  const kinds: AccountKind[] = ["studio", "client"];
  return (
    <div className="flex flex-col gap-1.5">
      <span id="kind-label" className="text-sm font-medium text-ink">
        מי אתם?
      </span>
      <div role="radiogroup" aria-labelledby="kind-label" className="flex flex-col gap-2">
        {kinds.map((k) => {
          const selected = value === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(k)}
              className={
                "rounded-md border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                (selected
                  ? "border-accent bg-accent-tint"
                  : "border-border bg-canvas hover:border-accent-line")
              }
            >
              <span
                className={
                  "block text-sm leading-tight " +
                  (selected ? "font-bold text-accent" : "font-semibold text-ink")
                }
              >
                {KIND_LABEL[k]}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{KIND_HINT[k]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
