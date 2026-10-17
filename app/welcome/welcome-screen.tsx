"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { completeOnboarding } from "@/lib/auth/actions";

// Two questions, one required. Everything else a quote's letterhead needs (registration number,
// address, logo) lives in settings → פרטי העסק and is asked for when it is first needed, not here.
export function WelcomeScreen({ name }: { name: string }) {
  const router = useRouter();
  const [studioName, setStudioName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (!studioName.trim()) return setErrors({ studioName: "יש להזין שם עסק" });
    setErrors({});
    setBusy(true);
    try {
      const result = await completeOnboarding({ studioName, phone });
      if (result.error) {
        if (result.field) setErrors({ [result.field]: result.error });
        else setFormError(result.error);
        setBusy(false);
        return;
      }
      router.replace(result.home ?? "/dashboard");
      router.refresh();
    } catch {
      setFormError("לא ניתן לשמור כרגע. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={name ? `ברוכים הבאים, ${name.split(" ")[0]}` : "ברוכים הבאים"}
      lede="עוד רגע בסטודיו. איך קוראים לעסק?"
      footer={<span className="text-xs text-muted">את שאר פרטי העסק (ח.פ., כתובת, לוגו) אפשר להשלים בהגדרות.</span>}
    >
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 short:mt-4 short:gap-3" noValidate>
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
          autoFocus
        />
        <Field
          id="phone"
          label="טלפון (לא חובה)"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={setPhone}
          error={errors.phone}
        />
        <Button
          type="submit"
          size="lg"
          aria-busy={busy}
          icon={<ArrowLeft className={`h-[18px] w-[18px] ${busy ? "arrow-run" : "arrow-nudge"}`} strokeWidth={1.8} />}
          className="group mt-1 w-full"
        >
          {busy ? "פותחים את הסטודיו…" : "כניסה לסטודיו"}
        </Button>
      </form>
    </AuthShell>
  );
}
