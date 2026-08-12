"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { acceptInvite } from "@/lib/auth/actions";

// Accepting an invitation. Deliberately the SHORTEST form in the app: the studio already decided
// who this person is and what they may do, so the only thing missing is a password.
//
// The address is shown and not editable — the invitation was addressed to it, and a field here
// would let whoever holds the link join under any address they like. It is rendered as text rather
// than a disabled input for the same reason the account screen does it: a greyed-out box invites
// people to try to type in it.
export function JoinScreen({
  token,
  email,
  name: invitedName,
  studioName,
}: {
  token: string;
  email: string;
  name: string;
  studioName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(invitedName);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "יש להזין שם מלא";
    // The same rule the server enforces (passwordProblem), stated here so the answer is immediate.
    // Repeated, not trusted: this check runs in a browser the person owns.
    if (password.length < 8) next.password = "הסיסמה חייבת להכיל לפחות 8 תווים";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const result = await acceptInvite({ token, name, password });
    if (result.error) {
      if (result.field) setErrors({ [result.field]: result.error });
      else setFormError(result.error);
      setBusy(false);
      return;
    }
    // Accepting signs them in — they arrived holding a credential and used it, so a login form
    // immediately afterwards would be asking for the password they just chose.
    router.replace(result.home ?? "/dashboard");
    router.refresh();
  };

  return (
    <AuthShell
      title={`הצטרפות ל${studioName}`}
      lede="הוזמנתם לסטודיו. נשאר רק לבחור סיסמה — התפקיד וההרשאות כבר נקבעו."
      footer={
        <Link href="/login" className="font-semibold text-accent hover:underline">
          כבר הצטרפתם? כניסה
        </Link>
      }
    >
      <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">האימייל שהוזמן</span>
          <p
            dir="ltr"
            className="rounded-md border border-inset-border bg-inset px-3 py-2.5 text-start text-sm text-ink-soft"
          >
            {email}
          </p>
        </div>

        <Field id="name" label="שם מלא" type="text" value={name} onChange={setName} error={errors.name} autoComplete="name" autoFocus />
        <Field
          id="password"
          label="סיסמה"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="new-password"
          hint="לפחות 8 תווים"
        />

        <FormError message={formError} />

        <Button type="submit" disabled={busy} className="mt-1 w-full justify-center">
          {busy ? "רגע…" : "הצטרפות לסטודיו"}
        </Button>
      </form>
    </AuthShell>
  );
}
